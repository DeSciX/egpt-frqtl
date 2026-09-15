/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupBlackbody — Engine-agnostic blackbody radiation experiment factory.
 * Creates a bounce-walled oven cavity with a slit aperture, four inward-firing
 * wall emitters, and a thermostat tick function that maintains the target quanta
 * count (`temperature`). Escaped radiation is absorbed by a canvas-edge sink so
 * cavity fill tracks the target cleanly.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM engine.
 * JS-reference and WASM-engine outputs are bit-identical for the physics; the
 * histogram panel is computed from `tickData.frameData` in the page layer (engine-agnostic).
 *
 * ## Physics you can drive
 *
 * - **`options.temperature`** is the primary knob. It sets the thermostat's target
 *   `activeQuanta` count. Every tick the thermostat emits
 *   `floor((temperature - activeQuanta) / 4)` new leaf Frames from each of the
 *   four wall emitters until the target is met, then silences all emitters for
 *   that tick. OBSERVED (seed 42, tick 600): raising `temperature` 300 → 4000
 *   densifies the cavity from sparse scattered leaf dots to a near-saturated red
 *   mass, increases compound-frame (non-leaf, merged) formation dramatically, and
 *   widens the escaped-radiation stream through the slit in both volume and angular
 *   spread. Figure + sweep data: `docs/internal/physics-lab/blackbody-temperature.md`.
 *
 *   The thermostat is a proportional controller over quanta count — `temperature`
 *   is NOT energy in the continuous-mechanics sense. Heavier compound frames
 *   (formed by more collisions at higher temperature) have shorter oscillation
 *   wavelengths (`wavelength = floor((capacity / mass) × WAVELENGTH_CONSTANT)`,
 *   Core Axiom §6) — denser cavities produce faster-cycling compound frames.
 *
 * - **`options.slitHeight`** sets the aperture opening in the slit wall (pixels).
 *   Geometry change only — wider slit allows more radiation to escape per tick.
 *
 * - **`options.boxFraction`** scales the box's width and height as a fraction of
 *   the canvas rect. Geometry change only.
 *
 * - **`options.wallThickness`**, **`options.slitWall`** — geometry knobs.
 *   `wallThickness` sets BOUNCE wall thickness; `slitWall` picks which wall face
 *   ('right' | 'left' | 'top' | 'bottom') carries the slit.
 *
 * - **`options.fundamental_dim`** / **`options.quantum_dim`** — engine quadtree
 *   dimension settings (Phase B: STRUCTURE in the doTick pipeline). Effect
 *   depends on engine internals; no isolated visual sweep was performed for these.
 */

(function () {

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.
    var _assertSetupOptions;
    if (typeof module !== 'undefined' && module.exports) {
        _assertSetupOptions = require('./_setupOptions').assertSetupOptions;
    } else {
        _assertSetupOptions = function (n, o, k) { return window.assertSetupOptions(n, o, k); };
    }

    // ── Imports ─────────────────────────────────────────────────────────

    var OvenBox, Rectangle, LargeObject, CollisionTypes, CollisionActions;

    if (typeof module !== 'undefined' && module.exports) {
        OvenBox = require('../objects/OvenBox').OvenBox;
        Rectangle = require('../geometry/Rectangle').Rectangle;
        LargeObject = require('../objects/LargeObject').LargeObject;
        CollisionTypes = require('../constants/CollisionTypes').CollisionTypes;
        CollisionActions = require('../constants/CollisionActions').CollisionActions;
    } else {
        OvenBox = window.OvenBox;
        Rectangle = window.Rectangle;
        LargeObject = window.LargeObject;
        CollisionTypes = window.CollisionTypes;
        CollisionActions = window.CollisionActions;
    }

    // ── Setup Factory ───────────────────────────────────────────────────

    /**
     * Create a blackbody (bouncy box) experiment.
     *
     * @param {Object} universe - The engine universe instance (JS or WASM), not yet
     *   init'd. `universe.init` is called internally.
     * @param {Object} [options] - Configuration overrides.
     * @param {number} [options.temperature=300] - Target quanta count (thermostat
     *   set-point). The thermostat emits leaf Frames until `activeQuanta` reaches
     *   this value, then stops. OBSERVED: raising from 300 to 4000 increases cavity
     *   density, compound-frame formation, and escaped-radiation flux substantially.
     *   See `docs/internal/physics-lab/blackbody-temperature.md`.
     * @param {number} [options.boxFraction=1/3] - Box width and height as a fraction
     *   of the canvas rect. Geometry knob — no emergent-physics effect.
     * @param {number} [options.wallThickness=10] - Wall thickness in pixels (BOUNCE
     *   walls). Geometry knob.
     * @param {number} [options.slitHeight=60] - Height of the aperture opening in the
     *   slit wall (pixels). Wider slit allows more radiation to escape per tick.
     * @param {string} [options.slitWall='right'] - Which wall carries the slit:
     *   `'right'` | `'left'` | `'top'` | `'bottom'`.
     * @param {number} [options.radiationSinkDepth=30] - Depth (pixels) of the canvas-
     *   edge ABSORB strip that removes escaped radiation before it can drift back into
     *   the cavity and corrupt the thermostat count.
     * @param {number} [options.fundamental_dim=0] - Base dimension for
     *   `universe.init`. Engine quadtree setting.
     * @param {number} [options.quantum_dim=4] - Secondary scale dimension added via
     *   `universe.addDimension`. Engine quadtree setting.
     * @returns {{ box: OvenBox, emitters: QuantumEmitter[], temperatureControl: { setTemperature(n:number):void, getTemperature():number }, radiationSink: LargeObject|null, largeObjects: LargeObject[] }}
     *
     * @example
     * // Two-cell notebook pattern
     * // module cell:
     * export function setupBlackbodyDemo(frqtl, universe, opts) {
     *   const { box, temperatureControl } = setupBlackbody(universe, {
     *     temperature: opts.temperature ?? 1500
     *   });
     *   return { box, temperatureControl };
     * }
     * // canvas cell: setup="<module>#setupBlackbodyDemo" opts='{"temperature":2000}'
     */
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupBlackbody.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'boxFraction', 'fundamental_dim', 'quantum_dim', 'radiationSinkDepth',
        'slitHeight', 'slitWall', 'temperature', 'wallThickness',
    ];

    function setupBlackbody(universe, options) {
        options = _assertSetupOptions('setupBlackbody', options, OPTIONS);

        var canvas_rect = universe.universe_rect;

        var fundamental_dim = options.fundamental_dim !== undefined ? options.fundamental_dim : 0;
        var quantum_dim = options.quantum_dim !== undefined ? options.quantum_dim : 4;
        var temperature = options.temperature !== undefined ? options.temperature : 300;
        var boxFraction = options.boxFraction !== undefined ? options.boxFraction : 1 / 3;
        var wallThickness = options.wallThickness !== undefined ? options.wallThickness : 10;
        var slitHeight = options.slitHeight !== undefined ? options.slitHeight : 60;
        var slitWall = options.slitWall !== undefined ? options.slitWall : 'right';

        // Init universe: ground-up mode with inter-quantum collisions
        universe.init(canvas_rect, fundamental_dim, { wavelengthScale: 1 });
        universe.brownianMotion = true;
        universe.withInterQuantumCollisions = true;

        // Add quantum dimension if specified
        if (quantum_dim && quantum_dim > fundamental_dim) {
            universe.addDimension(quantum_dim);
        }

        var screenCenterX = Math.round(canvas_rect.w / 2);
        var screenCenterY = Math.round(canvas_rect.h / 2);
        var boxW = Math.round(canvas_rect.w * boxFraction);
        var boxH = Math.round(canvas_rect.h * boxFraction);

        // Match devsdk convention: boxRect is the OUTER rect (centered).
        // devsdk: new Rectangle(centerX, centerY, w, h, null, true)
        // then BouncyBox passes it to Box(boxRect, useInnerRect=false)
        // meaning walls sit at the outer rect edges.
        // Box takes INNER rect and expands outward by wallThickness.
        // So inner = (outer.left + wt, outer.top + wt, outer.w - 2*wt, outer.h - 2*wt)
        // produces the same wall positions as devsdk.
        var outerRect = new Rectangle(screenCenterX, screenCenterY, boxW, boxH, null, true);
        var innerLeft = outerRect.left + wallThickness;
        var innerTop = outerRect.top + wallThickness;
        var innerW = outerRect.w - 2 * wallThickness;
        var innerH = outerRect.h - 2 * wallThickness;

        // Push the thermostat tick function FIRST, before emitters register,
        // so it runs before emitter tick functions on the JS engine.
        // This ensures burst sizes are adjusted before emitters fire each tick,
        // matching WASM behavior where the thermostat runs before do_tick()'s Phase A.
        var thermostatSlot = universe.experimentTickFunctions.length;
        universe.experimentTickFunctions.push(null); // placeholder

        // Create the OvenBox (box + emitters + thermostat)
        var oven = new OvenBox(universe, {
            left: innerLeft,
            top: innerTop,
            width: innerW,
            height: innerH,
            wallThickness: wallThickness,
            temperature: temperature,
            slitHeight: slitHeight,
            slitWall: slitWall,
            color: [120, 120, 120]
        });

        // Fill in the thermostat at the reserved slot
        universe.experimentTickFunctions[thermostatSlot] = oven.getTemperatureTickFunction();

        // ── Exterior radiation sink / detector ──────────────────────────
        // The cavity is sealed except for one slit. Escaping quanta must be
        // removed before they drift across the whole canvas — otherwise the
        // escaped stream counts toward universe.activeQuanta and the thermostat
        // under-fills the cavity.
        //
        // The sink sits as a full-canvas-height strip at the FAR edge of the
        // canvas on the slit side — deliberately far from the cavity wall, NOT
        // flush against the slit. Putting a collision body right at the slit
        // made escaping non-leaf frames snag/stick at the exit; with the
        // absorber pushed to the canvas edge, frames stream across open space
        // and are only removed when they reach the edge.
        //
        // The sink ABSORBs everything (leaf + non-leaf) so escaped radiation
        // does not accumulate off-cavity. The intensity-frequency graph is
        // computed from doTick() frame data (engine-agnostic), so the sink no
        // longer needs a JS-engine-only LOG action. Registered for collisions
        // but intentionally NOT rendered (invisible).
        var sinkDepth = options.radiationSinkDepth !== undefined ? options.radiationSinkDepth : 30;
        var radiationSink = null;
        var sinkRect = null;
        if (slitWall === 'right') {
            sinkRect = [canvas_rect.w - sinkDepth, 0, sinkDepth, canvas_rect.h];
        } else if (slitWall === 'left') {
            sinkRect = [0, 0, sinkDepth, canvas_rect.h];
        } else if (slitWall === 'top') {
            sinkRect = [0, 0, canvas_rect.w, sinkDepth];
        } else if (slitWall === 'bottom') {
            sinkRect = [0, canvas_rect.h - sinkDepth, canvas_rect.w, sinkDepth];
        }
        if (sinkRect && LargeObject && CollisionTypes && CollisionActions) {
            radiationSink = new LargeObject(
                universe, sinkRect,
                CollisionTypes.NONE, [CollisionActions.ABSORB],
                'radiation_sink', 'closest', null, 1, [0, 0, 0]
            );
        }

        return {
            box: oven,
            emitters: oven.emitters,
            temperatureControl: {
                setTemperature: function (temp) { oven.setTemperature(temp); },
                getTemperature: function () { return oven.getTemperature(); }
            },
            radiationSink: radiationSink,
            largeObjects: oven.walls
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupBlackbody.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupBlackbody: setupBlackbody };
    } else {
        window.setupBlackbody = setupBlackbody;
    }

})();
