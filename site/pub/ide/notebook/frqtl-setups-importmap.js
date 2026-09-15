// Copyright 2023-2026 by Essam Abadir
// lib/shim/notebook/frqtl-setups-importmap.js — bare-specifier import-map generator
// for the CANONICAL setup factories (lib/frqtl/objects/setup/*.js).
//
// WS gym-controls-as-sugar, Bite 0 (notebook physics-logic-fork remediation,
// architect OBJECT-class finding).
//
// PROBLEM 1 (de-fork): several gallery/dogfood notebooks HAND-COPIED a canonical
// setup factory's body into a notebook `module` cell instead of importing it — a
// physics-logic FORK. THE FIX IS NOT "import the canonical factory by relative
// path" — a notebook module cell's declared name (`name="./setups/x.js"`) is a
// SIBLING-MODULE KEY inside the notebook's own moduleSet() closure, not a real
// filesystem/HTTP path; a relative specifier that is NOT itself a module cell in
// the SAME notebook hits the documented VETO-CLASS #1 404 trap
// (lib/shim/notebook/module-resolver.js). THE CORRECT MECHANISM: register the
// canonical setup factories as BARE-SPECIFIER import-map entries — mirroring the
// EXISTING `view`-cell d3 precedent (`import * as d3 from 'd3'`,
// view-builder.js:28-31).
//
// PROBLEM 2 (realm-verification finding, tester report 2026-07-03): the
// canonical setup factories are UMD/CJS-interop IIFEs —
// `if (typeof module !== 'undefined' && module.exports) {...} else {
// window.setupX = setupX; }` — with NO top-level `export` statement (by
// design: the SAME file also loads as a CLASSIC <script> on experiment pages,
// stack-boot.js `data-page-scripts`, where a bare `export` keyword would be a
// syntax error). A real browser ES module loader executes this IIFE fine
// (`typeof module` is undefined in real ESM too, so the window-assignment
// branch runs) but then finds NO export — `import { setupX } from
// '@frqtl/setups/<id>'` throws "does not provide an export named 'setupX'".
// Deterministic, all 7 fork sites, confirmed by the tester across two sweeps.
//
// THE FIX: this generator does NOT point bare specifiers at the raw
// `/frqtl/objects/setup/<file>.js` route (the one experiment pages' classic
// <script> tags consume, byte-for-byte unchanged) — it points them at the
// SIBLING `/frqtl/objects/setup-esm/<file>.js` route
// (lib/server/frqtl-setup-esm.js), which serves the SAME source with a thin
// `export const <name> = window.<name>;` statement appended server-side. The
// classic-script path is completely untouched (different URL). FAIL-LOUD: the
// appender refuses to serve a transform when the expected `window.<name> =
// <name>` assignment isn't found in the source text (never a silent export of
// `undefined`).
//
// PROBLEM 3 (tester re-verification finding 2026-07-03, gallery-circuit-sat
// DETERMINISTIC fail, on the now-retired setupCircuitSAT.js): a factory whose
// browser-classic branch reads another factory's window global at EVAL time — a
// CROSS-FILE UMD dependency. On an experiment page this is guaranteed by
// stack-boot.js's `data-page-scripts` ORDERING, which a notebook adapter does not
// have: importing ONLY the dependent specifier never triggers a fetch of the
// dependency at all, so its window global stays undefined and the failure is a
// deterministic TypeError. Such a dependency is a property of the FACTORY FILE
// (true for ANY consumer, not a per-notebook detail), so it belongs HERE, in the
// manifest, as `deps` — the
// setup-esm transform (lib/server/frqtl-setup-esm.js) turns each into a
// static side-effect `import '<dep>';` PREPENDED to the served source. A
// static import guarantees ES-module evaluation order: the dependency's
// top-level code (which sets `window.setupCircuitBasic`) runs to completion
// BEFORE the importing module's own top-level code (the UMD IIFE reading
// `window.setupCircuitBasic.createWire`) — no race, no manual per-notebook
// side-effect import to remember.
//
// PURE: no DOM, no Runtime, no engine import — only `engineRouter` (the single
// engine path-routing authority, lib/shim/engine/router.js) so this generator
// NEVER hardcodes a `/frqtl` literal and stays profile-correct if a dist splice
// route is ever added (today's only callers always pass the dev-core profile —
// see the `mode` param default and the FRQTL-MAINT note at the bottom).
//
// FAIL-LOUD (the slit-objects-hardcoded-list bug class): a manifest entry with
// no file/primary throws — never silently dropped.

import { engineRouter } from '../engine/router.js';

/**
 * The ONE bare-specifier → canonical-setup-factory manifest.
 *
 * Explicit curation (not a directory enumeration) — mirrors the hand-authored
 * vendor manifest.json shape: a bare specifier is a chosen PUBLIC vocabulary
 * (`@frqtl/setups/<id>`), not a 1:1 derivation from the PascalCase filename
 * (acronyms like `SAT` don't kebab-case losslessly). Add an entry here when a
 * notebook needs to import a new canonical setup factory by bare specifier —
 * never re-derive this list elsewhere (schema-mirror-drift class).
 *
 * `file` is relative to `lib/frqtl/objects/setup/`. `primary` is the name the
 * classic-script (browser) export branch assigns via `window.<primary> =
 * <primary>` — this is what lib/server/frqtl-setup-esm.js scans FOR
 * (FAIL-LOUD if absent) before appending the ESM re-export. `statics` (only
 * `setupCircuitBasic.js` needs this today) names helper functions the factory
 * attaches as STATIC PROPERTIES on the primary function itself
 * (`setupCircuitBasic.createWire = createWire`, NOT a separate
 * `window.createWire`) — each also gets its own `export const`. `deps` (only
 * no manifest entry needs this today) lists OTHER bare specifiers whose
 * module MUST evaluate first (a property of the factory file — see PROBLEM 3
 * above); the setup-esm transform prepends a static side-effect `import
 * '<dep>';` for each.
 *
 * @type {Object<string, {file:string, primary:string, statics?:string[], deps?:string[]}>}
 */
export const FRQTL_SETUPS_MANIFEST = {
    '@frqtl/setups/wave-interference': { file: 'setupWaveInterference.js', primary: 'setupWaveInterference' },
    '@frqtl/setups/double-slit': { file: 'setupDoubleSlit.js', primary: 'setupDoubleSlit' },
    '@frqtl/setups/atomic-model': { file: 'setupAtomicModel.js', primary: 'setupAtomicModel' },
    '@frqtl/setups/blackbody': { file: 'setupBlackbody.js', primary: 'setupBlackbody' },
    '@frqtl/setups/big-bang': { file: 'setupBigBang.js', primary: 'setupBigBang' },
    '@frqtl/setups/circuit-basic': {
        file: 'setupCircuitBasic.js', primary: 'setupCircuitBasic',
        statics: ['createWire', 'createBattery', 'createResistor']
    },
    // circuit-sat is the HALF-ADDER, rebuilt on LogicGate + Trace (2026-08-01). The
    // specifier is the EXPERIMENT id and is unchanged; the factory behind it is the
    // successor, and the retired `setupCircuitSAT` symbol is gone rather than fenced.
    // NO `deps`: setupHalfAdder resolves LogicGate/Trace/setupSphereEmitter3D at CALL
    // time from the game-layer roster, so it has no cross-file EVALUATION-ORDER
    // dependency — which is exactly what the call-time idiom exists to avoid. This was
    // the LAST manifest entry carrying `deps`; the mechanism stays (the next cross-file
    // dependency will need it) and keeps its own tests in
    // lib/server/test/frqtl-setup-esm.test.mjs.
    '@frqtl/setups/circuit-sat': { file: 'setupHalfAdder.js', primary: 'setupHalfAdder' },
    // ── 3D experiments (WS gym-controls-as-sugar Bite 0 ADDENDUM, CEO 2026-07-03) ──
    // No cross-setup-file deps — each factory's
    // window.* sugar dependencies are game-layer objects (QuantumEmitter for
    // particle-walk-3d; none for collision-matrix-3d), all installed by
    // GAME_LAYER_SCRIPTS (game-layer-manifest.js) — NOT another setup factory,
    // so no `deps` entry here.
    '@frqtl/setups/particle-walk-3d': { file: 'setupParticleWalk3D.js', primary: 'setupParticleWalk3D' },
    '@frqtl/setups/collision-matrix-3d': { file: 'setupCollisionMatrix3D.js', primary: 'setupCollisionMatrix3D' }
};

/**
 * Build a lookup keyed by FILENAME (not bare specifier) — the shape
 * `lib/server/frqtl-setup-esm.js`'s route handler needs (it receives a
 * `:file` express param, not a bare specifier). One derivation authority so
 * the route handler never re-scans FRQTL_SETUPS_MANIFEST itself.
 *
 * @returns {Object<string, {file:string, primary:string, statics?:string[]}>}
 */
export function frqtlSetupsManifestByFile() {
    const byFile = {};
    const specs = Object.keys(FRQTL_SETUPS_MANIFEST);
    for (let i = 0; i < specs.length; i++) {
        const entry = FRQTL_SETUPS_MANIFEST[specs[i]];
        byFile[entry.file] = entry;
    }
    return byFile;
}

/**
 * Build the `{imports: {spec: url}}` import-map fragment for the canonical
 * setup factories, pointing each bare specifier at the ESM-transformed
 * `objects/setup-esm/<file>` route (NEVER the raw `objects/setup/<file>` route
 * experiment pages' classic <script> tags consume) — using `engineRouter`'s
 * `objects/` path mapping so the URL is correct in BOTH profiles (`dev-core` →
 * `/frqtl/objects/setup-esm/<file>`; `dist` → `../../js/game/setup-esm/<file>`,
 * see the FRQTL-MAINT note below for the dist-route gap).
 *
 * @param {'dev-core'|'dist'} [mode='dev-core']
 * @returns {{imports: Object<string,string>}}
 * @throws {Error} FAIL-LOUD on a manifest entry with no file/primary.
 */
export function buildFrqtlSetupsImportMap(mode) {
    const router = engineRouter({ mode: mode || 'dev-core' });
    const imports = {};
    const specs = Object.keys(FRQTL_SETUPS_MANIFEST);
    for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        const entry = FRQTL_SETUPS_MANIFEST[spec];
        if (!entry || typeof entry.file !== 'string' || typeof entry.primary !== 'string') {
            throw new Error('[frqtl-setups-importmap] manifest spec "' + spec + '" has no file/primary (FAIL-LOUD).');
        }
        imports[spec] = router.resolve('objects/setup-esm/' + entry.file);
    }
    return { imports: imports };
}

// FRQTL-MAINT(frqtl-setups-importmap-dist-splice): today's ONLY caller
// (lib/server/realm-html.js spliceVendorImportMap) is invoked exclusively with
// the dev-core profile (plugin.js's in-app transform, mounts.js's /ide-app and
// /realm handlers) — there is no dist-mode splice route yet, so `mode` above
// always defaults correctly. If a dist-served notebook splice route is added,
// BOTH the splice mode AND a dist-mode `/objects/setup-esm/` serving route
// (today only registered in mounts.js core mode — see frqtl-setup-esm.js) are
// needed. Thread the real mode through rather than relying on the default. See
// FRAQTL issue #61 (learning methodology tag).
