/* Copyright 2023-2026 by Essam Abadir */

/**
 * run.js — Blackbody experiment CLI runner.
 *
 * Uses MultiSeedRunner + BlackbodyCollector to gather per-tick active quanta
 * across multiple seeds and write aggregated results to data/.
 *
 * Usage:
 *   node run.js                           # 20 seeds × 3000 ticks
 *   node run.js --seeds=2 --ticks=500     # Quick test
 *   node run.js --seeds=1 --ticks=100     # Smoke test
 *   node run.js --verbose                 # Print per-seed progress
 */

'use strict';

const path = require('path');

const { MultiSeedRunner } = require('../../objects/collectors/MultiSeedRunner');
const { DataCollector }   = require('../../objects/collectors/DataCollector');
const { setupBlackbody }  = require('../../objects/setup/setupBlackbody');

// ── CLI argument parsing ─────────────────────────────────────────────

const args = process.argv.slice(2).reduce(function (acc, arg) {
    var parts = arg.split('=');
    var key = parts[0];
    var value = parts.slice(1).join('=');
    if (key.startsWith('--')) {
        acc[key.slice(2)] = value === '' ? 'true' : value;
    }
    return acc;
}, {});

var SEEDS   = parseInt(args.seeds,  10) || 20;
var TICKS   = parseInt(args.ticks,  10) || 3000;
var ENGINE  = args.engine || 'wasm';
var VERBOSE = args.verbose === 'true' || args.verbose === '';

// ── Collector ────────────────────────────────────────────────────────

/**
 * BlackbodyCollector — Records active quanta count each sample tick.
 *
 * The active quanta count inside the oven cavity is the primary observable:
 * it oscillates around the thermostat target (temperature) once equilibrium
 * is reached, with fluctuations that encode the energy spectrum.
 */
function BlackbodyCollector(options) {
    DataCollector.call(this, options);
}

BlackbodyCollector.prototype = Object.create(DataCollector.prototype);
BlackbodyCollector.prototype.constructor = BlackbodyCollector;

BlackbodyCollector.prototype.collectMetrics = function (universe, setupResult) {
    return {
        activeQuanta: DataCollector.getActiveQuanta(universe)
    };
};

// ── Runner ───────────────────────────────────────────────────────────

var runner = new MultiSeedRunner({
    setupFactory:     setupBlackbody,
    setupOptions:     { temperature: 300 },
    collectorClass:   BlackbodyCollector,
    collectorOptions: { sampleInterval: 100 },
    seeds:            SEEDS,
    ticks:            TICKS,
    canvasSize:       { w: 600, h: 400 },
    engine:           ENGINE,
    experimentName:   'blackbody',
    verbose:          VERBOSE
});

console.log('=== EGPT Blackbody Experiment ===');
console.log('Seeds:  ' + SEEDS);
console.log('Ticks:  ' + TICKS);
console.log('Sample: every 100 ticks');
console.log('');

runner.run().then(function (results) {
    var outPath = runner.writeResults(path.join(__dirname, 'data'));
    console.log('');
    console.log('--- Summary ---');
    var s = results.summary;
    if (s.activeQuanta_mean !== undefined) {
        console.log('activeQuanta mean (final tick): ' + s.activeQuanta_mean.toFixed(1));
        console.log('activeQuanta std  (final tick): ' + s.activeQuanta_std.toFixed(1));
        console.log('activeQuanta min  (final tick): ' + s.activeQuanta_min);
        console.log('activeQuanta max  (final tick): ' + s.activeQuanta_max);
    }
    console.log('Results written to: ' + outPath);
    console.log('Done.');
}).catch(function (err) {
    console.error('Fatal error:', err.message || err);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
