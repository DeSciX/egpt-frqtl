#!/usr/bin/env node
/**
 * upload-scenes — publish scenes/ as app media: every scene the roster uses at scenes/<sha8>/<name>.js, then
 * scenes/roster.json, then read each back.
 *
 *   node scripts/upload-scenes.mjs --checkout <dir> [--dry-run]
 *
 * --dry-run   steps 1–3 without uploading: prints what would upload and what is already served; exit 0 only when
 *             nothing would upload (the media already serve every object and the roster).
 *
 * --checkout  the app checkout holding the PROD workspace and wallet; the CLI runs there (scripts/lib/descix.mjs),
 *             and is given absolute file paths from this tree.
 *
 * 1. scene-check with --quota (scripts/scene-check.mjs): any refusal stops the upload; so does used_bytes above the
 *    limit.
 * 2. Each scene object: probed at its URL with a one-off query (a distinct edge object, so the probe never caches a
 *    404 at the URL STUDIO reads). Served with this file's bytes → skipped: a content-addressed path is never
 *    uploaded twice. Served with other bytes → refused (a sha8 collision or a hand upload). Absent → uploaded with
 *    `descix app media-upload -a <APP_ID> -f <file> --prefix scenes/<sha8> --json`; the receipt must name exactly
 *    that path, size and public URL.
 * 3. The roster last, so it never names an object that is not served yet: uploaded (prefix scenes) unless the
 *    roster URL already serves these bytes. The roster is read with a one-off query too (scenes.mjs probeUrl), never
 *    STUDIO's cache bucket: a read of the live bucket before the upload caches the OLD roster at that bucket's URL,
 *    and STUDIO would see it until the bucket turns.
 * 4. Read-back (also after an upload of nothing): every scene URL and the roster (one-off query) answer 200, `access-control-allow-origin: *`, the
 *    extension's content type, and these bytes (sha256). Any mismatch exits 1.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sceneCheck } from './scene-check.mjs';
import { APP_ID, ROSTER_HREF, contentTypeOf, probeUrl } from './lib/scenes.mjs';
import { descix, jsonOf } from './lib/descix.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const i = process.argv.indexOf('--checkout');
if (i === -1 || !process.argv[i + 1]) { console.error('usage: node scripts/upload-scenes.mjs --checkout <app checkout>'); process.exit(2); }
const CHECKOUT = resolve(process.argv[i + 1]);
const DRY = process.argv.includes('--dry-run');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');

async function served(url) {
    const r = await fetch(url, { cache: 'no-store' });
    const bytes = Buffer.from(await r.arrayBuffer());
    return { status: r.status, bytes, type: r.headers.get('content-type'), acao: r.headers.get('access-control-allow-origin') };
}

function upload(u) {
    const { stdout } = descix(['app', 'media-upload', '-a', APP_ID, '-f', u.file, '--prefix', u.prefix, '--json'], CHECKOUT);
    const j = jsonOf(stdout, 'media-upload ' + u.path);
    const a = Array.isArray(j.assets) && j.assets.length === 1 ? j.assets[0] : null;
    if (!a || a.path !== u.path || a.size !== u.bytes || a.public_url !== u.url) {
        throw new Error('upload-scenes: the media-upload receipt for ' + u.path + ' is not that one object (' + u.bytes + ' bytes at ' +
            u.url + '): ' + JSON.stringify(j.assets));
    }
    return j.storage;
}

const check = await sceneCheck({ root: REPO, quota: true, checkout: CHECKOUT });
if (!check.ok) {
    for (const line of check.refusals) { console.error('REFUSED ' + line); }
    process.exit(1);
}
console.log('scene-check: PASS; used_bytes ' + check.storage.used + ', projected_bytes ' + check.storage.projected);

const scenes = check.upload.filter((u) => u.url !== ROSTER_HREF);
const roster = check.upload.find((u) => u.url === ROSTER_HREF);
const uploaded = [];
const skipped = [];
let storage = null;
for (const u of scenes) {
    const local = readFileSync(u.file);
    const s = await served(probeUrl(u.url));
    if (s.status === 200) {
        if (sha256(s.bytes) !== sha256(local)) {
            throw new Error('upload-scenes: ' + u.url + ' already serves other bytes (sha256 ' + sha256(s.bytes) + ', this file ' +
                sha256(local) + ') — a content-addressed path is never re-uploaded; find who wrote it.');
        }
        skipped.push(u.path);
        continue;
    }
    if (s.status !== 404) { throw new Error('upload-scenes: probing ' + u.url + ' answered ' + s.status + ', not 200 or 404.'); }
    if (!DRY) { storage = upload(u); }
    uploaded.push(u.path);
}
const rosterLocal = readFileSync(roster.file);
const rosterServed = await served(probeUrl(ROSTER_HREF));
if (rosterServed.status === 200 && sha256(rosterServed.bytes) === sha256(rosterLocal)) {
    skipped.push(roster.path);
} else {
    if (!DRY) { storage = upload(roster); }
    uploaded.push(roster.path);
}
if (DRY) {
    console.log('dry run — would upload ' + uploaded.length + ': ' + (uploaded.join(', ') || 'none'));
    console.log('already served ' + skipped.length + '; roster sha256 ' + sha256(rosterLocal) + (rosterServed.status === 200 ? ', served ' + sha256(rosterServed.bytes) : ', served status ' + rosterServed.status));
    process.exit(uploaded.length ? 1 : 0);
}
console.log('uploaded ' + uploaded.length + ': ' + (uploaded.join(', ') || 'none'));
console.log('already served (not re-uploaded) ' + skipped.length + ': ' + (skipped.join(', ') || 'none'));
if (storage) { console.log('storage after: used_bytes ' + storage.used_bytes + ' / limit_bytes ' + storage.limit_bytes); }

let FAIL = 0;
for (const u of check.upload) {
    const url = u.url === ROSTER_HREF ? probeUrl(ROSTER_HREF) : u.url;
    const s = await served(url);
    const want = contentTypeOf(u.path);
    const why = [];
    if (s.status !== 200) why.push('status ' + s.status);
    if (s.acao !== '*') why.push('access-control-allow-origin ' + JSON.stringify(s.acao));
    if (!s.type || s.type.split(';')[0].trim() !== want) why.push('content-type ' + JSON.stringify(s.type) + ', want ' + want);
    if (s.status === 200 && sha256(s.bytes) !== sha256(readFileSync(u.file))) why.push('sha256 ' + sha256(s.bytes) + ' ≠ local ' + sha256(readFileSync(u.file)));
    if (why.length) { FAIL = 1; console.log('FAIL  ' + url + ': ' + why.join('; ')); }
    else console.log('PASS  ' + url + '  200 ' + s.type + ' acao * sha256 ' + sha256(s.bytes).slice(0, 16) + '…');
}
process.exit(FAIL);
