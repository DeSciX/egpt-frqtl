/* Copyright 2023-2026 by Essam Abadir */

/**
 * Parity test for lib/shim/engine/game-layer-manifest.js
 *
 * DESIGN: The manifest is the single source of truth for which game-layer
 * object scripts load. stack-boot.js and router.js must stay in lock-step.
 * This test enforces that and provides a compile-time gate against sugar-getter
 * drift (the root cause of the "[frqtl] sugar object OvenBox/CircuitGate is not
 * available" notebook error).
 *
 * Test (a) — THE LOAD-BEARING ASSERTION: every shim sugar getter name is backed
 * by a file in OBJECT_SCRIPTS that installs window.<Name>. This test was RED on
 * the pre-fix tree (Box, OvenBox, CircuitGate missing from stack-boot's GAME
 * array) and GREEN after. Confirmed by running the test on the original stack-
 * boot GAME array (14 entries, missing Box/OvenBox/CircuitGate) vs the fixed
 * array (19 entries including all three). The pre-fix GAME array produced:
 *   ✗ OBJECT_SCRIPTS installs 'Box' but sugar getter 'Box' has no backing entry
 * because Box.js was absent from GAME. The post-fix array installs all 15 entries.
 *
 * Test (b) — stack-boot GAME paths === GAME_LAYER_SCRIPTS (sequence, order).
 *
 * Test (c) — every manifest path exists on disk under lib/frqtl/.
 *
 * Test (d) — AuthorView DERIVES its game-layer script list from the manifest.
 *
 * Every source match below runs against COMMENT-STRIPPED text (shared
 * `stripJsComments`): a commented-out `window.Foo = Foo;` or `_u('…')` row names
 * nothing that loads.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve as pathResolve, dirname, join } from 'node:path';
import { stripJsComments } from './_source-text.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Path constants ────────────────────────────────────────────────────────────
// lib/shim/engine/test/ → lib/shim/engine/ → lib/shim/ → lib/ → FRAQTL/
const SHIM_ENGINE_DIR = pathResolve(__dirname, '..');
const LIB_DIR         = pathResolve(__dirname, '../../..');
const FRQTL_DIR       = pathResolve(LIB_DIR, 'frqtl'); // lib/frqtl

// ── Load the manifest under test ─────────────────────────────────────────────
const { OBJECT_SCRIPTS, RUNNER_SCRIPTS, GAME_LAYER_SCRIPTS } = await import(
    pathResolve(SHIM_ENGINE_DIR, 'game-layer-manifest.js')
);

// ── Shim sugar getter names (from lib/shim/runtime/index.js lines 185-198) ───
// Excludes 'Frame' (engine global, not an OBJECT_SCRIPTS file) and
// 'FrqtlApp' (part of RUNNER_SCRIPTS, not OBJECT_SCRIPTS).
// 'Universe' is also excluded (it reads window.EGPTUniverse, not a sugar getter
// backed by an OBJECT_SCRIPTS file).
const SUGAR_GETTER_NAMES = [
    'PointSource',
    'LargeObject',
    'Wall',
    'QuantumEmitter',
    'SlitScreen',
    'SlitLightSource',
    'DetectorWall',
    'Box',
    'OvenBox',
    'CircuitGate',
    'CircuitProbe',
    'Rectangle',
    'Charge',
    'CollisionTypes',
    'CollisionActions'
];

// ── Helper: extract the set of window.<Name> assignments in a file ────────────
function extractWindowInstalls(filePath) {
    // Comment-stripped: a commented-out `// window.Foo = Foo;` installs nothing.
    const src = stripJsComments(readFileSync(filePath, 'utf8'));
    const installed = new Set();
    // Match: window.<Identifier> = (at the top level of the IIFE self-install block)
    // We accept both  window.Foo =  and  window.Foo = Foo  and  window.Foo =
    // wrapped across lines.
    const re = /window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        installed.add(m[1]);
    }
    return installed;
}

// ── Build: { installedName → manifest entry path } for OBJECT_SCRIPTS ────────
function buildInstalledNameMap() {
    const map = new Map(); // installedName → path (first match wins)
    for (const p of OBJECT_SCRIPTS) {
        const abs = join(FRQTL_DIR, p);
        if (!existsSync(abs)) { continue; }
        const names = extractWindowInstalls(abs);
        for (const n of names) {
            if (!map.has(n)) { map.set(n, p); }
        }
    }
    return map;
}

// ── Parse stack-boot.js GAME paths ──────────────────────────────────────────
function parseStackBootGamePaths() {
    // Comment-stripped: a commented-out `_u('…')` row is not a loaded script.
    const src = stripJsComments(readFileSync(
        pathResolve(LIB_DIR, 'frqtl/experiments/_shared/stack-boot.js'),
        'utf8'
    ));
    // Extract the GAME array block. R2 (ws-stackboot-dev-map SEAM RULING) made the
    // list LAZY — a function returning the array, called from inside the boot chain,
    // not a top-level `var` — so a missing-map throw rejects into the chain's one
    // .catch instead of aborting at script-parse time.
    // Look for: function _gameList() { return [ ... ]; }
    const gameBlockMatch = src.match(/function\s+_gameList\s*\(\s*\)\s*\{\s*return\s*\[([\s\S]*?)\];\s*\}/);
    if (!gameBlockMatch) {
        throw new Error('[test] Could not find `function _gameList() { return [...]; }` block in stack-boot.js');
    }
    const block = gameBlockMatch[1];
    // Extract _u('...') arguments.
    const paths = [];
    const re = /_u\('([^']+)'\)/g;
    let m;
    while ((m = re.exec(block)) !== null) {
        paths.push(m[1]);
    }
    return paths;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test (a) — THE LOAD-BEARING ONE
//
// For every sugar getter name, there MUST be a file in OBJECT_SCRIPTS whose
// path resolves to an existing file AND that file installs window.<Name>.
//
// This test was RED on the pre-fix tree (Box/OvenBox/CircuitGate absent from
// GAME array → their window.* installs never ran → sugar getters threw).
// It is GREEN after the fix (all 15 OBJECT_SCRIPTS entries present + install
// their respective window.* names).
// ─────────────────────────────────────────────────────────────────────────────
test('(a) every shim sugar getter is backed by an OBJECT_SCRIPTS window.* install', () => {
    const installedMap = buildInstalledNameMap();
    const missing = [];
    for (const name of SUGAR_GETTER_NAMES) {
        if (!installedMap.has(name)) {
            missing.push(name);
        }
    }
    assert.deepEqual(
        missing,
        [],
        'These sugar getter names have no backing window.* install in OBJECT_SCRIPTS:\n' +
        missing.map(n => '  ' + n).join('\n') + '\n' +
        'Fix: add the file that installs window.' + (missing[0] || '?') + ' to OBJECT_SCRIPTS in game-layer-manifest.js'
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (b) — stack-boot.js GAME paths === GAME_LAYER_SCRIPTS (sequence = order)
// ─────────────────────────────────────────────────────────────────────────────
test('(b) stack-boot.js GAME paths match GAME_LAYER_SCRIPTS in exact order', () => {
    const stackBootPaths = parseStackBootGamePaths();
    assert.deepEqual(
        stackBootPaths,
        GAME_LAYER_SCRIPTS,
        'stack-boot.js GAME array diverges from game-layer-manifest.js GAME_LAYER_SCRIPTS.\n' +
        'Update stack-boot.js to mirror the manifest exactly (order matters: Box before OvenBox).\n' +
        'stack-boot has ' + stackBootPaths.length + ' entries; manifest has ' + GAME_LAYER_SCRIPTS.length + '.\n' +
        'stack-boot: ' + JSON.stringify(stackBootPaths) + '\n' +
        'manifest:   ' + JSON.stringify(GAME_LAYER_SCRIPTS)
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (c) — every manifest path exists on disk under lib/frqtl/
// ─────────────────────────────────────────────────────────────────────────────
test('(c) every GAME_LAYER_SCRIPTS path exists on disk under lib/frqtl/', () => {
    const missing = [];
    for (const p of GAME_LAYER_SCRIPTS) {
        const abs = join(FRQTL_DIR, p);
        if (!existsSync(abs)) {
            missing.push(p + ' (expected at: ' + abs + ')');
        }
    }
    assert.deepEqual(
        missing,
        [],
        'These GAME_LAYER_SCRIPTS paths do not exist on disk:\n' +
        missing.map(p => '  ' + p).join('\n')
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// Test (d) — AuthorView DERIVES its game-layer script list from the manifest.
//
// AuthorView.jsx holds the RAW frqtl-relative paths as
// `EXTRA_SCRIPT_PATHS = OBJECT_SCRIPTS.concat(RUNNER_SCRIPTS)` and resolves each
// through the threaded engineRouter.resolve at inject time (never a hardcoded
// '../../' + p dev-tree literal, which resolves to a pub/objects/objects/X.js path the
// static dist does not have). This gate reads AuthorView.jsx itself — the same
// derivation check the renderer manifest applies to the SDK ESM entry — so a
// re-typed list fails here rather than drifting from the roster.
// ─────────────────────────────────────────────────────────────────────────────
test("(d) AuthorView DERIVES EXTRA_SCRIPT_PATHS from OBJECT_SCRIPTS ∪ RUNNER_SCRIPTS", () => {
    const src = stripJsComments(readFileSync(
        pathResolve(LIB_DIR, 'features/ide/AuthorView.jsx'), 'utf8'));

    assert.match(
        src,
        /import\s*\{[^}]*OBJECT_SCRIPTS[^}]*RUNNER_SCRIPTS[^}]*\}\s*from\s*'[^']*game-layer-manifest\.js'/,
        'AuthorView.jsx must import OBJECT_SCRIPTS and RUNNER_SCRIPTS from ' +
        'lib/shim/engine/game-layer-manifest.js — the single authority for the GAME phase');

    assert.match(
        src,
        /EXTRA_SCRIPT_PATHS\s*=\s*OBJECT_SCRIPTS\.concat\(RUNNER_SCRIPTS\)/,
        'AuthorView.jsx must DERIVE EXTRA_SCRIPT_PATHS by concatenating the manifest arrays — ' +
        'a hand-typed path list is the roster-mirror drift this gate exists to catch');

    // And no hand-written game-layer path may appear anywhere in the file: the
    // manifest is the only place a script path is spelled.
    const handTyped = src.match(/'objects\/(objects|setup|geometry|constants)\/[^']*\.js'/g) || [];
    assert.deepEqual(handTyped, [],
        'AuthorView.jsx spells game-layer script paths by hand:\n' +
        handTyped.map((p) => '  ' + p).join('\n') +
        '\nAdd them to game-layer-manifest.js instead — AuthorView reads the roster, never re-lists it.');
});
