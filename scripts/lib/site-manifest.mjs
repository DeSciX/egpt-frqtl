#!/usr/bin/env node
// The site manifest's upload set, read the way the uploader reads it: the one matcher every check in
// this repo consumes to ask "would `descix site upload` send site/<rel>?".
//
//   node scripts/lib/site-manifest.mjs [--manifest <file>] <rel>...
//
// Exit 0 when every <rel> is in the upload set; exit 1 naming each one that is not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The manifest's upload set for <rel>: excluded when any path segment is a bare-name exclude
// (SiteWalker tests exclude first and matches a bare directory name at any depth), included when
// an include entry is the exact path or a `<dir>/**` prefix of it (a bare <dir> is included when
// `<dir>/**` is: everything under it uploads). Any other pattern shape is
// thrown, not guessed: a matcher that silently disagrees with the uploader is worse than none.
export function inUploadSet(manifest, rel) {
  const src = (manifest.sources || []).find((s) => s.path === 'site');
  if (!src) throw new Error('site manifest has no source with path "site"');
  const segs = rel.split('/');
  for (const ex of src.exclude || []) {
    if (/[*?[\]/]/.test(ex)) throw new Error(`site manifest exclude "${ex}" is not a bare name; this check matches bare names only`);
    if (segs.includes(ex)) return false;
  }
  for (const inc of src.include || []) {
    if (inc.endsWith('/**') && !/[*?[\]]/.test(inc.slice(0, -3))) {
      if (rel === inc.slice(0, -3) || rel.startsWith(inc.slice(0, -2))) return true;
    } else if (/[*?[\]]/.test(inc)) {
      throw new Error(`site manifest include "${inc}" is neither an exact path nor <dir>/**; this check matches those two shapes only`);
    } else if (rel === inc) {
      return true;
    }
  }
  return false;
}

function main() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const args = process.argv.slice(2);
  let manifestPath = path.join(ROOT, '.descix/manifests/site.json');
  const i = args.indexOf('--manifest');
  if (i !== -1) { manifestPath = path.resolve(args[i + 1]); args.splice(i, 2); }
  if (!args.length) { console.error('ERROR: usage: node scripts/lib/site-manifest.mjs [--manifest <file>] <rel>...'); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const missing = args.filter((rel) => !inUploadSet(manifest, rel));
  for (const rel of missing) console.error(`NOT UPLOADED  site/${rel} is not in the upload set of ${manifestPath}`);
  process.exit(missing.length ? 1 : 0);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
