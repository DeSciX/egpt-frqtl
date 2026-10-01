#!/usr/bin/env node
// The one owner of the site/share.json contract: the share metadata DeSciX's edge worker reads at
// serve time and injects into the shell head (<title>, meta description, favicon, og:*, twitter:*).
//
//   node scripts/lib/share-contract.mjs [--site <dir>] [--manifest <file>]
//
// Defaults: this repo's site/ and .descix/manifests/site.json. Exit 0 when share.json is ABSENT
// (the worker is fail-soft: it serves the shell's default head, and this check says so) or when it
// is present and conforms; exit 1 with every violation listed otherwise; exit 2 on bad usage.
//
// Conformance is checked against the bytes: field names exactly SHARE_FIELDS (unknown keys
// refused), types and lengths, and every asset path resolving to a file inside the site directory
// whose format and pixel size are read from its own header. Each path, and share.json itself, must
// also be in the upload set of the site manifest, or the worker would fetch a file never uploaded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARE_FILE = 'share.json';
export const DESCRIPTION_MAX = 159; // characters (code points); the contract says < 160
export const OG_IMAGE_MAX_BYTES = 1_000_000; // < 1MB, decimal: anything under it is also under 1MiB

// The field contract. kind 'text' | 'enum' | 'asset'. An asset names the formats it may be (read
// from the file header, which must agree with the extension) and, where fixed, its pixel size.
export const SHARE_FIELDS = {
  title: { required: true, kind: 'text' },
  description: { required: true, kind: 'text', maxChars: DESCRIPTION_MAX },
  icon: { required: true, kind: 'asset', formats: ['ico', 'png'] },
  og_image: { required: true, kind: 'asset', formats: ['png', 'jpeg'], width: 1200, height: 630, maxBytes: OG_IMAGE_MAX_BYTES },
  twitter_card: { required: false, kind: 'enum', values: ['summary_large_image', 'summary'] },
  apple_touch_icon: { required: false, kind: 'asset', formats: ['png'], width: 180, height: 180 },
};

const EXTENSIONS = { ico: ['.ico'], png: ['.png'], jpeg: ['.jpg', '.jpeg'] };

// Format and pixel size from the file's own header bytes; null format when unrecognised.
export function readImageHeader(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a
      && buf.toString('latin1', 12, 16) === 'IHDR') {
    return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return { format: 'jpeg', width: null, height: null };
      const marker = buf[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = buf.readUInt16BE(i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { format: 'jpeg', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + len;
    }
    return { format: 'jpeg', width: null, height: null };
  }
  if (buf.length >= 6 && buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1 && buf.readUInt16LE(4) > 0) {
    return { format: 'ico', width: null, height: null };
  }
  return { format: null, width: null, height: null };
}

// The manifest's upload set for <rel>: excluded when any path segment is a bare-name exclude
// (SiteWalker tests exclude first and matches a bare directory name at any depth), included when
// an include entry is the exact path or a `<dir>/**` prefix of it. Any other pattern shape is
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
      if (rel.startsWith(inc.slice(0, -2))) return true;
    } else if (/[*?[\]]/.test(inc)) {
      throw new Error(`site manifest include "${inc}" is neither an exact path nor <dir>/**; this check matches those two shapes only`);
    } else if (rel === inc) {
      return true;
    }
  }
  return false;
}

// Validate <siteDir>/share.json. Returns { present, errors[], facts[] }.
export function checkShare(siteDir, manifest) {
  const file = path.join(siteDir, SHARE_FILE);
  if (!fs.existsSync(file)) return { present: false, errors: [], facts: [] };
  const errors = [];
  const facts = [];
  let doc;
  try {
    doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return { present: true, errors: [`${SHARE_FILE} is not valid JSON: ${e.message}`], facts };
  }
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    return { present: true, errors: [`${SHARE_FILE} must be a JSON object`], facts };
  }
  if (!inUploadSet(manifest, SHARE_FILE)) errors.push(`${SHARE_FILE} is not in the site manifest's upload set — the worker would find none`);
  for (const key of Object.keys(doc)) {
    if (!Object.hasOwn(SHARE_FIELDS, key)) errors.push(`unknown field "${key}" — the contract's fields are ${Object.keys(SHARE_FIELDS).join(', ')}`);
  }
  const siteReal = fs.realpathSync(siteDir);
  for (const [name, spec] of Object.entries(SHARE_FIELDS)) {
    if (!Object.hasOwn(doc, name)) {
      if (spec.required) errors.push(`${name} is required`);
      continue;
    }
    const v = doc[name];
    if (typeof v !== 'string' || v.trim() === '') { errors.push(`${name} must be a non-empty string`); continue; }
    if (spec.kind === 'text') {
      const n = [...v].length;
      if (spec.maxChars && n > spec.maxChars) errors.push(`${name} is ${n} characters; it must be under ${spec.maxChars + 1}`);
      else facts.push(`${name}: ${n} chars`);
      continue;
    }
    if (spec.kind === 'enum') {
      if (!spec.values.includes(v)) errors.push(`${name} "${v}" is not one of ${spec.values.join(', ')}`);
      else facts.push(`${name}: ${v}`);
      continue;
    }
    // asset
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('/') || v.includes('\\')) {
      errors.push(`${name} "${v}" must be a path relative to the site directory, not a URL or absolute path`); continue;
    }
    const rel = path.posix.normalize(v);
    if (rel.startsWith('../') || rel === '..' || rel !== v.replace(/^\.\//, '')) {
      errors.push(`${name} "${v}" must be a normalized path inside the site directory`); continue;
    }
    const abs = path.join(siteDir, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { errors.push(`${name} "${v}" does not resolve to a file in ${siteDir}`); continue; }
    const real = fs.realpathSync(abs);
    if (!real.startsWith(siteReal + path.sep)) { errors.push(`${name} "${v}" resolves outside the site directory (${real})`); continue; }
    if (!inUploadSet(manifest, rel)) errors.push(`${name} "${v}" is not in the site manifest's upload set — it would never be uploaded`);
    const buf = fs.readFileSync(abs);
    const head = readImageHeader(buf);
    const ext = path.extname(rel).toLowerCase();
    if (!spec.formats.includes(head.format)) {
      errors.push(`${name} "${v}" is ${head.format ? head.format.toUpperCase() : 'not a recognised image'}; it must be ${spec.formats.map((f) => f.toUpperCase()).join(' or ')}`);
      continue;
    }
    if (!EXTENSIONS[head.format].includes(ext)) errors.push(`${name} "${v}" is ${head.format.toUpperCase()} bytes behind a "${ext}" extension`);
    if (spec.width) {
      if (head.width !== spec.width || head.height !== spec.height) {
        errors.push(`${name} "${v}" is ${head.width}x${head.height}; it must be ${spec.width}x${spec.height}`);
      }
    }
    if (spec.maxBytes && buf.length >= spec.maxBytes) errors.push(`${name} "${v}" is ${buf.length} bytes; it must be under ${spec.maxBytes}`);
    facts.push(`${name}: ${v} ${head.format.toUpperCase()}${head.width ? ` ${head.width}x${head.height}` : ''} ${buf.length} bytes`);
  }
  return { present: true, errors, facts };
}

function main() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };
  for (const a of process.argv.slice(2)) {
    if (a.startsWith('--') && a !== '--site' && a !== '--manifest') {
      console.error('ERROR: usage: node scripts/lib/share-contract.mjs [--site <dir>] [--manifest <file>]');
      process.exit(2);
    }
  }
  const site = path.resolve(arg('--site') || path.join(ROOT, 'site'));
  const manifestPath = path.resolve(arg('--manifest') || path.join(ROOT, '.descix/manifests/site.json'));
  if (!fs.existsSync(site) || !fs.statSync(site).isDirectory()) { console.error(`ERROR: ${site} is not a directory`); process.exit(2); }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const r = checkShare(site, manifest);
  if (!r.present) {
    console.log(`share.json ABSENT at ${path.join(site, SHARE_FILE)} — nothing checked. The edge worker is fail-soft without one: it serves the shell's default head, so this site shares with no title, description, icon or image of its own.`);
    process.exit(0);
  }
  for (const f of r.facts) console.log(`  ${f}`);
  if (r.errors.length) {
    for (const e of r.errors) console.error(`FAIL  ${e}`);
    console.error(`share.json at ${path.join(site, SHARE_FILE)}: ${r.errors.length} violation(s)`);
    process.exit(1);
  }
  console.log(`PASS  share.json at ${path.join(site, SHARE_FILE)} conforms`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
