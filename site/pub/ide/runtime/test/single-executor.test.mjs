/**
 * single-executor.test.mjs — P1 regression test for WS-CODE-SINGLE-RUN.
 *
 * Asserts that exactly ONE execution occurs per Bus 'run:request' regardless of
 * how many times Runtime.init() has been called (double-mount via React StrictMode,
 * preset switch remounts, IdeEmbed ideKey remounts, etc.).
 *
 * Root cause being guarded: Runtime.init() registered a new Bus listener on every
 * call without removing the previous one, so N init calls → N executions per
 * run:request.
 *
 * Run: node --test lib/shim/runtime/test/single-executor.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// ── Minimal DOM stubs so runtime module loads in Node ────────────────────────
// document is required by lib/egpt/js/model/core/DebugLogger.js at module load.
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

// ── Import the shim modules (ESM) ────────────────────────────────────────────

// Bus is a standalone module — import fresh.
const { Bus } = await import(
    path.join(repoRoot, 'lib/shim/bus.js')
);

// Runtime module-level state is shared across imports in a single process.
// We import it once and call init() repeatedly.
const { Runtime } = await import(
    path.join(repoRoot, 'lib/shim/runtime/index.js')
);

// ── Helper: count how many times the backend-header is printed ───────────────
//
// P2 emits "backend: <id>" once per actual execution inside run().
// Multiple registrations of the run:request handler would each call run(),
// each emitting the header → N headers = N executions.

async function countExecutions(initCallCount) {
    // Call init() N times to simulate repeated mounts.
    // In Node: window._egptWhenEngineReady is null → the else-branch fires and
    // resolves synchronously without waiting for an engine.
    for (var i = 0; i < initCallCount; i++) {
        await Runtime.init({});
    }

    var executionCount = 0;
    var headerPattern  = /^backend: /;
    function onWrite(payload) {
        if (headerPattern.test(String(payload.text || ''))) { executionCount++; }
    }
    Bus.on('console:write', onWrite);

    // Emit run:request and wait for run:result (run() is synchronous for source:'frqtl').
    await new Promise(function (resolve) {
        Bus.once('run:result', resolve);
        Bus.emit('run:request', { source: 'frqtl', code: '', fileId: 'test' });
    });

    Bus.off('console:write', onWrite);
    return executionCount;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Runtime single-executor contract (WS-CODE-SINGLE-RUN P1)', function () {

    test('1 init => exactly 1 execution per run:request', async function () {
        const count = await countExecutions(1);
        assert.strictEqual(count, 1,
            'Expected 1 execution but got ' + count +
            ' — Runtime.init() must register exactly one run:request executor');
    });

    test('2 inits (StrictMode double-mount) => still exactly 1 execution', async function () {
        const count = await countExecutions(2);
        assert.strictEqual(count, 1,
            'Expected 1 execution after 2 inits but got ' + count +
            ' — duplicate Bus.on registrations must be deduped by _runRequestHandler guard');
    });

    test('5 inits (repeated remounts) => still exactly 1 execution', async function () {
        const count = await countExecutions(5);
        assert.strictEqual(count, 1,
            'Expected 1 execution after 5 inits but got ' + count +
            ' — executor accumulation must not occur regardless of remount count');
    });

});
