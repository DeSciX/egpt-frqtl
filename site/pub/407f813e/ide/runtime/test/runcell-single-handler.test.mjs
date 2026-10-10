/**
 * runcell-single-handler.test.mjs — WS-NOTEBOOK-A1 binding veto #1 regression.
 *
 * Mirrors single-executor.test.mjs. Proves the notebook spine's value-returning
 * Runtime.runCell entry does NOT reintroduce the WS-CODE-SINGLE-RUN stacked-handler
 * bug. Specifically:
 *
 *   1. Defining/calling Runtime.runCell adds NO `run:request` executor — the Bus
 *      `run:request` listener count is unchanged across N init/runCell calls.
 *   2. The existing fire-and-forget lane still runs EXACTLY ONCE per `run:request`
 *      (the single-executor guarantee is preserved alongside runCell).
 *   3. Runtime.runCell value-returns its declared outputs.
 *   4. Runtime.runCell FAIL-LOUDs (ok:false) when a declared output is missing.
 *   5. The kernel FAIL-LOUDs (reject) when a declared input is missing, naming
 *      the producing cell, and does NOT auto-run upstream.
 *
 * Run: node --test lib/shim/runtime/test/runcell-single-handler.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// ── Minimal DOM stubs so the runtime module loads in Node ────────────────────
var _noop = function () {};
var _noEl = { setAttribute: _noop, style: {}, appendChild: _noop };
globalThis.document = {
    readyState: 'complete',
    addEventListener: _noop,
    removeEventListener: _noop,
    getElementById: function () { return null; },
    createElement: function () { return Object.assign({}, _noEl); },
    head: { appendChild: _noop },
    body: { appendChild: _noop }
};
globalThis.window   = globalThis;
globalThis.window._egptWhenEngineReady = null;
globalThis.window._egptMathSdkUrl      = '';

// A no-URL math SDK so runCell's _ensureMathSdk resolves without a network fetch.
// createEgptMathSdk takes precedence over the URL import path (runtime/index.js).
globalThis.window.createEgptMathSdk = function () {
    return Promise.resolve({ __stubSdk: true });
};

const { Bus } = await import(path.join(repoRoot, 'lib/shim/bus.js'));
const { Runtime } = await import(path.join(repoRoot, 'lib/shim/runtime/index.js'));
const { NotebookKernel } = await import(path.join(repoRoot, 'lib/shim/notebook/kernel.js'));

// ── helper: count Bus listeners for an event by probing the bus internals ────
// The Bus has no public listener-count API; we measure executions instead — the
// canonical proof used by single-executor.test.mjs. We additionally assert that
// run:request executions stay at exactly 1 no matter how many runCell calls run.

async function runFireAndForgetOnce() {
    var executionCount = 0;
    function onWrite(payload) {
        if (/^backend: /.test(String(payload.text || ''))) { executionCount++; }
    }
    Bus.on('console:write', onWrite);
    await new Promise(function (resolve) {
        Bus.once('run:result', resolve);
        Bus.emit('run:request', { source: 'frqtl', code: '', fileId: 'test' });
    });
    Bus.off('console:write', onWrite);
    return executionCount;
}

describe('Runtime.runCell — no second Bus executor (WS-NOTEBOOK-A1 veto #1)', function () {

    test('runCell does NOT register a run:request executor — fire-and-forget still runs once', async function () {
        await Runtime.init({});

        // Baseline: exactly one fire-and-forget execution per run:request.
        assert.strictEqual(await runFireAndForgetOnce(), 1,
            'baseline: one run:request executor before any runCell');

        // Call runCell several times — if it added a run:request listener, the
        // next fire-and-forget emit would execute more than once.
        for (var i = 0; i < 5; i++) {
            await Runtime.runCell({ lane: 'math', code: 'return {};', id: 'c' + i, inputs: {}, declaredOutputs: [] });
        }

        assert.strictEqual(await runFireAndForgetOnce(), 1,
            'after 5 runCell calls, the fire-and-forget lane STILL runs exactly once — ' +
            'runCell must add ZERO run:request executors');
    });

    test('repeated init + interleaved runCell keep fire-and-forget at exactly 1 execution', async function () {
        for (var n = 0; n < 3; n++) {
            await Runtime.init({});
            await Runtime.runCell({ lane: 'math', code: 'return {};', id: 'x', inputs: {}, declaredOutputs: [] });
        }
        assert.strictEqual(await runFireAndForgetOnce(), 1,
            'init dedup guard + runCell coexist: still exactly one execution per run:request');
    });

});

describe('Runtime.runCell — value return + output FAIL-LOUD', function () {

    test('value-returns declared outputs from the cell return object', async function () {
        const r = await Runtime.runCell({
            lane: 'math',
            code: 'const sum = inputs.a + inputs.b; return { sum };',
            id: 'c-sum',
            inputs: { a: 2, b: 3 },
            declaredOutputs: ['sum']
        });
        assert.strictEqual(r.ok, true, 'cell should run ok');
        assert.strictEqual(r.outputs.sum, 5, 'declared output `sum` is returned');
    });

    test('FAIL-LOUD (ok:false) when a declared output is missing from the returned object', async function () {
        const r = await Runtime.runCell({
            lane: 'math',
            code: 'return { somethingElse: 1 };',
            id: 'c-missing-out',
            inputs: {},
            declaredOutputs: ['expected']
        });
        assert.strictEqual(r.ok, false, 'missing declared output must FAIL-LOUD (ok:false)');
        assert.match(r.error, /declares output "expected"/, 'error names the missing declared output');
    });

});

describe('NotebookKernel — missing input FAIL-LOUD (no upstream auto-run)', function () {

    test('runCell(consumer) rejects naming the producing cell when an input is unbound', async function () {
        const nb = {
            title: 't', version: '1',
            cells: [
                { type: 'js', lane: 'math', id: 'producer', in: [], out: ['hist'], bind: '', spec: '', body: 'return { hist: 42 };' },
                { type: 'js', lane: 'math', id: 'consumer', in: ['hist'], out: [], bind: '', spec: '', body: 'return {};' }
            ]
        };
        const kernel = new NotebookKernel(nb, { runtime: Runtime, bus: Bus });

        await assert.rejects(
            () => kernel.runCell('consumer'),
            /declares input "hist".*run cell producer first/s,
            'missing input must FAIL-LOUD naming the producer, not auto-run it'
        );

        // The producer must NOT have been auto-run: hist binding stays absent.
        assert.strictEqual(kernel.getBinding('hist'), null, 'upstream was not auto-run');
        kernel.dispose();
    });

    test('kernel produces → consumer resolves the binding across a manual run order', async function () {
        const nb = {
            title: 't', version: '1',
            cells: [
                { type: 'js', lane: 'math', id: 'producer', in: [], out: ['hist'], bind: '', spec: '', body: 'return { hist: 7 };' },
                { type: 'js', lane: 'math', id: 'consumer', in: ['hist'], out: ['doubled'], bind: '', spec: '', body: 'return { doubled: inputs.hist * 2 };' }
            ]
        };
        const kernel = new NotebookKernel(nb, { runtime: Runtime, bus: Bus });

        const p = await kernel.runCell('producer');
        assert.strictEqual(p.ok, true);
        assert.strictEqual(kernel.getBinding('hist').value, 7, 'producer committed hist');
        assert.strictEqual(kernel.getBinding('hist').version, 1, 'first version is 1');

        const c = await kernel.runCell('consumer');
        assert.strictEqual(c.ok, true);
        assert.strictEqual(c.outputs.doubled, 14, 'consumer read the produced binding');
        kernel.dispose();
    });

});
