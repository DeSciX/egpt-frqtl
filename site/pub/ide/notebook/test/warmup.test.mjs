/**
 * warmup.test.mjs — WS-NOTEBOOK-BASELINE FIX B. The PURE warm-up-before-derive helper.
 * NO browser / vite / VSCode: a fake handle whose detector ACCUMULATES one count per
 * step proves (a) the realm is stepped the DECLARED number of ticks and (b) the derive
 * runs AFTER the warmup (so the histogram is non-empty), mirroring the in-realm seam.
 *
 * Run: node --test lib/shim/notebook/test/warmup.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { warmUpRealm, resolveWarmupTicks } = await import(path.join(repoRoot, 'lib/shim/notebook/warmup.js'));
const { deriveProducedBindings } = await import(path.join(repoRoot, 'lib/shim/notebook/produced-bindings.js'));

/* A fake frozen-handle whose detector accumulates ONE count per step() — the
 * essential dynamic the bug exposed: at tick 0 the histogram is empty; only after the
 * realm advances does it carry data. ASYNC-shaped (Promises) like the real handle. */
function makeAccumulatingHandle() {
    let ticks = 0;
    let stepCalls = 0;
    return {
        _ticks: () => ticks,
        _stepCalls: () => stepCalls,
        step() { stepCalls += 1; ticks += 1; return Promise.resolve({ tick: ticks, detector: { '0': ticks } }); },
        // detectorHistogram reflects the CURRENT accumulated state (empty until stepped).
        call(fn) {
            if (fn === 'detectorHistogram') { return Promise.resolve(ticks > 0 ? { '0': ticks } : {}); }
            return Promise.reject(new Error('unknown ' + fn));
        }
    };
}

/* ── resolveWarmupTicks ─────────────────────────────────────────────────────── */
describe('resolveWarmupTicks', function () {
    test('empty / absent produceAfter → default', function () {
        assert.strictEqual(resolveWarmupTicks('', 600), 600);
        assert.strictEqual(resolveWarmupTicks(undefined, 600), 600);
        assert.strictEqual(resolveWarmupTicks(null, 600), 600);
    });
    test('integer-string produceAfter → that integer', function () {
        assert.strictEqual(resolveWarmupTicks('400', 600), 400);
        assert.strictEqual(resolveWarmupTicks('0', 600), 0);
        assert.strictEqual(resolveWarmupTicks(250, 600), 250);
    });
    test('FAIL-LOUD on a malformed produceAfter (never silently 0 → empty histogram)', function () {
        assert.throws(() => resolveWarmupTicks('abc', 600), /non-negative integer/);
        assert.throws(() => resolveWarmupTicks('-5', 600), /non-negative integer/);
        assert.throws(() => resolveWarmupTicks('1.5', 600), /non-negative integer/);
    });
});

/* ── warmUpRealm ────────────────────────────────────────────────────────────── */
describe('warmUpRealm', function () {
    test('steps the DECLARED number of ticks', async function () {
        const h = makeAccumulatingHandle();
        const stepped = await warmUpRealm(h, '400', 600, 100000);
        assert.strictEqual(stepped, 400);
        assert.strictEqual(h._stepCalls(), 400, 'handle.step() called once per declared tick');
        assert.strictEqual(h._ticks(), 400);
    });
    test('falls back to the default when produceAfter is empty', async function () {
        const h = makeAccumulatingHandle();
        const stepped = await warmUpRealm(h, '', 600, 100000);
        assert.strictEqual(stepped, 600);
        assert.strictEqual(h._stepCalls(), 600);
    });
    test('clamps to maxTicks (defends against an absurd authored N)', async function () {
        const h = makeAccumulatingHandle();
        const stepped = await warmUpRealm(h, '999999999', 600, 1000);
        assert.strictEqual(stepped, 1000, 'capped at maxTicks');
        assert.strictEqual(h._stepCalls(), 1000);
    });
    test('FAIL-LOUD on a missing / non-stepping handle', async function () {
        await assert.rejects(() => warmUpRealm(null, '10', 600, 100000), /step\(\)/);
        await assert.rejects(() => warmUpRealm({}, '10', 600, 100000), /step\(\)/);
    });
    test('FAIL-LOUD on a malformed produceAfter (propagates from resolveWarmupTicks)', async function () {
        await assert.rejects(() => warmUpRealm(makeAccumulatingHandle(), 'nope', 600, 100000), /non-negative integer/);
    });
    test('a throwing step() PROPAGATES (→ pane overlay, commits nothing)', async function () {
        const h = { step() { return Promise.reject(new Error('engine boot lost')); } };
        await assert.rejects(() => warmUpRealm(h, '5', 600, 100000), /engine boot lost/);
    });
});

/* ── warmup-THEN-derive ordering (the bug + the fix) ───────────────────────────
 * This is the load-bearing assertion: deriving WITHOUT a warmup yields an EMPTY
 * histogram (the observed bug); deriving AFTER warmUpRealm yields REAL data. */
describe('warmup-then-derive ordering (FIX B)', function () {
    test('BUG REPRODUCTION: deriving at tick ~0 (no warmup) commits an EMPTY histogram', async function () {
        const h = makeAccumulatingHandle();
        const derived = await deriveProducedBindings(h, ['hist'], 'detectorHistogram');
        assert.deepStrictEqual(derived, [{ name: 'hist', value: {} }], 'empty {} — the faithfully-rendered-nothing bug');
    });

    test('FIX: warm up THEN derive → a NON-empty histogram with real counts', async function () {
        const h = makeAccumulatingHandle();
        // The exact host ordering (notebook-pane _runRealmCell): warm up, THEN derive.
        await warmUpRealm(h, '400', 600, 100000);
        const derived = await deriveProducedBindings(h, ['hist'], 'detectorHistogram');
        assert.strictEqual(derived.length, 1);
        assert.strictEqual(derived[0].name, 'hist');
        const hist = derived[0].value;
        const sum = Object.values(hist).reduce((a, b) => a + b, 0);
        assert.ok(sum > 0, 'histogram has accumulated real counts after the warmup (sum > 0)');
        assert.deepStrictEqual(hist, { '0': 400 });
    });
});
