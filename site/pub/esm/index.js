/* Copyright 2023-2026 by Essam Abadir */

/**
 * esm/index.js — the ESM bare-specifier entry for `@descix/frqtl-sdk`
 * (ws-artifact-showcase Bite A2).
 *
 * Ships at `dist/esm/index.js` (copied verbatim by `sdk/frqtl-sdk/build.js` —
 * see its "ESM entry" step). This is the ONLY file in the SDK distribution
 * written as a genuine ES module (`export`) — every other shipped script
 * (engine, renderer, game layer) is a classic dual-mode (CJS/window) script,
 * per the canonical stack's existing discipline (root CLAUDE.md rule 5 /
 * `lib/frqtl/experiments/_shared/stack-boot.js`). Rather than duplicating that
 * discipline as a second implementation, this module ORCHESTRATES it: it
 * injects the SAME classic `<script>` tags — resolved through `engineRouter`,
 * never hand-derived — in the SAME canonical order stack-boot.js uses (see
 * `lib/shim/engine/game-layer-manifest.js` for the full canonical list; the
 * arrays below are the double-slit experiment's actual dependency SUBSET of
 * it), then exposes ONE promise-returning function per showcased experiment.
 *
 * WHY THIS SHAPE (not a "real" ESM rewrite of the engine/game layer):
 *   - A new op-program behavior is data, never new engine code (root CLAUDE.md
 *     §Object architecture) — this file adds ZERO physics; it is packaging.
 *   - The classic dual-mode scripts (window.SlitScreen, window.LargeObject, ...)
 *     ARE the canonical single-source implementations; re-exporting them as a
 *     second genuine-ESM copy would fork a second implementation — the
 *     non-redundancy anti-pattern root CLAUDE.md's Gate-2 flags on sight.
 *   - The claude.ai Artifact CSP forbids `blob:` module imports but ALLOWS
 *     classic `<script>` injection from the SAME jsdelivr origin the shell's
 *     import map already trusts (docs/design/frqtl-artifact-showcase-scoping
 *     -2026-07-10.md §1 — the captured CSP; §3a "showcase shortcut").
 *   - This entry never touches `stack-boot.js` (confirmed dist-incompatible —
 *     see `.claude/agent-memory/frqtl-impl-server/CANONICAL.md` §CRITICAL) —
 *     it is a bespoke, MINIMAL subset built for exactly what
 *     `setupDoubleSlit` needs, resolved through `engineRouter({mode:'cdn'})`.
 *
 * Exports:
 *   bootDoubleSlit(mountEl, opts?) → Promise<{ runner, setupResult }>
 *     Boots the canonical double-slit experiment
 *     (`lib/frqtl/objects/setup/setupDoubleSlit.js`) into `mountEl`.
 *     FAIL-LOUD: any load/compile/engine failure paints a visible overlay
 *     inside `mountEl` and the returned promise REJECTS — never a silent
 *     black box (root CLAUDE.md §Anti-Patterns; mirrors engine-boot.js's
 *     `failLoud` discipline without depending on that PageParams-coupled file).
 *
 *   bootScene(mountEl, setup, opts?) → Promise<{ runner, setupResult }>
 *     The GENERIC sibling of `bootDoubleSlit`: boots ANY setup factory (2D or
 *     3D, p5 or three, with shapes / FX / water) — e.g. a spherical "sun" via
 *     `bootScene('mount', 'setupSphereEmitter3D', {…})`. `setup` is the setup
 *     factory identified by NAME (a window-global string — setup factories are
 *     classic injected scripts, NOT ESM exports, so a name resolved as
 *     `window[setup]` AFTER injection is the correct agent-facing API; a raw
 *     function is also accepted). It injects the FULL canonical game layer +
 *     BOTH renderer providers + the FX/render-effect layers (via the superset
 *     `buildScriptListsFull`), so no scene is missing a dependency. Same
 *     FAIL-LOUD discipline as `bootDoubleSlit`. `bootDoubleSlit` is left
 *     UNCHANGED (the proven 2D p5 subset).
 *
 *   bootRecipe(mountEl, recipeSource, opts?) → Promise<{ runner, recipeContext }>
 *     The standalone-bundle counterpart of `bootScene`: boots a
 *     `buildExperiment(exp)` RECIPE (STUDIO codegen output = a bundle's
 *     `experiment.js`) against a RecipeContext, applying a saved renderState bag
 *     via the shim `renderStateToBootOptions` contract. A recipe bundle's
 *     `index.html` calls exactly this. Same FAIL-LOUD discipline.
 */

import { engineRouter } from '../ide/engine/router.js';
import { ENGINE_SHIM_CONTRACT_SCRIPTS } from '../ide/engine/shim-contract-manifest.js';
import { GAME_LAYER_SCRIPTS } from '../ide/engine/game-layer-manifest.js';
// The RENDERER-phase authority (sibling of the GAME manifest above). Hand-copying
// this list is what silently dropped RenderFamily.js from the dist and blanked
// every 3D scene while dev was fine — derive, never re-type.
import { RENDERER_LAYER_SCRIPTS } from '../ide/engine/renderer-layer-manifest.js';
// The ONE renderState contract owner (shim; ruling E2a) — bootRecipe ferries it,
// never re-implements the normalize/translate logic (a third copy is forbidden).
import { renderStateToBootOptions } from '../ide/render-state/index.js';

// ── Idempotent classic-script injector (mirrors stack-boot.js's `_inject`) ──

var _injected = Object.create(null);

function injectScript(src, attrs) {
    if (!src) { return Promise.resolve(); }
    if (_injected[src]) { return _injected[src]; }
    if (typeof document !== 'undefined' && document.querySelector('script[src="' + src + '"]')) {
        return (_injected[src] = Promise.resolve());
    }
    return (_injected[src] = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = src;
        if (attrs) { Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); }); }
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('[frqtl-sdk esm] script load failed: ' + src)); };
        document.head.appendChild(s);
    }));
}

function injectSequence(list) {
    return list.reduce(function (chain, item) {
        return chain.then(function () { return injectScript(item.src, item.attrs); });
    }, Promise.resolve());
}

// ── FAIL-LOUD overlay, scoped to the mount element ──────────────────────────
//
// Never full-viewport: this shell is embedded inside a claude.ai Artifact
// iframe (or any other host page), not a standalone canonical experiment page
// — root CLAUDE.md's "host-aware overlay scoping" discipline (engine-boot.js /
// render-boot.js precedent), applied at the one scope this entry ever has.

function paintError(mountEl, title, detail) {
    var box = document.createElement('div');
    box.setAttribute('data-egpt-artifact-error', '1');
    box.style.cssText =
        'position:absolute;inset:0;font:12px/1.5 ui-monospace,Menlo,Consolas,monospace;' +
        'white-space:pre-wrap;background:#1a0000;color:#ff6b6b;border:2px solid #b6161c;' +
        'padding:14px;overflow:auto;z-index:9998;';
    box.textContent = title + '\n\n' + detail;
    mountEl.innerHTML = '';
    if (mountEl.style && (!mountEl.style.position || mountEl.style.position === 'static')) {
        mountEl.style.position = 'relative';
    }
    mountEl.appendChild(box);
}

function resolveMount(mountEl) {
    if (typeof mountEl === 'string') {
        var el = document.getElementById(mountEl);
        if (!el) { throw new Error('[frqtl-sdk esm] mount element id "' + mountEl + '" not found.'); }
        return el;
    }
    if (!mountEl || typeof mountEl.appendChild !== 'function') {
        throw new Error('[frqtl-sdk esm] bootDoubleSlit(mountEl, opts): mountEl must be a DOM element or its id.');
    }
    return mountEl;
}

// ── The canonical script lists — a DELIBERATE SUBSET of stack-boot.js's full
// canonical order (see lib/shim/engine/game-layer-manifest.js for the shared-
// game-layer superset this is drawn from): excludes the controls/Tube/OvenBox/
// circuit/three.js groups the double-slit setup factory never touches. Every
// URL is resolved through engineRouter — NEVER hand-derived. ───────────────

// lib/shim contract scripts (ast-schema, frame-data, page-params,
// field-descriptor, controls x2, rpc) — the CANONICAL list is
// shim-contract-manifest.js's ENGINE_SHIM_CONTRACT_SCRIPTS (the same list
// stack-boot.js's own ENGINE array is a literal copy of, parity-tested by
// lib/shim/engine/test/shim-contract-manifest.test.mjs). Consumed here IN
// FULL — never a hand-picked subset of a canonical list — by stripping each
// entry's '/lib/shim/' prefix and re-resolving through router.resolve('shim/...')
// (the router's 'shim/' path-authority prefix, added alongside this entry).
var SHIM_ABS_PREFIX = '/lib/shim/';

function buildShimContractScripts(router) {
    return ENGINE_SHIM_CONTRACT_SCRIPTS.map(function (absPath) {
        if (absPath.indexOf(SHIM_ABS_PREFIX) !== 0) {
            throw new Error('[frqtl-sdk esm] unexpected shim-contract path shape: ' + absPath);
        }
        return { src: router.resolve('shim/' + absPath.slice(SHIM_ABS_PREFIX.length)) };
    });
}

/**
 * Build the exact { ENGINE, RENDERER, GAME } script-URL lists `bootDoubleSlit`
 * injects, for a given router. EXPORTED (alongside `bootDoubleSlit`) so a
 * conformance test can assert every URL these three sequences actually inject
 * resolves to a real dist file — checking the SAME data this module injects,
 * never a parallel hand-typed list that could silently drift from it (see
 * lib/shim/engine/test/router.test.mjs "every ARTIFACT-SHOWCASE injectSequence
 * URL exists on disk"). Pure given `router` — no DOM/browser access.
 *
 * @param {import('../ide/engine/router.js').EngineRouter} router
 * @returns {{ENGINE: Array<{src:string}>, RENDERER: Array<{src:string}>, GAME: Array<{src:string}>}}
 */
export function buildScriptLists(router) {
    var ENGINE = [
        { src: router.resolve('assets/vendor/chroma.min.js') },
        { src: router.resolve('objects/geometry/Rectangle.js') },
        { src: router.resolve('compat/providers/wasm-engine.js') },
        { src: router.resolve('compat/providers/wasm-load-browser.js') },
        { src: router.resolve('compat/egpt-engine.js') }
    ].concat(buildShimContractScripts(router));
    // ^ ast-schema.js / frame-data/index.js (needed by actionCompiler at
    //   LargeObject construction time and by RenderShape.js/RenderMesh.js at
    //   THEIR OWN module-eval time, respectively) ride inside this concat —
    //   along with page-params/field-descriptor/controls/rpc, which the
    //   double-slit setup does not need but are cheap, small, and loading the
    //   canonical list IN FULL means a future manifest addition is picked up
    //   automatically with no matching edit required here.

    var RENDERER = [
        { src: router.resolve('objects/constants/LightColor.js') },
        { src: router.resolve('compat/renderer/RenderShape.js') },
        { src: router.resolve('compat/renderer/RenderMesh.js') },
        { src: router.resolve('compat/renderer/RenderTiers.js') },
        { src: router.resolve('compat/renderer/FieldBuilder.js') },
        { src: router.resolve('compat/renderer/providers/p5-provider.js') },
        { src: router.resolve('compat/renderer/Filters.js') }
        // three-provider.js intentionally omitted: double-slit is a 2D p5
        // experiment (window._egptDefaultRenderer is set to 'p5' below).
    ];

    var GAME = [
        { src: router.resolve('objects/constants/CollisionTypes.js') },
        { src: router.resolve('objects/constants/CollisionActions.js') },
        { src: router.resolve('objects/constants/Charge.js') },
        { src: router.resolve('objects/geometry/Rectangle.js') },
        { src: router.resolve('objects/geometry/SlabFace.js') },
        { src: router.resolve('objects/objects/actionCompiler.js') },
        { src: router.resolve('objects/objects/emitterProgram.js') },
        { src: router.resolve('objects/objects/LargeObject.js') },
        { src: router.resolve('objects/objects/QuantumEmitter.js') },
        { src: router.resolve('objects/objects/PointSource.js') },
        { src: router.resolve('objects/objects/DetectorWall.js') },
        { src: router.resolve('objects/objects/SlitScreen.js') },
        { src: router.resolve('objects/objects/SlitLightSource.js') },
        { src: router.resolve('objects/schema/index.js') },
        { src: router.resolve('objects/ObjectFactory.js') },
        { src: router.resolve('objects/FrqtlApp.js') },
        { src: router.resolve('objects/Experiment.js') },
        { src: router.resolve('objects/RecipeContext.js') },
        // Per-experiment setup factory — NOT part of the shared game layer (same
        // "data-page-scripts" idiom every canonical experiment page uses).
        { src: router.resolve('objects/setup/setupDoubleSlit.js') }
    ];

    return { ENGINE: ENGINE, RENDERER: RENDERER, GAME: GAME };
}

/**
 * The SUPERSET of `buildScriptLists` — the FULL canonical stack `bootScene`
 * injects so ANY setup factory works (2D or 3D, p5 or three, with shapes / FX /
 * water). Where `buildScriptLists` is the deliberate double-slit SUBSET (p5
 * only, no three, no FX layers, no full object roster), this returns:
 *
 *   ENGINE   — identical to buildScriptLists' ENGINE (chroma → Rectangle → WASM
 *              compat + the FULL shim-contract list). No superset needed: the
 *              engine layer is scene-independent.
 *   RENDERER — the FULL renderer stack: RENDERER_LAYER_SCRIPTS from
 *              lib/shim/engine/renderer-layer-manifest.js (the SAME single
 *              authority stack-boot.js's RENDERER phase mirrors — never a
 *              hand-copied list; a hand copy is what dropped RenderFamily.js
 *              from the dist and blanked every 3D scene). It carries the color
 *              source, the shape/mesh/family decode authorities, the render-tier
 *              table, FieldBuilder, renderCapabilities-common, BOTH providers
 *              (p5 AND three) and Filters.
 *   GAME     — the FULL canonical game roster: GAME_LAYER_SCRIPTS from
 *              lib/shim/engine/game-layer-manifest.js (the SAME single authority
 *              stack-boot.js + router.gameScripts() consume — never a hand-copied
 *              list). This is OBJECT_SCRIPTS + RUNNER_SCRIPTS; per-experiment
 *              setup factories (objects/setup/*.js) are NOT in it (they are
 *              per-surface — `bootScene` injects the ONE it was asked for after
 *              this GAME sequence, exactly as gameScripts() documents).
 *
 * Every URL is resolved through the SAME `router` — never hand-derived. EXPORTED
 * so the conformance test (lib/shim/engine/test/router.test.mjs) can assert every
 * URL these three sequences inject resolves to a real dist file — checking the
 * SAME data `bootScene` injects, never a parallel hand-typed list.
 *
 * NOTE: the three.js runtime (`assets/vendor/three.min.js`) is NOT in this list —
 * it is loaded lazily by `bootScene` ONLY when the three renderer is selected
 * (most 2D scenes never pay for it), mirroring render-boot.js's lazy three load.
 *
 * @param {import('../ide/engine/router.js').EngineRouter} router
 * @returns {{ENGINE: Array<{src:string}>, RENDERER: Array<{src:string}>, GAME: Array<{src:string}>}}
 */
export function buildScriptListsFull(router) {
    var ENGINE = [
        { src: router.resolve('assets/vendor/chroma.min.js') },
        { src: router.resolve('objects/geometry/Rectangle.js') },
        { src: router.resolve('compat/providers/wasm-engine.js') },
        { src: router.resolve('compat/providers/wasm-load-browser.js') },
        { src: router.resolve('compat/egpt-engine.js') }
    ].concat(buildShimContractScripts(router));

    // FULL renderer stack from the ONE manifest authority (never a hand-copied
    // list — lib/shim/engine/renderer-layer-manifest.js owns the phase and its
    // load-order constraints: RenderShape/RenderMesh before RenderFamily, and
    // RenderFamily/renderCapabilities-common before both providers).
    var RENDERER = RENDERER_LAYER_SCRIPTS.map(function (p) { return { src: router.resolve(p) }; });

    // FULL game roster from the ONE manifest authority (never a hand-copied list).
    var GAME = GAME_LAYER_SCRIPTS.map(function (p) { return { src: router.resolve(p) }; });

    return { ENGINE: ENGINE, RENDERER: RENDERER, GAME: GAME };
}

// ── Engine boot (WASM-only — this artifact never offers a JS-engine option;
// the JS reference engine is a dev/debug fixture, never distributed — rule 5).
// Mirrors engine-boot.js's WASM branch, minus the PageParams/`?engine=`
// machinery this fixed-engine artifact does not need. ──────────────────────

function bootEngine(router) {
    window._egptWasmPkgUrl = router.wasmPkgUrl;
    if (!window._WasmEngineProvider || !window.EGPTEngine) {
        return Promise.reject(new Error(
            '[frqtl-sdk esm] WASM compat layer missing (window._WasmEngineProvider / ' +
            'window.EGPTEngine not installed — did compat/egpt-engine.js fail to load?).'
        ));
    }
    // EGPTEngine.create() installs window.EGPTUniverse (+ Charge/TickData/FrameData)
    // once the real WASM module resolves, and sets window._wasmReadyPromise itself
    // (compat/providers/wasm-load-browser.js `loadAndSetReadyPromise`).
    return window.EGPTEngine.create({ backend: 'wasm', wasmPkgUrl: router.wasmPkgUrl });
}

// ── Renderer boot (p5-only — the double-slit showcase is 2D). Mirrors
// render-boot.js's default (no-override) branch exactly: the p5 provider is
// synchronously ready the instant its script has loaded. ───────────────────

/**
 * Register the booted provider into THE DISPLAY SLOT — the ONE answer to "which provider
 * owns the display" (RENDERER_CONTRACT §9; `lib/frqtl/compat/renderer/display-slot.js`,
 * loaded at the head of the RENDERER phase by the same manifest this boot maps). It FERRIES
 * `window._egptRenderer`, the name authority set by the caller, so the slot can never answer
 * differently from `build.renderer`. The bare `window._egptActiveRenderer` global this
 * replaced is DELETED — a slot plus a global would be two truths about one fact.
 */
function registerDisplay(provider) {
    if (!window.FrqtlDisplay) {
        throw new Error('[frqtl-sdk esm] display-slot.js did not install window.FrqtlDisplay ' +
            '(it heads the RENDERER script list). FAIL-LOUD, not a fallback.');
    }
    return window.FrqtlDisplay.set(provider, window._egptRenderer);
}

function bootRenderer() {
    if (!window._egptRendererProviders || !window._egptRendererProviders.p5) {
        throw new Error('[frqtl-sdk esm] p5-provider.js did not install window._egptRendererProviders.p5.');
    }
    window._egptRenderer = 'p5';
    registerDisplay(window._egptRendererProviders.p5.makeProvider());
}

// ── p5 global-mode boot (mirrors every canonical experiment page's own
// "defer p5 until engine+renderer are live" discipline — see stack-boot.js's
// docstring §DEFERRED-p5 DISCIPLINE). ───────────────────────────────────────

function bootP5(router, onSetup) {
    window.setup = onSetup;
    return injectScript(router.p5Src());
}

/**
 * Boot the canonical double-slit experiment into `mountEl`.
 *
 * @param {HTMLElement|string} mountEl - A DOM element (or its id) to mount the
 *   p5 canvas into. Its existing contents are cleared.
 * @param {object} [opts]
 * @param {number} [opts.wavelength=64] - Forwarded to setupDoubleSlit (see its
 *   own docstring — the single geometry master knob).
 * @param {number} [opts.canvasSize=480] - Square canvas side, in pixels.
 * @param {number} [opts.seed=42] - RNG seed (FrqtlApp).
 * @param {(tickData:object, setupResult:object)=>void} [opts.onTick] - Optional
 *   per-tick callback (same signature as FrqtlApp's own `onTick`).
 * @param {string} [opts.base] - **PRE-PUBLISH LOCAL-CDN-MIRROR HARNESS AND TESTS
 *   ONLY** (ws-artifact-showcase Bite A2 follow-up, 2026-07-10 tester finding:
 *   without this, only the SHELL's own import-map entry — the URL of this ESM
 *   file itself — could be redirected to a local mirror; every OTHER script
 *   this function injects still silently fell through to the real, unpublished
 *   CDN). Forwarded straight to `engineRouter({mode:'cdn', base})` — see that
 *   function's own `opts.base` docstring. The generated artifact shell
 *   (`lib/shim/engine/artifact-shell.js`) only emits this into the boot call
 *   when its OWN `opts.base` override is supplied (the harness path); the
 *   published/default shell never passes it, so this is a no-op by default —
 *   omitting it is byte-identical to before this option existed.
 * @returns {Promise<{runner:object, setupResult:object}>}
 * @throws {Error} FAIL-LOUD — never resolves silently against a partially
 *   booted stack; on any failure an error overlay replaces `mountEl`'s contents
 *   AND the returned promise rejects (a caller awaiting this always finds out).
 *
 * @example
 *   import { bootDoubleSlit } from '@descix/frqtl-sdk';
 *   await bootDoubleSlit('frqtl-mount', { wavelength: 64 });
 */
export async function bootDoubleSlit(mountEl, opts) {
    opts = opts || {};
    var host = resolveMount(mountEl);
    host.innerHTML = '';
    var canvasHost = document.createElement('div');
    canvasHost.setAttribute('data-role', 'frqtl-artifact-canvas');
    canvasHost.id = 'frqtl-artifact-canvas-' + Math.random().toString(36).slice(2);
    host.appendChild(canvasHost);

    var router = engineRouter({ mode: 'cdn', engine: 'wasm', base: opts.base });
    var lists = buildScriptLists(router);

    try {
        await injectSequence(lists.ENGINE);
        await bootEngine(router);
        await injectSequence(lists.RENDERER);
        bootRenderer();
        await injectSequence(lists.GAME);
    } catch (err) {
        paintError(host, 'FRQTL ARTIFACT BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }

    var wavelength = opts.wavelength !== undefined ? opts.wavelength : 64;
    var canvasSize = opts.canvasSize !== undefined ? opts.canvasSize : 480;
    var seed       = opts.seed !== undefined ? opts.seed : 42;
    var onTick     = typeof opts.onTick === 'function' ? opts.onTick : function () {};

    window._egptDefaultRenderer = 'p5';

    return new Promise(function (resolve, reject) {
        bootP5(router, function () {
            try {
                var runner = new window.FrqtlApp({
                    canvasParentId: canvasHost.id,
                    canvasW: canvasSize,
                    canvasH: canvasSize,
                    seed: seed,
                    onTick: onTick
                });
                runner.createCanvas();
                var setupResult = runner.setup(window.setupDoubleSlit, { wavelength: wavelength });
                runner.start();
                resolve({ runner: runner, setupResult: setupResult });
            } catch (err) {
                paintError(host, 'FRQTL ARTIFACT SETUP FAILED', String((err && err.stack) || err));
                reject(err);
            }
        }).catch(function (err) {
            paintError(host, 'FRQTL ARTIFACT BOOT FAILED (p5)', String((err && err.stack) || err));
            reject(err);
        });
    });
}

// ── Generalized renderer boot (p5 OR three) — the bootScene counterpart of
// bootDoubleSlit's p5-only `bootRenderer()`. Mirrors render-boot.js's provider
// selection MINUS the PageParams/`?renderer=`/`?egpt3D=` URL machinery this
// fixed-selection ESM entry does not need. p5 is synchronously ready once its
// provider script has loaded; three needs its runtime fetched first. ─────────

/**
 * Boot the p5 provider (mirrors bootRenderer()/render-boot.js's default branch).
 * @param {EngineRouter} router
 */
function bootP5Renderer(router) {
    if (!window._egptRendererProviders || !window._egptRendererProviders.p5) {
        throw new Error('[frqtl-sdk esm] p5-provider.js did not install window._egptRendererProviders.p5.');
    }
    window._egptRenderer = 'p5';
    registerDisplay(window._egptRendererProviders.p5.makeProvider());
}

/**
 * Boot the three.js provider (mirrors render-boot.js's three branch): load the
 * three runtime from the VENDORED asset (router-resolved — never cdnjs, so the
 * scene boots offline against the local dist / real jsdelivr uniformly), then
 * activate the three RendererProvider. `window._egpt3D` is set BEFORE
 * makeProvider() so the provider's own `_init` reads it (three-provider.js:430).
 *
 * three.min.js r128 ships a UMD wrapper; in a self-contained artifact/scene page
 * there is NO AMD loader alive (unlike the notebook realm's Monaco — the reason
 * render-boot.js uses a scoped eval), so a plain classic `<script>` injection is
 * safe here: the UMD's `typeof define` check reads the real (absent) global and
 * falls through to its plain-global branch, setting `window.THREE`.
 * @param {EngineRouter} router
 * @returns {Promise<void>}
 */
function bootThreeRenderer(router) {
    if (!window._egptRendererProviders || !window._egptRendererProviders.three) {
        throw new Error('[frqtl-sdk esm] three-provider.js did not install window._egptRendererProviders.three.');
    }
    window._egpt3D = true;                 // three-provider._init reads this (perspective 3D)
    window._egptRenderer = 'three';
    var threeUrl = router.resolve('assets/vendor/three.min.js');
    window._egptThreeUrl = threeUrl;       // agree with render-boot.js's lazy-load global
    var ready = (typeof THREE !== 'undefined')
        ? Promise.resolve()
        : injectScript(threeUrl);
    return ready.then(function () {
        if (typeof THREE === 'undefined') {
            throw new Error('[frqtl-sdk esm] three.min.js loaded but window.THREE is undefined (URL: ' + threeUrl + ').');
        }
        registerDisplay(window._egptRendererProviders.three.makeProvider());
    });
}

/**
 * Resolve which renderer a scene uses. `opts.renderer` wins when supplied
 * ('p5'|'three'); otherwise a 3D scene (`opts.is2D === false`) picks three and
 * everything else picks p5 (the 2D default). FAIL-LOUD on an unknown value.
 * @param {object} opts
 * @returns {'p5'|'three'}
 */
function selectRenderer(opts) {
    var r = opts.renderer;
    if (r === undefined || r === null) {
        r = (opts.is2D === false) ? 'three' : 'p5';
    }
    if (r !== 'p5' && r !== 'three') {
        throw new Error('[frqtl-sdk esm] bootScene: unknown opts.renderer "' + r + '" (expected "p5" | "three").');
    }
    return r;
}

/**
 * Apply the one-shot `opts.render` block after the scene has started. Scalar
 * keys go through `runner.setRenderOption(k, v)` (godrays / glowIntensity /
 * shape / renderBaseCanvas / …); the boolean `water:true` queues the built-in
 * water post-process via `runner.renderer.filter(window.Filters.water)`. The
 * caller can still tweak everything live afterwards (setRenderOption is applied
 * every frame). Unknown render options are the renderer provider's concern (it
 * FAILS LOUD on an unsupported capability) — this dispatcher stays permissive.
 * @param {object} runner
 * @param {object} render  the opts.render bag.
 */
function applyRenderBlock(runner, render) {
    Object.keys(render).forEach(function (key) {
        var value = render[key];
        if (key === 'water') {
            if (value) {
                if (!window.Filters || !window.Filters.water) {
                    throw new Error('[frqtl-sdk esm] opts.render.water requested but window.Filters.water is unavailable (Filters.js not loaded?).');
                }
                var prov = runner.renderer;
                if (!prov || typeof prov.filter !== 'function') {
                    throw new Error('[frqtl-sdk esm] opts.render.water requested but the active renderer has no filter() (p5 has no water pass — use renderer:"three").');
                }
                prov.filter(window.Filters.water);
            }
            return;
        }
        runner.setRenderOption(key, value);
    });
}

// Setup-factory NAME whitelist: a window-global identifier. Guards the
// router.resolve('objects/setup/<name>.js') URL join against path traversal /
// injection when `setup` is a string (an agent-supplied value).
var _SETUP_NAME_RE = /^[A-Za-z0-9_]+$/;

/**
 * Boot ANY setup factory into `mountEl` — the generic sibling of
 * `bootDoubleSlit`. Injects the FULL canonical stack (engine + BOTH renderer
 * providers + FX layers + the full game roster via `buildScriptListsFull`), so a
 * 2D or 3D scene with shapes / FX / water all work from one entry.
 *
 * @param {HTMLElement|string} mountEl - A DOM element (or its id) to mount into.
 *   Its existing contents are cleared.
 * @param {string|Function} setup - The setup factory. A STRING is a
 *   window-global NAME resolved as `window[setup]` AFTER the game layer +
 *   `objects/setup/<name>.js` are injected (setup factories are classic injected
 *   scripts, NOT ESM exports — a name is the correct agent-facing API; do NOT try
 *   to `import` them). A raw Function is used as-is (no setup script injected).
 *   FAIL-LOUD if a named factory is not a function after injection.
 * @param {object} [opts]
 * @param {'p5'|'three'} [opts.renderer] - Force the renderer. Default: derived —
 *   `opts.is2D === false` → three, else p5.
 * @param {boolean} [opts.is2D] - Forwarded to the setup factory (a 3D setup like
 *   setupSphereEmitter3D reads `is2D:false`); ALSO the default renderer selector.
 * @param {number} [opts.canvasSize=480] - Square canvas side, in pixels.
 * @param {number} [opts.seed=42] - RNG seed (FrqtlApp).
 * @param {(tickData:object, setupResult:object)=>void} [opts.onTick] - Per-tick callback.
 * @param {object} [opts.setup] - The exact options bag handed to the setup
 *   factory. When OMITTED, the WHOLE `opts` object is passed through (so a caller
 *   can put `preset`, `is2D`, `chargeMode`, `emissionBoxSide`, `fundamentalDimension`,
 *   … at the top level — the sun example does exactly this). When PRESENT it is
 *   authoritative and the top-level keys are NOT forwarded.
 * @param {object} [opts.render] - Optional one-shot render block applied after
 *   start: scalar keys → `runner.setRenderOption(k,v)` (e.g. `shape:'sphere'`,
 *   `godrays:0.8`, `glowIntensity:1.6`, `renderBaseCanvas:false`); `water:true` →
 *   `runner.renderer.filter(window.Filters.water)`. The returned `runner` still
 *   accepts live `setRenderOption(...)` afterwards.
 * @param {string} [opts.base] - **PRE-PUBLISH LOCAL-CDN-MIRROR HARNESS AND TESTS
 *   ONLY** — forwarded to `engineRouter({mode:'cdn', base})`, re-anchoring EVERY
 *   injected URL at a local mirror instead of the real (unpublished) jsdelivr CDN.
 *   Same semantics as `bootDoubleSlit`'s `opts.base` (see that docstring). The
 *   published shell never passes it.
 * @returns {Promise<{runner:object, setupResult:object}>}
 * @throws {Error} FAIL-LOUD — paints an error overlay in `mountEl` and rejects on
 *   any load/compile/engine/renderer/setup failure.
 *
 * @example
 *   import { bootScene } from '@descix/frqtl-sdk';
 *   await bootScene('frqtl-mount', 'setupSphereEmitter3D', {
 *     preset: 'spherical', emissionBoxSide: 0, is2D: false, chargeMode: 'random',
 *     fundamentalDimension: 2, canvasSize: 480, seed: 42,
 *     render: { shape: 'sphere', godrays: 0.8, glowIntensity: 1.6 }
 *   });
 */
export async function bootScene(mountEl, setup, opts) {
    opts = opts || {};
    var host = resolveMount(mountEl);
    host.innerHTML = '';
    var canvasHost = document.createElement('div');
    canvasHost.setAttribute('data-role', 'frqtl-scene-canvas');
    canvasHost.id = 'frqtl-scene-canvas-' + Math.random().toString(36).slice(2);
    host.appendChild(canvasHost);

    var router = engineRouter({ mode: 'cdn', engine: 'wasm', base: opts.base });
    var lists = buildScriptListsFull(router);

    var renderer;
    var setupFn;
    try {
        renderer = selectRenderer(opts);

        await injectSequence(lists.ENGINE);
        await bootEngine(router);
        await injectSequence(lists.RENDERER);
        if (renderer === 'three') {
            await bootThreeRenderer(router);
        } else {
            bootP5Renderer(router);
        }
        await injectSequence(lists.GAME);

        // Resolve the setup factory. A function is used as-is; a string NAME is
        // resolved as a window global AFTER injecting objects/setup/<name>.js
        // (setup factories are classic injected scripts, never ESM exports).
        if (typeof setup === 'function') {
            setupFn = setup;
        } else if (typeof setup === 'string') {
            if (!_SETUP_NAME_RE.test(setup)) {
                throw new Error('[frqtl-sdk esm] bootScene: invalid setup factory name "' + setup +
                    '" (expected a bare identifier matching ' + _SETUP_NAME_RE + ').');
            }
            await injectScript(router.resolve('objects/setup/' + setup + '.js'));
            setupFn = window[setup];
            if (typeof setupFn !== 'function') {
                throw new Error('[frqtl-sdk esm] bootScene: window["' + setup + '"] is not a function after ' +
                    'injecting objects/setup/' + setup + '.js. Injected engine + renderer(' + renderer +
                    ') + full game layer + that setup script — check the factory NAME matches its ' +
                    'window.<name> global (e.g. "setupSphereEmitter3D").');
            }
        } else {
            throw new Error('[frqtl-sdk esm] bootScene(mountEl, setup, opts): `setup` must be a setup-factory ' +
                'NAME (string, resolved as window[name]) or a Function.');
        }
    } catch (err) {
        paintError(host, 'FRQTL SCENE BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }

    var canvasSize = opts.canvasSize !== undefined ? opts.canvasSize : 480;
    var seed       = opts.seed !== undefined ? opts.seed : 42;
    var onTick     = typeof opts.onTick === 'function' ? opts.onTick : function () {};
    // The options bag handed to the setup factory: opts.setup when supplied,
    // else the whole opts object (so top-level preset/is2D/… reach the factory).
    var setupOpts  = opts.setup !== undefined ? opts.setup : opts;

    window._egptDefaultRenderer = renderer;

    return new Promise(function (resolve, reject) {
        // p5 global-mode is the boot trigger for BOTH renderers (the canonical
        // experiment-page pattern): p5 auto-invokes window.setup once loaded, and
        // for the three renderer FrqtlApp.createCanvas delegates to the
        // three provider (p5's own canvas is never created) while the runner owns
        // its own RAF loop — so loading p5 as the trigger is harmless and matches
        // how every 3D experiment page boots.
        bootP5(router, function () {
            try {
                var runner = new window.FrqtlApp({
                    canvasParentId: canvasHost.id,
                    canvasW: canvasSize,
                    canvasH: canvasSize,
                    seed: seed,
                    onTick: onTick
                });
                runner.createCanvas();
                var setupResult = runner.setup(setupFn, setupOpts);
                runner.start();
                if (opts.render && typeof opts.render === 'object') {
                    applyRenderBlock(runner, opts.render);
                }
                resolve({ runner: runner, setupResult: setupResult });
            } catch (err) {
                paintError(host, 'FRQTL SCENE SETUP FAILED', String((err && err.stack) || err));
                reject(err);
            }
        }).catch(function (err) {
            paintError(host, 'FRQTL SCENE BOOT FAILED (p5)', String((err && err.stack) || err));
            reject(err);
        });
    });
}

// ── bootRecipe — the standalone-bundle counterpart of bootScene ──────────────
//
// Where bootScene boots a NAMED setup factory, bootRecipe boots a RECIPE: a
// `buildExperiment(exp)` source (STUDIO's codegen output = a bundle's
// experiment.js) evaluated against a RecipeContext (the Bite-1 recipe facade,
// resolved as the window global the injected game layer provides). renderState is
// applied via the RELOCATED shim contract (renderStateToBootOptions) — load-time
// renderer/egpt3D/seed choose the boot path; render options + camera replay after
// start. Same FAIL-LOUD discipline as bootScene (overlay + reject) — NEVER
// empty/index.html's old swallow-to-false.

/**
 * Apply the POST-START half of a renderState bag to a live runner: render option
 * assignments (each `setRenderOption`) + the camera replay decision. Capability-
 * checked (a 2D runner has no `cameraControl`). Best-effort — a replay value
 * produces the same effect as a user re-selecting it by hand.
 * @param {object} runner
 * @param {{renderOptions:{key:string,value:*}[], camera:object|null}} bootOpts
 */
function applyRecipeRenderState(runner, bootOpts) {
    var ro = bootOpts.renderOptions || [];
    for (var i = 0; i < ro.length; i++) {
        if (ro[i] && typeof ro[i].key === 'string') {
            runner.setRenderOption(ro[i].key, ro[i].value);
        }
    }
    var cam = bootOpts.camera;
    var camCtl = runner.cameraControl;   // capability handle (null in 2D)
    if (cam && camCtl) {
        if (cam.mode === 'preset' && typeof camCtl.setPreset === 'function') {
            camCtl.setPreset(cam.name);
        } else if (cam.mode === 'orbit' && typeof camCtl.setOrbit === 'function') {
            camCtl.setOrbit(cam.orbit);
        }
    }
    // backdropVisible (architect follow-up B): replay a saved backdrop-hidden state in
    // standalone bundles. Mirrors _applyStudioRenderState's backdrop branch — find the
    // recipe's backdrop LO (an LO carrying `.backdrop === true`) and apply `visible`
    // through the canonical accessor. A factory recipe usually has NO backdrop → no-op.
    if (typeof bootOpts.backdropVisible === 'boolean') {
        var los = runner.largeObjects || [];
        var backdrop = null;
        for (var bi = 0; bi < los.length; bi++) {
            if (los[bi] && los[bi].backdrop === true) { backdrop = los[bi]; break; }
        }
        if (backdrop && typeof runner.updateObjectProperty === 'function') {
            try { runner.updateObjectProperty(backdrop, 'visible', bootOpts.backdropVisible); }
            catch (e) { /* best-effort; the active provider may not declare 'visible' for a backdrop */ }
        }
    }
}

/**
 * Boot a `buildExperiment(exp)` RECIPE into `mountEl` — the standalone-bundle
 * entry (a bundle's `index.html` calls exactly this).
 *
 * @param {HTMLElement|string} mountEl - A DOM element (or its id) to mount into.
 *   Its existing contents are cleared.
 * @param {string} recipeSource - The `buildExperiment(exp)` module source (the
 *   bundle's `experiment.js`). Evaluated same-origin; it must define
 *   `buildExperiment` (its dual-mode tail sets `window.buildExperiment`).
 *   FAIL-LOUD if it does not.
 * @param {object} [opts]
 * @param {string[]} [opts.scripts] - OPAQUE frqtl-relative setup-factory delta
 *   (e.g. ['objects/setup/setupSphereEmitter3D.js']) injected via engineRouter.resolve
 *   BEFORE the recipe is eval'd, so a recipe whose source calls a setup factory
 *   resolves that window global. FAIL-LOUD if a script fails to load. (DX-3.)
 * @param {object} [opts.renderState] - A saved renderState bag (raw or normalized);
 *   translated via the shim `renderStateToBootOptions` — renderer/egpt3D/seed pick
 *   the boot path, render options + camera replay after start.
 * @param {number} [opts.canvasW=600] - Canvas width (RecipeContext default).
 * @param {number} [opts.canvasH=400] - Canvas height.
 * @param {number} [opts.seed] - RNG seed override (else renderState.seed, else 42).
 * @param {(tickData:object, setupResult:object)=>void} [opts.onTick] - Per-tick callback.
 * @param {string} [opts.base] - PRE-PUBLISH LOCAL-CDN-MIRROR HARNESS ONLY (same
 *   semantics as bootScene's opts.base). The published bundle never passes it.
 * @returns {Promise<{runner:object, recipeContext:object}>}
 * @throws {Error} FAIL-LOUD — paints an overlay in mountEl and rejects on any
 *   load/compile/engine/renderer/recipe failure.
 *
 * @example
 *   import { bootRecipe } from '@descix/frqtl-sdk';
 *   const src = await (await fetch('./experiment.js')).text();
 *   await bootRecipe('frqtl-mount', src, { renderState });
 */
export async function bootRecipe(mountEl, recipeSource, opts) {
    opts = opts || {};
    if (typeof recipeSource !== 'string' || recipeSource.length === 0) {
        throw new Error('[frqtl-sdk esm] bootRecipe(mountEl, recipeSource, opts): recipeSource must be a non-empty string.');
    }
    var host = resolveMount(mountEl);
    host.innerHTML = '';
    var canvasHost = document.createElement('div');
    canvasHost.setAttribute('data-role', 'frqtl-recipe-canvas');
    canvasHost.id = 'frqtl-recipe-canvas-' + Math.random().toString(36).slice(2);
    host.appendChild(canvasHost);

    // Translate the renderState bag ONCE via the shim contract owner.
    var bootOpts = renderStateToBootOptions(opts.renderState || null);
    var renderer = bootOpts.renderer || (bootOpts.egpt3D ? 'three' : 'p5');
    if (renderer !== 'p5' && renderer !== 'three') {
        throw new Error('[frqtl-sdk esm] bootRecipe: renderState.renderer "' + renderer + '" is invalid (expected "p5"|"three").');
    }

    var router = engineRouter({ mode: 'cdn', engine: 'wasm', base: opts.base });
    var lists = buildScriptListsFull(router);

    try {
        await injectSequence(lists.ENGINE);
        await bootEngine(router);
        await injectSequence(lists.RENDERER);
        if (renderer === 'three') {
            await bootThreeRenderer(router);
        } else {
            bootP5Renderer(router);
        }
        await injectSequence(lists.GAME);

        // DX-3: inject the recipe's per-recipe setup-factory DELTA (opts.scripts,
        // frqtl-relative paths) BEFORE eval, resolved through the SAME engineRouter
        // path authority the game layer uses — so a ferried recipe whose source calls
        // a setup factory (e.g. setupSphereEmitter3D) resolves that window global.
        // FAIL-LOUD: injectScript rejects on any load failure → the catch below.
        var _recipeScripts = Array.isArray(opts.scripts) ? opts.scripts : [];
        for (var _si = 0; _si < _recipeScripts.length; _si++) {
            if (typeof _recipeScripts[_si] === 'string' && _recipeScripts[_si]) {
                await injectScript(router.resolve(_recipeScripts[_si]));
            }
        }

        // Evaluate the recipe source — it defines window.buildExperiment (its
        // classic dual-mode tail, same as STUDIO's empty page load-by-eval path).
        (0, eval)(recipeSource);
        if (typeof window.buildExperiment !== 'function') {
            throw new Error('[frqtl-sdk esm] bootRecipe: recipe source did not define buildExperiment(exp).');
        }
        if (typeof window.RecipeContext !== 'function') {
            throw new Error('[frqtl-sdk esm] bootRecipe: window.RecipeContext missing (game layer did not inject RecipeContext.js).');
        }
    } catch (err) {
        paintError(host, 'FRQTL RECIPE BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }

    var canvasW = opts.canvasW !== undefined ? opts.canvasW : 600;
    var canvasH = opts.canvasH !== undefined ? opts.canvasH : 400;
    var seed = (opts.seed !== undefined) ? opts.seed
        : (bootOpts.seed != null ? Number(bootOpts.seed) : 42);
    var onTick = typeof opts.onTick === 'function' ? opts.onTick : function () {};

    window._egptDefaultRenderer = renderer;
    var buildExperiment = window.buildExperiment;
    var RecipeContext = window.RecipeContext;

    return new Promise(function (resolve, reject) {
        bootP5(router, function () {
            try {
                var exp = new RecipeContext({
                    canvasParentId: canvasHost.id,
                    canvasW: canvasW,
                    canvasH: canvasH,
                    seed: seed,
                    onTick: onTick
                });
                // build (runs the recipe: exp.init + exp.addObject) then start.
                exp.build(buildExperiment);
                exp.runner.start();
                applyRecipeRenderState(exp.runner, bootOpts);
                resolve({ runner: exp.runner, recipeContext: exp });
            } catch (err) {
                paintError(host, 'FRQTL RECIPE SETUP FAILED', String((err && err.stack) || err));
                reject(err);
            }
        }).catch(function (err) {
            paintError(host, 'FRQTL RECIPE BOOT FAILED (p5)', String((err && err.stack) || err));
            reject(err);
        });
    });
}
