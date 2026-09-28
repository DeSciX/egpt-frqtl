/**
 * arena-scope-across-cells.test.mjs — FRAQTL issue #67.
 *
 * THE DEFECT: on the STATIC/PROD bundle an EGPT value is an arena handle into the
 * WASM-side arena. `Runtime.runCell()` used to end the math scope in a `.finally()`
 * after EVERY cell, and `reset_scope` drains the arena AND increments its epoch — so
 * every value a cell committed into the kernel's binding store was a dead handle
 * before the next cell could read it, and the run stopped with
 * `arena:stale-handle:epoch=N,current=M`. DEV never showed it: the dev source entry
 * serves the JS math core, whose values are self-contained objects, so the epoch bump
 * is invisible there even with `?mathBackend=wasm`.
 *
 * THE RULE this file gates: the math value scope IS the kernel's binding scope
 * (`NotebookKernel.resetScope()` — `runAll()` begins one, `dispose()` ends one);
 * a CELL is not a run.
 *
 * WHY IT DRIVES THE BUILT DIST: the value model IS the defect. Against the JS
 * reference (or a stub provider) a value crossing a cell boundary is a plain object
 * and the fixture cannot exhibit the failure however green it runs. `make verify`
 * builds `sdk/egpt-math-sdk/dist` in `verify-publish-surface`, which runs BEFORE
 * `test-js` — so the artifact is a precondition here, and its absence FAILS LOUD
 * naming the command rather than skipping.
 *
 * Run: node --test lib/shim/notebook/test/arena-scope-across-cells.test.mjs
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const DIST_ENTRY = path.join(repoRoot, 'sdk/egpt-math-sdk/dist/index.js');
const DIST_WASM  = path.join(repoRoot, 'sdk/egpt-math-sdk/dist/wasm');

for (const p of [DIST_ENTRY, path.join(DIST_WASM, 'egpt_math_sdk_wasm.js')]) {
    if (!existsSync(p)) {
        throw new Error(
            '[arena-scope] the built egpt-math-sdk dist is missing (' + p + '). ' +
            'Build it: (cd sdk/egpt-math-sdk && npm run build:wasm-bridge && npm run build). ' +
            '`make verify` builds it in verify-publish-surface before test-js.'
        );
    }
}

// ── DOM stubs so the shim module graph loads in Node (same shape as
//    lib/shim/runtime/test/math-backend-register.test.mjs) ────────────────────
const noop = function () {};
const noEl = { setAttribute: noop, style: {}, appendChild: noop };
globalThis.document = {
    readyState: 'complete',
    addEventListener: noop,
    removeEventListener: noop,
    getElementById: function () { return null; },
    createElement: function () { return Object.assign({}, noEl); },
    head: { appendChild: noop },
    body: { appendChild: noop }
};
globalThis.window = globalThis;
globalThis.window._egptWhenEngineReady = null;
globalThis.window._egptMathSdkUrl      = '';

// The REAL shipped factory, given the dist's own wasm artifacts as file URLs — the
// `window.createEgptMathSdk` seam the static shell uses.
const dist = await import(pathToFileURL(DIST_ENTRY).href);
globalThis.window.createEgptMathSdk = function () {
    return dist.createEgptMathSdk({
        wasmModuleUrl: pathToFileURL(path.join(DIST_WASM, 'egpt_math_sdk_wasm.js')).href,
        wasmUrl:       pathToFileURL(path.join(DIST_WASM, 'egpt_math_sdk_wasm_bg.wasm')).href
    });
};

const { Runtime }        = await import(pathToFileURL(path.join(repoRoot, 'lib/shim/runtime/index.js')).href);
const { NotebookKernel } = await import(pathToFileURL(path.join(repoRoot, 'lib/shim/notebook/kernel.js')).href);
const { parse }          = await import(pathToFileURL(path.join(repoRoot, 'lib/shim/notebook/format.js')).href);

Runtime.init({ mathBackend: 'wasm-math' });

let sdk = null;
before(async function () { sdk = await Runtime.ensureMath(); });

/** Live arena census from the shipped facade's own `arenaStats` op. */
function arena() { return JSON.parse(sdk.wasm.arenaStats()); }

function notebook(src) { return parse('<frqtl-notebook version="1" title="t">' + src + '</frqtl-notebook>'); }

const CROSS_CELL_NB =
    '<cell type="js" lane="math" id="produce" out="a">\n' +
    'const { math } = caps;\n' +
    'const a = math.EGPTReal.fromRational(3n, 2n);\n' +
    'return { a };\n' +
    '</cell>\n' +
    '<cell type="js" lane="math" id="consume" in="a" out="sum">\n' +
    'const { math } = caps;\n' +
    'const sum = math.EGPTMath.add(inputs.a, inputs.a);\n' +
    'return { sum };\n' +
    '</cell>\n';

describe('the fixture can exhibit the failure', function () {
    test('the active backend is wasm-math and a crossing value IS an arena handle', async function () {
        // Without this, every assertion below would pass against the JS reference
        // while proving nothing about the defect.
        assert.equal(sdk.activeMathBackend, 'wasm-math',
            'the built dist must resolve to wasm-math — otherwise this file is vacuous');
        const k = new NotebookKernel(notebook(CROSS_CELL_NB));
        await k.runCell('produce');
        const v = k.getBinding('a').value;
        const before = arena();
        // The value the kernel now holds lives in the arena: drain it and the very
        // same object stops working. THAT is the property the defect rode on.
        Runtime.resetMathScope();
        assert.ok(arena().epoch > before.epoch, 'resetMathScope bumps the arena epoch');
        assert.throws(() => v.add(v), /arena:stale-handle/,
            'a crossing value is an arena handle, not a self-contained object');
        k.dispose();
    });
});

describe('a cell is not a run — a value bound in cell 1 is usable in cell 2', function () {
    test('runAll settles every cell ok and cell 2 computes the right value', async function () {
        const k = new NotebookKernel(notebook(CROSS_CELL_NB));
        const summary = await k.runAll();
        assert.equal(summary.ok, true,
            'Run All must reach the end (failed at "' + summary.failedCellId + '": ' + summary.error + ')');
        assert.equal(k.getCellState('consume').status, 'ok', 'the consuming cell settles ok');
        // Assert the VALUE, not merely the status — a surviving-but-wrong handle
        // would be a worse defect than the one being fixed.
        assert.equal(k.getBinding('sum').value.toCanonicalStr(), '3', '3/2 + 3/2 = 3');
        k.dispose();
    });

    test('a manual single-cell run does not end the scope either', async function () {
        const k = new NotebookKernel(notebook(CROSS_CELL_NB));
        await k.runCell('produce');          // the pane's per-cell Run button path
        const r = await k.runCell('consume');
        assert.equal(r.ok, true, 'the consumer runs off the producer\'s binding: ' + r.error);
        assert.equal(k.getBinding('sum').value.toCanonicalStr(), '3');
        k.dispose();
    });
});

/* NEGATIVE CONTROL for THIS property (a property's control is defined per property —
 * the revert-both-source-files control belongs to the cases above, which are red on the
 * old code while these two are green on it, by design). The control here is: delete the
 * `this._runtime.resetMathScope()` line from `NotebookKernel.resetScope()`, keep
 * everything else. Run and measured: both cases below FAIL (the captured handle keeps
 * working because the epoch never moves), as does the arena-bound case. That is what
 * these guard — a future "fix" that drops the epoch bump and silently reuses slots. */
describe('a genuinely stale handle still FAILS LOUD', function () {
    test('a value captured across a Run All boundary throws arena:stale-handle', async function () {
        const k = new NotebookKernel(notebook(CROSS_CELL_NB));
        await k.runAll();
        const captured = k.getBinding('a').value;   // what a closure or chart would hold
        await k.runAll();                            // a new run → a new scope
        assert.throws(() => captured.add(captured), /arena:stale-handle/,
            'the epoch bump is what makes a truly stale handle loud — never silence it');
        k.dispose();
    });

    test('dispose ends the scope: a value held past notebook unload throws', async function () {
        const k = new NotebookKernel(notebook(CROSS_CELL_NB));
        await k.runAll();
        const captured = k.getBinding('a').value;
        k.dispose();
        assert.throws(() => captured.add(captured), /arena:stale-handle/);
    });

    test('a fresh Run All does not let a previous run\'s binding satisfy an input', async function () {
        // `late` is produced by no cell. If runAll did not clear the store, a value
        // left by an earlier manual run would silently satisfy it.
        const k = new NotebookKernel(notebook(
            '<cell type="js" lane="math" id="only" in="late" out="x">\nreturn { x: 1 };\n</cell>\n'
        ));
        k.commitViewOutputs('ghost', { late: 7 });
        assert.equal(k.getBinding('late').value, 7, 'the store really is seeded');
        const summary = await k.runAll();
        assert.equal(summary.ok, false, 'a leftover binding must NOT satisfy a declared input');
        assert.match(summary.error, /not yet produced/);
        k.dispose();
    });
});

describe('the arena stays bounded', function () {
    // A cell that interns a lot: 2000 adds, each one a fresh arena slot.
    const HEAVY =
        '<cell type="js" lane="math" id="seed" out="acc">\n' +
        'const { math } = caps;\n' +
        'let acc = math.EGPTReal.fromBigInt(0n);\n' +
        'const one = math.EGPTReal.fromBigInt(1n);\n' +
        'for (let i = 0; i < 1000; i++) { acc = math.EGPTMath.add(acc, one); }\n' +
        'return { acc };\n' +
        '</cell>\n' +
        '<cell type="js" lane="math" id="more" in="acc" out="acc2">\n' +
        'const { math } = caps;\n' +
        'let acc2 = inputs.acc;\n' +
        'const one = math.EGPTReal.fromBigInt(1n);\n' +
        'for (let i = 0; i < 1000; i++) { acc2 = math.EGPTMath.add(acc2, one); }\n' +
        'return { acc2 };\n' +
        '</cell>\n';

    test('repeated Run All does not grow the arena; dispose drains it to zero', async function () {
        const k = new NotebookKernel(notebook(HEAVY));

        await k.runAll();
        const afterRun1 = arena().len;
        await k.runAll();
        const afterRun2 = arena().len;
        await k.runAll();
        const afterRun3 = arena().len;

        assert.ok(afterRun1 > 2000, 'the heavy notebook really does intern (len=' + afterRun1 + ')');
        // THE BOUND: each run begins a fresh scope, so N runs cost ONE run's worth —
        // not N. Identical runs are byte-identical in allocation, hence equality.
        assert.equal(afterRun2, afterRun1,
            'run 2 costs exactly one run (run1=' + afterRun1 + ' run2=' + afterRun2 + ')');
        assert.equal(afterRun3, afterRun1,
            'and run 3 too (run3=' + afterRun3 + ')');
        assert.equal(k.getBinding('acc2').value.toCanonicalStr(), '2000',
            'still the right answer after three runs');

        k.dispose();
        assert.equal(arena().len, 0, 'notebook unload drains the arena');
    });
});

after(function () {
    // Leave no resident values behind for whatever runs next in this process.
    Runtime.resetMathScope();
});
