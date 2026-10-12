/* Copyright 2023-2026 by Essam Abadir */

/**
 * Experiment — thin container that wraps FrqtlApp with generic primitives.
 *
 * Provides a named-config init(), a declarative addObject() routed through
 * ObjectFactory, an addTickFunction() helper, and run/pause/restart lifecycle
 * methods. Does NOT duplicate the RAF loop, universe, or rendering — all of that
 * lives in FrqtlApp.
 *
 * Classic-script module: works both as a browser global and a Node CJS module.
 *
 * Dependency resolution mirrors how setup factories resolve window.X:
 *   var _gbl = typeof window !== 'undefined' ? window : globalThis;
 *
 * Usage (experiment page):
 *
 *   var exp = new Experiment({
 *     canvasParentId: 'canvas-wrapper',
 *     canvasW: 600, canvasH: 400, seed: 42,
 *     onTick: function (td, sr) { ... }
 *   });
 *
 *   exp.init({ dimension: 2, wavelengthScale: 8 });
 *   exp.addObject('PointSource', { x: 200, y: 200, diameter: 32, ... });
 *   exp.run();
 *
 * OR with a deferred build function:
 *
 *   exp.run(function buildExperiment(e) {
 *     e.init({ ... });
 *     e.addObject('PointSource', { ... });
 *   });
 *
 * IDE compatibility:
 *   - window._frqtlApp  is set by FrqtlApp.start() (unchanged).
 *   - window._egptExperiment is set by Experiment.run() for callers that use
 *     the Experiment path.
 */

(function () {
    'use strict';

    // ── Dependency resolution ────────────────────────────────────────────────
    // Mirrors how setup factories resolve globals (e.g. setupDoubleSlit.js).

    var _gbl = typeof window !== 'undefined' ? window : globalThis;

    function _resolve(name) {
        return _gbl[name] || (typeof module !== 'undefined' && module.exports ? null : null);
    }

    /**
     * The world-init contract (INIT_CFG + assertInitCfg + initArgs) is owned by the leaf
     * `objects/setup/_worldInit.js` (global `FrqtlWorldInit`), which the roster loads ahead
     * of this file. Experiment CONSUMES it rather than carrying a second copy. Resolved at
     * call time; FAIL LOUD if it is absent — an unvalidated cfg bag is the defect this closes.
     */
    function _worldInit() {
        var W = (typeof module !== 'undefined' && module.exports)
            ? require('./setup/_worldInit.js')
            : _resolve('FrqtlWorldInit');
        if (!W || !W.INIT_CFG || typeof W.assertInitCfg !== 'function' || typeof W.initArgs !== 'function') {
            throw new Error(
                '[Experiment] FrqtlWorldInit is not loaded, so the exp.init(cfg) vocabulary ' +
                'cannot be validated or mapped. objects/setup/_worldInit.js OWNS that contract ' +
                '(INIT_CFG + assertInitCfg + initArgs) and ships in the game-layer roster ' +
                '(lib/shim/engine/game-layer-manifest.js) ahead of objects/setup/ — load it.'
            );
        }
        return W;
    }

    // ── Experiment ────────────────────────────────────────────────────────────

    /**
     * @param {Object}   opts               — forwarded verbatim to FrqtlApp
     * @param {string}   [opts.canvasParentId]
     * @param {number}   opts.canvasW        REQUIRED — FrqtlApp throws without it (no default world)
     * @param {number}   opts.canvasH        REQUIRED
     * @param {number}   [opts.seed=42]
     * @param {number}   [opts.tickHz]
     * @param {number}   [opts.drawHz]
     * @param {number}   [opts.stepsPerFrame]
     * @param {Function} [opts.onTick]
     * @param {Function} [opts.onReady]
     */
    function Experiment(opts) {
        var FrqtlApp = _resolve('FrqtlApp');
        if (!FrqtlApp) {
            throw new Error('[Experiment] FrqtlApp not loaded — stack-boot.js must run first');
        }

        this._runner      = new FrqtlApp(opts || {});
        this._initCfg     = null;    // stored by init(), replayed by restart()
        this._buildFn     = null;    // stored by build()/run(buildFn), replayed by restart()
        this._built       = false;   // true once the build recipe has run
        this._setupResult = null;    // result of init() (universe.init doesn't return one)

        // Create the canvas immediately (mirrors FrqtlApp usage pattern).
        this._runner.createCanvas();
    }

    // ── Getters ───────────────────────────────────────────────────────────────

    Object.defineProperty(Experiment.prototype, 'runner', {
        get: function () { return this._runner; }
    });

    Object.defineProperty(Experiment.prototype, 'universe', {
        get: function () { return this._runner.universe; }
    });

    Object.defineProperty(Experiment.prototype, 'setupResult', {
        get: function () { return this._setupResult; }
    });

    // ── init(cfg) ─────────────────────────────────────────────────────────────

    /**
     * Initialise the universe using a named config bag.
     *
     * Applies `FrqtlWorldInit.initArgs(cfg, runner.canvas_rect)` — the ONE cfg→universe.init
     * mapping, owned by objects/setup/_worldInit.js (see it for the key-by-key table).
     *
     * THROW-OR-APPLY: an unknown cfg key is a hard error naming the legal vocabulary,
     * which is `FrqtlWorldInit.INIT_CFG` — the ONE table, consumed, never re-typed here.
     * Until this landed, unknown keys were silently ignored, so a saved recipe carrying
     * a RETIRED name loaded fine and ran with different physics.
     *
     * `activeAxes` is the 1D/2D/3D selector and it is a WORLD property, so it belongs
     * to this world step — a recipe that wants 3D declares it HERE (typically as
     * `setupSphereEmitter3D.worldCfg(opts).activeAxes`), never by relying on a part to
     * re-init the universe behind its back. Omitted ⇒ the engine's 2D default {x,y}.
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
    Experiment.prototype.init = function (cfg) {
        cfg = cfg || {};
        // THROW-OR-APPLY before anything is stored or forwarded — FrqtlWorldInit owns the
        // vocabulary and the retirement enrichment; this facade only supplies its own name.
        _worldInit().assertInitCfg('Experiment.init(cfg)', cfg, this._runner.universe);
        this._initCfg = cfg;   // store for restart()
        // The ONE cfg→universe.init mapping is FrqtlWorldInit.initArgs; this facade applies it.
        var u = this._runner.universe;
        _worldInit().applyPreInit(cfg, u);
        u.init.apply(u, _worldInit().initArgs(cfg, this._runner.canvas_rect));
    };

    // ── addObject(kind, config) ───────────────────────────────────────────────

    /**
     * Create and register a placeable object via ObjectFactory.
     *
     * Delegates to ObjectFactory.create(kind, config, ctx) where ctx carries
     * runner and the global window (cw=null → builders resolve from window). A
     * builder that spans the world (DetectorWall, SlitScreen) reads its size from
     * runner.canvas_rect — ctx carries no size of its own.
     *
     * x/y are sourced from config.x / config.y when provided, so the caller can
     * use the same config bag for positioning and object construction.
     *
     * @param {string} kind    — registered builder key (e.g. 'PointSource')
     * @param {Object} config  — override props (merged over schema defaultProps)
     * @returns {Object|null}  — primary/visual handle returned by the builder
     */
    Experiment.prototype.addObject = function (kind, config) {
        var ObjectFactory = _resolve('ObjectFactory');
        if (!ObjectFactory) {
            throw new Error('[Experiment.addObject] ObjectFactory not loaded');
        }
        var x = (config && config.x != null) ? config.x : 0;
        var y = (config && config.y != null) ? config.y : 0;
        var ctx = {
            runner: this._runner,
            cw:     null,   // null → builders resolve classes from window
            x:      x,
            y:      y
        };
        return ObjectFactory.create(kind, config, ctx);
    };

    // ── addTickFunction(fn) ───────────────────────────────────────────────────

    /**
     * Push a tick function into the universe's experimentTickFunctions array.
     * Mirrors the thermostat pattern scenes/blackbody.js uses.
     *
     * @param {Function} fn  — called each physics tick (by the engine's Phase A)
     * @returns {number}     — index of the added function (for removal if needed)
     */
    Experiment.prototype.addTickFunction = function (fn) {
        var fns = this._runner.universe.experimentTickFunctions;
        fns.push(fn);
        return fns.length - 1;
    };

    // ── build(buildFn) ──────────────────────────────────────────────────────────

    /**
     * Run a build recipe WITHOUT starting the loop.
     *
     * Stores buildFn as the restart recipe and invokes it once (passing this
     * Experiment instance — the recipe typically calls exp.init() then
     * exp.addObject(...)). Use this when the caller must configure the runner
     * AFTER the objects exist but BEFORE the loop starts — e.g. addBackdrop(),
     * which is a universe method and therefore requires init() to have run.
     *
     *   experiment.build(buildExperiment);     // init + objects (no loop yet)
     *   experiment.runner.addBackdrop(...);    // safe: universe is init'd
     *   experiment.run();                      // start the loop
     *
     * Sets window._egptExperiment so the author surface can reach it pre-start.
     *
     * @param {Function} buildFn  — function(exp) { ... } that populates the experiment
     * @returns {Experiment} this
     */
    Experiment.prototype.build = function (buildFn) {
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
     * experiment has not been built yet.
     *
     * - run(buildFn): build(buildFn) if not already built, then start.
     * - run(): start (already built via build(), or no build needed).
     *
     * Sets window._egptExperiment = this. window._frqtlApp is set inside
     * FrqtlApp.start() (unchanged).
     *
     * @param {Function} [buildFn]  — function(exp) { ... } that populates the experiment
     */
    Experiment.prototype.run = function (buildFn) {
        if (buildFn && typeof buildFn === 'function' && !this._built) {
            this.build(buildFn);
        }
        // Expose on window for IDE author surface and same-origin embedders.
        if (typeof window !== 'undefined') {
            window._egptExperiment = this;
        }
        this._runner.start();
    };

    // ── pause() ───────────────────────────────────────────────────────────────

    /**
     * Pause the simulation (delegates to runner.stop()).
     */
    Experiment.prototype.pause = function () {
        this._runner.stop();
    };

    // ── restart() ────────────────────────────────────────────────────────────

    /**
     * Stop, clear particle state, re-init, re-run the stored build recipe, and start.
     *
     * Goal: clean particle set + same objects + running again.
     *
     * Strategy:
     *   1. runner.stop()                    — halt the RAF loop
     *   2. universe.init(storedCfg)         — re-inits the universe, clearing all frames
     *   3. universe re-init empties the world's object census (the render list DERIVES
     *      from it — there is no separate render list to clear)
     *   4. runner._emitters     = []        — clear the emitter list
     *   5. _buildFn(this)                   — re-build objects from the stored recipe
     *   6. runner.start()                   — restart the loop
     *
     * universe.init() clears all quanta (it rebuilds the quadtree and dimension list
     * from scratch). The object lists are cleared so objects are not double-registered.
     */
    Experiment.prototype.restart = function () {
        this._runner.stop();

        // Re-init the universe (clears all frames/quanta).
        if (this._initCfg !== null) {
            this.init(this._initCfg);
        }

        // Clear authored object render lists so the build recipe doesn't double-register.
        this._runner._emitters     = [];

        // Re-build from the stored recipe (if one was given to run()).
        if (this._buildFn && typeof this._buildFn === 'function') {
            this._buildFn(this);
        }

        // Re-expose and restart.
        if (typeof window !== 'undefined') {
            window._egptExperiment = this;
        }
        this._runner.start();
    };

    // ── Export ────────────────────────────────────────────────────────────────

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { Experiment: Experiment };
    } else {
        window.Experiment = Experiment;
    }

})();
