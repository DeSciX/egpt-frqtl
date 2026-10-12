/* Copyright 2023-2026 by Essam Abadir */

/**
 * FrqtlApp — the HOST ADAPTER a page/IDE/notebook talks to for one FRQTL scene.
 *
 * This is an `Application` in the PixiJS sense: loop, scene registry, renderer facade,
 * canvas, instrument taps, editor plumbing and world-property proxy all hang off ONE
 * handle the host drives. It is NOT a loop driver — an object called "Runner" reads as
 * the loop alone (Matter.js `Runner` drives `Engine`; `Render` and `Composite` are
 * separate objects), so a caller carrying that muscle memory reaches for a `scene` or
 * `renderer` that does not exist here and starts guessing at the interface. Named to
 * match the surface it actually is, consistent with `FrqtlVision`.
 *
 * Handles universe construction, experiment setup via the frqtl/objects/setup factories,
 * and the doTick → renderer.renderTick loop, over the Rust/WASM engine reached through
 * the unified compat layer (frqtl/compat/egpt-engine.js) — engine-agnostic by contract.
 *
 * Host hook: `start()` publishes the live instance at `window._frqtlApp` — the ONE
 * ambient handle same-origin embedders (STUDIO/CODE author surface, notebook pane,
 * Playwright probes) drive the scene through. There is no second hook and no alias.
 *
 * Design (§6, §6.1 from WS_RENDERER_SHIM_DESIGN.md):
 *   - The app OWNS the requestAnimationFrame loop. p5's loop()/noLoop() are
 *     NO LONGER used. window.draw is no longer set.
 *   - The renderer is obtained from THE DISPLAY SLOT (window.FrqtlDisplay, written by
 *     render-boot.js). If the slot is empty when the draw loop first fires, the app
 *     FAILS LOUD via _egptFailLoud — no silent P5Renderer fallback (Phase 1, WS-RENDERER).
 *   - Fixed-timestep accumulator decouples physics ticks from draw frames:
 *       tickHz:  physics ticks per second    (default: lock to drawHz → 1:1 as today)
 *       drawHz:  draw frames per second cap  (default: display refresh)
 *     Default (tickHz == drawHz) reproduces today's exact 1:1 loop.
 *   - onTick fires per PHYSICS TICK; renderTick fires per DRAW FRAME.
 *   - stepsPerFrame is kept as a back-compat alias: sets tickHz = drawHz * stepsPerFrame.
 *   - Spiral-of-death guard: accumulated time clamped + ticks-per-frame capped.
 *   - Determinism preserved: physics only ever advances in whole doTick() steps;
 *     the headless run.js orchestrators (no RAF, no rendering) are unaffected.
 *
 * Usage (unchanged from before):
 *
 *   var runner = new FrqtlApp({
 *     canvasParentId: 'canvas-wrapper',
 *     canvasW: 600,
 *     canvasH: 600,
 *     seed: 42,
 *     onTick: function(tickData, setupResult) { ... }
 *   });
 *
 *   runner.createCanvas();
 *   runner.setup(setupDoubleSlit, { wavelength: 64, ... });
 *   runner.start();
 *   runner.stop();
 *   runner.toggle();
 *   runner.step();  // single tick + render (step-by-step debugging)
 *
 * New (§6.1):
 *   new FrqtlApp({ ..., tickHz: 120, drawHz: 30 })
 *   // → 4 physics ticks per drawn frame
 *
 * Back-compat alias (§6.1):
 *   new FrqtlApp({ ..., stepsPerFrame: 4 })
 *   // → sets tickHz = drawHz * 4 (same as above if drawHz == display refresh)
 */

(function () {
    'use strict';

    // ── Fixed-timestep constants (§6.1) ─────────────────────────────────────
    var MAX_FRAME_MS           = 100;   // clamp wall-clock delta (spiral-of-death guard)
    var MAX_TICKS_PER_FRAME    = 10;    // hard cap for normal (bounded) operation
    var MAX_TICKS_UNBOUNDED    = 200;   // hard cap for unbounded TPS (Infinity tickHz)

    // The keys setRateLimits() accepts — any other key is a FAIL-LOUD error there.
    var RATE_LIMIT_KEYS        = Object.freeze(['fpsLimit', 'tpsLimit']);
    // The factory statics setup() consumes (see FrqtlApp.prototype.setup) — the ONE list
    // carryFactoryStatics() copies, so a wrapped factory boots the same scene as the bare one.
    var FACTORY_STATICS        = Object.freeze(['initWorld']);
    // A factory static that was deleted: setup() and carryFactoryStatics() THROW on it,
    // naming what replaces it, so a factory still carrying one never loses it silently.
    function _refuseDeletedStatics(fn, where) {
        if (fn.RATE_LIMITS !== undefined) {
            throw new Error('[FrqtlApp.' + where + '] the RATE_LIMITS factory static is DELETED — pacing is ' +
                'declared where the scene is: exp.runner.setRateLimits({ fpsLimit?, tpsLimit? }) in a scene ' +
                'file, runner.setRateLimits(...) on a page. (FAIL-LOUD.)');
        }
    }

    // ── FrqtlApp ─────────────────────────────────────────────────────

    /**
     * Resolve an engine class the host needs (`EGPTUniverse`, `Rectangle`) through a NAMED
     * order, never a bare global identifier.
     *
     * A bare `EGPTUniverse` / `Rectangle` reference is a `ReferenceError` — not a falsy
     * miss — in any host that has no `window`, which is precisely what made this runner
     * browser-only and the taps below a browser privilege. The engine already publishes both
     * on its HANDLE (`lib/frqtl/compat/egpt-engine.js` → `handle.EGPTUniverse`,
     * `handle.Rectangle`), so a headless host passes what it already holds:
     *
     *     new FrqtlApp({ engine: handle, canvasW, canvasH, seed })
     *
     * Order: the injected handle, then `window` (what engine-boot.js publishes in a page),
     * then `globalThis` (the node load side-effect). Absent ⇒ THROW naming the canonical
     * path. There is NO alternative construction path and no optional-engine soft path:
     * `EGPTUniverse.create(config)` remains the ONE construction authority.
     * @private
     */
    function _resolveEngineClass(name, engineHandle) {
        if (engineHandle && engineHandle[name]) { return engineHandle[name]; }
        var g = (typeof window !== 'undefined' && window) ? window
              : ((typeof globalThis !== 'undefined') ? globalThis : null);
        if (g && g[name]) { return g[name]; }
        throw new Error('[FrqtlApp] the engine class `' + name + '` is unreachable: it is ' +
            'not published on this host and no `engine` handle was passed to the constructor ' +
            '(new FrqtlApp({ engine: <lib/frqtl/compat/egpt-engine.js handle> })). Load the ' +
            'engine first (engine-boot.js in a page). (FAIL-LOUD — no bare-global fallback, ' +
            'and no construction path other than EGPTUniverse.create.)');
    }

    /**
     * Resolve the canonical contract `ObjectSchema` (`lib/frqtl/objects/schema/`) for its two
     * gates the runner ferries: `normalizeValue` — the declared-type WRITE GATE every render
     * option passes (a capability descriptor is a field descriptor) — and `worldRect`, the ONE
     * world-rect normalizer. Dual-mode, FAIL-LOUD.
     * @private
     */
    function _resolveObjectSchema() {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./schema/index.js').ObjectSchema;
        }
        if (typeof window !== 'undefined' && window.ObjectSchema) { return window.ObjectSchema; }
        if (typeof ObjectSchema !== 'undefined') { return ObjectSchema; }
        throw new Error('[FrqtlApp] canonical contract ObjectSchema (lib/frqtl/objects/schema) is ' +
            'unreachable (load order) — its normalizeValue is the declared-type write gate every ' +
            'render option passes, and its worldRect the one world-rect normalizer. Fail-loud, ' +
            'not a fallback.');
    }

    /**
     * Resolve the capture INSTRUMENT — the relocated render-pipeline tap mechanism
     * (`lib/frqtl/objects/instruments/capture.js`, THE_MINIMAL_SIM §4). Dual-mode, the same
     * shape `ObjectFactory.js` and both renderer providers already use: `require` under
     * CommonJS, the published global in a classic-script page. FAIL-LOUD, never a fallback —
     * a host with no tap mechanism must say so, not silently lose its eyes.
     * @private
     */
    function _resolveCaptureModule() {
        if (typeof module !== 'undefined' && module.exports) {
            return require('./instruments/capture.js');
        }
        if (typeof window !== 'undefined' && window.FrqtlCapture) { return window.FrqtlCapture; }
        if (typeof FrqtlCapture !== 'undefined') { return FrqtlCapture; }
        throw new Error('[FrqtlApp] canonical contract FrqtlCapture ' +
            '(lib/frqtl/objects/instruments/capture.js) is unreachable (load order) — it is the ' +
            'render-pipeline tap mechanism this host delegates to. Fail-loud, not a fallback.');
    }

    /**
     * Resolve THE DISPLAY SLOT (`lib/frqtl/compat/renderer/display-slot.js`) — the ONE
     * answer to "which provider owns the display". Dual-mode, the same shape the capture
     * instrument and both renderer providers use: `require` under CommonJS, the published
     * global in a classic-script page. FAIL-LOUD, never a fallback.
     * @private
     */
    function _resolveDisplaySlot() {
        if (typeof module !== 'undefined' && module.exports) {
            return require('../compat/renderer/display-slot.js');
        }
        if (typeof window !== 'undefined' && window.FrqtlDisplay) { return window.FrqtlDisplay; }
        if (typeof FrqtlDisplay !== 'undefined') { return FrqtlDisplay; }
        throw new Error('[FrqtlApp] canonical contract FrqtlDisplay ' +
            '(lib/frqtl/compat/renderer/display-slot.js) is unreachable (load order) — it is ' +
            'the ONE display-provider authority this host reads. It heads the RENDERER phase ' +
            '(renderer-layer-manifest.js). Fail-loud, not a fallback.');
    }

    /** THE pose-vocabulary owner (compat/renderer/orbit-bag.js) — the 3D-ness predicate the aim
     *  arms on. FAIL-LOUD. */
    function _resolveOrbitBag() {
        if (typeof module !== 'undefined' && module.exports) {
            return require('../compat/renderer/orbit-bag.js');
        }
        if (typeof window !== 'undefined' && window.OrbitBag) { return window.OrbitBag; }
        throw new Error('[FrqtlApp] canonical contract OrbitBag (lib/frqtl/compat/renderer/orbit-bag.js) ' +
            'is unreachable (load order) — it owns the 3D-ness predicate hasAngularPose and rides the ' +
            'RENDERER phase (renderer-layer-manifest.js). Fail-loud, not a fallback.');
    }

    /**
     * The Wall-family facade (Wall, GraphingDetectorWall, …) that `lo` IS or is the inner
     * LargeObject of, else null. Structural, never by kind: the Wall constructor stamps
     * `this.lo._wall = this`, so a facade is `lo.lo._wall === lo` and its inner LO is
     * `lo._wall.lo === lo`. The ONE predicate for "this rect belongs to a wall".
     */
    /** Whether `prop` is a WALL field — declared by the Wall descriptor every Wall-family kind
     *  extends (read from the schema owner), as opposed to a subclass's own field. */
    function _isWallField(schema, prop) {
        var d = schema.get('Wall');
        for (var i = 0; i < d.fields.length; i++) { if (d.fields[i].name === prop) { return true; } }
        return false;
    }
    function _wallFacadeOf(lo) {
        if (!lo) { return null; }
        if (lo._wall && lo._wall.lo === lo) { return lo._wall; }
        if (lo.lo && lo.lo._wall === lo) { return lo; }
        return null;
    }

    /** THE LO drawn-center authority (compat/renderer/lo-drawn-center.js) — where the renderer
     *  draws an LO rect and its volume; the pick, the aim ray and the shadow-surround all read it. FAIL-LOUD. */
    function _resolveLoDrawnCenter() {
        if (typeof module !== 'undefined' && module.exports) {
            return require('../compat/renderer/lo-drawn-center.js');
        }
        if (typeof window !== 'undefined' && window.LoDrawnCenter) { return window.LoDrawnCenter; }
        throw new Error('[FrqtlApp] canonical contract LoDrawnCenter (lib/frqtl/compat/renderer/' +
            'lo-drawn-center.js) is unreachable (load order) — it is the ONE owner of where an LO ' +
            'rect is drawn, and it rides the RENDERER phase (renderer-layer-manifest.js). ' +
            'Fail-loud, not a fallback.');
    }

    /**
     * The wall-clock loop (`start()`, `toggle()` resume) runs on `requestAnimationFrame`.
     * A host without one (node) gets a NAMED door here instead of a raw ReferenceError, and
     * gets it before the runner's loop state is touched.
     * @private
     */
    function _requireAnimationFrame(method) {
        if (typeof requestAnimationFrame === 'function') { return; }
        throw new Error('[FrqtlApp.' + method + '] no animation frame in this host — the wall-clock ' +
            'loop needs requestAnimationFrame. Drive the clock with `runner.step()` (one tick + ' +
            'render per call, any host), or boot in a browser through `@descix/frqtl-sdk/boot`. ' +
            '(FAIL-LOUD.)');
    }

    /**
     * @param {Object}   opts
     * @param {string}   [opts.canvasParentId]   DOM element ID for the canvas.
     * @param {Object}   [opts.engine]           Engine handle (compat/egpt-engine.js) carrying
     *                                           EGPTUniverse + Rectangle. Omit in a page — the
     *                                           boot-published globals are read instead.
     * @param {number}   opts.canvasW             Physics canvas width in pixels — REQUIRED (no default:
     *                                           a default size is a second declaration of the world).
     * @param {number}   opts.canvasH             Physics canvas height in pixels — REQUIRED.
     * @param {boolean}  [opts.is3D=false]        The display is 3D (perspective + depth) — handed to the
     *                                           provider's init. A scene states it through
     *                                           exp.createScene; a page passes it here.
     * @param {number}   [opts.canvasD]           World depth for a 3D display (handed to provider init).
     * @param {number}   [opts.seed=42]           RNG seed for deterministic runs.
     * @param {number}   [opts.tickHz]            Physics ticks/s (default: lock to drawHz).
     * @param {number}   [opts.drawHz]            Draw frames/s cap (default: display refresh).
     * @param {number}   [opts.stepsPerFrame=1]   Back-compat alias: sets tickHz = drawHz * N.
     * @param {Function} [opts.onTick]            Called per PHYSICS TICK with (tickData, setupResult).
     * @param {Function} [opts.onReady]           Called once the canvas is ready.
     */
    function FrqtlApp(opts) {
        opts = opts || {};
        var canvasW = opts.canvasW, canvasH = opts.canvasH;
        if (typeof canvasW !== 'number' || !(canvasW > 0) || typeof canvasH !== 'number' || !(canvasH > 0)) {
            throw new Error('[FrqtlApp] canvasW and canvasH are REQUIRED positive numbers (got ' +
                JSON.stringify(canvasW) + ' x ' + JSON.stringify(canvasH) + '). There is no default world ' +
                'size: a scene states its world with exp.createCanvas(w, h, cfg) / exp.createScene(w, h, d, cfg); ' +
                'a page passes it here. (FAIL-LOUD.)');
        }
        this._is3D   = !!opts.is3D;
        this._depth  = (opts.canvasD !== undefined && opts.canvasD !== null) ? opts.canvasD : null;
        var seed    = opts.seed    !== undefined ? opts.seed    : 42;

        this._canvasParentId = opts.canvasParentId || null;
        this._onTick         = opts.onTick  || null;
        this._onReady        = opts.onReady || null;
        // Multi-subscriber per-tick fan-out (peer of the single `_onTick` slot the
        // experiment page owns). `addTickListener(fn)` lets a host-side consumer (the
        // LiveChart wiring) subscribe to the tick stream WITHOUT stealing `_onTick`.
        // Empty by default → zero behavior change (SU1); the fan-out fires AFTER
        // `_onTick` at both tick sites (the RAF loop and step()).
        this._tickListeners  = [];

        // tickHz / drawHz — independent clocks (§6.1)
        // drawHz=0 means "lock to display refresh" (the default)
        this._drawHz = (opts.drawHz !== undefined && opts.drawHz > 0) ? opts.drawHz : 0;
        // stepsPerFrame back-compat: treated as tickHz multiplier relative to drawHz
        var spf = (opts.stepsPerFrame !== undefined) ? Math.max(1, opts.stepsPerFrame) : 1;
        if (opts.tickHz !== undefined && opts.tickHz > 0) {
            this._tickHz = opts.tickHz;
        } else if (spf > 1) {
            // stepsPerFrame > 1: tickHz = drawHz * spf  (if drawHz known at start, else approximate)
            this._tickHz = (this._drawHz > 0) ? this._drawHz * spf : 60 * spf;
        } else {
            // Default 1:1: tickHz locked to drawHz at runtime (set in the frame loop)
            this._tickHz = 0;   // 0 = "lock to drawHz" — resolved inside the frame loop
        }

        // Back-compat accessor
        this.stepsPerFrame = spf;

        // The engine classes, resolved through the named order (never a bare global).
        var _Rectangle = _resolveEngineClass('Rectangle', opts.engine);

        // Physics canvas rect
        this.canvas_rect = new _Rectangle(0, 0, canvasW, canvasH, null, false);

        // The INIT SEED, retained. This runner is the party that hands the seed to the
        // universe, so it is the seed authority — and `seed` is half of the regeneration
        // triple (code, seed, tick) a capture's SceneRecord must carry. It is FERRIED into
        // the capture instrument's identity bag below, never re-derived there.
        this._seed = seed;
        // Tick SUSPENSION depth (see suspendTicks). Distinct from `_isLooping`, which is the
        // USER's play/pause: a suspend must not lie to the play button, and a resume must not
        // secretly start a stopped sim.
        this._tickSuspend = 0;

        // Universe — built through the ONE construction authority, `EGPTUniverse.create`
        // (EGPTUniverse.CONFIG is the exported key/default/unit/effect table). This host
        // names only the two settings it actually owns; every other key takes its published
        // default (fps 60, iframeIntervalSeconds 1, no IQC, no bonding, groundUp,
        // minMBFillRate 0.1, wavelengthScale 1 — the setup factory / sketch's
        // `universe.init()` sets the base dimension and overrides wavelengthScale per
        // experiment anyway).
        var _Universe = _resolveEngineClass('EGPTUniverse', opts.engine);
        this.universe = _Universe.create({
            rect: this.canvas_rect,
            seed: seed,
        });

        this._setupResult  = null;
        // Design-mode signal (Bite 4b) — DEFAULT false (Run / standalone bundles /
        // experiment pages). When true (STUDIO authoring), the renderer DRAWS the
        // Design-only markers (a manipulable emitter's visual circle, `lo._designMarker`).
        // A render toggle at the output boundary (zero physics): it filters ONLY the
        // renderTick view; hit-test / drag / codegen / getAuthoredObjects all read
        // `largeObjects` (the world census) directly, so a marker stays selectable +
        // draggable even when its circle is suppressed (the "grab mid-run" oracle uses
        // the overlay handles).
        this._designMode   = false;
        // The aim surface (setAimArmed): null while disarmed, else the stationary-reticle state —
        // the centre-ray hover and, while grabbed, the held camera-relative pose. `_selected` is
        // the host's selection, handed down for its shadow-surround (setSelectHighlight).
        this._aim          = null;
        this._selected     = null;
        // F5: optional host callback fired on a position write (center/rect) so an overlay can
        // REPAINT event-driven (Studio sets it; a headless game leaves it null → no-op).
        this._onObjectMoved = null;
        this._isLooping    = false;
        this._rafId        = null;
        this._lastTickData = null; // repaint()'s source (§Studio Controls Realignment S4)

        // Fixed-timestep state
        this._accumulator  = 0;
        this._lastFrame    = 0;
        this._lastDraw     = 0;

        // Budget-exhaustion warning throttle (see the drive loop). Default-muted;
        // only emits under window._egptVerbose === true, at most once per interval.
        this._lastBudgetWarn = 0;
        this._BUDGET_WARN_INTERVAL_MS = 5000;

        // Rate measurement (§fps/tps readout) — integers only, no per-frame allocation.
        // Counts reset each ~RATE_WINDOW_MS; getRates() returns last computed snapshot.
        this._rateWindowMs  = 1000;   // recompute window length
        this._rateWindowEnd = 0;      // performance.now() when the current window ends
        this._tickCount     = 0;      // physics ticks accumulated in this window
        this._drawCount     = 0;      // draw frames accumulated in this window
        this._lastTps       = 0;      // last computed ticks/sec
        this._lastFps       = 0;      // last computed frames/sec

        // Render options — threaded into every renderTick(tickData, largeObjects, options) call.
        // Default: renderBaseCanvas true = draw particle layer.
        // Written ONLY through setRenderOption/setRenderOptions (the declared-capability gate).
        this._renderOptions = { renderBaseCanvas: true };
        // Writes made before a provider attached: validated against THAT provider's
        // renderCapabilities() the moment it attaches (see _getRenderer). Null when empty.
        this._stagedRenderOptions = null;

        // Renderer (resolved lazily in start() — render-boot.js may not have run yet)
        this._renderer = null;

        // ── The render-pipeline TAP — DELEGATED, not implemented here ─────────
        // The mechanism lives at lib/frqtl/objects/instruments/capture.js (THE_MINIMAL_SIM
        // §4): a tap is an instrument on the primitive surface, not an editor concern. This
        // host keeps only the `capture`/`captureStill`/`sceneRecord`/`setSourceRef`
        // conveniences below, each a thin forward. The binding hands the instrument LIVE
        // reads — the retained TickData, the active provider, the physics rect and the ONE
        // render-options bag — so nothing is copied and no second authority is minted.
        var self = this;
        this._capture = _resolveCaptureModule().create(
            { get lastTickData() { return self._lastTickData; } },
            function () { return self._getRenderer(); },
            { seed: this._seed, get rect() { return self.canvas_rect; } },
            function () { return self._renderOptions; }
        );
    }

    /**
     * runner.largeObjects — THE OBJECT CENSUS, DERIVED FROM THE WORLD.
     *
     * ── Layer 1: API contract ────────────────────────────────────────────────
     * The live array of `LargeObject` wrappers constructed on this runner's universe, in
     * construction order (which is z-order for the renderer). It is the WORLD's array,
     * not a copy: `new LargeObject(u, …)` self-registers into it and `dispose()` leaves
     * it, so this host maintains no list of its own.
     *
     * This host used to keep `_largeObjects`, a SECOND, render-only registration list fed
     * by `addLargeObject(lo)`. Its divergence from the engine's registry is unrepresentable
     * in the model the primitive table teaches — "construct it and it is in the world" —
     * and when it diverged, the object collided and counted correctly while being
     * completely invisible in every picture, with no error. Both that list and the
     * `addLargeObject`/`removeLargeObject` pair are DELETED: constructing IS registering,
     * and `removeObject(obj)` (which disposes) IS removing.
     *
     * ── Layer 2: physics behaviour ───────────────────────────────────────────
     * ZERO. A census read touches no frame, no dimension and no tick; the render VIEW
     * (`_visibleLargeObjects`) filters it without mutating it.
     * @returns {Array}
     */
    Object.defineProperty(FrqtlApp.prototype, 'largeObjects', {
        configurable: true,
        get: function () {
            var u = this.universe;
            return (u && Array.isArray(u.largeObjects)) ? u.largeObjects : [];
        }
    });

    /**
     * Toggle Design mode (Bite 4b). STUDIO calls setDesignMode(true) while authoring
     * (MODE_DESIGN) so the manipulable emitter markers (`lo._designMarker`) render as
     * visible circles, and false during Run / Pause so they are suppressed (you see
     * the emission, not the source marker). Standalone bundles + experiment pages
     * never call this → the default false suppresses the marker for pure output. Zero
     * physics — this only gates the renderTick view (see _visibleLargeObjects).
     * @param {boolean} v
     */
    FrqtlApp.prototype.setDesignMode = function (v) {
        this._designMode = !!v;
    };

    /**
     * Effective shellRender mode for a LargeObject (Bite 5b A6) — the SINGLE
     * suppression authority. Precedence:
     *   1. per-instance `lo.shellRender` (a valid 'design'|'run'|'never' string) —
     *      the live override the Inspector / a game sets via updateObjectProperty
     *      (the "red light bulb" flips a marker to 'run').
     *   2. kind default: a manipulable marker (`lo._designMarker === true`) defaults
     *      'design' (Bite-4b: invisible during Run); every ordinary LO defaults
     *      'run' (always visible). This keeps every pre-existing scene byte-identical.
     * @returns {'design'|'run'|'never'}
     */
    FrqtlApp.prototype._shellRenderOf = function (lo) {
        var sr = lo && lo.shellRender;
        if (sr === 'design' || sr === 'run' || sr === 'never') { return sr; }
        return (lo && lo._designMarker === true) ? 'design' : 'run';
    };

    /**
     * The largeObjects VIEW passed to the renderer each frame (Bite 5b A6): each LO
     * is shown per its effective `shellRender` (see _shellRenderOf) — 'run' always,
     * 'design' only while `_designMode` is on, 'never' hidden.
     *
     * It is a VIEW over `this.largeObjects` (the world's census), which is the whole of
     * this method's remaining job: the host filters, it does not register. A new array
     * (never mutates the census); returns the SAME array reference when nothing is
     * filtered (the common case — all LOs 'run', or design mode with no 'never') to
     * avoid per-frame churn.
     * @returns {Array}
     */
    FrqtlApp.prototype._visibleLargeObjects = function () {
        var los = this.largeObjects;
        if (!los || los.length === 0) { return los; }
        var self = this;
        var anyHidden = false;
        for (var i = 0; i < los.length; i++) {
            if (los[i] && !self._isShellVisible(los[i])) { anyHidden = true; break; }
        }
        if (!anyHidden) { return los; }
        return los.filter(function (lo) { return self._isShellVisible(lo); });
    };

    /** Whether a LO's shell paints in the CURRENT mode (Bite 5b A6). */
    FrqtlApp.prototype._isShellVisible = function (lo) {
        var sr = this._shellRenderOf(lo);
        if (sr === 'run')   { return true; }
        if (sr === 'never') { return false; }
        return !!this._designMode;   // 'design'
    };


    var FILTER_KEY_PREFIX = 'filter.';

    /** The provider's label for an error message: the display slot's boot name when it is that provider. */
    function _providerLabel(prov) {
        var slot = _resolveDisplaySlot();
        var name = (slot.get() === prov) ? slot.name() : null;
        return name ? ('renderer "' + name + '"') : 'the active renderer';
    }

    /**
     * Validate render-option writes against `prov`'s declared capabilities.
     * THROW-OR-RETURN: returns the normalized `[key, value]` rows; nothing is applied here.
     * @private
     */
    function _validateRenderWrites(prov, rows) {
        if (typeof prov.renderCapabilities !== 'function') {
            throw new TypeError('[FrqtlApp.setRenderOption] ' + _providerLabel(prov) + ' declares no ' +
                'renderCapabilities(), so it accepts no render option (tried "' + rows.map(function (r) {
                    return r[0]; }).join('", "') + '"). A provider declares its knobs by implementing ' +
                'renderCapabilities().');
        }
        var caps = prov.renderCapabilities();
        var byName = {};
        for (var i = 0; i < caps.length; i++) { byName[caps[i].name] = caps[i]; }
        var normalizeValue = _resolveObjectSchema().normalizeValue;
        var out = [];
        for (var r = 0; r < rows.length; r++) {
            var key = rows[r][0];
            if (FrqtlApp.RUNNER_INJECTED_RENDER_KEYS.indexOf(key) !== -1) {
                throw new TypeError('[FrqtlApp.setRenderOption] "' + key + '" is merged into the render ' +
                    'bag by the runner itself (FrqtlApp.RUNNER_INJECTED_RENDER_KEYS); it is not a writable ' +
                    'render option.');
            }
            var cap = Object.prototype.hasOwnProperty.call(byName, key) ? byName[key] : null;
            if (!cap) {
                throw new TypeError('[FrqtlApp.setRenderOption] "' + key + '" is not a render option ' +
                    _providerLabel(prov) + ' declares. Declared by renderCapabilities(): [' +
                    caps.map(function (c) { return c.name; }).join(', ') + ']. (FAIL-LOUD: an ' +
                    'undeclared key is read by nothing, so the picture would silently differ from the recipe.)');
            }
            out.push([key, normalizeValue(cap, rows[r][1], 'render option')]);
        }
        return out;
    }

    /**
     * Apply already-validated rows: a `filter.<name>` toggle routes to setFilterActive (the
     * provider's filter()/removeFilter() slots); every other key lands in the ONE options bag.
     * @private
     */
    FrqtlApp.prototype._applyRenderWrites = function (rows) {
        for (var i = 0; i < rows.length; i++) {
            var key = rows[i][0];
            if (key.indexOf(FILTER_KEY_PREFIX) === 0) {
                this.setFilterActive(key.slice(FILTER_KEY_PREFIX.length), !!rows[i][1]);
            } else {
                this._renderOptions[key] = rows[i][1];
            }
        }
    };

    /**
     * runner.setRenderOptions(bag) — write render options as ONE atomic batch.
     *
     * THROW-OR-APPLY. Every key must be a capability the display provider declares through
     * `renderCapabilities()`, and every value must satisfy that descriptor through the SAME
     * declared-type gate a part's field passes (`ObjectSchema.normalizeValue`: an enum member,
     * a number inside its range, a 0/1 coerced to boolean). Every key validates before any
     * applies, so a bad bag applies nothing. `'filter.<name>': 0|1` toggles that post-process
     * filter.
     *
     * Before a provider attaches, the writes are STAGED and validated at attach (the first
     * `_getRenderer()` that finds the display slot filled): a staged key that provider does
     * not declare throws THEN, naming the provider.
     *
     * @param {Object<string, *>} bag — e.g. `{ shape: 'sphere', godrays: 0.8, glowIntensity: 1.6 }`.
     * @throws {TypeError} on a non-object bag, an undeclared key, or an invalid value.
     */
    FrqtlApp.prototype.setRenderOptions = function (bag) {
        if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
            throw new TypeError('[FrqtlApp.setRenderOptions] expects a plain object of ' +
                '{ capabilityName: value }; got ' + (Array.isArray(bag) ? 'an array' : String(bag)) + '.');
        }
        var rows = Object.keys(bag).map(function (k) { return [k, bag[k]]; });
        var prov = this._getRenderer();
        if (!prov) {
            this._stagedRenderOptions = (this._stagedRenderOptions || []).concat(rows);
            return;
        }
        this._applyRenderWrites(_validateRenderWrites(prov, rows));
    };

    /**
     * runner.setRenderOption(key, value) — one render option; see setRenderOptions.
     * @param {string} key   — a capability name the display provider declares.
     * @param {*}      value — a value its descriptor accepts.
     * @throws {TypeError} on an undeclared key or an invalid value.
     */
    FrqtlApp.prototype.setRenderOption = function (key, value) {
        var bag = {};
        bag[key] = value;
        this.setRenderOptions(bag);
    };

    /**
     * runner.renderCapabilities() — the active provider's `renderCapabilities()` list, the
     * render-option vocabulary. No provider yet, or a provider implementing no
     * `renderCapabilities()`, declares no options: `[]` (the controls factory then emits no
     * render controls, and every render-option write to that provider throws).
     *
     * @returns {Array<object>} field-descriptor-shaped capability descriptors
     *   (`lib/shim/field-descriptor`'s `{name,type,constraint,unit,default,
     *   description}` shape), or `[]`.
     */
    FrqtlApp.prototype.renderCapabilities = function () {
        var prov = this._getRenderer();
        if (!prov || typeof prov.renderCapabilities !== 'function') { return []; }
        return prov.renderCapabilities();
    };

    /**
     * runner.getRenderOption(key) — the live value of a declared render option;
     * `filter.<name>` reads isFilterActive (a boolean, matching its descriptor).
     *
     * @param {string} key
     * @returns {*} the live value (undefined when never written; the descriptor's `default`
     *   states what the provider draws then).
     * @throws {TypeError} when no provider has attached, or `key` is not declared by it.
     */
    FrqtlApp.prototype.getRenderOption = function (key) {
        var prov = this._getRenderer();
        if (!prov) {
            throw new TypeError('[FrqtlApp.getRenderOption] no display provider has attached yet, so ' +
                'no render option is declared. Read after the renderer boots.');
        }
        if (typeof prov.renderCapabilities !== 'function') {
            throw new TypeError('[FrqtlApp.getRenderOption] ' + _providerLabel(prov) + ' declares no ' +
                'renderCapabilities(), so "' + key + '" is not a render option it has.');
        }
        var caps = prov.renderCapabilities();
        var found = false;
        for (var i = 0; i < caps.length; i++) { if (caps[i].name === key) { found = true; break; } }
        if (!found) {
            throw new TypeError('[FrqtlApp.getRenderOption] "' + key + '" is not declared by ' +
                _providerLabel(prov) + ' (declared: [' +
                caps.map(function (c) { return c.name; }).join(', ') + ']).');
        }
        if (key.indexOf(FILTER_KEY_PREFIX) === 0) {
            return this.isFilterActive(key.slice(FILTER_KEY_PREFIX.length));
        }
        return this._renderOptions[key];
    };

    /**
     * runner.setFilterActive(name, active) / runner.isFilterActive(name) — the
     * canonical write/read pair for a `filter.<name>` render capability (WS
     * Studio Controls Realignment §7 r2 item 2, the ratified filter re-model).
     * `filter()`/`removeFilter()` are ALREADY-REQUIRED `RendererProvider`
     * contract methods and the canonical MULTI-SLOT name-keyed filter primitive
     * (`Filters.water`/`Filters.bloom` = `{name, glsl, uniforms}`) — this pair
     * is NOT a second write path, it is the uniform accessor `controlBind.js`'s
     * render branch calls for a `filter.` capability instead of tunneling
     * through `setRenderOption` (which has no multi-slot/toggle semantics and
     * cannot express "2 filters concurrently active").
     *
     * @param {string} name — a `Filters` catalog key (e.g. 'water', 'bloom').
     * @param {boolean} active
     * @throws {Error} if no renderer is active, or `name` is not a real
     *   `Filters` catalog entry (FAIL-LOUD — never a silent no-op filter call).
     */
    FrqtlApp.prototype.setFilterActive = function (name, active) {
        var prov = this._getRenderer();
        if (!prov || typeof prov.filter !== 'function' || typeof prov.removeFilter !== 'function') {
            throw new Error('[FrqtlApp.setFilterActive] no active renderer with filter()/' +
                'removeFilter() (RendererProvider REQUIRED methods). (FAIL-LOUD.)');
        }
        var FiltersRef = (typeof window !== 'undefined' && window.Filters)
            ? window.Filters : (typeof Filters !== 'undefined' ? Filters : null);
        if (!FiltersRef || !Object.prototype.hasOwnProperty.call(FiltersRef, name)) {
            throw new Error('[FrqtlApp.setFilterActive] unknown filter "' + name + '" — not a ' +
                'Filters.js catalog entry. (FAIL-LOUD.)');
        }
        if (!this._activeFilters) { this._activeFilters = {}; }
        if (active) {
            prov.filter(FiltersRef[name]);
            this._activeFilters[name] = true;
        } else {
            prov.removeFilter(name);
            delete this._activeFilters[name];
        }
    };

    /** @param {string} name — a `Filters` catalog key. @returns {boolean} */
    FrqtlApp.prototype.isFilterActive = function (name) {
        return !!(this._activeFilters && this._activeFilters[name]);
    };

    // ── Render-pipeline TAPS (the RENDER_STAGES contract) — DELEGATED ──────
    //
    // The MECHANISM lives at `lib/frqtl/objects/instruments/capture.js` (THE_MINIMAL_SIM
    // §4): the tap is an INSTRUMENT on the primitive surface — bound to the loop, the
    // provider, the scene identity and the live render-options bag — not an editor concern,
    // and it needs no host and no DOM. This host keeps only the conveniences below, and
    // each is a THIN FORWARD: zero dispatch, zero throw rules, zero provenance stamping
    // here. The reject-not-throw wrapper lives in exactly ONE place (the mechanism), so
    // these forwards deliberately add no try/catch of their own.
    //
    // The stage vocabulary stays with its owner, `lib/shim/render/render-stages` (the shim
    // owns cross-layer vocabularies — peer of frame-data's RENDER_INTENT_KEYS); the
    // instrument ferries it. Contract: docs/internal/engine/RENDERER_CONTRACT.md §1a.4 + §10.

    /**
     * runner.setSourceRef(ref) — register the experiment/rung identity for the SceneRecord.
     * Forwards to the instrument's identity. See instruments/capture.js.
     * @param {string|null} ref
     */
    FrqtlApp.prototype.setSourceRef = function (ref) {
        return this._capture.setSourceRef(ref);
    };

    /**
     * runner.sceneRecord() → Promise<SceneRecord + its own content id>. Forwards.
     * @returns {Promise<object>}
     */
    FrqtlApp.prototype.sceneRecord = function () {
        return this._capture.sceneRecord();
    };

    /**
     * THE DIVERGENCE GATE — a physics-registered object that no renderer can see is a
     * THROW, never an invisible body.
     *
     * ── Layer 1: API contract ────────────────────────────────────────────────
     * Called before every draw and before every capture. The world answers which of its
     * LIVE engine registrations carry no JS wrapper (`unwrappedLargeObjectHandles` — the
     * only ledger that can tell a live object from a torn-down one); any survivor means
     * the draw list DERIVED from the world's wrapper census is missing something the
     * physics knows about, and this refuses to draw rather than paint a lie.
     *
     * With the census at the world handle the ordinary case cannot arise — constructing a
     * `LargeObject` registers it for physics AND render in one act. What remains is the
     * RAW `universe.registerLargeObject(spec)` path, which is legitimate in a headless
     * conformance harness (nothing draws) and is exactly the silent-invisible case in a
     * rendered world. So this is the enforcement tooth on the preferred shape, not an
     * alternative to it.
     *
     * The capability check is METHOD PRESENCE (the `move()`/`cameraControl` idiom): a
     * world that publishes no ledger is not a world this host can interrogate, and this
     * host does not invent one.
     *
     * ── Layer 2: physics behaviour ───────────────────────────────────────────
     * ZERO. It reads two ledgers and throws or returns; no frame, dimension, tick or
     * op-program is touched.
     * @private
     */
    FrqtlApp.prototype._assertRenderCensus = function () {
        var u = this.universe;
        if (!u || typeof u.unwrappedLargeObjectHandles !== 'function') { return; }
        var orphans = u.unwrappedLargeObjectHandles();
        if (orphans.length === 0) { return; }
        throw new Error('[FrqtlApp] ' + orphans.length + ' object(s) are registered with the ' +
            'PHYSICS of this world but absent from its render census — handle(s) [' +
            orphans.join(', ') + ']. They collide and count correctly and CANNOT BE SEEN, ' +
            'which is the one outcome this surface refuses: a silently wrong picture is worse ' +
            'than an error, because what the eye is taught from it is wrong. Construct large ' +
            'objects through `new LargeObject(universe, …)` (or a part that does — Wall, ' +
            'GraphingDetectorWall, Tunnel …), which registers them for physics AND render in ' +
            'one act. The raw `universe.registerLargeObject(spec)` path carries no wrapper and ' +
            'belongs to headless harnesses only. (FAIL-LOUD.)');
    };

    /**
     * runner.capture(stage) — the generic render-pipeline tap. Forwards.
     * @param {string} stage — a member of `RenderStages.RENDER_STAGES`.
     * @returns {Promise<object>}
     */
    FrqtlApp.prototype.capture = function (stage) {
        // A Promise-returning entry point never throws SYNCHRONOUSLY: a mixed error channel
        // guarantees an uncaught exception at some call site that only wrote `.catch()`.
        try { this._assertRenderCensus(); } catch (e) { return Promise.reject(e); }
        return this._capture.capture(stage);
    };

    /**
     * runner.captureStill() — the LAST-STAGE CONVENIENCE. Forwards.
     * @returns {Promise<object>}
     */
    FrqtlApp.prototype.captureStill = function () {
        try { this._assertRenderCensus(); } catch (e) { return Promise.reject(e); }
        return this._capture.captureStill();
    };

    /**
     * Add a background-image under-layer (shared backdrop helper — Phase 2, WS-RENDERER).
     *
     * Creates and registers a NON-COLLIDING LargeObject that the renderer draws as the
     * bottom-most layer via _layerBackdrop (under particles and large objects).
     *
     * This is the canonical way to add a backdrop in ANY experiment — no per-page
     * LargeObject construction needed. The backdop's .visible is false by default;
     * the caller toggles it on when desired.
     *
     * @param {Object} image     - a p5.Graphics, HTMLCanvasElement, or any renderable
     *                             object the active renderer can draw as a backdrop image.
     * @param {Object} [rect]    - optional {left, top, w, h} in physics pixels.
     *                             Defaults to the full canvas rect.
     * @param {Object} [opts]    - optional overrides: { visible (default false),
     *                             color (default [0,0,0]) }
     * @returns {Object}         - the LargeObject created, for further manipulation.
     */
    FrqtlApp.prototype.addBackdrop = function (image, rect, opts) {
        opts = opts || {};
        var r = rect || {
            left: 0, top: 0,
            w: this.canvas_rect.w,
            h: this.canvas_rect.h
        };
        var color = opts.color || [0, 0, 0];
        var visible = (opts.visible !== undefined) ? opts.visible : false;

        // Construct via the global — LargeObject is loaded by stack-boot before setup().
        var _LO = (typeof window !== 'undefined' && window.LargeObject)
            ? window.LargeObject : (typeof LargeObject !== 'undefined' ? LargeObject : null);
        var _CT = (typeof window !== 'undefined' && window.CollisionTypes)
            ? window.CollisionTypes : (typeof CollisionTypes !== 'undefined' ? CollisionTypes : null);

        if (!_LO || !_CT) {
            throw new Error('[FrqtlApp.addBackdrop] LargeObject / CollisionTypes are not on the ' +
                'page — stack-boot.js must load the game layer before setup() runs.');
        }

        var backdrop = new _LO(
            this.universe,
            [r.left, r.top, r.w, r.h],
            _CT.NONE, [], 'backdrop', 'closest', null, 1, color
        );
        backdrop.backdrop = true;
        backdrop.image    = image;
        backdrop.visible  = visible;

        // No render-list call: constructing a LargeObject on this world IS registering it,
        // for physics AND for the renderer (CollisionTypes.NONE makes it draw-only).
        return backdrop;
    };

    /**
     * Remove any registered object (LargeObject, or compound wrapper with a .walls
     * array, .detector_wall, ._emitter, or .notEmitter property) from the render
     * list AND fully tear it down engine-side (WS Studio Controls Realignment S4,
     * design item 1 — the CEO-found "delete leaves the emitter tick-fn running"
     * defect).
     *
     * FULL DELETE TEARDOWN: deleting an object removes EVERYTHING it registered —
     * not just its Layers-panel row. Every sub-object that owns a `dispose()`
     * method (LargeObject unregisters engine-side, killing its compiled
     * collision op-program; QuantumEmitter/PointSource tombstone + splice their
     * host tick-fn(s) out of `experimentTickFunctions`, stopping emission dead)
     * gets it called here — ONE canonical teardown fan-out, never a kind-sniffing
     * branch that has to be kept in sync with what each object actually owns.
     * Also untracks any emitter from `_emitters` (the Layers-panel enumeration
     * list `getAuthoredObjects` reads) so a deleted emitter cannot resurface
     * there. Uniform sugar over `dispose()` — callers need not know the internal shape.
     *
     * DISPOSE IS THE REMOVAL. `LargeObject.dispose()` unregisters engine-side, and that
     * one call also leaves the world's wrapper census (which the renderer derives its
     * draw list from) — so there is no second "and also take it off the render list"
     * step to forget, and no window in which a deleted object keeps drawing a body that
     * no longer collides.
     *
     * @param {Object} obj
     */
    FrqtlApp.prototype.removeObject = function (obj) {
        if (!obj) return;
        var self = this;

        function _dispose(o) {
            // FAIL-LOUD (architect gate, S4 commit 11e440d4): dispose() is ALREADY
            // internally idempotent on every implementer (LargeObject/QuantumEmitter/
            // PointSource all guard `if (this._disposed) return;`), so a try/catch HERE
            // can only swallow a GENUINE engine teardown failure (e.g.
            // unregisterLargeObject throwing on an out-of-range/already-tombstoned WASM
            // handle, or a tick-fn splice bug) — exactly the silent-failure class this
            // whole bite exists to close, and it would re-create "delete leaves it
            // running" in the ONE path most likely to hit it (an already-torn-down
            // object). Let it throw — propagates out of removeObject to the caller.
            if (o && typeof o.dispose === 'function') { o.dispose(); }
        }
        function _untrackEmitter(em) {
            if (!em || !self._emitters) return;
            var i = self._emitters.indexOf(em);
            if (i !== -1) { self._emitters.splice(i, 1); }
        }

        if (obj.walls && Array.isArray(obj.walls)) {
            obj.walls.forEach(function (lo) { _dispose(lo); });
            return;
        }
        if (obj.detector_wall) {
            _dispose(obj.detector_wall);
            return;
        }
        // Wall (W1) facade: a single inner LargeObject at obj.lo. Tear it down.
        if (obj._schemaKind === 'Wall' && obj.lo) {
            _dispose(obj.lo);
            return;
        }
        // Composite emitter (the ObjectFactory "visual circle" pattern — a
        // LargeObject carrying ._emitter — or CircuitGate's .notEmitter): tear
        // down the emitter half FIRST, then the visual/host object itself.
        if (obj._emitter) { _dispose(obj._emitter); _untrackEmitter(obj._emitter); }
        if (obj.notEmitter) { _dispose(obj.notEmitter); _untrackEmitter(obj.notEmitter); }
        _dispose(obj);
        _untrackEmitter(obj); // obj itself may BE a bare emitter (no visual LO wrapper)
    };

    /**
     * Track a QuantumEmitter (or PointSource) in the IDE emitters list.
     * These objects register themselves with the engine universe in their own
     * constructors; this method records them for the Layers panel.
     *
     * @param {Object} emitter
     * @returns {Object} the same emitter (for chaining)
     */
    FrqtlApp.prototype.addEmitter = function (emitter) {
        if (!emitter) return emitter;
        if (!this._emitters) { this._emitters = []; }
        if (this._emitters.indexOf(emitter) === -1) { this._emitters.push(emitter); }
        return emitter;
    };

    /**
     * Canonical BY-NAME object resolver (emission-gate contract §4 — "reference by
     * NAME, resolve LAZILY"). Handles are assigned fresh at registration and never
     * survive codegen, so any cross-object reference that must survive a Restart
     * (Save → eval the generated module) is a NAME, resolved against the live
     * runner at use time. This is the ONE runner-level name lookup: it walks
     * `largeObjects` + `_emitters` and, for each entry, considers the entry itself
     * plus its facade back-references (`_facade`/`_wall` — the Wall builder's hop,
     * `_groupOwner` — grouped composites, `_emitter` — the marker→emitter hop);
     * the first candidate whose `.name` matches (and passes `predicate`, when
     * given) wins.
     *
     * Returns null when nothing matches — the CALLER decides whether that is
     * FAIL-LOUD (the emission gate throws; a LiveChart retries next scan).
     *
     * @param {string} name
     * @param {Function} [predicate] — optional filter (cand) => boolean
     * @returns {Object|null}
     */
    FrqtlApp.prototype.getObjectByName = function (name, predicate) {
        if (typeof name !== 'string' || !name) { return null; }
        var lists = [this.largeObjects, this._emitters || []];
        for (var l = 0; l < lists.length; l++) {
            var arr = lists[l];
            for (var i = 0; i < arr.length; i++) {
                var entry = arr[i];
                if (!entry) { continue; }
                // FACADE-FIRST ordering: an inner LO often carries the SAME name as the
                // facade that owns it (the Wall builder mirrors it) — the facade IS the
                // object (it owns the read methods, e.g. getLiveCount); the raw entry is
                // implementation. Same-name ties therefore resolve to the facade.
                var candidates = [entry._facade, entry._wall, entry._groupOwner, entry, entry._emitter];
                for (var c = 0; c < candidates.length; c++) {
                    var cand = candidates[c];
                    if (cand && cand.name === name && (!predicate || predicate(cand))) {
                        return cand;
                    }
                }
            }
        }
        return null;
    };

    /**
     * Return the de-duped top-level authored objects across largeObjects + emitters.
     *
     * "Authored" means: NOT a backdrop, NOT a _grouped sub-object, NOT a particle.
     * Group-owner wrappers are surfaced once even if their sub-LargeObjects are
     * also in the list.
     *
     * This is the authoritative enumeration used by serializeDesign — it closes the
     * gap where setup()-created emitters were in runner._emitters but NOT in
     * runner.largeObjects, causing them to be missed on save.
     *
     * @param {object|null} backdropRef — the backdrop LargeObject to exclude (or null)
     * @returns {Array<{obj: object, kind: 'largeObject'|'emitter', isPrimary: boolean}>}
     *   Each entry: obj = the JS wrapper, kind = 'largeObject' or 'emitter',
     *   isPrimary = true for group owners / standalone, false for grouped sub-objects.
     *   Callers that want only top-level authored objects filter isPrimary===true.
     */
    FrqtlApp.prototype.getAuthoredObjects = function (backdropRef) {
        var seen    = new Set();
        var result  = [];

        // ── LargeObjects ────────────────────────────────────────────────────
        var los = this.largeObjects;
        for (var i = 0; i < los.length; i++) {
            var lo = los[i];
            if (!lo) { continue; }
            if (lo === backdropRef || lo.backdrop === true) { continue; }
            if (seen.has(lo)) { continue; }
            seen.add(lo);
            var isGrouped = lo._grouped === true;
            result.push({ obj: lo, kind: 'largeObject', isPrimary: !isGrouped });
        }

        // ── Emitters (including ones that were NOT surfaced via largeObjects) ─
        var ems = this._emitters || [];
        for (var j = 0; j < ems.length; j++) {
            var em = ems[j];
            if (!em) { continue; }
            if (seen.has(em)) { continue; }
            seen.add(em);
            var emGrouped = em._grouped === true;
            result.push({ obj: em, kind: 'emitter', isPrimary: !emGrouped });
        }

        return result;
    };

    /**
     * Hit-test a physics-pixel point against the registered LargeObjects.
     * Returns the topmost (last-added) LargeObject whose rect contains the point,
     * skipping backdrops and invisible objects.
     *
     * Coordinates must already be in PHYSICS pixels (not CSS pixels). The caller
     * maps CSS px → physics px accounting for devicePixelRatio / canvas scaling.
     *
     * @param {number} x
     * @param {number} y
     * @returns {Object|null}
     */
    FrqtlApp.prototype.hitTest = function (x, y) {
        var _los = this.largeObjects;
        for (var i = _los.length - 1; i >= 0; i--) {
            var lo = _los[i];
            if (!lo || lo.backdrop || lo.visible === false) continue;
            var r = lo.rect;
            if (!r) continue;
            if (x >= r.left && x <= r.left + r.w && y >= r.top && y <= r.top + r.h) {
                return lo;
            }
        }
        return null;
    };

    /**
     * Fan a RENDER-ONLY property write out to the objects a composite wrapper owns.
     *
     * ── Layer 1: API contract ────────────────────────────────────────────────
     * `owner` is a group wrapper (Box / Tunnel / OvenBox / SlitScreen …). Every
     * registered object carrying `_groupOwner === owner` — the back-ref the group
     * objects already stamp on their children at construction (ObjectSchema design
     * rule 6) — receives the SAME write through the SAME accessor, so each child's
     * own kind branch (Wall facade → inner LargeObject, plain LargeObject mirror)
     * applies unchanged. A child whose descriptor does not declare the prop is
     * skipped (a heterogeneous group is legal); a non-wrapper owns nothing and this
     * is a no-op. Never recurses into itself (`child !== owner`).
     *
     * ── Layer 2: physics behavior ────────────────────────────────────────────
     * None. Only `engineVisible:false` (render-only) props reach here — colour,
     * opacity, visibility. Zero engine writes, zero op-program recompiles, so a
     * bench golden cannot move (SU1).
     *
     * @param {Object} runner — the FrqtlApp owning the object list.
     * @param {Object} owner  — the wrapper the write was addressed to.
     * @param {string} prop   — a render-only field name.
     * @param {*}      value  — the new value.
     */
    function _fanOutRenderPropToGroup(runner, owner, prop, value) {
        var list = runner.largeObjects;
        if (!owner || !list || list.length === 0) { return; }
        var schema = (typeof window !== 'undefined' && window.ObjectSchema)
            ? window.ObjectSchema
            : (typeof ObjectSchema !== 'undefined' ? ObjectSchema : null);
        for (var i = 0; i < list.length; i++) {
            var child = list[i];
            if (!child || child === owner || child._groupOwner !== owner) { continue; }
            if (schema) {
                var childDesc = schema.get(child._schemaKind || child.kind || 'LargeObject');
                var declared = false;
                if (childDesc) {
                    for (var f = 0; f < childDesc.fields.length; f++) {
                        if (childDesc.fields[f].name === prop) { declared = true; break; }
                    }
                }
                if (!declared) { continue; }
            }
            runner.updateObjectProperty(child, prop, value);
        }
    }

    /**
     * Uniform schema-driven mutation entry point (Phase 4 — runner level).
     *
     * ONE public method the IDE uses to edit ANY property of ANY object.
     * Routing:
     *   engineVisible:false (color, visible, alpha, name, ...) →
     *       mutate the JS-side wrapper directly (render layer; no engine ABI).
     *   engineVisible:true  (rect, collision_type, source_rects, ...) →
     *       forward to universe.updateObjectProperty (engine-concurrence path).
     *
     * Validation: prop MUST be in the schema for kind → TypeError (FAIL LOUD).
     *
     * @param {Object}  lo    - LargeObject / QuantumEmitter wrapper with .handle and .kind
     * @param {string}  prop  - Field name declared in ObjectSchema for lo's kind
     * @param {*}       value - New value
     * @throws {TypeError}    - If prop is unknown / readonly for the object's kind
     */
    FrqtlApp.prototype.updateObjectProperty = function (lo, prop, value) {
        if (!lo) return;

        // Every shipped object class STAMPS `_schemaKind` (LargeObject, QuantumEmitter,
        // PointSource, Wall, DetectorWall, SphereEmitter, …), so the
        // old `|| 'LargeObject'` fallback never described a real object — it only fired for
        // a handle that is not one of them. Defaulting there turned "I cannot identify this
        // object" into "Property X is not in the schema for kind LargeObject", which blames
        // the SCHEMA for what is actually an unidentified caller argument and sends the
        // reader to the wrong owner entirely. Identify the failure honestly instead.
        var kind = lo._schemaKind || lo.kind;
        if (!kind) {
            throw new TypeError(
                '[FrqtlApp.updateObjectProperty] this object carries no `_schemaKind` ' +
                '(nor `kind`), so its descriptor cannot be resolved — property "' + prop + '" was ' +
                'not rejected by any schema. Every shipped object class stamps `_schemaKind`; a ' +
                'handle without one is usually the wrong handle (e.g. a raw emitter handle rather ' +
                'than the palette object that wraps it).'
            );
        }

        // ── Schema lookup ─────────────────────────────────────────────────────
        var schema = (typeof window !== 'undefined' && window.ObjectSchema)
            ? window.ObjectSchema
            : (typeof ObjectSchema !== 'undefined' ? ObjectSchema : null);

        var fieldDef = null;
        if (schema) {
            var descriptor = schema.get(kind);
            if (!descriptor) {
                throw new TypeError(
                    '[FrqtlApp.updateObjectProperty] Unknown object kind "' + kind + '"'
                );
            }
            for (var i = 0; i < descriptor.fields.length; i++) {
                if (descriptor.fields[i].name === prop) {
                    fieldDef = descriptor.fields[i];
                    break;
                }
            }
            if (!fieldDef) {
                throw new TypeError(
                    '[FrqtlApp.updateObjectProperty] Property "' + prop +
                    '" is not in the schema for kind "' + kind + '"'
                );
            }
            if (fieldDef.type === 'readonly') {
                throw new TypeError(
                    '[FrqtlApp.updateObjectProperty] Property "' + prop +
                    '" is readonly for kind "' + kind + '"'
                );
            }
            // ── Declared-type normalization (THE type gate) ───────────────────
            // The descriptor declares the TYPE; the accessor is the one validating gate,
            // so this is where the written value is made to match it — or REJECTED. The
            // semantics live with the declarations, at the descriptor owner
            // (lib/frqtl/objects/schema `normalizeValue`), and are FERRIED here: a
            // boolean 0/1 becomes a real boolean (every consumer tests IDENTITY — a
            // stored `0` reads as "still visible" and the write silently does nothing);
            // a wrong-typed value (a `'42'` string, a non-array `color`, a non-array
            // `rect` that would reach `lo.rect.w = r[2]` as NaN geometry, an undeclared
            // enum member) THROWS here instead of being stored and poisoning a reader
            // far away. Throw-or-apply, one call, every caller.
            value = schema.normalizeValue(fieldDef, value, kind);

            // ── SphereEmitter (Bite 4b) — sugar; no engine handle ─────────────
            // A SphereEmitter's real state lives in the setupSphereEmitter3D control
            // closure (a host emit tick-fn), not on any engine object. Route EVERY
            // editable/adapter prop to the matching control setter via the facade's
            // own write-router (applyProp) — mechanism-A: the Inspector and the visual
            // marker's coupled-move call THIS, never resolveBind (which is why the
            // SphereEmitter kind sits outside controlBind's bind-executable allowlist).
            // `rect` here is the coupled-move from the visual marker → control.setCenter.
            // Return BEFORE the generic engineVisible mirror-write below (which would
            // assign to a getter-only prop and throw). No universe delegation — the
            // sugar IS the engine-facing write.
            // ── A WALL's rect — the wall's ONE position write (Wall.setRect) ─────────
            // Any Wall-family facade (Wall, GraphingDetectorWall — the constructor stamps the
            // `lo._wall = facade` back-ref) or its INNER LargeObject (the hit-tested / dragged /
            // aimed handle): the rect IS the wall's rect, so the write lands on setRect, which keeps
            // the true slab, the drawn rect, the engine broad rect + backing frame and an
            // absorber's exit in step. Never the inner LO's generic path (it knows none of those).
            var wallFacade = _wallFacadeOf(lo);
            if (prop === 'rect' && wallFacade) {
                wallFacade.setRect(value);
                if (typeof this._onObjectMoved === 'function') { this._onObjectMoved(wallFacade, prop); }
                return;
            }

            var V2_WALL_PROPS = ['collisionBehavior', 'bounceDirection', 'decoherence',
                'hooks', 'markTag', 'countFilter', 'capacity', 'orientationDeg', 'pitchDeg'];

            // ── Wall (W1) — sugar facade over ONE LargeObject (lo.lo) ─────────
            // Any Wall-family facade (_wallFacadeOf), for the fields the Wall descriptor declares. A
            // subclass's OWN declared fields (a GraphingDetectorWall's binPx/refreshMs/heatBase)
            // fall through to the generic path, as before.
            // A lexicon edit RECOMPILES the running op-program (the "flip a wall into a
            // detector mid-run" live path — Wall.setV2Prop). Every other
            // prop (rect/color/alpha/visible/layer/shellShape) is DELEGATED DOWN to the
            // inner LargeObject via the SAME accessor, so its engine-visible rect/layer
            // push + render-only mirror logic applies UNCHANGED (the inner LO keeps its
            // own _schemaKind 'LargeObject'). Return before the generic paths below
            // (which would hit the facade's read-only rect getter and throw).
            if (wallFacade === lo && _isWallField(schema, prop)) {
                // Collision LEXICON v2: the nested behavior/direction/modifier/hook props
                // live on the FACADE (updated in place so the Inspector's visibleWhen re-read
                // reveals dependent fields immediately) and recompile the running op-program
                // via setV2Prop. It is the ONE wall write path.
                // R2AX (two-axis mirror, 2026-07-26): pitchDeg is a FACADE v2 prop,
                // exactly like orientationDeg — its live edit re-bakes the 3-space
                // reflection via the SAME setV2Prop recompile path (Wall.setPitch). It
                // MUST be listed here or it falls to the `lo.lo` delegate below and
                // recurses into the inner LargeObject, whose schema has no pitchDeg →
                // a spurious "not in the schema for kind LargeObject" throw on a live
                // edit that would otherwise land. One facade path, no schema mirror.
                if (V2_WALL_PROPS.indexOf(prop) !== -1) {
                    if (typeof lo.setV2Prop === 'function') { lo.setV2Prop(prop, value); }
                } else if (lo.lo) {
                    this.updateObjectProperty(lo.lo, prop, value);
                }
                if (prop === 'rect' && typeof this._onObjectMoved === 'function') {
                    this._onObjectMoved(lo, prop);
                }
                return;
            }

            // ── Tunnel (D5) — composite sugar over two Walls + the exit gate ──
            // Its live SUGAR props (the exit-gate flags) recompile the gate's op-program via
            // the facade's own write-router. Without this hop the write fell through to the
            // generic mirror-write below, setting a DEAD property on the wrapper while the
            // gate program stayed as it was — the Inspector flag flipped and nothing happened.
            // The router returns FALSE for props it does not own (`color`), which deliberately
            // falls through to the group fan-out that paints both mirror walls.
            if (kind === 'Tunnel' && typeof lo.applyProp === 'function') {
                if (lo.applyProp(prop, value)) { return; }
            }

            if (kind === 'SphereEmitter') {
                if (typeof lo.applyProp === 'function') { lo.applyProp(prop, value); }
                // F5: a position write (a grab carry / programmatic center or rect-adapter)
                // fires the object-moved event so a host (Studio's overlay) can REPAINT — PR-1
                // made the bbox DATA fresh, but the flat overlay only redraws on discrete events;
                // this EXTENDS the event set (never a poll). rect/center are the position props.
                if ((prop === 'center' || prop === 'rect') && typeof this._onObjectMoved === 'function') {
                    this._onObjectMoved(lo, prop);
                }
                return;
            }

            // ── Render-only (engineVisible:false) ─────────────────────────────
            // Mutate the JS-side wrapper object directly. The renderer reads from it
            // on the next draw frame. No engine ABI — physics is not affected.
            if (!fieldDef.engineVisible) {
                // WS Studio Controls Realignment S4 (design §2.3.5 / CEO §4 call #7):
                // collision_type/actions are SUGAR-INPUT fields compiled to an
                // op-program at REGISTRATION (actionCompiler.js) — a bare mirror-write
                // (what every OTHER engineVisible:false prop gets) would only update
                // this wrapper's DISPLAY value, never retarget the RUNNING op-program
                // (a wall flipped to a detector mid-run would keep acting like a
                // wall). Route these two through the recompile-and-push helper
                // instead — "flipping a wall into a detector mid-run" made live.
                if ((kind === 'LargeObject' || kind === 'backdrop') &&
                    (prop === 'collision_type' || prop === 'actions') &&
                    typeof lo.recompileActions === 'function') {
                    var recompileOpts = {};
                    recompileOpts[prop === 'collision_type' ? 'collisionType' : 'actions'] = value;
                    lo.recompileActions(recompileOpts);
                    return;
                }
                lo[prop] = value;
                // ── GROUP FAN-OUT (throw-or-apply, never a silent no-op) ───────
                // A composite wrapper (Box / Tunnel / OvenBox / SlitScreen) owns no
                // drawn body of its own: it DECLARES a render-only prop ("Render
                // color for both mirror walls") whose effect lives on the walls it
                // built. The bare mirror-write above would set a dead property on
                // the wrapper and change nothing on screen — the exact silent no-op
                // the accessor contract forbids. So a render-only write on a wrapper
                // ALSO fans out to the objects it owns, via the SAME accessor.
                // Ownership is the ALREADY-DECLARED `_groupOwner` back-ref every
                // group object stamps on its children at construction (schema design
                // rule 6) — never a per-kind child list here (that would be the
                // schema mirror). A non-wrapper matches nothing and is unchanged.
                _fanOutRenderPropToGroup(this, lo, prop, value);
                return;
            }
        }

        // ── Composite emitter move (WS Studio Controls Realignment S4, design ────
        //    §2.2/§2.5.5 — "the coupled-move caveat") ──────────────────────────────
        // A visual LargeObject carrying `._emitter` (the ObjectFactory
        // QuantumEmitter/PointSource "visual circle" pattern) moves BOTH halves as
        // ONE logical write — this coupling is owned HERE, in the canonical
        // accessor every caller (Studio's overlay drag, the Inspector, a page's own
        // code) already goes through, NOT re-implemented in AuthorView pointer
        // code. Recurse through the SAME accessor so the emitter's own kind-specific
        // rect handling (QuantumEmitter.setSourceRect / PointSource.repositionToRect,
        // below) applies unchanged. Guarded on `lo._emitter !== lo` — the emitter
        // itself never carries an `_emitter` of its own, so this never loops.
        if (prop === 'rect' && lo._emitter && lo._emitter !== lo) {
            this.updateObjectProperty(lo._emitter, 'rect', value);
        }

        // ── Engine-visible (engineVisible:true) ───────────────────────────────
        // For 'rect' props: also update the JS-side wrapper's render rect so the
        // renderer sees the new position without waiting for the next tick.
        // Use the same dimension-first/setter order as _updateLargeObjectRectImpl:
        //   w/h raw writes first, then set left (→ x, right) and set top (→ y, bottom).
        if (prop === 'rect' && lo.rect) {
            // The write wire is [left, top, w, h] or the z-capable [left, top, z, w, h, d].
            var r = (value.length === 6) ? [value[0], value[1], value[3], value[4]] : value;
            if (value.length === 6) { lo.rect.z = value[2]; lo.rect.d = value[5]; }
            // PR-1 (item 4): lo.rect is now a REAL Rectangle instance (2D case) — this comment is
            // TRUE, no longer stale. Set w/h first (own fields), THEN left/top (linked setters that
            // read the updated w/h): `set left` recomputes _x = left + w/2, _right = left + w;
            // `set top` recomputes _y = top + h/2, _bottom = top + h. So the center + far edges stay
            // consistent with left/top after a drag/programmatic rect write — the auto-recompute the
            // hand-rolled bag never had. (A 6-element z/d rect is still a bare bag; harmless here —
            // plain property writes, no linked recompute needed for the flat overlay.)
            lo.rect.w    = r[2];
            lo.rect.h    = r[3];
            lo.rect.left = r[0];
            lo.rect.top  = r[1];
        }

        // ── Mirror engine-visible scalar props onto the JS wrapper (Bug #1/#2 fix) ─
        // The JS wrapper (lo) is the read/serialize source of truth for the inspector
        // and serializeDesign. On WASM the engine state lives in Rust; the JS wrapper
        // is a SHADOW. Without this mirror, lo.collision_type / lo.actions / lo.layer /
        // lo.reposition all stay at CONSTRUCTOR values after a call,
        // so Save→Restart silently drops every edit to those fields.
        //
        // Rule: for every engineVisible scalar prop (not 'rect' — handled via Rectangle
        // setters above; not 'source_rects' — handled by the emitter path), write
        // lo[prop] = value NOW so inspector and serializeDesign always read live state.
        // This mirrors what the render-only path already does for engineVisible:false props.
        if (prop !== 'rect' && prop !== 'source_rects') {
            if (prop === 'actions' && (kind === 'LargeObject' || kind === 'backdrop')) {
                // 'actions' maps to arr_collision_actions on the JS LargeObject wrapper.
                var actArr = Array.isArray(value) ? value.slice() : [value];
                lo.arr_collision_actions = actArr;
                lo.actions = actArr;   // keep schema name 'actions' in sync too
            } else if (prop === 'layer' && (kind === 'LargeObject' || kind === 'backdrop')) {
                // 'layer' → observedDimensions in the engine. null = all dimensions.
                lo.layer = (value !== null && value !== undefined) ? value : null;
                lo.observedDimensions = (value !== null && value !== undefined) ? [value] : [];
            } else {
                lo[prop] = value;
            }
        }

        // ── PointSource rect: reposition all angle emitters ─────────────────
        // PointSource is a user-space compound object (N engine emitters, one per angle).
        // Engine updateObjectProperty does not know about PointSource — handle it here.
        if (kind === 'PointSource' && prop === 'rect') {
            if (typeof lo.repositionToRect === 'function') {
                lo.repositionToRect(value[0], value[1], value[2], value[3], this.universe);
            }
            // PointSource has no single engine handle — skip the universe delegation below.
            return;
        }

        // ── QuantumEmitter rect: reposition the single canonical source rect ────
        // QuantumEmitter is engine-agnostic sugar (G-EMIT-2) — its real state is
        // emState.sourceRects, mutated directly (no provider ABI to delegate to;
        // the RETIRED updateEmitterSourceRects no longer exists). Mirrors the
        // PointSource branch above — this is the "composite emitter move" fix
        // (design §2.2/§2.5.5): before this branch existed, a rect write on a
        // QuantumEmitter passed schema validation then silently no-oped (the
        // universe-delegation below has no LargeObject/backdrop branch for it).
        if (kind === 'QuantumEmitter' && prop === 'rect') {
            if (typeof lo.setSourceRect === 'function') {
                lo.setSourceRect(value);
            }
            return; // no universe delegation — the sugar IS the engine-facing write.
        }

        // Delegate to universe for the engine-side update.
        if (this.universe && typeof this.universe.updateObjectProperty === 'function') {
            this.universe.updateObjectProperty(lo.handle, kind, prop, value);
        }
    };

    /** Resolve the center-bearing target: a marker's `_emitter` (the SphereEmitter facade —
     *  the marker LO has no `center`; the facade's setCenter moves the emission source the
     *  user sees follow the view), else the handle itself. */
    FrqtlApp.prototype._resolveDriveTarget = function (handle) {
        if (handle && handle._emitter && typeof handle._emitter.getCenter === 'function') {
            return handle._emitter;
        }
        return handle;
    };
    /**
     * Resolve the ROTATION target (B7): the first of the selected object, its emitter/wall
     * facade, or the resolved center-target that exposes setOrientation. Null ⇒ no heading to
     * carry or show. Separate from the center-target so a wall (orientation-bearing, LO-backed)
     * and an emitter (orientation-bearing, marker-backed) both work.
     */
    FrqtlApp.prototype._resolveOrientationTarget = function (object, target) {
        var cands = [object, target, (object && object._emitter), (object && object._wall),
                     (target && target._wall)];
        for (var i = 0; i < cands.length; i++) {
            if (cands[i] && typeof cands[i].setOrientation === 'function') { return cands[i]; }
        }
        return null;
    };
    /**
     * Resolve the RECT-positioned target of a centre-less object: the Wall-family facade whose rect
     * is its one position authority (Wall.setRect). Null when there is none (no position to carry).
     */
    FrqtlApp.prototype._resolveRectTarget = function (object) {
        return _wallFacadeOf(object);
    };
    FrqtlApp.prototype._readDriveCenter = function (t) {
        if (!t) { return null; }
        if (typeof t.getCenter === 'function') { var c = t.getCenter(); return Array.isArray(c) ? c : null; }
        if (Array.isArray(t.center)) { return t.center.slice(); }
        return null;
    };
    /**
     * _objectCentroid(object) → [x,y,z] | null — where an object SITS, for the mouse pick. A
     * center-bearing object answers with its drive center; any other LO with its rect's drawn
     * center (lo-drawn-center.js — the point the renderer draws its box at).
     */
    FrqtlApp.prototype._objectCentroid = function (object) {
        var c = this._readDriveCenter(this._resolveDriveTarget(object));
        if (c) { return c; }
        var r = object && object.rect;
        if (!r) { return null; }
        return _resolveLoDrawnCenter().drawnCenter(r);
    };

    /**
     * getUniverseBounds() → { width, height, zHalf } (engine px). The 2D canvas is
     * width×height; the "canvas cube" adds a z-extent — a named convention parameter
     * (spec §2c): zHalf = min(width,height)/2 (a cube-ish volume centered on the z=0
     * target). Used by the grab-carry clamp; a game may read it too.
     */
    FrqtlApp.prototype.getUniverseBounds = function () {
        // canvas_rect is written once, at construction, from the REQUIRED canvasW/canvasH; read
        // through the ONE normalizer, so a missing dimension throws rather than clamping to 0.
        var r = _resolveObjectSchema().worldRect(this.canvas_rect, 'FrqtlApp.getUniverseBounds canvas_rect');
        var w = r.w, h = r.h;
        return { width: w, height: h, zHalf: Math.min(w, h) / 2 };
    };
    /** Clamp a carried center to the canvas cube (spec §2c — confinement in the CARRY path,
     *  NEVER in the updateObjectProperty accessor, which stays throw-or-apply against the
     *  schema; the engine/emitter/programmatic placement set `center` freely). */
    FrqtlApp.prototype._clampToUniverseCube = function (c) {
        var b = this.getUniverseBounds();
        var x = Math.max(0, Math.min(b.width, c[0]));
        var y = Math.max(0, Math.min(b.height, c[1]));
        var z = Math.max(-b.zHalf, Math.min(b.zHalf, (c[2] != null) ? c[2] : 0));
        return [x, y, z];
    };

    // ── THE AIM: a stationary reticle, a center-ray hover, a SPACEBAR grab ──────────────────
    // (docs/internal/engine/AIM_GRAB_FEEDBACK_CONTRACT.md.) The reticle sits at screen centre
    // and the sticks fly the CAMERA in every state. The first visible object on the camera's
    // centre ray is GRAB-READY; SPACE grabs it; a grabbed object HOLDS its camera-relative pose
    // (position + heading) under every camera motion, so it is placed by moving the world and
    // re-oriented by turning it; SPACE places it. The runner owns the state machine and the
    // carry; the camera owns motion (and says when it moved: addPoseListener); the provider
    // owns the paint. No stick ever routes to an object.

    /** World px added on every side of a volume before the centre-ray test, so a thin wall
     *  (a plate of depth ~0) is aimable. */
    FrqtlApp.HOVER_MARGIN = 6;
    /** Below this world-xy length of a carried unit heading, the heading is not expressible
     *  in the 1-DOF orientation model (it points along world z) and HOLDS its last value. */
    FrqtlApp.HEADING_HOLD_EPS = 0.05;
    /** Beyond this |z| (world px) a carried centre is not expressible by a z-LESS rect (it sits
     *  at z-centre 0 — lo-drawn-center): the object stays on the z = 0 plane and says Z HELD. */
    FrqtlApp.Z_HOLD_EPS = 1e-6;

    var AIM_OFF = 'off', AIM_ROAMING = 'roaming', AIM_READY = 'grab-ready', AIM_GRABBED = 'grabbed';

    /**
     * setAimArmed(on) — arm/disarm the aim surface. The host arms it in STUDIO Design with a
     * tool active; Run, the no-tool view and a scene reset disarm it (a disarm RELEASES a grab
     * where the object stands). Arming needs an ANGULAR camera (`OrbitBag.hasAngularPose`) —
     * a flat camera has no centre ray to aim with, so arming there leaves the aim off (the same
     * predicate that keeps the joysticks out of 2D). An angular camera whose handle lacks the
     * pose notice or the offset pair breaks RENDERER_CONTRACT §1a.2 and THROWS.
     */
    FrqtlApp.prototype.setAimArmed = function (on) {
        if (!on) {
            if (!this._aim) { return; }
            this._aim.unsubscribePose();
            this._aim = null;
            this._notifyAim();
            return;
        }
        if (this._aim) { return; }
        var cam = this.cameraControl;
        if (!_resolveOrbitBag().hasAngularPose(cam)) { return; }
        if (typeof cam.addPoseListener !== 'function' || typeof cam.cameraOffsetFromWorld !== 'function' ||
            typeof cam.worldFromCameraOffset !== 'function') {
            throw new Error('[FrqtlApp.setAimArmed] the angular camera handle lacks addPoseListener / ' +
                'cameraOffsetFromWorld / worldFromCameraOffset — the aim follows the camera through its ' +
                'pose notice and reads the ray off the offset pair (RENDERER_CONTRACT §1a.2). (FAIL-LOUD.)');
        }
        var self = this;
        this._aim = { cam: cam, hover: null, grab: null, atEdge: false, headingHeld: false, zHeld: false, error: null,
                      last: null, unsubscribePose: null };
        this._aim.unsubscribePose = cam.addPoseListener(function () { self._onAimPose(); });
        this._refreshHover();
        this._notifyAim();
    };
    FrqtlApp.prototype.isAimArmed = function () { return !!this._aim; };

    /**
     * getAimState() → `{ state, hover, grabbed, atEdge, headingHeld, zHeld, error }` — `state` ∈
     * off|roaming|grab-ready|grabbed; `hover`/`grabbed` are object NAMES (or null); `atEdge` is
     * true while the carried pose is clamped to the universe cube; `headingHeld` while the carried
     * heading points along world z (not expressible, held); `zHeld` while a z-less (flat) rect is
     * carried off the z = 0 plane it is pinned to (held there); `error` is the message of a carry
     * write that threw (the grab was released).
     */
    FrqtlApp.prototype.getAimState = function () {
        var a = this._aim;
        if (!a) { return { state: AIM_OFF, hover: null, grabbed: null, atEdge: false, headingHeld: false, zHeld: false, error: null }; }
        return {
            state: a.grab ? AIM_GRABBED : (a.hover ? AIM_READY : AIM_ROAMING),
            hover: a.hover ? (a.hover.name || '') : null,
            grabbed: a.grab ? (a.grab.object.name || '') : null,
            atEdge: !!(a.grab && a.atEdge),
            headingHeld: !!(a.grab && a.headingHeld),
            zHeld: !!(a.grab && a.zHeld),
            error: a.error
        };
    };
    /** The grabbed object (a `largeObjects` entry) or null — the host selects it. */
    FrqtlApp.prototype.getGrabbedObject = function () {
        return (this._aim && this._aim.grab) ? this._aim.grab.object : null;
    };

    /**
     * addAimListener(fn) → unsubscribe. `fn(state)` runs after every change of the aim state
     * (arm, disarm, hover, grab, release, clamp, heading hold, a carry error) with getAimState().
     */
    FrqtlApp.prototype.addAimListener = function (fn) {
        var ls = this._aimListeners || (this._aimListeners = []);
        if (ls.indexOf(fn) === -1) { ls.push(fn); }
        return function () { var i = ls.indexOf(fn); if (i !== -1) { ls.splice(i, 1); } };
    };
    FrqtlApp.prototype._notifyAim = function () {
        var st = this.getAimState();
        if (this._aim) { this._aim.last = JSON.stringify(st); }
        var ls = (this._aimListeners || []).slice();
        for (var i = 0; i < ls.length; i++) { ls[i](st); }
    };
    /** Notify only when the published state actually changed (a carry step usually does not). */
    FrqtlApp.prototype._notifyAimIfChanged = function () {
        if (this._aim && JSON.stringify(this.getAimState()) === this._aim.last) { return; }
        this._notifyAim();
    };

    /**
     * grabToggle() — THE spacebar. At GRAB-READY it grabs the hovered object, capturing its full
     * camera-relative pose; while GRABBED it places the object where it stands; at ROAMING (or
     * disarmed) it is a no-op. An object that refuses the grab (a wall carrying another part's
     * program) stays un-grabbed and the refusal is published as `error`. Returns the new state name.
     */
    FrqtlApp.prototype.grabToggle = function () {
        var a = this._aim;
        if (!a) { return AIM_OFF; }
        if (a.grab) {
            this._releaseGrab();
        } else {
            this._refreshHover();
            if (a.hover) {
                try {
                    a.grab = this._captureGrab(a.hover); a.atEdge = false; a.headingHeld = false; a.zHeld = false; a.error = null;
                } catch (e) {
                    a.grab = null; a.error = 'the object cannot be grabbed: ' + (e && e.message ? e.message : e);
                }
            }
        }
        this._notifyAim();
        return this.getAimState().state;
    };
    FrqtlApp.prototype._releaseGrab = function () {
        if (this._aim) { this._aim.grab = null; this._aim.atEdge = false; this._aim.headingHeld = false; this._aim.zHeld = false; }
    };

    /**
     * setSelectHighlight(object | null) — the host's selection, handed down so its shadow-surround
     * paints (the same highlight geometry as the aim's). Selection never grabs; a selection that
     * is not the grabbed object (a deselect, another pick) RELEASES the grab.
     */
    FrqtlApp.prototype.setSelectHighlight = function (object) {
        this._selected = object || null;
        var a = this._aim;
        if (a && a.grab && a.grab.object !== this._selected) {
            this._releaseGrab();
            this._notifyAim();
        }
    };

    /** The full camera-relative pose of `lo` at grab: the position offset (of a centre-bearing
     *  target's centre, else of a rect-positioned target's DRAWN centre — lo-drawn-center) and the
     *  heading's camera-frame components (an orientation-bearing target). */
    FrqtlApp.prototype._captureGrab = function (lo) {
        var cam = this._aim.cam;
        var target = this._resolveDriveTarget(lo);
        var center = this._readDriveCenter(target);
        var rectTarget = center ? null : this._resolveRectTarget(lo);
        if (rectTarget) {
            // A wall whose program another part pushed (a Tunnel member) is that part's to move:
            // refuse the grab loudly rather than carry or turn it on its own.
            rectTarget.assertOwnsProgram();
            center = _resolveLoDrawnCenter().drawnCenter(rectTarget.rect);
        }
        var oriTarget = this._resolveOrientationTarget(lo, target);
        var g = { object: lo, target: target, rectTarget: rectTarget,
                  off: center ? cam.cameraOffsetFromWorld(center) : null,
                  oriTarget: oriTarget, hCam: null };
        if (oriTarget && typeof oriTarget.getOrientation === 'function') {
            var r = (oriTarget.getOrientation() || 0) * Math.PI / 180;
            var o0 = cam.cameraOffsetFromWorld([0, 0, 0]);
            var o1 = cam.cameraOffsetFromWorld([Math.cos(r), Math.sin(r), 0]);
            g.hCam = { right: o1.right - o0.right, up: o1.up - o0.up, forward: o1.forward - o0.forward };
        }
        return g;
    };

    /** The pose notice: carry the grabbed object, then re-aim the centre ray. */
    FrqtlApp.prototype._onAimPose = function () {
        if (this._aim && this._aim.grab) { this._carryGrab(); }
        this._refreshHover();
        this._notifyAimIfChanged();
    };

    /**
     * Re-place the grabbed object at its held camera-relative pose in the LIVE basis: the centre
     * through worldFromCameraOffset → the universe-cube clamp → the canonical write (`center`, or
     * for a rect-positioned target the rect placed at that centre by lo-drawn-center rectAtCenter,
     * written as `rect`), then the offset re-captured from where the object now IS (its centre, or
     * its written rect's drawnCenter) — glued at the wall, no invisible over-travel. A z-less rect
     * cannot leave z = 0, so its centre is placed there and zHeld says so. The heading is
     * re-expressed in the live basis, projected onto world-xy, written through setOrientation.
     * A write that throws RELEASES the grab and publishes the error.
     */
    FrqtlApp.prototype._carryGrab = function () {
        var a = this._aim, g = a.grab, cam = a.cam;
        try {
            if (g.off) {
                var c = cam.worldFromCameraOffset(g.off);
                var k = this._clampToUniverseCube(c);
                a.atEdge = (Math.abs(k[0] - c[0]) + Math.abs(k[1] - c[1]) + Math.abs(k[2] - c[2])) > 1e-6;
                if (g.rectTarget) {
                    var L = _resolveLoDrawnCenter();
                    var flat = (typeof g.rectTarget.rect.z !== 'number');
                    a.zHeld = flat && Math.abs(k[2]) > FrqtlApp.Z_HOLD_EPS;
                    if (flat) { k = [k[0], k[1], 0]; }
                    this.updateObjectProperty(g.rectTarget, 'rect', L.rectAtCenter(g.rectTarget.rect, k));
                    k = L.drawnCenter(g.rectTarget.rect);
                } else {
                    this.updateObjectProperty(g.target, 'center', k);
                }
                g.off = cam.cameraOffsetFromWorld(k);
            }
            if (g.hCam) {
                var w0 = cam.worldFromCameraOffset({ right: 0, up: 0, forward: 0 });
                var w1 = cam.worldFromCameraOffset(g.hCam);
                var hx = w1[0] - w0[0], hy = w1[1] - w0[1];
                a.headingHeld = Math.hypot(hx, hy) < FrqtlApp.HEADING_HOLD_EPS;
                if (!a.headingHeld) { g.oriTarget.setOrientation(Math.atan2(hy, hx) * 180 / Math.PI); }
            }
        } catch (e) {
            this._releaseGrab();
            a.error = 'the grabbed object could not follow the camera: ' + (e && e.message ? e.message : e);
            this._notifyAim();
        }
    };

    /**
     * The volume `lo` is aimed at by (compat/renderer/lo-drawn-center.js — the SAME volume the
     * shadow-surround paints): a centre-bearing object's drive centre as a sphere the size of its
     * drawn marker, else the rect's drawn box turned by its shell rotation. null when it has neither.
     */
    FrqtlApp.prototype._aimVolume = function (lo) {
        var L = _resolveLoDrawnCenter();
        var c = this._readDriveCenter(this._resolveDriveTarget(lo));
        if (c) {
            var r = lo.rect ? Math.max(lo.rect.w || 0, lo.rect.h || 0) / 2 : 0;
            return L.drawnVolume({ center: c, radius: r });
        }
        return lo.rect ? L.drawnVolume(lo) : null;
    };

    /** Whether the frame DRAWS `lo` — the runner's own render view, never the provider's:
     *  not a backdrop, `visible` not false, and its shell shown in the current mode. */
    FrqtlApp.prototype._isAimable = function (lo) {
        return !!lo && !lo.backdrop && lo.visible !== false && this._isShellVisible(lo);
    };

    /**
     * _centerRay() → `{ origin, dir }` — the camera's screen-centre ray, read off the OFFSET pair:
     * the eye is the offset origin, the direction the unit forward offset. (The screen pair —
     * screenToWorld / screenPointOf — answers point-on-plane questions and is not used for rays.)
     */
    FrqtlApp.prototype._centerRay = function () {
        var cam = this._aim.cam;
        var o = cam.worldFromCameraOffset({ right: 0, up: 0, forward: 0 });
        var f = cam.worldFromCameraOffset({ right: 0, up: 0, forward: 1 });
        return { origin: o, dir: [f[0] - o[0], f[1] - o[1], f[2] - o[2]] };
    };

    /** Recompute which visible object the centre ray hits first (lo-drawn-center firstHit). */
    FrqtlApp.prototype._refreshHover = function () {
        var a = this._aim;
        if (!a) { return; }
        var los = this.largeObjects, cands = [], vols = [];
        for (var i = 0; i < los.length; i++) {
            if (!this._isAimable(los[i])) { continue; }
            var v = this._aimVolume(los[i]);
            if (v) { cands.push(los[i]); vols.push(v); }
        }
        var ray = this._centerRay();
        var hit = _resolveLoDrawnCenter().firstHit(ray.origin, ray.dir, vols, FrqtlApp.HOVER_MARGIN);
        a.hover = hit ? cands[hit.index] : null;
    };

    // ── The aim feedback bag, threaded to the provider via the renderTick opts channel ──────
    // LIVE per-frame state (never setRenderOption), under ONE runner-injected key. A provider
    // that ignores it draws nothing (capability-checked).
    var AIM_FEEDBACK_KEY = 'aimFeedback';

    /**
     * The render-option keys this RUNNER merges into the bag per render — never a provider
     * capability, never user-writable. The read-set conformance test FERRIES this list as its
     * one exemption.
     */
    FrqtlApp.RUNNER_INJECTED_RENDER_KEYS = Object.freeze([AIM_FEEDBACK_KEY]);

    /**
     * The live aim feedback, or null when the aim is disarmed:
     *   `{ bounds, state, hover?: {name, volume}, selected?: {name, volume}, grabbed?: {name, volume},
     *      orientation?: {pivot, deg} }`
     * `hover` is the grab-ready (or grabbed) object's shadow-surround, `selected` the host
     * selection's, `grabbed` marks the grabbed one (its lock glyph), and `orientation` the passive
     * heading of the grabbed (else selected) orientation-bearing object. Every volume is the
     * lo-drawn-center volume the ray tested.
     */
    FrqtlApp.prototype._computeAimFeedback = function () {
        var a = this._aim;
        if (!a) { return null; }
        this._refreshHover();
        this._notifyAimIfChanged();
        var self = this;
        function mark(lo) {
            var v = lo && self._aimVolume(lo);
            return v ? { name: lo.name || '', volume: v } : null;
        }
        var fb = { bounds: this.getUniverseBounds(), state: this.getAimState().state };
        var hov = mark(a.grab ? a.grab.object : a.hover);
        if (hov) { fb.hover = hov; }
        var sel = (this._selected && this._isAimable(this._selected)) ? mark(this._selected) : null;
        if (sel) { fb.selected = sel; }
        if (a.grab && hov) { fb.grabbed = hov; }
        var headed = a.grab ? a.grab.object : this._selected;
        var oriT = headed ? this._resolveOrientationTarget(headed, this._resolveDriveTarget(headed)) : null;
        var headVol = headed ? this._aimVolume(headed) : null;
        if (oriT && headVol && typeof oriT.getOrientation === 'function') {
            fb.orientation = { pivot: headVol.center, deg: oriT.getOrientation() || 0 };
        }
        return fb;
    };
    /** The render options for a frame: the persistent user options plus the live aim feedback (if any). */
    FrqtlApp.prototype._renderOptsWithFeedback = function () {
        var fb = this._computeAimFeedback();
        if (!fb) { return this._renderOptions; }
        var bag = Object.assign({}, this._renderOptions);
        bag[AIM_FEEDBACK_KEY] = fb;
        return bag;
    };

    /**
     * screenPointOf(world, cssW, cssH, seed?) → [x,y] | null — THE world→screen map: the point, in
     * a cssW×cssH screen surface, at which the renderer DRAWS world point `world` ([x,y] or
     * [x,y,z]; z defaults to 0). It is the ADJOINT of the provider's own screenToWorld (the one
     * camera authority, in both directions — no second projection is derived here): Newton steps
     * on the unprojection onto world's z-plane, from `seed` ([x,y]; default the surface centre),
     * using the local Jacobian (world delta per +1 screen px). The map on a plane is projective
     * (affine for the 2D pan/zoom camera), so a few steps converge; the answer is accepted only if
     * it unprojects back onto `world`. null is the contracted "not on screen from this view"
     * answer — never a cue to try another mapping. THROWS when there is no renderer or it lacks
     * the screenToWorld capability (RENDERER_CONTRACT: screenToWorld).
     */
    FrqtlApp.prototype.screenPointOf = function (world, cssW, cssH, seed) {
        var r = this.renderer;
        if (!r || typeof r.screenToWorld !== 'function') {
            throw new Error('[FrqtlApp.screenPointOf] the active renderer provider has no ' +
                'screenToWorld capability (RENDERER_CONTRACT) — world→screen is its adjoint and ' +
                'has no other source. (FAIL-LOUD.)');
        }
        var z = (typeof world[2] === 'number') ? world[2] : 0;
        var x = seed ? seed[0] : cssW / 2, y = seed ? seed[1] : cssH / 2;
        for (var k = 0; k < 8; k++) {
            var p0 = r.screenToWorld(x, y, cssW, cssH, z);
            var px = r.screenToWorld(x + 1, y, cssW, cssH, z);
            var py = r.screenToWorld(x, y + 1, cssW, cssH, z);
            if (!p0 || !px || !py) { return null; }
            var a = px.x - p0.x, b = py.x - p0.x, e = px.y - p0.y, f = py.y - p0.y;
            var det = a * f - b * e;
            if (!det) { return null; }   // the plane is edge-on to the view
            var wx = world[0] - p0.x, wy = world[1] - p0.y;
            var dx = (f * wx - b * wy) / det, dy = (a * wy - e * wx) / det;
            x += dx; y += dy;
            if (Math.abs(dx) + Math.abs(dy) < 0.05) { break; }
        }
        var q = r.screenToWorld(x, y, cssW, cssH, z);
        if (!q || Math.abs(q.x - world[0]) + Math.abs(q.y - world[1]) > 0.5) { return null; }
        return [x, y];
    };

    /** Screen radius (in the caller's screen units) inside which a click picks an object. */
    FrqtlApp.PICK_RADIUS_PX = 32;
    /** A center-bearing (drivable) object's pick distance is divided by this, so in a dense scene
     *  the thing the sticks can MOVE wins a near-tie against a wall behind it. */
    FrqtlApp.PICK_DRIVE_PRIORITY = 2;

    /**
     * pickObjectAtScreen(cssX, cssY, cssW, cssH) → the object whose centroid is DRAWN nearest the
     * screen point, or null (spec §2). The distance is in SCREEN px (each centroid is located on
     * screen through the provider's screenToWorld — screenPointOf), so the pick radius is what the
     * eye sees at any zoom, axis and depth; a world-px radius on each object's own plane was
     * anisotropic on screen and different per plane, which let a wall behind the emitter win inside
     * the emitter's own footprint. A drivable object's distance is divided by PICK_DRIVE_PRIORITY.
     * Objects-layer; consumed downward by AuthorView. Null (fail-soft) with no screenToWorld
     * capability — the host falls back to the Layers panel.
     */
    FrqtlApp.prototype.pickObjectAtScreen = function (cssX, cssY, cssW, cssH) {
        var r = this.renderer;
        if (!r || typeof r.screenToWorld !== 'function') { return null; }
        var los = this.largeObjects;
        var best = null, bestScore = Infinity;
        for (var i = 0; i < los.length; i++) {
            var lo = los[i];
            var c = this._objectCentroid(lo);
            if (!c) { continue; }
            var sp = this.screenPointOf(c, cssW, cssH, [cssX, cssY]);
            if (!sp) { continue; }
            var drivable = !!this._readDriveCenter(this._resolveDriveTarget(lo));
            var score = Math.hypot(sp[0] - cssX, sp[1] - cssY) / (drivable ? FrqtlApp.PICK_DRIVE_PRIORITY : 1);
            if (score < bestScore) { bestScore = score; best = lo; }
        }
        return (bestScore <= FrqtlApp.PICK_RADIUS_PX) ? best : null;
    };

    /**
     * Uniform schema-driven mutation entry point for the live UNIVERSE singleton
     * (WS Studio Controls Realignment S1, design §2.3.2 / gap-census #10).
     *
     * Mirrors `updateObjectProperty`'s throw-or-apply discipline for the ONE other
     * object every experiment page has exactly one of: the universe itself. Unlike
     * a Frame/LargeObject prop there is no separate engine-ABI branch to dispatch
     * to — `wavelengthScale`'s own JS-side property setter
     * (`EGPTUniverse.prototype.wavelengthScale`, `wasm-engine.js`) already calls
     * through to the WASM ABI (`_wasm.set_wavelength_scale`), so once schema
     * validation has passed, `this.universe[prop] = value` IS the engine write —
     * never a bare, unvalidated assignment (that's exactly the bind-local-property-
     * list anti-pattern this accessor exists to close off).
     *
     * @param {string} prop  - Field name declared in ObjectSchema.get('Universe')
     * @param {*}      value - New value
     * @throws {TypeError} - If prop is unknown or readonly for the 'Universe' kind
     */
    FrqtlApp.prototype.setUniverseProperty = function (prop, value) {
        var schema = (typeof window !== 'undefined' && window.ObjectSchema)
            ? window.ObjectSchema
            : (typeof ObjectSchema !== 'undefined' ? ObjectSchema : null);
        if (!schema) {
            throw new TypeError(
                '[FrqtlApp.setUniverseProperty] ObjectSchema is unavailable — cannot ' +
                'validate "' + prop + '" (FAIL-LOUD: never write to the universe unvalidated).'
            );
        }
        var descriptor = schema.get('Universe');
        if (!descriptor) {
            throw new TypeError('[FrqtlApp.setUniverseProperty] Unknown object kind "Universe"');
        }
        var fieldDef = null;
        for (var i = 0; i < descriptor.fields.length; i++) {
            if (descriptor.fields[i].name === prop) { fieldDef = descriptor.fields[i]; break; }
        }
        if (!fieldDef) {
            throw new TypeError(
                '[FrqtlApp.setUniverseProperty] Property "' + prop +
                '" is not in the schema for kind "Universe". Valid properties: ' +
                descriptor.fields.map(function (f) { return f.name; }).join(', ')
            );
        }
        if (fieldDef.type === 'readonly') {
            throw new TypeError(
                '[FrqtlApp.setUniverseProperty] Property "' + prop + '" is readonly for kind "Universe"'
            );
        }
        this.universe[prop] = value;
    };

    /**
     * Read counterpart to setUniverseProperty — same schema validation, live read
     * (no tick dependency, unlike the LargeObject snapshot path).
     *
     * @param {string} prop - Field name declared in ObjectSchema.get('Universe')
     * @returns {*} the current value of `this.universe[prop]`
     * @throws {TypeError} - If prop is unknown for the 'Universe' kind
     */
    FrqtlApp.prototype.getUniverseProperty = function (prop) {
        var schema = (typeof window !== 'undefined' && window.ObjectSchema)
            ? window.ObjectSchema
            : (typeof ObjectSchema !== 'undefined' ? ObjectSchema : null);
        if (schema) {
            var descriptor = schema.get('Universe');
            if (descriptor) {
                var fieldDef = null;
                for (var i = 0; i < descriptor.fields.length; i++) {
                    if (descriptor.fields[i].name === prop) { fieldDef = descriptor.fields[i]; break; }
                }
                if (!fieldDef) {
                    throw new TypeError(
                        '[FrqtlApp.getUniverseProperty] Property "' + prop +
                        '" is not in the schema for kind "Universe". Valid properties: ' +
                        descriptor.fields.map(function (f) { return f.name; }).join(', ')
                    );
                }
            }
        }
        return this.universe[prop];
    };

    /**
     * Move a LargeObject to a new position.
     * Private dispatch target — kept so internal callers don't break.
     * The public entry point is updateObjectProperty(lo, 'rect', [left, top, w, h]).
     *
     * @param {Object} lo    LargeObject wrapper with .handle and .rect
     * @param {number} left  New left edge (physics pixels)
     * @param {number} top   New top edge (physics pixels)
     * @param {number} [w]   New width  (default: unchanged)
     * @param {number} [h]   New height (default: unchanged)
     */
    FrqtlApp.prototype.moveLargeObject = function (lo, left, top, w, h) {
        if (!lo || !lo.rect) return;
        var newW = (w !== undefined) ? w : lo.rect.w;
        var newH = (h !== undefined) ? h : lo.rect.h;
        // Route through the uniform API so engine-visible mutation goes through one path.
        this.updateObjectProperty(lo, 'rect', [left, top, newW, newH]);
    };

    // ── Canvas creation ────────────────────────────────────────────────────

    /**
     * Create the canvas and attach it to the configured parent element.
     *
     * When the p5 renderer is active: MUST be called from p5's setup() context
     * (delegates to the p5 provider's init(), which calls createCanvas()).
     *
     * FAIL-LOUD: with no renderer provider resolved this THROWS naming
     * render-boot.js. There is no bare-p5 fallback — a page that draws through
     * an unresolved renderer is the silent-degradation this file's own doctrine
     * forbids.
     *
     * @returns {p5.Element|HTMLCanvasElement} The created canvas element.
     * @throws {Error} when no RendererProvider is active.
     */
    FrqtlApp.prototype.createCanvas = function () {
        this._createCanvasCalled = true;   // from here init states the rect (see _getRenderer)
        var prov = this._getRenderer();
        if (prov && prov.init) {
            // New path: delegate to provider
            var initOpts = {
                parentEl: this._canvasParentId,
                width:    this.canvas_rect.w,
                height:   this.canvas_rect.h,
                is3D:     this._is3D
            };
            if (this._depth !== null) { initOpts.depth = this._depth; }
            var el = prov.init(initOpts);
            if (this._onReady) { this._onReady(this); }
            return el;
        }

        throw new Error('[FrqtlApp.createCanvas] no RendererProvider is active — ' +
            'one is booted by lib/frqtl/experiments/_shared/render-boot.js — a page waits for it ' +
            'with window._egptStartSketch() (stack-boot.js), a programmatic host with ' +
            'window._egptWhenRendererReady — before calling createCanvas().');
    };

    // ── Experiment setup ───────────────────────────────────────────────────

    /**
     * Run a setup factory (e.g. setupDoubleSlit) on this runner's universe: its world
     * step (`setupFn.initWorld`, when the factory exports one), then the factory itself.
     *
     * FACTORY STATICS — the declarations a factory exports for its runner, listed ONCE in
     * `FrqtlApp.FACTORY_STATICS`; a wrapper around a factory carries them with
     * `FrqtlApp.carryFactoryStatics(wrapper, factory)`:
     *   - `initWorld(universe, opts)` — the world the factory's part implies, run FIRST.
     * A factory carrying the deleted `RATE_LIMITS` static THROWS here; pacing is
     * `runner.setRateLimits(...)` (a scene: `exp.runner.setRateLimits(...)`).
     *
     * CANONICAL TEARDOWN (CEO drive #2, 2026-07-14 — the S4 dispose discipline,
     * generalized to setup-level reinit): `universe.init()` (called by the world step
     * below) resets the WASM instance's physics state but does NOT
     * clear the JS-side `universe.experimentTickFunctions` array — a fact
     * `fx-experiment.js`'s own loop-control docstring already names explicitly
     * ("NOT cleared by init() and would duplicate on every reset"), which is
     * why THAT mechanism never pushes a recurring tick-fn in the first place.
     * A setup factory that DOES register a recurring host tick-fn (e.g. a
     * continuous burst injector) for a LIVE, re-runnable experiment page must
     * therefore tear its OWN registration down before the next `setup()` call
     * installs a new one, or the OLD tick-fn keeps firing into the SAME array
     * forever, compounding the population across every reinit (the exact
     * "5730 → 8890 → 10160 → 10720" runaway the tester measured). Rather than
     * require every such page to remember a bespoke unhook, this ONE canonical
     * check-and-call — mirroring `removeObject`'s own `_dispose()` idiom
     * EXACTLY (any object with a `.dispose()` method gets it called,
     * idempotently, no kind-sniffing) — runs here, generically, for every
     * experiment page: a setup factory that returns `{dispose(){...}}` on its
     * `setupResult` gets automatic teardown-before-reinit for free. Every
     * EXISTING setup factory (none of which currently returns `.dispose`) is
     * byte-identical — this is a pure ADDITION, not a behavior change, for
     * anything that doesn't opt in.
     */
    FrqtlApp.prototype.setup = function (setupFn, opts) {
        opts = opts || {};
        // A scene reset disarms the aim: a grabbed or selected object is about to be disposed.
        if (this._aim) { this.setAimArmed(false); }
        this._selected = null;
        if (this._setupResult && typeof this._setupResult.dispose === 'function') {
            this._setupResult.dispose();
        }
        // RETAINED so `restart()` can replay the SAME scene in-place. Kept here (the
        // one place a setup is run) rather than at each call site, so every page —
        // and every host driving a declared `restart` action — gets it for free.
        this._setupFn   = setupFn;
        this._setupOpts = opts;
        // ONE BOOT SEQUENCE (#81): a factory that constructs a PART exports its implied
        // world as `setupFn.initWorld(universe, opts)`; the runner runs it FIRST, then the
        // part step. A factory that owns its world (setupDoubleSlit, the composites) exports
        // none and inits inside. Either way `restart()` — which re-enters here — replays the
        // whole scene from a fresh world, never the part alone on a populated one.
        _refuseDeletedStatics(setupFn, 'setup');
        if (typeof setupFn.initWorld === 'function') {
            setupFn.initWorld(this.universe, opts);                // 1. WORLD
        }
        this._setupResult  = setupFn(this.universe, opts);         // 2. PART(S)
        // NO render-list assignment: a factory's LargeObjects registered themselves with
        // the world as they were CONSTRUCTED. The old line replaced the host's shadow list
        // with `setupResult.largeObjects`, which both required every factory to remember to
        // return the list AND silently dropped anything built outside it.
        return this._setupResult;
    };

    /**
     * restart() — the PAGE-LEVEL restart primitive (presentation pass Item 2,
     * CEO-ratified E-P2b): stop → dispose → re-run the RETAINED setup factory — world
     * step then part step, via setup() — with its ORIGINAL opts → start. The scene returns to tick 0 IN-PAGE: no reload, so
     * the camera orbit, render options and any host wiring survive.
     *
     * Teardown runs EXACTLY ONCE — `setup()` above already calls the previous
     * setupResult's `dispose()` before installing the new one, so this method must
     * NOT dispose again (double teardown was the stacking-regression this seam was
     * built to avoid).
     *
     * DISTINCT BY DESIGN from STUDIO's codegen Restart (AuthorView), which rebuilds
     * a persisted DESIGN and reloads the page: that one is STUDIO chrome and stays
     * where it is. This one replays the already-loaded module.
     *
     * @returns {*} the fresh setup result.
     * @throws {Error} FAIL-LOUD when no setup factory has ever been run (there is
     *   nothing to replay) — never a silent no-op.
     */
    FrqtlApp.prototype.restart = function () {
        if (typeof this._setupFn !== 'function') {
            throw new Error('[FrqtlApp] restart(): no setup factory has been run on this ' +
                'runner — call setup(factory, opts) first. (FAIL-LOUD — a restart with nothing to ' +
                'replay would silently do nothing.)');
        }
        this.stop();
        var result = this.setup(this._setupFn, this._setupOpts);
        this._lastTickData = null;
        // Always resume: "restart" means run the scene again from tick 0 — a restart
        // that left the loop paused would read as a dead button.
        this.start();
        return result;
    };

    // ── Renderer resolution ────────────────────────────────────────────────

    /**
     * Resolve the DISPLAY renderer.
     *  1. this._renderer (already resolved this session, or set directly by a host/test)
     *  2. the DISPLAY SLOT (`compat/renderer/display-slot.js`) — the ONE answer to
     *     "which provider owns the display", written by whichever boot ran the selection.
     *
     * The bare `window._egptActiveRenderer` global this used to read is DELETED: a slot
     * plus a global would be two truths about one fact (RENDERER_CONTRACT §9, architect
     * finding d.1).
     *
     * FAIL-LOUD: if neither is set when rendering is requested, this is a boot
     * configuration error — render-boot.js must run before the draw loop starts
     * (see `_failLoudMissingRenderer`). No silent P5Renderer fallback (P5Renderer was
     * deleted in Phase 1). An EMPTY slot is a legitimate state, not an error: the `tick`
     * and `field` taps are backend-independent and work with no display at all.
     */
    FrqtlApp.prototype._getRenderer = function () {
        if (!this._renderer) {
            var prov = _resolveDisplaySlot().get();
            if (prov) {
                // ATTACH. Render options written before this point validate against THIS
                // provider now. A refusal throws and leaves the provider unattached (and untouched),
                // so every later draw raises it again instead of rendering without the knob.
                var validated = this._stagedRenderOptions
                    ? _validateRenderWrites(prov, this._stagedRenderOptions) : null;
                // ATTACH BEFORE createCanvas (a host that defers the canvas — the notebook realm's
                // mount seam owns createCanvas, so a recipe builds first): the provider has no size of
                // its own, and a scene may read it while building (runner.cameraControl frames the
                // view). The runner states ITS rect — the scene's co-init w/h — now; createCanvas's
                // init restates the same rect. After createCanvas, init alone states it.
                if (!this._createCanvasCalled) {
                    prov.setSize(this.canvas_rect.w, this.canvas_rect.h);
                }
                this._renderer = prov;
                if (validated) {
                    this._stagedRenderOptions = null;
                    this._applyRenderWrites(validated);
                }
            }
        }
        return this._renderer || null;
    };

    /**
     * runner.cameraControl — the OPTIONAL camera sugar handle from the active
     * renderer provider, or null. The camera analogue of a setup factory's
     * temperatureControl: an experiment page does
     *   `var cam = runner.cameraControl; if (cam) wireWidget(cam);`
     * exactly as blackbody does `if (result.temperatureControl) …`. The presence
     * of the handle is the CAPABILITY CHECK — the page never sniffs the renderer.
     * Resolves lazily (after start(), when the provider is live) and caches the
     * non-null handle (a provider with no pose control re-checks cheaply; a custom provider
     * that implements getCameraControl() gets the same UI for free). The 2D p5 camera is a
     * handle too — whether a scene is 3D is `OrbitBag.hasAngularPose(runner.cameraControl)`,
     * never the handle's presence.
     * @returns {{ setOrbit(spec):void, getOrbit():Object }|null}
     */
    Object.defineProperty(FrqtlApp.prototype, 'cameraControl', {
        configurable: true,
        get: function () {
            if (!this._cameraControl) {
                var r = this._getRenderer();
                if (r && typeof r.getCameraControl === 'function') {
                    this._cameraControl = r.getCameraControl();   // null only with no pose control
                }
            }
            return this._cameraControl || null;
        }
    });

    /**
     * Report a missing renderer loudly; called from the draw loop when
     * _getRenderer() returns null on the first render attempt.
     */
    FrqtlApp.prototype._failLoudMissingRenderer = function () {
        var msg = 'FrqtlApp: the DISPLAY SLOT is empty (window.FrqtlDisplay.get() === null).\n\n' +
            'render-boot.js must load (via stack-boot.js or explicit tag) and resolve\n' +
            'BEFORE the draw loop fires. This is a page configuration error.\n\n' +
            'P5Renderer has been removed (WS-RENDERER Phase 1). All experiment pages\n' +
            'must use the canonical RendererProvider stack via stack-boot.js.';
        // `typeof window.X` guards the PROPERTY, not the OBJECT: in a host with no `window`
        // the deref itself is a ReferenceError, which is what stopped a headless process
        // from ever reaching this (correct) diagnosis. Guard the object first.
        var w = (typeof window !== 'undefined' && window) ? window : null;
        if (w && typeof w._egptRendererFailLoud === 'function') {
            w._egptRendererFailLoud(msg);
        } else if (w && typeof w._egptFailLoud === 'function') {
            w._egptFailLoud(msg);
        } else if (typeof document === 'undefined') {
            // No DOM to paint the overlay into — the message is still LOUD, on the console
            // this host does have. Never silent.
            if (typeof console !== 'undefined' && console.error) { console.error('[FrqtlApp] ' + msg); }
        } else {
            if (typeof console !== 'undefined' && console.error) { console.error('[FrqtlApp] ' + msg); }
            if (!document.getElementById('egpt-renderer-error')) {
                var b = document.createElement('div');
                b.id = 'egpt-renderer-error';
                b.style.cssText = 'position:fixed;inset:0;z-index:99998;background:#000a1a;' +
                    'color:#6b9eff;font:13px/1.55 ui-monospace,monospace;padding:22px;' +
                    'white-space:pre-wrap;overflow:auto;border:2px solid #1640b6;';
                b.textContent = msg;
                (document.body || document.documentElement).appendChild(b);
            }
        }
        /* Stop the loop to prevent repeated error overlays */
        this._isLooping = false;
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    };

    // ── RAF loop (§6, §6.1) ───────────────────────────────────────────────

    /**
     * Build and return the inner RAF frame callback for this runner.
     * Shared by start() and toggle() — one definition, no drift.
     *
     * When tickHz === Infinity the loop runs up to MAX_TICKS_UNBOUNDED ticks
     * per animation frame (unbounded TPS mode).  In all other cases the normal
     * MAX_TICKS_PER_FRAME cap applies and a warning fires if it is hit.
     */
    FrqtlApp.prototype._makeFrame = function () {
        var self = this;
        function frame(now) {
            if (!self._isLooping) { return; }
            self._rafId = requestAnimationFrame(frame);

            // ── Fixed-timestep accumulator (§6.1) ──────────────────────────
            if (self._lastFrame === 0) { self._lastFrame = now; }
            var delta = Math.min(now - self._lastFrame, MAX_FRAME_MS);
            self._lastFrame = now;
            self._accumulator += delta;

            // Resolve effective tickDt and drawDt for this frame
            var tickHz = self._tickHz;
            var drawHz = self._drawHz;
            var tickDt, drawDt;

            if (tickHz === Infinity) {
                // Unbounded TPS: run as many ticks per frame as the safety budget allows.
                // tickDt = 0 keeps the while-condition always true until budget runs out.
                tickDt = 0;
            } else if (tickHz > 0) {
                tickDt = 1000 / tickHz;
            } else {
                // Lock to drawHz (1:1 default): advance exactly one tick per draw.
                tickDt = delta;
                self._accumulator = delta;  // override accumulator to guarantee 1 tick/frame
            }
            drawDt = (drawHz > 0) ? (1000 / drawHz) : 0;

            // ── Physics ticks ───────────────────────────────────────────────
            var lastTickData = null;
            var budget = (tickHz === Infinity) ? MAX_TICKS_UNBOUNDED : MAX_TICKS_PER_FRAME;
            // `_tickSuspend` is checked PER TICK, not once per frame: at unbounded TPS this
            // loop runs a whole batch of ticks inside ONE rAF frame, so a suspend raised from
            // inside a tick listener must break the batch IMMEDIATELY. Checking it only at the
            // top of the frame is exactly what let ~120 ticks elapse between a waypoint and an
            // awaited capture.
            while ((tickDt === 0 || self._accumulator >= tickDt) && budget-- > 0 && self._tickSuspend === 0) {
                var td = self.universe.doTick();
                lastTickData = td;
                self._lastTickData = td; // repaint()'s source — see that method's docstring
                if (tickDt > 0) { self._accumulator -= tickDt; }
                self._countTick(now);
                if (self._onTick) { self._onTick(td, self._setupResult); }
                self._notifyTickListeners(td);
            }

            // Budget exhaustion (persistent slow physics). This fires on nearly every
            // frame whenever the render/tick budget can't keep up, so the warning is
            // MUTED BY DEFAULT — it was flooding the console once per frame. It surfaces
            // ONLY when the caller opts into verbose logging (window._egptVerbose === true)
            // AND at most once per _BUDGET_WARN_INTERVAL_MS so even verbose runs stay
            // readable. The accumulator reset (the actual correctness action) is unchanged.
            if (budget <= 0 && tickDt > 0 && self._accumulator >= tickDt) {
                if (typeof window !== 'undefined' && window._egptVerbose === true
                        && window.console && console.warn) {
                    var _lastWarn = self._lastBudgetWarn || 0;
                    if (now - _lastWarn >= self._BUDGET_WARN_INTERVAL_MS) {
                        self._lastBudgetWarn = now;
                        console.warn('[FrqtlApp] tick budget exhausted — physics may be falling behind');
                    }
                }
                self._accumulator = 0;  // reset to avoid unbounded catch-up
            }
            // In unbounded mode, always drain the accumulator so it does not compound.
            if (tickHz === Infinity) { self._accumulator = 0; }

            // ── Draw frame ──────────────────────────────────────────────────
            var shouldDraw = drawDt > 0
                ? (now - self._lastDraw) >= drawDt
                : true;  // no drawHz cap → draw every frame

            if (lastTickData && shouldDraw) {
                var prov = self._getRenderer();
                if (prov && prov.renderTick) {
                    self._assertRenderCensus();
                    prov.renderTick(lastTickData, self._visibleLargeObjects(), self._renderOptsWithFeedback());
                } else if (!self._rendererMissingReported) {
                    self._rendererMissingReported = true;
                    self._failLoudMissingRenderer();
                    return;
                }
                self._countDraw(now);
                self._lastDraw = now;
            }
        }
        return frame;
    };

    /**
     * Start the simulation loop.
     * Idempotent — calling start() while already running does nothing.
     * Owns requestAnimationFrame — does NOT set window.draw or call p5 loop().
     *
     * For backward compatibility with pages that also define window.setup (which p5
     * calls on load), the runner's loop co-exists with p5: p5's own draw() is a
     * no-op (we set window.draw = empty function below so p5 doesn't double-render).
     */
    FrqtlApp.prototype.start = function () {
        // Idempotency guard: if a RAF loop is already running, do nothing.
        // Without this guard, a second start() call spawns a second concurrent loop,
        // doubling the tick rate (observable as TPS × 2 on the readout).
        if (this._isLooping || this._rafId !== null) { return; }
        _requireAnimationFrame('start');

        // Suppress p5's own draw loop so it doesn't double-render while our RAF loop runs.
        // p5 calls window.draw every frame if it's defined.
        if (typeof window !== 'undefined') {
            window.draw = function () { /* RAF loop drives rendering; p5 draw is a no-op */ };
            // Expose the live runner on window so ANY experiment page (and same-origin
            // embedders such as the IDE author surface) can drive it identically — Layers
            // panel toggles, backdrop controls, inspector edits — without per-page wiring.
            // Set once here rather than inline in every experiment sketch (Phase 2, WS-RENDERER).
            window._frqtlApp = this;
        }

        this._isLooping     = true;
        this._accumulator   = 0;
        this._lastFrame     = 0;
        this._lastDraw      = 0;
        this._rateWindowEnd = 0;
        this._tickCount     = 0;
        this._drawCount     = 0;
        this._lastTps       = 0;
        this._lastFps       = 0;

        this._rafId = requestAnimationFrame(this._makeFrame());

        // Also call p5's loop() for pages that still rely on p5 being "running"
        // (e.g. mousePressed etc. — p5 must be in a running state for event handling).
        if (typeof loop === 'function') { loop(); }
    };

    /**
     * runner.suspendTicks() / resumeTicks() — hold the TICK CLOCK across an async operation
     * that must observe one specific tick, without touching the user's play/pause state.
     *
     * A counted pair (nested suspends are safe; the clock resumes when the LAST one releases).
     * The batch loop checks the depth PER TICK, so a suspend raised from inside a tick
     * listener breaks the current batch immediately rather than at the next frame — which is
     * the whole point: at unbounded TPS a single rAF frame runs a hundred-plus ticks, so
     * "stop at the next frame" is far too late for anything that means "at THIS tick".
     *
     * This is deliberately NOT `stop()`: `stop()` is the user's pause, and a consumer that
     * borrowed it would leave the play button lying about the run state and could
     * accidentally restart a sim the user had paused. Physics determinism is untouched — the
     * tick SEQUENCE is identical either way; only wall-clock pacing changes.
     *
     * The canonical consumer is a capture that must correspond to a known tick
     * (`CameraPath`'s waypoint handlers). Always release in a `finally`.
     */
    FrqtlApp.prototype.suspendTicks = function () {
        this._tickSuspend += 1;
        return this._tickSuspend;
    };

    /** Release one suspend. Never goes below zero (an unbalanced resume is a no-op, not a debt). */
    FrqtlApp.prototype.resumeTicks = function () {
        if (this._tickSuspend > 0) { this._tickSuspend -= 1; }
        return this._tickSuspend;
    };

    /** @returns {boolean} whether the tick clock is currently held. */
    Object.defineProperty(FrqtlApp.prototype, 'ticksSuspended', {
        configurable: true,
        get: function () { return this._tickSuspend > 0; }
    });

    /**
     * Pause the simulation.
     */
    FrqtlApp.prototype.stop = function () {
        this._isLooping = false;
        if (this._rafId !== null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        // Keep p5's loop running for event handling but suppress its draw.
        // (window.draw is already a no-op from start(); keep it that way.)
    };

    /**
     * Toggle play/pause.
     * Resume path re-uses _makeFrame() — same loop body as start(), no drift.
     */
    FrqtlApp.prototype.toggle = function () {
        if (this._isLooping) {
            this.stop();
        } else {
            _requireAnimationFrame('toggle');
            // Guard: if somehow a stale _rafId is present, cancel it first.
            if (this._rafId !== null) {
                cancelAnimationFrame(this._rafId);
                this._rafId = null;
            }
            this._isLooping = true;
            this._lastFrame = 0;   // reset timer on resume to avoid catch-up spike
            this._rafId = requestAnimationFrame(this._makeFrame());
        }
    };

    /**
     * Advance exactly one tick + render. Useful for step-by-step debugging.
     */
    FrqtlApp.prototype.step = function () {
        // THE SECOND TICK DRIVER. `doTick()` is called in exactly two places — the RAF batch
        // loop and here — and a suspension that only the loop honoured would be a half-closed
        // guarantee: the notebook realm, hosted eyes and the Studio Design path drive ticks
        // through step(), and any of them could advance the world out from under an in-flight
        // capture-at-a-known-tick. Suspended ⇒ THROW. A step that silently did nothing would
        // let a driver count ticks it never ran (a warm-up of N steps landing short, a drive
        // "to tick n" stamped with n-1's world) — the caller waits for `ticksSuspended` to
        // clear, then steps.
        if (this._tickSuspend > 0) {
            throw new Error('[FrqtlApp.step] the tick clock is HELD (runner.ticksSuspended is ' +
                'true, depth ' + this._tickSuspend + '): a capture or waypoint handler is ' +
                'observing the current tick, and stepping now would advance the world out from ' +
                'under it. Wait until runner.ticksSuspended is false, then step. (FAIL-LOUD — a ' +
                'step that silently did nothing would be a tick the driver believes it ran.)');
        }
        var tickData = this.universe.doTick();
        this._lastTickData = tickData; // repaint()'s source — see that method's docstring
        if (tickData) {
            var prov = this._getRenderer();
            if (prov && prov.renderTick) {
                this._assertRenderCensus();
                prov.renderTick(tickData, this._visibleLargeObjects(), this._renderOptsWithFeedback());
            } else if (!this._rendererMissingReported) {
                this._rendererMissingReported = true;
                this._failLoudMissingRenderer();
            }
        }
        if (this._onTick) { this._onTick(tickData, this._setupResult); }
        this._notifyTickListeners(tickData);
        return tickData;
    };

    /**
     * addTickListener(fn) — subscribe to the per-tick stream WITHOUT clobbering the
     * page's single `_onTick` slot. `fn(tickData, setupResult)` runs after `_onTick`
     * at every tick (RAF loop + step()). Returns an unsubscribe function.
     *
     * Host-side sugar for the LiveChart wiring (lib/components/live-chart-wiring):
     * the wiring accumulates its source wall's collided frames once per tick here.
     * Idempotent (same fn added once); safe to call before start().
     * @param {Function} fn
     * @returns {Function} unsubscribe
     */
    FrqtlApp.prototype.addTickListener = function (fn) {
        if (typeof fn !== 'function') { return function () {}; }
        if (this._tickListeners.indexOf(fn) === -1) { this._tickListeners.push(fn); }
        var self = this;
        return function () { self.removeTickListener(fn); };
    };

    /**
     * firstTick({ deadlineMs }) — a promise for the FIRST tick this runner DELIVERS after the
     * call, bounded by a liveness deadline measured on the runner's OWN clock.
     *
     * READINESS IS THE RUNNER'S. A host (the SDK's bootScene/bootRecipe sketch path, a hosted-eyes
     * driver, a recipe bundle) that wants to know "is this scene live" awaits this instead of
     * deriving its own answer from `start()` having returned — `start()` schedules a frame; it
     * delivers nothing. The promise resolves from `_notifyTickListeners` (a tick that RAN), so
     * a universe that throws in `doTick()` never resolves it.
     *
     * THE DEADLINE RUNS ONLY WHILE THE DOCUMENT IS VISIBLE. The tick clock is
     * requestAnimationFrame (`_makeFrame`), which browsers suspend in a hidden document — a
     * background tab, a minimised window, an offscreen cross-origin iframe (the claude.ai
     * artifact case). A wall-clock bound would expire on a HEALTHY runner that was merely
     * hidden, and a gate that fires on correct behaviour trains everyone to ignore it. So the
     * countdown PAUSES on `visibilitychange` → hidden (remaining time kept) and resumes when
     * visible; a runner started hidden waits, however long, for its first visible frame.
     *
     * On expiry — `deadlineMs` of VISIBLE time with no delivered tick — the runner STOPS itself
     * (a loop whose ticks throw would otherwise raise an uncaught error on every frame forever)
     * and the promise REJECTS naming the runner, its seed, its canvas and the deadline. Never a
     * resolve: a scene that never ticked is not live, and no caller may be told it is.
     *
     * @param {{deadlineMs:number}} opts — `deadlineMs` is REQUIRED (> 0): a promise with no bound
     *   hangs forever on a dead clock, and a hang is silence. FAIL-LOUD on an absent/invalid value.
     * @returns {Promise<object>} resolves with the first delivered TickData.
     */
    FrqtlApp.prototype.firstTick = function (opts) {
        var deadlineMs = opts && opts.deadlineMs;
        if (typeof deadlineMs !== 'number' || !isFinite(deadlineMs) || deadlineMs <= 0) {
            throw new Error('[FrqtlApp.firstTick] opts.deadlineMs must be a positive number of ms (got ' +
                String(deadlineMs) + '). A first-tick wait with no bound hangs forever on a dead tick clock.');
        }
        var self = this;
        var doc = (typeof document !== 'undefined') ? document : null;
        return new Promise(function (resolve, reject) {
            var settled = false;
            var timer = null;
            var remainingMs = deadlineMs;
            var armedAt = 0;
            var unsubscribe = null;
            function isVisible() { return !doc || doc.visibilityState === 'visible'; }
            function disarm() {
                if (timer === null) { return; }
                clearTimeout(timer);
                timer = null;
                remainingMs = Math.max(0, remainingMs - (Date.now() - armedAt));
            }
            function settle() {
                settled = true;
                disarm();
                if (unsubscribe) { unsubscribe(); }
                if (doc) { doc.removeEventListener('visibilitychange', onVisibility); }
            }
            function expire() {
                timer = null;
                if (settled) { return; }
                settle();
                self.stop();
                reject(new Error('[FrqtlApp.firstTick] the runner (window._frqtlApp, FrqtlApp seed ' +
                    self._seed + ', canvas ' + self.canvas_rect.w + 'x' + self.canvas_rect.h + ') was started ' +
                    'but delivered no tick within ' + deadlineMs + ' ms of visible time — the scene is NOT ' +
                    'live; the runner has been stopped. A per-frame error in the tick loop (see the page ' +
                    'console) or a held tick clock (runner.ticksSuspended) is the usual cause.'));
            }
            function arm() {
                if (settled || timer !== null || !isVisible()) { return; }
                armedAt = Date.now();
                timer = setTimeout(expire, remainingMs);
            }
            function onVisibility() { if (isVisible()) { arm(); } else { disarm(); } }
            unsubscribe = self.addTickListener(function (tickData) {
                if (settled) { return; }
                settle();
                resolve(tickData);
            });
            if (doc) { doc.addEventListener('visibilitychange', onVisibility); }
            arm();
        });
    };

    /**
     * removeTickListener(fn) — drop a previously-added tick listener. No-op if absent.
     * @param {Function} fn
     */
    FrqtlApp.prototype.removeTickListener = function (fn) {
        var i = this._tickListeners.indexOf(fn);
        if (i !== -1) { this._tickListeners.splice(i, 1); }
    };

    /**
     * Fan out one tick to every registered listener. A listener throwing does NOT
     * abort the loop or the other listeners (its error is surfaced to the console,
     * never swallowed silently) — the tick clock is never held hostage by a consumer.
     * @private
     */
    FrqtlApp.prototype._notifyTickListeners = function (tickData) {
        var ls = this._tickListeners;
        if (!ls || !ls.length) { return; }
        for (var i = 0; i < ls.length; i++) {
            try { ls[i](tickData, this._setupResult); }
            catch (e) {
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[FrqtlApp] tick listener threw:', e);
                }
            }
        }
    };

    /**
     * Repaint the CURRENT physics state WITHOUT advancing the tick clock (WS
     * Studio Controls Realignment S4, design §2.5.4 — "drag must NEVER call
     * runner.step() — the tick loop is the only clock"). Re-invokes the active
     * renderer's `renderTick` against the LAST computed TickData (tracked by
     * `step()` and the RAF loop) and the CURRENT world census — so a
     * Design-mode drag (sim stopped, no RAF loop running) still gives immediate
     * visual feedback for a moved wall/emitter rect (the wrapper's `.rect` was
     * already mutated in place by `updateObjectProperty` BEFORE this is called)
     * without ticking physics or drawing a new frame's worth of particle motion.
     * A no-op before the first tick has ever run (`_lastTickData` is null).
     */
    FrqtlApp.prototype.repaint = function () {
        if (!this._lastTickData) { return; }
        var prov = this._getRenderer();
        if (prov && prov.renderTick) {
            this._assertRenderCensus();
            prov.renderTick(this._lastTickData, this._visibleLargeObjects(), this._renderOptsWithFeedback());
        }
    };

    // ── Accessors ──────────────────────────────────────────────────────────

    Object.defineProperty(FrqtlApp.prototype, 'isRunning', {
        get: function () { return this._isLooping; }
    });

    Object.defineProperty(FrqtlApp.prototype, 'setupResult', {
        get: function () { return this._setupResult; }
    });

    /**
     * The world bounds, on all three axes — the ONE read consumers use for "how big /
     * how deep is this scene" (e.g. the palette Wall drop's full-scene-depth default,
     * R#101). A pure two-source FERRY — both bags are built by wasm-engine.js's
     * `_wrapBoundaryRect` (THE ONE engine-bounds → JS bag normalizer,
     * {x,y,z,w,h,d,left,right,top,bottom,near,far,r}); this getter builds nothing:
     *   1. the engine-owned TickData ferry once a tick has run — the authority, since
     *      it tracks live resizes;
     *   2. before the first tick (design-mode drops happen at tick 0), the wrapper's
     *      init-time declaration `universe.initBounds` (truth-in-labeling read-back at
     *      the init site, gated by init-bounds-conformance.test.mjs).
     * `null` when the wrapper published no init bounds and no tick has run.
     */
    Object.defineProperty(FrqtlApp.prototype, 'worldBounds', {
        get: function () {
            if (this._lastTickData) { return this._lastTickData.universeData.boundaryRect; }
            var u = this.universe;
            return (u && u.initBounds) || null;
        }
    });

    /**
     * The active renderer provider (RendererProvider | null).
     * Available after start() has been called (or after the display slot is written).
     */
    Object.defineProperty(FrqtlApp.prototype, 'renderer', {
        get: function () { return this._getRenderer(); }
    });

    /**
     * Return the most recently computed rate snapshot.
     *
     * Rates are recomputed once per ~1 s rolling window (no per-frame allocation;
     * integers only).  Returns { fps: 0, tps: 0 } until the first window expires.
     *
     * @returns {{ fps: number, tps: number }}
     */
    FrqtlApp.prototype.getRates = function () {
        return { fps: this._lastFps, tps: this._lastTps };
    };

    /**
     * Read the current rate limits.
     *
     * fpsLimit — draw frames per second cap (0 = lock to display refresh, i.e. no cap).
     * tpsLimit — physics ticks per second cap:
     *     0        = 1:1 locked to drawHz (one tick per draw frame, the default)
     *     > 0      = tick at that Hz (e.g. 240)
     *     Infinity = unbounded — run up to MAX_TICKS_UNBOUNDED ticks per frame
     *
     * @returns {{ fpsLimit: number, tpsLimit: number }}
     */
    FrqtlApp.prototype.getRateLimits = function () {
        return { fpsLimit: this._drawHz, tpsLimit: this._tickHz };
    };

    /**
     * Set rate limits at runtime.  Changes take effect on the next RAF frame
     * (no restart required).
     *
     * @param {Object} limits
     * @param {number} [limits.fpsLimit]  Draw frames/s cap. 0 = display refresh.
     *                                    Must be ≥ 0.
     * @param {number} [limits.tpsLimit]  Physics ticks/s cap.
     *                                    0        = 1:1 locked (default).
     *                                    > 0      = tick at that Hz.
     *                                    Infinity = unbounded (up to safety budget).
     *                                    Must be ≥ 0 (or Infinity).
     *
     * Throws a RangeError on invalid inputs and a TypeError on a key outside
     * `FrqtlApp.RATE_LIMIT_KEYS` (FAIL-LOUD).
     */
    FrqtlApp.prototype.setRateLimits = function (limits) {
        if (!limits || typeof limits !== 'object') {
            throw new TypeError('[FrqtlApp.setRateLimits] limits must be an object');
        }
        Object.keys(limits).forEach(function (k) {
            if (RATE_LIMIT_KEYS.indexOf(k) === -1) {
                throw new TypeError('[FrqtlApp.setRateLimits] unknown rate key "' + k +
                    '" — accepted keys: ' + RATE_LIMIT_KEYS.join(', ') + ' (FAIL-LOUD).');
            }
        });
        if (limits.fpsLimit !== undefined) {
            var fps = limits.fpsLimit;
            if (typeof fps !== 'number' || fps < 0 || isNaN(fps)) {
                throw new RangeError('[FrqtlApp.setRateLimits] fpsLimit must be a non-negative number, got: ' + fps);
            }
            this._drawHz = fps;
        }
        if (limits.tpsLimit !== undefined) {
            var tps = limits.tpsLimit;
            if (typeof tps !== 'number' || (tps < 0 && tps !== -Infinity) || isNaN(tps)) {
                throw new RangeError('[FrqtlApp.setRateLimits] tpsLimit must be ≥ 0 or Infinity, got: ' + tps);
            }
            // Normalise -Infinity or negative finite to 0 (1:1 locked).
            this._tickHz = (tps < 0) ? 0 : tps;
        }
    };

    /**
     * Internal helper: tick the rate counters. Call once per physics tick.
     * @param {number} now  — performance.now() value for this frame
     */
    FrqtlApp.prototype._countTick = function (now) {
        this._tickCount += 1;
        if (this._rateWindowEnd === 0) {
            // Initialise window on first call
            this._rateWindowEnd = now + this._rateWindowMs;
        }
    };

    /**
     * Internal helper: tick the draw counters. Call once per rendered frame.
     * Checks whether the window has expired and flushes a new rate snapshot.
     * @param {number} now  — performance.now() value for this frame
     */
    FrqtlApp.prototype._countDraw = function (now) {
        this._drawCount += 1;
        if (now >= this._rateWindowEnd && this._rateWindowEnd > 0) {
            // Compute elapsed — clamp to at least 1 ms to guard against division by zero.
            var elapsed = Math.max(now - (this._rateWindowEnd - this._rateWindowMs), 1);
            this._lastFps = Math.round(this._drawCount * 1000 / elapsed);
            this._lastTps = Math.round(this._tickCount * 1000 / elapsed);
            this._drawCount    = 0;
            this._tickCount    = 0;
            this._rateWindowEnd = now + this._rateWindowMs;
        }
    };

    FrqtlApp.RATE_LIMIT_KEYS = RATE_LIMIT_KEYS;
    FrqtlApp.FACTORY_STATICS = FACTORY_STATICS;

    /**
     * Copy the factory statics setup() consumes (`FrqtlApp.FACTORY_STATICS`) from a
     * factory onto a wrapper around it — only the ones the factory has — so
     * `runner.setup(wrapper)` boots the same scene as `runner.setup(factory)`.
     *
     * @param {Function} wrapper  the function handed to setup() in the factory's place.
     * @param {Function} factory  the setup factory it wraps.
     * @returns {Function} the wrapper.
     * @throws {TypeError} FAIL-LOUD when either argument is not a function.
     */
    FrqtlApp.carryFactoryStatics = function (wrapper, factory) {
        if (typeof wrapper !== 'function' || typeof factory !== 'function') {
            throw new TypeError('[FrqtlApp.carryFactoryStatics] wrapper and factory must both be functions ' +
                '(got ' + typeof wrapper + ', ' + typeof factory + ') (FAIL-LOUD).');
        }
        _refuseDeletedStatics(factory, 'carryFactoryStatics');
        FACTORY_STATICS.forEach(function (k) {
            if (factory[k] !== undefined) { wrapper[k] = factory[k]; }
        });
        return wrapper;
    };

    // ── Export ─────────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { FrqtlApp: FrqtlApp };
    } else {
        window.FrqtlApp = FrqtlApp;
    }

})();
