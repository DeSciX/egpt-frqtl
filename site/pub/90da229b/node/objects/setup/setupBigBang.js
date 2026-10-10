/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupBigBang — Engine-agnostic Big Bang experiment factory.
 *
 * Places a single {@link PointSource} at canvas center and initializes the
 * universe with `frameGenMode: 'topDown'` (top-down frame generation).
 * Unlike directed-emission setups, every emitter fires with `vx = vy = 0` —
 * there is no initial velocity. All outward propagation is **emergent**: driven
 * by density-based clustering (Phase B `buildFramesFromSprites`) and Brownian
 * motion, not by launch vectors.
 *
 * Engine-agnostic: works with both the JS reference engine and the Rust/WASM
 * engine (bit-identical physics).
 *
 * ## Physics you can drive
 *
 * **`options.lightSourceDiameter`** is the primary geometry knob. It sets the
 * outer radius of the emission ring (`radius = diameter / 2`). Because emission
 * also fills inward (`minRadius: 2`, step 2 px), the total emitter count scales
 * as `(radius / 2) × floor(360 / dispersionAngleIncrement)` — 72 angles at the
 * default 5°. A larger diameter produces a wider initial particle field and a
 * proportionally larger emergent explosion.
 *
 * OBSERVED (seed 42, ~50 rendered frames, engine = js):
 *
 * | `lightSourceDiameter` | Active quanta | Field |
 * |---|---|---|
 * | 16 | ~21,000 | Tight compact cluster, few emergent Frame circles |
 * | 32 | ~41,000 | Moderate expansion, multi-scale circles forming |
 * | **64** (default) | ~79,000 | Well-developed explosion, prominent Frame hierarchy |
 * | 128 | ~157,000 | Large expansion; stack overflow observed at init (2k+ emitters) |
 *
 * Figure + data: `docs/internal/physics-lab/big-bang-lightSourceDiameter.md`.
 *
 * **`options.dispersionAngleIncrement`** (default 5°) sets the angular density
 * of the emission ring. Smaller values = smoother ring; larger = discrete spokes.
 * This was not swept here — observable effect is angular resolution of the
 * initial particle shell.
 *
 * **`options.maxTicks`** (default 1200 = 20 × 60) cuts off emission at that tick
 * count. After cut-off the existing particles continue to evolve under the
 * emergent physics, but no new quanta are added. Set to `Infinity` for continuous
 * emission.
 *
 * **`options.frameGenMode`** (default `'topDown'`) is the mode switch between the
 * two frame-generation models. Must remain `'topDown'` for the Big Bang experiment:
 * `'groundUp'` would switch to collision-driven promotion, which requires
 * directed velocity to produce any expansion.
 *
 * **`options.quantumDimension`** (default 0) sets the base dimension layer.
 * Currently only tested at 0.
 *
 * @example
 * // Two-cell notebook pattern (declarative-canvas model):
 * // module cell:
 * export function setupMyBigBang(frqtl, universe, opts) {
 *     return setupBigBang(universe, { lightSourceDiameter: opts.diameter || 64 });
 * }
 * // canvas cell: setup="<module>#setupMyBigBang" opts='{"diameter":32}' seed="42"
 *
 * @param {Object} universe  - The engine universe instance (JS or WASM), not yet init'd.
 * @param {Object} [options] - Configuration overrides (all optional).
 * @param {string}  [options.frameGenMode='topDown']       - Frame generation mode,
 *   `'topDown'` | `'groundUp'`. Must be `'topDown'` for Big Bang — `'groundUp'`
 *   disables the emergent expansion.
 * @param {number}  [options.lightSourceDiameter=64]        - Outer diameter of the emission
 *   ring (pixels). Scales emitter count and emergent explosion radius.
 *   See `docs/internal/physics-lab/big-bang-lightSourceDiameter.md` for the observed effect.
 * @param {number}  [options.dispersionAngleIncrement=5]    - Degrees between emission angles
 *   → `floor(360 / inc)` rays. Default 5° = 72 rays around the ring.
 * @param {number}  [options.quantumDimension=0]            - Base dimension layer (default 0).
 * @param {number}  [options.maxTicks=1200]                 - Ticks before emission stops
 *   (20 × 60 at 60 fps ≈ 20 s). Set `Infinity` for continuous emission.
 * @returns {{ pointSource: PointSource }} The constructed point source; use
 *   `pointSource.setActive(false)` to stop emission programmatically.
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

    var PointSource;

    if (typeof module !== 'undefined' && module.exports) {
        PointSource = require('../objects/PointSource').PointSource;
    } else {
        PointSource = window.PointSource;
    }

    // ── Setup Factory ───────────────────────────────────────────────────
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupBigBang.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'dispersionAngleIncrement', 'frameGenMode', 'lightSourceDiameter', 'maxTicks',
        'quantumDimension',
    ];


    function setupBigBang(universe, options) {
        options = _assertSetupOptions('setupBigBang', options, OPTIONS);

        var canvas_rect = universe.universe_rect;

        var frameGenMode = options.frameGenMode !== undefined ? options.frameGenMode : 'topDown';
        var lightSourceDiameter = options.lightSourceDiameter !== undefined ? options.lightSourceDiameter : 64;
        var dispersionAngleIncrement = options.dispersionAngleIncrement !== undefined ? options.dispersionAngleIncrement : 5;
        var quantumDimension = options.quantumDimension !== undefined ? options.quantumDimension : 0;
        var maxTicks = options.maxTicks !== undefined ? options.maxTicks : 20 * 60;

        universe.iframe_interval_seconds = 1 / 60;

        // Init universe: top-down frame generation for Big Bang — the ONE place the mode is
        // declared. (This factory used to write `universe.emergentPhysics = …` before init as
        // well; that write was INERT — init hard-coded 'topDown' over it — so the factory's
        // own option is now ferried into init instead of being silently discarded.)
        universe.init(canvas_rect, quantumDimension, { wavelengthScale: 1, frameGenMode: frameGenMode });

        var light_source_center_x = Math.floor(canvas_rect.w / 2);
        var light_source_center_y = Math.floor(canvas_rect.h / 2);

        // Create radial point source at canvas center
        // velocity=0, charge=null (random), emit from multiple radii (minRadius=2)
        var pointSource = new PointSource(
            universe,
            light_source_center_x, light_source_center_y,
            lightSourceDiameter,
            0,                          // speed (unused — angles provide direction)
            null,                       // charge (random +/-)
            true,                       // auto_fire
            Infinity,                   // quantum_limit per angle (unlimited)
            0,                          // delay
            dispersionAngleIncrement,   // angle_increment = 5 degrees
            { emergentPhysics: true, minRadius: 2 }  // vx=vy=0, emit from r=2 to r=32
        );

        // Stop emitting after maxTicks
        if (maxTicks !== Infinity) {
            var currentTick = 0;
            universe.experimentTickFunctions.push(function () {
                currentTick++;
                if (currentTick >= maxTicks) {
                    pointSource.setActive(false);
                }
                return [];
            });
        }

        return {
            pointSource: pointSource
        };
    }

    // ── Export ───────────────────────────────────────────────────────────

    setupBigBang.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupBigBang: setupBigBang };
    } else {
        window.setupBigBang = setupBigBang;
    }

})();
