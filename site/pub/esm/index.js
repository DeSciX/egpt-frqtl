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
 * never hand-derived — in the SAME canonical order stack-boot.js uses, drawn
 * from the manifest owners (`lib/shim/engine/{shim-contract,renderer-layer,
 * game-layer}-manifest.js`), then exposes ONE promise-returning function per
 * showcased experiment.
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
 *     it injects the same manifest-owned lists itself, resolved through
 *     `engineRouter({mode:'cdn'})`.
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
 *     FAIL-LOUD discipline as `bootDoubleSlit`; both end in the ONE runner
 *     tail `startSketch` (world step → parts → engine init gate → start →
 *     resolve on the runner's first tick), never a second boot sequence.
 *
 *   BOOT_SCENE_RESERVED_KEYS / splitSceneOpts(opts) → { boot, setup }
 *     The one table of keys `bootScene` itself owns, and the one splitter
 *     every caller (and test) consumes — the factory bag is what is left.
 *
 *   bootRecipe(mountEl, recipeSource, opts?) → Promise<{ runner, recipeContext, retainedRenderRows }>
 *     The standalone-bundle counterpart of `bootScene`: boots a
 *     `buildExperiment(exp)` RECIPE (STUDIO codegen output = a bundle's
 *     `experiment.js`) against a RecipeContext, applying a saved renderState bag
 *     via the shim `renderStateToBootOptions` + `partitionRenderRows` contract. A recipe bundle's
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
import { renderStateToBootOptions, partitionRenderRows } from '../ide/render-state/index.js';

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

// ── The canonical script lists — stack-boot.js's full canonical order, drawn
// from the manifest owners. Every URL is resolved through engineRouter — NEVER
// hand-derived. ─────────────────────────────────────────────────────────────

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
 * All three lists are `buildScriptListsFull`'s — the manifest owners' lists,
 * consumed, never re-typed — plus the ONE per-experiment setup factory
 * (objects/setup/setupDoubleSlit.js) appended to GAME. This entry used to carry
 * its own hand-copied "double-slit subset" of the RENDERER and GAME rosters, and
 * both drifted as the manifests grew (compat/renderer/display-slot.js, c32239a8;
 * objects/schema/valueNormalizer.js): dist/artifact/double-slit.html then died
 * at boot on every load, unmeasured, because that page's import map is the
 * jsdelivr pin and nothing local ever loaded it.
 *
 * @param {import('../ide/engine/router.js').EngineRouter} router
 * @returns {{ENGINE: Array<{src:string}>, RENDERER: Array<{src:string}>, GAME: Array<{src:string}>}}
 */
export function buildScriptLists(router) {
    var full = buildScriptListsFull(router);
    // Per-experiment setup factory — NOT part of the shared game layer (the
    // "data-page-scripts" idiom every canonical experiment page uses; bootScene
    // injects the ONE it was asked for after the GAME sequence the same way).
    var GAME = full.GAME.concat([{ src: router.resolve('objects/setup/setupDoubleSlit.js') }]);
    return { ENGINE: full.ENGINE, RENDERER: full.RENDERER, GAME: GAME };
}

/**
 * The FULL canonical stack `bootScene` injects so ANY setup factory works (2D or
 * 3D, p5 or three, with shapes / FX / water) — and the owner of every list
 * `buildScriptLists` (the double-slit entry) consumes:
 *
 *   ENGINE   — chroma → Rectangle → WASM compat + the FULL shim-contract list
 *              (ast-schema / frame-data are needed by actionCompiler and by
 *              RenderShape/RenderMesh at module-eval time; page-params /
 *              field-descriptor / controls / rpc ride along — loading the
 *              canonical list IN FULL means a manifest addition is picked up
 *              with no matching edit here). Scene-independent.
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

// ── THE DISPLAY SLOT — shared by both renderer boots below. ───────────────

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

// ── p5 global-mode boot (the same "defer p5 until engine+renderer are live"
// rule every experiment page gets from window._egptStartSketch — see stack-boot.js's
// docstring §THE ONE BOOT DANCE). ───────────────────────────────────────────

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
        bootP5Renderer(router);
        await injectSequence(lists.GAME);
    } catch (err) {
        paintError(host, 'FRQTL ARTIFACT BOOT FAILED', String((err && err.stack) || err));
        throw err;
    }

    var wavelength = opts.wavelength !== undefined ? opts.wavelength : 64;

    window._egptDefaultRenderer = 'p5';

    return startSketch({
        host: host,
        canvasHost: canvasHost,
        router: router,
        label: 'ARTIFACT',
        canvasSize: opts.canvasSize !== undefined ? opts.canvasSize : 480,
        seed: opts.seed !== undefined ? opts.seed : 42,
        onTick: typeof opts.onTick === 'function' ? opts.onTick : function () {},
        setupFn: window.setupDoubleSlit,
        setupOpts: { wavelength: wavelength },
        render: undefined
    });
}

// ── The ONE runner tail — bootDoubleSlit and bootScene both end here ──────────
//
// Construct the runner → `runner.setup(factory, opts)` (the runner's ONE boot
// sequence: the factory's WORLD step when it exports one, then the PART step) →
// the engine's own init gate → start → resolve on the runner's FIRST TICK. Two entries, one sequence. The sequence used to be
// re-derived in each entry and the copies drifted: bootScene forwarded its own
// reserved keys into the factory's strict option validator, and ran no world
// step at all — the universe was never init'd, `doTick()` threw on every
// animation frame, and the promise had already resolved (measured 2026-09-28,
// dist/artifact/sun.html on 0.3.0).
//
// THE WORLD STEP IS THE SKETCH'S (docs/internal/engine/THE_MINIMAL_SIM.md:
// world.init() FIRST → CONSTRUCT parts → WIRE → RUN). A factory that constructs
// a PART exports its implied world as `factory.initWorld(universe, opts)`, and
// `FrqtlApp.setup` runs it before the part (and `restart()` replays both); a
// factory that owns its world (setupDoubleSlit) exports none and inits inside.
// This tail neither calls initWorld nor derives a universe.init argument: the
// runner owns the boot sequence.
//
// READINESS IS THE RUNNER'S, NEVER THIS FILE'S SAY-SO. The promise resolves
// from `runner.firstTick(...)` — FrqtlApp's own promise for its first DELIVERED
// tick, whose deadline runs only while the document is visible (the tick clock
// is requestAnimationFrame, which a hidden document suspends). This tail holds
// no readiness logic of its own: it awaits the runner. Before start, the
// engine's own gate is asked: reading `universe.fundamentalDimension` goes
// through EGPTUniverse._ensureInit, so a raw (never-init'd) world throws the
// engine's own "init() must be called" error HERE — overlay + rejection —
// instead of uncaught on every frame. A started runner that delivers no tick
// within FIRST_TICK_DEADLINE_MS of visible time is stopped by the runner and
// the promise rejects naming the runner and the deadline.

var FIRST_TICK_DEADLINE_MS = 15000;

/**
 * @param {object} spec
 * @param {HTMLElement} spec.host - the mount (overlay target).
 * @param {HTMLElement} spec.canvasHost - the canvas parent created by the entry.
 * @param {EngineRouter} spec.router
 * @param {string} spec.label - 'ARTIFACT' | 'SCENE' — the overlay title stem.
 * @param {number} spec.canvasSize
 * @param {number} spec.seed
 * @param {Function} spec.onTick
 * @param {Function} spec.setupFn - the setup factory (a PART constructor, or a
 *   self-world-owning factory).
 * @param {object} spec.setupOpts - the factory's bag — ALREADY split from the
 *   entry's own keys (see splitSceneOpts); passed verbatim to `runner.setup`, which
 *   hands it to BOTH the factory's `initWorld` (when exported) and the factory.
 * @param {object|undefined} spec.render - one-shot `runner.setRenderOptions` batch.
 * @returns {Promise<{runner:object, setupResult:object}>}
 */
function startSketch(spec) {
    var host = spec.host;
    var label = spec.label;
    return new Promise(function (resolve, reject) {
        // p5 global-mode is the boot trigger for BOTH renderers (the canonical
        // experiment-page pattern): p5 auto-invokes window.setup once loaded, and
        // for the three renderer FrqtlApp.createCanvas delegates to the three
        // provider (p5's own canvas is never created) while the runner owns its
        // own RAF loop — so loading p5 as the trigger is harmless and matches how
        // every 3D experiment page boots.
        bootP5(spec.router, function () {
            var runner;
            var setupResult;
            try {
                runner = new window.FrqtlApp({
                    canvasParentId: spec.canvasHost.id,
                    canvasW: spec.canvasSize,
                    canvasH: spec.canvasSize,
                    seed: spec.seed,
                    onTick: spec.onTick
                });
                runner.createCanvas();
                setupResult = runner.setup(spec.setupFn, spec.setupOpts);     // 1-2. WORLD then PARTS (the runner's one boot sequence)
                void runner.universe.fundamentalDimension;                     // 3. the ENGINE's init gate (throws on a raw world)
            } catch (err) {
                paintError(host, 'FRQTL ' + label + ' SETUP FAILED', String((err && err.stack) || err));
                reject(err);
                return;
            }
            try {
                runner.start();                                                // 4. RUN
                if (spec.render !== undefined) {
                    runner.setRenderOptions(spec.render);
                }
            } catch (err) {
                runner.stop();
                paintError(host, 'FRQTL ' + label + ' SETUP FAILED', String((err && err.stack) || err));
                reject(err);
                return;
            }
            // 5. LIVE = the runner's first tick. Taken AFTER start()/setRenderOptions have
            // succeeded, in the SAME task: requestAnimationFrame never runs a callback
            // synchronously, so no tick can be delivered before this listener exists —
            // and a boot that failed above leaves no pending wait behind to expire later
            // and overwrite the correct SETUP FAILED overlay with NEVER TICKED.
            var live = runner.firstTick({ deadlineMs: FIRST_TICK_DEADLINE_MS });
            live.then(function () {
                resolve({ runner: runner, setupResult: setupResult });
            }, function (err) {
                var named = new Error('[frqtl-sdk esm] ' + label.toLowerCase() + ': FIRST_TICK_DEADLINE_MS = ' +
                    FIRST_TICK_DEADLINE_MS + ' ms — ' + String((err && err.message) || err));
                paintError(host, 'FRQTL ' + label + ' NEVER TICKED', String(named.stack || named));
                reject(named);
            });
        }).catch(function (err) {
            paintError(host, 'FRQTL ' + label + ' BOOT FAILED (p5)', String((err && err.stack) || err));
            reject(err);
        });
    });
}

// ── bootScene's own keys — ONE table, ONE splitter ───────────────────────────
//
// Every key below is read by `bootScene` itself and is NEVER a factory option.
// The factory bag is whatever is left, so an author writes preset/is2D/… beside
// canvasSize/seed/render in one flat object (the corpus record and
// src/artifact/sun.html do exactly that) and the factory's strict option
// validator only ever sees its own vocabulary. `is2D` is deliberately NOT here:
// it is a factory option (setupSphereEmitter3D.OPTIONS) that the renderer
// selector also reads from the factory bag.

/** @type {string[]} */
export var BOOT_SCENE_RESERVED_KEYS = ['base', 'canvasSize', 'seed', 'render', 'renderer', 'onTick', 'setup'];

/**
 * Split a `bootScene` opts bag into the entry's own keys and the factory's bag.
 *
 * - `opts.setup` ABSENT: `setup` = every non-reserved top-level key.
 * - `opts.setup` PRESENT: it IS the factory bag, verbatim; any OTHER non-reserved
 *   top-level key is a throw (it would otherwise be silently dropped — the
 *   silent-drop class this table exists to end).
 *
 * @param {object} [opts]
 * @returns {{boot:object, setup:object}}
 */
export function splitSceneOpts(opts) {
    opts = opts || {};
    var boot = {};
    var setup = {};
    for (var k in opts) {
        if (!Object.prototype.hasOwnProperty.call(opts, k)) { continue; }
        if (BOOT_SCENE_RESERVED_KEYS.indexOf(k) !== -1) { boot[k] = opts[k]; } else { setup[k] = opts[k]; }
    }
    if (boot.setup !== undefined) {
        if (boot.setup === null || typeof boot.setup !== 'object') {
            throw new Error('[frqtl-sdk esm] bootScene: opts.setup must be the factory\'s options object (got ' +
                typeof boot.setup + ').');
        }
        var stray = Object.keys(setup);
        if (stray.length) {
            throw new Error('[frqtl-sdk esm] bootScene: opts.setup is the factory bag, so the top-level key(s) ' +
                stray.join(', ') + ' would be silently dropped. Move them into opts.setup, or drop opts.setup ' +
                'and keep everything at the top level (reserved keys: ' + BOOT_SCENE_RESERVED_KEYS.join(', ') + ').');
        }
        setup = boot.setup;
    }
    return { boot: boot, setup: setup };
}

// ── Renderer boot (p5 OR three), shared by both entries. Mirrors render-boot.js's provider
// selection MINUS the PageParams/`?renderer=`/`?egpt3D=` URL machinery this
// fixed-selection ESM entry does not need. p5 is synchronously ready once its
// provider script has loaded; three needs its runtime fetched first. ─────────

/**
 * Boot the p5 provider (mirrors render-boot.js's default branch).
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
 * Resolve which renderer a scene uses. `boot.renderer` wins when supplied
 * ('p5'|'three'); otherwise a 3D scene (`setup.is2D === false` — a FACTORY
 * option, read from the factory bag) picks three and everything else picks p5
 * (the 2D default). FAIL-LOUD on an unknown value.
 * @param {object} boot - the entry's own keys (splitSceneOpts().boot)
 * @param {object} setup - the factory bag (splitSceneOpts().setup)
 * @returns {'p5'|'three'}
 */
function selectRenderer(boot, setup) {
    var r = boot.renderer;
    if (r === undefined || r === null) {
        r = (setup.is2D === false) ? 'three' : 'p5';
    }
    if (r !== 'p5' && r !== 'three') {
        throw new Error('[frqtl-sdk esm] bootScene: unknown opts.renderer "' + r + '" (expected "p5" | "three").');
    }
    return r;
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
 *   factory. When OMITTED, every key NOT in `BOOT_SCENE_RESERVED_KEYS` is the
 *   factory bag (so `preset`, `is2D`, `chargeMode`, `emissionBoxSide`,
 *   `fundamentalDimension`, … sit at the top level beside `canvasSize`/`seed`/
 *   `render` — the sun example does exactly this — and the entry's own keys never
 *   reach the factory's strict option validator). When PRESENT it is the factory
 *   bag verbatim, and any other non-reserved top-level key is a THROW (never a
 *   silent drop). The split is `splitSceneOpts(opts)`, exported.
 * @param {object} [opts.render] - Optional one-shot render block applied after
 *   start as ONE `runner.setRenderOptions(render)` batch (e.g. `shape:'sphere'`,
 *   `godrays:0.8`, `glowIntensity:1.6`, `renderBaseCanvas:false`,
 *   `'filter.water':1`). Every key must be a capability the renderer declares —
 *   `runner.renderCapabilities()` lists them — or the boot rejects. The returned
 *   `runner` still accepts live `setRenderOption(...)` afterwards.
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
    var host = resolveMount(mountEl);
    host.innerHTML = '';
    var canvasHost = document.createElement('div');
    canvasHost.setAttribute('data-role', 'frqtl-scene-canvas');
    canvasHost.id = 'frqtl-scene-canvas-' + Math.random().toString(36).slice(2);
    host.appendChild(canvasHost);

    var split;
    var router;
    var lists;
    var renderer;
    var setupFn;
    try {
        split = splitSceneOpts(opts);
        router = engineRouter({ mode: 'cdn', engine: 'wasm', base: split.boot.base });
        lists = buildScriptListsFull(router);
        renderer = selectRenderer(split.boot, split.setup);

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

    var boot = split.boot;

    window._egptDefaultRenderer = renderer;

    return startSketch({
        host: host,
        canvasHost: canvasHost,
        router: router,
        label: 'SCENE',
        canvasSize: boot.canvasSize !== undefined ? boot.canvasSize : 480,
        seed: boot.seed !== undefined ? boot.seed : 42,
        onTick: typeof boot.onTick === 'function' ? boot.onTick : function () {},
        setupFn: setupFn,
        setupOpts: split.setup,
        render: boot.render
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
 * Apply the POST-START half of a renderState bag to a live runner: the render rows,
 * partitioned against the ACTIVE renderer (`partitionRenderRows` — declared rows apply as
 * ONE `setRenderOptions` batch, rows another registered renderer declares are retained and
 * returned, a row no renderer declares throws) + the camera replay decision (a 2D runner
 * has no `cameraControl`).
 * @param {object} runner
 * @param {{renderOptions:{key:string,value:*}[], camera:object|null}} bootOpts
 * @returns {{key:string, value:*}[]} the retained rows (declared only by another renderer).
 */
function applyRecipeRenderState(runner, bootOpts) {
    if (!window.RenderCapabilitiesCommon) {
        throw new Error('[frqtl-sdk esm] bootRecipe: window.RenderCapabilitiesCommon missing (the renderer ' +
            'layer did not inject renderCapabilities-common.js).');
    }
    var parts = partitionRenderRows(
        bootOpts.renderOptions || [],
        runner.renderCapabilities().map(function (c) { return c.name; }),
        window.RenderCapabilitiesCommon.knownRenderCapabilityNames(window._egptRendererProviders)
    );
    runner.setRenderOptions(parts.apply);
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
    return parts.retained;
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
 * @returns {Promise<{runner:object, recipeContext:object, retainedRenderRows:{key:string, value:*}[]}>}
 *   `retainedRenderRows` — saved render rows another registered renderer declares but this
 *   one does not (not applied; see `partitionRenderRows`).
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
                var retainedRenderRows = applyRecipeRenderState(exp.runner, bootOpts);
                resolve({ runner: exp.runner, recipeContext: exp, retainedRenderRows: retainedRenderRows });
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
