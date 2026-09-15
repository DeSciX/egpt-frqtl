/* Copyright 2023-2026 by Essam Abadir */

/**
 * page-params-contract.test.mjs — WS gym-controls-as-sugar Bite 3 item 4.
 *
 * Bidirectional conformance for lib/shim/page-params (the page URL-param
 * contract — FINAL design):
 *
 *   (a) FORWARD — every `forward:true` PAGE_PARAMS entry is actually read by
 *       its declared `reader` file, via `_getPageParams().KEYS.<NAME>` (not a
 *       hand-typed string literal). The reader FILE and the KEYS PROPERTY
 *       NAME are both DERIVED from the table (never a test-side hand map) —
 *       this is the schema-mirror-drift discipline applied to the assertion
 *       itself, not just the production code.
 *   (b) REVERSE — no script in the `_shared` page-boot surface reads a raw
 *       `.get('literal')` URL param that is NOT registered in
 *       PAGE_PARAMS ∪ HOST_TOKENS (comment-stripped source scan). A raw
 *       literal here would be an un-contracted param silently bypassing the
 *       single-owner table.
 *   (c) buildExperimentFrameSrc forwards EXACTLY FORWARDABLE_PARAMS — table-
 *       driven (iterates the exported list, not a hand-typed expectation)
 *       plus a decoy param (`preset`, a real host-only param) that must NEVER
 *       leak through.
 *   (d) every `forward:false` entry (in both PAGE_PARAMS and HOST_TOKENS) has
 *       a non-empty `why`.
 *   (e) HOST_TOKENS "chrome"'s `acceptedValues` (WS gym-controls-as-sugar
 *       Bite 4 closing micro-batch) matches stack-boot.js's own `_applyChrome()`
 *       IIFE literal exactly — that IIFE cannot live-import (runs before any
 *       `<script>` tag loads, see the entry's own `why`), so it is a LITERAL
 *       held to the canonical list via THIS parity test (mirrors the GAME
 *       array vs. game-layer-manifest.js precedent — game-layer-manifest.test.mjs).
 *
 * Run: node --test lib/shim/page-params/test/page-params-contract.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');
const require   = createRequire(import.meta.url);

const PageParams = require(path.join(repoRoot, 'lib/shim/page-params/index.js'));
const { PAGE_PARAMS, HOST_TOKENS, FORWARDABLE_PARAMS, KEYS } = PageParams;

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(function (line) { return line.replace(/\/\/.*$/, ''); })
        .join('\n');
}

function readFile(relPath) {
    return readFileSync(path.join(repoRoot, relPath), 'utf8');
}

// Invert KEYS (value -> property name) once — DERIVED from the exported
// table, never a hand-typed reverse map.
function _keysPropNameFor(value) {
    var name = Object.keys(KEYS).find(function (k) { return KEYS[k] === value; });
    if (!name) {
        throw new Error('[test] no KEYS property maps to value "' + value + '" — PAGE_PARAMS/KEYS have drifted apart.');
    }
    return name;
}

describe('page-params contract (a) — FORWARD: every forward:true entry is read by its declared reader', function () {
    PAGE_PARAMS.filter(function (p) { return p.forward; }).forEach(function (entry) {
        test('"' + entry.key + '" is read via _getPageParams().KEYS.' + _keysPropNameFor(entry.key) + ' in ' + entry.reader, function () {
            const src = stripComments(readFile(entry.reader));
            const propName = _keysPropNameFor(entry.key);
            const pattern = new RegExp('_getPageParams\\(\\)\\.KEYS\\.' + propName + '\\b');
            assert.ok(pattern.test(src),
                entry.reader + ' must read the "' + entry.key + '" URL param via ' +
                '_getPageParams().KEYS.' + propName + ' (the single-owner contract), ' +
                'not a hand-typed string literal.');
        });
    });
});

describe('page-params contract (a) — FORWARD: the forward:false entry (engine) is ALSO read via the contract (key-name-only, never forwarded)', function () {
    PAGE_PARAMS.filter(function (p) { return !p.forward; }).forEach(function (entry) {
        test('"' + entry.key + '" is read via _getPageParams().KEYS.' + _keysPropNameFor(entry.key) + ' in ' + entry.reader, function () {
            const src = stripComments(readFile(entry.reader));
            const propName = _keysPropNameFor(entry.key);
            const pattern = new RegExp('_getPageParams\\(\\)\\.KEYS\\.' + propName + '\\b');
            assert.ok(pattern.test(src),
                entry.reader + ' must read the "' + entry.key + '" URL param KEY NAME via ' +
                '_getPageParams().KEYS.' + propName + ' even though it is never forwarded ' +
                '(the key name is still single-sourced).');
        });
    });
});

describe('page-params contract (b) — REVERSE: no un-contracted raw URL-param literal on the _shared page-boot surface', function () {
    // "the page-script surface" this contract governs = lib/frqtl/experiments/
    // _shared/*.js (the ONE shared boot chain every canonical experiment page
    // runs — stack-boot -> engine-boot -> render-boot -> fx-experiment).
    const SHARED_DIR = 'lib/frqtl/experiments/_shared';
    const files = [
        'stack-boot.js', 'engine-boot.js', 'render-boot.js', 'fx-experiment.js'
    ];
    const registeredKeys = PAGE_PARAMS.map(function (p) { return p.key; })
        .concat(HOST_TOKENS.map(function (h) { return h.key; }));

    files.forEach(function (fname) {
        test(SHARED_DIR + '/' + fname + ': every raw `.get(\'literal\')` URL-param read names a key in PAGE_PARAMS ∪ HOST_TOKENS', function () {
            const src = stripComments(readFile(SHARED_DIR + '/' + fname));
            const re = /\.get\(\s*['"]([^'"]+)['"]\s*\)/g;
            let m;
            let found = 0;
            while ((m = re.exec(src)) !== null) {
                found++;
                assert.ok(registeredKeys.indexOf(m[1]) !== -1,
                    fname + ' reads raw URL param "' + m[1] + '" via a hand-typed string ' +
                    'literal — it must be registered in PAGE_PARAMS or HOST_TOKENS (and read ' +
                    'via the contract\'s KEYS, not a literal) or added to the contract.');
            }
            // Not asserting found > 0 — a file may legitimately have zero raw
            // literal .get() calls (e.g. fx-experiment.js, whose reads all go
            // through _getPageParams().KEYS.*). The assertion IS the loop body:
            // every literal that DOES exist must be a registered/exempt key.
            void found;
        });
    });

    // ── Architect hardening (Bite 3 fix-loop, non-blocking, 2026-07-04): widen
    // the glob to ALSO cover every canonical experiment's own `index.html`
    // inline <script> content — zero matches today (every experiment page
    // delegates its URL-param reads to the _shared boot chain above; none
    // reads a raw literal itself), but future-proofs against a page ever
    // adding its own ad hoc `.get('someParam')` outside the contract. ──────────
    function listExperimentIndexHtmlFiles() {
        const experimentsDir = path.join(repoRoot, 'lib/frqtl/experiments');
        const out = [];
        for (const entry of readdirSync(experimentsDir)) {
            if (entry === '_shared') { continue; }
            const dir = path.join(experimentsDir, entry);
            if (!statSync(dir).isDirectory()) { continue; }
            const htmlPath = path.join(dir, 'index.html');
            try {
                if (statSync(htmlPath).isFile()) { out.push('lib/frqtl/experiments/' + entry + '/index.html'); }
            } catch (e) { /* no index.html in this dir — skip */ }
        }
        return out;
    }

    function extractInlineScripts(html) {
        const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
        let m;
        const out = [];
        while ((m = re.exec(html)) !== null) { out.push(m[1]); }
        return out.join('\n');
    }

    const experimentHtmlFiles = listExperimentIndexHtmlFiles();

    test('sanity: the experiment-page glob actually found pages to scan (not vacuously empty)', function () {
        assert.ok(experimentHtmlFiles.length > 5, 'expected multiple canonical experiment index.html files under lib/frqtl/experiments/');
    });

    experimentHtmlFiles.forEach(function (relPath) {
        test(relPath + ': every raw `.get(\'literal\')` URL-param read in its inline <script> names a key in PAGE_PARAMS ∪ HOST_TOKENS', function () {
            const html = readFile(relPath);
            const inline = stripComments(extractInlineScripts(html));
            const re = /\.get\(\s*['"]([^'"]+)['"]\s*\)/g;
            let m;
            while ((m = re.exec(inline)) !== null) {
                assert.ok(registeredKeys.indexOf(m[1]) !== -1,
                    relPath + ' reads raw URL param "' + m[1] + '" via a hand-typed string literal ' +
                    'in its own inline <script> — it must be registered in PAGE_PARAMS or HOST_TOKENS ' +
                    '(and read via the contract\'s KEYS, not a literal) or added to the contract.');
            }
        });
    });
});

describe('page-params contract (c) — buildExperimentFrameSrc forwards EXACTLY FORWARDABLE_PARAMS', function () {
    test('table-driven: every FORWARDABLE_PARAMS key present in the outer URL is forwarded', async function () {
        // presets.js reads window.PageParams lazily (a side-effect import +
        // window-global read, NOT a default import — see presets.js's own
        // docstring / the Bite-3 fix-loop). Shim it before calling
        // buildExperimentFrameSrc, exactly as lib/features/ide/test/
        // frame-src.test.mjs does.
        global.window = global.window || globalThis;
        global.window.PageParams = PageParams;
        const { buildExperimentFrameSrc } = await import(path.join(repoRoot, 'lib/features/ide/presets.js'));
        const outerParams = new URLSearchParams();
        FORWARDABLE_PARAMS.forEach(function (key, i) { outerParams.set(key, 'v' + i); });
        // Decoy: a real host-only param that must NEVER leak into the iframe src.
        outerParams.set('preset', 'compare');
        // Decoy: chrome — a HOST_TOKENS entry, never a PAGE_PARAMS entry —
        // must never leak either (the pre-existing GYM-chrome ruling).
        outerParams.set('chrome', 'canvas');

        const url = buildExperimentFrameSrc('/frqtl/experiments', 'tunnel-lab', 'wasm', '?' + outerParams.toString());

        FORWARDABLE_PARAMS.forEach(function (key, i) {
            assert.ok(url.includes(key + '=v' + i), 'forwards "' + key + '" from FORWARDABLE_PARAMS');
        });
        assert.ok(!url.includes('preset='), 'decoy host-only param "preset" is never forwarded');
        assert.ok(!url.includes('chrome='), 'decoy HOST_TOKENS param "chrome" is never forwarded');
    });

    test('FORWARDABLE_PARAMS is exactly the forward:true subset of PAGE_PARAMS, in table order', function () {
        const expected = PAGE_PARAMS.filter(function (p) { return p.forward; }).map(function (p) { return p.key; });
        assert.deepEqual(FORWARDABLE_PARAMS, expected);
    });
});

describe('page-params contract (d) — every forward:false entry has a non-empty why', function () {
    PAGE_PARAMS.filter(function (p) { return !p.forward; }).forEach(function (entry) {
        test('PAGE_PARAMS "' + entry.key + '" (forward:false) has a non-empty why', function () {
            assert.equal(typeof entry.why, 'string');
            assert.ok(entry.why.trim().length > 0, 'why must be a non-empty explanation');
        });
    });

    HOST_TOKENS.forEach(function (entry) {
        test('HOST_TOKENS "' + entry.key + '" (forward:false structurally) has a non-empty why', function () {
            assert.equal(entry.forward, false, 'every HOST_TOKENS entry is forward:false by definition');
            assert.equal(typeof entry.why, 'string');
            assert.ok(entry.why.trim().length > 0, 'why must be a non-empty explanation');
        });
    });
});

describe('page-params contract (e) — HOST_TOKENS "chrome".acceptedValues parity with stack-boot.js\'s literal IIFE', function () {
    const chromeEntry = HOST_TOKENS.filter(function (h) { return h.key === 'chrome'; })[0];

    test('HOST_TOKENS has a "chrome" entry with a non-empty acceptedValues array', function () {
        assert.ok(chromeEntry, 'HOST_TOKENS must declare a "chrome" entry');
        assert.ok(Array.isArray(chromeEntry.acceptedValues) && chromeEntry.acceptedValues.length > 0,
            'chrome.acceptedValues must be a non-empty array');
    });

    test('stack-boot.js\'s _applyChrome() IIFE compares chrome against EXACTLY acceptedValues (no more, no fewer)', function () {
        const stackBootSrc = stripComments(
            readFileSync(path.join(repoRoot, 'lib/frqtl/experiments/_shared/stack-boot.js'), 'utf8'));
        // Extract every `chrome === '<value>'` literal comparison inside _applyChrome().
        const matches = [...stackBootSrc.matchAll(/chrome\s*===\s*'([^']+)'/g)].map(function (m) { return m[1]; });
        assert.deepEqual(
            matches,
            chromeEntry.acceptedValues.slice(),
            'stack-boot.js\'s _applyChrome() literal comparisons diverged from HOST_TOKENS chrome.acceptedValues ' +
            '— update stack-boot.js\'s IIFE (it cannot live-import this list) to match the canonical vocabulary.\n' +
            'stack-boot.js compares against: ' + JSON.stringify(matches) + '\n' +
            'HOST_TOKENS declares:           ' + JSON.stringify(chromeEntry.acceptedValues)
        );
    });
});
