#!/usr/bin/env node
// Controls for scripts/lib/share-contract.mjs, run through its CLI against fabricated site
// directories in a scratch dir (never the real site/).
//
//   node scripts/test/share-contract.mjs
//
// One positive control (a conforming share.json with real PNG bytes) and the fail-soft absent case
// must exit 0; every RED control must exit 1 AND name its violation. Exit 0 only when every row
// gets its expected verdict.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'scripts/lib/share-contract.mjs');
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), 'share-contract.'));
let FAIL = 0;

// A real, decodable PNG of w x h (grey), built from its chunks.
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// A JPEG header: SOI, an APP0 segment the walker must skip, then SOF0 carrying w x h.
function jpeg(w, h) {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.from([0xff, 0xd9])]);
}
const ICO = Buffer.from([0, 0, 1, 0, 1, 0, 16, 16, 0, 0, 1, 0, 32, 0, 0, 0, 0, 0, 22, 0, 0, 0]);

const GOOD = {
  title: 'FRQTL — discrete fractal physics',
  description: 'Interference, gravity and atoms emerge from ticks, pixels and occupancy.',
  icon: 'images/share/favicon.ico',
  og_image: 'images/share/og.png',
  twitter_card: 'summary_large_image',
  apple_touch_icon: 'images/share/apple-touch-icon.png',
};

// A site dir with the conforming assets; <edit>(dir, share) mutates either before share.json is written.
function site(name, edit = () => {}) {
  const dir = path.join(SCRATCH, name, 'site');
  fs.mkdirSync(path.join(dir, 'images/share'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'images/share/favicon.ico'), ICO);
  fs.writeFileSync(path.join(dir, 'images/share/og.png'), png(1200, 630));
  fs.writeFileSync(path.join(dir, 'images/share/apple-touch-icon.png'), png(180, 180));
  const share = { ...GOOD };
  const out = edit(dir, share);
  if (out !== 'no-share') fs.writeFileSync(path.join(dir, 'share.json'), typeof out === 'string' ? out : JSON.stringify(share, null, 2));
  return dir;
}

function row(name, dir, wantExit, wantText) {
  const r = spawnSync(process.execPath, [CLI, '--site', dir], { encoding: 'utf8' });
  const out = r.stdout + r.stderr;
  if (r.status === wantExit && out.includes(wantText)) console.log(`PASS  ${name}`);
  else { console.log(`FAIL  ${name}: exit ${r.status} (want ${wantExit}), output lacks "${wantText}":\n${out}`); FAIL = 1; }
}

// --- GREEN: fail-soft absence, and conforming files.
row('absent-says-so-and-exits-0', site('absent', () => 'no-share'), 0, 'share.json ABSENT');
row('conforming-png-og-image-passes', site('good'), 0, 'conforms');
row('conforming-jpeg-og-image-passes', site('good-jpeg', (d, s) => { fs.writeFileSync(path.join(d, 'images/share/og.jpg'), jpeg(1200, 630)); s.og_image = 'images/share/og.jpg'; }), 0, 'conforms');
row('optional-fields-may-be-omitted', site('minimal', (d, s) => { delete s.twitter_card; delete s.apple_touch_icon; }), 0, 'conforms');
row('apple-touch-icon-of-any-size-passes', site('apple-192', (d) => { fs.writeFileSync(path.join(d, 'images/share/apple-touch-icon.png'), png(192, 192)); }), 0, 'conforms');
row('og-image-of-999999-bytes-passes', site('og-999999', (d) => { const b = png(1200, 630); fs.writeFileSync(path.join(d, 'images/share/og.png'), Buffer.concat([b, Buffer.alloc(999_999 - b.length)])); }), 0, 'conforms');
row('description-of-159-chars-passes', site('desc-159', (d, s) => { s.description = 'x'.repeat(159); }), 0, 'conforms');

// --- RED controls.
row('refuses-unknown-field', site('unknown', (d, s) => { s.image = 'images/share/og.png'; }), 1, 'unknown field "image"');
row('refuses-description-of-160-chars', site('desc-160', (d, s) => { s.description = 'x'.repeat(160); }), 1, 'description is 160 characters');
row('refuses-missing-required-field', site('no-og', (d, s) => { delete s.og_image; }), 1, 'og_image is required');
row('refuses-missing-file', site('missing', (d, s) => { s.icon = 'images/share/nope.ico'; }), 1, 'does not resolve to a file');
row('refuses-path-escaping-site', site('escape', (d, s) => { fs.writeFileSync(path.join(d, '..', 'out.png'), png(1200, 630)); s.og_image = '../out.png'; }), 1, 'inside the site directory');
row('refuses-url-asset', site('url', (d, s) => { s.icon = 'https://example.com/x.ico'; }), 1, 'not a URL or absolute path');
row('refuses-og-image-wrong-dimensions', site('og-dims', (d, s) => { fs.writeFileSync(path.join(d, 'images/share/og.png'), png(1200, 631)); }), 1, 'is 1200x631; it must be 1200x630');
row('refuses-jpeg-og-image-wrong-dimensions', site('og-jpeg-dims', (d, s) => { fs.writeFileSync(path.join(d, 'images/share/og.jpg'), jpeg(1200, 600)); s.og_image = 'images/share/og.jpg'; }), 1, 'is 1200x600');
row('refuses-og-image-of-1000000-bytes', site('og-size', (d) => { const b = png(1200, 630); fs.writeFileSync(path.join(d, 'images/share/og.png'), Buffer.concat([b, Buffer.alloc(1_000_000 - b.length)])); }), 1, 'is 1000000 bytes; it must be under 1000000');
row('refuses-og-image-of-unreadable-format', site('og-text', (d) => { fs.writeFileSync(path.join(d, 'images/share/og.png'), 'not an image'); }), 1, 'pixel size cannot be read');
row('refuses-missing-icon', site('no-icon', (d, s) => { delete s.icon; }), 1, 'icon is required');
row('refuses-empty-title', site('empty-title', (d, s) => { s.title = ' '; }), 1, 'title must be a non-empty string');
row('refuses-missing-optional-asset-file', site('apple-missing', (d, s) => { s.apple_touch_icon = 'images/share/none.png'; }), 1, 'apple_touch_icon "images/share/none.png" does not resolve to a file');
row('refuses-invalid-json', site('json', () => '{"title":'), 1, 'not valid JSON');

fs.rmSync(SCRATCH, { recursive: true, force: true });
process.exit(FAIL);
