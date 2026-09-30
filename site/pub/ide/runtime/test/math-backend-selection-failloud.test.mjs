/* Copyright 2023-2026 by Essam Abadir */
/**
 * math-backend-selection-failloud.test.mjs — the Runtime's math-backend selection fails LOUD.
 *
 *   1. A distribution profile defaults to wasm-math (the router profile is the one default).
 *   2. Forcing `?mathBackend=js-reference` on the static profile THROWS
 *      MathBackendNotAvailableError: the static graph carries only the core-free registry, so
 *      js-reference is not registrable there — the WASM-only mandate is structural.
 *   3. A failed EAGER wasm-math load REJECTS `Runtime.init`'s promise (never a console line alone).
 *   2b/3b. A failed load is STICKY for the realm: a SECOND ensureMath() rejects with the same cause —
 *      never resolves on a cached sdk running another backend, never builds a second sdk.
 *   5. A realm builds ONE sdk: init's eager load and a view's concurrent ensureMath share the
 *      in-flight load (base built two, and silently registered two wasm providers).
 *   4. Registration is identity-guarded (MathBackendRegistry.register owns it; the Runtime registers
 *      the sdk's exposed provider through it): the SAME provider object already registered is a
 *      no-op; a DIFFERENT provider under an already-registered id throws, naming the id.
 *
 * Each scenario runs in its OWN node process — the Runtime caches its sdk and the registry has no
 * unregister, so a clean realm per scenario is a fresh process. NEGATIVE CONTROL: the base tree
 * (the fused MathBackendProvider.js + the js-reference "always available" no-op + the eager
 * `.catch(console.error)`) fails scenarios 1–3.
 *
 * Run: node --test lib/shim/runtime/test/math-backend-selection-failloud.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const THIS_FILE = fileURLToPath(import.meta.url);
const repoRoot  = path.resolve(path.dirname(THIS_FILE), '../../../..');
const SCENARIO_ENV = 'FRQTL_MATH_BACKEND_SCENARIO';

// ── scenario side (child process) ────────────────────────────────────────────

/** Minimal browser globals so the shim graph loads; `search` is the page's query string. */
function stubBrowser(search) {
    const noop = () => {};
    globalThis.document = {
        readyState: 'complete', baseURI: 'http://127.0.0.1/site/index.html',
        addEventListener: noop, removeEventListener: noop, getElementById: () => null,
        createElement: () => ({ setAttribute: noop, style: {}, appendChild: noop }),
        head: { appendChild: noop }, body: { appendChild: noop }
    };
    globalThis.window = globalThis;
    Object.defineProperty(globalThis, 'location', {
        value: { search, href: 'http://127.0.0.1/site/index.html' + search, origin: 'http://127.0.0.1' },
        configurable: true
    });
    window._egptWhenEngineReady = null;
    window._egptMathSdkUrl = '';
}

/** A contract-conformant provider (every op a callable) without re-listing REQUIRED_OPS. */
function fakeProvider(id) {
    return new Proxy({ id }, {
        get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : () => {})
    });
}

const errOut = (e) => ({
    name: e && e.name, message: String(e && e.message),
    causeName: e && e.cause && e.cause.name
});

async function runScenario(name) {
    const search = name === 'static-forced-js-reference' ? '?mathBackend=js-reference' : '';
    stubBrowser(search);
    const { engineRouter } = await import(pathToFileURL(path.join(repoRoot, 'lib/shim/engine/router.js')).href);
    const { Runtime } = await import(pathToFileURL(path.join(repoRoot, 'lib/shim/runtime/index.js')).href);
    // The shim's own registry export (the barrel the IDE imports) — whichever module holds it.
    const { MathBackendRegistry } = await import(pathToFileURL(path.join(repoRoot, 'lib/shim/index.js')).href);
    const out = {};
    const router = engineRouter({ mode: 'static' });
    out.routerMathBackend = router.mathBackend;
    const initOpts = { _routerMathSdkUrl: router.mathSdkUrl, _routerMathBackend: router.mathBackend };
    const settle = (p) => p.then(() => ({ ok: true }), (e) => ({ ok: false, error: errOut(e) }));

    if (name === 'static-default' || name === 'static-forced-js-reference') {
        // A dist-shaped sdk: exposes wasm-math only (the WASM-only publish entry).
        window.createEgptMathSdk = () => Promise.resolve({ mathBackendProvider: fakeProvider('wasm-math') });
        out.init = await settle(Runtime.init(initOpts));
        out.ensureMath = await settle(Runtime.ensureMath());
        out.ensureMathAgain = await settle(Runtime.ensureMath());
        out.registered = MathBackendRegistry.registeredIds();
        out.activeId = (() => { try { return MathBackendRegistry.activeId(); } catch (e) { return null; } })();
    } else if (name === 'eager-wasm-failure') {
        let calls = 0;
        window.createEgptMathSdk = () => { calls++; return Promise.reject(new Error('forced: wasm bridge failed to load')); };
        out.init = await settle(Runtime.init(Object.assign({}, initOpts, { _routerMathBackend: 'wasm-math' })));
        out.ensureMathAgain = await settle(Runtime.ensureMath());
        out.factoryCalls = calls;
    } else if (name === 'late-selection-failure') {
        // The realm already runs wasm-math; a later init (a remount) requests js-reference, which
        // this realm cannot select. That init rejects, and no later caller resolves on wasm-math.
        window.createEgptMathSdk = () => Promise.resolve({ mathBackendProvider: fakeProvider('wasm-math') });
        out.first = await settle(Runtime.init(Object.assign({}, initOpts, { _routerMathBackend: 'wasm-math' })));
        out.init = await settle(Runtime.init(Object.assign({}, initOpts, { _routerMathBackend: 'js-reference' })));
        out.ensureMathAgain = await settle(Runtime.ensureMath());
    } else if (name === 'no-url-yet-is-retryable') {
        // A deep-linked view asking before init (no URL, no factory) fails WITHOUT pinning the realm.
        out.early = await settle(Runtime.ensureMath());
        window.createEgptMathSdk = () => Promise.resolve({ mathBackendProvider: fakeProvider('wasm-math') });
        out.init = await settle(Runtime.init(Object.assign({}, initOpts, { _routerMathBackend: 'wasm-math' })));
        out.ensureMath = await settle(Runtime.ensureMath());
    } else if (name === 'concurrent-load') {
        let calls = 0;
        window.createEgptMathSdk = () => {
            calls++;
            return new Promise((r) => setTimeout(() => r({ mathBackendProvider: fakeProvider('wasm-math') }), 20));
        };
        const [a, b] = await Promise.all([
            settle(Runtime.init(Object.assign({}, initOpts, { _routerMathBackend: 'wasm-math' }))),
            settle(Runtime.ensureMath())
        ]);
        Object.assign(out, { init: a, ensureMath: b, factoryCalls: calls });
    } else if (name === 'identity-same' || name === 'identity-distinct') {
        const registered = fakeProvider('js-reference');
        MathBackendRegistry.register(registered);
        const exposed = name === 'identity-same' ? registered : fakeProvider('js-reference');
        window.createEgptMathSdk = () => Promise.resolve({ mathBackendProvider: exposed });
        out.init = await settle(Runtime.init(Object.assign({}, initOpts, { _routerMathBackend: 'js-reference' })));
        out.ensureMath = await settle(Runtime.ensureMath());
    } else {
        throw new Error('unknown scenario ' + name);
    }
    process.stdout.write('\nSCENARIO-RESULT ' + JSON.stringify(out) + '\n');
}

if (process.env[SCENARIO_ENV]) {
    await runScenario(process.env[SCENARIO_ENV]);
}

// ── test side (parent process) ───────────────────────────────────────────────

function scenario(name) {
    const r = spawnSync(process.execPath, [THIS_FILE], {
        env: Object.assign({}, process.env, { [SCENARIO_ENV]: name, NODE_TEST_CONTEXT: '' }),
        encoding: 'utf8', timeout: 60000
    });
    const line = (r.stdout || '').split('\n').find((l) => l.startsWith('SCENARIO-RESULT '));
    assert.ok(line, `scenario ${name} produced no result (exit ${r.status}):\n${r.stdout}\n${r.stderr}`);
    return JSON.parse(line.slice('SCENARIO-RESULT '.length));
}

if (!process.env[SCENARIO_ENV]) {
    test('the static profile defaults to wasm-math and selects it', () => {
        const r = scenario('static-default');
        assert.equal(r.routerMathBackend, 'wasm-math');
        assert.deepEqual(r.init, { ok: true });
        assert.deepEqual(r.ensureMath, { ok: true });
        assert.deepEqual(r.registered, ['wasm-math'],
            'the static realm registry holds exactly the dist sdk\'s provider — no js-reference');
    });

    test('forcing ?mathBackend=js-reference on the static profile throws MathBackendNotAvailableError', () => {
        const r = scenario('static-forced-js-reference');
        assert.equal(r.routerMathBackend, 'js-reference', 'the URL param reaches the router');
        assert.equal(r.ensureMath.ok, false, 'js-reference must not be selectable in a distribution');
        assert.equal(r.ensureMath.error.causeName, 'MathBackendNotAvailableError', JSON.stringify(r.ensureMath));
        assert.match(r.ensureMath.error.message, /'js-reference' is not registered/);
        assert.equal(r.ensureMathAgain.ok, false,
            'a SECOND ensureMath resolved — the failed request was silently defaulted to ' + r.activeId);
        assert.equal(r.ensureMathAgain.error.causeName, 'MathBackendNotAvailableError', JSON.stringify(r.ensureMathAgain));
        assert.equal(r.ensureMathAgain.error.message, r.ensureMath.error.message, 'the same loud error, every call');
    });

    test('a failed eager wasm-math load rejects Runtime.init', () => {
        const r = scenario('eager-wasm-failure');
        assert.equal(r.init.ok, false, 'init resolved although the eager math load failed');
        assert.match(r.init.error.message, /forced: wasm bridge failed to load/);
        assert.equal(r.ensureMathAgain.ok, false, 'a later ensureMath resolved after the eager load failed');
        assert.match(r.ensureMathAgain.error.message, /forced: wasm bridge failed to load/);
        assert.equal(r.factoryCalls, 1, 'a later ensureMath rebuilt the sdk instead of reporting the failed load');
    });

    test('a late selection failure rejects init and pins the realm (no later wasm-math resolve)', () => {
        const r = scenario('late-selection-failure');
        assert.deepEqual(r.first, { ok: true });
        assert.equal(r.init.ok, false);
        assert.equal(r.init.error.causeName, 'MathBackendNotAvailableError', JSON.stringify(r.init));
        assert.equal(r.ensureMathAgain.ok, false, 'a later ensureMath resolved on the previously selected backend');
        assert.equal(r.ensureMathAgain.error.message, r.init.error.message);
    });

    test('the "no mathSdkUrl yet" rejection stays retryable', () => {
        const r = scenario('no-url-yet-is-retryable');
        assert.equal(r.early.ok, false);
        assert.match(r.early.error.message, /no mathSdkUrl resolved/);
        assert.deepEqual(r.init, { ok: true });
        assert.deepEqual(r.ensureMath, { ok: true });
    });

    test('init\'s eager load and a concurrent ensureMath build ONE sdk', () => {
        const r = scenario('concurrent-load');
        assert.deepEqual(r.init, { ok: true });
        assert.deepEqual(r.ensureMath, { ok: true });
        assert.equal(r.factoryCalls, 1, 'the realm built more than one math sdk');
    });

    test('the same provider object already registered is a no-op', () => {
        const r = scenario('identity-same');
        assert.deepEqual(r.ensureMath, { ok: true });
    });

    test('a different provider under an already-registered id throws, naming the id', () => {
        const r = scenario('identity-distinct');
        assert.equal(r.ensureMath.ok, false, 'a provider-id collision was silently absorbed');
        assert.equal(r.ensureMath.error.name, 'MathBackendRegistrationError');
        assert.match(r.ensureMath.error.message, /a DIFFERENT provider object is already registered under 'js-reference'/);
        assert.match(r.ensureMath.error.message, /two math provider bundles were evaluated in one realm/);
    });
}
