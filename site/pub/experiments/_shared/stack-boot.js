/* Copyright 2023-2026 by Essam Abadir */

/**
 * stack-boot.js — canonical ONE-ORDER shared loader for experiment pages.
 *
 * The canonical injection order for the game layer is defined in the ESM
 * manifest at lib/shim/engine/game-layer-manifest.js (GAME_LAYER_SCRIPTS).
 * Because stack-boot is a classic browser-injected script (not ESM) it cannot
 * import that module, so the GAME array below is a literal copy. The parity
 * test lib/shim/engine/test/game-layer-manifest.test.mjs enforces 1:1 order
 * equality between this literal and GAME_LAYER_SCRIPTS — drift is a CI failure.
 *
 * USAGE on each experiment page:
 *
 *   <!-- 1. WASM pkg URL (required, must be before this tag) -->
 *   <script>window._egptWasmPkgUrl = new URL("../../../fat/pkg-web/egpt_wasm.js",
 *       document.baseURI).href;</script>
 *   <!-- 2. Shared loader — lists page-specific extras in data-page-scripts -->
 *   <script src="../_shared/stack-boot.js"
 *       data-page-scripts="
 *           ../../objects/setup/setupParticleWalk.js,
 *           ../_shared/experiment-metrics.js
 *       "></script>
 *
 * data-page-scripts: comma-separated list of URLs to inject IN ORDER after the
 * game layer (FrqtlApp). Use paths relative to the experiment page.
 * These are injected BEFORE the sketch script runs (they appear here in the
 * HTML just before the sketch <script>). Because they are loaded by stack-boot
 * (not as static <script> tags), window.LargeObject / window.QuantumEmitter /
 * etc. are guaranteed to be available when each file executes.
 *
 * After this tag the page keeps ONLY:
 *   - Its experiment sketch <script> block (calls window._egptWhenEngineReady etc.)
 *   - Its controls/layout markup
 *   - Any vendor extras placed BEFORE this tag that must load first (idempotent)
 *
 * ── CANONICAL INJECTION ORDER ───────────────────────────────────────────────
 *
 *   ENGINE:
 *     chroma.min.js            — color mapping (must precede LightColor)
 *     objects/geometry/Rectangle.js — the sole spatial-rect authority (window.Rectangle)
 *     wasm-engine.js           — WASM engine provider
 *     wasm-load-browser.js     — WASM loader
 *     egpt-engine.js           — unified compat layer
 *     /lib/shim/expr/ast-schema.js       — op-program AST node-kind vocabulary
 *     /lib/shim/frame-data/index.js      — data-bubble + render-intent VALUE contract
 *     /lib/shim/page-params/index.js     — URL-param routing-table contract (Bite 3)
 *     /lib/shim/field-descriptor/index.js — field-shape vocabulary contract (§7 r2 C1)
 *     /lib/shim/controls/index.js        — control-descriptor schema contract (Bite 1)
 *     /lib/shim/controls/registry.js     — runtime instance registry (AFTER index.js)
 *     engine-boot.js           — FAIL-LOUD engine selection
 *
 *   RENDERER:
 *     LightColor.js            — single color source
 *     RenderTiers.js           — per-layer-range render-tier table (2026-07-02)
 *     FieldBuilder.js          — height-field builder (before providers)
 *     renderCapabilities-common.js — shared universal-knob + filter-loop owner
 *       (WS Studio Controls Realignment S5b) — MUST load before providers
 *       (their renderCapabilities() resolves window.RenderCapabilitiesCommon
 *       at call time)
 *     captureStill-common.js   — shared pixel-readback + still-bag owner for the
 *       OPTIONAL captureStill() capability — MUST load before providers (they
 *       resolve window.CaptureStillCommon at call time)
 *     p5-provider.js           — p5 2.x RendererProvider
 *     three-provider.js        — three.js RendererProvider
 *     Filters.js               — built-in shader filter specs
 *     render-boot.js           — FAIL-LOUD renderer selection
 *
 *   GAME LAYER (canonical order from game-layer-manifest.js GAME_LAYER_SCRIPTS):
 *     CollisionTypes.js, CollisionActions.js, Charge.js, Rectangle.js
 *     LargeObject.js, QuantumEmitter.js, PointSource.js
 *     DetectorWall.js, slitLinerScatter.js, SlitScreen.js, SlitLightSource.js
 *     EgptFractal.js, Box.js (BEFORE OvenBox — eval-time dep), OvenBox.js
 *     CircuitGate.js, CircuitProbe.js
 *     Tube.js, directedRedirectProgram.js, DirectedTunnel.js (DIRECTED TUNNEL
 *       BUILD, 2026-07-13 — DirectedTunnel extends Tube; needs Tube.js +
 *       slitLinerScatter.js, both loaded earlier)
 *     controlBind.js, makeControlsForObject.js, makeControlsForRenderSurface.js
 *       (§7 r2, Bite S5a — the render-side factory twin), frqtl-control-slider.js,
 *       frqtl-controls-panel.js (WS Studio Controls Realignment S3 — SAME
 *       promotion move: Studio's author iframe needs these available
 *       regardless of which page is loaded)
 *     frqtl-control-write-queue.js (WS Studio Controls Realignment S4 —
 *       SAME promotion move; the rAF-coalesced write-side symmetric
 *       primitive to frqtl-control-sync.js's pull side)
 *     schema/index.js, ObjectFactory.js, instruments/capture.js (the tap
 *       MECHANISM), FrqtlApp.js, Experiment.js,
 *     RecipeContext.js
 *
 *   PAGE SCRIPTS (data-page-scripts):
 *     — per-page objects, setup factories, and _shared helpers
 *       guaranteed to run AFTER FrqtlApp is in the global scope
 *
 * ── DEFERRED-p5 DISCIPLINE ─────────────────────────────────────────────────
 *
 *   p5 is NOT injected here. Each page's sketch must load it after BOTH
 *   engine AND renderer are live:
 *
 *     window._egptWhenEngineReady(function () {
 *         window._egptWhenRendererReady(function () {
 *             var s = document.createElement('script');
 *             s.src = '../../assets/vendor/p5.min.js';
 *             document.body.appendChild(s);
 *         });
 *     });
 *
 * ── EARLY SHIMS ────────────────────────────────────────────────────────────
 *
 *   stack-boot.js installs synchronous queue-shims for both
 *   window._egptWhenEngineReady and window._egptWhenRendererReady so the
 *   sketch <script> block (which executes after this <script> tag is parsed
 *   but BEFORE the async chain completes) can register callbacks immediately.
 *   The shims drain their queues once engine-boot.js and render-boot.js have
 *   run and replaced the shims with real implementations.
 *
 * ── IDEMPOTENT / FAIL-LOUD ─────────────────────────────────────────────────
 *
 *   Each src is injected at most once. Any load failure surfaces as a visible
 *   overlay — no silent fallback.
 */

(function () {
    'use strict';

    /* ── Capture currentScript synchronously (invalid after parse) ──────── */
    var _tag = document.currentScript;

    /* ── frqtl base URL ────────────────────────────────────────────────────
       This file is at frqtl/experiments/_shared/stack-boot.js.
       Derive the frqtl root by stripping 3 path segments.                  */
    var _base = (function () {
        var src = _tag && _tag.src;
        if (src) {
            var p = src.split('/');
            p.pop();  // stack-boot.js
            p.pop();  // _shared
            p.pop();  // experiments
            return p.join('/') + '/';
        }
        return '/frqtl/';
    })();

    /* ── Page-specific scripts from data-page-scripts attribute ─────────── */
    var _pageScripts = (function () {
        var raw = _tag && _tag.getAttribute('data-page-scripts');
        if (!raw) { return []; }
        return raw.split(',').map(function (s) {
            var trimmed = s.trim();
            if (!trimmed) { return null; }
            /* data-page-scripts paths are relative to the experiment page.
               We resolve them from the page's base URL.                    */
            if (trimmed.indexOf('http') === 0 || trimmed.indexOf('/') === 0) {
                return { src: trimmed };
            }
            /* Relative path — resolve from document.baseURI which is the page URL */
            try {
                return { src: new URL(trimmed, document.baseURI).href };
            } catch (e) {
                return { src: trimmed };
            }
        }).filter(Boolean);
    })();

    /* ── Path resolution — router-driven (RED TEAM BLOCKER 2, ws-egpt-frqtl-site-deploy) ──
       Consult the router's SINGLE browser projection window._egptEnginePathMap — the
       SAME omit/remap map lib/components/graphics-render/index.js _url() reads (it is
       DIST_PROFILE-derived, the one path authority). First matching prefix wins in
       insertion order; a '' replacement is the router's __distOmit signal → returns ''
       so _inject() SKIPS the tag, exactly like engineScripts()/_injectScript skip empty
       resolves. When no map is present (dev-core) it falls through to _base + rel. */
    function _u(rel) {
        var map = window._egptEnginePathMap;
        if (map && typeof map === 'object') {
            var keys = Object.keys(map);
            for (var i = 0; i < keys.length; i++) {
                var prefix = keys[i];
                if (rel === prefix || rel.indexOf(prefix) === 0) {
                    return map[prefix] + rel.slice(prefix.length);
                }
            }
        }
        // No-map (dev-core) fallback. The 'shim/' contract scripts (ast-schema.js,
        // frame-data/index.js, controls/*, rpc/index.js, ...) live at the /lib/shim
        // mount — a SEPARATE dev mount from _base's /frqtl — so they cannot resolve
        // through _base. Fall through to the /lib/shim absolute literal: byte-identical
        // to the prior hardcoded '/lib/shim/...' ENGINE entries AND to
        // DEV_CORE_PROFILE's 'shim/' value (router.js, the dev-core path authority).
        // In dist/static the projected map's 'shim/' key (build.js, DIST_PROFILE-
        // derived) is matched above, so this branch is dev-only. Every OTHER prefix
        // resolves under /frqtl via _base — byte-identical to the prior behavior.
        if (rel === 'shim/' || rel.indexOf('shim/') === 0) {
            return '/lib/shim/' + rel.slice('shim/'.length);
        }
        return _base + rel;
    }

    /* ── chrome=canvas mode ───────────────────────────────────────────────
       ?chrome=canvas: hide all control/metric chrome so the canvas fills the
       viewport. Used by gallery tiles and the landing splash.

       Implementation: set data-chrome="canvas" on <html> immediately so CSS
       can suppress chrome elements before they paint. The consumer (experiment-
       layout.css) uses structural selectors — no per-experiment fork needed.

       FAIL-LOUD: any non-empty value other than "canvas" renders an error
       overlay via the shared stack-boot style and does NOT throw (so the
       overlay itself remains visible).

       Known value:
         canvas — hide chrome panels; canvas/histogram rows fill the viewport.
    */
    (function _applyChrome() {
        var params;
        try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
        var chrome = params.get('chrome');
        if (!chrome) { return; }
        if (chrome === 'canvas') {
            document.documentElement.setAttribute('data-chrome', 'canvas');
            window._egptChromeMode = 'canvas';
            return;
        }
        /* Unknown value — FAIL-LOUD */
        var msg = '[stack-boot] Unknown ?chrome= value: "' + chrome + '". ' +
            'Accepted value: "canvas". Remove the param to use full chrome.';
        if (window.console && console.error) { console.error(msg); }
        /* Render visible overlay using the shared stack-boot error style.
           Do NOT throw — let the page boot so the overlay remains readable. */
        var b = document.createElement('div');
        b.id = 'egpt-chrome-error';
        b.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a0000;' +
            'color:#ff6b6b;font:13px/1.55 ui-monospace,monospace;padding:22px;' +
            'white-space:pre-wrap;overflow:auto;border:2px solid #b6161c;';
        b.textContent = msg;
        (document.body || document.documentElement).appendChild(b);
    }());

    /* ── EARLY SHIM: window._egptWhenEngineReady ───────────────────────────
       Installs a queue-shim synchronously so the sketch <script> can call
       _egptWhenEngineReady immediately (before engine-boot.js loads).
       engine-boot.js will replace this with the real implementation; we
       drain the queue immediately after injecting engine-boot.js.
       (onReady, onError) — WS gym-controls-as-sugar fix-loop #6 Finding A:
       an OPTIONAL second callback fired if the engine fails to boot. Queued
       as a PAIR (not a bare fn) so the drain below can forward BOTH to the
       real implementation once it replaces this shim — a caller that only
       ever passed one argument (every existing call site except
       GraphicsPane.boot()'s new one) is unaffected: `onError` is simply
       `undefined` and the real implementation's `typeof onError ===
       'function'` guard (engine-boot.js) never invokes it.               */
    if (typeof window._egptWhenEngineReady !== 'function') {
        var _engineQueue = [];
        window._egptWhenEngineReady = function (onReady, onError) {
            _engineQueue.push({ onReady: onReady, onError: onError });
        };
        window._egptStackBootEngineQueue = _engineQueue;
    }

    /* ── EARLY SHIM: window._egptWhenRendererReady ─────────────────────────
       Same pattern for the renderer (fix-loop #6 Finding A — see above).    */
    if (typeof window._egptWhenRendererReady !== 'function') {
        var _rendererQueue = [];
        window._egptWhenRendererReady = function (onReady, onError) {
            _rendererQueue.push({ onReady: onReady, onError: onError });
        };
        window._egptStackBootRendererQueue = _rendererQueue;
    }

    /* ── Idempotent sequential script injector ─────────────────────────── */
    var _done = {};

    function _inject(src, attrs) {
        if (!src) { return Promise.resolve(); }
        src = src.trim();
        if (!src) { return Promise.resolve(); }
        if (_done[src]) { return _done[src]; }
        if (document.querySelector('script[src="' + src + '"]')) {
            return (_done[src] = Promise.resolve());
        }
        _done[src] = new Promise(function (res, rej) {
            var s = document.createElement('script');
            s.src = src;
            if (attrs) { Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); }); }
            s.onload  = res;
            s.onerror = function () { rej(new Error('[stack-boot] load failed: ' + src)); };
            (document.body || document.head).appendChild(s);
        });
        return _done[src];
    }

    function _seq(list) {
        return list.reduce(function (ch, it) {
            return ch.then(function () { return _inject(it.src, it.attrs || null); });
        }, Promise.resolve());
    }

    /* Expose the engineRouter-backed resolver (`_u`, the ONE path authority via
       window._egptEnginePathMap / the dev-core fallback) + the FAIL-LOUD idempotent
       injector so a load-by-eval page (empty/index.html's walkthrough hook) can inject
       a per-rung setup-factory DELTA BEFORE eval — never a hand-derived '../../' path
       (ws-experiments-walkthrough Bite 3a, architect ruling C). _egptInjectScript
       returns a Promise that REJECTS on load failure (surfaced FAIL-LOUD by the hook). */
    window._egptResolveFrqtl = _u;
    window._egptInjectScript = function (relPath) { return _inject(_u(relPath)); };

    /* ── Canonical script lists ────────────────────────────────────────── */

    var ENGINE = [
        { src: _u('assets/vendor/chroma.min.js') },
        // Rectangle — the sole spatial-rect authority (objects/geometry/Rectangle.js).
        // Loaded here in the ENGINE phase because the WASM provider wrapper's createUniverse
        // needs window.Rectangle before the GAME layer runs; the GAME array re-lists it
        // (idempotent — _inject dedups by src).
        { src: _u('objects/geometry/Rectangle.js') },
        { src: _u('compat/providers/wasm-engine.js') },
        { src: _u('compat/providers/wasm-load-browser.js') },
        { src: _u('compat/egpt-engine.js') },
        // ── lib/shim contract scripts — router-driven via _u('shim/...') ──────
        // These 7 entries were previously HARDCODED absolute '/lib/shim/...' literals
        // (correct on the dev /lib mount, but 404 on a dumb static host that has no
        // /lib mount). Now routed through the router's 'shim/' key: dev-core (no map)
        // → '/lib/shim/...' (byte-identical, via _u()'s shim fallback); dist/static
        // (projected DIST_PROFILE map) → the copied dist/ide/... tree (copyCommon()
        // copies lib/shim/ → dist/ide/). Same 'shim/' key graphics-render/_url() and
        // the artifact-showcase ESM entry consume — the one path authority (router.js).
        //
        // AstSchema: expression-AST node-kind vocabulary (lib/shim/expr/ast-schema.js).
        // Required by actionCompiler.js (inside the GAME layer) to compile CollisionActions
        // to op-programs. Loaded here (ENGINE phase) so it is available before LargeObject
        // construction.
        { src: _u('shim/expr/ast-schema.js') },
        // FrameDataSchema: the data-bubble + render-intent VALUE contract (lib/shim/frame-data).
        // The CANONICAL OWNER of RENDER_INTENT_KEYS/VALUES (architect ruling 2026-06-30) — publishes
        // window.FrameDataSchema. MUST load before RenderShape/providers/objects-schema, which now
        // FERRY the render.shape value set from it (no second source). Foundational cross-engine contract.
        { src: _u('shim/frame-data/index.js') },
        // PageParams: the URL-param routing-table contract (lib/shim/page-params) — WS
        // gym-controls-as-sugar Bite 3 item 0/2. Publishes window.PageParams. MUST load
        // before engine-boot.js/render-boot.js (injected right after this ENGINE array
        // resolves) and before fx-experiment.js (a data-page-scripts entry, loaded even
        // later) — all three live-import their URL-param KEY NAMES from
        // window.PageParams.KEYS instead of a bare string literal.
        { src: _u('shim/page-params/index.js') },
        // FieldDescriptorSchema: the shared field-SHAPE vocabulary contract
        // (lib/shim/field-descriptor — WS Studio Controls Realignment §7 r2 CEO
        // call C1). Publishes window.FieldDescriptorSchema. MUST load before
        // objects/schema/index.js (a GAME-layer file, loaded LATER) — that file's
        // own load-time drift assertion reads FieldDescriptorSchema.FIELD_TYPES
        // eval-time, at require()/script-execution. (p5/three-provider.js's
        // renderCapabilities() and three-provider.js's getCameraControl() — whose
        // `poseFields` are normalized field descriptors — also consume it, but only
        // LAZILY at call time, and the whole ENGINE array resolves before RENDERER,
        // so those impose no eval-time ordering constraint.)
        { src: _u('shim/field-descriptor/index.js') },
        // ControlsSchema + the runtime instance registry (lib/shim/controls) — WS
        // gym-controls-as-sugar Bite 1's control-descriptor contract, browser-wired here
        // as an explicit Bite-3 prerequisite. Publishes window.ControlsSchema then
        // window.ControlRegistry — ORDER MATTERS: registry.js's _getControlsSchema()
        // reads window.ControlsSchema, so index.js MUST precede it (mirrors the
        // Box-before-OvenBox constraint documented in game-layer-manifest.js).
        { src: _u('shim/controls/index.js') },
        { src: _u('shim/controls/registry.js') },
        // ShimRpc: the request/response call() primitive (lib/shim/rpc) — WS
        // gym-controls-as-sugar Bite 3 Stage 2 fix-loop (architect gate-5 charter:
        // "promote the reqId/pending/timeout request/response-call()-over-postMessage
        // pattern to a SHIM PRIMITIVE"). Publishes window.ShimRpc. Consumed by
        // page-context sugar (lib/frqtl/objects/objects/frqtl-controls-panel.js) via
        // a named FAIL-LOUD guard, never a relative ES import. No ordering dependency
        // on the other shim entries above; placed here to keep the block together.
        { src: _u('shim/rpc/index.js') },
        // HeatColormap: the ONE count→intensity heat ramp (lib/shim/render/heat-colormap.js).
        // Publishes window.HeatColormap. Consumed BELOW the shim by the GraphingDetectorWall
        // heat painter (a GAME-layer classic script, loaded later) through a named FAIL-LOUD
        // guard, and ABOVE it by lib/components/notebook-pane/realm-chart.js (side-effect
        // import + the same window read) — one ramp, so the in-scene wall heatmap and the DOM
        // topology chart can never drift apart on the same grid data. No ordering dependency
        // on the other shim entries.
        { src: _u('shim/render/heat-colormap.js') },
        // RenderStages: the ORDERED render-pipeline stage vocabulary + the tap-result bag
        // normalizer (lib/shim/render/render-stages.js). Publishes window.RenderStages.
        // The peer of frame-data's RENDER_INTENT_KEYS — the shim owns the cross-layer
        // vocabulary and consumers FERRY it. Consumed BELOW the shim by
        // objects/instruments/capture.js (the capture(stage) tap MECHANISM) and
        // objects/objects/FrqtlVision.js (the sugar), both GAME-layer classic scripts
        // loaded later, both through a named FAIL-LOUD guard at CALL time — so no
        // eval-time ordering dependency on the other shim entries.
        { src: _u('shim/render/render-stages.js') }
    ];

    /* RENDERER — literal copy of lib/shim/engine/renderer-layer-manifest.js
       RENDERER_LAYER_SCRIPTS (same discipline as the GAME array below: stack-boot
       is a classic injected script and cannot import the ESM manifest). Parity is
       enforced by lib/shim/engine/test/renderer-layer-manifest.test.mjs.
       Do NOT edit here without updating the manifest (and vice versa). */
    var RENDERER = [
        /* THE DISPLAY SLOT — the one "which provider owns the display" authority.
           Heads the phase: render-boot.js (next) is its one writer. */
        { src: _u('compat/renderer/display-slot.js') },
        { src: _u('objects/constants/LightColor.js') },
        { src: _u('compat/renderer/RenderShape.js') },   // shape authority — MUST load before providers
        { src: _u('compat/renderer/RenderMesh.js') },    // render.mesh resolver — before providers
        { src: _u('compat/renderer/RenderFamily.js') },  // per-frame render-family decode (composes Shape+Mesh) — AFTER both, before providers
        { src: _u('compat/renderer/RenderTiers.js') },   // per-layer-range render-tier table — before providers
        { src: _u('compat/renderer/FieldBuilder.js') },
        // renderer-provider-contract.js: the CODE OWNER of the RendererProvider
        // method lists (the required/optional split + validateRendererProvider).
        // A dependency, not a provider — it only installs its tables on window —
        // so it loads with the other shared owners, before both providers.
        { src: _u('compat/renderer/renderer-provider-contract.js') },
        // renderCapabilities-common.js: the shared universal-knob + filter-loop
        // owner (WS Studio Controls Realignment S5b DRY tidy) BOTH providers'
        // renderCapabilities() resolve via window.RenderCapabilitiesCommon at
        // CALL time — MUST load before providers, same precedent as RenderShape.js
        // immediately above (tester-found regression, S5b fix-loop: this entry
        // was missing entirely, so every page whose onReady synchronously calls
        // makeControlsForRenderSurface — every fx-family page — hit a FAIL-LOUD
        // "RenderCapabilitiesCommon is unreachable" the instant renderCapabilities()
        // was first invoked; the fail-loud overlay behavior itself is correct,
        // the wiring was the bug).
        { src: _u('compat/renderer/renderCapabilities-common.js') },
        // captureStill-common.js: the shared pixel-readback + still-bag owner for the
        // OPTIONAL captureStill() capability (the `composite` stage tap of the
        // RENDER_STAGES contract). BOTH providers resolve window.CaptureStillCommon
        // at CALL time — MUST load before providers, exactly like the entry above
        // (same class of load-order bug: a page that captures in onReady would hit a
        // FAIL-LOUD "CaptureStillCommon is unreachable" with the wiring, not the
        // fail-loud, being the bug).
        { src: _u('compat/renderer/captureStill-common.js') },
        // camera2d-geometry.js: THE 2D camera map (pan/zoom) — the affine2d projection's one
        // authority, consumed by p5-provider (draw transform, screenToWorld, the camera
        // handle) and by unprojectStill (the offline map). Must precede both consumers.
        { src: _u('compat/renderer/camera2d-geometry.js') },
        // orbit-bag.js: THE point-shape authority for the pose bag ({x,y,z} AND [x,y,z],
        // one identical throw under every provider). BOTH camera handles ferry every
        // point-valued field through it — must precede both providers.
        { src: _u('compat/renderer/orbit-bag.js') },
        { src: _u('compat/renderer/providers/p5-provider.js') },
        // unprojectStill.js: THE pixel→universe mapping authority for a captured still
        // (RENDERER_CONTRACT §10.5). Ferries window.ThreeCameraGeometry lazily for the
        // perspective branch, so no eval-time ordering constraint — but it must follow
        // the geometry authority, and it keeps the one-mapping-authority block together.
        { src: _u('compat/renderer/unprojectStill.js') },
        // three-camera-contract.js: the three camera's DECLARATIVE contract (the
        // view-preset table + the pose-axis field descriptors getCameraControl()
        // publishes). three-provider.js resolves window.ThreeCameraContract
        // FAIL-LOUD while building the handle — MUST precede it.
        { src: _u('compat/renderer/providers/three-camera-contract.js') },
        // three-camera-geometry.js: the three camera's PURE GEOMETRY authority
        // (orbit bag ⇄ camera basis + the screen-relative rotate/translate
        // primitives + the picking-ray math). three-provider.js resolves
        // window.ThreeCameraGeometry FAIL-LOUD from _applyOrbit onward — MUST
        // precede it.
        { src: _u('compat/renderer/providers/three-camera-geometry.js') },
        { src: _u('compat/renderer/providers/three-provider.js') },
        { src: _u('compat/renderer/Filters.js') }
    ];

    /* GAME — literal copy of lib/shim/engine/game-layer-manifest.js GAME_LAYER_SCRIPTS.
       Parity is enforced by lib/shim/engine/test/game-layer-manifest.test.mjs.
       Do NOT edit here without updating the manifest (and vice versa). */
    var GAME = [
        { src: _u('objects/constants/CollisionTypes.js') },
        { src: _u('objects/constants/CollisionActions.js') },
        { src: _u('objects/constants/WallBehaviors.js') },
        { src: _u('objects/constants/Charge.js') },
        { src: _u('objects/geometry/Rectangle.js') },
        { src: _u('objects/geometry/SlabFace.js') },
        { src: _u('objects/objects/tagger.js') },
        { src: _u('objects/objects/actionCompiler.js') },
        { src: _u('objects/objects/absorbRadiation.js') },
        { src: _u('objects/objects/emitterProgram.js') },
        { src: _u('objects/objects/LargeObject.js') },
        { src: _u('objects/objects/Wall.js') },
        { src: _u('objects/objects/GraphingDetectorWall.js') },
        { src: _u('objects/objects/QuantumEmitter.js') },
        { src: _u('objects/objects/PointSource.js') },
        { src: _u('objects/objects/DetectorWall.js') },
        { src: _u('objects/objects/slitLinerScatter.js') },
        { src: _u('objects/objects/SlitScreen.js') },
        { src: _u('objects/objects/SlitLightSource.js') },
        { src: _u('objects/objects/EgptFractal.js') },
        { src: _u('objects/objects/Box.js') },
        { src: _u('objects/objects/Tunnel.js') },
        // Trace (THE WIRE PART) — composes Tunnel + Wall; both resolve at CALL time, so
        // roster position is not load-bearing (the load-order gate holds it to that).
        { src: _u('objects/objects/Trace.js') },
        // LogicGate (THE SWITCHING PART) — composes Tunnel + Wall + Trace + SphereEmitter;
        // all resolve at CALL time, so roster position is not load-bearing.
        { src: _u('objects/objects/LogicGate.js') },
        { src: _u('objects/objects/OvenBox.js') },
        { src: _u('objects/objects/CircuitGate.js') },
        { src: _u('objects/objects/CircuitProbe.js') },
        { src: _u('objects/objects/Tube.js') },
        { src: _u('objects/objects/sustainedSource.js') },
        { src: _u('objects/objects/directedRedirectProgram.js') },
        { src: _u('objects/objects/DirectedTunnel.js') },
        { src: _u('objects/objects/LightSource.js') },
        { src: _u('objects/objects/controlBind.js') },
        { src: _u('objects/objects/controlAction.js') },
        { src: _u('objects/objects/makeControlsForObject.js') },
        { src: _u('objects/objects/makeControlsForRenderSurface.js') },
        { src: _u('objects/objects/frqtl-control-slider.js') },
        { src: _u('objects/objects/frqtl-control-widgets.js') },
        { src: _u('objects/objects/frqtl-controls-panel.js') },
        { src: _u('objects/objects/frqtl-control-sync.js') },
        { src: _u('objects/objects/frqtl-control-overlay.js') },
        { src: _u('objects/objects/frqtl-control-write-queue.js') },
        { src: _u('objects/objects/CameraControls.js') },
        { src: _u('objects/objects/FrqtlVision.js') },
        { src: _u('objects/objects/CameraPath.js') },
        { src: _u('objects/objects/FlightRecorder.js') },
        { src: _u('objects/setup/_setupOptions.js') },
        { src: _u('objects/setup/_collisionMatrixLanes.js') },
        { src: _u('objects/setup/setupSphereEmitter3D.js') },
        { src: _u('objects/objects/SphereEmitter.js') },
        { src: _u('objects/setup/setupTunnelPointExit.js') },
        { src: _u('objects/setup/setupTraceCircuit.js') },
        { src: _u('objects/setup/setupHalfAdder.js') },
        /* The declared-type write gate — schema/index.js FAILS LOUD without it (a
           missing gate silently accepts wrong-typed writes), so it loads immediately
           before. */
        { src: _u('objects/schema/valueNormalizer.js') },
        /* engine-scopes.js owns the Frame/Universe/Dimension descriptors schema/index.js
           registers + re-exports — index.js FAILS LOUD without it. */
        { src: _u('objects/schema/engine-scopes.js') },
        { src: _u('objects/schema/index.js') },
        { src: _u('objects/ObjectFactory.js') },
        /* instruments/capture.js — the render-pipeline TAP MECHANISM (THE_MINIMAL_SIM §4).
           Publishes window.FrqtlCapture; FrqtlApp constructs it and forwards
           capture/captureStill/sceneRecord/setSourceRef to it. */
        { src: _u('objects/instruments/capture.js') },
        { src: _u('objects/FrqtlApp.js') },
        { src: _u('objects/Experiment.js') },
        { src: _u('objects/RecipeContext.js') }
    ];

    /* Default renderer unless already set by page or build */
    if (!window._egptDefaultRenderer) { window._egptDefaultRenderer = 'p5'; }

    /* ── Sequential boot ───────────────────────────────────────────────── */
    _seq(ENGINE)
        .then(function () { return _inject(_u('experiments/_shared/engine-boot.js')); })
        .then(function () {
            /* Drain the early-shim engine queue into the real _egptWhenEngineReady.
               engine-boot.js has now run and installed the real function. Each
               queued entry is a { onReady, onError } pair (fix-loop #6 Finding A) —
               forward BOTH so a caller that registered an error callback while the
               shim was still active (the common case: this ALWAYS runs before
               engine-boot.js loads) still gets it wired to the real promise.      */
            var q = window._egptStackBootEngineQueue;
            if (q && q.length && typeof window._egptWhenEngineReady === 'function') {
                var fn = window._egptWhenEngineReady;
                for (var i = 0; i < q.length; i++) { fn(q[i].onReady, q[i].onError); }
                window._egptStackBootEngineQueue = null;
            }
        })
        .then(function () { return _seq(RENDERER); })
        .then(function () { return _inject(_u('experiments/_shared/render-boot.js')); })
        .then(function () {
            /* Drain the renderer queue into the real _egptWhenRendererReady
               (fix-loop #6 Finding A — same { onReady, onError } pair forwarding
               as the engine drain above). */
            var q = window._egptStackBootRendererQueue;
            if (q && q.length && typeof window._egptWhenRendererReady === 'function') {
                var fn = window._egptWhenRendererReady;
                for (var i = 0; i < q.length; i++) { fn(q[i].onReady, q[i].onError); }
                window._egptStackBootRendererQueue = null;
            }
        })
        .then(function () { return _seq(GAME); })
        .then(function () {
            /* Load page-specific scripts (data-page-scripts attr) after game layer. */
            return _seq(_pageScripts);
        })
        .catch(function (err) {
            var msg = '[stack-boot] ' + (err && err.message ? err.message : String(err));
            if (window.console && console.error) { console.error(msg); }
            if (typeof window._egptFailLoud === 'function') {
                window._egptFailLoud(msg);
            } else if (!document.getElementById('egpt-engine-error')) {
                var b = document.createElement('div');
                b.id = 'egpt-engine-error';
                b.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#1a0000;' +
                    'color:#ff6b6b;font:13px/1.55 ui-monospace,monospace;padding:22px;' +
                    'white-space:pre-wrap;overflow:auto;border:2px solid #b6161c;';
                b.textContent = msg;
                (document.body || document.documentElement).appendChild(b);
            }
        });

})();
