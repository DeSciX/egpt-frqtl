/* Copyright 2023-2026 by Essam Abadir */

/**
 * Circuit Basic — Multi-seed CLI runner.
 *
 * Demonstrates Ohm's law emerging from geometric resistance. A battery
 * (emitter + voltage) drives particles through a wire (LargeObject tube)
 * into a resistor (geometric constriction) and out to a sink. With a 4px
 * gap inside a 10px tube, flow rate after the resistor drops by ~60%.
 * No force calculations — resistance IS the geometry.
 *
 * Probes sample density before and after the resistor. The ratio of
 * probe_before_resistor / probe_after_resistor converges to the inverse
 * of the constriction ratio (10px / 4px = 2.5×), confirming Ohm emergence.
 *
 * Usage:
 *   node run.js                           # 20 seeds × 3000 ticks
 *   node run.js --seeds=2 --ticks=500     # Quick smoke test
 *   node run.js --engine=wasm             # Run with WASM engine
 *   node run.js --verbose                 # Per-seed progress
 */

'use strict';

const path = require('path');

// ── Imports ──────────────────────────────────────────────────────────

const { MultiSeedRunner } = require('../../objects/collectors/MultiSeedRunner');
const { DataCollector } = require('../../objects/collectors/DataCollector');
const { setupCircuitBasic } = require('../../objects/setup/setupCircuitBasic');

// ── Argument parsing ─────────────────────────────────────────────────

const args = process.argv.slice(2).reduce(function (acc, arg) {
    var parts = arg.split('=');
    var key = parts[0];
    var value = parts.slice(1).join('=');
    if (key.startsWith('--')) {
        acc[key.slice(2)] = value === '' ? 'true' : value;
    }
    return acc;
}, {});

var SEEDS   = args.seeds   !== undefined ? parseInt(args.seeds, 10)  : 20;
var TICKS   = args.ticks   !== undefined ? parseInt(args.ticks, 10)  : 3000;
var ENGINE  = args.engine  || 'wasm';
var VERBOSE = args.verbose === 'true' || args.verbose === '';

// ── CircuitBasicCollector ────────────────────────────────────────────

/**
 * Collector for the circuit basic experiment.
 *
 * Records per-sample-tick:
 *   activeQuanta            — total particles in the simulation
 *   probe_before_resistor   — density count at probe A (upstream of resistor)
 *   probe_after_resistor    — density count at probe B (downstream of resistor)
 *
 * Probe readings use CircuitProbe.getLastCount(), which returns the count
 * from the most recent queryDensity() call (fired by the experiment tick
 * function registered in setupCircuitBasic).
 */
function CircuitBasicCollector(options) {
    DataCollector.call(this, options);
}

CircuitBasicCollector.prototype = Object.create(DataCollector.prototype);
CircuitBasicCollector.prototype.constructor = CircuitBasicCollector;

/**
 * Collect metrics for a single sample tick.
 *
 * @param {Object} universe - Engine universe instance
 * @param {Object} setupResult - { battery, probes, largeObjects, ... }
 * @returns {Object} Flat metric map
 */
CircuitBasicCollector.prototype.collectMetrics = function (universe, setupResult) {
    var metrics = {
        activeQuanta: DataCollector.getActiveQuanta(universe)
    };

    // Add probe readings if available
    if (setupResult && setupResult.probes) {
        for (var name in setupResult.probes) {
            if (setupResult.probes.hasOwnProperty(name)) {
                metrics['probe_' + name] = setupResult.probes[name].getLastCount();
            }
        }
    }

    return metrics;
};

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
    console.log('=== Circuit Basic Experiment ===');
    console.log('Engine:  ' + ENGINE);
    console.log('Seeds:   ' + SEEDS);
    console.log('Ticks:   ' + TICKS);
    console.log('');
    console.log('Layout:  battery -> wire(10px) -> probeA -> resistor(4px) -> probeB -> sink');
    console.log('Predict: flow ratio probeA/probeB ≈ 2.5× (10/4 constriction)');
    console.log('');

    var runner = new MultiSeedRunner({
        setupFactory:     setupCircuitBasic,
        setupOptions:     {},
        collectorClass:   CircuitBasicCollector,
        collectorOptions: { sampleInterval: 100 },
        seeds:            SEEDS,
        ticks:            TICKS,
        canvasSize:       { w: 600, h: 400 },
        // A circuit is a RESISTIVE MEDIUM: charges have to collide with each other for a
        // constriction to constrict. Everything else takes its published default
        // (EGPTUniverse.CONFIG) — this names only what it means to change.
        universeConfig:   { withInterQuantumCollisions: true },
        engine:           ENGINE,
        verbose:          VERBOSE,
        experimentName:   'circuit_basic'
    });

    var results = await runner.run();

    // Print summary
    var summary = results.summary;
    console.log('--- Summary (final-tick stats across ' + SEEDS + ' seed(s)) ---');

    if (summary.activeQuanta_mean !== undefined) {
        console.log('activeQuanta:         mean=' + summary.activeQuanta_mean.toFixed(1) +
                    '  std=' + summary.activeQuanta_std.toFixed(1) +
                    '  min=' + summary.activeQuanta_min +
                    '  max=' + summary.activeQuanta_max);
    }

    if (summary.probe_before_resistor_mean !== undefined) {
        console.log('probe before resistor: mean=' + summary.probe_before_resistor_mean.toFixed(2) +
                    '  std=' + summary.probe_before_resistor_std.toFixed(2));
    }

    if (summary.probe_after_resistor_mean !== undefined) {
        console.log('probe after resistor:  mean=' + summary.probe_after_resistor_mean.toFixed(2) +
                    '  std=' + summary.probe_after_resistor_std.toFixed(2));
    }

    // Print Ohm ratio
    if (summary.probe_before_resistor_mean !== undefined &&
        summary.probe_after_resistor_mean !== undefined &&
        summary.probe_after_resistor_mean > 0) {
        var ratio = summary.probe_before_resistor_mean / summary.probe_after_resistor_mean;
        console.log('');
        console.log('Observed flow ratio (before/after): ' + ratio.toFixed(2) + 'x');
        console.log('Geometric prediction:               2.50x  (10px / 4px constriction)');
    }

    var outPath = runner.writeResults(path.join(__dirname, 'data'));
    console.log('\nResults written to: ' + outPath);
}

main().catch(function (err) {
    console.error('Fatal error:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
