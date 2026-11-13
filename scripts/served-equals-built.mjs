#!/usr/bin/env node
// Served == built: every file the site upload publishes, fetched from PROD, has the bytes of site/.
//
//   node scripts/served-equals-built.mjs [--site <dir>] [--manifest <site.json>] [--base <url>]
//       (defaults: this repo's site/, .descix/manifests/site.json, https://egpt-frqtl.descix.net/prod/egpt-frqtl/site/)
//
// The publish set is every file under <site> the manifest's one source (`site`) includes: an `include` entry is a
// file name or `<dir>/**`; any other pattern form is refused (this script would not know what the upload takes). A
// file under <site> the manifest leaves out is refused: the upload would silently skip it. Each file is fetched
// at <base><path> (path segments URI-encoded, cache-busting off: the bytes the edge serves) and compared by sha256.
// Exit 0 printing the count only when every file matches.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_ID, APP_ORIGIN } from './lib/scenes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (n, d) => { const i = process.argv.indexOf(n); return i === -1 ? d : process.argv[i + 1]; };
const SITE = resolve(arg('--site', join(ROOT, 'site')));
const MANIFEST = resolve(arg('--manifest', join(ROOT, '.descix', 'manifests', 'site.json')));
const BASE = arg('--base', APP_ORIGIN + '/prod/' + APP_ID + '/site/');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const die = (m) => { console.log('FAIL  served==built: ' + m); process.exit(1); };

const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
if (!Array.isArray(m.sources) || m.sources.length !== 1 || m.sources[0].path !== 'site') die(MANIFEST + ' does not have exactly one source, `site`');
const include = m.sources[0].include || [];
if (!include.length) die(MANIFEST + ' has an empty include (it would match everything); the site manifest is an allowlist');
const matchers = include.map((p) => {
  if (/^[^*?[\]]+\/\*\*$/.test(p)) { const dir = p.slice(0, -3); return (f) => f.startsWith(dir + '/'); }
  if (/^[^*?[\]/]+$/.test(p)) return (f) => f === p;
  die('include pattern ' + JSON.stringify(p) + ' is neither a file name nor <dir>/** — extend this script before trusting it');
});
const excluded = new Set(m.sources[0].exclude || []);

const files = [];
(function walk(rel) {
  for (const d of readdirSync(join(SITE, rel), { withFileTypes: true })) {
    const r = rel ? rel + '/' + d.name : d.name;
    if (excluded.has(d.name)) continue;
    if (d.isDirectory()) walk(r); else files.push(r);
  }
})('');
const left = files.filter((f) => !matchers.some((t) => t(f)));
if (left.length) die(left.length + ' file(s) under ' + SITE + ' that ' + MANIFEST + ' does not include (the upload would skip them): ' + left.slice(0, 10).join(', '));

const faults = [];
let next = 0;
async function worker() {
  while (next < files.length) {
    const f = files[next++];
    const url = BASE + f.split('/').map(encodeURIComponent).join('/');
    try {
      const r = await fetch(url);
      const got = Buffer.from(await r.arrayBuffer());
      if (r.status !== 200) faults.push(f + ': ' + r.status);
      else if (sha256(got) !== sha256(readFileSync(join(SITE, f)))) faults.push(f + ': served sha256 ' + sha256(got) + ' ≠ built ' + sha256(readFileSync(join(SITE, f))));
    } catch (e) { faults.push(f + ': ' + e.message); }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));
if (faults.length) {
  console.log('FAIL  served==built: ' + faults.length + ' of ' + files.length + ' files differ at ' + BASE);
  for (const x of faults.slice(0, 30)) console.log('  ' + x);
  process.exit(1);
}
console.log('PASS  served==built: ' + files.length + ' files at ' + BASE + ' equal ' + SITE + ' by sha256');
