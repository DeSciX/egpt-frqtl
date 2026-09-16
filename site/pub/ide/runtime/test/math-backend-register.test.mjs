/**
 * math-backend-register.test.mjs — regression for the static/public wasm-math
 * FAILURE (ws-egpt-frqtl-site-deploy).
 *
 * ROOT CAUSE guarded: in the WASM-only PUBLISH build, the egpt-math-sdk dist
 * entry (`dist-entry.js`, served at the site's `./pub/egpt-math-sdk/index.js`) registers its
 * wasm provider ONLY into its own private facade slot — it never imports
 * `MathBackendProvider.js` (WASM-only publish rule), so `wasm-math` was never in
 * the `MathBackendRegistry` the Runtime uses. `_applyBackendSelection` →
 * `select('wasm-math')` therefore threw "'wasm-math' is not registered", the
 * eager math load rejected, and the QFT notebook pane never mounted.
 *
 * FIX (owner-exposes-contract, consumer-registers): the sdk EXPOSES its provider
 * as `sdk.mathBackendProvider`; the Runtime registers it into MathBackendRegistry
 * (the sole registry above the shim) before selecting. This test drives the REAL
 * Runtime with a recording fake `window.createEgptMathSdk` and asserts:
 *   1. the FIRST factory build receives the router-threaded wasmModuleUrl
 *      NON-EMPTY (the URL threading was never the bug — this pins that);
 *   2. after ensureMath resolves, MathBackendRegistry has 'wasm-math' registered
 *      AND active — i.e. the exposed provider was registered + selected;
 *   3. a repeat ensureMath is idempotent (cached sdk, no duplicate registration).
 *
 * Run: node --test lib/shim/runtime/test/math-backend-register.test.mjs
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// ── Minimal DOM stubs so the runtime module graph loads in Node ──────────────
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
globalThis.window = globalThis;
globalThis.window._egptWhenEngineReady = null;
globalThis.window._egptMathSdkUrl      = '';

// ── A drift-proof, contract-conformant fake provider ─────────────────────────
// A Proxy that answers a callable for EVERY op access (except `id`) so it passes
// MathBackendRegistry.register()'s shape-check WITHOUT this test re-listing the
// REQUIRED_OPS set (which would be schema-mirror drift). id === 'wasm-math'.
function makeFakeWasmProvider() {
    let resetScopeCalls = 0;
    const base = { id: 'wasm-math', resetScope() { resetScopeCalls++; } };
    const proxy = new Proxy(base, {
        get(target, prop) {
            if (prop in target) { return target[prop]; }
            if (typeof prop === 'symbol') { return undefined; }
            return function () {};   // every op → a callable no-op
        }
    });
    return { provider: proxy, resetScopeCalls: () => resetScopeCalls };
}

// The recording fake factory the Runtime calls (window.createEgptMathSdk path).
// Records EVERY opts it is invoked with so we can assert the first build's URLs.
const factoryCalls = [];
const fake = makeFakeWasmProvider();
globalThis.window.createEgptMathSdk = function (opts) {
    factoryCalls.push(opts || {});
    return Promise.resolve({
        // The sdk EXPOSES its provider — the contract the Runtime registers off.
        mathBackendProvider: fake.provider,
        // (dist-shaped extras the real sdk returns; unused here)
        wasm: {},
        get activeMathBackend() { return 'wasm-math'; }
    });
};

let Runtime, MathBackendRegistry;

before(async () => {
    ({ Runtime } = await import(path.join(repoRoot, 'lib/shim/runtime/index.js')));
    ({ MathBackendRegistry } = await import(
        path.join(repoRoot, 'lib/egpt/js/model/backend/MathBackendProvider.js')
    ));
});

describe('Runtime registers the sdk-exposed math provider (static/dist twin-registry fix)', () => {

    test('wasm-math absent before ensureMath — the pre-fix failure precondition', () => {
        assert.ok(
            MathBackendRegistry.registeredIds().indexOf('wasm-math') === -1,
            'Precondition: the Runtime registry must NOT have wasm-math before the sdk resolves ' +
            '(the dist sdk entry never registers it there — that IS the bug).'
        );
    });

    test('ensureMath: first build gets a NON-EMPTY router wasmModuleUrl; wasm-math registers + selects', async () => {
        const MODULE_URL = '/pub/egpt-math-sdk/wasm/egpt_math_sdk_wasm.js';
        const WASM_URL   = '/pub/egpt-math-sdk/wasm/egpt_math_sdk_wasm_bg.wasm';

        const sdk = await Runtime.ensureMath({
            mathSdkUrl:        '/pub/egpt-math-sdk/index.js',
            mathWasmUrl:       WASM_URL,
            mathWasmModuleUrl: MODULE_URL,
            mathBackend:       'wasm-math'
        });

        // (1) URL threading — the FIRST factory build received the wasmModuleUrl,
        // non-empty. (Pins that the URL was NEVER the bug: it threads correctly.)
        assert.ok(factoryCalls.length >= 1, 'the factory must have been called at least once');
        assert.strictEqual(
            factoryCalls[0].wasmModuleUrl, MODULE_URL,
            'the FIRST SDK build must receive the router-threaded wasmModuleUrl (non-empty)'
        );
        assert.strictEqual(factoryCalls[0].wasmUrl, WASM_URL,
            'the first build must also receive the router-threaded wasmUrl');

        // (2) THE FIX: the sdk-exposed provider is now registered AND selected.
        assert.ok(
            MathBackendRegistry.registeredIds().indexOf('wasm-math') !== -1,
            'wasm-math must be REGISTERED into the Runtime registry from sdk.mathBackendProvider'
        );
        assert.strictEqual(
            MathBackendRegistry.active().id, 'wasm-math',
            '_applyBackendSelection must have SELECTED wasm-math (no "not registered" throw)'
        );
        assert.ok(sdk && typeof sdk === 'object', 'ensureMath resolves the sdk (no rejection)');
    });

    test('resetScope reaches the wasm provider (registry now owns it)', () => {
        const before = fake.resetScopeCalls();
        MathBackendRegistry.resetScope();
        assert.strictEqual(fake.resetScopeCalls(), before + 1,
            'MathBackendRegistry.resetScope() must call the active wasm provider resetScope');
    });

    test('repeat ensureMath is idempotent — cached sdk, no duplicate registration', async () => {
        const buildsBefore = factoryCalls.length;
        await Runtime.ensureMath({ mathWasmModuleUrl: '/pub/egpt-math-sdk/wasm/egpt_math_sdk_wasm.js' });
        assert.strictEqual(factoryCalls.length, buildsBefore,
            'a second ensureMath must return the cached sdk — no new factory build');
        const wasmMathCount = MathBackendRegistry.registeredIds()
            .filter((id) => id === 'wasm-math').length;
        assert.strictEqual(wasmMathCount, 1,
            'wasm-math must be registered exactly once (the _registerSdkProvider guard prevents dupes)');
    });

});
