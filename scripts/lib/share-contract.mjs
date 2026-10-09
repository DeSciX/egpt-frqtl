#!/usr/bin/env node
// The pre-upload check of site/share.json, the link-preview card the platform edge injects into the
// served page's <head>. This repo builds and uploads the site, so it owns share.json, images/share/
// and this check.
//
//   node scripts/lib/share-contract.mjs [--site <dir>]
//
// Default site directory: this repo's site/. Exit codes:
//   0  share.json is ABSENT (the runbook: absence never breaks the app, and this check says so), or
//      it is present and conforms;
//   1  every violation is listed;
//   2  bad usage.
//
// THE CONTRACT'S ONE OWNER is the canonical app-developer runbook,
// /Users/essam/Code/daita/site/docs/app-sdk/app-developer-runbook.md §7.3. Every rule below cites
// its line there:
//   - field table (line 340): the fields are exactly title, description, icon, og_image,
//     twitter_card and apple_touch_icon. Any other key is refused.
//   - line 342: `title` is required.
//   - line 343: `description` is required and under 160 characters.
//   - line 344: `icon` is the favicon path. It is not marked optional, so it is checked as required.
//   - line 345: `og_image` is 1200×630 and under 1 MB. This check takes 1 MB as 1,000,000 bytes
//     (CEO-COMMS ruling 2026-10-09, Unkamon 540758a). It is not marked optional, so it is checked as
//     required.
//   - line 346: `twitter_card` is optional, default `summary_large_image`. A string when present.
//   - line 347: `apple_touch_icon` is optional.
//   - line 349: all paths are bundle-relative. Each one must resolve to a file inside the site
//     directory.
// The runbook states no other rule, and this check adds none. The og_image header is read only to
// measure its pixel size.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SHARE_FILE = 'share.json';
export const DESCRIPTION_MAX = 159; // characters (code points): "under 160 characters", runbook line 343
export const OG_IMAGE_MAX_BYTES = 1_000_000; // "under 1 MB", runbook line 345, read as 1,000,000 bytes

// The field table, runbook §7.3 lines 340-347. kind 'text' | 'asset'.
export const SHARE_FIELDS = {
  title: { required: true, kind: 'text' },
  description: { required: true, kind: 'text', maxChars: DESCRIPTION_MAX },
  icon: { required: true, kind: 'asset' },
  og_image: { required: true, kind: 'asset', width: 1200, height: 630, maxBytes: OG_IMAGE_MAX_BYTES },
  twitter_card: { required: false, kind: 'text' },
  apple_touch_icon: { required: false, kind: 'asset' },
};

// Pixel size from a PNG or JPEG header, or null when the bytes are neither.
export function readImageSize(buf) {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a
      && buf.toString('latin1', 12, 16) === 'IHDR') {
    return { format: 'PNG', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1];
      if (marker === 0xff) { i += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { format: 'JPEG', height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

// Validate <siteDir>/share.json. Returns { present, errors[], facts[] }.
export function checkShare(siteDir) {
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
  for (const key of Object.keys(doc)) {
    if (!Object.hasOwn(SHARE_FIELDS, key)) errors.push(`unknown field "${key}" — the runbook §7.3 fields are ${Object.keys(SHARE_FIELDS).join(', ')}`);
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
    // asset: a bundle-relative path to a file inside the site directory
    if (/^[a-z][a-z0-9+.-]*:/i.test(v) || v.startsWith('/') || v.includes('\\')) {
      errors.push(`${name} "${v}" must be a bundle-relative path, not a URL or absolute path`); continue;
    }
    const rel = path.posix.normalize(v);
    if (rel.startsWith('../') || rel === '..' || rel !== v.replace(/^\.\//, '')) {
      errors.push(`${name} "${v}" must be a normalized path inside the site directory`); continue;
    }
    const abs = path.join(siteDir, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) { errors.push(`${name} "${v}" does not resolve to a file in ${siteDir}`); continue; }
    const real = fs.realpathSync(abs);
    if (!real.startsWith(siteReal + path.sep)) { errors.push(`${name} "${v}" resolves outside the site directory (${real})`); continue; }
    const buf = fs.readFileSync(abs);
    let fact = `${name}: ${v} ${buf.length} bytes`;
    if (spec.width) {
      const size = readImageSize(buf);
      if (!size) {
        errors.push(`${name} "${v}" is neither PNG nor JPEG, so its pixel size cannot be read; it must be ${spec.width}x${spec.height}`);
        continue;
      }
      if (size.width !== spec.width || size.height !== spec.height) {
        errors.push(`${name} "${v}" is ${size.width}x${size.height}; it must be ${spec.width}x${spec.height}`);
      }
      fact += ` ${size.format} ${size.width}x${size.height}`;
    }
    if (spec.maxBytes && buf.length >= spec.maxBytes) errors.push(`${name} "${v}" is ${buf.length} bytes; it must be under ${spec.maxBytes}`);
    facts.push(fact);
  }
  return { present: true, errors, facts };
}

function main() {
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 2 && args[0] === '--site')) {
    console.error('ERROR: usage: node scripts/lib/share-contract.mjs [--site <dir>]');
    process.exit(2);
  }
  const site = path.resolve(args[1] || path.join(ROOT, 'site'));
  if (!fs.existsSync(site) || !fs.statSync(site).isDirectory()) { console.error(`ERROR: ${site} is not a directory`); process.exit(2); }
  const r = checkShare(site);
  if (!r.present) {
    console.log(`share.json ABSENT at ${path.join(site, SHARE_FILE)}: nothing checked. The app serves with the platform's generic head (runbook §7.3), so this site shares with no title, description, icon or image of its own.`);
    process.exit(0);
  }
  for (const f of r.facts) console.log(`  ${f}`);
  if (r.errors.length) {
    for (const e of r.errors) console.error(`FAIL  ${e}`);
    console.error(`share.json at ${path.join(site, SHARE_FILE)}: ${r.errors.length} violation(s)`);
    process.exit(1);
  }
  console.log(`PASS  share.json at ${path.join(site, SHARE_FILE)} conforms to runbook §7.3`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
