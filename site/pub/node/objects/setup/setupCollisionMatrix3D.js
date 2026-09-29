/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupCollisionMatrix3D — 3D density-sweep collision experiment.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * @param {Object} universe - WASM universe; init()'d here with activeAxes {x,y,z}.
 * @param {Object} [opts]
 * @param {number} [opts.level=6]     - Dimension of every body (2^level px voxel; 6 = 64px).
 * @param {number} [opts.canvasW=700] [opts.canvasH=700] - Canvas size.
 * @param {number} [opts.offset=0]    - Transverse YZ offset (px): expands in y and z together.
 * @param {number} [opts.angle=0]     - Converging vy magnitude (A up/B down → adds y momentum).
 *
 * @returns {{
 *   level: number, voxel: number, capacity: number, laneYs: number[], laneZs: number[],
 *   ax0: number, bx0: number,
 *   lanes: Array<{ name:string, label:string, aQid:number, bQid:number,
 *                  mass:number, ax0:number, bx0:number, laneY:number, laneZ:number }>,
 *   matrixControl: { getOffset, setOffset, getAngle, setAngle, reset }
 * }}
 *
 * ── Layer 2: physics behavior (what this PROVES) ─────────────────────────────
 * SEVEN lanes of Dim-6 cube bodies (equal mass, same voxel = 64 px) launched head-on
 * along X. DENSITY is swept on a LOG (powers-of-2) scale, ρ = mass/capacity ≈ 0.0002 … 1.0
 * (`_collisionMatrixLanes.js` — the ONE lane table, shared with the 2D matrix). The
 * absolute masses are derived from the capacity the ENGINE reports: a 3D Dim-6 body is
 * 64x64x64, so capacity = 262144 and the ladder runs 64 … 262144, where the 2D matrix's
 * same densities give 1 … 4096. Density, not mass, is what the sweep reads.
 *
 * The 2D collision-matrix arranges these 7 lanes in a COLUMN (varying Y only).
 * This 3D version distributes them in a 3×3 GRID face: rows in Y, columns in Z,
 * so the perspective orbit camera reveals TRUE DEPTH — bodies recede into the Z axis.
 *
 * activeAxes {x,y,z}: x carries the head-on approach; y and z carry the 3D scene
 * distribution. Engine bench C5 (z-axis bounce ≡ x-axis bounce) is free — the
 * same two-bucket momentum exchange runs per-axis regardless of which axis. No
 * new engine behavior: the 3D physics is "free" from the engine's per-axis design.
 *
 * Speed-up law: withInterQuantumCollisions=true runs voxel_collision_pass.  The
 * per-tick exchange ceiling carries occupancy (ρ_A·ρ_B), so the bounce TIMING
 * emerges from density. Dense lanes bounce earliest; sparse lanes linger.  On any
 * single axis this is identical to the 2D matrix — the visual novelty is reading
 * the SAME density gradient in a perspective 3D view.
 *
 * Bodies are COLORLESS; ROYGBIV scheme colours each by fullness (sparse=red, full=violet).
 *
 * LIVE GYM knobs (offset, angle) re-seat lanes for OFF-AXIS approach — the offset
 * expands bodies in Y so the viewer can see glancing hits in perspective.  Identical
 * reset mechanic to the 2D matrix (no reload).
 */

(function () {

    // The ONE unknown-option-key validator (objects/setup/_setupOptions.js). Resolved
    // LAZILY in the browser: the game layer defines window.assertSetupOptions before any
    // page script runs, but reading it at eval time would bake in a load-order dependency.
    var _assertSetupOptions;
    var _lanes;
    if (typeof module !== 'undefined' && module.exports) {
        _assertSetupOptions = require('./_setupOptions').assertSetupOptions;
        _lanes = require('./_collisionMatrixLanes');
    } else {
        _assertSetupOptions = function (n, o, k) { return window.assertSetupOptions(n, o, k); };
        _lanes = window.collisionMatrixLanes;
    }
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupCollisionMatrix3D.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'angle', 'canvasH', 'canvasW', 'level',
        'offset',
    ];


    function setupCollisionMatrix3D(universe, opts) {
        opts = _assertSetupOptions('setupCollisionMatrix3D', opts, OPTIONS);
        var level = (opts.level !== undefined) ? opts.level : 6;

        // Canonically read the universe_rect (carries left/top/w/h).
        var rect = universe.universe_rect ||
            { left: 0, top: 0, w: (opts.canvasW || 700), h: (opts.canvasH || 700) };
        var cw = rect.w, ch = rect.h;

        // ── activeAxes {x,y,z} — the ONLY change from the 2D version ─────────
        // x: approach axis. y: vertical spread (same as 2D). z: depth spread (NEW).
        // C5 (bench): z-axis bounce ≡ x-axis bounce — no new engine work required.
        universe.init(rect, 0, {
            wavelengthScale: 1,
            brownianMotion: false,
            activeAxes: { x: true, y: true, z: true }
        });
        universe.withInterQuantumCollisions = true;
        universe.addDimension(level);

        var voxel = Math.pow(2, level);   // 64 for level=6
        var half  = voxel / 2;

        // ── Launch X positions (approach along X, same as 2D matrix) ─────────
        var midX = Math.floor(cw * 0.5);
        var ax0  = midX - Math.floor(1.5 * voxel);   // A left of centre
        var bx0  = midX + Math.floor(1.5 * voxel);   // B right of centre

        // ── 3D grid layout: 7 lanes in a (3 rows Y) × (3 cols Z) grid ────────
        // We lay out 7 lanes as a 3×3 grid (skipping one corner).
        // Y rows:   -1 * spacing, 0, +1 * spacing (3 rows)
        // Z cols:   -1 * spacing, 0, +1 * spacing (3 cols)
        // Lane ordering fills row-major: (row0,col0),(row0,col1),(row0,col2),
        //                                (row1,col0),(row1,col1),(row1,col2),
        //                                (row2,col0) — 7 total.
        // The vertical Z-spread gives the orbit camera depth to show.
        var N = _lanes.LANE_DENSITIES.length;  // 7
        var spacing = Math.round(ch / 4);  // ~175px for 700px canvas

        var laneYs = [], laneZs = [];
        for (var k = 0; k < N; k++) {
            var row = Math.floor(k / 3);   // 0,0,0,1,1,1,2
            var col = k % 3;               // 0,1,2,0,1,2,0
            // Y: centre ± row*spacing. Row 0 = top (-spacing), row 1 = centre (0), row 2 = bottom (+spacing).
            laneYs.push(Math.round(ch / 2 + (row - 1) * spacing));
            // Z: centre ± col*spacing. Col 0 = back (-spacing), col 1 = centre (0), col 2 = front (+spacing).
            laneZs.push((col - 1) * spacing);
        }

        // ── OFFSET / ANGLE controls (same live-knob pattern as 2D matrix) ────
        var offsetPx = (opts.offset !== undefined) ? opts.offset : 0;
        var angleVy  = (opts.angle  !== undefined) ? opts.angle  : 0;

        var capacity = null;

        /**
         * Seat one body (CENTRE coords). dirX: A=+1, B=-1.
         * Applies the current offset (expands in Y) and angle (converging vy).
         * @param {number} qid
         * @param {number} cx   - Centre X position
         * @param {number} cy   - Centre Y position
         * @param {number} cz   - Centre Z position
         * @param {number} dirX - +1 for A (→), -1 for B (←)
         * @param {number} mass
         */
        function seat(qid, cx, cy, cz, dirX, mass) {
            universe.setFrameProperty(qid, 'x',  cx);
            universe.setFrameProperty(qid, 'y',  cy + dirX * offsetPx);
            universe.setFrameProperty(qid, 'z',  cz);
            universe.setFrameProperty(qid, 'vx', dirX);
            universe.setFrameProperty(qid, 'vy', -dirX * angleVy);
            universe.setFrameProperty(qid, 'vz', 0);
            universe.setFrameProperty(qid, 'mass', mass);
            universe.setFrameProperty(qid, 'speed_prob', 1.0);
        }

        // Build every body FIRST. The capacity that sets the lane ladder is whatever the
        // ENGINE reports for the body it actually built — 2^(3·level) here, not the 2D
        // 2^(2·level) — so the masses cannot be known until a body exists.
        var built = [];
        for (var i = 0; i < N; i++) {
            var laneY = laneYs[i];

            // COLORLESS boxes (ROYGBIV scheme colours from fullness).
            // makeLeafFrame(x, y, level, color, vx, vy, is_stationary, vz, data)
            // Top-left = centre − half on X and Y; Z is set via setFrameProperty.
            var aHandle = universe.makeLeafFrame(
                ax0 - half, laneY - half, level, null, 1, 0, true, 0, null
            );
            universe.injectFrame(aHandle);
            var aQid = universe.getFrameQuantumId(aHandle);

            var bHandle = universe.makeLeafFrame(
                bx0 - half, laneY - half, level, null, -1, 0, true, 0, null
            );
            universe.injectFrame(bHandle);
            var bQid = universe.getFrameQuantumId(bHandle);

            if (capacity === null) { capacity = universe.getFrameProperty(aQid, 'mass'); }
            built.push({ aQid: aQid, bQid: bQid });
        }

        var laneMasses = _lanes.laneMassesForCapacity(capacity);

        var lanes = built.map(function (b, i) {
            var laneY = laneYs[i];
            var laneZ = laneZs[i];
            var m = laneMasses[i];

            seat(b.aQid, ax0, laneY, laneZ, 1,  m);
            seat(b.bQid, bx0, laneY, laneZ, -1, m);

            return {
                name:  'm=' + m,
                label: 'mass ' + m + ' / ' + capacity + ' (density ' + (m / capacity).toPrecision(2) + ')',
                aQid: b.aQid, bQid: b.bQid, mass: m,
                ax0: ax0, bx0: bx0, laneY: laneY, laneZ: laneZ
            };
        });

        function reseatAll() {
            lanes.forEach(function (lane) {
                seat(lane.aQid, lane.ax0, lane.laneY, lane.laneZ, 1,  lane.mass);
                seat(lane.bQid, lane.bx0, lane.laneY, lane.laneZ, -1, lane.mass);
            });
        }

        // ── Live control handle (Blackbody pattern — no reload) ────────────────
        var matrixControl = {
            getOffset: function () { return offsetPx; },
            setOffset: function (v) { offsetPx = v; reseatAll(); },
            getAngle:  function () { return angleVy; },
            setAngle:  function (v) { angleVy  = v; reseatAll(); },
            reset:     function () { reseatAll(); }
        };

        return {
            level: level, voxel: voxel, capacity: capacity,
            laneYs: laneYs, laneZs: laneZs, ax0: ax0, bx0: bx0,
            lanes: lanes, matrixControl: matrixControl
        };
    }

    setupCollisionMatrix3D.OPTIONS = OPTIONS;

    /**
     * RATE_LIMITS — this scene's PACING, a factory static FrqtlApp.setup() applies through
     * setRateLimits (FrqtlApp.FACTORY_STATICS). Wall-clock presentation only: the physics
     * this factory builds, and every tick of it, is unchanged. 240 tps plays the head-on
     * approach (64 ticks) and the last lane's separation (~730 ticks) in about 3 s, at
     * 4 ticks per frame on a 60 Hz display — inside the runner's per-frame tick budget.
     */
    setupCollisionMatrix3D.RATE_LIMITS = Object.freeze({ tpsLimit: 240 });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupCollisionMatrix3D: setupCollisionMatrix3D };
    } else {
        window.setupCollisionMatrix3D = setupCollisionMatrix3D;
    }

})();
