#!/usr/bin/env node
/**
 * scene-check — the static gate on scenes/ before an upload (node, no browser).
 *
 *   node scripts/scene-check.mjs [--root <dir>] [--quota [--checkout <dir>]]
 *
 * For every scene file scenes/src/<name>.js:
 *   1. acorn parses it as an ES module;
 *   2. the pinned @descix/frqtl-web's own linker (./project linkProject) admits its imports — every specifier a
 *      scene-tier row of the package's FRQTL_WEB_SPECIFIERS — stopped before anything is minted or run;
 *   3. every named import (and re-export) is an export of that module in the INSTALLED pinned dist: the module is
 *      imported in node through the package's exports map and the name is looked up on its namespace;
 *   4. its sha8 (first 8 hex of the sha256 of its bytes) is computed.
 * Then scenes/roster.json: normalizeRoster from the pinned @descix/frqtl-web/registry accepts it at ROSTER_HREF
 * (scripts/lib/scenes.mjs), every row's `source` is `<sha8>/<name>.js` of a scene file with that sha8, every scene file has a row or an entry in scenes/unlisted.json (with a reason), and nothing is both.
 * It prints the total bytes and the planned upload list. Any refusal → every refusal printed, exit 1.
 *
 * --root <dir>  the directory holding scenes/ (default: this repo). The package always resolves from this
 *               repo's node_modules: the installed pin is the one judged.
 * --quota       after the checks, mint an upload token for the planned upload list (get_asset_upload_token, through
 *               `descix mcp execute` run in --checkout, default this repo: a checkout with the PROD workspace and
 *               wallet), read used_bytes and projected_bytes from its `storage` field, and refuse when used_bytes is
 *               above QUOTA_LIMIT_BYTES. Minting signs PUT URLs; nothing is uploaded. An unreadable storage field THROWS.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';
import { APP_ID, ROSTER_FILE, ROSTER_HREF, UPLOAD_PREFIX, contentTypeOf, sceneObjectOf } from './lib/scenes.mjs';
import { descix, jsonOf } from './lib/descix.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = '@descix/frqtl-web';
const SOURCE = /^([0-9a-f]{8})\/([^/]+\.js)$/;
/** Refuse an upload above this many used bytes, below the app's media quota (the token's storage.limit_bytes): app
 *  media has no list or delete verb yet (the DeSciX platform has them as a proposal). */
export const QUOTA_LIMIT_BYTES = 150 * 1024 * 1024;
const mb = (bytes) => (bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '') + ' MB';

function args(argv) {
    const out = { root: REPO, quota: false, checkout: REPO };
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === '--root') {
            if (!argv[i + 1]) { throw new Error('scene-check: --root takes a directory.'); }
            out.root = resolve(argv[++i]);
        } else if (argv[i] === '--quota') {
            out.quota = true;
        } else if (argv[i] === '--checkout') {
            if (!argv[i + 1]) { throw new Error('scene-check: --checkout takes a directory.'); }
            out.checkout = resolve(argv[++i]);
        } else {
            throw new Error('scene-check: unknown argument ' + JSON.stringify(argv[i]) + ' (usage: scene-check [--root <dir>] [--quota [--checkout <dir>]]).');
        }
    }
    return out;
}

const isBag = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The pin in this repo's package.json, refused unless it is the installed version. */
function pinnedVersion() {
    const pin = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).devDependencies?.[PKG];
    if (typeof pin !== 'string' || pin === '') {
        throw new Error('scene-check: package.json pins no ' + PKG + ' in devDependencies.');
    }
    const require = createRequire(join(REPO, 'package.json'));
    const installed = require(PKG + '/package.json').version;
    if (installed !== pin) {
        throw new Error('scene-check: package.json pins ' + PKG + ' ' + pin + ' but ' + installed + ' is installed — run npm ci.');
    }
    return pin;
}

/** Every import a module declares, statically: { spec, names, line } (names: the imported/re-exported names). */
function importsOf(ast) {
    const out = [];
    const nameOf = (n) => (n.type === 'Identifier' ? n.name : n.value);
    for (const node of ast.body) {
        if (node.type === 'ImportDeclaration') {
            const names = [];
            for (const s of node.specifiers) {
                if (s.type === 'ImportSpecifier') { names.push(nameOf(s.imported)); }
                if (s.type === 'ImportDefaultSpecifier') { names.push('default'); }
            }
            out.push({ spec: node.source.value, names, line: node.loc.start.line });
        } else if ((node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') && node.source) {
            const names = node.type === 'ExportNamedDeclaration' ? node.specifiers.map((s) => nameOf(s.local)) : [];
            out.push({ spec: node.source.value, names, line: node.loc.start.line });
        }
    }
    return out;
}

/** Lines of every dynamic import() in the tree: a scene's imports are static, or this gate cannot see them. */
function dynamicImportLines(node, acc = []) {
    if (Array.isArray(node)) { node.forEach((n) => dynamicImportLines(n, acc)); return acc; }
    if (!node || typeof node.type !== 'string') { return acc; }
    if (node.type === 'ImportExpression') { acc.push(node.loc.start.line); }
    for (const k of Object.keys(node)) {
        const v = node[k];
        if (v && typeof v === 'object' && k !== 'loc') { dynamicImportLines(v, acc); }
    }
    return acc;
}

/** STOP: the mint linkProject calls only after it has admitted every import. Thrown, caught by identity. */
const ADMITTED = Symbol('admitted');
function stopMint() { throw ADMITTED; }

/**
 * The app's media storage, read from the `storage` field of an upload token minted for `upload` (the planned objects).
 * @param {Array<{path: string, bytes: number}>} upload
 * @param {string} checkout  where the CLI runs: a checkout with the PROD workspace and wallet
 * @returns {{ used: number, projected: number, limit: number }}
 */
export function readStorageFromUploadToken(upload, checkout) {
    const files = upload.map((u) => ({ path: u.path, content_type: contentTypeOf(u.path), size: u.bytes }));
    const { stdout } = descix(['mcp', 'execute', '--tool', 'get_asset_upload_token', '--params',
        JSON.stringify({ app_id: APP_ID, files }), '--json'], checkout);
    const j = jsonOf(stdout, 'get_asset_upload_token');
    const s = j && j.status === 'OK' && j.message ? j.message.storage : undefined;
    if (!s || !Number.isInteger(s.used_bytes) || !Number.isInteger(s.projected_bytes) || !Number.isInteger(s.limit_bytes)) {
        throw new Error('scene-check --quota: storage not readable from the upload token: status ' + JSON.stringify(j && j.status) +
            ', storage ' + JSON.stringify(s) + ' (want integer used_bytes, projected_bytes, limit_bytes).');
    }
    return { used: s.used_bytes, projected: s.projected_bytes, limit: s.limit_bytes };
}

/**
 * @param {number} usedBytes   storage.used_bytes
 * @param {number} limitBytes  storage.limit_bytes (the app's media quota)
 * @returns {string|null} why `usedBytes` stops an upload, or null
 */
export function quotaRefusalOf(usedBytes, limitBytes) {
    if (!Number.isInteger(limitBytes) || limitBytes <= 0) {
        return 'limit_bytes must be a positive integer (got ' + JSON.stringify(limitBytes) + ').';
    }
    if (!Number.isInteger(usedBytes) || usedBytes < 0) {
        return 'used_bytes must be a non-negative integer (got ' + JSON.stringify(usedBytes) + ').';
    }
    if (usedBytes > QUOTA_LIMIT_BYTES) {
        return 'used_bytes ' + usedBytes + ' is above ' + QUOTA_LIMIT_BYTES + ' (' + mb(QUOTA_LIMIT_BYTES) + ') of the ' + mb(limitBytes) + ' media quota; ' +
            'app media has no list or delete verb yet (a DeSciX platform proposal), so only a platform admin can remove objects.';
    }
    return null;
}

export async function sceneCheck({ root, quota, checkout }) {
    const refusals = [];
    const pin = pinnedVersion();
    const { linkProject, SKETCH_ENTRY } = await import(PKG + '/project');
    const scenesDir = join(root, UPLOAD_PREFIX);
    const srcDir = join(scenesDir, 'src');
    if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) { throw new Error('scene-check: no directory ' + srcDir + '.'); }
    const bump = (name, what) => 'scene ' + name + ': ' + what + ' — pinned ' + PKG + ' ' + pin +
        ': bump the pin to a version that exports it.';

    const modules = new Map();   // specifier → namespace | Error
    const scenes = new Map();    // name → { bytes, sha8, object }
    const files = readdirSync(srcDir).sort();
    for (const f of files) {
        if (!f.endsWith('.js')) { refusals.push('scenes/src/' + f + ' is not a scene file (<name>.js); scenes/src holds scene files only.'); }
    }
    const names = files.filter((f) => f.endsWith('.js'));
    if (names.length === 0) { refusals.push('scenes/src/ holds no scene file.'); }

    for (const name of names) {
        const bytes = readFileSync(join(srcDir, name));
        const object = sceneObjectOf(name, bytes);
        scenes.set(name, { bytes, sha8: object.prefix.slice(UPLOAD_PREFIX.length + 1), object });
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
        catch (e) { refusals.push('scene ' + name + ': not valid UTF-8; a scene is a UTF-8 text module.'); continue; }
        let ast;
        try { ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
        catch (e) { refusals.push('scene ' + name + ': does not parse as an ES module: ' + e.message + '.'); continue; }
        for (const line of dynamicImportLines(ast)) {
            refusals.push('scene ' + name + ':' + line + ': a dynamic import() — a scene imports statically, so this gate can check it.');
        }

        let linkErr = null;
        try {
            await linkProject({ files: { [SKETCH_ENTRY]: text }, entry: SKETCH_ENTRY, mint: stopMint });
            linkErr = new Error('linkProject resolved without minting: the gate cannot tell what it admitted.');
        } catch (e) {
            if (e !== ADMITTED) { linkErr = e; }
        }
        if (linkErr) {
            refusals.push(bump(name, 'the linker refuses it: ' + String(linkErr.message).split(SKETCH_ENTRY).join(name)));
            continue;
        }

        for (const imp of importsOf(ast)) {
            if (!modules.has(imp.spec)) {
                try { modules.set(imp.spec, await import(imp.spec)); }
                catch (e) { modules.set(imp.spec, e); }
            }
            const ns = modules.get(imp.spec);
            if (ns instanceof Error) {
                refusals.push(bump(name, 'line ' + imp.line + ' imports ' + JSON.stringify(imp.spec) + ', which the installed dist does not load: ' + ns.message));
                continue;
            }
            for (const n of imp.names) {
                if (!Object.prototype.hasOwnProperty.call(ns, n)) {
                    refusals.push(bump(name, 'line ' + imp.line + ' imports { ' + n + ' } from ' + JSON.stringify(imp.spec) +
                        ', which ' + PKG + '@' + pin + ' (installed) does not export'));
                }
            }
        }
    }

    // ── The roster ──────────────────────────────────────────────────────────────
    const rosterPath = join(scenesDir, ROSTER_FILE);
    const { normalizeRoster } = await import(PKG + '/registry');
    let roster = null;
    if (!existsSync(rosterPath)) { refusals.push('scenes/' + ROSTER_FILE + ' is missing.'); }
    else {
        try { roster = JSON.parse(readFileSync(rosterPath, 'utf8')); }
        catch (e) { refusals.push('scenes/' + ROSTER_FILE + ' is not JSON: ' + e.message + '.'); }
    }
    const rowsBySource = new Map();   // name → [row id]
    if (roster !== null) {
        try { normalizeRoster(roster, ROSTER_HREF); }
        catch (e) { refusals.push('roster: ' + PKG + ' ' + pin + ' normalizeRoster refuses scenes/' + ROSTER_FILE + ': ' + e.message); }
        (Array.isArray(roster.rows) ? roster.rows : []).forEach((row, i) => {
            const id = isBag(row) && typeof row.id === 'string' ? row.id : '#' + i;
            const src = isBag(row) ? row.source : undefined;
            const m = typeof src === 'string' ? SOURCE.exec(src) : null;
            if (!m) {
                refusals.push('roster row ' + id + ': source ' + JSON.stringify(src) + ' is not <sha8>/<name>.js.');
                return;
            }
            const [, sha8, file] = m;
            const scene = scenes.get(file);
            if (!scene) {
                refusals.push('roster row ' + id + ': source ' + src + ' names ' + file + ', which is not in scenes/src/.');
                return;
            }
            if (scene.sha8 !== sha8) {
                refusals.push('roster row ' + id + ': source ' + src + ' is stale — scenes/src/' + file + ' hashes to ' +
                    scene.sha8 + ', so its source is ' + scene.sha8 + '/' + file + '.');
            }
            rowsBySource.set(file, (rowsBySource.get(file) || []).concat(id));
        });
    }

    const unlistedPath = join(scenesDir, 'unlisted.json');
    const unlisted = existsSync(unlistedPath) ? JSON.parse(readFileSync(unlistedPath, 'utf8')) : {};
    if (!isBag(unlisted)) { refusals.push('scenes/unlisted.json is { "<name>.js": "<reason>" }.'); }
    for (const [file, reason] of Object.entries(isBag(unlisted) ? unlisted : {})) {
        if (typeof reason !== 'string' || reason.trim() === '') { refusals.push('scenes/unlisted.json: ' + file + ' has no reason.'); }
        if (!scenes.has(file)) { refusals.push('scenes/unlisted.json names ' + file + ', which is not in scenes/src/.'); }
        if (rowsBySource.has(file)) {
            refusals.push('scenes/unlisted.json names ' + file + ', which roster rows ' + rowsBySource.get(file).join(', ') + ' use.');
        }
    }
    for (const name of scenes.keys()) {
        if (!rowsBySource.has(name) && !(isBag(unlisted) && Object.prototype.hasOwnProperty.call(unlisted, name))) {
            refusals.push('scene ' + name + ' has no roster row and no entry in scenes/unlisted.json.');
        }
    }

    if (refusals.length > 0) { return { ok: false, refusals }; }

    const upload = [...rowsBySource.keys()].sort().map((f) => ({
        file: join(srcDir, f), prefix: scenes.get(f).object.prefix, path: scenes.get(f).object.path, url: scenes.get(f).object.url,
        bytes: scenes.get(f).bytes.length,
    }));
    upload.push({ file: rosterPath, prefix: UPLOAD_PREFIX, path: UPLOAD_PREFIX + '/' + ROSTER_FILE, url: ROSTER_HREF, bytes: statSync(rosterPath).size });
    const report = {
        ok: true, pin, scenes: scenes.size, rows: roster.rows.length, listed: rowsBySource.size,
        unlisted: Object.keys(unlisted).sort(), upload, totalBytes: upload.reduce((s, u) => s + u.bytes, 0),
    };
    if (quota) {
        const storage = readStorageFromUploadToken(upload, checkout);
        const why = quotaRefusalOf(storage.used, storage.limit);
        if (why) { return { ok: false, refusals: ['quota: ' + why] }; }
        report.storage = storage;
    }
    return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const r = await sceneCheck(args(process.argv.slice(2)));
    if (!r.ok) {
        for (const line of r.refusals) { console.error('REFUSED ' + line); }
        console.error('scene-check: ' + r.refusals.length + ' refusal(s).');
        process.exit(1);
    }
    console.log('scene-check: ' + PKG + ' ' + r.pin + ' (installed); ' + r.scenes + ' scene files, ' + r.rows +
        ' roster rows over ' + r.listed + ' listed files; unlisted: ' + (r.unlisted.join(', ') || 'none') + '.');
    console.log('planned upload (' + r.upload.length + ' objects, ' + r.totalBytes + ' bytes):');
    for (const u of r.upload) { console.log('  ' + u.path + '  ' + u.bytes); }
    if (r.storage !== undefined) {
        console.log('used_bytes: ' + r.storage.used + ' (projected_bytes ' + r.storage.projected + ' after this upload; limit_bytes ' +
            r.storage.limit + '; refused above ' + QUOTA_LIMIT_BYTES + ')');
    }
    console.log('scene-check: PASS');
}
