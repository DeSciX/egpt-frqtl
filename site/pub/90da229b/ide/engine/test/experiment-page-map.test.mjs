/* Copyright 2023-2026 by Essam Abadir */
/**
 * experiment-page-map.test.mjs — ws-stackboot-dev-map (architect review §Q1).
 *
 * `spliceEnginePathMap` is the ONE `window._egptEnginePathMap` injection contract —
 * `sdk/frqtl-sdk/build.js` (dist/static, build time) and
 * `lib/server/frqtl-experiment-path-map.js` (dev-core, request time) both call it, so the
 * anchor regex and emitted tag exist in exactly one place.
 *
 * Test groups:
 *   (a) unit — splice placement, `defaultEngine` option, byte-identical projection.
 *   (b) pass-through — a page with no `_shared/stack-boot.js` reference is unchanged.
 *   (c) FAIL-LOUD — a page that loads stack-boot.js but carries no anchor THROWS.
 *   (d) CONFORMANCE (the deliverable) — every `.html` under `lib/frqtl/experiments/**`
 *       that loads stack-boot.js carries the anchor, driven off the REAL files on disk.
 *   (e) NEGATIVE CONTROL — the SAME conformance check, with the anchor stripped from a
 *       real page's content in memory, actually goes RED (proves the gate can fail, not
 *       just pass trivially — "a gate that cannot fail is not a gate").
 *
 * Run: node --test lib/shim/engine/test/experiment-page-map.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '..', '..', '..', '..');

const { spliceEnginePathMap, WASM_PKG_URL_ANCHOR, STACK_BOOT_SCRIPT_TAG } = await import(
    path.join(repoRoot, 'lib/shim/engine/experiment-page-map.js')
);
const { DEV_CORE_PROFILE, DIST_PROFILE, buildBrowserPathMap } = await import(
    path.join(repoRoot, 'lib/shim/engine/router.js')
);

const EXPERIMENTS_DIR = path.join(repoRoot, 'lib/frqtl/experiments');

function stackBootPage() {
    return '<html><head></head><body>\n' +
        '    <script>window._egptWasmPkgUrl = new URL("../../../fat/pkg-web/egpt_wasm.js", document.baseURI).href;</script>\n' +
        '    <script src="../_shared/stack-boot.js"></script>\n' +
        '</body></html>';
}

describe('spliceEnginePathMap — unit (a)', () => {
    test('injects window._egptEnginePathMap immediately before the window._egptWasmPkgUrl anchor', () => {
        const html = stackBootPage();
        const out = spliceEnginePathMap(html, DEV_CORE_PROFILE);
        const expectedJson = JSON.stringify(buildBrowserPathMap(DEV_CORE_PROFILE));
        const injectIdx = out.indexOf('window._egptEnginePathMap = ' + expectedJson + ';');
        const anchorIdx = out.indexOf('window._egptWasmPkgUrl');
        assert.ok(injectIdx !== -1, 'the exact buildBrowserPathMap(profile) projection is spliced in — no second derivation');
        assert.ok(injectIdx < anchorIdx, 'the map is injected BEFORE the _egptWasmPkgUrl anchor (and therefore before stack-boot.js runs)');
    });

    test('opts.defaultEngine adds window._egptDefaultEngine on the SAME injected <script> tag, ahead of the map', () => {
        const out = spliceEnginePathMap(stackBootPage(), DIST_PROFILE, { defaultEngine: 'wasm' });
        // Byte-identical to the pre-refactor build.js emission (see git history of
        // sdk/frqtl-sdk/build.js::rewriteExperimentHtml step (a)).
        assert.match(out, /<script>window\._egptDefaultEngine = "wasm";\n {4}window\._egptEnginePathMap = /);
    });

    test('no opts.defaultEngine → no window._egptDefaultEngine assignment emitted', () => {
        const out = spliceEnginePathMap(stackBootPage(), DEV_CORE_PROFILE);
        assert.doesNotMatch(out, /_egptDefaultEngine/);
    });

    test('the injected JSON is byte-identical to JSON.stringify(buildBrowserPathMap(profile)) — one projection, not a second derivation', () => {
        const out = spliceEnginePathMap(stackBootPage(), DEV_CORE_PROFILE);
        const m = /window\._egptEnginePathMap = (\{.*?\});<\/script>/.exec(out);
        assert.ok(m, 'a JSON object literal was spliced in');
        assert.deepEqual(JSON.parse(m[1]), buildBrowserPathMap(DEV_CORE_PROFILE));
    });
});

describe('spliceEnginePathMap — pass-through (b)', () => {
    test('a page with no _shared/stack-boot.js reference is returned UNCHANGED', () => {
        const html = '<html><head></head><body><p>plain iframe host, no engine boot here</p></body></html>';
        const out = spliceEnginePathMap(html, DEV_CORE_PROFILE);
        assert.equal(out, html, 'targeted splice — never a blanket rewrite');
    });
});

describe('spliceEnginePathMap — FAIL-LOUD (c)', () => {
    test('a page that loads _shared/stack-boot.js but has no window._egptWasmPkgUrl anchor THROWS', () => {
        const html = '<html><head></head><body>\n' +
            '    <script src="../_shared/stack-boot.js"></script>\n' +
            '</body></html>';
        assert.throws(
            () => spliceEnginePathMap(html, DEV_CORE_PROFILE),
            /loads _shared\/stack-boot\.js but has no.*anchor/s,
            'a stack-boot page with no anchor would ship/serve map-less and throw in the browser anyway — surface it here instead'
        );
    });
});

describe('spliceEnginePathMap — CONFORMANCE off the real pages (d)', () => {
    const ids = fs.readdirSync(EXPERIMENTS_DIR, { withFileTypes: true })
        .filter((e) => e.isDirectory() && e.name !== '_shared')
        .map((e) => e.name);

    test('sanity: there are experiment directories to check, and at least one is a stack-boot page', () => {
        assert.ok(ids.length > 0);
    });

    for (const id of ids) {
        const dir = path.join(EXPERIMENTS_DIR, id);
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
            const raw = fs.readFileSync(path.join(dir, file), 'utf8');
            if (!STACK_BOOT_SCRIPT_TAG.test(raw)) { continue; } // e.g. collision-matrix/panel-demo.html — not a subject
            test(id + '/' + file + ' — loads stack-boot.js AND carries the anchor', () => {
                assert.match(raw, WASM_PKG_URL_ANCHOR, id + '/' + file + ' loads stack-boot.js but has no _egptWasmPkgUrl anchor');
                assert.doesNotThrow(() => spliceEnginePathMap(raw, DEV_CORE_PROFILE), id + '/' + file);
            });
        }
    }
});

describe('spliceEnginePathMap — NEGATIVE CONTROL: the conformance check actually fails on a broken page (e)', () => {
    test('stripping the anchor from a REAL page (in memory) makes the SAME check go RED', () => {
        const raw = fs.readFileSync(path.join(EXPERIMENTS_DIR, 'empty', 'index.html'), 'utf8');
        assert.match(raw, STACK_BOOT_SCRIPT_TAG, 'premise: empty/index.html really does load stack-boot.js');
        assert.match(raw, WASM_PKG_URL_ANCHOR, 'premise: it really does carry the anchor today');

        const broken = raw.replace(WASM_PKG_URL_ANCHOR, '<script>/* anchor removed by the negative control */');
        assert.doesNotMatch(broken, WASM_PKG_URL_ANCHOR, 'premise: the anchor is genuinely gone from the broken copy');
        assert.match(broken, STACK_BOOT_SCRIPT_TAG, 'premise: it still loads stack-boot.js (still a subject)');

        assert.throws(
            () => spliceEnginePathMap(broken, DEV_CORE_PROFILE),
            /anchor/,
            'the conformance check (d) would catch this — it is not a check that always passes'
        );
    });
});
