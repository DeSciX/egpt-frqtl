/* Copyright 2023-2026 by Essam Abadir */

/**
 * boot.test.mjs — the browser storage provider has ONE installer (lib/shim/storage/boot.js
 * bootLocalStorage), and the run-once card's path works with it alone: no STUDIO/ROSETTA view
 * module is imported here, yet a first visit decides `shown-first-visit`.
 *
 * Run: node --test lib/shim/storage/test/boot.test.mjs
 */

import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// The tree the gate walks: every TRACKED source file under lib/, apps/ and sdk/*/src/ (the
// places a browser host can live), minus tests. Tracked files only, so a build artifact that
// copies lib/ (apps/vscode-notebook/media, sdk/*/dist, apps/ide/dist) is never mistaken for a site.
const SOURCE_ROOTS = ['lib', 'apps', 'sdk/frqtl-sdk/src', 'sdk/egpt-math-sdk/src'];
function trackedSources() {
    const out = execFileSync('git', ['ls-files', '--', ...SOURCE_ROOTS], { cwd: repoRoot, encoding: 'utf8' });
    return out.split('\n').filter((f) => /\.(m?js|jsx|html)$/.test(f) && !/(^|\/)test\//.test(f));
}

function constructionSites(files) {
    const sites = [];
    for (const rel of files) {
        const abs = path.join(repoRoot, rel);
        if (!fs.existsSync(abs)) { continue; }
        fs.readFileSync(abs, 'utf8').split('\n').forEach((line) => {
            const code = line.replace(/\/\/.*$/, '');
            if (/^\s*\*/.test(line)) { return; }                 // JSDoc body
            if (/new\s+LocalStorageProvider\s*\(/.test(code)) { sites.push(rel); }
        });
    }
    return [...new Set(sites)];
}

test('ONE construction site: only lib/shim/storage/boot.js constructs a LocalStorageProvider (lib, apps, sdk/*/src)', function () {
    const files = trackedSources();
    assert.ok(files.some((f) => f.startsWith('apps/')), 'the walk reaches apps/');
    assert.ok(files.some((f) => f.startsWith('sdk/frqtl-sdk/src/')), 'the walk reaches sdk/frqtl-sdk/src/');
    assert.deepEqual(constructionSites(files), ['lib/shim/storage/boot.js']);
});

test('NEGATIVE CONTROL: a construction site planted under sdk/frqtl-sdk/src/ is caught', function () {
    const planted = 'sdk/frqtl-sdk/src/zz-planted-storage-site.html';
    fs.writeFileSync(path.join(repoRoot, planted), '<script type="module">\n  setActiveProvider(new LocalStorageProvider());\n</script>\n');
    try {
        assert.deepEqual(constructionSites([...trackedSources(), planted]).sort(),
            ['lib/shim/storage/boot.js', planted].sort());
    } finally {
        fs.unlinkSync(path.join(repoRoot, planted));
    }
});

function fakeLocalStorage({ blocked = false } = {}) {
    const m = new Map();
    return {
        get length() { return m.size; },
        key(i) { return [...m.keys()][i] ?? null; },
        getItem(k) { return m.has(k) ? m.get(k) : null; },
        setItem(k, v) { if (blocked) { throw new Error('SecurityError: blocked'); } m.set(k, String(v)); },
        removeItem(k) { m.delete(k); },
    };
}

const boot    = await import(path.join(repoRoot, 'lib/shim/storage/boot.js'));
const storage = await import(path.join(repoRoot, 'lib/shim/storage/index.js'));
const card    = await import(path.join(repoRoot, 'lib/components/run-once-card/index.js'));

let savedWindow;
beforeEach(() => { savedWindow = globalThis.window; storage.resetProvider(); });
afterEach(() => { if (savedWindow === undefined) { delete globalThis.window; } else { globalThis.window = savedWindow; } storage.resetProvider(); });

test('the outcome table is closed: installed, already-active, unavailable', function () {
    assert.deepEqual(boot.STORAGE_BOOT_OUTCOMES.map((r) => r.id), ['installed', 'already-active', 'unavailable']);
});

test('without any view module: boot installs localStorage and the card decides shown-first-visit, then suppressed-seen', async function () {
    globalThis.window = { localStorage: fakeLocalStorage() };
    assert.deepEqual(boot.bootLocalStorage(), { row: 'installed' });
    const first = await card.decideRunOnce('preset-compare');
    assert.equal(first.row, 'shown-first-visit');
    await card.markRunOnceSeen('preset-compare', first);
    assert.equal((await card.decideRunOnce('preset-compare')).row, 'suppressed-seen');
});

test('boot is idempotent and never replaces a provider a host already set', function () {
    globalThis.window = { localStorage: fakeLocalStorage() };
    const host = { get() { return null; }, put() {}, delete() {}, list() { return []; } };
    storage.setActiveProvider(host);
    assert.deepEqual(boot.bootLocalStorage(), { row: 'already-active' });
    assert.equal(storage.getProvider(), host);
});

test('blocked localStorage: boot reports unavailable with the reason, sets nothing, and the card records it', async function () {
    globalThis.window = { localStorage: fakeLocalStorage({ blocked: true }) };
    const r = boot.bootLocalStorage();
    assert.equal(r.row, 'unavailable');
    assert.match(r.detail, /write-blocked/);
    assert.equal(storage.peekProvider(), null);
    assert.equal((await card.decideRunOnce('preset-compare')).row, 'storage-unavailable-shown');
});

test('no window at all: unavailable, naming the absent localStorage', function () {
    delete globalThis.window;
    const r = boot.bootLocalStorage();
    assert.equal(r.row, 'unavailable');
    assert.match(r.detail, /not available/);
});

test('the boot record has ONE vocabulary: STORAGE_BOOT_ATTRS, written by recordStorageBoot', function () {
    assert.deepEqual(boot.STORAGE_BOOT_ATTRS, { row: 'data-storage-boot', detail: 'data-storage-boot-detail' });
    const attrs = new Map();
    const el = { setAttribute(k, v) { attrs.set(k, String(v)); }, removeAttribute(k) { attrs.delete(k); } };
    boot.recordStorageBoot(el, { row: 'unavailable', detail: 'blocked' });
    assert.deepEqual(Object.fromEntries(attrs), { 'data-storage-boot': 'unavailable', 'data-storage-boot-detail': 'blocked' });
    boot.recordStorageBoot(el, { row: 'installed' });
    assert.deepEqual(Object.fromEntries(attrs), { 'data-storage-boot': 'installed' }, 'a row without detail clears the old detail');
    assert.throws(() => boot.recordStorageBoot(el, { row: 'maybe' }), /STORAGE_BOOT_OUTCOMES/);
    assert.throws(() => boot.recordStorageBoot(null, { row: 'installed' }), /element/);
});
