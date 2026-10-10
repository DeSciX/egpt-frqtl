/* Copyright 2023-2026 by Essam Abadir */

/**
 * shim-contract-manifest.test.mjs — WS gym-controls-as-sugar Bite 3 item 6.
 *
 * Parity test for lib/shim/engine/shim-contract-manifest.js, mirroring the
 * pre-existing game-layer-manifest.test.mjs pattern:
 *
 *   (a) stack-boot.js's ENGINE array contains the `/lib/shim/...` entries in
 *       ENGINE_SHIM_CONTRACT_SCRIPTS, in EXACT relative order (other, non-
 *       shim ENGINE entries — chroma, quadtree, EGPTfrqtl, wasm-*, egpt-engine
 *       — may freely interleave; only the RELATIVE order among the shim
 *       entries is asserted, since that is the only order this manifest
 *       governs).
 *   (b) every manifest path exists on disk.
 *   (c) THE STRUCTURAL GUARANTEE that closes the pre-existing unguarded
 *       frame-data-before-RenderShape order dependency: stack-boot.js's own
 *       `_seq(ENGINE).then(() => _seq(RENDERER))` composition is present —
 *       i.e. the ENGINE array (which frame-data/index.js rides) is
 *       structurally guaranteed to fully resolve before the RENDERER array
 *       (which RenderShape.js rides) ever starts. This was previously true
 *       by construction but had NO test asserting it; this test makes a
 *       regression (e.g. someone flattening ENGINE+RENDERER into one array,
 *       or racing them with Promise.all) a CI failure.
 *
 * Run: node --test lib/shim/engine/test/shim-contract-manifest.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as pathResolve, dirname, join } from 'node:path';
import { stripJsComments } from './_source-text.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// lib/shim/engine/test/ → lib/shim/engine/ → lib/shim/ → lib/ → FRAQTL/
const SHIM_ENGINE_DIR = pathResolve(__dirname, '..');
const LIB_DIR         = pathResolve(__dirname, '../../..');
const REPO_ROOT       = pathResolve(LIB_DIR, '..');

const { ENGINE_SHIM_CONTRACT_SCRIPTS } = await import(
    pathResolve(SHIM_ENGINE_DIR, 'shim-contract-manifest.js')
);

/**
 * stack-boot.js source, COMMENT-STRIPPED (shared `stripJsComments`): prose naming
 * `_seq(ENGINE)` and commented-out roster rows must satisfy no match here.
 */
function stackBootSrc() {
    return stripJsComments(readFileSync(
        pathResolve(LIB_DIR, 'frqtl/experiments/_shared/stack-boot.js'), 'utf8'
    ));
}

// Extract the ENGINE array block and pull out every shim-contract src, in the
// order they appear, reconstructing the canonical `/lib/shim/...` manifest form.
// As of ws-egpt-frqtl-site-deploy (static-host follow-on) these entries are
// router-driven `src: _u('shim/...')` calls — NOT the former absolute-path
// literals `src: '/lib/shim/...'` — so stack-boot resolves them to the copied
// dist/ide/ tree on a static host (dev-core still yields '/lib/shim/...' via
// _u()'s shim fallback). The manifest (ENGINE_SHIM_CONTRACT_SCRIPTS) remains the
// canonical '/lib/shim/...' absolute form (also consumed by router.test.mjs's
// shimContractRelPaths() and the esm entry's buildShimContractScripts), so the
// `shim/X` _u() arg is mapped back to `/lib/shim/X` for the parity comparison.
// R2 (ws-stackboot-dev-map SEAM RULING) made the list LAZY —
// `function _engineList() { return [...]; }`, called from inside the boot chain,
// not a top-level `var`.
function parseEngineShimEntries() {
    const src = stackBootSrc();
    const m = src.match(/function\s+_engineList\s*\(\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
    if (!m) {
        throw new Error('[test] Could not find `function _engineList() { return [...]; }` block in stack-boot.js');
    }
    const block = m[1];
    const re = /src:\s*_u\('shim\/([^']+)'\)/g;
    const out = [];
    let mm;
    while ((mm = re.exec(block)) !== null) { out.push('/lib/shim/' + mm[1]); }
    return out;
}

describe('shim-contract-manifest — ENGINE array parity (Bite 3 item 6)', function () {
    test('(a) stack-boot.js ENGINE array /lib/shim/ entries match ENGINE_SHIM_CONTRACT_SCRIPTS in exact order', function () {
        const found = parseEngineShimEntries();
        assert.deepEqual(
            found,
            ENGINE_SHIM_CONTRACT_SCRIPTS,
            'stack-boot.js ENGINE array\'s /lib/shim/ entries diverge from ' +
            'shim-contract-manifest.js ENGINE_SHIM_CONTRACT_SCRIPTS.\n' +
            'found:    ' + JSON.stringify(found) + '\n' +
            'manifest: ' + JSON.stringify(ENGINE_SHIM_CONTRACT_SCRIPTS)
        );
    });

    test('(b) every ENGINE_SHIM_CONTRACT_SCRIPTS path exists on disk', function () {
        const missing = [];
        for (const p of ENGINE_SHIM_CONTRACT_SCRIPTS) {
            // '/lib/shim/...' is served at the repo-root-relative 'lib/shim/...' path.
            const abs = join(REPO_ROOT, p.replace(/^\//, ''));
            if (!existsSync(abs)) { missing.push(p + ' (expected at: ' + abs + ')'); }
        }
        assert.deepEqual(missing, [], 'These ENGINE_SHIM_CONTRACT_SCRIPTS paths do not exist on disk:\n' +
            missing.map(function (p) { return '  ' + p; }).join('\n'));
    });

    test('(c) controls/index.js precedes controls/registry.js (registry\'s _getControlsSchema() reads window.ControlsSchema)', function () {
        const idx = ENGINE_SHIM_CONTRACT_SCRIPTS.indexOf('/lib/shim/controls/index.js');
        const reg = ENGINE_SHIM_CONTRACT_SCRIPTS.indexOf('/lib/shim/controls/registry.js');
        assert.ok(idx !== -1 && reg !== -1, 'both controls entries must be present');
        assert.ok(idx < reg, 'controls/index.js must precede controls/registry.js');
    });

    test('(c) THE STRUCTURAL GUARANTEE: stack-boot.js chains _seq(_engineList()) -> .then(_seq(_rendererList())) — ENGINE (frame-data) always fully resolves before RENDERER (RenderShape) starts', function () {
        // stackBootSrc() is already comment-stripped, so a docstring mentioning
        // "_seq(_engineList())" in prose cannot false-positive this structural check.
        // R2 (ws-stackboot-dev-map SEAM RULING): the ENGINE/RENDERER lists are built
        // LAZILY inside the chain (functions, not top-level `var`s) so a missing-map
        // throw rejects into the chain's one .catch instead of aborting at
        // script-parse time — the ENGINE-then-RENDERER ORDERING guarantee this test
        // exists for is unchanged, only the literal spelling of the two calls moved.
        const stripped = stackBootSrc();
        const engineIdx = stripped.indexOf('_seq(_engineList())');
        const rendererCallIdx = stripped.search(/\.then\(\s*function\s*\(\s*\)\s*\{\s*return\s+_seq\(_rendererList\(\)\)/);
        assert.ok(engineIdx !== -1,
            'stack-boot.js must kick off the ENGINE list via _seq(_engineList())');
        assert.ok(rendererCallIdx !== -1,
            'stack-boot.js must chain _seq(_rendererList()) via a .then() (never ' +
            'Promise.all/parallel) — this is the structural guarantee that ' +
            'frame-data/index.js (ENGINE) always precedes RenderShape.js (RENDERER), ' +
            'closing the previously-unguarded gap.');
        assert.ok(engineIdx < rendererCallIdx,
            '_seq(_engineList()) must appear BEFORE the .then(_seq(_rendererList())) chain link');
        // No Promise.all combining the two axes anywhere in the file.
        assert.ok(!/Promise\.all\(\s*\[[^\]]*_engineList/.test(stripped),
            'ENGINE must never be raced with RENDERER via Promise.all');
    });
});
