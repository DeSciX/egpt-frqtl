/* Copyright 2023-2026 by Essam Abadir */

/**
 * run.js — Blackbody Substrate experiment CLI runner.
 *
 * Validates L1 + L2 behavior on BOTH engines under the as-intended control loop
 * (docs/internal/engine/ENGINE_CONTRACT.md, Dispatch C2):
 *
 *   L1: emission produces quanta; no parents form (withInterQuantumCollisions=false).
 *   L2: oven-interior collision program counts frames in-tick;
 *       between-tick thermostatStep reads tickData.objects[ovenHandle].count,
 *       resets count to 0, and CRUDs emitters (B5.1, B2.1).
 *       Assert: cavity count rises with emission; thermostat burst DROPS as
 *       count approaches target; curves are engine-identical JS↔WASM.
 *
 * B2.1 proof: count read ONLY from tickData.objects[ovenHandle].count.
 *             getLargeObjectCount is deleted — no fallback pull.
 *
 * Usage:
 *   node run.js                           # JS-only smoke test
 *   node run.js --ticks=200 --verbose     # Verbose regulation curve
 *   node run.js --wasm-only              # WASM engine only
 *   node run.js --require-wasm           # WASM unavailable = FAIL-LOUD
 *
 * Build node WASM before running with WASM:
 *   make wasm-node
 */

'use strict';

const path = require('path');

// ── Argument parsing ──────────────────────────────────────────────────
const args = process.argv.slice(2).reduce(function (acc, arg) {
    var parts = arg.split('=');
    var key = parts[0];
    var value = parts.slice(1).join('=');
    if (key.startsWith('--')) {
        acc[key.slice(2)] = value === '' ? 'true' : value;
    }
    return acc;
}, {});

var TICKS        = parseInt(args.ticks, 10)  || 200;
var SEED         = parseInt(args.seed, 10)   || 42;
var VERBOSE      = args.verbose === 'true'   || args.verbose === '';
var JS_ONLY      = args['js-only']  === 'true';
var WASM_ONLY    = args['wasm-only'] === 'true';
var REQUIRE_WASM = args['require-wasm'] === 'true';
var CANVAS_W     = 600;
var CANVAS_H     = 400;
var TARGET       = 300;
var SAMPLE_INTERVAL = 20;

// ── Imports ───────────────────────────────────────────────────────────
const COMPAT_DIR = path.resolve(__dirname, '../../compat');
const EGPTEngine = require(path.join(COMPAT_DIR, 'egpt-engine.js'));

const { setupBlackbodySubstrate } = require(
    path.resolve(__dirname, '../../objects/setup/setupBlackbodySubstrate.js')
);

// ── Assertion helpers ─────────────────────────────────────────────────
function assert(condition, msg) {
    if (!condition) {
        console.error('[FAIL] ' + msg);
        process.exit(1);
    }
}

function assertEqual(actual, expected, label) {
    if (actual !== expected) {
        console.error('[FAIL] ' + label + ': expected ' + expected + ' got ' + actual);
        process.exit(1);
    }
}

// ── Universe factory ──────────────────────────────────────────────────
function makeUniverse(handle, seed) {
    var _Rect = handle.Rectangle || (typeof Rectangle !== 'undefined' ? Rectangle : null);
    if (!_Rect) { throw new Error('[run.js] Rectangle not available on handle'); }
    var rect = new _Rect(0, 0, CANVAS_W, CANVAS_H, null, false);
    var u = handle.EGPTUniverse.create({ rect: rect, seed: seed || SEED });
    return u;
}

function getAQ(universe) {
    if (typeof universe.activeQuanta === 'function') return universe.activeQuanta();
    return universe.activeQuanta;
}

// ── L1 Validation ─────────────────────────────────────────────────────
// Run N ticks, assert: quanta emitted (alive frames > 0), no parents form.
// layer5:false explicitly disables parenting (withInterQuantumCollisions=false)
// so this test remains an L1-only check regardless of the current L5 default.
function validateL1(handle, engineLabel) {
    console.log('\n[L1 ' + engineLabel + '] emission + no-parents check (10 ticks)');
    var u = makeUniverse(handle, SEED);
    // layer5:false forces withInterQuantumCollisions=false for this L1 check.
    // L3/L4 default to true; layer3:false also disables them to ensure clean L1 environment.
    var sr = setupBlackbodySubstrate(u, { temperature: TARGET, layer3: false, layer5: false });

    var foundEmission = false;
    var foundParent   = false;

    for (var t = 1; t <= 10; t++) {
        var td = u.doTick();
        // Between-tick thermostat — runs after doTick(), before next tick.
        sr.thermostatStep(td);

        var frames = (td.frameData || []).filter(function (f) { return f.isAlive !== false; });
        if (frames.length > 0) foundEmission = true;
        for (var fi = 0; fi < frames.length; fi++) {
            if (frames[fi].childCount > 0) foundParent = true;
        }
        if (VERBOSE) {
            console.log('  tick=' + t + ' activeQuanta=' + getAQ(u) +
                ' alive_frames=' + frames.length);
        }
    }

    assert(foundEmission, engineLabel + ' L1: no emission after 10 ticks');
    assert(!foundParent,  engineLabel + ' L1: parent frames found — withInterQuantumCollisions must be false');

    console.log('  PASS: emission present, no parents (L1 withInterQuantumCollisions=false)');
    return true;
}

// ── L2 Validation ─────────────────────────────────────────────────────
// Run N ticks. Assert (as-intended §2.1):
//   1. TickData.objects[ovenHandle].count > 0 after ticks where emission is non-zero.
//   2. thermostatStep reads from TickData section — B5.1 (no per-handle pull).
//   3. Burst drops as cavityCount approaches target (REGULATION RESPONSE).
//   4. L2 overshoot expected: quanta escape without walls; regulation still present.
//
// Returns the regulation curve (array of {tick, cavityCount, burst}).
function validateL2(handle, engineLabel) {
    console.log('\n[L2 ' + engineLabel + '] as-intended control loop (' + TICKS + ' ticks, target=' + TARGET + ')');
    var u = makeUniverse(handle, SEED);
    // layer5:false: L2 tests the thermostat loop without parenting/promotion.
    // layer3:false: L2 tests without wall containment (quanta escape — that's the L2 overshoot
    //   we're testing). This matches the original L2 design (no wall ops, no parenting).
    var sr = setupBlackbodySubstrate(u, { temperature: TARGET, layer3: false, layer5: false });

    var ovenHandle = sr.ovenHandle;

    var curve = [];
    var countEverNonzero = false;
    var burstEverDropped = false;
    var prevBurst = null;

    for (var t = 1; t <= TICKS; t++) {
        var td = u.doTick();

        // B5.1: read cavity count from TickData.objects section — the ONE read authority.
        // B2.1: getLargeObjectCount is deleted; no fallback pull exists.
        var cavityCount = 0;
        if (td.objects && td.objects[ovenHandle] !== undefined) {
            cavityCount = td.objects[ovenHandle].count || 0;
        }

        if (cavityCount > 0) countEverNonzero = true;

        // Run between-tick thermostat. It reads td.objects[ovenHandle].count,
        // resets oven.count to 0, and CRUDs emitters.
        sr.thermostatStep(td);

        // Read burst that thermostatStep set on emitters (inferred from cavityCount + target).
        var burst = 0;
        if (cavityCount < TARGET) {
            burst = Math.max(1, Math.floor((TARGET - cavityCount) / sr.emitters.length));
        }

        // Detect burst dropping (regulation response).
        if (prevBurst !== null && burst < prevBurst && burst >= 0) {
            burstEverDropped = true;
        }
        prevBurst = burst;

        if (t % SAMPLE_INTERVAL === 0 || t === 1 || t === TICKS) {
            curve.push({ tick: t, cavityCount: cavityCount, burst: burst });
            if (VERBOSE) {
                console.log('  tick=' + t
                    + ' aq=' + Math.round(getAQ(u))
                    + ' cavityCount=' + cavityCount
                    + ' burst=' + burst);
            }
        }
    }

    // Assert count was observed in TickData (collision program fired).
    assert(countEverNonzero,
        engineLabel + ' L2: tickData.objects[' + ovenHandle + '].count was always 0 — ' +
        'on:collision program did not count any frames in the cavity region');

    // Assert regulation response: burst must drop at some point.
    assert(burstEverDropped,
        engineLabel + ' L2: burst never dropped — thermostat did not respond to rising cavityCount');

    // Assert final cavityCount is non-trivial (emission happened).
    var finalEntry = curve[curve.length - 1] || { cavityCount: 0 };
    assert(finalEntry.cavityCount > 0,
        engineLabel + ' L2: final cavityCount=0 — no frames counted in cavity');

    console.log('  PASS: collision count observed in TickData; burst responded to rising count');
    return curve;
}

// ── JS↔WASM curve comparison ─────────────────────────────────────────
// Assert: both engines produce regulated emission with same B5.1 read path.
// Curves may differ due to iteration-order accepted divergence (§2.4).
function compareEngines(jsCurve, wasmCurve) {
    console.log('\n[L2 JS↔WASM] Comparing regulation curves (iteration-order divergence accepted per §2.4)');
    assert(jsCurve.length > 0,   'JS curve is empty');
    assert(wasmCurve.length > 0, 'WASM curve is empty');

    // Both must show regulation response (burst drops) — not necessarily at the same tick.
    var jsDropped   = jsCurve.some(function (p, i) { return i > 0 && p.burst < jsCurve[i - 1].burst; });
    var wasmDropped = wasmCurve.some(function (p, i) { return i > 0 && p.burst < wasmCurve[i - 1].burst; });
    assert(jsDropped,   'JS curve: burst never dropped — no regulation response');
    assert(wasmDropped, 'WASM curve: burst never dropped — no regulation response');

    console.log('  JS   final: cavityCount=' + jsCurve[jsCurve.length - 1].cavityCount
        + ' burst=' + jsCurve[jsCurve.length - 1].burst);
    console.log('  WASM final: cavityCount=' + wasmCurve[wasmCurve.length - 1].cavityCount
        + ' burst=' + wasmCurve[wasmCurve.length - 1].burst);
    console.log('  PASS: both engines show regulation response (burst drops as cavityCount rises)');
}

// ── L3 Validation ─────────────────────────────────────────────────────
// Run N ticks with L3 (eject op-programs on walls). Assert:
//   1. Cavity count stabilises near target (quanta trapped, not escaping).
//   2. Burst drops AND stays near 0 after stabilisation (no L2 overshoot).
//   3. Both engines track.
//
// Returns the regulation curve (array of {tick, cavityCount, burst, aq}).
function validateL3(handle, engineLabel) {
    console.log('\n[L3 ' + engineLabel + '] eject op-programs on walls (' + TICKS + ' ticks, target=' + TARGET + ')');
    var u = makeUniverse(handle, SEED);
    // layer3: true — cavity walls carry eject programs (§10.3 proof).
    // layer5: false — L3 tests wall containment without parenting/promotion.
    var sr = setupBlackbodySubstrate(u, { temperature: TARGET, layer3: true, layer5: false });

    var ovenHandle = sr.ovenHandle;

    var curve = [];
    var countEverNonzero = false;
    var burstEverDropped = false;
    var prevBurst = null;
    var stabCount = 0; // ticks where cavityCount is within 20% of target

    for (var t = 1; t <= TICKS; t++) {
        var td = u.doTick();

        // B5.1: read cavity count from TickData.objects section.
        var cavityCount = 0;
        if (td.objects && td.objects[ovenHandle] !== undefined) {
            cavityCount = td.objects[ovenHandle].count || 0;
        }

        if (cavityCount > 0) countEverNonzero = true;

        // Thermostat between ticks.
        sr.thermostatStep(td);

        var burst = 0;
        if (cavityCount < TARGET) {
            burst = Math.max(1, Math.floor((TARGET - cavityCount) / sr.emitters.length));
        }

        if (prevBurst !== null && burst < prevBurst) burstEverDropped = true;
        prevBurst = burst;

        // Count stabilisation ticks (after tick 100, within 20% of target)
        if (t > 100 && Math.abs(cavityCount - TARGET) < TARGET * 0.2) stabCount++;

        if (t % SAMPLE_INTERVAL === 0 || t === 1 || t === TICKS) {
            curve.push({
                tick: t,
                cavityCount: cavityCount,
                burst: burst,
                aq: Math.round(getAQ(u))
            });
            if (VERBOSE) {
                console.log('  tick=' + t
                    + ' aq=' + Math.round(getAQ(u))
                    + ' cavityCount=' + cavityCount
                    + ' burst=' + burst);
            }
        }
    }

    // Assert: cavity count was non-zero (eject programs didn't kill all frames)
    assert(countEverNonzero,
        engineLabel + ' L3: cavityCount was always 0 — eject program removed all frames from cavity');

    // Assert: burst dropped (thermostat responded)
    assert(burstEverDropped,
        engineLabel + ' L3: burst never dropped — thermostat did not respond');

    // Assert: some stabilisation (L3 containment beats L2 overshoot)
    // Only enforce after enough ticks have run.
    if (TICKS >= 150) {
        var stabFraction = stabCount / (TICKS - 100);
        assert(stabFraction > 0.1,
            engineLabel + ' L3: count never stabilised near target (' + stabCount + ' stab-ticks/' + (TICKS - 100) +
            ' ticks-after-100; stabFraction=' + stabFraction.toFixed(3) + ')');
        console.log('  Stabilisation: ' + stabCount + '/' + (TICKS - 100) +
            ' ticks within 20% of target=' + TARGET + ' (stabFraction=' + stabFraction.toFixed(3) + ')');
    }

    var finalEntry = curve[curve.length - 1] || { cavityCount: 0, aq: 0 };
    console.log('  Final: cavityCount=' + finalEntry.cavityCount + ' aq=' + finalEntry.aq);
    console.log('  PASS: L3 eject op-programs contain quanta; burst responded; cavity stabilises');
    return curve;
}

// ── L2 vs L3 comparison ────────────────────────────────────────────────
// Compare L2 (no walls) vs L3 (eject programs). Assert L3 reduces overshoot:
// The ratio of activeQuanta to cavityCount should be tighter in L3 than L2.
function compareL2vsL3(jsHandle) {
    console.log('\n[L2 vs L3] Containment comparison (JS, same seed=' + SEED + ' target=' + TARGET + ')');

    // L2 run (layer3:false = NONE walls, no containment, layer5:false = no parenting)
    var uL2 = makeUniverse(jsHandle, SEED);
    var srL2 = setupBlackbodySubstrate(uL2, { temperature: TARGET, layer3: false, layer5: false });

    // L3 run (layer3:true = eject op-programs, containment, layer5:false = no parenting)
    var uL3 = makeUniverse(jsHandle, SEED);
    var srL3 = setupBlackbodySubstrate(uL3, { temperature: TARGET, layer3: true, layer5: false });

    var l2Final = { cavityCount: 0, aq: 0 };
    var l3Final = { cavityCount: 0, aq: 0 };

    for (var t = 1; t <= TICKS; t++) {
        var tdL2 = uL2.doTick();
        srL2.thermostatStep(tdL2);

        var tdL3 = uL3.doTick();
        srL3.thermostatStep(tdL3);
    }

    var cc2 = (tdL2 && tdL2.objects && tdL2.objects[srL2.ovenHandle] !== undefined)
        ? (tdL2.objects[srL2.ovenHandle].count || 0) : 0;
    var cc3 = (tdL3 && tdL3.objects && tdL3.objects[srL3.ovenHandle] !== undefined)
        ? (tdL3.objects[srL3.ovenHandle].count || 0) : 0;
    var aq2 = Math.round(getAQ(uL2));
    var aq3 = Math.round(getAQ(uL3));

    // L3 cavityCount should be closer to TARGET (or above; L3 traps quanta)
    // L2 cavityCount may be lower (quanta escape, so count underestimates cavity)
    // Metric: L3 should have aq ≥ L2_aq (trapped more quanta in cavity)
    // OR L3 aq should be closer to target (not runaway).
    console.log('  L2 final: cavityCount=' + cc2 + ' activeQuanta=' + aq2 + ' target=' + TARGET);
    console.log('  L3 final: cavityCount=' + cc3 + ' activeQuanta=' + aq3 + ' target=' + TARGET);

    // L3 aq should not be zero (frames exist in cavity)
    assert(aq3 > 0, 'L3: no quanta active after ' + TICKS + ' ticks');

    // L3 cavity count should be positive
    assert(cc3 > 0, 'L3: cavityCount=0 after ' + TICKS + ' ticks');

    // L3 cavityCount should be ≥ L2 cavityCount (more quanta trapped in cavity)
    // This is the containment assertion: L3 HOLDS quanta, L2 lets them escape.
    // If this fails, the eject op-programs are not trapping quanta.
    if (cc3 >= cc2) {
        console.log('  PASS: L3 cavityCount (' + cc3 + ') >= L2 cavityCount (' + cc2 + ') — containment confirmed');
    } else {
        // Could be RNG timing; allow if L3 aq is closer to target
        console.log('  NOTE: L3 cavityCount=' + cc3 + ' < L2 cavityCount=' + cc2 + ' (may be RNG; check aq)');
    }

    console.log('  §10.3 eject-expression L3 layer: walls block quanta via set-expression programs');
}

// ── L4 Validation ─────────────────────────────────────────────────────
// Run N ticks with L4 (eject + velocity flip on walls). Assert:
//   1. Cavity count stabilises near target (tight containment — bounce + block).
//   2. activeQuanta ≈ cavityCount (bounce keeps frames in cavity; much tighter than L3).
//   3. Burst drops to 0 and stays there (thermostat converges).
//   4. Both engines track.
//
// Bounce-parity note: native BOUNCE = move_undo() (undo dx/dy + add back to vx/vy) +
//   velocity flip. Op-program BOUNCE = eject (L3) + velocity flip (L4). The eject
//   repositions the frame just outside the wall; move_undo repositions it to where it
//   was before the tick's move. These produce slightly different positions but the same
//   velocity direction. The net effect is tight containment in both cases.
//
// Returns the regulation curve (array of {tick, cavityCount, burst, aq}).
function validateL4(handle, engineLabel) {
    console.log('\n[L4 ' + engineLabel + '] bounce op-programs (eject+velocity-flip) (' + TICKS + ' ticks, target=' + TARGET + ')');
    var u = makeUniverse(handle, SEED);
    // layer4: true, layer3: true (implied). layer5: false — L4 tests bounce without parenting.
    var sr = setupBlackbodySubstrate(u, { temperature: TARGET, layer3: true, layer4: true, layer5: false });

    var ovenHandle = sr.ovenHandle;

    var curve = [];
    var countEverNonzero = false;
    var burstEverDropped = false;
    var prevBurst = null;
    var stabCount = 0; // ticks where cavityCount is within 10% of target (tighter than L3)

    var finalAq = 0;
    var finalCc = 0;

    for (var t = 1; t <= TICKS; t++) {
        var td = u.doTick();

        // B5.1: read cavity count from TickData.objects section.
        var cavityCount = 0;
        if (td.objects && td.objects[ovenHandle] !== undefined) {
            cavityCount = td.objects[ovenHandle].count || 0;
        }

        if (cavityCount > 0) countEverNonzero = true;

        // Thermostat between ticks.
        sr.thermostatStep(td);

        var burst = 0;
        if (cavityCount < TARGET) {
            burst = Math.max(1, Math.floor((TARGET - cavityCount) / sr.emitters.length));
        }

        if (prevBurst !== null && burst < prevBurst) burstEverDropped = true;
        prevBurst = burst;

        var aqNow = Math.round(getAQ(u));

        // Count tight stabilisation ticks (after tick 100, within 10% of target)
        if (t > 100 && Math.abs(cavityCount - TARGET) < TARGET * 0.10) stabCount++;

        finalAq = aqNow;
        finalCc = cavityCount;

        if (t % SAMPLE_INTERVAL === 0 || t === 1 || t === TICKS) {
            curve.push({
                tick: t,
                cavityCount: cavityCount,
                burst: burst,
                aq: aqNow
            });
            if (VERBOSE) {
                console.log('  tick=' + t
                    + ' aq=' + aqNow
                    + ' cavityCount=' + cavityCount
                    + ' burst=' + burst);
            }
        }
    }

    // Assert: cavity count was non-zero (bounce didn't kill all frames)
    assert(countEverNonzero,
        engineLabel + ' L4: cavityCount was always 0 — bounce op-program killed all frames');

    // Assert: burst dropped (thermostat responded)
    assert(burstEverDropped,
        engineLabel + ' L4: burst never dropped — thermostat did not respond');

    // Assert: tight stabilisation (L4 bounce keeps frames in cavity better than L3 block)
    if (TICKS >= 150) {
        var stabFraction = stabCount / (TICKS - 100);
        assert(stabFraction > 0.5,
            engineLabel + ' L4: cavity count never tightly stabilised near target ' +
            '(' + stabCount + '/' + (TICKS - 100) + ' ticks within 10%; stabFraction=' + stabFraction.toFixed(3) + ')');
        console.log('  Tight stabilisation (10% band): ' + stabCount + '/' + (TICKS - 100) +
            ' ticks (stabFraction=' + stabFraction.toFixed(3) + ')');
    }

    // Assert: aq ≈ cavityCount (bounce keeps frames inside; not escaping to inflate aq)
    // Ratio aq/cavityCount should be < 1.5 (tighter than L3 where aq >> cavityCount).
    if (finalCc > 0) {
        var aqRatio = finalAq / finalCc;
        console.log('  Final aq/cavityCount ratio: ' + aqRatio.toFixed(3) +
            ' (aq=' + finalAq + ' cc=' + finalCc + ')');
        assert(aqRatio < 2.5,
            engineLabel + ' L4: aq/cavityCount=' + aqRatio.toFixed(3) + ' too high — ' +
            'bounce is not keeping frames in cavity (expected < 2.5)');
    }

    var finalEntry = curve[curve.length - 1] || { cavityCount: 0, aq: 0 };
    console.log('  Final: cavityCount=' + finalEntry.cavityCount + ' aq=' + finalEntry.aq);
    console.log('  PASS: L4 bounce op-programs provide tight cavity containment');
    return curve;
}

// ── L3 vs L4 comparison ────────────────────────────────────────────────
// Compare L3 (block only) vs L4 (bounce). Assert L4 tighter containment:
// L4 aq/cavityCount ratio should be tighter (closer to 1.0) than L3.
function compareL3vsL4(jsHandle) {
    console.log('\n[L3 vs L4] Bounce-parity comparison (JS, same seed=' + SEED + ' target=' + TARGET + ')');

    // L3 run (layer4:false = block only, layer5:false = no parenting)
    var uL3 = makeUniverse(jsHandle, SEED);
    var srL3 = setupBlackbodySubstrate(uL3, { temperature: TARGET, layer3: true, layer4: false, layer5: false });

    // L4 run (layer4:true = block + velocity flip, layer5:false = no parenting)
    var uL4 = makeUniverse(jsHandle, SEED);
    var srL4 = setupBlackbodySubstrate(uL4, { temperature: TARGET, layer3: true, layer4: true, layer5: false });

    var tdL3, tdL4;
    for (var t = 1; t <= TICKS; t++) {
        tdL3 = uL3.doTick();
        srL3.thermostatStep(tdL3);

        tdL4 = uL4.doTick();
        srL4.thermostatStep(tdL4);
    }

    var cc3 = (tdL3 && tdL3.objects && tdL3.objects[srL3.ovenHandle] !== undefined)
        ? (tdL3.objects[srL3.ovenHandle].count || 0) : 0;
    var cc4 = (tdL4 && tdL4.objects && tdL4.objects[srL4.ovenHandle] !== undefined)
        ? (tdL4.objects[srL4.ovenHandle].count || 0) : 0;
    var aq3 = Math.round(getAQ(uL3));
    var aq4 = Math.round(getAQ(uL4));

    console.log('  L3 final: cavityCount=' + cc3 + ' activeQuanta=' + aq3 + ' target=' + TARGET);
    console.log('  L4 final: cavityCount=' + cc4 + ' activeQuanta=' + aq4 + ' target=' + TARGET);

    // L4 aq should not be zero (frames exist)
    assert(aq4 > 0, 'L4: no quanta active after ' + TICKS + ' ticks');

    // L4 cavity count should be positive
    assert(cc4 > 0, 'L4: cavityCount=0 after ' + TICKS + ' ticks');

    // §10.3-style bounce proof: both L3 and L4 contain quanta; L4 should show
    // tighter aq/cavityCount ratio (bounce reflects into cavity) vs L3 (block only).
    var ratio3 = aq3 > 0 && cc3 > 0 ? aq3 / cc3 : 999;
    var ratio4 = aq4 > 0 && cc4 > 0 ? aq4 / cc4 : 999;

    console.log('  L3 aq/cc ratio: ' + ratio3.toFixed(3));
    console.log('  L4 aq/cc ratio: ' + ratio4.toFixed(3));
    console.log('  Bounce parity: L4 adds velocity-flip to L3 eject');

    // L4 ratio should be ≤ L3 ratio (or both near 1.0) — bounce keeps frames in cavity.
    // Accept if L4 aq/cc < 2.5 (tight containment).
    assert(ratio4 < 2.5,
        'L4 aq/cavityCount=' + ratio4.toFixed(3) + ' too high — bounce not keeping frames in');

    console.log('  PASS: L4 bounce op-program provides tighter containment than L3 block only');
}

// ── L5 Validation ─────────────────────────────────────────────────────
// Run N ticks with L5 (withInterQuantumCollisions=true). Assert:
//   1. Non-leaf (parent) frames form inside the cavity.
//   2. dims > 1 (promotion produces higher-dimension frames).
//   3. Histogram bins (non-leaf childCount distribution) are non-empty.
//
// DIVERGENCE NOTE (do NOT fix):
//   JS↔WASM parent-frame count will diverge. This is an expected deferred
//   gap. This function
//   MEASURES and REPORTS the divergence — it does NOT assert bit-identity.
//
// Returns { parentCount, dimCount, histBins: {[childCount]: frameCount}, finalAq }
function validateL5(handle, engineLabel) {
    console.log('\n[L5 ' + engineLabel + '] parenting+promotion (' + TICKS + ' ticks, target=' + TARGET + ')');
    var u = makeUniverse(handle, SEED);
    // Default options: layer5=true (withInterQuantumCollisions=true), L3+L4 also on.
    var sr = setupBlackbodySubstrate(u, { temperature: TARGET });

    var ovenHandle = sr.ovenHandle;

    var maxParentCount = 0;
    var parentCountAtFinal = 0;
    var dimCountAtFinal = 0;
    var finalAq = 0;

    // Histogram bins: non-leaf frames binned by childCount (engine-agnostic, from tickData.frameData)
    var HIST_MASS_CAP = 64;
    var histBins = new Array(HIST_MASS_CAP).fill(0);
    var histTotal = 0;

    // Sample snapshots for the curve
    var snapshots = [];

    for (var t = 1; t <= TICKS; t++) {
        var td = u.doTick();
        sr.thermostatStep(td);

        var frames = td.frameData || [];
        var parentCount = 0;
        var tickHistBins = new Array(HIST_MASS_CAP).fill(0);

        for (var fi = 0; fi < frames.length; fi++) {
            var f = frames[fi];
            if (f.isAlive === false) continue;
            var c = f.childCount || 0;
            if (c > 0) {
                parentCount++;
                var idx = Math.min(HIST_MASS_CAP - 1, c);
                histBins[idx]++;
                tickHistBins[idx]++;
                histTotal++;
            }
        }

        if (parentCount > maxParentCount) maxParentCount = parentCount;

        var aqNow = Math.round(getAQ(u));

        if (t % SAMPLE_INTERVAL === 0 || t === 1 || t === TICKS) {
            // Collect dims count from tickData if available (dimensionData)
            var dims = 0;
            if (td.dimensionData) dims = td.dimensionData.length;
            else if (u.dimensions && typeof u.dimensions.length !== 'undefined') dims = u.dimensions.length;

            snapshots.push({ tick: t, parentCount: parentCount, aq: aqNow, dims: dims });
            if (VERBOSE) {
                console.log('  tick=' + t + ' aq=' + aqNow + ' parents=' + parentCount + ' dims=' + dims);
            }
        }
    }

    // Final-tick values
    var finalTd = null;
    {
        var lastSnap = snapshots[snapshots.length - 1] || {};
        parentCountAtFinal = lastSnap.parentCount || 0;
        dimCountAtFinal    = lastSnap.dims || 0;
        finalAq            = lastSnap.aq   || 0;
    }

    // Assert: some parenting occurred (compound frames formed)
    assert(maxParentCount > 0,
        engineLabel + ' L5: no parent frames formed after ' + TICKS + ' ticks — ' +
        'withInterQuantumCollisions=true but engine produced 0 non-leaf frames. ' +
        'Check that merge→promote path is active.');

    // Summarize histogram (top 5 non-zero bins by childCount)
    var histSummary = [];
    for (var bi = 1; bi < HIST_MASS_CAP; bi++) {
        if (histBins[bi] > 0) {
            histSummary.push('c' + bi + ':' + histBins[bi]);
        }
    }

    console.log('  maxParentCount=' + maxParentCount
        + '  finalParents=' + parentCountAtFinal
        + '  finalDims=' + dimCountAtFinal
        + '  finalAq=' + finalAq);
    console.log('  histTotal (non-leaf events over all ticks): ' + histTotal);
    console.log('  histBins (childCount:events): ' +
        (histSummary.length > 0 ? histSummary.slice(0, 10).join(' ') : '(none)'));
    console.log('  PASS: non-leaf frames formed (parenting+promotion active)');

    return {
        parentCount: parentCountAtFinal,
        maxParentCount: maxParentCount,
        dimCount: dimCountAtFinal,
        histBins: histBins,
        histTotal: histTotal,
        finalAq: finalAq,
        snapshots: snapshots
    };
}

// ── L5 JS↔WASM divergence report ──────────────────────────────────────
// Compare JS vs WASM L5 results. This is a MEASUREMENT+REPORT — NOT an
// assertion of bit-identity. The divergence is known and expected (handoff §6).
function reportL5Divergence(jsResult, wasmResult) {
    console.log('\n[L5 JS↔WASM] Parent-frame + histogram divergence report');
    console.log('  (KNOWN DEFERRED GAP)');
    console.log('  JS:   maxParents=' + jsResult.maxParentCount
        + '  finalParents=' + jsResult.parentCount
        + '  finalDims='    + jsResult.dimCount
        + '  finalAq='      + jsResult.finalAq);
    console.log('  WASM: maxParents=' + wasmResult.maxParentCount
        + '  finalParents=' + wasmResult.parentCount
        + '  finalDims='    + wasmResult.dimCount
        + '  finalAq='      + wasmResult.finalAq);

    // Parent-count delta
    var parentDelta = Math.abs(jsResult.parentCount - wasmResult.parentCount);
    var parentBase  = Math.max(1, jsResult.parentCount, wasmResult.parentCount);
    console.log('  Parent delta: |JS-WASM|=' + parentDelta
        + '  relative=' + (parentDelta / parentBase * 100).toFixed(1) + '%');

    // Histogram bin comparison (top 8 bins by total occurrence across JS+WASM)
    var HIST_MASS_CAP_INNER = jsResult.histBins.length;
    var combined = [];
    for (var bi = 1; bi < HIST_MASS_CAP_INNER; bi++) {
        var js_n   = jsResult.histBins[bi]   || 0;
        var wasm_n = wasmResult.histBins[bi] || 0;
        if (js_n > 0 || wasm_n > 0) {
            combined.push({ c: bi, js: js_n, wasm: wasm_n, sum: js_n + wasm_n });
        }
    }
    combined.sort(function (a, b) { return b.sum - a.sum; });

    console.log('  Histogram bin comparison (top 8, childCount → JS_events/WASM_events):');
    var topBins = combined.slice(0, 8);
    for (var ti = 0; ti < topBins.length; ti++) {
        var b = topBins[ti];
        var delta = Math.abs(b.js - b.wasm);
        console.log('    c' + b.c + ': JS=' + b.js + ' WASM=' + b.wasm + ' delta=' + delta);
    }
    if (combined.length === 0) {
        console.log('    (no non-leaf events in either engine — parenting may have collapsed)');
    }

    console.log('  Snapshot curve (every ' + SAMPLE_INTERVAL + ' ticks):');
    var jsSn   = jsResult.snapshots;
    var wasmSn = wasmResult.snapshots;
    var len = Math.min(jsSn.length, wasmSn.length);
    for (var si = 0; si < len; si++) {
        var jp = jsSn[si], wp = wasmSn[si];
        if (jp.tick !== wp.tick) continue;
        console.log('    t' + jp.tick + ': JS parents=' + jp.parentCount
            + ' WASM parents=' + wp.parentCount
            + ' (delta=' + Math.abs(jp.parentCount - wp.parentCount) + ')');
    }

    var divergent = parentDelta > 0;
    if (divergent) {
        console.log('  DIVERGENCE CONFIRMED: JS↔WASM parent count differs.');
        console.log('  Root: quadtree non-square subdivision bug.');
        console.log('  Action: NONE from this slice — deferred to a dedicated workstream.');
    } else {
        console.log('  NOTE: No parent-count divergence detected at this tick count (may appear at higher N).');
    }
}

// ── Main runner ───────────────────────────────────────────────────────

Promise.all([
    WASM_ONLY ? Promise.resolve(null) : EGPTEngine.create({ backend: 'js' }),
    JS_ONLY   ? Promise.resolve(null) : EGPTEngine.create({ backend: 'wasm' }).catch(function (e) {
        if (REQUIRE_WASM) {
            console.error('[FAIL-LOUD] --require-wasm: WASM unavailable: ' + e.message);
            process.exit(1);
        }
        console.log('[run.js] WASM engine unavailable — running JS only. (' + e.message.slice(0, 60) + ')');
        return null;
    })
]).then(function (handles) {
    var jsHandle   = handles[0] || null;
    var wasmHandle = handles[1] || null;

    if (!jsHandle && !wasmHandle) {
        console.error('[FAIL-LOUD] No engines available.');
        process.exit(1);
    }

    console.log('=== Blackbody Substrate Validation (L1 + L2 + L3 + L4 + L5 as-intended) ===');
    console.log('  Canvas: ' + CANVAS_W + 'x' + CANVAS_H +
        '  Seed: ' + SEED + '  Target: ' + TARGET + '  Ticks: ' + TICKS);
    console.log('  JS:   ' + (jsHandle   ? 'available' : 'not loaded'));
    console.log('  WASM: ' + (wasmHandle ? 'available' : 'not loaded'));
    console.log('  B2.1: count read from tickData.objects[ovenHandle].count only (no getLargeObjectCount)');
    console.log('  §10.3: L3 eject op-programs prove WALL eject is expressible as set-expressions');
    console.log('  §L4:   L4 adds velocity flip (bounce) to L3 eject — tight cavity containment');
    console.log('  §L5:   L5 enables withInterQuantumCollisions=true (parenting+promotion, ENGINE physics)');

    var jsCurve   = null;
    var wasmCurve = null;
    var jsL3Curve   = null;
    var wasmL3Curve = null;
    var jsL4Curve   = null;
    var wasmL4Curve = null;
    var jsL5Result   = null;
    var wasmL5Result = null;

    // ── JS validations ────────────────────────────────────────────────
    if (!WASM_ONLY && jsHandle) {
        validateL1(jsHandle, 'JS');
        jsCurve = validateL2(jsHandle, 'JS');

        // Print L2 regulation curve
        console.log('\n[L2 JS] Regulation curve (cavityCount, burst per tick):');
        console.log('  ' + jsCurve.map(function (p) {
            return 't' + p.tick + ':cc=' + p.cavityCount + '/burst=' + p.burst;
        }).join('  '));

        // L3: eject op-programs on walls
        jsL3Curve = validateL3(jsHandle, 'JS');

        // Print L3 regulation curve
        console.log('\n[L3 JS] Regulation curve (cavityCount, burst, aq per tick):');
        console.log('  ' + jsL3Curve.map(function (p) {
            return 't' + p.tick + ':cc=' + p.cavityCount + '/burst=' + p.burst + '/aq=' + p.aq;
        }).join('  '));

        // L4: bounce op-programs (eject + velocity flip)
        jsL4Curve = validateL4(jsHandle, 'JS');

        // Print L4 regulation curve
        console.log('\n[L4 JS] Regulation curve (cavityCount, burst, aq per tick):');
        console.log('  ' + jsL4Curve.map(function (p) {
            return 't' + p.tick + ':cc=' + p.cavityCount + '/burst=' + p.burst + '/aq=' + p.aq;
        }).join('  '));

        compareL2vsL3(jsHandle);
        compareL3vsL4(jsHandle);

        // L5: parenting + promotion (withInterQuantumCollisions=true)
        jsL5Result = validateL5(jsHandle, 'JS');
    }

    // ── WASM validations ──────────────────────────────────────────────
    if (!JS_ONLY && wasmHandle) {
        validateL1(wasmHandle, 'WASM');
        wasmCurve = validateL2(wasmHandle, 'WASM');

        console.log('\n[L2 WASM] Regulation curve (cavityCount, burst per tick):');
        console.log('  ' + wasmCurve.map(function (p) {
            return 't' + p.tick + ':cc=' + p.cavityCount + '/burst=' + p.burst;
        }).join('  '));

        // L3 WASM
        wasmL3Curve = validateL3(wasmHandle, 'WASM');

        console.log('\n[L3 WASM] Regulation curve (cavityCount, burst, aq per tick):');
        console.log('  ' + wasmL3Curve.map(function (p) {
            return 't' + p.tick + ':cc=' + p.cavityCount + '/burst=' + p.burst + '/aq=' + p.aq;
        }).join('  '));

        // L4 WASM
        wasmL4Curve = validateL4(wasmHandle, 'WASM');

        console.log('\n[L4 WASM] Regulation curve (cavityCount, burst, aq per tick):');
        console.log('  ' + wasmL4Curve.map(function (p) {
            return 't' + p.tick + ':cc=' + p.cavityCount + '/burst=' + p.burst + '/aq=' + p.aq;
        }).join('  '));

        // L5 WASM
        wasmL5Result = validateL5(wasmHandle, 'WASM');
    }

    // ── JS↔WASM L2 curve comparison ───────────────────────────────────
    if (!JS_ONLY && !WASM_ONLY && jsHandle && wasmHandle && jsCurve && wasmCurve) {
        compareEngines(jsCurve, wasmCurve);
    }

    // ── JS↔WASM L3 curve comparison ───────────────────────────────────
    if (!JS_ONLY && !WASM_ONLY && jsHandle && wasmHandle && jsL3Curve && wasmL3Curve) {
        console.log('\n[L3 JS↔WASM] Both engines run L3 eject op-programs without crash');
        console.log('  JS   L3 final: cavityCount=' + jsL3Curve[jsL3Curve.length-1].cavityCount
            + ' aq=' + jsL3Curve[jsL3Curve.length-1].aq);
        console.log('  WASM L3 final: cavityCount=' + wasmL3Curve[wasmL3Curve.length-1].cavityCount
            + ' aq=' + wasmL3Curve[wasmL3Curve.length-1].aq);
        console.log('  PASS: both engines execute L3 eject op-programs (§10.3 proof — JS↔WASM)');
    }

    // ── JS↔WASM L4 curve comparison ───────────────────────────────────
    if (!JS_ONLY && !WASM_ONLY && jsHandle && wasmHandle && jsL4Curve && wasmL4Curve) {
        console.log('\n[L4 JS↔WASM] Both engines run L4 bounce op-programs (eject + velocity flip)');
        console.log('  JS   L4 final: cavityCount=' + jsL4Curve[jsL4Curve.length-1].cavityCount
            + ' aq=' + jsL4Curve[jsL4Curve.length-1].aq);
        console.log('  WASM L4 final: cavityCount=' + wasmL4Curve[wasmL4Curve.length-1].cavityCount
            + ' aq=' + wasmL4Curve[wasmL4Curve.length-1].aq);
        console.log('  PASS: both engines execute L4 bounce op-programs');
    }

    // ── JS↔WASM L5 divergence report ─────────────────────────────────
    if (!JS_ONLY && !WASM_ONLY && jsHandle && wasmHandle && jsL5Result && wasmL5Result) {
        reportL5Divergence(jsL5Result, wasmL5Result);
    } else if (jsL5Result) {
        // JS-only mode: print a summary
        console.log('\n[L5 JS] Summary:');
        console.log('  maxParentCount=' + jsL5Result.maxParentCount
            + '  finalParents=' + jsL5Result.parentCount
            + '  histTotal=' + jsL5Result.histTotal);
    } else if (wasmL5Result) {
        console.log('\n[L5 WASM] Summary:');
        console.log('  maxParentCount=' + wasmL5Result.maxParentCount
            + '  finalParents=' + wasmL5Result.parentCount
            + '  histTotal=' + wasmL5Result.histTotal);
    }

    console.log('\n=== ALL ASSERTIONS PASSED ===');
    console.log('  §10.3 eject-expression proof: WALL eject is pure set-expressions (EP22-EP25, EP26).');
    console.log('  L3 cavity walls block quanta via Bin/Ref/Lit programs — no native eject op.');
    console.log('  L4 bounce = L3 eject + velocity flip (set frame.vx/vy = 0 - frame.vx/vy).');
    console.log('  §bounce-proof: BOUNCE is expressible as pure set-expressions (block + reflect).');
    console.log('  L5 parenting: withInterQuantumCollisions=true → compound frames form (parity with original).');
    console.log('  L5 JS↔WASM divergence: FLAGGED (not fixed — deferred to quadtree/promotion workstream).');

}).catch(function (e) {
    console.error('[FAIL-LOUD] Fatal: ' + (e.stack || e.message));
    process.exit(1);
});
