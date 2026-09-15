// Copyright 2023-2026 by Essam Abadir
// lib/shim/notebook/vendor-importmap.js — the ONE pure import-map generator.
//
// WS-NOTEBOOK-VENDOR Phase 2a (§2a.3). Maps the committed vendor manifest
// (lib/frqtl/assets/vendor/manifest.json) → a browser `<script type="importmap">`
// payload `{ imports: { <spec>: <url> } }`, so a realm cell's builder/view module
// can `import * as d3 from 'd3'` and the realm's native module loader resolves the
// bare specifier to a PLACED /vendor artifact.
//
// PURE: no DOM, no Runtime, no engine import. Node-testable. The `<script>` text is
// just `JSON.stringify(buildImportMap(manifest, vendorBase))`.
//
// PATH AUTHORITY (the canonical-stack DRY rule): `vendorBase` is supplied by the
// caller from `router.vendorBase` (the single path authority — DEV_CORE_PROFILE /
// DIST_PROFILE `__vendorBase`). This module NEVER hardcodes a `/vendor` literal; it
// only joins the caller-provided base with each manifest entry.
//
// FAIL-LOUD (the slit-objects-hardcoded-list bug class): a malformed manifest (no
// `.libs`, or a lib without `.entry`) THROWS — never silently drops a lib.

/**
 * @typedef {object} VendorManifest
 * @property {number} [version]
 * @property {Object<string, { entry: string }>} libs
 *   bare-specifier → { entry: path RELATIVE TO THE VENDOR ROOT }.
 */

/**
 * Build a browser import-map from the vendor manifest.
 *
 * @param {VendorManifest} manifest  parsed manifest.json (`{ libs: { spec: { entry } } }`).
 * @param {string} vendorBase        router.vendorBase, e.g. `'/vendor'` (no trailing slash needed).
 * @returns {{ imports: Object<string, string> }}
 *   `{ imports: { <spec>: <vendorBase>/<entry> } }`.
 * @throws {Error} FAIL-LOUD on a malformed manifest or a missing vendorBase.
 *
 * @example
 *   buildImportMap({ libs: { d3: { entry: 'd3/dist/d3.min.js' } } }, '/vendor')
 *   // → { imports: { d3: '/vendor/d3/dist/d3.min.js' } }
 */
export function buildImportMap(manifest, vendorBase) {
    if (!manifest || typeof manifest !== 'object' || !manifest.libs || typeof manifest.libs !== 'object') {
        throw new Error('[vendor-importmap] malformed manifest: missing `.libs` object (FAIL-LOUD).');
    }
    if (typeof vendorBase !== 'string' || vendorBase.length === 0) {
        throw new Error('[vendor-importmap] vendorBase is required (read it from router.vendorBase) (FAIL-LOUD).');
    }
    // Normalise the base: strip a single trailing slash so the join is unambiguous.
    var base = vendorBase.replace(/\/+$/, '');
    var imports = {};
    var specs = Object.keys(manifest.libs);
    for (var i = 0; i < specs.length; i++) {
        var spec = specs[i];
        var rec = manifest.libs[spec];
        if (!rec || typeof rec.entry !== 'string' || rec.entry.length === 0) {
            throw new Error('[vendor-importmap] manifest lib "' + spec + '" has no `.entry` (FAIL-LOUD — a lib is never silently dropped).');
        }
        // entry is relative to the vendor root; strip any leading slash so the join is clean.
        var entry = rec.entry.replace(/^\/+/, '');
        imports[spec] = base + '/' + entry;
    }
    return { imports: imports };
}

/**
 * Render the import-map as the exact text that goes inside
 * `<script type="importmap">…</script>`. Thin convenience over buildImportMap +
 * JSON.stringify so BOTH host injection paths (the .vsix server-side splice and the
 * in-app once-guard) produce byte-identical script bodies from the ONE generator.
 *
 * @param {VendorManifest} manifest
 * @param {string} vendorBase
 * @returns {string} JSON text for the importmap script body.
 */
export function importMapScriptBody(manifest, vendorBase) {
    return JSON.stringify(buildImportMap(manifest, vendorBase));
}
