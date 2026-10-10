/* Copyright 2023-2026 by Essam Abadir */

/**
 * rpc.test.mjs — lib/shim/rpc conformance (WS gym-controls-as-sugar Bite 3
 * Stage 2, Layer-A follow-up fix-loop).
 *
 * Drives the REAL module (require()'d, the dual-mode CJS/window precedent
 * every other lib/shim/* contract test uses) — in-app dispatch, a genuine
 * two-fake-window postMessage round-trip (call + responder), timeout/reject
 * behavior with no responder installed, and FAIL-LOUD guards.
 *
 * Run: node --test lib/shim/rpc/test/rpc.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');
const require   = createRequire(import.meta.url);

const { makeInAppRpc, makeChannelRpc, installRpcResponder, makeWindowPostMessageChannel } =
    require(path.join(repoRoot, 'lib/shim/rpc/index.js'));

function makeFakeWindow() {
    const win = {
        _listeners: [],
        addEventListener(type, fn) { win._listeners.push({ type, fn }); },
        removeEventListener(type, fn) {
            const i = win._listeners.findIndex((l) => l.type === type && l.fn === fn);
            if (i !== -1) { win._listeners.splice(i, 1); }
        },
        _deliverFrom(sourceWin, data) {
            win._listeners.filter((l) => l.type === 'message').forEach((l) => l.fn({ data: data, source: sourceWin }));
        }
    };
    return win;
}

describe('makeInAppRpc — same-realm direct dispatch', function () {
    test('call() resolves with the dispatch function\'s return value', async function () {
        const rpc = makeInAppRpc(function (fn, args) { return fn + ':' + args.join(','); });
        const result = await rpc.call('foo', [1, 2, 3]);
        assert.equal(result, 'foo:1,2,3');
    });

    test('call() rejects if the dispatch function throws', async function () {
        const rpc = makeInAppRpc(function () { throw new Error('boom'); });
        await assert.rejects(() => rpc.call('foo', []), /boom/);
    });

    test('FAIL-LOUD: makeInAppRpc requires a dispatch function', function () {
        assert.throws(() => makeInAppRpc(null), /requires a dispatch function/);
        assert.throws(() => makeInAppRpc('not a function'), /requires a dispatch function/);
    });
});

describe('makeChannelRpc + installRpcResponder — cross-realm request/response over a channel', function () {
    test('real two-fake-window postMessage round-trip: call() on one side invokes dispatch() on the other and resolves with its result', async function () {
        const parentWin = makeFakeWindow();
        const childWin = makeFakeWindow();
        childWin.postMessage = function (msg) { childWin._deliverFrom(parentWin, msg); };
        parentWin.postMessage = function (msg) { parentWin._deliverFrom(childWin, msg); };

        // REALM side.
        const realmChannel = makeWindowPostMessageChannel(parentWin, { selfWindow: childWin });
        installRpcResponder(realmChannel, function (fn, args) {
            if (fn === 'add') { return args[0] + args[1]; }
            throw new Error('unknown fn: ' + fn);
        }, { tag: 'test-rpc' });

        // CALLER side.
        const callerChannel = makeWindowPostMessageChannel(childWin, { selfWindow: parentWin });
        const rpc = makeChannelRpc(callerChannel, { tag: 'test-rpc' });

        const sum = await rpc.call('add', [3, 4]);
        assert.equal(sum, 7);
        rpc.dispose();
    });

    test('a dispatch() that throws on the realm side surfaces as a rejection on the caller side', async function () {
        const parentWin = makeFakeWindow();
        const childWin = makeFakeWindow();
        childWin.postMessage = function (msg) { childWin._deliverFrom(parentWin, msg); };
        parentWin.postMessage = function (msg) { parentWin._deliverFrom(childWin, msg); };

        const realmChannel = makeWindowPostMessageChannel(parentWin, { selfWindow: childWin });
        installRpcResponder(realmChannel, function () { throw new Error('realm-side failure'); }, { tag: 'test-rpc-2' });

        const callerChannel = makeWindowPostMessageChannel(childWin, { selfWindow: parentWin });
        const rpc = makeChannelRpc(callerChannel, { tag: 'test-rpc-2' });

        await assert.rejects(() => rpc.call('anything', []), /remote: realm-side failure/);
        rpc.dispose();
    });

    test('a dispatch() that returns a Promise is awaited before replying (async responders supported)', async function () {
        const parentWin = makeFakeWindow();
        const childWin = makeFakeWindow();
        childWin.postMessage = function (msg) { childWin._deliverFrom(parentWin, msg); };
        parentWin.postMessage = function (msg) { parentWin._deliverFrom(childWin, msg); };

        const realmChannel = makeWindowPostMessageChannel(parentWin, { selfWindow: childWin });
        installRpcResponder(realmChannel, function (fn, args) {
            return new Promise(function (resolve) { setTimeout(function () { resolve(args[0] * 2); }, 5); });
        }, { tag: 'test-rpc-async' });

        const callerChannel = makeWindowPostMessageChannel(childWin, { selfWindow: parentWin });
        const rpc = makeChannelRpc(callerChannel, { tag: 'test-rpc-async' });

        const result = await rpc.call('double', [21]);
        assert.equal(result, 42);
        rpc.dispose();
    });

    test('call() rejects on timeout when no responder is installed (the retry signal)', async function () {
        const parentWin = makeFakeWindow();
        const childWin = makeFakeWindow(); // deliberately: no installRpcResponder here
        childWin.postMessage = function (msg) { childWin._deliverFrom(parentWin, msg); };
        parentWin.postMessage = function (msg) { parentWin._deliverFrom(childWin, msg); };

        const callerChannel = makeWindowPostMessageChannel(childWin, { selfWindow: parentWin });
        const rpc = makeChannelRpc(callerChannel, { tag: 'test-rpc-3', callTimeoutMs: 30 });

        await assert.rejects(() => rpc.call('anything', []), /timed out after 30ms/);
        rpc.dispose();
    });

    test('two RPC users sharing one postMessage bus with DIFFERENT tags do not collide', async function () {
        const parentWin = makeFakeWindow();
        const childWin = makeFakeWindow();
        childWin.postMessage = function (msg) { childWin._deliverFrom(parentWin, msg); };
        parentWin.postMessage = function (msg) { parentWin._deliverFrom(childWin, msg); };

        const realmChannel = makeWindowPostMessageChannel(parentWin, { selfWindow: childWin });
        installRpcResponder(realmChannel, function () { return 'A'; }, { tag: 'user-a' });
        installRpcResponder(realmChannel, function () { return 'B'; }, { tag: 'user-b' });

        const callerChannel = makeWindowPostMessageChannel(childWin, { selfWindow: parentWin });
        const rpcA = makeChannelRpc(callerChannel, { tag: 'user-a' });
        const rpcB = makeChannelRpc(callerChannel, { tag: 'user-b' });

        assert.equal(await rpcA.call('x', []), 'A');
        assert.equal(await rpcB.call('x', []), 'B');
        rpcA.dispose();
        rpcB.dispose();
    });

    test('FAIL-LOUD guards: makeChannelRpc/installRpcResponder require a valid channel and opts.tag', function () {
        const okChannel = { post: function () {}, subscribe: function () { return function () {}; } };
        assert.throws(() => makeChannelRpc(null, { tag: 'x' }), /requires a channel with post\/subscribe/);
        assert.throws(() => makeChannelRpc(okChannel, {}), /requires opts\.tag/);
        assert.throws(() => installRpcResponder(null, function () {}, { tag: 'x' }), /requires a channel with post\/subscribe/);
        assert.throws(() => installRpcResponder(okChannel, null, { tag: 'x' }), /requires a dispatch function/);
        assert.throws(() => installRpcResponder(okChannel, function () {}, {}), /requires opts\.tag/);
    });

    test('FAIL-LOUD: makeWindowPostMessageChannel requires targetWindow and a self window', function () {
        assert.throws(() => makeWindowPostMessageChannel(null, { selfWindow: makeFakeWindow() }), /requires targetWindow/);
        assert.throws(() => makeWindowPostMessageChannel(makeFakeWindow(), { selfWindow: null }), /requires a self window/);
    });
});
