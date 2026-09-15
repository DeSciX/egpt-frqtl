#!/usr/bin/env node
/* Copyright 2023-2026 by Essam Abadir */

/**
 * Experiment Screenshot Capture — Headless browser visual capture.
 *
 * Loads an experiment's index.html in a headless browser, lets the simulation
 * run for a specified number of seconds, then captures a screenshot.
 *
 * The screenshot serves as visual cross-validation for the paper: the reader
 * sees exactly what they will see when they run the experiment themselves.
 *
 * Usage:
 *   node capture-screenshot.js --experiment=blackbody
 *   node capture-screenshot.js --experiment=circuit-sat --wait=30 --out=paper/screenshot.png
 *   node capture-screenshot.js --experiment=blackbody --wait=60 --width=1200 --height=800
 *
 * Options:
 *   --experiment   Experiment directory name (required)
 *   --wait         Seconds to let simulation run before capture (default: 30)
 *   --out          Output path relative to experiment dir (default: paper/screenshot.png)
 *   --width        Viewport width (default: 1200)
 *   --height       Viewport height (default: 900)
 *   --full         Capture full page, not just viewport (default: false)
 *   --all          Capture all experiments sequentially
 *   --series       Capture multiple screenshots at intervals: --series=10,20,30,60
 *                  (seconds at which to capture, saves as screenshot_10s.png, etc.)
 *
 * Requires: puppeteer (npm install --save-dev puppeteer)
 *
 * How it works:
 *   1. Starts a local HTTP server serving the repo root
 *   2. Opens headless Chrome at the experiment's index.html
 *   3. Waits for the simulation to run (wall-clock seconds)
 *   4. Captures PNG screenshot
 *   5. Shuts down
 *
 * The server is necessary because P5.js and ES modules require HTTP, not file:// URLs.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');

// ── CLI arguments ────────────────────────────────────────────────────

const args = process.argv.slice(2).reduce(function (acc, arg) {
    var parts = arg.split('=');
    if (parts[0].startsWith('--')) {
        acc[parts[0].slice(2)] = parts.slice(1).join('=') || 'true';
    }
    return acc;
}, {});

const EXPERIMENT = args.experiment || null;
const WAIT_SECS  = parseInt(args.wait, 10) || 30;
const OUT_PATH   = args.out || 'paper/screenshot.png';
const WIDTH      = parseInt(args.width, 10) || 1200;
const HEIGHT     = parseInt(args.height, 10) || 900;
const FULL_PAGE  = args.full === 'true';
const ALL        = args.all === 'true';
const SERIES     = args.series ? args.series.split(',').map(Number) : null;

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const EXPERIMENTS_DIR = path.resolve(__dirname, '..');

// Known experiments
const KNOWN_EXPERIMENTS = [
    'blackbody',
    'circuit-basic',
    'circuit-sat'
];

// ── Simple static file server ────────────────────────────────────────

function createServer(root) {
    var mimeTypes = {
        '.html': 'text/html',
        '.js':   'application/javascript',
        '.css':  'text/css',
        '.json': 'application/json',
        '.png':  'image/png',
        '.jpg':  'image/jpeg',
        '.svg':  'image/svg+xml',
        '.wasm': 'application/wasm'
    };

    return http.createServer(function (req, res) {
        var url = req.url.split('?')[0];
        if (url === '/') url = '/index.html';
        var filePath = path.join(root, url);

        // Security: prevent path traversal
        if (!filePath.startsWith(root)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }

        fs.readFile(filePath, function (err, data) {
            if (err) {
                res.writeHead(404);
                res.end('Not found: ' + url);
                return;
            }
            var ext = path.extname(filePath).toLowerCase();
            var mime = mimeTypes[ext] || 'application/octet-stream';
            res.writeHead(200, { 'Content-Type': mime });
            res.end(data);
        });
    });
}

// ── Screenshot capture ───────────────────────────────────────────────

async function captureExperiment(experimentName, waitSecs, outPath, series) {
    var puppeteer;
    try {
        puppeteer = require('puppeteer');
    } catch (e) {
        console.error('Puppeteer not installed. Run: npm install --save-dev puppeteer');
        process.exit(1);
    }

    var experimentDir = path.join(EXPERIMENTS_DIR, experimentName);
    var indexFile = path.join(experimentDir, 'index.html');

    if (!fs.existsSync(indexFile)) {
        console.error('Experiment not found: ' + indexFile);
        return false;
    }

    // Start server
    var server = createServer(REPO_ROOT);
    await new Promise(function (resolve) { server.listen(0, '127.0.0.1', resolve); });
    var port = server.address().port;

    // Construct URL — the index.html path relative to repo root
    var relPath = path.relative(REPO_ROOT, indexFile).replace(/\\/g, '/');
    var url = 'http://127.0.0.1:' + port + '/' + relPath;

    console.log('  Loading: ' + url);

    var browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
    });

    try {
        var page = await browser.newPage();
        await page.setViewport({ width: WIDTH, height: HEIGHT });

        // Navigate and wait for initial load
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

        // Auto-start: click Play button if simulation starts paused
        // Try common button selectors used across experiment index.html files
        await page.evaluate(function () {
            // Try clicking a Play button
            var playBtn = document.getElementById('btn-play') ||
                          document.querySelector('.toggle-btn') ||
                          document.querySelector('button');
            if (playBtn && /play/i.test(playBtn.textContent)) {
                playBtn.click();
            }
            // Also try calling loop() directly if P5.js is present
            if (typeof loop === 'function') {
                try { loop(); } catch (e) { /* ignore */ }
            }
        });
        // Brief pause to let the first frame render
        await new Promise(function (r) { setTimeout(r, 500); });

        if (series && series.length > 0) {
            // Series mode: capture at multiple time points
            var elapsed = 0;
            for (var i = 0; i < series.length; i++) {
                var targetSecs = series[i];
                var waitMore = targetSecs - elapsed;
                if (waitMore > 0) {
                    process.stdout.write('  Waiting ' + waitMore + 's (to t=' + targetSecs + 's)...');
                    await new Promise(function (r) { setTimeout(r, waitMore * 1000); });
                    console.log(' done.');
                }
                elapsed = targetSecs;

                var seriesOut = outPath.replace('.png', '_' + targetSecs + 's.png');
                var fullOut = path.join(experimentDir, seriesOut);
                var outDir = path.dirname(fullOut);
                if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

                await page.screenshot({ path: fullOut, fullPage: FULL_PAGE });
                console.log('  Captured: ' + seriesOut + ' (t=' + targetSecs + 's)');
            }
        } else {
            // Single capture mode
            process.stdout.write('  Running simulation for ' + waitSecs + 's...');
            await new Promise(function (r) { setTimeout(r, waitSecs * 1000); });
            console.log(' done.');

            var fullOut = path.join(experimentDir, outPath);
            var outDir = path.dirname(fullOut);
            if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

            await page.screenshot({ path: fullOut, fullPage: FULL_PAGE });
            console.log('  Captured: ' + outPath);
        }

        return true;
    } finally {
        await browser.close();
        server.close();
    }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  Experiment Screenshot Capture                        ║');
    console.log('╚══════════════════════════════════════════════════════╝');
    console.log('');

    var experiments = [];

    if (ALL) {
        experiments = KNOWN_EXPERIMENTS.filter(function (name) {
            return fs.existsSync(path.join(EXPERIMENTS_DIR, name, 'index.html'));
        });
        console.log('Capturing all experiments: ' + experiments.join(', '));
    } else if (EXPERIMENT) {
        experiments = [EXPERIMENT];
    } else {
        console.error('Usage: node capture-screenshot.js --experiment=<name>');
        console.error('       node capture-screenshot.js --all');
        console.error('');
        console.error('Available experiments:');
        KNOWN_EXPERIMENTS.forEach(function (name) {
            var exists = fs.existsSync(path.join(EXPERIMENTS_DIR, name, 'index.html'));
            console.error('  ' + (exists ? '✓' : '✗') + ' ' + name);
        });
        process.exit(1);
    }

    console.log('Viewport: ' + WIDTH + 'x' + HEIGHT);
    console.log('Wait: ' + WAIT_SECS + 's' + (SERIES ? ' (series: ' + SERIES.join(',') + 's)' : ''));
    console.log('');

    var success = 0;
    for (var i = 0; i < experiments.length; i++) {
        var name = experiments[i];
        console.log('[' + (i + 1) + '/' + experiments.length + '] ' + name);

        try {
            var ok = await captureExperiment(name, WAIT_SECS, OUT_PATH, SERIES);
            if (ok) success++;
        } catch (err) {
            console.error('  ERROR: ' + err.message);
        }
        console.log('');
    }

    console.log('Done. ' + success + '/' + experiments.length + ' captured.');
}

main().catch(function (err) {
    console.error('Fatal: ' + err.message);
    if (err.stack) console.error(err.stack);
    process.exit(1);
});
