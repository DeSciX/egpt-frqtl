/* Copyright 2023-2026 by Essam Abadir */
/**
 * setup-builder-ordering.test.mjs — WS gym-controls-as-sugar Bite 0a REMEDIATION,
 * Finding 2 (tester re-verification finding 2026-07-03, gallery-double-slit
 * INTERMITTENT ~15% race).
 *
 * ROOT CAUSE: a canonical setup factory's browser-classic export branch captures
 * window.* game-layer globals (SlitScreen, LargeObject, …) into closure vars AT
 * MODULE-EVALUATION TIME. Under a STATIC top-level `import` in the synthesized
 * builder, the entire reachable module graph (builder → notebook module cell →
 * bare-specifier canonical factory) is resolved+evaluated as part of
 * instantiating the builder's OWN module — which happens BEFORE the builder's
 * function body (and therefore BEFORE `await frqtl.ensureEngine()`, which boots
 * the game layer) ever runs. Race: passes only when a PRIOR action already
 * booted the engine.
 *
 * THE FIX (setup-builder.js C14): the module-cell reference is now a DYNAMIC
 * `await import(...)` placed AFTER the awaited `ensureEngine()`. A dynamic
 * import defers resolution+evaluation of its entire reachable graph to the
 * exact point of the call — this is a genuine ES-module-spec GUARANTEE, not a
 * probabilistic improvement.
 *
 * This test does NOT merely assert on the SHAPE of the synthesized source text
 * (setup-builder.test.mjs / gallery-import.test.mjs already do that) — it
 * EXECUTES the real, compiled, blob-rewritten builder via a genuine dynamic
 * `import()` of a real file:// module, with an `ensureEngine()` stand-in that
 * takes real async time before flipping a global flag, and proves the
 * notebook module's own top-level code only evaluates AFTER that flag flips.
 * A NEGATIVE CONTROL (the OLD static-import template, reconstructed literally)
 * proves the test can actually detect the race it claims to guard against —
 * it fails against the old shape and passes against the new one.
 *
 * Run: node --test lib/shim/notebook/test/setup-builder-ordering.test.mjs
 */
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { synthesizeBuilderSource } = await import(path.join(repoRoot, 'lib/shim/notebook/setup-builder.js'));
const { buildModuleClosure, compileEntryModuleSource } = await import(
    path.join(repoRoot, 'lib/shim/notebook/module-resolver.js')
);

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frqtl-builder-ordering-'));
after(() => { fs.rmSync(scratchDir, { recursive: true, force: true }); });

// A REAL file:// minter (not the fake 'blob:test/N' strings other node tests use
// for shape-only assertions) — this test actually EXECUTES the compiled module
// graph, so every "blob" must be a genuinely importable URL.
let _mintCounter = 0;
function mintFileUrl(source) {
    const f = path.join(scratchDir, 'blob-' + (_mintCounter++) + '.mjs');
    fs.writeFileSync(f, source, 'utf8');
    return pathToFileURL(f).href;
}

// The notebook module cell: its TOP-LEVEL code (module-evaluation time, exactly
// where a canonical setup factory's classic branch captures window.* globals)
// records whether globalThis.__engineReady was already true AT THAT MOMENT.
const MODULE_SOURCE =
    "globalThis.__moduleEvalSawEngineReady = (globalThis.__engineReady === true);\n" +
    "export function setupOrderingTest(frqtl, universe, options) { return 'ok'; }\n";

function makeCaps(readyDelayMs) {
    return {
        frqtl: {
            ensureEngine() {
                return new Promise((resolve) => {
                    setTimeout(() => { globalThis.__engineReady = true; resolve(); }, readyDelayMs);
                });
            },
            knob(_name, opts) { return opts || {}; },
            carryFactoryStatics(wrapper) { return wrapper; },
            FrqtlApp(cfg) {
                return { cfg, setup(fn, opts) { this._fn = fn; this._opts = opts; } };
            }
        }
    };
}

async function runCompiledEntry(builderCode, moduleSet) {
    const closure = buildModuleClosure(moduleSet, mintFileUrl);
    const entrySrc = compileEntryModuleSource(builderCode, '__entry__.js', closure.blobUrlByKey);
    const entryUrl = mintFileUrl(entrySrc);
    const mod = await import(entryUrl);
    return mod.default; // the exported async (caps, inputs) => {...}
}

describe('setup-builder ordering guarantee (C14) — REAL dynamic import(), not a text-shape assertion', () => {
    test('SANITY (negative control): the OLD static-import template evaluates the module BEFORE ensureEngine resolves (reproduces the race)', async () => {
        globalThis.__engineReady = false;
        globalThis.__moduleEvalSawEngineReady = undefined;

        // The PRE-FIX template, reconstructed literally (setup-builder.js no longer
        // emits this shape — this exists ONLY to prove the test methodology can
        // detect the bug it claims to guard against).
        const oldBuilderCode =
            "import { setupOrderingTest } from './setups/ordering-test.js';\n" +
            "const { frqtl } = caps;\n" +
            "await frqtl.ensureEngine();\n" +
            "const opts = frqtl.knob('setupOrderingTest', {});\n" +
            "const runner = frqtl.FrqtlApp({});\n" +
            "runner.setup((universe, o) => setupOrderingTest(frqtl, universe, o), opts);\n" +
            "return { _run: runner };\n";

        const runBuilder = await runCompiledEntry(oldBuilderCode, { './setups/ordering-test.js': MODULE_SOURCE });
        // ensureEngine takes 20ms; the STATIC import already evaluated the module
        // (setting the flag to `false`, since __engineReady was still false at
        // that point) before this call even started running the builder body.
        assert.equal(globalThis.__moduleEvalSawEngineReady, false,
            'OLD shape: the module evaluated BEFORE ensureEngine — the race this fix closes');

        await runBuilder(makeCaps(20), {});
    });

    test('THE FIX: the actual synthesizeBuilderSource() output evaluates the module AFTER ensureEngine resolves — deterministically, not by luck', async () => {
        globalThis.__engineReady = false;
        globalThis.__moduleEvalSawEngineReady = undefined;

        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/ordering-test.js#setupOrderingTest',
            modules: { './setups/ordering-test.js': MODULE_SOURCE }
        });

        const runBuilder = await runCompiledEntry(builderCode, { './setups/ordering-test.js': MODULE_SOURCE });
        const result = await runBuilder(makeCaps(20), {});

        assert.equal(globalThis.__moduleEvalSawEngineReady, true,
            'FIX: the module (and therefore the canonical factory it bare-specifier-imports) ' +
            'evaluated AFTER ensureEngine flipped the ready flag — deterministic ordering');
        assert.ok(result._run, 'the builder still returns the runner under the realm-internal outName');
    });

    test('THE FIX holds even with a LONGER ensureEngine delay (not a lucky race window)', async () => {
        globalThis.__engineReady = false;
        globalThis.__moduleEvalSawEngineReady = undefined;

        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/ordering-test.js#setupOrderingTest',
            modules: { './setups/ordering-test.js': MODULE_SOURCE }
        });
        const runBuilder = await runCompiledEntry(builderCode, { './setups/ordering-test.js': MODULE_SOURCE });
        await runBuilder(makeCaps(80), {});

        assert.equal(globalThis.__moduleEvalSawEngineReady, true,
            'deterministic regardless of how long ensureEngine takes — a GUARANTEE, not a race window');
    });

    test('THE FIX holds even with a ZERO-delay ensureEngine (proves it is ordering, not timing)', async () => {
        globalThis.__engineReady = false;
        globalThis.__moduleEvalSawEngineReady = undefined;

        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/ordering-test.js#setupOrderingTest',
            modules: { './setups/ordering-test.js': MODULE_SOURCE }
        });
        const runBuilder = await runCompiledEntry(builderCode, { './setups/ordering-test.js': MODULE_SOURCE });
        await runBuilder(makeCaps(0), {});

        assert.equal(globalThis.__moduleEvalSawEngineReady, true,
            'still deterministic at delay=0 — the guarantee comes from `await` sequencing, not wall-clock timing');
    });
});
