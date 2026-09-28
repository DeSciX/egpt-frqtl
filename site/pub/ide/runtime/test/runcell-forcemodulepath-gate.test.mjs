/* Copyright 2023-2026 by Essam Abadir */
/**
 * runcell-forcemodulepath-gate.test.mjs — WS gym-controls-as-sugar Bite 0a
 * fix-loop #3 (tester regression finding 2026-07-03, 0/7 pass).
 *
 * MANDATORY TEST GAP the tester identified: fix-loop #2's realm-faithful tests
 * (setup-builder-ordering.test.mjs, frqtl-setup-esm.test.mjs) exercised the blob
 * COMPILER (buildModuleClosure/compileEntryModuleSource) directly — never the
 * RUNTIME GATE at `lib/shim/runtime/index.js` `runCell()` that decides
 * new-Function-vs-blob-module routing. That gate sniffs `hasImport(code)`
 * (`/(^|\n)\s*import\s/`, LINE-START only). fix-loop #2's synthesized template
 * moved the module reference to a body-level `await import(...)` — `hasImport`
 * returns `false` for it, so EVERY synthesized builder took the `new Function`
 * fast path, which NEVER runs `rewriteRelativeToSiblingBlobs` — the relative
 * specifier survived unrewritten into a dynamic import evaluated from the
 * runtime's own module context → resolution failure on all 7 notebooks.
 *
 * THE FIX (C15, setup-builder.js + runtime/index.js): the synthesis authority
 * explicitly declares `usesModulePath: true`; the caller forwards it as
 * `Runtime.runCell({ forceModulePath, … })`, which SHORT-CIRCUITS the sniff
 * (`forceModulePath || hasImport(code)`) — never a widened heuristic (a
 * broadened `import(` sniff was evaluated and REJECTED: it can false-positive
 * on an unrelated cell's string/comment content and cause
 * `rewriteRelativeToSiblingBlobs` to spuriously FAIL-LOUD or mangle a string
 * literal — see setup-builder.js C15 doc for the full argument).
 *
 * This file pushes `synthesizeBuilderSource()`'s REAL output through the REAL
 * `Runtime.runCell()` entry point (not a hand-rolled reimplementation of the
 * gate) with a Node-importable `data:` URL transport substituted for the
 * browser's `Blob`/`URL.createObjectURL` (blob: URLs are not importable by
 * Node's default ESM loader — verified; `data:` URLs are). Proves:
 *
 *   1. NEGATIVE CONTROL: WITHOUT `forceModulePath`, the exact generated
 *      template — because its only module reference is a body-level dynamic
 *      import — is NOT detected by `hasImport`, takes the `new Function` path,
 *      and FAILS (the relative specifier is never rewritten, so the dynamic
 *      import at call time cannot resolve the notebook-local module) —
 *      reproducing the tester's exact regression.
 *   2. THE FIX: WITH `forceModulePath: synth.usesModulePath`, the SAME
 *      template routes through the blob-module path, the relative specifier
 *      IS rewritten to an importable URL, the notebook module actually
 *      executes, and the builder completes successfully.
 *
 * Run: node --test lib/shim/runtime/test/runcell-forcemodulepath-gate.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// ── Minimal DOM stubs so the runtime module loads in Node (mirrors the
// established pattern in runcell-single-handler.test.mjs) ───────────────────
const _noop = function () {};
const _noEl = { setAttribute: _noop, style: {}, appendChild: _noop };
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
globalThis.window._egptMathSdkUrl = '';
globalThis.window.createEgptMathSdk = function () { return Promise.resolve({ __stubSdk: true }); };

// ── Node-importable transport substituted for Blob/URL.createObjectURL ──────
// Node's default ESM loader does NOT support `blob:` URLs (verified empirically:
// "Only URLs with a scheme in: file, data, and node are supported"). `_mintBlobUrl`
// in runtime/index.js duck-types `new Blob([source], {type})` then
// `URL.createObjectURL(blob)` — substituting a minimal same-shape Blob + a
// `createObjectURL` that base64-encodes into a `data:text/javascript;base64,…`
// URL lets the REAL runtime code (unmodified) run end-to-end in Node. This is a
// TEST-ONLY transport swap — the production code path (browser Blob/blob: URL)
// is untouched; only the URL SCHEME differs, never the compiler/rewrite logic.
class _NodeBlob {
    constructor(parts, opts) { this._parts = parts || []; this.type = (opts && opts.type) || ''; }
}
globalThis.Blob = _NodeBlob;
globalThis.URL.createObjectURL = function (blob) {
    const src = (blob && blob._parts) ? blob._parts.join('') : '';
    const b64 = Buffer.from(src, 'utf8').toString('base64');
    return 'data:text/javascript;base64,' + b64;
};
globalThis.URL.revokeObjectURL = function () { /* data: URLs need no revocation */ };

const { Runtime } = await import(path.join(repoRoot, 'lib/shim/runtime/index.js'));
const { synthesizeBuilderSource } = await import(path.join(repoRoot, 'lib/shim/notebook/setup-builder.js'));

// A fake FrqtlApp constructor on a page where stack-boot has already executed and BOTH of
// its published signals are ready: engine-ready (`_egptWhenEngineReady`) and the GAME-layer
// roster (`_egptGameLayerReadyPromise`). Runtime.init({_router}) is required for
// caps.frqtl.ensureEngine to exist at all; with stack-boot already executed,
// ensureEngineStack skips only the injection (neither .resolve nor .ensureBrowserPathMap()
// is ever called) and still awaits the composed contract — so the stand-in must play both
// signals. A pre-set window.FrqtlApp alone is not a stand-in for either (FRAQTL #73).
function installFakeFrqtlApp() {
    globalThis.window._egptWhenEngineReady = function (onReady) { onReady(); };
    globalThis.window._egptGameLayerReadyPromise = Promise.resolve();
    globalThis.window.FrqtlApp = function (opts) {
        this.opts = opts;
        this.setup = function (fn, knobOpts) { this._fn = fn; this._opts = knobOpts; };
    };
}

const MODULE_SET = {
    './setups/gate-test.js': "export function setupGateTest(frqtl, universe, options) {\n" +
        "  return { ok: true, hasFrqtl: typeof frqtl === 'object' };\n" +
        "}\n"
};

async function runtimeInitOnce() {
    await Runtime.init({ _router: { resolve: function (rel) { return '/frqtl/' + rel; } } });
}

describe('Runtime.runCell forceModulePath gate (C15) — the REAL runtime gate, not a reimplementation', () => {
    test('NEGATIVE CONTROL: WITHOUT forceModulePath, the synthesized builder is NOT detected by hasImport and FAILS (reproduces the tester regression)', async () => {
        await runtimeInitOnce();
        installFakeFrqtlApp();

        const synth = synthesizeBuilderSource({
            setup: './setups/gate-test.js#setupGateTest',
            modules: MODULE_SET,
            outName: 'c_gate_run'
        });
        assert.equal(synth.usesModulePath, true, 'sanity: the authority declares usesModulePath');

        const result = await Runtime.runCell({
            lane: 'frqtl',
            code: synth.builderCode,
            id: '_gate_negative_control',
            modules: MODULE_SET,
            inputs: {},
            declaredOutputs: [synth.outName]
            // forceModulePath DELIBERATELY OMITTED — the exact bug condition.
        });

        assert.equal(result.ok, false,
            'WITHOUT forceModulePath: hasImport() misses the body-level dynamic import, the ' +
            'builder takes the new-Function fast path, the relative specifier is never ' +
            'rewritten, and the dynamic import at call time cannot resolve the notebook-local ' +
            'module — the EXACT regression the tester found (0/7 pass).');
        assert.ok(result.error, 'a resolution failure error is surfaced (not a silent no-op)');
    });

    test('THE FIX: WITH forceModulePath, the synthesized builder routes through the blob-module path, the specifier is rewritten, and the builder completes', async () => {
        await runtimeInitOnce();
        installFakeFrqtlApp();

        const synth = synthesizeBuilderSource({
            setup: './setups/gate-test.js#setupGateTest',
            modules: MODULE_SET,
            outName: 'c_gate_run_fixed'
        });

        const result = await Runtime.runCell({
            lane: 'frqtl',
            code: synth.builderCode,
            id: '_gate_fixed',
            modules: MODULE_SET,
            inputs: {},
            declaredOutputs: [synth.outName],
            forceModulePath: synth.usesModulePath // ← the fix, forwarded from the authority
        });

        assert.equal(result.ok, true,
            'WITH forceModulePath: the builder routes through _runCellAsModule, ' +
            'rewriteRelativeToSiblingBlobs rewrites the relative specifier to the (data:) ' +
            'transport URL, the notebook module genuinely imports and executes, and the ' +
            'runner (backed by the fake FrqtlApp) is returned. Error (if any): ' +
            JSON.stringify(result.error));
        const runner = result.outputs && result.outputs[synth.outName];
        assert.ok(runner, 'the declared output (the runner) is present');
        assert.equal(typeof runner._fn, 'function',
            'runner.setup((universe,o) => setupGateTest(frqtl,universe,o), opts) actually ran — ' +
            'the notebook module\'s export was reachable and callable, proving the specifier ' +
            'resolved for real, not just that no error was thrown');
    });

    test('forceModulePath defaults to false (omitting it never silently forces the module path)', async () => {
        await runtimeInitOnce();
        const result = await Runtime.runCell({
            lane: 'math',
            code: 'return { x: 1 };',
            id: '_no_force_math_cell',
            inputs: {},
            declaredOutputs: ['x']
            // no forceModulePath
        });
        assert.equal(result.ok, true);
        assert.equal(result.outputs.x, 1, 'an ordinary import-free cell is unaffected by the new flag');
    });
});
