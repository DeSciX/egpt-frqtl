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
 *   exp.init(cfg)                 cfg-bag → universe.init mapping (see init() below)
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
 * The cfg→universe.init mapping and the ObjectFactory ctx are COPIED VERBATIM from
 * Experiment.js (the module this replaces): they are the ONE authoritative mapping,
 * never re-typed. Experiment.js stays alive only for wave-interference until it is
 * deleted in a later bite; the two mappings must never diverge.
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

    // ── INIT_CFG — the recipe vocabulary, published as a contract ─────────────

    /**
     * INIT_CFG — every key `exp.init(cfg)` accepts, and what each one does.
     *
     * THE contract, exported as `RecipeContext.INIT_CFG` so no consumer re-enumerates
     * it. `Experiment.js` (the legacy twin this module replaces) CONSUMES this table
     * rather than carrying a second copy — the two facades' vocabularies are the same
     * vocabulary, and a hand-copy is how they would silently diverge.
     *
     * The list is derived from what `init()` below ACTUALLY reads. `interQuantumCollisions`
     * is in it because it is still ACCEPTED (inert — it fed a removed positional slot) and
     * STUDIO codegen prints it into every saved recipe: dropping it from the vocabulary
     * would make every saved scene throw.
     *
     * @type {Array<{key:string, effect:string}>}
     */
    var INIT_CFG = [
        { key: 'dimension',              effect: 'the fundamental (base) dimension layer — universe.init()\'s 2nd argument. default 2.' },
        { key: 'wavelengthScale',        effect: '→ universe.init options.wavelengthScale — the GLOBAL λ multiplier. default 8.' },
        { key: 'interQuantumCollisions', effect: 'ACCEPTED BUT INERT — it fed a removed positional slot the engine never read.' },
        { key: 'bonding',                effect: '→ universe.init options.noEscape (the names do NOT line up 1:1). default false.' },
        { key: 'frames',                 effect: "BOOLEAN → universe.init options.frameGenMode: true → 'topDown', false → 'groundUp'. default false." },
        { key: 'activeAxes',             effect: '{x,y,z} 1D/2D/3D selector, ferried 1:1. Omitted ⇒ the engine\'s 2D default.' },
        { key: 'stepping',               effect: "'fixed' | 'average' — the wave-walk sampler, ferried VERBATIM (never validated or defaulted here). Omitted ⇒ the engine's default." },
    ];

    function _initCfgKeyList() {
        return INIT_CFG.map(function (r) { return r.key; }).join(', ');
    }

    /**
     * THROW-OR-APPLY on the cfg bag. An unknown key is a hard error naming the legal
     * vocabulary — never a silent drop.
     *
     * The defect this closes: `init()` read four named keys by explicit destructure and
     * validated nothing else, so a saved STUDIO recipe carrying a RETIRED key loaded
     * fine, dropped the key, and ran with different physics. `universe.init()` throws on
     * those names, but a recipe never reaches it with them — this layer swallowed them
     * first. That is quieter, and worse, than the loud breakage retirement is for.
     *
     * RETIREMENT ENRICHMENT: the universe's own class publishes the retirement ledger
     * (`EGPTUniverse.RETIRED_CONFIG_KEYS`), so a retired name gets the SAME migration
     * sentence the engine throws — one ledger, never a second copy here. The THROW is
     * unconditional; only the extra sentence depends on the ledger being reachable (a
     * bare test double may not publish it), so a missing ledger can never weaken the gate.
     *
     * @param {string} where — the call shape to quote back ('RecipeContext.init(cfg)')
     * @param {Object} cfg
     * @param {Object} universe — the live universe, for its class's retirement ledger
     */
    function assertInitCfg(where, cfg, universe) {
        var Ctor    = universe ? universe.constructor : null;
        var retired = (Ctor && Ctor.RETIRED_CONFIG_KEYS && typeof Ctor.RETIRED_CONFIG_KEYS === 'object')
            ? Ctor.RETIRED_CONFIG_KEYS : null;
        Object.keys(cfg).forEach(function (k) {
            var known = INIT_CFG.some(function (r) { return r.key === k; });
            if (known) { return; }
            var msg = where + ": unknown option '" + k + "'. Legal options: " + _initCfgKeyList() + '.';
            if (retired && Object.prototype.hasOwnProperty.call(retired, k)) {
                msg += " That name is RETIRED at the engine — '" + k + "' " + retired[k] +
                    '. Note this is the RECIPE vocabulary, not the engine option list: ' +
                    'migrate to one of the legal options above.';
            }
            throw new Error(msg);
        });
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
     * Initialise the universe using a named config bag.
     *
     * Maps the cfg bag to universe.init()'s options object. NOTE: the cfg key
     * names predate the engine option names and DO NOT line up 1:1 — the mapping
     * below is preserved exactly (copied verbatim from Experiment.js) so behavior
     * stays bit-identical:
     *   cfg.bonding         → options.noEscape
     *   cfg.frames          → options.frameGenMode  (true → 'topDown', false → 'groundUp')
     *   cfg.interQuantumCollisions is accepted but inert (it fed a removed
     *     positional slot, which the engine never read).
     *   cfg.activeAxes      → options.activeAxes  (pass-through, 1:1)
     *
     *   cfg.activeAxes      → options.activeAxes  (pass-through, 1:1)
     *   cfg.stepping        → options.stepping    (pass-through, 1:1)
     *
     * THROW-OR-APPLY: an unknown cfg key is a hard error naming the legal vocabulary
     * (`INIT_CFG` above), with the engine's own migration sentence appended when the name
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
     * Ferried VERBATIM: this layer neither validates nor defaults it. `universe.init()`
     * is the one validator (it throws naming both legal samplers) and the engine's own
     * serde enum is the one default, so omission must leave the key ABSENT from the
     * init bag rather than substituting a JS-side copy that could drift.
     *
     * Physics, for the reader: both samplers realize the same MEAN step (1 px/tick
     * along the momentum vector) and differ only in the variance about it — 'fixed'
     * walks a deterministic error accumulator (along-ray deviation bounded below 1px),
     * 'average' draws a per-axis Bernoulli coin (variance (L1/L2 − 1) px²/tick, zero
     * on-axis, 0.414 at 45°). Axis-aligned and stationary frames are bit-identical
     * under both; off-axis higher-order fringes are where they diverge.
     *
     * canvas_rect is sourced from runner.canvas_rect (set at construction time,
     * always valid before init()).
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
        // be silently dropped on the way to universe.init(). See assertInitCfg().
        assertInitCfg('RecipeContext.init(cfg)', cfg, this._runner.universe);
        this._initCfg = cfg;   // store for the initCfg getter (STUDIO codegen)

        var dimension              = cfg.dimension              !== undefined ? cfg.dimension              : 2;
        var wavelengthScale        = cfg.wavelengthScale        !== undefined ? cfg.wavelengthScale        : 8;
        var bonding                = cfg.bonding                !== undefined ? cfg.bonding                : false;
        var frames                 = cfg.frames                 !== undefined ? cfg.frames                 : false;

        // canvas_rect is set at FrqtlApp construction time from opts.canvasW/H.
        // universe_rect is also set at EGPTUniverse construction time (before init()).
        // Both are valid here — we use runner.canvas_rect as the authoritative source.
        var canvas_rect = this._runner.canvas_rect;

        var initOpts = {
            wavelengthScale: wavelengthScale,
            noEscape: bonding,
            // cfg.frames is a BOOLEAN in the recipe vocabulary; the engine option is the
            // ENUM frameGenMode. The translation lives here, once, so no recipe has to
            // know the enum and no caller can pass the boolean to the engine (it throws).
            frameGenMode: frames ? 'topDown' : 'groundUp',
        };
        // Only attach activeAxes when the recipe declared it — omission lets the engine's
        // 2D default apply, so every pre-existing recipe's config stays byte-identical.
        if (cfg.activeAxes !== undefined && cfg.activeAxes !== null) {
            initOpts.activeAxes = cfg.activeAxes;
        }
        // Same omit-when-undeclared discipline for the walk sampler: omission lets the
        // ENGINE's serde default apply (one authority for the default), so every
        // pre-existing recipe's init bag stays byte-identical. Declared ⇒ ferried
        // VERBATIM to universe.init(), the one validator — a garbage value throws there
        // naming both legal samplers rather than being silently dropped here.
        if (cfg.stepping !== undefined && cfg.stepping !== null) {
            initOpts.stepping = cfg.stepping;
        }

        this._runner.universe.init(canvas_rect, dimension, initOpts);
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

    // The cfg contract, published exactly as EGPTUniverse publishes CONFIG — so the
    // legacy Experiment facade (and any future consumer) reads the vocabulary instead
    // of re-typing it.
    RecipeContext.INIT_CFG      = INIT_CFG;
    RecipeContext.assertInitCfg = assertInitCfg;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { RecipeContext: RecipeContext };
    } else {
        window.RecipeContext = RecipeContext;
    }

})();
