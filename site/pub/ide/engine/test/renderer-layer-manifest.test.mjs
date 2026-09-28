/* Copyright 2023-2026 by Essam Abadir */

/**
 * Parity test for lib/shim/engine/renderer-layer-manifest.js
 *
 * WHY THIS TEST EXISTS (the bug it would have caught):
 *   `RenderFamily.js` was added to stack-boot.js's RENDERER phase but NOT to the
 *   hand-copied renderer list in `sdk/frqtl-sdk/src/esm/index.js`
 *   (`buildScriptListsFull`). Dev (which boots through stack-boot) was fine; the
 *   DIST gallery — which boots through the ESM entry — loaded three-provider.js
 *   without RenderFamily, hit its fail-loud
 *   "canonical contract RenderFamily is unreachable (load order)" on every 3D
 *   tick, and rendered an empty black canvas. An "every URL exists on disk"
 *   check (router.test.mjs) is structurally blind to a MISSING entry, which is
 *   why this test asserts SET + ORDER against the manifest instead.
 *
 * Tests:
 *   (a) stack-boot.js's RENDERER literal === RENDERER_LAYER_SCRIPTS (order too).
 *   (b) every manifest path exists on disk under lib/frqtl/.
 *   (c) the load-order constraints the phase depends on hold in the manifest
 *       (RenderShape+RenderMesh before RenderFamily; RenderFamily and
 *       renderCapabilities-common before both providers).
 *   (d) the ESM entry DERIVES its renderer list from the manifest (source-static)
 *       — a re-typed literal list fails here.
 *   (e) dist parity, when built: buildScriptListsFull(router).RENDERER is exactly
 *       RENDERER_LAYER_SCRIPTS mapped through the same router. Skipped when
 *       sdk/frqtl-sdk/dist/esm/index.js is absent (mirrors router.test.mjs).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as pathResolve, dirname, join } from 'node:path';
import { stripJsComments } from './_source-text.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// lib/shim/engine/test/ → lib/shim/engine/ → lib/shim/ → lib/ → FRAQTL/
const SHIM_ENGINE_DIR = pathResolve(__dirname, '..');
const LIB_DIR         = pathResolve(__dirname, '../../..');
const REPO_ROOT       = pathResolve(LIB_DIR, '..');
const FRQTL_DIR       = pathResolve(LIB_DIR, 'frqtl');

const { RENDERER_LAYER_SCRIPTS } = await import(
    pathResolve(SHIM_ENGINE_DIR, 'renderer-layer-manifest.js')
);

/**
 * Extract the `_u('...')` paths from stack-boot.js's
 * `function _rendererList() { return [...]; }` (R2, ws-stackboot-dev-map SEAM RULING —
 * lazy list, called from inside the boot chain rather than a top-level `var`, so a
 * missing-map throw rejects into the chain's one .catch instead of aborting at
 * script-parse time). Comment-stripped: a commented-out `_u('…')` row is not a
 * loaded script.
 */
function parseStackBootRendererPaths() {
    const src = stripJsComments(readFileSync(
        pathResolve(LIB_DIR, 'frqtl/experiments/_shared/stack-boot.js'),
        'utf8'
    ));
    const block = src.match(/function\s+_rendererList\s*\(\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
    if (!block) {
        throw new Error('[test] Could not find `function _rendererList() { return [...]; }` block in stack-boot.js');
    }
    const paths = [];
    const re = /_u\('([^']+)'\)/g;
    let m;
    while ((m = re.exec(block[1])) !== null) { paths.push(m[1]); }
    return paths;
}

// ─────────────────────────────────────────────────────────────────────────────
test('(a) stack-boot.js RENDERER paths match RENDERER_LAYER_SCRIPTS in exact order', () => {
    const stackBootPaths = parseStackBootRendererPaths();
    assert.deepEqual(
        stackBootPaths,
        RENDERER_LAYER_SCRIPTS,
        'stack-boot.js RENDERER array diverges from renderer-layer-manifest.js.\n' +
        'Update stack-boot.js to mirror the manifest exactly (order matters:\n' +
        'RenderShape/RenderMesh before RenderFamily; RenderFamily before three-provider).\n' +
        'stack-boot: ' + JSON.stringify(stackBootPaths) + '\n' +
        'manifest:   ' + JSON.stringify(RENDERER_LAYER_SCRIPTS)
    );
});

// ─────────────────────────────────────────────────────────────────────────────
test('(b) every RENDERER_LAYER_SCRIPTS path exists on disk under lib/frqtl/', () => {
    const missing = RENDERER_LAYER_SCRIPTS
        .filter((p) => !existsSync(join(FRQTL_DIR, p)))
        .map((p) => p + ' (expected at: ' + join(FRQTL_DIR, p) + ')');
    assert.deepEqual(missing, [],
        'These RENDERER_LAYER_SCRIPTS paths do not exist on disk:\n' + missing.join('\n'));
});

// ─────────────────────────────────────────────────────────────────────────────
test('(c) the eval-time load-order constraints hold inside the manifest', () => {
    const idx = (p) => {
        const i = RENDERER_LAYER_SCRIPTS.indexOf(p);
        assert.notEqual(i, -1, `${p} must be in RENDERER_LAYER_SCRIPTS`);
        return i;
    };
    const shape  = idx('compat/renderer/RenderShape.js');
    const mesh   = idx('compat/renderer/RenderMesh.js');
    const family = idx('compat/renderer/RenderFamily.js');
    const caps   = idx('compat/renderer/renderCapabilities-common.js');
    const p5     = idx('compat/renderer/providers/p5-provider.js');
    const three  = idx('compat/renderer/providers/three-provider.js');

    // RenderFamily.js ferries window.RenderShape / window.RenderMesh at module-eval
    // time and THROWS if either is absent (fail-loud, not a fallback).
    assert.ok(shape < family && mesh < family,
        'RenderFamily.js must load AFTER RenderShape.js and RenderMesh.js');
    // three-provider fails loud per-tick when window.RenderFamily is undefined —
    // the exact defect that blanked every 3D scene in the dist.
    assert.ok(family < three,
        'RenderFamily.js must load BEFORE three-provider.js');
    // Both providers resolve window.RenderCapabilitiesCommon at call time, which a
    // page's onReady → makeControlsForRenderSurface can reach immediately.
    assert.ok(caps < p5 && caps < three,
        'renderCapabilities-common.js must load BEFORE both providers');
});

// ─────────────────────────────────────────────────────────────────────────────
test('(d) the SDK ESM entry DERIVES its renderer list from the manifest', () => {
    const src = stripJsComments(readFileSync(
        pathResolve(REPO_ROOT, 'sdk/frqtl-sdk/src/esm/index.js'), 'utf8'));
    assert.match(src, /import\s*\{\s*RENDERER_LAYER_SCRIPTS\s*\}\s*from\s*'[^']*renderer-layer-manifest\.js'/,
        'sdk/frqtl-sdk/src/esm/index.js must import RENDERER_LAYER_SCRIPTS from the manifest');
    assert.match(src, /RENDERER_LAYER_SCRIPTS\.map\(/,
        'buildScriptListsFull must MAP the manifest — a re-typed renderer list is the ' +
        'roster-mirror drift that dropped RenderFamily.js from the dist');
    // The full-stack builder must not re-list renderer paths by hand. The ONE
    // sanctioned hand list is buildScriptLists' deliberate double-slit p5 SUBSET,
    // so we scope this to the buildScriptListsFull body.
    const fullBody = src.slice(src.indexOf('export function buildScriptListsFull'));
    assert.equal(/router\.resolve\('compat\/renderer\//.test(fullBody), false,
        'buildScriptListsFull must not hand-resolve any compat/renderer/ path — ' +
        'the manifest is the single authority for the RENDERER phase');
});

// ─────────────────────────────────────────────────────────────────────────────
test('(e) built dist ESM buildScriptListsFull().RENDERER === manifest (skips if dist absent)', async () => {
    const esmEntry = pathResolve(REPO_ROOT, 'sdk/frqtl-sdk/dist/esm/index.js');
    if (!existsSync(esmEntry)) {
        console.log('[renderer-layer-manifest.test] SKIP dist parity — sdk/frqtl-sdk/dist/esm/index.js not built');
        return;
    }
    const { buildScriptListsFull } = await import(pathToFileURL(esmEntry).href);
    assert.equal(typeof buildScriptListsFull, 'function',
        'buildScriptListsFull must be exported from the built dist/esm/index.js');
    const { engineRouter } = await import(
        pathToFileURL(pathResolve(SHIM_ENGINE_DIR, 'router.js')).href);
    const router = engineRouter({ mode: 'dist' });
    const actual   = buildScriptListsFull(router).RENDERER.map((s) => s.src);
    const expected = RENDERER_LAYER_SCRIPTS.map((p) => router.resolve(p));
    assert.deepEqual(actual, expected,
        'the BUILT ESM entry injects a renderer sequence that is not the manifest — ' +
        'rebuild the dist (node sdk/frqtl-sdk/build.js) or fix src/esm/index.js');
});
