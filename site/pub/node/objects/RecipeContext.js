/* Copyright 2023-2026 by Essam Abadir */

/**
 * RecipeContext — the frozen recipe-facade a saved project's buildExperiment(exp)
 * recipe is evaluated against.
 *
 * This is Experiment.js TRIMMED + RENAMED (ws-experiments-walkthrough Bite 1). It
 * is a thin pure-delegation facade over FrqtlApp exposing ONLY the minimal,
 * stable authoring vocabulary every exported bundle relies on — nothing more, so a
 * runner refactor can never break a bundle's eval contract:
 *
 *   exp.init(cfg)                 cfg-bag → universe.init, via FrqtlWorldInit.initArgs
 *   exp.addObject(kind, config)   ObjectFactory.create(kind, config, ctx) sugar
 *   exp.addTickFunction(fn)       universe.experimentTickFunctions.push
 *   exp.build(buildFn)            run the recipe WITHOUT starting the loop
 *   exp.run(buildFn)              build (if needed) + start the loop
 *   exp.runner / .universe        pass-throughs to the runner
 *   exp.setupResult               result of init() (universe.init returns none)
 *   exp.initCfg                   PUBLIC getter — codegen (STUDIO) reads it
 *   exp.is3D                      READ-ONLY getter — "did this scene boot in 3D?"
 *                                 (see the getter below). A mode-aware recipe
 *                                 branches its dimensional deltas on it.
 *
 * The cfg→universe.init mapping is `FrqtlWorldInit.initArgs` (objects/setup/_worldInit.js),
 * consumed here, by Experiment.js and by every setup factory's world step; the ObjectFactory
 * ctx is copied from Experiment.js. Experiment.js stays alive only for wave-interference until it is
 * deleted in a later bite.
 *
 * Deliberately DROPPED vs Experiment.js: `restart()` (zero call sites — STUDIO's
 * Restart is an iframe reload + apply-module) and `pause()` (the empty page calls
 * `runner.stop()` directly). Both are dead relative to every RecipeContext consumer.
 *
 * Classic-script module: works both as a browser global and a Node CJS module. It
 * is injected as a classic game-layer <script> (like FrqtlApp.js) — an ESM
 * export would break the injection path. Dependency resolution mirrors setup
 * factories:  var _gbl = typeof window !== 'undefined' ? window : globalThis;
 *
 * IDE compatibility:
 *   - window._frqtlApp     is set by FrqtlApp.start() (unchanged).
 *   - window._egptExperiment is set by build()/run() to THIS RecipeContext (name
 *     kept so AuthorView reaches it drop-in).
 */

(function () {
    'use strict';

    // ── Dependency resolution ────────────────────────────────────────────────
    // Mirrors how setup factories resolve globals (e.g. setupBlackbody.js).

    var _gbl = typeof window !== 'undefined' ? window : globalThis;

    function _resolve(name) {
        return _gbl[name] || (typeof module !== 'undefined' && module.exports ? null : null);
    }

    /**
     * The world-init contract (INIT_CFG + assertInitCfg + initArgs) is owned by the leaf
     * `objects/setup/_worldInit.js`, which the roster loads ahead of this file. Resolved at
     * call time; absent ⇒ THROW naming it.
     */
    function _worldInit() {
        var W = (typeof module !== 'undefined' && module.exports)
            ? require('./setup/_worldInit.js')
            : _gbl.FrqtlWorldInit;
        if (!W || typeof W.initArgs !== 'function' || typeof W.assertInitCfg !== 'function') {
            throw new Error('[RecipeContext] FrqtlWorldInit is not loaded: objects/setup/_worldInit.js ' +
                'OWNS the exp.init(cfg) vocabulary and its universe.init mapping, and ships in the ' +
                'game-layer roster (lib/shim/engine/game-layer-manifest.js) ahead of objects/setup/ — load it.');
        }
        return W;
    }

    // ── RecipeContext ─────────────────────────────────────────────────────────

    /**
     * @param {Object}   opts               — forwarded verbatim to FrqtlApp
     * @param {string}   [opts.canvasParentId]
     * @param {number}   [opts.canvasW=600]
     * @param {number}   [opts.canvasH=600]
     * @param {number}   [opts.seed=42]
     * @param {number}   [opts.tickHz]
     * @param {number}   [opts.drawHz]
     * @param {number}   [opts.stepsPerFrame]
     * @param {Function} [opts.onTick]
     * @param {Function} [opts.onReady]
     * @param {boolean}  [opts.is3D]
     *   OVERRIDE for the `is3D` getter, for hosts with NO `window._egpt3D` (Node
     *   tests, the conformance harness, a headless pkg-node probe). Omit in the
     *   browser — the boot flag is the authority there (see the getter).
     * @param {boolean}  [opts.deferCanvas=false]
     *   When true, DO NOT create the canvas in the constructor — the caller (or a
     *   host mount seam) owns createCanvas(). Default false = the existing page
     *   behavior (createCanvas immediately), byte-identical for every current caller
     *   (lib/frqtl/experiments/empty/index.html et al. never pass it). This opt-in is
     *   used by the notebook recipe-shape builder (lib/shim/notebook/setup-builder.js):
     *   the notebook realm's `_mountRunnerInProcess` seam drives createCanvas() +
     *   start() itself with the pane's canvas-wrapper as parent, so an eager
     *   constructor createCanvas here would create a SECOND, orphaned canvas.
     */
    function RecipeContext(opts) {
        var FrqtlApp = _resolve('FrqtlApp');
        if (!FrqtlApp) {
            throw new Error('[RecipeContext] FrqtlApp not loaded — stack-boot.js must run first');
        }

        this._runner      = new FrqtlApp(opts || {});
        this._initCfg     = null;    // stored by init(), exposed via the initCfg getter
        this._buildFn     = null;    // stored by build()/run(buildFn)
        this._built       = false;   // true once the build recipe has run
        this._setupResult = null;    // result of init() (universe.init doesn't return one)
        // is3D OVERRIDE (null = "ask the boot flag"). Node/conformance hosts pass it.
        this._is3D        = (opts && opts.is3D !== undefined) ? !!opts.is3D : null;

        // Create the canvas immediately (mirrors FrqtlApp usage pattern;
        // the runner ctor does NOT auto-create the canvas) — UNLESS the caller defers
        // it (deferCanvas), in which case a host mount seam owns createCanvas().
        if (!(opts && opts.deferCanvas)) {
            this._runner.createCanvas();
        }
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    Object.defineProperty(RecipeContext.prototype, 'runner', {
        get: function () { return this._runner; }
    });

    Object.defineProperty(RecipeContext.prototype, 'universe', {
        get: function () { return this._runner.universe; }
    });

    Object.defineProperty(RecipeContext.prototype, 'setupResult', {
        get: function () { return this._setupResult; }
    });

    /**
     * Public accessor for the cfg bag passed to the most recent init(). STUDIO's
     * codegen reads it (designToModule({ initCfg })) to re-emit exp.init(cfg). This
     * replaces reading the private _initCfg field directly.
     * @returns {Object|null}
     */
    Object.defineProperty(RecipeContext.prototype, 'initCfg', {
        get: function () { return this._initCfg; }
    });

    /**
     * is3D — READ-ONLY: did THIS scene boot in three dimensions?
     *
     * ── Layer 1: API contract ────────────────────────────────────────────────
     * Returns the live boot-time 3D flag `window._egpt3D` (the ONE runtime owner —
     * set pre-boot by render-boot.js from the `?egpt3D=1` URL override, which the
     * walkthrough/project load path threads from the selected renderState). A
     * `is3D` ctor opt OVERRIDES it for hosts with no such flag (Node tests, the
     * conformance harness). Never settable from a recipe: the recipe ASKS what
     * booted; it does not decide (truth-in-labeling — a hand-passed label could
     * disagree with the renderer that actually loaded).
     *
     * ── Layer 2: physics behavior ────────────────────────────────────────────
     * Reading it changes NOTHING. It is the switch a mode-aware recipe uses to
     * author its dimensional deltas — emitter `is2D:!IS3D` (which opens
     * `activeAxes.z`, the only thing that lets the engine realize `vz`), wall
     * `z`/`depth` z-slabs, z-collimator sinks. The 3D physics is the SAME engine
     * physics with one more active axis (bench H2a/H2b: 2D≡3D).
     *
     * @returns {boolean}
     */
    Object.defineProperty(RecipeContext.prototype, 'is3D', {
        get: function () {
            if (this._is3D !== null) { return this._is3D; }
            return !!(_gbl && _gbl._egpt3D);
        }
    });

    // ── init(cfg) ─────────────────────────────────────────────────────────────

    /**
     * Initialise the universe using a named config bag: validate it, store it for the
     * `initCfg` getter, and apply `FrqtlWorldInit.initArgs(cfg, runner.canvas_rect)` — the
     * ONE cfg→init mapping (objects/setup/_worldInit.js holds the key-by-key table).
     *
     * THROW-OR-APPLY: an unknown cfg key is a hard error naming the legal vocabulary
     * (`FrqtlWorldInit.INIT_CFG`), with the engine's own migration sentence appended when the name
     * is a RETIRED engine key. Until this landed, unknown keys were silently ignored — so
     * a saved STUDIO recipe carrying a retired name LOADED, dropped the key, and ran with
     * different physics. `universe.init()` throws on those names, but a recipe never
     * reached it with them.
     *
     * `activeAxes` is the 1D/2D/3D selector and it is a WORLD property, so it belongs
     * to this world step — a recipe that wants 3D declares it HERE (typically as
     * `setupSphereEmitter3D.worldCfg(opts).activeAxes`), never by relying on a part to
     * re-init the universe behind its back. Omitted ⇒ the engine's 2D default {x,y}.
     *
     * `stepping` ('fixed' | 'average') is the WAVE-WALK STEPPING SAMPLER — the second
     * member of the SAME class as `activeAxes`: a world-init option with 1:1 naming,
     * engine-defaulted and engine-validated, so it rides the identical omit-when-
     * undeclared pass-through (architect ruling, ws-walk-unification Bite 1 §1).
     * A recipe declares it exactly where it declares its axes —
     * `setupSphereEmitter3D.worldCfg({ stepping: 'average', … })` already emits the key
     * — and THE SCENE SOURCE IS THE ONE AUTHORITY on the world it builds: there is no
     * URL/host override path into this mapping, by design.
     *
     * Physics, for the reader: both samplers realize the same MEAN step (1 px/tick
     * along the momentum vector) and differ only in the variance about it — 'fixed'
     * walks a deterministic error accumulator (along-ray deviation bounded below 1px),
     * 'average' draws a per-axis Bernoulli coin (variance (L1/L2 − 1) px²/tick, zero
     * on-axis, 0.414 at 45°). Axis-aligned and stationary frames are bit-identical
     * under both; off-axis higher-order fringes are where they diverge.
     *
     * @param {Object}  cfg
     * @param {number}  [cfg.dimension=2]
     * @param {number}  [cfg.wavelengthScale=8]
     * @param {boolean} [cfg.interQuantumCollisions=false] — inert (legacy)
     * @param {boolean} [cfg.bonding=false]
     * @param {boolean} [cfg.frames=false]
     * @param {{x:boolean,y:boolean,z:boolean}} [cfg.activeAxes] — omitted ⇒ engine 2D default
     * @param {string}  [cfg.stepping] — 'fixed' | 'average'; omitted ⇒ engine default sampler
     */
    RecipeContext.prototype.init = function (cfg) {
        cfg = cfg || {};
        // THROW-OR-APPLY before anything is stored or forwarded: an unknown key must not
        // be silently dropped on the way to universe.init() (FrqtlWorldInit.assertInitCfg).
        var W = _worldInit();
        W.assertInitCfg('RecipeContext.init(cfg)', cfg, this._runner.universe);
        this._initCfg = cfg;   // store for the initCfg getter (STUDIO codegen)
        // runner.canvas_rect is set at FrqtlApp construction time from opts.canvasW/H and is
        // the rect the universe was created with, so it is valid before init().
        var u = this._runner.universe;
        u.init.apply(u, W.initArgs(cfg, this._runner.canvas_rect));
    };

    // ── addObject(kind, config) ───────────────────────────────────────────────

    /**
     * Create and register a placeable object via ObjectFactory.
     *
     * Delegates to ObjectFactory.create(kind, config, ctx) where ctx carries
     * runner, the global window (cw=null → builders resolve from window), and
     * canvas dimensions for objects that need PHYS_W/PHYS_H (DetectorWall, etc.).
     * The ctx shape is copied verbatim from Experiment.js.
     *
     * x/y are sourced from config.x / config.y when provided, so the caller can
     * use the same config bag for positioning and object construction.
     *
     * @param {string} kind    — registered builder key (e.g. 'PointSource')
     * @param {Object} config  — override props (merged over schema defaultProps)
     * @returns {Object|null}  — primary/visual handle returned by the builder
     */
    RecipeContext.prototype.addObject = function (kind, config) {
        var ObjectFactory = _resolve('ObjectFactory');
        if (!ObjectFactory) {
            throw new Error('[RecipeContext.addObject] ObjectFactory not loaded');
        }
        var x = (config && config.x != null) ? config.x : 0;
        var y = (config && config.y != null) ? config.y : 0;
        var ctx = {
            runner: this._runner,
            cw:     null,   // null → builders resolve classes from window
            x:      x,
            y:      y,
            PHYS_W: this._runner.canvas_rect.w,
            PHYS_H: this._runner.canvas_rect.h
        };
        return ObjectFactory.create(kind, config, ctx);
    };

    // ── addTickFunction(fn) ───────────────────────────────────────────────────

    /**
     * Push a tick function into the universe's experimentTickFunctions array.
     * Mirrors the thermostat pattern used in setupBlackbody.js.
     *
     * @param {Function} fn  — called each physics tick (by the engine's Phase A)
     * @returns {number}     — index of the added function (for removal if needed)
     */
    RecipeContext.prototype.addTickFunction = function (fn) {
        var fns = this._runner.universe.experimentTickFunctions;
        fns.push(fn);
        return fns.length - 1;
    };

    // ── render(bag) ──────────────────────────────────────────────────────────────

    /**
     * Name the recipe's LOOK in one call — a pure ferry to `runner.setRenderOptions(bag)`.
     *
     *   exp.render({ shape: 'sphere', godrays: 0.8, glowIntensity: 1.6 });
     *
     * Every key is a capability the renderer declares (`exp.runner.renderCapabilities()`);
     * a typo'd key or an out-of-range value throws and applies nothing. Called before the
     * renderer attaches, the bag is validated when it does. Zero physics.
     *
     * @param {Object<string, *>} bag
     * @returns {RecipeContext} this
     */
    RecipeContext.prototype.render = function (bag) {
        this._runner.setRenderOptions(bag);
        return this;
    };

    // ── build(buildFn) ──────────────────────────────────────────────────────────

    /**
     * Run a build recipe WITHOUT starting the loop.
     *
     * Stores buildFn and invokes it once (passing this RecipeContext — the recipe
     * typically calls exp.init() then exp.addObject(...)). Use this when the caller
     * must configure the runner AFTER the objects exist but BEFORE the loop starts.
     *
     * Sets window._egptExperiment so the author surface can reach it pre-start.
     *
     * @param {Function} buildFn  — function(exp) { ... } that populates the recipe
     * @returns {RecipeContext} this
     */
    RecipeContext.prototype.build = function (buildFn) {
        if (buildFn && typeof buildFn === 'function') {
            this._buildFn = buildFn;
            buildFn(this);
            this._built = true;
        }
        if (typeof window !== 'undefined') {
            window._egptExperiment = this;
        }
        return this;
    };

    // ── run(buildFn) ──────────────────────────────────────────────────────────

    /**
     * Start the simulation loop, building first if a recipe is supplied and the
     * recipe has not been built yet.
     *
     * - run(buildFn): build(buildFn) if not already built, then start.
     * - run(): start (already built via build(), or no build needed).
     *
     * Sets window._egptExperiment = this. window._frqtlApp is set inside
     * FrqtlApp.start() (unchanged).
     *
     * @param {Function} [buildFn]  — function(exp) { ... } that populates the recipe
     */
    RecipeContext.prototype.run = function (buildFn) {
        if (buildFn && typeof buildFn === 'function' && !this._built) {
            this.build(buildFn);
        }
        // Expose on window for IDE author surface and same-origin embedders.
        if (typeof window !== 'undefined') {
            window._egptExperiment = this;
        }
        this._runner.start();
    };

    // ── Export ────────────────────────────────────────────────────────────────

    // The world-init contract is NOT a RecipeContext static: reading one of its names here
    // THROWS naming the owner (FAIL-LOUD — never an alias that keeps the old spelling alive).
    ['INIT_CFG', 'assertInitCfg', 'initArgs'].forEach(function (name) {
        Object.defineProperty(RecipeContext, name, {
            get: function () {
                throw new Error('RecipeContext.' + name + ' does not exist: the exp.init(cfg) world-init ' +
                    'contract is FrqtlWorldInit.' + name + ' (objects/setup/_worldInit.js).');
            }
        });
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RecipeContext: RecipeContext };
    } else {
        window.RecipeContext = RecipeContext;
    }

})();
