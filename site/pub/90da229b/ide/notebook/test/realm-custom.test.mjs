/**
 * realm-custom.test.mjs — WS-NOTEBOOK-REALM Step 4: the custom/BYO realm escape
 * hatch (the FOURTH BYO pluggable surface).
 *
 * Proves the documented BYO contract end-to-end with a MINIMAL custom realm: a
 * developer
 *   1. writes a pre-load descriptor { boot(hostEl, transport) → handle },
 *   2. whose handle conforms to the frozen view-handle contract (makeViewHandle),
 *   3. registers it via RealmRegistry.register(name, descriptor),
 *   4. and the realm-host can resolve + boot it, then drive it via the handle.
 *
 * This is the SAME path the blessed `frqtl` / `chart` realms take — a custom realm is
 * not a special case (a blessed realm = a registered pre-load; nothing more). The
 * trivial realm here keeps a SERIALIZABLE in-memory store driven by inject/call.
 *
 * Run: node --test lib/shim/notebook/test/realm-custom.test.mjs
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const Registry = await import(path.join(repoRoot, 'lib/shim/notebook/realm-registry.js'));
const { makeViewHandle, isViewHandle } = await import(path.join(repoRoot, 'lib/shim/notebook/view-handle.js'));
const { inAppTransport } = await import(path.join(repoRoot, 'lib/shim/notebook/realm-transport.js'));

/* ── A MINIMAL custom/BYO realm — the documented escape hatch ─────────────────
 *
 * It renders nothing real (no DOM): it stores the last injected SERIALIZABLE value
 * and a notify-subscriber list, proving the handle contract works for ANY renderer
 * a third party plugs in. The handle implements the full frozen surface
 * (inject/call/on/start/stop/step/dispose) via makeViewHandle. */
function makeBadgeRealmDescriptor() {
    return {
        boot(hostEl, transport) {
            // hostEl is where a real realm would draw; the trivial realm records it.
            const subs = [];
            let store = null;
            let drawCount = 0;
            const impl = {
                _transport: (transport && transport.kind) || 'in-app',
                inject(name, data) {
                    if (name !== 'badge') {
                        return Promise.reject(new Error('[badge-realm] unknown inject "' + name + '". (FAIL-LOUD.)'));
                    }
                    store = data;                          // SERIALIZABLE (gated by the handle)
                    drawCount++;
                    if (hostEl) { hostEl.textContent = String(data && data.text); }
                    for (const cb of subs) { cb({ text: data && data.text }); }
                    return Promise.resolve();
                },
                call(fn) {
                    if (fn === 'value') { return store; }
                    if (fn === 'drawCount') { return drawCount; }
                    throw new Error('[badge-realm] unknown call "' + fn + '". (FAIL-LOUD.)');
                },
                on(event, cb) { subs.push(cb); return () => { const i = subs.indexOf(cb); if (i !== -1) subs.splice(i, 1); }; },
                start() { /* static — no-op */ },
                stop()  { /* static — no-op */ },
                step()  { return store; },
                dispose() { subs.length = 0; store = null; }
            };
            return { handle: makeViewHandle(impl), impl };
        }
    };
}

describe('custom/BYO realm — the fourth pluggable surface', () => {
    beforeEach(() => { Registry._resetForTest(); });

    test('a BYO realm registers, boots, and yields a contract-valid view-handle', async () => {
        Registry.register('badge', makeBadgeRealmDescriptor());
        assert.equal(Registry.has('badge'), true);

        // The realm-host path: resolve → boot(hostEl, transport).
        const descriptor = Registry.get('badge');
        const hostEl = { textContent: '' };               // a fake host element
        const booted = await descriptor.boot(hostEl, inAppTransport());

        // The boot result's handle IS a frozen view-handle (duck-typed contract).
        assert.equal(isViewHandle(booted.handle), true);

        // Drive it via the frozen contract — exactly as a notebook cell would.
        await booted.handle.inject('badge', { text: 'hello' });
        assert.equal(hostEl.textContent, 'hello');
        assert.deepEqual(await booted.handle.call('value'), { text: 'hello' });
        assert.equal(await booted.handle.call('drawCount'), 1);
    });

    test('the BYO handle enforces VETO-CLASS #1 (serializable data plane) for free', async () => {
        Registry.register('badge', makeBadgeRealmDescriptor());
        const booted = await Registry.get('badge').boot({ textContent: '' }, inAppTransport());
        // A non-serializable inject payload FAILS LOUD at the handle boundary — the
        // BYO realm gets the vsix-safety guarantee without writing the check itself.
        await assert.rejects(booted.handle.inject('badge', { text: () => 'fn' }), /serializable/);
    });

    test('the BYO realm on/dispose work through the frozen handle', async () => {
        Registry.register('badge', makeBadgeRealmDescriptor());
        const booted = await Registry.get('badge').boot({ textContent: '' }, inAppTransport());
        const seen = [];
        const unsub = booted.handle.on('change', (p) => seen.push(p));
        await booted.handle.inject('badge', { text: 'a' });
        assert.deepEqual(seen, [{ text: 'a' }]);
        unsub();
        await booted.handle.inject('badge', { text: 'b' });
        assert.equal(seen.length, 1);                      // unsubscribed
        await booted.handle.dispose();
        assert.equal(await booted.handle.call('value'), null);
    });

    test('blessed + custom realms coexist in the ONE registry (no special-casing)', () => {
        // Simulate the three paths the model supports: frqtl (canvas), chart, custom.
        Registry.register('frqtl', { boot() {} });
        Registry.register('chart', { boot() {} });
        Registry.register('badge', makeBadgeRealmDescriptor());
        const names = Registry.names().sort();
        assert.deepEqual(names, ['badge', 'chart', 'frqtl']);
    });
});
