#!/usr/bin/env node
// Gate: the graph this site SERVES is the pinned releases, byte for byte. The rule is the pinned
// @descix/frqtl-web ./site-graph export's siteGraphFaults (the same function FRAQTL's assembler gate calls), over:
//   graph     sha256 of EVERY regular file under <site>/<SITE_GRAPH_DIR>/<build>/, keyed graph-relative (the root
//             dist-manifest.json included; a symlink or any other non-file is refused);
//   entries   the SITE_GRAPH_DIR-relative paths of every file under <site>/<SITE_GRAPH_DIR>/ outside <build>/;
//   app       sha256 of every file at the site root outside <SITE_GRAPH_DIR>/ (STUDIO's files must be the release's,
//             app.html excepted: the assembly writes the site's facts into it);
//   releases  one row per SITE_PLACEMENTS row, read from the ONE installed record <row.package>/dist-manifest.json
//             (lib/served-roster.mjs::placedReleases).
// <build> is siteBuildStampOf(<site>/<STATIC_APP_PAGE>) (lib/served-roster.mjs::siteBuildOf). Each placed record must
// be the version package.json pins exactly in devDependencies[<row.package>] (else npm ci, or the pin is not what
// the site places). No other build's graph directory may sit beside <build>/ (lib/served-roster.mjs::otherBuildDirs).
// Exit 0 printing the file count per placement only when there is no fault; exit 1 printing the faults.
//
//   node scripts/test/served-release.mjs [--site <dir>] [--package <package.json>]
//       (defaults: this repo's site/ and package.json)
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { otherBuildDirs, placedReleases, siteBuildOf, siteGraph } from './lib/served-roster.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteArg = process.argv.indexOf('--site');
const SITE = resolve(siteArg === -1 ? join(ROOT, 'site') : process.argv[siteArg + 1]);
const pkgArg = process.argv.indexOf('--package');
const PACKAGE_JSON = resolve(pkgArg === -1 ? join(ROOT, 'package.json') : process.argv[pkgArg + 1]);
const SHOWN = 20;

function die(msg) { console.log('FAIL  served-release: ' + msg); process.exit(1); }

let G, build, releases;
try { G = await siteGraph(); ({ build } = await siteBuildOf(SITE)); releases = await placedReleases(); }
catch (e) { die(e.message); }
const { SITE_GRAPH_DIR, siteGraphFaults } = G;

// The pins are this repo's fact about what it serves; every placed record must be exactly the pinned release.
let pkg;
try { pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')); }
catch (e) { die(PACKAGE_JSON + ' is unreadable (' + (e.code || e.message) + ') — the pins of the releases site/ serves live there'); }
for (const r of releases) {
  const pin = (pkg.devDependencies || {})[r.package];
  if (typeof pin !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(pin)) {
    die(PACKAGE_JSON + ' devDependencies["' + r.package + '"] is ' + JSON.stringify(pin) + ', not an exact version — pin each placed release exactly (no range), then npm ci');
  }
  if (r.version !== pin) die('the pin is ' + r.package + '@' + pin + ' (' + PACKAGE_JSON + ') but the installed record ' + r.path + ' is ' + r.name + '@' + r.version + ' — run npm ci');
}
const named = releases.map((r) => r.name + '@' + r.version).join(', ');

// Every regular file under <dir>, keyed relative to it; a symlink or other non-file is refused, as enumerateDist does.
// skip: a top-level name left out (the stamped directory, when listing the entries).
function listFiles(dir, skip, pre = '', out = []) {
  for (const n of readdirSync(dir).sort()) {
    if (!pre && n === skip) continue;
    const p = join(dir, n);
    const st = lstatSync(p);
    if (st.isDirectory()) listFiles(p, skip, pre + n + '/', out);
    else if (st.isFile()) out.push(pre + n);
    else die(p + ' is not a regular file or directory — a served graph holds files only');
  }
  return out;
}
const pubDir = join(SITE, SITE_GRAPH_DIR);
const graphDir = join(pubDir, build);
let graphFiles;
try { graphFiles = listFiles(graphDir); }
catch (e) { die('the site is stamped ' + build + ' but has no ' + join(SITE_GRAPH_DIR, build) + '/ (' + (e.code || e.message) + ') — run npm run assemble (' + named + ')'); }
if (!graphFiles.length) die(join(SITE_GRAPH_DIR, build) + '/ is empty');
const graph = {};
for (const f of graphFiles) graph[f] = createHash('sha256').update(readFileSync(join(graphDir, f))).digest('hex');
const entries = new Set(listFiles(pubDir, build));
const others = await otherBuildDirs(SITE, build);
if (others.length) die(join(SITE, SITE_GRAPH_DIR) + '/ carries another build\'s graph directory (' + others.join(', ') + ') beside ' + build + '/ — one site, one build');
const app = {};
for (const f of listFiles(SITE, SITE_GRAPH_DIR)) app[f] = createHash('sha256').update(readFileSync(join(SITE, f))).digest('hex');

const faults = siteGraphFaults({ graph, entries, app }, releases);
if (faults.length) {
  console.log('FAIL  served-release: ' + join(SITE, SITE_GRAPH_DIR, build) + '/ is not the pinned releases (' + named + '): ' + faults.length + ' fault' + (faults.length > 1 ? 's' : ''));
  for (const f of faults.slice(0, SHOWN)) console.log('  ' + f);
  if (faults.length > SHOWN) console.log('  (+' + (faults.length - SHOWN) + ' more)');
  process.exit(1);
}

// Faithful: every graph file is a placement's listed file or its record. Count each placement's share.
const placedAt = (r, key) => (r.dir ? r.dir + '/' + key : key);
const counts = releases.map((r) => [r.manifest.file, ...Object.keys(r.files)].filter((k) => Object.prototype.hasOwnProperty.call(graph, placedAt(r, k))).length);
const total = counts.reduce((a, b) => a + b, 0);
if (total !== graphFiles.length) die('siteGraphFaults found no fault, but the placements account for ' + total + ' of the ' + graphFiles.length + ' graph files — report this to FRAQTL (site-graph.js)');
console.log('PASS  served-release: ' + join(SITE_GRAPH_DIR, build) + '/ (' + graphFiles.length + ' files) is the pinned releases: ' +
  releases.map((r, i) => r.name + '@' + r.version + ' ' + counts[i] + ' files at ' + (r.dir ? r.dir + '/' : 'the graph root')).join(', ') +
  '; ' + entries.size + ' entry files at ' + SITE_GRAPH_DIR + '/');
