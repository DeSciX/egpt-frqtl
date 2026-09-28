/* Copyright 2023-2026 by Essam Abadir */

/**
 * renderer-stack-wiring.test.mjs — the RENDERER-array analogue of
 * `game-layer-manifest.test.mjs`'s Test (a) (WS Studio Controls Realignment
 * S5b fix-loop; tester finding: `renderCapabilities-common.js` was required
 * at call-time via `window.RenderCapabilitiesCommon` by both providers but
 * had NO entry in stack-boot.js's `RENDERER` script array — Studio degraded
 * silently to "no render controls"; every fx-family page hard-failed with the
 * FAIL-LOUD "RenderCapabilitiesCommon is unreachable" overlay, because
 * `fx-experiment.js` calls `makeControlsForRenderSurface` synchronously with
 * no try/catch).
 *
 * Unlike `GAME_LAYER_SCRIPTS`/`ENGINE_SHIM_CONTRACT_SCRIPTS`, the `RENDERER`
 * array has no second ESM-manifest consumer to stay in lock-step with (no
 * AuthorView-style "derive my own script list from the manifest" caller reads
 * a renderer manifest) — `stack-boot.js` IS the sole authority for what loads.
 * So the guard here is DIRECT rather than a parity-against-a-twin-array check:
 * every top-level `.js` file under `lib/frqtl/compat/renderer/` (siblings of
 * `providers/`, `test/`) or `lib/frqtl/compat/renderer/providers/` that
 * installs a `window.<Name>` global MUST have a corresponding `{ src:
 * _u('compat/renderer/...') }` entry in stack-boot.js's `RENDERER` array —
 * this is the THIRD occurrence of the same defect class (a file exists,
 * installs a window global another file resolves at call time, but was never
 * added to the loader array) after the GAME-array Box/OvenBox/CircuitGate
 * incident and the ENGINE-array shim-contract gap; this test is meant to be
 * the LAST one, generalizing the discipline to the one remaining unguarded
 * script array.
 *
 * Run: node --test lib/shim/engine/test/renderer-stack-wiring.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as pathResolve, dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// lib/shim/engine/test/ → lib/shim/engine/ → lib/shim/ → lib/ → FRAQTL/
const LIB_DIR      = pathResolve(__dirname, '../../..');
const RENDERER_DIR = pathResolve(LIB_DIR, 'frqtl/compat/renderer');
const STACK_BOOT    = pathResolve(LIB_DIR, 'frqtl/experiments/_shared/stack-boot.js');

// ── Helper: extract the set of window.<Name> assignments in a file ──────────
// Mirrors game-layer-manifest.test.mjs's own extractWindowInstalls exactly
// (same convention, same file family — never re-derive independently).
function extractWindowInstalls(filePath) {
    const src = readFileSync(filePath, 'utf8');
    const installed = new Set();
    const re = /window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        installed.add(m[1]);
    }
    return installed;
}

// ── Enumerate the candidate files: top-level compat/renderer/*.js + ─────────
//    compat/renderer/providers/*.js (never test/ — those are node --test
//    files, never <script>-tag-loaded on an experiment page).
function enumerateRendererSourceFiles() {
    const files = [];
    for (const name of readdirSync(RENDERER_DIR)) {
        if (name.endsWith('.js')) {
            files.push({ abs: join(RENDERER_DIR, name), rel: 'compat/renderer/' + name });
        }
    }
    const providersDir = join(RENDERER_DIR, 'providers');
    for (const name of readdirSync(providersDir)) {
        if (name.endsWith('.js')) {
            files.push({ abs: join(providersDir, name), rel: 'compat/renderer/providers/' + name });
        }
    }
    return files;
}

// ── Parse stack-boot.js's RENDERER array — same _u('...') extraction as ─────
//    game-layer-manifest.test.mjs's parseStackBootGamePaths, applied to the
//    RENDERER block instead of GAME. R2 (ws-stackboot-dev-map SEAM RULING) made
//    the list LAZY — `function _rendererList() { return [...]; }`, called from
//    inside the boot chain, not a top-level `var`.
function parseStackBootRendererPaths() {
    const src = readFileSync(STACK_BOOT, 'utf8');
    const m = src.match(/function\s+_rendererList\s*\(\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
    if (!m) {
        throw new Error('[test] Could not find `function _rendererList() { return [...]; }` block in stack-boot.js');
    }
    const block = m[1];
    const paths = [];
    const re = /_u\('([^']+)'\)/g;
    let mm;
    while ((mm = re.exec(block)) !== null) {
        paths.push(mm[1]);
    }
    return paths;
}

test('every compat/renderer *.js file exists on disk (sanity)', () => {
    const files = enumerateRendererSourceFiles();
    assert.ok(files.length > 0, 'expected at least one compat/renderer source file');
    for (const f of files) {
        assert.ok(existsSync(f.abs), f.rel + ' does not exist at ' + f.abs);
    }
});

test('every window.* install under compat/renderer/ has a stack-boot.js RENDERER entry', () => {
    const rendererPaths = new Set(parseStackBootRendererPaths());
    const files = enumerateRendererSourceFiles();
    const missing = [];
    for (const f of files) {
        const installs = extractWindowInstalls(f.abs);
        if (installs.size === 0) { continue; } // a file with no window.* export needs no loader entry
        if (!rendererPaths.has(f.rel)) {
            missing.push(f.rel + ' (installs window.' + [...installs].join(', window.') + ')');
        }
    }
    assert.deepEqual(
        missing,
        [],
        'These compat/renderer files install a window.* global consumed at call time by ' +
        'another compat/renderer file, but have NO entry in stack-boot.js\'s RENDERER array ' +
        '(the exact S5b regression class — a provider\'s _resolveXxx() throws ' +
        '"Xxx is unreachable (load order)" at the FIRST call site that actually invokes it):\n' +
        missing.map((p) => '  ' + p).join('\n') +
        '\nFix: add `{ src: _u(\'' + (missing[0] || '?').split(' ')[0] + '\') }` to the RENDERER ' +
        'array in lib/frqtl/experiments/_shared/stack-boot.js (before the two provider entries, ' +
        'per the RenderShape.js/RenderCapabilitiesCommon ordering precedent if the new file is a ' +
        'dependency the providers resolve; anywhere in the array otherwise — order only matters ' +
        'for files consulted at MODULE-EVAL time, never for the common lazy _resolveXxx() pattern).'
    );
});

test('every stack-boot.js RENDERER path exists on disk', () => {
    const src = readFileSync(STACK_BOOT, 'utf8');
    const m = src.match(/function\s+_rendererList\s*\(\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
    const block = m[1];
    // RENDERER entries mix _u('compat/renderer/...') and _u('objects/constants/...')
    // (LightColor.js) — resolve every _u('...') argument relative to lib/frqtl/,
    // not just the compat/renderer-scoped subset the other two tests check.
    const FRQTL_DIR = pathResolve(LIB_DIR, 'frqtl');
    const re = /_u\('([^']+)'\)/g;
    const missing = [];
    let mm;
    while ((mm = re.exec(block)) !== null) {
        const abs = join(FRQTL_DIR, mm[1]);
        if (!existsSync(abs)) { missing.push(mm[1] + ' (expected at: ' + abs + ')'); }
    }
    assert.deepEqual(missing, [], 'These RENDERER array paths do not exist on disk:\n' +
        missing.map((p) => '  ' + p).join('\n'));
});
