/* Copyright 2023-2026 by Essam Abadir */

/**
 * renderCapabilities-common.js — the SHARED universal + filter capability
 * descriptors every `RendererProvider.renderCapabilities()` implementation
 * declares (WS Studio Controls Realignment, Bite S5b — architect's S5a gate
 * "minor DRY recommendation": `p5-provider.js` and `three-provider.js` had
 * byte-identical `_universalRenderCapabilities` bodies + an identical
 * per-Filters-entry toggle loop, hand-copied across two legitimately-
 * independent BYO files — a 4th universal knob would have needed adding in
 * two places. This module is the ONE owner both providers import).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * Two pure, module-level free functions — no live WebGL/THREE/canvas instance
 * needed (capability DESCRIPTORS are static metadata; live VALUES are read
 * separately via `FrqtlApp.getRenderOption`/`isFilterActive`, exactly
 * as `p5-provider.js`'s/`three-provider.js`'s own pre-existing docstrings
 * already state) — this is what keeps both callers unit-testable in plain
 * Node with no browser.
 *
 * `universalRenderCapabilities(normalizeFieldDescriptor, RenderShapeRef, FrameDataSchemaRef)`
 *   → the 3 knobs BOTH built-in providers honor identically (README §3):
 *     `shape` (enum, RenderShape.VALID_SHAPES), `colorScheme` (enum,
 *     RENDER_INTENT_VALUES['render.colorScheme']), `renderBaseCanvas` (number,
 *     bool01). Does NOT include filter toggles — see `filterRenderCapabilities`
 *     below (three-provider needs to splice its OWN 5 effect-layer knobs
 *     BETWEEN the universal 3 and the filter toggles, so the two lists are
 *     kept separate rather than one combined function).
 *
 * `filterRenderCapabilities(normalizeFieldDescriptor, FiltersRef)`
 *   → one `filter.<name>` toggle descriptor (number, bool01, default 0) per
 *     `Filters.js` catalog entry — `filter()`/`removeFilter()` are REQUIRED
 *     contract methods on every provider (README §1), so every provider
 *     declares every filter identically; this is why the loop is shared
 *     rather than per-provider.
 *
 * A caller composes its own full list as
 * `universalRenderCapabilities(...).concat(providerOnlyCaps).concat(filterRenderCapabilities(...))`
 * — see `p5-provider.js`'s `_renderCapabilitiesP5` / `three-provider.js`'s
 * `_renderCapabilitiesThree` for the two worked call sites.
 *
 * ── Module format: CLASSIC dual CommonJS/window (matches every peer under
 *    lib/frqtl/compat/renderer/ — RenderShape.js, LightColor.js, Filters.js) ──
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * Zero physics — pure metadata describing render-surface knobs (root
 * CLAUDE.md §Object architecture: render is output-boundary only).
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — the same wrapper every
//    game-layer object and renderer authority carries). This file loads in the
//    browser as a classic <script> from stack-boot.js, and classic scripts share ONE
//    global lexical environment: an unwrapped top-level `function _fail(...)` here
//    silently OVERWRITES a same-named helper in a sibling script (last loaded wins),
//    which is invisible to `node --test` by construction because Node gives each
//    require()d file its own module scope. Everything below is PRIVATE; the only
//    things that reach the shared scope are the explicit `module.exports` (CJS) /
//    `window.<Namespace>` (browser) assignments at the bottom — the file's dual-mode
//    export layout is unchanged. Enforced by
//    lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

/** `{value:value}` identity map — the shape `makeControlsForObject.js`'s
 *  `_enumHandler` requires for `constraint.values` (`_isIdentityValuesMap`). */
function _identityMap(values) {
    var m = {};
    for (var i = 0; i < values.length; i++) { m[values[i]] = values[i]; }
    return m;
}

/**
 * The 3 universal knobs both p5 and three honor identically.
 * @param {function} normalizeFieldDescriptor — `lib/shim/field-descriptor`'s
 *   `normalizeFieldDescriptor` (dependency-injected, not required here, so
 *   this module has no import of its own — mirrors the callers' own
 *   already-resolved-ref-passing convention).
 * @param {{VALID_SHAPES:string[]}} RenderShapeRef
 * @param {{RENDER_INTENT_VALUES:object}} FrameDataSchemaRef
 * @returns {object[]} 3 normalized field descriptors.
 */
function universalRenderCapabilities(normalizeFieldDescriptor, RenderShapeRef, FrameDataSchemaRef) {
    return [
        normalizeFieldDescriptor({
            name: 'shape', type: 'enum', default: 'ball',
            // Bite 5b A3: this is the render-LEVEL DEFAULT shape (per-object sugar like a
            // SphereEmitter's `renderShape` field overrides it per-leaf via render.shape) —
            // labelled "Default Shape" so the scoping reads true. `label` overrides the shown
            // control label only; the capability key stays `shape` (setRenderOption('shape',…)).
            label: 'Default Shape',
            constraint: { values: _identityMap(RenderShapeRef.VALID_SHAPES) },
            description: 'Render-level DEFAULT particle shape (RenderShape.js — the one shape ' +
                'authority). A per-object sugar override (e.g. a SphereEmitter renderShape) wins ' +
                'per-leaf via the render.shape key; this is the fallback when none is set.'
        }),
        normalizeFieldDescriptor({
            name: 'colorScheme', type: 'enum', default: 'warmcool',
            constraint: { values: _identityMap(FrameDataSchemaRef.RENDER_INTENT_VALUES['render.colorScheme']) },
            description: 'Per-experiment default fullness-to-color ramp (LightColor.js — the one color authority).'
        }),
        normalizeFieldDescriptor({
            name: 'renderBaseCanvas', type: 'number', unit: 'bool01', default: 1,
            constraint: { min: 0, max: 1, integer: true },
            description: 'Whether the particle/base layer composites into the scene before any ' +
                'post-process pass (README §3). Both p5 and three honor this identically.'
        })
    ];
}

/**
 * One `filter.<name>` toggle capability per `Filters.js` catalog entry.
 * @param {function} normalizeFieldDescriptor
 * @param {object} FiltersRef — `Filters.js`'s exported catalog (`{water:{...}, bloom:{...}, ...}`).
 * @returns {object[]} `Object.keys(FiltersRef).length` normalized field descriptors.
 */
function filterRenderCapabilities(normalizeFieldDescriptor, FiltersRef) {
    var caps = [];
    var filterNames = Object.keys(FiltersRef);
    for (var i = 0; i < filterNames.length; i++) {
        caps.push(normalizeFieldDescriptor({
            name: 'filter.' + filterNames[i], type: 'number', unit: 'bool01', default: 0,
            constraint: { min: 0, max: 1, integer: true },
            description: 'Toggle the "' + filterNames[i] + '" post-process filter ' +
                '(Filters.js — routed through filter()/removeFilter(), never setRenderOption).'
        }));
    }
    return caps;
}

// ── Export ────────────────────────────────────────────────────────────────────

var RenderCapabilitiesCommon = {
    universalRenderCapabilities: universalRenderCapabilities,
    filterRenderCapabilities: filterRenderCapabilities,
    _identityMap: _identityMap
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = RenderCapabilitiesCommon;
} else if (typeof window !== 'undefined') {
    window.RenderCapabilitiesCommon = RenderCapabilitiesCommon;
}

})();
