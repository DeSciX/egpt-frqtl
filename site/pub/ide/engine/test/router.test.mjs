/* Copyright 2023-2026 by Essam Abadir */

/**
 * Tests for lib/shim/engine/router.js — the three-profile (DEV_CORE/DIST/CDN)
 * path-routing authority.
 *
 * ws-artifact-showcase Bite A1 (docs/design/frqtl-artifact-showcase-scoping-2026-07-10.md
 * §3b, §5.2): CDN_PROFILE is a DISTINCT third profile with absolute jsdelivr bases,
 * added alongside DEV_CORE_PROFILE/DIST_PROFILE — not a DIST_PROFILE parameterization.
 *
 * Test (a) — three-way profile-key parity (the module-load-time assertion doesn't
 *   throw importing the module; this test additionally asserts it structurally so a
 *   silent future refactor that swallows the throw is still caught).
 * Test (b) — CDN_PROFILE's pinned-version constants match the two sdk package.json
 *   versions (the "resolved from one constant" requirement + drift guard).
 * Test (c) — engineRouter({mode:'cdn'}) returns absolute jsdelivr URLs for every
 *   surface (wasmPkgUrl, resolve(), bootSrc(), engineScripts(), gameScripts(),
 *   mathSdkUrl/mathWasmUrl/notebookBase/vendorBase).
 * Test (d) — CDN_PROFILE's resolve() targets the SAME dist sub-path as DIST_PROFILE's
 *   resolve() for every non-private key (both profiles serve the identical physical
 *   sdk/frqtl-sdk/dist/ tree — a diverging sub-path is a real bug, not a style choice).
 * Test (e) — buildImportMap(manifest, cdnRouter.vendorBase) emits absolute CDN URLs
 *   (the "buildImportMap emits the CDN importmap" AC).
 * Test (f) — every CDN URL resolve() produces, once the CDN_BASE prefix is stripped,
 *   exists as a real file under the BUILT sdk/frqtl-sdk/dist/ (skips if dist/ absent —
 *   this repo's dist is gitignored; run `node build.js` first for this assertion to run).
 *   MANIFEST-DRIVEN (ws-artifact-showcase Bite A2 architect gate, 2026-07-10): iterates
 *   EVERY entry of GAME_LAYER_SCRIPTS + ENGINE_SHIM_CONTRACT_SCRIPTS, not a hand-picked
 *   handful — the pre-fix version of this test only checked 5 explicit paths
 *   (setupDoubleSlit/egpt-engine/quadtree/boot/wasm) and stayed GREEN while
 *   sdk/frqtl-sdk/build.js silently dropped ObjectFactory.js + Experiment.js from the
 *   dist (both canonical RUNNER_SCRIPTS, both consumed by the artifact-showcase ESM
 *   entry's GAME sequence) — a real 404/fail-loud-overlay render regression that
 *   `make verify` had NO signal for. This test is that signal.
 * Test (g) — the SAME guard extended to the ENGINE + RENDERER sequences (which
 *   have no separate canonical manifest — only the artifact-showcase ESM entry's
 *   own `buildScriptLists()`): imports that function DIRECTLY from the built
 *   dist/esm/index.js and checks every URL across ENGINE/RENDERER/GAME exists on
 *   disk. Added after a Rule-0 local-mirror run 404'd on
 *   `compat/providers/wasm-engine.js` / `compat/providers/wasm-load-browser.js` —
 *   a router key gap test (f) could not have caught (neither file is in
 *   GAME_LAYER_SCRIPTS or ENGINE_SHIM_CONTRACT_SCRIPTS).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

import {
    engineRouter,
    DEV_CORE_PROFILE,
    DIST_PROFILE,
    CDN_PROFILE,
    STATIC_PROFILE,
    CDN_SDK_VERSION,
    CDN_MATH_SDK_VERSION,
    CDN_BASE,
} from '../router.js';
import { buildImportMap } from '../../notebook/vendor-importmap.js';
import { GAME_LAYER_SCRIPTS } from '../game-layer-manifest.js';
import { ENGINE_SHIM_CONTRACT_SCRIPTS } from '../shim-contract-manifest.js';

// ENGINE_SHIM_CONTRACT_SCRIPTS entries are absolute '/lib/shim/...' literals (the
// shape stack-boot.js's ENGINE array hardcodes); the router's 'shim/' prefix key
// (added alongside CDN_PROFILE) expects the relative form. Same transform as
// sdk/frqtl-sdk/src/esm/index.js's buildShimContractScripts — kept in sync by
// this test importing the SAME canonical manifest, never a re-typed literal list.
const SHIM_ABS_PREFIX = '/lib/shim/';
function shimContractRelPaths() {
    return ENGINE_SHIM_CONTRACT_SCRIPTS.map((absPath) => {
        assert.ok(absPath.startsWith(SHIM_ABS_PREFIX), `unexpected shim-contract path shape: ${absPath}`);
        return 'shim/' + absPath.slice(SHIM_ABS_PREFIX.length);
    });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// lib/shim/engine/test → repo root is four levels up.
const ROOT = path.resolve(__dirname, '../../../..');

function nonPrivateKeys(profile) {
    return Object.keys(profile).filter((k) => !k.startsWith('__')).sort();
}

test('router: four-way profile-key parity (dev/dist/cdn/static)', () => {
    const dev = nonPrivateKeys(DEV_CORE_PROFILE);
    const dist = nonPrivateKeys(DIST_PROFILE);
    const cdn = nonPrivateKeys(CDN_PROFILE);
    const stat = nonPrivateKeys(STATIC_PROFILE);
    assert.deepEqual(dev, dist, 'DEV_CORE_PROFILE and DIST_PROFILE non-private keys must match');
    assert.deepEqual(dev, cdn, 'DEV_CORE_PROFILE and CDN_PROFILE non-private keys must match');
    assert.deepEqual(dev, stat, 'DEV_CORE_PROFILE and STATIC_PROFILE non-private keys must match');
    assert.ok(DEV_CORE_PROFILE.__vendorBase, '__vendorBase must be defined in DEV_CORE_PROFILE');
    assert.ok(DIST_PROFILE.__vendorBase, '__vendorBase must be defined in DIST_PROFILE');
    assert.ok(CDN_PROFILE.__vendorBase, '__vendorBase must be defined in CDN_PROFILE');
    assert.ok(STATIC_PROFILE.__vendorBase, '__vendorBase must be defined in STATIC_PROFILE');
});

test('router: CDN pinned-version constants match sdk package.json versions', () => {
    const frqtlPkg = JSON.parse(readFileSync(path.join(ROOT, 'sdk/frqtl-sdk/package.json'), 'utf8'));
    const mathPkg = JSON.parse(readFileSync(path.join(ROOT, 'sdk/egpt-math-sdk/package.json'), 'utf8'));
    assert.equal(
        CDN_SDK_VERSION, frqtlPkg.version,
        'CDN_SDK_VERSION in router.js is stale — bump it alongside sdk/frqtl-sdk/package.json#version at each publish'
    );
    assert.equal(
        CDN_MATH_SDK_VERSION, mathPkg.version,
        'CDN_MATH_SDK_VERSION in router.js is stale — bump it alongside sdk/egpt-math-sdk/package.json#version'
    );
});

test('router: mode=cdn returns absolute jsdelivr URLs', () => {
    const r = engineRouter({ mode: 'cdn', engine: 'wasm' });

    assert.equal(r.wasmPkgUrl, CDN_BASE + '/fat/pkg-web/egpt_wasm.js');
    assert.ok(r.vendorBase.startsWith('https://cdn.jsdelivr.net/'), 'vendorBase must be absolute');
    assert.ok(r.mathSdkUrl.startsWith('https://cdn.jsdelivr.net/'), 'mathSdkUrl must be absolute');
    assert.ok(r.notebookBase.startsWith('https://cdn.jsdelivr.net/'), 'notebookBase must be absolute');
    assert.equal(r.resolve('compat/egpt-engine.js'), CDN_BASE + '/js/compat/egpt-engine.js');
    assert.equal(r.resolve('objects/setup/setupDoubleSlit.js'), CDN_BASE + '/js/game/setup/setupDoubleSlit.js');
    // Rectangle — the sole spatial-rect authority, shipped from the game layer.
    assert.equal(r.resolve('objects/geometry/Rectangle.js'), CDN_BASE + '/js/game/geometry/Rectangle.js');
    // General experiments/ key resolves a whole experiment-page path; the more
    // specific experiments/_shared/ still wins (first-match order regression guard).
    assert.equal(r.resolve('experiments/tunnel-lab/index.html'), CDN_BASE + '/experiments/tunnel-lab/index.html');
    assert.equal(r.resolve('experiments/_shared/engine-boot.js'), CDN_BASE + '/experiments/_shared/engine-boot.js');
    assert.ok(r.bootSrc().startsWith(CDN_BASE), 'bootSrc must resolve under CDN_BASE');

    const scripts = r.engineScripts();
    assert.ok(Array.isArray(scripts) && scripts.length > 0);
    for (const s of scripts) {
        // Every non-empty script src must be absolute (or the deliberate rule-5 omission '').
        if (s.src !== '') {
            assert.ok(s.src.startsWith('https://cdn.jsdelivr.net/'), `engineScripts() entry not absolute: ${s.src}`);
        }
    }

    const gameScripts = r.gameScripts();
    assert.ok(Array.isArray(gameScripts) && gameScripts.length > 0);
    for (const s of gameScripts) {
        assert.ok(s.src.startsWith(CDN_BASE), `gameScripts() entry not under CDN_BASE: ${s.src}`);
    }
});

test('router: CDN_PROFILE resolves the SAME dist sub-path as DIST_PROFILE for every key', () => {
    // Both profiles serve the identical physical sdk/frqtl-sdk/dist/ tree — CDN_PROFILE
    // is DIST_PROFILE's relative navigation re-expressed as an absolute CDN join, anchored
    // at the same '../../' == dist/ root that DIST_PROFILE's page (dist/ide/shell/) sits
    // two levels under. Strip the '../../' prefix from DIST_PROFILE and the CDN_BASE + '/'
    // prefix from CDN_PROFILE — the remaining sub-path must be identical.
    for (const key of nonPrivateKeys(DIST_PROFILE)) {
        const distTarget = DIST_PROFILE[key];
        const cdnTarget = CDN_PROFILE[key];
        assert.ok(distTarget.startsWith('../../'), `DIST_PROFILE['${key}'] expected to start with '../../': ${distTarget}`);
        assert.ok(cdnTarget.startsWith(CDN_BASE + '/'), `CDN_PROFILE['${key}'] expected to start with CDN_BASE: ${cdnTarget}`);
        const distSubPath = distTarget.slice('../../'.length);
        const cdnSubPath = cdnTarget.slice((CDN_BASE + '/').length);
        assert.equal(cdnSubPath, distSubPath, `dist sub-path mismatch for key '${key}': dist='${distSubPath}' cdn='${cdnSubPath}'`);
    }
});

test('router: mode=static returns same-origin absolute /pub URLs', () => {
    const r = engineRouter({ mode: 'static', engine: 'wasm' });
    const BASE = '/pub';

    // Every base is same-origin absolute-from-root under /pub.
    assert.equal(r.wasmPkgUrl, BASE + '/fat/pkg-web/egpt_wasm.js');
    assert.equal(r.resolve('assets/vendor/monaco/vs'), BASE + '/js/lib/monaco/vs',
        'the observed Monaco 404 fix: monaco resolves same-origin under /pub, not /frqtl');
    assert.equal(r.resolve('compat/egpt-engine.js'), BASE + '/js/compat/egpt-engine.js');
    assert.equal(r.resolve('compat/providers/wasm-engine.js'), BASE + '/js/compat/wasm-engine.js');
    assert.equal(r.resolve('objects/setup/setupDoubleSlit.js'), BASE + '/js/game/setup/setupDoubleSlit.js');
    // Rectangle — the sole spatial-rect authority, shipped from the game layer.
    assert.equal(r.resolve('objects/geometry/Rectangle.js'), BASE + '/js/game/geometry/Rectangle.js');
    // General experiments/ key resolves a whole experiment-page path same-origin
    // under /pub; experiments/_shared/ still wins first-match (regression guard).
    assert.equal(r.resolve('experiments/tunnel-lab/index.html'), BASE + '/experiments/tunnel-lab/index.html');
    assert.equal(r.resolve('experiments/_shared/engine-boot.js'), BASE + '/experiments/_shared/engine-boot.js');
    assert.ok(r.bootSrc().startsWith(BASE + '/'), 'bootSrc must resolve under /pub');

    // The DELIBERATE divergence from CDN: math + notebook lanes are SAME-ORIGIN
    // under /pub (co-served), NOT cross-origin jsdelivr.
    assert.equal(r.mathSdkUrl, BASE + '/egpt-math-sdk/index.js');
    assert.equal(r.mathWasmUrl, BASE + '/egpt-math-sdk/wasm/egpt_math_sdk_wasm_bg.wasm');
    assert.equal(r.mathWasmModuleUrl, BASE + '/egpt-math-sdk/wasm/egpt_math_sdk_wasm.js');
    // Notebooks ride the frqtl-sdk dist's OWN copy, NOT under egpt-math-sdk (§A.3/§B.1).
    assert.equal(r.notebookBase, BASE + '/notebooks');
    assert.equal(r.vendorBase, BASE + '/vendor');
    for (const s of r.engineScripts()) {
        if (s.src !== '') {
            assert.ok(s.src.startsWith(BASE + '/'), `engineScripts() entry not same-origin /pub: ${s.src}`);
        }
    }
    for (const s of r.gameScripts()) {
        assert.ok(s.src.startsWith(BASE + '/'), `gameScripts() entry not same-origin /pub: ${s.src}`);
    }

    // opts.base override — a non-empty base re-anchors EVERY resolved URL (the
    // empty-string case is deliberately falsy → falls back to '/pub', mirroring
    // buildCdnProfile's `opts.base ?` guard).
    const rAlt = engineRouter({ mode: 'static', base: '/app/pub' });
    assert.equal(rAlt.resolve('compat/egpt-engine.js'), '/app/pub/js/compat/egpt-engine.js');
    assert.equal(rAlt.notebookBase, '/app/pub/notebooks');
    assert.equal(rAlt.mathSdkUrl, '/app/pub/egpt-math-sdk/index.js');
});

test('router: STATIC_PROFILE resolves the SAME dist sub-path as DIST_PROFILE for every shared key', () => {
    // STATIC_PROFILE serves the identical physical sdk/frqtl-sdk/dist/ tree as
    // DIST_PROFILE — it is DIST_PROFILE's relative '../../' navigation re-expressed
    // as a same-origin '/pub' join. Strip '../../' from DIST and '/pub/' from STATIC:
    // the remaining sub-path must be identical for every non-private (shared) key.
    // (The private math/notebook lanes DIVERGE by design — not asserted here.)
    const BASE = '/pub';
    for (const key of nonPrivateKeys(DIST_PROFILE)) {
        const distTarget = DIST_PROFILE[key];
        const staticTarget = STATIC_PROFILE[key];
        assert.ok(distTarget.startsWith('../../'), `DIST_PROFILE['${key}'] expected to start with '../../': ${distTarget}`);
        assert.ok(staticTarget.startsWith(BASE + '/'), `STATIC_PROFILE['${key}'] expected to start with '/pub/': ${staticTarget}`);
        const distSubPath = distTarget.slice('../../'.length);
        const staticSubPath = staticTarget.slice((BASE + '/').length);
        assert.equal(staticSubPath, distSubPath, `dist sub-path mismatch for key '${key}': dist='${distSubPath}' static='${staticSubPath}'`);
    }
});

test('router: buildImportMap(manifest, cdnRouter.vendorBase) emits absolute CDN import-map entries', () => {
    const manifestPath = path.join(ROOT, 'lib/frqtl/assets/vendor/manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const r = engineRouter({ mode: 'cdn' });
    const map = buildImportMap(manifest, r.vendorBase);

    assert.ok(map.imports && typeof map.imports === 'object');
    const specs = Object.keys(map.imports);
    assert.ok(specs.length > 0, 'manifest should list at least one lib');
    for (const spec of specs) {
        assert.ok(
            map.imports[spec].startsWith(CDN_BASE + '/vendor/'),
            `import-map entry for '${spec}' not under CDN vendor base: ${map.imports[spec]}`
        );
    }
});

test('router: CDN URL targets exist as real files in the built dist (skips if dist/ absent)', () => {
    const distDir = path.join(ROOT, 'sdk/frqtl-sdk/dist');
    if (!existsSync(distDir)) {
        // dist/ is a gitignored build artifact (verify:dist-is-artifact) — this
        // assertion only runs meaningfully after `node build.js`. Skip rather than
        // fail so a bare checkout of `make test-js` doesn't require a full build.
        console.log('[router.test] SKIP dist-file-existence checks — sdk/frqtl-sdk/dist/ not built');
        return;
    }
    const r = engineRouter({ mode: 'cdn' });
    const checks = [
        r.wasmPkgUrl,
        r.resolve('compat/egpt-engine.js'),
        r.resolve('objects/setup/setupDoubleSlit.js'),
        r.bootSrc(),
        // Full GAME_LAYER_SCRIPTS + ENGINE_SHIM_CONTRACT_SCRIPTS (manifest-driven,
        // not hand-picked — see this test's docstring §Test (f)).
        ...GAME_LAYER_SCRIPTS.map((p) => r.resolve(p)),
        ...shimContractRelPaths().map((p) => r.resolve(p)),
    ];
    for (const url of checks) {
        assert.ok(url.startsWith(CDN_BASE + '/'), `unexpected non-CDN URL: ${url}`);
        const relPath = url.slice((CDN_BASE + '/').length);
        const onDisk = path.join(distDir, relPath);
        assert.ok(existsSync(onDisk), `CDN URL target missing on disk: ${relPath} (resolved from ${url})`);
    }

    // Vendor import-map targets.
    const manifest = JSON.parse(readFileSync(path.join(ROOT, 'lib/frqtl/assets/vendor/manifest.json'), 'utf8'));
    const map = buildImportMap(manifest, r.vendorBase);
    for (const spec of Object.keys(map.imports)) {
        const relPath = map.imports[spec].slice((CDN_BASE + '/').length);
        const onDisk = path.join(distDir, relPath);
        assert.ok(existsSync(onDisk), `vendor import-map target missing on disk: ${relPath}`);
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (g) — the artifact-showcase ESM entry's OWN ENGINE/RENDERER/GAME sequences
// (ws-artifact-showcase Bite A2 architect gate 2026-07-10, tester finding): a
// jsdelivr-shaped local-mirror Rule-0 run 404'd on `compat/providers/wasm-engine.js`
// + `compat/providers/wasm-load-browser.js` — a router key gap (fixed above) test
// (f) did NOT cover, because test (f) only iterated GAME_LAYER_SCRIPTS +
// ENGINE_SHIM_CONTRACT_SCRIPTS, neither of which lists the ENGINE-base or
// RENDERER scripts (chroma/quadtree/wasm-engine/wasm-load-browser/egpt-engine;
// LightColor/RenderShape/RenderMesh/RenderTiers/FieldBuilder/p5-provider/Filters)
// — there is no separate canonical manifest for those, ONLY the ESM entry's own
// buildScriptLists(). Rather than re-typing that list a third time (the exact
// schema-mirror-drift class that caused the ObjectFactory/Experiment AND the
// compat/providers/ bugs), this test imports buildScriptLists DIRECTLY from the
// BUILT dist/esm/index.js and checks every URL it actually injects, across ALL
// THREE sequences (ENGINE, RENDERER, GAME) — the same data `bootDoubleSlit`
// itself uses, so it can never silently diverge from what the shell really does.
// ─────────────────────────────────────────────────────────────────────────────
test('router: every ARTIFACT-SHOWCASE injectSequence URL (ENGINE+RENDERER+GAME) exists on disk (skips if dist/ absent)', async () => {
    const distDir = path.join(ROOT, 'sdk/frqtl-sdk/dist');
    const esmEntryPath = path.join(distDir, 'esm/index.js');
    if (!existsSync(esmEntryPath)) {
        console.log('[router.test] SKIP artifact-showcase sequence checks — sdk/frqtl-sdk/dist/esm/index.js not built');
        return;
    }
    const { buildScriptLists, buildScriptListsFull } = await import(pathToFileURL(esmEntryPath).href);
    const r = engineRouter({ mode: 'cdn' });
    const missing = [];
    // Check BOTH the double-slit SUBSET (buildScriptLists → bootDoubleSlit) and
    // the full SUPERSET (buildScriptListsFull → bootScene). The superset adds the
    // FX/render-effect renderer layers (RenderTiers/renderCapabilities-common/
    // three-provider) + the full GAME_LAYER_SCRIPTS roster — every one of those
    // URLs must resolve on disk or bootScene fails-loud with no render.
    for (const [fnName, buildFn] of [['buildScriptLists', buildScriptLists], ['buildScriptListsFull', buildScriptListsFull]]) {
        assert.equal(typeof buildFn, 'function', `${fnName} must be exported from the built dist/esm/index.js`);
        const lists = buildFn(r);
        for (const seqName of ['ENGINE', 'RENDERER', 'GAME']) {
            const seq = lists[seqName];
            assert.ok(Array.isArray(seq) && seq.length > 0, `${fnName}().${seqName} must be a non-empty array`);
            for (const { src } of seq) {
                assert.ok(src.startsWith(CDN_BASE + '/'), `${fnName} ${seqName} entry not an absolute CDN URL: ${src}`);
                const relPath = src.slice((CDN_BASE + '/').length);
                const onDisk = path.join(distDir, relPath);
                if (!existsSync(onDisk)) {
                    missing.push(`${fnName} ${seqName}: ${relPath} (resolved from ${src})`);
                }
            }
        }
    }
    // The three.js runtime bootScene lazily loads when the three renderer is
    // selected is NOT in buildScriptListsFull (loaded at renderer-boot), so check
    // its vendored asset resolves on disk too — a 404 here = a blank 3D scene.
    for (const rel of ['assets/vendor/three.min.js']) {
        const src = r.resolve(rel);
        assert.ok(src.startsWith(CDN_BASE + '/'), `bootScene lazy asset not an absolute CDN URL: ${src}`);
        const onDisk = path.join(distDir, src.slice((CDN_BASE + '/').length));
        if (!existsSync(onDisk)) { missing.push(`bootScene-lazy: ${rel} (resolved from ${src})`); }
    }
    assert.deepEqual(
        missing,
        [],
        'These artifact-showcase injectSequence URLs are missing on disk (the shell would ' +
        'fail-loud, no render):\n' + missing.map((m) => '  ' + m).join('\n')
    );
});
