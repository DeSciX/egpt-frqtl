/**
 * realm-transport.test.mjs — WS-NOTEBOOK-REALM transport abstraction.
 *
 * in-app = a transparent direct-scripting fast path (post/subscribe is an in-memory
 * channel); vsix = the CONTROLLER↔RENDERER postMessage seam (V2 — real post/subscribe
 * over a host-provided channel; carries only the Run trigger + serializable input, never
 * the per-frame data plane). Both expose the SAME shape so a descriptor never branches.
 *
 * Run: node --test lib/shim/notebook/test/realm-transport.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { inAppTransport, vsixPostMessageTransport } = await import(
    path.join(repoRoot, 'lib/shim/notebook/realm-transport.js')
);

// A fake plain channel ({ post, subscribe }) — the simplest host channel shape.
function makePlainChannel() {
    const handlers = [];
    return {
        sent: [],
        post(m) { this.sent.push(m); },
        subscribe(h) {
            handlers.push(h);
            return () => { const i = handlers.indexOf(h); if (i !== -1) handlers.splice(i, 1); };
        },
        // test helper: simulate the other end delivering a message
        deliver(m) { handlers.slice().forEach((h) => h(m)); }
    };
}

// A fake VSCode messaging channel ({ postMessage, onDidReceiveMessage→Disposable }).
function makeVscodeChannel() {
    const handlers = [];
    return {
        sent: [],
        postMessage(m) { this.sent.push(m); },
        onDidReceiveMessage(h) {
            handlers.push(h);
            return { dispose() { const i = handlers.indexOf(h); if (i !== -1) handlers.splice(i, 1); } };
        },
        // VSCode wraps the body as { editor, message } on the controller side.
        deliverWrapped(message) { handlers.slice().forEach((h) => h({ editor: {}, message })); },
        deliverRaw(message) { handlers.slice().forEach((h) => h(message)); }
    };
}

describe('realm-transport', () => {
    test('both transports expose the SAME shape (kind/isInApp/post/subscribe)', () => {
        const a = inAppTransport();
        const v = vsixPostMessageTransport({ channel: makePlainChannel() });
        for (const t of [a, v]) {
            assert.equal(typeof t.kind, 'string');
            assert.equal(typeof t.isInApp, 'function');
            assert.equal(typeof t.post, 'function');
            assert.equal(typeof t.subscribe, 'function');
        }
        assert.equal(a.kind, 'in-app');
        assert.equal(v.kind, 'vsix');
        assert.equal(a.isInApp(), true);
        assert.equal(v.isInApp(), false);
    });

    test('in-app post/subscribe is a working in-memory channel with unsub', () => {
        const t = inAppTransport();
        const seen = [];
        const unsub = t.subscribe((m) => seen.push(m));
        t.post({ hello: 1 });
        assert.deepEqual(seen, [{ hello: 1 }]);
        unsub();
        t.post({ hello: 2 });
        assert.deepEqual(seen, [{ hello: 1 }]); // unsubscribed — no new delivery
    });

    test('in-app subscribe FAILS LOUD without a function', () => {
        const t = inAppTransport();
        assert.throws(() => t.subscribe('nope'), /requires a function/);
    });

    test('vsix transport FAILS LOUD on construction with no channel (cannot deliver trigger)', () => {
        assert.throws(() => vsixPostMessageTransport(), /requires opts\.channel|FAIL-LOUD/);
        assert.throws(() => vsixPostMessageTransport({}), /requires opts\.channel|FAIL-LOUD/);
    });

    test('vsix post/subscribe round-trips over a PLAIN channel (post/subscribe shape)', () => {
        const ch = makePlainChannel();
        const t = vsixPostMessageTransport({ channel: ch });
        const seen = [];
        const unsub = t.subscribe((m) => seen.push(m));
        // post marshals to the host channel
        t.post({ type: 'run', cellId: 'c1' });
        assert.deepEqual(ch.sent, [{ type: 'run', cellId: 'c1' }]);
        // subscribe receives messages the host channel delivers
        ch.deliver({ type: 'ack', cellId: 'c1' });
        assert.deepEqual(seen, [{ type: 'ack', cellId: 'c1' }]);
        unsub();
        ch.deliver({ type: 'ack', cellId: 'c2' });
        assert.equal(seen.length, 1, 'unsubscribed — no further delivery');
    });

    test('vsix post/subscribe round-trips over a VSCODE channel (postMessage/onDidReceiveMessage)', () => {
        const ch = makeVscodeChannel();
        const t = vsixPostMessageTransport({ channel: ch });
        const seen = [];
        const unsub = t.subscribe((m) => seen.push(m));
        t.post({ type: 'run', cellId: 'c1' });
        assert.deepEqual(ch.sent, [{ type: 'run', cellId: 'c1' }]);
        // VSCode controller side wraps as { editor, message } — the transport unwraps it.
        ch.deliverWrapped({ type: 'config', wasmBaseUri: 'x' });
        // Renderer side delivers the raw message — the transport passes it through.
        ch.deliverRaw({ type: 'ping' });
        assert.deepEqual(seen, [{ type: 'config', wasmBaseUri: 'x' }, { type: 'ping' }]);
        unsub();
    });

    test('vsix subscribe FAILS LOUD without a function', () => {
        const t = vsixPostMessageTransport({ channel: makePlainChannel() });
        assert.throws(() => t.subscribe('nope'), /requires a function|FAIL-LOUD/);
    });
});
