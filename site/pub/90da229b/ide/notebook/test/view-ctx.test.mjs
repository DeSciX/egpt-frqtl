/**
 * view-ctx.test.mjs — WS-NOTEBOOK-VENDOR-VIEW Phase 2b.
 *
 * Proves the THIN view ctx wrapper over the frozen handle + binding seam (no new handle
 * shape) WITHOUT a DOM: a FAKE handle + a plain object mount + fake binding callbacks.
 *   - on/call delegate to the handle,
 *   - getBinding reads the provided binding map,
 *   - commit asserts serializability (VETO-CLASS #1) and routes to the host sink,
 *   - commit FAILS LOUD on a non-serializable value AND when no sink is wired.
 *
 * Run: node --test lib/shim/notebook/test/view-ctx.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const { makeViewCtx } = await import(path.join(repoRoot, 'lib/shim/notebook/view-ctx.js'));

function fakeHandle() {
    const calls = [];
    const ons = [];
    return {
        _calls: calls,
        _ons: ons,
        on(event, cb) { ons.push({ event, cb }); return function unsub() {}; },
        call(fn, args) { calls.push({ fn, args }); return { fn: fn, ok: true }; }
    };
}

describe('view-ctx — makeViewCtx', function () {
    test('FAIL-LOUD without a handle exposing on/call', function () {
        assert.throws(() => makeViewCtx({ mount: {} }), /frozen ViewHandle with on\(\)\/call\(\)/);
        assert.throws(() => makeViewCtx({ mount: {}, handle: {} }), /frozen ViewHandle/);
    });

    test('on/call delegate to the handle', function () {
        const h = fakeHandle();
        const ctx = makeViewCtx({ mount: {}, handle: h });
        const cb = function () {};
        ctx.on('tick', cb);
        assert.strictEqual(h._ons.length, 1);
        assert.strictEqual(h._ons[0].event, 'tick');
        assert.strictEqual(h._ons[0].cb, cb);
        const r = ctx.call('detectorHistogram', []);
        assert.deepStrictEqual(h._calls[0], { fn: 'detectorHistogram', args: [] });
        assert.deepStrictEqual(r, { fn: 'detectorHistogram', ok: true });
    });

    test('mount + imports pass through; handle is the SAME ref (no new shape)', function () {
        const h = fakeHandle();
        const mount = { tag: 'mount' };
        const imports = { makeChartEnv: function () {} };
        const ctx = makeViewCtx({ mount, handle: h, imports });
        assert.strictEqual(ctx.mount, mount);
        assert.strictEqual(ctx.handle, h);
        assert.strictEqual(ctx.imports, imports);
    });

    test('getBinding reads the provided bindings map', function () {
        const ctx = makeViewCtx({ mount: {}, handle: fakeHandle(), bindings: { hist: { a: 1 } } });
        assert.deepStrictEqual(ctx.getBinding('hist'), { a: 1 });
        assert.strictEqual(ctx.getBinding('missing'), undefined);
    });

    test('an explicit getBinding resolver wins over bindings', function () {
        const ctx = makeViewCtx({
            mount: {}, handle: fakeHandle(),
            getBinding: (n) => 'resolved:' + n
        });
        assert.strictEqual(ctx.getBinding('x'), 'resolved:x');
    });

    test('commit asserts serializable + routes to the sink', function () {
        const committed = [];
        const ctx = makeViewCtx({
            mount: {}, handle: fakeHandle(),
            commit: (n, v) => committed.push([n, v])
        });
        ctx.commit('summary', { max: 9, sum: 38 });
        assert.deepStrictEqual(committed, [['summary', { max: 9, sum: 38 }]]);
    });

    test('commit FAILS LOUD on a non-serializable value (VETO-CLASS #1)', function () {
        let calledSink = false;
        const ctx = makeViewCtx({
            mount: {}, handle: fakeHandle(),
            commit: () => { calledSink = true; }
        });
        assert.throws(() => ctx.commit('bad', function () {}), /not (structured-clone-serializable|serializable)/);
        assert.strictEqual(calledSink, false, 'sink never sees a non-serializable value');
    });

    test('commit FAILS LOUD when no sink is wired', function () {
        const ctx = makeViewCtx({ mount: {}, handle: fakeHandle() });
        assert.throws(() => ctx.commit('x', { a: 1 }), /no commit sink wired/);
    });

    test('commit FAILS LOUD on an empty name', function () {
        const ctx = makeViewCtx({ mount: {}, handle: fakeHandle(), commit: () => {} });
        assert.throws(() => ctx.commit('', { a: 1 }), /name must be a non-empty string/);
    });
});

/* ── liveChart= is a blessed PRESET over the view cell ──────────────────────────
 * Prove a `view` render fn can build the SAME live chart `liveChart=` builds — using
 * makeChartEnv + makeLiveChartController surfaced via ctx.imports — and return a
 * { dispose } controller (the host tears it down with the realm). This is the
 * re-presentation: ONE makeLiveChartController, surfaced to general views via the ctx. */
describe('view-ctx — liveChart preset surface', function () {
    test('ctx.imports carries the blessed chart helpers; a view builds the SAME controller', async function () {
        const repoRoot2 = path.resolve(__dirname, '../../../..');
        const { makeLiveChartController } = await import(
            path.join(repoRoot2, 'lib/components/notebook-pane/live-chart-controller.js')
        );
        // A fake handle whose tick stream + projector mimic the frqtl realm.
        let tickCb = null;
        const handle = {
            on(event, cb) { if (event === 'tick') tickCb = cb; return () => { tickCb = null; }; },
            call(fn) { return (fn === 'detectorHistogram') ? { '0': 3, '1': 5 } : null; }
        };
        const rendered = [];
        const chartEnv = { render: (spec) => rendered.push(spec), destroy: () => {} };
        // The ctx the host hands a view module — imports are the blessed helpers (real fn).
        const ctx = makeViewCtx({ mount: {}, handle, imports: { makeLiveChartController } });
        assert.strictEqual(typeof ctx.imports.makeLiveChartController, 'function');

        // A user view module body: build the live chart off ctx.handle (the SAME controller).
        let nowMs = 1000;
        const ctrl = ctx.imports.makeLiveChartController({
            handle: ctx.handle, chartEnv, projector: 'detectorHistogram', kind: 'bar',
            now: () => nowMs, throttleMs: 100
        });
        ctrl.start();
        assert.ok(typeof tickCb === 'function', 'view subscribed to the local tick stream');
        nowMs += 200; tickCb({ tick: 1 });
        await new Promise((r) => setTimeout(r, 0));
        assert.ok(rendered.length >= 1, 'the live chart rendered off the view handle');
        assert.deepStrictEqual(rendered[0].values, [3, 5], 'projector → chart data via the SAME loop');
        assert.strictEqual(typeof ctrl.dispose, 'function', 'returns a { dispose } controller');
        ctrl.dispose();
    });
});
