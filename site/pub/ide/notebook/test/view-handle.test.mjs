/**
 * view-handle.test.mjs — WS-NOTEBOOK-REALM Step 1 frozen handle contract.
 *
 * Asserts: async-SHAPED methods (inject/call/step/dispose return Promises);
 * VETO-CLASS #1 serializable-data enforcement on inject payloads AND on emitted
 * event payloads; on()→unsub; dispose() delegates; isViewHandle duck-type; the
 * control plane (start/stop/step) is exempt from the data-plane serializability gate.
 *
 * Run: node --test lib/shim/notebook/test/view-handle.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { makeViewHandle, isViewHandle, assertSerializable } = await import(
    path.join(repoRoot, 'lib/shim/notebook/view-handle.js')
);

// A minimal recording impl whose methods are SYNCHRONOUS (to prove the handle
// async-SHAPES them regardless).
function makeRecordingImpl() {
    const log = [];
    const subs = [];
    return {
        log, subs,
        _transport: 'in-app',
        inject(name, data) { log.push(['inject', name, data]); return 'sync-inject'; },
        call(fn, args) { log.push(['call', fn, args]); return { fn, args }; },
        on(event, cb) { subs.push({ event, cb }); return () => { subs.length = 0; }; },
        start() { log.push(['start']); },
        stop() { log.push(['stop']); },
        step() { log.push(['step']); return { tick: 7 }; },
        dispose() { log.push(['dispose']); }
    };
}

describe('view-handle contract', () => {
    test('makeViewHandle FAILS LOUD without inject/call/on/dispose', () => {
        assert.throws(() => makeViewHandle({}), /requires an impl/);
        assert.throws(() => makeViewHandle({ inject() {}, call() {}, on() {} }), /requires an impl/);
    });

    test('the handle is frozen (a cell cannot monkey-patch the contract)', () => {
        const h = makeViewHandle(makeRecordingImpl());
        assert.equal(Object.isFrozen(h), true);
    });

    test('inject/call/step/dispose are async-SHAPED (return Promises) even for a sync impl', async () => {
        const impl = makeRecordingImpl();
        const h = makeViewHandle(impl);
        assert.ok(h.inject('x', { a: 1 }) instanceof Promise);
        assert.ok(h.call('f', [1]) instanceof Promise);
        assert.ok(h.step() instanceof Promise);
        assert.ok(h.dispose() instanceof Promise);
        assert.ok(h.start() instanceof Promise);
        assert.ok(h.stop() instanceof Promise);
        // values resolve through
        assert.equal(await h.inject('x', { a: 1 }), 'sync-inject');
        assert.deepEqual(await h.call('f', [1]), { fn: 'f', args: [1] });
        assert.deepEqual(await h.step(), { tick: 7 });
    });

    test('VETO-CLASS #1: inject REJECTS a non-cloneable payload (function / nested function)', async () => {
        const h = makeViewHandle(makeRecordingImpl());
        // structuredClone throws DataCloneError on a function — the canonical
        // non-serializable case that re-forks vsix (a live callback ref).
        await assert.rejects(h.inject('bad', () => {}), /not structured-clone-serializable|not serializable/);
        // a nested function (e.g. a live runner method captured in the payload) also rejects
        await assert.rejects(h.inject('bad', { onTick: () => {} }), /serializable/);
    });

    test('VETO-CLASS #1: inject ACCEPTS a plain serializable recipe', async () => {
        const impl = makeRecordingImpl();
        const h = makeViewHandle(impl);
        await h.inject('experiment', { factory: 'setupWaveInterference', opts: { quanta: 800 } });
        assert.deepEqual(impl.log.at(-1), ['inject', 'experiment', { factory: 'setupWaveInterference', opts: { quanta: 800 } }]);
    });

    test('VETO-CLASS #1: on() emission of a non-serializable payload FAILS LOUD', () => {
        const impl = makeRecordingImpl();
        const h = makeViewHandle(impl);
        const seen = [];
        h.on('tick', (p) => seen.push(p));
        // drive the recorded cb directly (the realm would call it) — serializable ok
        impl.subs[0].cb({ tick: 1, detector: { '12': 3 } });
        assert.deepEqual(seen, [{ tick: 1, detector: { '12': 3 } }]);
        // a non-serializable emit throws at the boundary (the wrapper asserts)
        assert.throws(() => impl.subs[0].cb({ live: () => {} }), /serializable/);
    });

    test('on() returns a working unsub fn', () => {
        const impl = makeRecordingImpl();
        const h = makeViewHandle(impl);
        const unsub = h.on('tick', () => {});
        assert.equal(typeof unsub, 'function');
        assert.equal(impl.subs.length, 1);
        unsub();
        assert.equal(impl.subs.length, 0);
    });

    test('on() FAILS LOUD when cb is not a function', () => {
        const h = makeViewHandle(makeRecordingImpl());
        assert.throws(() => h.on('tick', 'nope'), /cb must be a function/);
    });

    test('dispose() delegates to the impl', async () => {
        const impl = makeRecordingImpl();
        const h = makeViewHandle(impl);
        await h.dispose();
        assert.deepEqual(impl.log.at(-1), ['dispose']);
    });

    test('control plane (start/stop/step) carries no data-plane serializability gate', async () => {
        // start/stop/step accept no rich payload, so they never trip the gate.
        const impl = makeRecordingImpl();
        const h = makeViewHandle(impl);
        await h.start(); await h.stop(); await h.step();
        assert.deepEqual(impl.log.map((e) => e[0]).filter((n) => ['start', 'stop', 'step'].includes(n)),
            ['start', 'stop', 'step']);
    });

    test('isViewHandle duck-types a handle vs a plain binding', () => {
        const h = makeViewHandle(makeRecordingImpl());
        assert.equal(isViewHandle(h), true);
        assert.equal(isViewHandle({}), false);
        assert.equal(isViewHandle({ inject() {}, call() {}, on() {} }), false); // missing dispose
        assert.equal(isViewHandle(null), false);
    });

    test('assertSerializable returns the value and throws on a bad one', () => {
        assert.deepEqual(assertSerializable({ a: 1 }), { a: 1 });
        assert.throws(() => assertSerializable(() => {}), /serializable/);
    });
});
