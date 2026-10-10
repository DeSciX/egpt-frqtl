/* Copyright 2023-2026 by Essam Abadir */

/**
 * artifact-shell.js — pure generator for the claude.ai Artifact host shell
 * (ws-artifact-showcase Bite A2, docs/design/frqtl-artifact-showcase-scoping-2026-07-10.md).
 *
 * The "artifact host shell" is a SINGLE self-contained HTML file a user pastes
 * into a claude.ai chat as an Artifact. It has no server, no build step, no
 * relative-file dependencies of its own — every asset it needs is fetched from
 * `cdn.jsdelivr.net/npm/` (the ONLY non-`self` script-src origin this shell
 * needs; see §1 of the design doc for the full captured CSP).
 *
 * This module is PURE (no DOM, no browser globals) and node-testable. It has
 * exactly two responsibilities, kept separate so the "never hand-drifted"
 * requirement is mechanically enforced rather than asserted in prose:
 *
 *   buildArtifactImportMap()   — the ONE import-map entry the shell embeds,
 *                                 derived from router.js's CDN_BASE (the single
 *                                 CDN path authority — never a second hand-typed
 *                                 jsdelivr URL literal).
 *   renderArtifactShellHtml()  — the full HTML document text, calling
 *                                 buildArtifactImportMap() internally (so the
 *                                 embedded `<script type="importmap">` can never
 *                                 drift from the generator — a conformance test
 *                                 asserts this by construction, see
 *                                 lib/shim/engine/test/artifact-shell.test.mjs).
 *
 * WHY the import map has exactly ONE entry (not one per engine/renderer/game
 * script): the shell's own inline `<script type="module">` only ever imports
 * the bare specifier `'@descix/frqtl-sdk'` — everything downstream of that
 * (the engine, renderer, and game-layer classic <script> tags) is resolved and
 * injected by that ONE module (sdk/frqtl-sdk/src/esm/index.js, shipped at
 * dist/esm/index.js) via `engineRouter({mode:'cdn'})` — the SAME single path
 * authority every other dist/CDN consumer uses (lib/shim/engine/router.js).
 * Growing this import map by hand per script would just be CDN_PROFILE
 * re-enumerated by hand — the exact schema-mirror-drift anti-pattern root
 * CLAUDE.md's Gate-2 flags on sight.
 *
 * CSP notes baked into the generated HTML (never re-derive elsewhere):
 *   - NO `blob:` module imports (forbidden by the captured CSP's script-src).
 *   - NO script/style/font origin outside the allowlist in the design doc §1
 *     (jsdelivr/npm, cdnjs, claudeusercontent, tailwindcss CDN, jquery CDN) —
 *     this shell in fact uses ONLY jsdelivr/npm plus inline scripts/styles
 *     ('unsafe-inline' is granted), so it is a strict subset of the allowlist.
 *   - The inline `<script type="module">` and the `<script type="importmap">`
 *     are both confirmed-PASS under this exact CSP (Step 0, design doc §1).
 */

'use strict';

import { CDN_BASE } from './router.js';

/**
 * The bare-specifier import map the artifact shell embeds.
 *
 * ONE entry: `'@descix/frqtl-sdk'` → the published package's ESM entry module
 * (absolute jsdelivr URL, derived from `CDN_BASE` — the router's one CDN path
 * authority). This is deliberately NOT a per-script map (see module docstring).
 *
 * @param {object} [opts]
 * @param {string} [opts.base] - Override the dist base (default `CDN_BASE` from
 *   router.js). The ONLY sanctioned caller of this override is the pre-publish
 *   local-CDN-mirror harness (`sdk/frqtl-sdk/scripts/serve-local-cdn-mirror.mjs`)
 *   — the PUBLISHED shell (`sdk/frqtl-sdk/build.js`) never passes this.
 * @returns {{imports: Object<string,string>}}
 * @example
 *   buildArtifactImportMap()
 *   // → { imports: { '@descix/frqtl-sdk': 'https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@0.1.0/dist/esm/index.js' } }
 */
export function buildArtifactImportMap(opts) {
    opts = opts || {};
    var base = opts.base !== undefined ? opts.base : CDN_BASE;
    return {
        imports: {
            '@descix/frqtl-sdk': base + '/esm/index.js'
        }
    };
}

/**
 * Render the complete, self-contained artifact host shell HTML.
 *
 * The document boots the canonical double-slit experiment
 * (lib/frqtl/objects/setup/setupDoubleSlit.js) via `bootDoubleSlit()` — the
 * ESM entry's export (sdk/frqtl-sdk/src/esm/index.js) — into a mount div.
 * FAIL-LOUD: `bootDoubleSlit`'s own promise rejection is caught here and
 * surfaced in the status line; `bootDoubleSlit` itself paints a detailed error
 * overlay inside the mount div on any load/compile/engine failure (never a
 * silent blank canvas).
 *
 * @param {object} [opts]
 * @param {number} [opts.wavelength=64]  - Forwarded to setupDoubleSlit (see its
 *   own docstring for the physics this scales).
 * @param {number} [opts.canvasSize=480] - Square canvas side, in pixels.
 * @param {number} [opts.seed=42]        - RNG seed forwarded to FrqtlApp.
 * @param {string} [opts.base]           - Forwarded to BOTH `buildArtifactImportMap`
 *   (redirects the shell's ONE import-map entry — the ESM entry's own URL) AND
 *   embedded into the inline `bootDoubleSlit(..., {base})` call (redirects
 *   EVERY OTHER script that entry injects — engine/renderer/game-layer). Both
 *   halves are required for a local-mirror override to actually boot end-to-end
 *   (ws-artifact-showcase Bite A2 follow-up, 2026-07-10 tester finding: the
 *   import-map-only override left ~30 downstream script URLs pointed at the
 *   real, unpublished CDN). Pre-publish local-mirror override ONLY — omitted by
 *   the published shell (`sdk/frqtl-sdk/build.js` calls this with no `base`).
 * @returns {string} the full `<!DOCTYPE html>...</html>` document text.
 */
export function renderArtifactShellHtml(opts) {
    opts = opts || {};
    var wavelength = opts.wavelength !== undefined ? opts.wavelength : 64;
    var canvasSize = opts.canvasSize !== undefined ? opts.canvasSize : 480;
    var seed       = opts.seed !== undefined ? opts.seed : 42;
    var importMapJson = JSON.stringify(buildArtifactImportMap(opts));
    // Embedded into bootDoubleSlit's own opts bag ONLY when supplied — the
    // published/default shell never emits this line at all (never even
    // `base: undefined,`), so a diff against the pre-this-fix output is empty
    // for the default (no-opts) call.
    var baseLine = opts.base ? ('    base: ' + JSON.stringify(opts.base) + ',\n') : '';

    return (
'<!DOCTYPE html>\n' +
'<!-- Copyright 2023-2026 by Essam Abadir -->\n' +
'<!-- FRQTL — claude.ai Artifact host shell (ws-artifact-showcase Bite A2).\n' +
'     Generated by lib/shim/engine/artifact-shell.js — DO NOT hand-edit.\n' +
'     Paste this ENTIRE file into a claude.ai chat as an Artifact (type: HTML). -->\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<title>FRQTL — Double-Slit (live)</title>\n' +
'<style>\n' +
'  html,body{margin:0;padding:0;background:#0b0b0b;color:#c9c9c9;font-family:ui-monospace,Menlo,Consolas,monospace;}\n' +
'  #frqtl-status{text-align:center;font-size:12px;color:#888;padding:10px 0 4px;}\n' +
'  #frqtl-mount{width:' + canvasSize + 'px;height:' + (canvasSize + 24) + 'px;margin:0 auto 24px;position:relative;}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div id="frqtl-status" data-role="frqtl-artifact-status">booting FRQTL…</div>\n' +
'<div id="frqtl-mount" data-role="frqtl-artifact-mount"></div>\n' +
'<script type="importmap">' + importMapJson + '</script>\n' +
'<script type="module">\n' +
'  import { bootDoubleSlit } from \'@descix/frqtl-sdk\';\n' +
'  var statusEl = document.getElementById(\'frqtl-status\');\n' +
'  var tickCount = 0;\n' +
'  bootDoubleSlit(\'frqtl-mount\', {\n' +
baseLine +
'    wavelength: ' + wavelength + ',\n' +
'    canvasSize: ' + canvasSize + ',\n' +
'    seed: ' + seed + ',\n' +
'    onTick: function (tickData, setupResult) {\n' +
'      tickCount++;\n' +
'      if (tickCount % 20 === 0) {\n' +
'        statusEl.textContent = \'FRQTL double-slit — live — tick \' + tickCount;\n' +
'      }\n' +
'    }\n' +
'  }).then(function () {\n' +
'    statusEl.textContent = \'FRQTL double-slit — live\';\n' +
'  }).catch(function (err) {\n' +
'    statusEl.textContent = \'FRQTL boot FAILED — see overlay below.\';\n' +
'    if (window.console && console.error) { console.error(\'[frqtl-artifact]\', err); }\n' +
'  });\n' +
'</script>\n' +
'</body>\n' +
'</html>\n'
    );
}
