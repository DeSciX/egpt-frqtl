/* Copyright 2023-2026 by Essam Abadir */

/**
 * setupHalfAdder — the ONE composition home for the half-adder circuit.
 *
 * SUM = A XOR B, CARRY = A AND B. Two `LogicGate`s side by side — the half-adder is two
 * gates WIDE and one level DEEP; neither gate feeds the other, so there is no cascade in
 * this circuit at all (the cascade datum lives in
 * `docs/internal/physics-lab/half-adder-bench/` F4, measured for the FULL adder).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * Composes only already-committed parts and adds NO physics of its own (canonical bench
 * SU1):
 *   1. two `LogicGate`s (`logic:'XOR'` → SUM, `logic:'AND'` → CARRY) at
 *      `LogicGate.MINIMAL`, stacked wall-against-wall;
 *   2. four `Trace` input rails — TWO per logical input, straight, no corners;
 *   3. four `SphereEmitter{laser}` generators, one per rail, all at the SAME rail voltage;
 *   4. two grounded `Trace` stubs — the SUM and CARRY readouts. The stub's own
 *      `getCurrent()`/`getDelivered()` IS the ammeter (it already divides by
 *      `Trace.GROUND_COUNTS_PER_ARRIVAL`); this factory adds no counting and no
 *      calibration of its own.
 *
 * ── DUAL-RAIL IS CONTROL-PLANE FAN-OUT, NOT A SPLIT CURRENT ─────────────────
 * Each logical input drives TWO INDEPENDENT GENERATORS, each at the full rail — one
 * switch boolean, two sources. That is what a driver or a buffer does; the current is
 * never divided. Say it that way in any write-up.
 *
 * The alternative — a physical T-split — was built and MEASURED in B0 and rejected on the
 * numbers (`half-adder-bench/README.md` F1): it conserves at best 0.828 of its input and
 * only 0.471 at this circuit's own lane geometry, its partition moves 7 points per half
 * pixel of divide placement, and a fair 50/50 split of a 6 q/tick rail lands both branches
 * at ~2.4 q/tick — BELOW the measured latch-HIGH floor (~2.8). Dual-rail keeps every input
 * terminal at the full rail with ~7 sd of threshold margin.
 *
 * ── THE LAYOUT RULES THIS FACTORY OBEYS (all B0-measured) ───────────────────
 *  1. EVERY NET IS STRAIGHT. A bore-3 / wall-3 corner passes G = 0.204 (B0 F1a) — a corner
 *     in a signal path is forbidden at this geometry. If a future variant must turn, it
 *     turns on wall-6 geometry (G = 0.754) and the level budget must show the loss.
 *  2. A AND B TREES STAY >= 2 LANE PITCHES APART. Adjacent lanes couple 0.098 q/tick;
 *     at two pitches the dark lane reads 0.000-0.002 (B0 F3). This is why the CARRY gate's
 *     inputs are DELIBERATELY SWAPPED (see `_LANE_PLAN` below) — AND is commutative, so
 *     the swap is free, and it is what keeps the minimum A-to-B separation at two pitches
 *     instead of one.
 *  3. NO COINCIDENT MIRRORS, EVER. Lanes sit at `Trace.lanePitch()` (wall against wall);
 *     two mirror walls on the same pixels leak 31 % and fail SILENTLY.
 *  4. ZERO GEOMETRY LITERALS. Every coordinate is derived from `LogicGate.MINIMAL`,
 *     `LogicGate.cellSize()` and `Trace.lanePitch()`.
 *
 * ── LANE PLAN (why the CARRY gate's inputs are swapped) ──────────────────────
 * A `LogicGate` lays its lanes out A / OUT / B, top to bottom, one `lanePitch` apart. Two
 * gates stacked give six lanes. Feeding both gates' `inPortA` from input A would put XOR's
 * B lane immediately adjacent to AND's A lane — one pitch, the 0.098 q/tick case. Swapping
 * the CARRY gate's two inputs puts the two B rails next to each other instead:
 *
 *      lane  y offset   carries          nearest DIFFERENT-input lane
 *      ────  ────────   ──────────────   ───────────────────────────────
 *        0   +0.5·p     A → XOR.inA      B at +2.5·p  → 2 pitches  OK
 *        1   +1.5·p     SUM (XOR out)    (the gate's own output lane)
 *        2   +2.5·p     B → XOR.inB      A at +0.5·p  → 2 pitches  OK
 *        3   +3.5·p     B → AND.inA      same signal as lane 2 — harmless
 *        4   +4.5·p     CARRY (AND out)  (the gate's own output lane)
 *        5   +5.5·p     A → AND.inB      B at +3.5·p  → 2 pitches  OK
 *
 * Two rails of the SAME input may sit adjacent: they carry the same boolean by
 * construction, so there is nothing to leak. The output lanes sit in the MIDDLE of their
 * own gate by that part's own design, and its published crosstalk figure covers them.
 *
 * @param {Object} universe - a constructed, NOT-yet-init'd EGPTUniverse. This factory IS
 *   the sketch: it inits the world FIRST and then constructs parts (world.init() FIRST →
 *   CONSTRUCT parts → WIRE → RUN), so part construction order is irrelevant. Runs the FAST
 *   PATH (`withInterQuantumCollisions:false`) — the lossless-waveguide regime every `Trace`
 *   and `LogicGate` number is quoted in. Turning inter-quantum collisions ON is RESISTANCE
 *   and voids the whole datasheet.
 * @param {Object} [options]
 * @param {number} [options.left=40] @param {number} [options.top=20] - top-left of the
 *   gate stack, px (the input rails extend to the LEFT of `left`).
 * @param {number} [options.railVoltage=6] - burst per tick on every input rail AND on both
 *   gate supplies. 6 is the STANDARD operating point — every figure in `LogicGate.MEASURED`
 *   was taken there. LIVE via `setRailVoltage`.
 * @param {number} [options.leadLength=24] - input rail length, px. Straight, so it costs
 *   flight time (1 px/tick) and nothing else.
 * @param {number} [options.readoutLength=24] - SUM/CARRY readout stub length, px.
 * @param {boolean} [options.inputA=false] @param {boolean} [options.inputB=false] - the
 *   initial truth-table row.
 * @param {Object} [options.runner] - auto-wire the per-tick fan-out (see `attachToRunner`).
 *
 * @returns {{ gates, rails, readouts, largeObjects, parts,
 *             setInputA, setInputB, getInputA, getInputB, getState,
 *             setRailVoltage, getRailVoltage, getLayout, getSettleBudget, controls,
 *             onTick, attachToRunner, dispose }}
 *   The handle deliberately keeps the V1 names (`setInputA` / `setInputB` / `getState`)
 *   that `setupCircuitSAT.js` exposed, so the rebuilt page's control code keeps its shape
 *   and the diff stays honest.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * ZERO physics of its own. What the knobs do to the running scene is the two parts'
 * behaviour, quoted once in `LogicGate.js` and `Trace.js` and deliberately not restated
 * here. The three numbers a CALLER of this factory needs:
 *
 *   QUIESCENT CURRENT IS NOT A LEAK. Both gate supplies run whether their output is HIGH
 *   or LOW (a LOW output is the rail being dumped into the shunt valve), so even at row
 *   (0,0) the scene carries a NON-ZERO standing population — two gate rails — while the
 *   SUM and CARRY grounds read EXACTLY 0.000. A healthy half-adder looks busy and reads
 *   zero.
 *
 *   SETTLE BUDGET. Every net here is straight, so settling is flight time plus two gate
 *   latencies: `getSettleBudget()` returns it computed from the ACTUAL geometry
 *   (lead + inset + gate window + comparator + valve→outlet + readout + ground gap).
 *   Do not reuse a bench constant — a junction needs >= 1500 ticks, a straight net needs
 *   ~1 tick per px (B0 F1b/F3c).
 *
 *   FRESH UNIVERSE PER TRUTH-TABLE ROW. After an input is switched off, in-flight
 *   population keeps arriving for ~the path length in ticks — and ~2000 ticks per corner
 *   if a route ever has one (B0 F3c). A live-toggle protocol must keep its readout window
 *   clear of that drain; an acceptance rig should build a fresh universe per row.
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

    // ── Imports (Node) / CALL-TIME globals (browser) ──────────────────────────
    // Browser resolution is at CALL time, never module-eval time: these are classic
    // scripts in a roster, and an eval-time capture would make correctness a latent
    // property of list position (the realm failure Tunnel.js documents at length).
    var _LogicGate = null, _Trace = null, _setupSphereEmitter3D = null;
    if (typeof module !== 'undefined' && module.exports) {
        _LogicGate = require('../objects/LogicGate').LogicGate;
        _Trace = require('../objects/Trace').Trace;
        _setupSphereEmitter3D = require('./setupSphereEmitter3D').setupSphereEmitter3D;
    }
    function _get(local, name) {
        return local || (typeof window !== 'undefined' && window[name]) || null;
    }

    /**
     * WHICH GATE PORT EACH LOGICAL INPUT DRIVES — the ONE place the lane plan lives.
     * `port` is the LogicGate port name; the CARRY row's swap is the layout rule, not a
     * typo (AND is commutative, so the swap costs nothing and buys a lane pitch).
     */
    var _LANE_PLAN = [
        { input: 'A', gate: 'SUM', port: 'inPortA' },
        { input: 'B', gate: 'SUM', port: 'inPortB' },
        { input: 'B', gate: 'CARRY', port: 'inPortA' },   // SWAPPED — see the lane plan above
        { input: 'A', gate: 'CARRY', port: 'inPortB' }    // SWAPPED
    ];
    /**
     * OPTIONS — this factory's own option vocabulary: EXACTLY the keys it reads.
     * Exported as `setupHalfAdder.OPTIONS` so a composing caller consumes it instead of
     * retyping it. `setup-factory-option-vocabulary.test.mjs` re-derives the
     * read-set by static trace and fails if this list drifts from the code.
     */
    var OPTIONS = [
        'inputA', 'inputB', 'leadLength', 'left',
        'railVoltage', 'readoutLength', 'runner', 'top',
    ];


    function setupHalfAdder(universe, options) {
        options = _assertSetupOptions('setupHalfAdder', options, OPTIONS);
        var LogicGateCls = _get(_LogicGate, 'LogicGate');
        var TraceCls = _get(_Trace, 'Trace');
        var emitterFactory = _get(_setupSphereEmitter3D, 'setupSphereEmitter3D');
        if (!LogicGateCls || !TraceCls || !emitterFactory) {
            throw new Error('[setupHalfAdder] needs LogicGate.js + Trace.js + ' +
                'setupSphereEmitter3D.js loaded (game-layer roster). (FAIL-LOUD.)');
        }

        // ── GEOMETRY: derived, never typed ───────────────────────────────────
        var MIN = LogicGateCls.MINIMAL;                       // bore 3 / wall 3 / length 20
        var bore = MIN.bore, wt = MIN.wallThickness, len = MIN.length;
        var cell = LogicGateCls.cellSize(bore, wt, len);      // { w, h, pitch, area }
        var pitch = cell.pitch;                               // === Trace.lanePitch(bore, wt)
        var left = options.left !== undefined ? options.left : 40;
        var top = options.top !== undefined ? options.top : 20;
        var railVoltage = options.railVoltage !== undefined ? options.railVoltage : 6;
        var leadLength = options.leadLength !== undefined ? options.leadLength : 24;
        var readoutLength = options.readoutLength !== undefined ? options.readoutLength : 24;
        var inputA = !!options.inputA, inputB = !!options.inputB;

        // ══ STEP 1 — THE WORLD ══════════════════════════════════════════════
        // This factory IS the sketch: init the world FIRST, before any part registers a
        // LargeObject (the engine throws on registration against a fresh universe, and
        // that throw reached every real page once already — see setup-trace-circuit.test).
        var emitterOpts = {
            preset: 'laser', is2D: true, R: 24, orientationDeg: 0,
            emissionBoxSide: 0, fundamentalDimension: 0,
            burstSize: railVoltage, emitEveryTicks: 1, chargeMode: 'random'
        };
        emitterFactory.initWorld(universe, emitterOpts);

        // ══ STEP 2 — THE TWO GATES, STACKED WALL-AGAINST-WALL ═══════════════
        // Each cell carries its own insulation, so the stack is exactly one cell height
        // apart: gate 1's bottom lane centre and gate 2's top lane centre end up one
        // lanePitch apart — NEVER sharing mirror pixels.
        var sum = new LogicGateCls(universe, {
            logic: 'XOR', left: left, top: top, bore: bore, wallThickness: wt, length: len,
            supplyVoltage: railVoltage, name: 'SUM', color: [200, 170, 70]
        });
        var carry = new LogicGateCls(universe, {
            logic: 'AND', left: left, top: top + cell.h, bore: bore, wallThickness: wt,
            length: len, supplyVoltage: railVoltage, name: 'CARRY', color: [170, 200, 90]
        });
        var gates = { SUM: sum, CARRY: carry };

        // ══ STEP 3 — FOUR STRAIGHT INPUT RAILS + FOUR GENERATORS ════════════
        // Two rails per logical input: control-plane fan-out, one boolean over two
        // independent generators. EVERY rail is built at the FULL rail voltage and then
        // switched — a source constructed at burst 0 would be a burstSize-1 emitter, so a
        // later setActive(true) would drive 1 q/tick instead of the rail (B0 instrument
        // fault #1; the A4 idiom is construct at V, then setActive(false)).
        var rails = { A: [], B: [] };
        var emitterResults = [];
        var railTraces = [];
        _LANE_PLAN.forEach(function (planRow, i) {
            var port = gates[planRow.gate][planRow.port];
            var y = port[1];
            var t = new TraceCls(universe, {
                path: [[port[0] - leadLength, y], [port[0], y]],
                bore: bore, wallThickness: wt,
                name: 'rail' + planRow.input + i, color: [90, 120, 200]
            });
            var er = emitterFactory(universe, {
                preset: 'laser', is2D: true, R: 24, orientationDeg: 0,
                emissionBoxSide: 0, fundamentalDimension: 0,
                burstSize: railVoltage, emitEveryTicks: 1, chargeMode: 'random',
                center: [t.inPort[0] + 4, y]      // parked just inside the bore mouth
            });
            er.sphereEmitterControl.setActive(planRow.input === 'A' ? inputA : inputB);
            emitterResults.push(er);
            railTraces.push(t);
            rails[planRow.input].push({ trace: t, control: er.sphereEmitterControl, plan: planRow });
        });

        // ══ STEP 4 — THE TWO READOUTS ═══════════════════════════════════════
        // Grounded Trace stubs. The stub's own getCurrent()/getDelivered() IS the ammeter
        // (it already divides by Trace.GROUND_COUNTS_PER_ARRIVAL) — no second counter and
        // no re-derived calibration anywhere in this file.
        function readout(gate, name) {
            return new TraceCls(universe, {
                path: [[gate.outPort[0], gate.outPort[1]],
                       [gate.outPort[0] + readoutLength, gate.outPort[1]]],
                bore: bore, wallThickness: wt, ground: true, name: name,
                color: [60, 160, 220]
            });
        }
        var readouts = { SUM: readout(sum, 'SUM_out'), CARRY: readout(carry, 'CARRY_out') };

        // Every part that wants a tick, in one list — the ONE fan-out authority below.
        var parts = railTraces.concat([readouts.SUM, readouts.CARRY, sum, carry]);

        // ── THE HANDLE (V1 names preserved) ──────────────────────────────────
        function setRail(which, on) {
            var want = !!on;
            if (which === 'A') { inputA = want; } else { inputB = want; }
            rails[which].forEach(function (r) { r.control.setActive(want); });
            return want;
        }

        var control = {
            setInputA: function (on) { return setRail('A', on); },
            setInputB: function (on) { return setRail('B', on); },
            getInputA: function () { return inputA; },
            getInputB: function () { return inputB; },
            /**
             * The circuit's live readout. Gate booleans come from each gate's OWN
             * `getState()` (the gate consumed its terminals in its own onTick — a second
             * read of the same TickData is a double-consume throw), and the levels come
             * from the grounded readout stubs' own calibrated reader.
             */
            getState: function () {
                var sState = sum.getState(), cState = carry.getState();
                return {
                    A: inputA, B: inputB,
                    SUM: sState.out, CARRY: cState.out,
                    sumLevel: readouts.SUM.getCurrent(),
                    carryLevel: readouts.CARRY.getCurrent(),
                    gateStates: { SUM: sState, CARRY: cState }
                };
            },
            /** LIVE rail knob — moves BOTH gate supplies and all four input generators. */
            setRailVoltage: function (v) {
                railVoltage = Math.max(0, Math.round(v));
                sum.setSupplyVoltage(railVoltage);
                carry.setSupplyVoltage(railVoltage);
                rails.A.concat(rails.B).forEach(function (r) { r.control.setBurstSize(railVoltage); });
                return railVoltage;
            },
            getRailVoltage: function () { return railVoltage; },
            /** The computed layout, so a page or a rig never re-derives a coordinate. */
            getLayout: function () {
                return {
                    left: left, top: top, pitch: pitch, cell: cell,
                    footprint: [left - leadLength, top,
                                leadLength + cell.w + readoutLength + 4, cell.h * 2],
                    lanes: _LANE_PLAN.map(function (p, i) {
                        return { input: p.input, gate: p.gate, port: p.port,
                                 y: gates[p.gate][p.port][1] };
                    }),
                    outputs: { SUM: sum.outPort, CARRY: carry.outPort },
                    minInputSeparationPitches: _minCrossInputSeparation(gates, pitch)
                };
            },
            /**
             * Ticks to settle after a rebuild, computed from the ACTUAL geometry: every
             * net is straight, so it is flight (1 px/tick) + the gate's own latency +
             * its sense window, twice over. Never reuse a bench constant.
             */
            getSettleBudget: function () {
                var M = LogicGateCls.MEASURED;
                var flight = 4 + leadLength                 // emitter inset + input rail
                    + LogicGateCls.VALVE_INSET + readoutLength + 4;   // valve → outlet → ground
                return Math.ceil(flight + 2 * (M.gateLatencyTicks + sum.windowTicks));
            }
        };

        // The standardized descriptor array — declared ONCE, consumed by the page's own
        // sliders AND any host control strip (the established `controls` idiom).
        control.controls = [
            {
                id: 'inputA', label: 'input A', min: 0, max: 1, step: 1, value: inputA ? 1 : 0,
                fmt: function (v) { return v ? '1 (HIGH)' : '0 (LOW)'; },
                get: function () { return control.getInputA() ? 1 : 0; },
                onChange: function (v) { control.setInputA(!!v); }
            },
            {
                id: 'inputB', label: 'input B', min: 0, max: 1, step: 1, value: inputB ? 1 : 0,
                fmt: function (v) { return v ? '1 (HIGH)' : '0 (LOW)'; },
                get: function () { return control.getInputB() ? 1 : 0; },
                onChange: function (v) { control.setInputB(!!v); }
            },
            {
                id: 'railVoltage', label: 'rail (burst/tick)', min: 1, max: 16, step: 1,
                value: railVoltage,
                fmt: function (v) { return String(v) + ' q/tick'; },
                get: function () { return control.getRailVoltage(); },
                onChange: function (v) { control.setRailVoltage(v); }
            }
        ];

        // ── EXACTLY ONE TICK PATH ────────────────────────────────────────────
        // `Wall.getCollisionHistogram` throws if handed the same TickData twice, and both
        // a Trace's ground and a gate's terminals read through it — so wiring
        // attachToRunner AND calling onTick would surface as an opaque double-consume
        // throw from deep inside a part. This flag turns that into a named failure at the
        // call site instead.
        var wired = false, disposed = false;

        var result = {
            gates: gates,
            rails: rails,
            readouts: readouts,
            parts: parts,
            // FrqtlApp.setup() auto-wires this for rendering. Every part publishes its own
            // `largeObjects`; this is a concat, never a hand-listed set of walls.
            largeObjects: parts.reduce(function (acc, p) { return acc.concat(p.largeObjects); }, []),
            /**
             * The ONE per-tick call — every rail, both readouts, both gates, in order.
             * Public for a harness that ticks the universe directly with no runner.
             * @param {Object} tickData - this tick's TickData (from `universe.doTick()`).
             */
            onTick: function (tickData) {
                if (wired) {
                    throw new Error('[setupHalfAdder] the tick path is already wired via ' +
                        'attachToRunner(runner); calling onTick() as well would hand the SAME ' +
                        'TickData to every terminal twice (a double-consume throw). Use ONE of ' +
                        'them. (FAIL-LOUD.)');
                }
                for (var i = 0; i < parts.length; i++) { parts[i].onTick(tickData); }
            },
            /**
             * Subscribe every part to the runner's per-tick fan-out. REQUIRED on a page:
             * nothing in `FrqtlApp` calls a setupResult's `onTick`, so without this the
             * gates never sense and both readouts sit at 0 forever — which looks exactly
             * like a dead circuit. Uses `addTickListener`, the multi-subscriber peer of
             * the page's single `onTick` slot, so it never steals the page's own hook.
             * @param {Object} runner - an FrqtlApp.
             */
            attachToRunner: function (runner) {
                for (var i = 0; i < parts.length; i++) { parts[i].attachToRunner(runner); }
                wired = true;
                return result;
            },
            /**
             * CANONICAL TEARDOWN — the runner calls this before installing the next
             * setupResult, so a rebuild never stacks emitters or walls. Idempotent.
             */
            dispose: function () {
                if (disposed) { return; }
                disposed = true;
                emitterResults.forEach(function (er) {
                    if (er && typeof er.dispose === 'function') { er.dispose(); }
                });
                parts.forEach(function (p) {
                    if (p && typeof p.dispose === 'function') { p.dispose(); }
                });
            }
        };

        // Fold the handle onto the result (the shipped setup-factory shape).
        Object.keys(control).forEach(function (k) { result[k] = control[k]; });
        result.halfAdderControl = control;

        if (options.runner) { result.attachToRunner(options.runner); }
        return result;
    }

    /**
     * Minimum separation, in lane pitches, between any two lanes carrying DIFFERENT
     * primary inputs. The B0 rule is >= 2 (adjacent lanes couple 0.098 q/tick; two pitches
     * measured 0.000-0.002). Computed from the built ports so the rule is checkable rather
     * than merely asserted in a comment.
     * @private
     */
    function _minCrossInputSeparation(gates, pitch) {
        var lanes = _LANE_PLAN.map(function (p) {
            return { input: p.input, y: gates[p.gate][p.port][1] };
        });
        var min = Infinity;
        for (var i = 0; i < lanes.length; i++) {
            for (var j = i + 1; j < lanes.length; j++) {
                if (lanes[i].input === lanes[j].input) { continue; }   // same boolean — nothing to leak
                min = Math.min(min, Math.abs(lanes[i].y - lanes[j].y) / pitch);
            }
        }
        return min;
    }

    /** The lane plan as DATA, so a test (or a layout tool) can assert against it. */
    setupHalfAdder.LANE_PLAN = _LANE_PLAN;
    setupHalfAdder.minCrossInputSeparation = _minCrossInputSeparation;

    setupHalfAdder.OPTIONS = OPTIONS;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { setupHalfAdder: setupHalfAdder };
    } else {
        window.setupHalfAdder = setupHalfAdder;
    }

})();
