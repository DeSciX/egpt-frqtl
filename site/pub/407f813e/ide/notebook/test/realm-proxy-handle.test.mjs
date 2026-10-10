/* Copyright 2023-2026 by Essam Abadir */

/**
 * realm-proxy-handle.test.mjs — node-level verification of the WS-VSIX-V2c renderer↔realm
 * control plane (C3/C4), WITHOUT a browser/VSCode.
 *
 * Proves:
 *   1. vsixPostMessageTransport + makeRealmProxyHandle produce the SAME frozen view-handle
 *      shape (inject/call/on/start/stop/step/dispose) as in-app — ONE view-handle (C4).
 *   2. The FULL control plane round-trips over a fake bidirectional channel: a proxy on the
 *      RENDERER side posts start/stop/step/dispose + inject toward a realm-entry-like peer
 *      on the REALM side; events + step results come back. ONE transport (C4).
 *   3. assertSerializable still gates the data plane (C3): a live-ref inject payload FAILS
 *      LOUD at the handle boundary (it never crosses the seam).
 *   4. step() resolves with the realm's returned summary; dispose() tears down the seam.
 *
 * Run: node --test lib/shim/notebook/test/realm-proxy-handle.test.mjs   (from repo root)
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shimDir = path.resolve(__dirname, '..');   // lib/shim/notebook

/* ── a fake bidirectional channel pair (renderer side ↔ realm side) ───────────
 * Each side gets a { post, subscribe } channel; posting on one delivers (async, like
 * postMessage) to the OTHER side's subscribers. This mirrors window.postMessage across a
 * cross-origin frame boundary without any DOM. */
function makeChannelPair() {
    const aHandlers = [];
    const bHandlers = [];
    const deliver = (handlers, msg) => {
        // async like real postMessage (next microtask) so ordering matches the browser.
        Promise.resolve().then(() => {
            for (const h of handlers.slice()) { try { h(msg); } catch (e) {} }
        });
    };
    const a = {
        post: (msg) => deliver(bHandlers, msg),
        subscribe: (h) => { aHandlers.push(h); return () => { const i = aHandlers.indexOf(h); if (i !== -1) aHandlers.splice(i, 1); }; }
    };
    const b = {
        post: (msg) => deliver(aHandlers, msg),
        subscribe: (h) => { bHandlers.push(h); return () => { const i = bHandlers.indexOf(h); if (i !== -1) bHandlers.splice(i, 1); }; }
    };
    return { a, b };
}

describe('vsixPostMessageTransport + makeRealmProxyHandle — full control plane (C3/C4)', () => {
    test('the proxy handle has the SAME frozen view-handle shape as in-app (one view-handle)', async () => {
        const { vsixPostMessageTransport, makeRealmProxyHandle } = await import(path.join(shimDir, 'realm-transport.js'));
        const { isViewHandle } = await import(path.join(shimDir, 'view-handle.js'));
        const { a } = makeChannelPair();
        const transport = vsixPostMessageTransport({ channel: a });
        const wrap = makeRealmProxyHandle(transport, { cellId: 'c1' });

        assert.ok(isViewHandle(wrap.handle), 'proxy.handle duck-types as a view handle');
        for (const m of ['inject', 'call', 'on', 'start', 'stop', 'step', 'dispose']) {
            assert.equal(typeof wrap.handle[m], 'function', 'has ' + m);
        }
        // DERIVED transport label (C7) — never hardcoded.
        assert.equal(wrap.handle.transport, 'vsix', 'transport label derived as vsix');
        wrap.dispose();
    });

    test('control plane round-trips: inject/start/stop/step/dispose cross the seam; events come back', async () => {
        const { vsixPostMessageTransport, makeRealmProxyHandle } = await import(path.join(shimDir, 'realm-transport.js'));
        const { a, b } = makeChannelPair();

        // ── REALM side (the realm-entry stand-in): a transport over channel `b` that
        // RECEIVES control verbs + data and POSTS events/results back. ──
        const realmTransport = vsixPostMessageTransport({ channel: b });
        const realmLog = [];
        let stepCount = 0;
        realmTransport.subscribe((msg) => {
            if (!msg || msg.__frqtlRealm !== true || msg.cellId !== 'c1') { return; }
            if (msg.type === 'realm:data') {
                realmLog.push({ data: msg.name + ':' + JSON.stringify(msg.data) });
            } else if (msg.type === 'realm:control') {
                realmLog.push({ verb: msg.verb });
                if (msg.verb === 'step') {
                    stepCount += 1;
                    realmTransport.post({ __frqtlRealm: true, cellId: 'c1', type: 'realm:result', verb: 'step', value: { tick: stepCount } });
                }
            }
        });

        // ── RENDERER side: the proxy handle over channel `a`. ──
        const proxyTransport = vsixPostMessageTransport({ channel: a });
        const wrap = makeRealmProxyHandle(proxyTransport, { cellId: 'c1' });
        const handle = wrap.handle;

        // an event subscription (realm → renderer).
        const ticks = [];
        const unsub = handle.on('tick', (p) => ticks.push(p));

        // inject a serializable data payload (the proxy handle is transport-agnostic —
        // it relays ANY inject verb/data across the seam; chart is the surviving verb).
        await handle.inject('chart', { kind: 'bar', label: 'hist', data: { '0': 1 } });
        // control verbs.
        handle.start();
        handle.stop();
        const stepResult = await handle.step();

        // the realm posts an event back; let it deliver.
        realmTransport.post({ __frqtlRealm: true, cellId: 'c1', type: 'realm:event', event: 'tick', payload: { tick: 7, detector: {} } });
        await new Promise((r) => setTimeout(r, 5));

        // ── assertions ──
        assert.deepEqual(stepResult, { tick: 1 }, 'step() resolves with the realm-returned summary');
        const verbs = realmLog.filter((e) => e.verb).map((e) => e.verb);
        assert.deepEqual(verbs, ['start', 'stop', 'step'], 'start/stop/step crossed the seam in order');
        assert.equal(realmLog.filter((e) => e.data).length, 1, 'inject data crossed the seam once');
        assert.match(realmLog.find((e) => e.data).data, /chart/, 'inject carried the recipe');
        assert.equal(ticks.length, 1, 'a realm event reached the renderer-side on() subscriber');
        assert.equal(ticks[0].tick, 7, 'event payload delivered');

        unsub();
        wrap.dispose();

        // dispose posted the dispose verb toward the realm.
        await new Promise((r) => setTimeout(r, 5));
        assert.ok(realmLog.some((e) => e.verb === 'dispose'), 'dispose verb crossed the seam');
    });

    test('assertSerializable gates the data plane: a live-ref inject FAILS LOUD (never crosses)', async () => {
        const { vsixPostMessageTransport, makeRealmProxyHandle } = await import(path.join(shimDir, 'realm-transport.js'));
        const { a, b } = makeChannelPair();

        const seen = [];
        const realmTransport = vsixPostMessageTransport({ channel: b });
        realmTransport.subscribe((msg) => { if (msg && msg.type === 'realm:data') { seen.push(msg); } });

        const wrap = makeRealmProxyHandle(vsixPostMessageTransport({ channel: a }), { cellId: 'c1' });
        // a live function in the payload — the view-handle's assertSerializable rejects it.
        await assert.rejects(
            () => wrap.handle.inject('experiment', { factory: 'x', opts: { onTick: () => {} } }),
            /serializable/i,
            'inject of a live-ref payload rejects at the handle boundary'
        );
        await new Promise((r) => setTimeout(r, 5));
        assert.equal(seen.length, 0, 'the live-ref payload NEVER crossed the seam');
        wrap.dispose();
    });

    test('makeRealmProxyHandle FAILS LOUD without a usable transport', async () => {
        const { makeRealmProxyHandle } = await import(path.join(shimDir, 'realm-transport.js'));
        assert.throws(() => makeRealmProxyHandle(null), /post\/subscribe/);
        assert.throws(() => makeRealmProxyHandle({ post: () => {} }), /post\/subscribe/);
    });

    test('vsixPostMessageTransport FAILS LOUD without a channel (no silent no-op)', async () => {
        const { vsixPostMessageTransport } = await import(path.join(shimDir, 'realm-transport.js'));
        assert.throws(() => vsixPostMessageTransport({}), /requires opts\.channel/);
    });
});
