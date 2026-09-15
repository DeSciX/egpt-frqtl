/**
 * kernel.test.mjs — WS-NOTEBOOK-A1 NotebookKernel binding/staleness behavior.
 *
 * Uses a STUB runtime (no Runtime import, no SDK) so the kernel's orchestration
 * is tested in isolation: input resolution, output commit + versioning, staleness
 * marking (marks-stale-NEVER-auto-runs), the single outbound notebook:cellstate
 * event, per-instance isolation, and dispose.
 *
 * Run: node --test lib/shim/notebook/test/kernel.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { NotebookKernel, NOTEBOOK_CELL_STATUS } = await import(
    path.join(repoRoot, 'lib/shim/notebook/kernel.js')
);

// ── a tiny synchronous-ish stub Bus that records emitted events ──────────────
function makeStubBus() {
    const events = [];
    return {
        events,
        emit(event, payload) { events.push({ event, payload }); },
        // The kernel must NEVER call on()/off() (veto #1). If it does, fail loud.
        on() { throw new Error('kernel must not register Bus listeners (veto #1)'); },
        off() { throw new Error('kernel must not call Bus.off'); },
        once() { throw new Error('kernel must not call Bus.once'); }
    };
}

// ── a stub runtime whose runCell echoes a body-evaluated output bag ──────────
// It records how many times each cell id was run (to prove no-auto-run).
function makeStubRuntime() {
    const runLog = [];
    return {
        runLog,
        runCell(spec) {
            runLog.push(spec.id);
            // Evaluate the cell body as `(inputs) => ({...})` for realistic outputs.
            try {
                const fn = new Function('inputs', spec.code); // eslint-disable-line no-new-func
                const returned = fn(spec.inputs) || {};
                const outputs = {};
                (spec.declaredOutputs || []).forEach((k) => {
                    if (!Object.prototype.hasOwnProperty.call(returned, k)) {
                        throw new Error('missing declared output ' + k);
                    }
                    outputs[k] = returned[k];
                });
                return Promise.resolve({ outputs, ok: true, error: null });
            } catch (e) {
                return Promise.resolve({ outputs: {}, ok: false, error: e.message });
            }
        }
    };
}

function nb(cells) { return { title: 't', version: '1', cells }; }

describe('NotebookKernel — binding store + versioning', function () {

    test('runCell commits declared outputs with version 1, increments on re-run', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([
            { id: 'p', lane: 'math', in: [], out: ['v'], body: 'return { v: 10 };' }
        ]), { runtime: rt, bus });

        await kernel.runCell('p');
        assert.strictEqual(kernel.getBinding('v').value, 10);
        assert.strictEqual(kernel.getBinding('v').version, 1);
        assert.strictEqual(kernel.getBinding('v').producerCellId, 'p');

        await kernel.runCell('p');
        assert.strictEqual(kernel.getBinding('v').version, 2, 'version increments on re-run');
        kernel.dispose();
    });

    test('reuses Encoding-like objects as binding values without copying', async function () {
        const bus = makeStubBus();
        const sentinel = { __encoding: true, payload: [1, 2, 3] };
        const rt = {
            runCell(spec) { return Promise.resolve({ outputs: { enc: sentinel }, ok: true, error: null }); }
        };
        const kernel = new NotebookKernel(nb([
            { id: 'p', lane: 'math', in: [], out: ['enc'], body: '' }
        ]), { runtime: rt, bus });
        await kernel.runCell('p');
        assert.strictEqual(kernel.getBinding('enc').value, sentinel, 'value is the same object reference');
        kernel.dispose();
    });

});

describe('NotebookKernel — staleness marks only, NEVER auto-runs', function () {

    test('re-running a producer marks a previously-ok consumer stale, does NOT run it', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([
            { id: 'p', lane: 'math', in: [], out: ['v'], body: 'return { v: 1 };' },
            { id: 'c', lane: 'math', in: ['v'], out: ['w'], body: 'return { w: inputs.v + 1 };' }
        ]), { runtime: rt, bus });

        await kernel.runCell('p');     // v=1, version 1
        await kernel.runCell('c');     // consumer runs ok
        assert.strictEqual(kernel.getCellState('c').status, NOTEBOOK_CELL_STATUS.OK);

        const runsBefore = rt.runLog.length;
        await kernel.runCell('p');     // re-produce v → consumer should go STALE only

        assert.strictEqual(kernel.getCellState('c').status, NOTEBOOK_CELL_STATUS.STALE,
            'consumer marked stale after upstream re-run');
        assert.strictEqual(rt.runLog.length, runsBefore + 1,
            'ONLY the producer ran — the stale consumer was NOT auto-run');
        kernel.dispose();
    });

    test('an idle (never-run) consumer is not marked stale by a producer run', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([
            { id: 'p', lane: 'math', in: [], out: ['v'], body: 'return { v: 1 };' },
            { id: 'c', lane: 'math', in: ['v'], out: [], body: 'return {};' }
        ]), { runtime: rt, bus });

        await kernel.runCell('p');
        assert.strictEqual(kernel.getCellState('c').status, NOTEBOOK_CELL_STATUS.IDLE,
            'never-run consumer stays idle (nothing to invalidate)');
        kernel.dispose();
    });

});

describe('NotebookKernel — single outbound event, no inbound listeners', function () {

    test('emits notebook:cellstate transitions and NOTHING else', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([
            { id: 'p', lane: 'math', in: [], out: ['v'], body: 'return { v: 1 };' }
        ]), { runtime: rt, bus });

        await kernel.runCell('p');

        const eventNames = new Set(bus.events.map((e) => e.event));
        assert.deepStrictEqual([...eventNames], ['notebook:cellstate'],
            'kernel emits ONLY notebook:cellstate (no cell:run/cell:result)');
        const statuses = bus.events.map((e) => e.payload.status);
        assert.deepStrictEqual(statuses, [NOTEBOOK_CELL_STATUS.RUNNING, NOTEBOOK_CELL_STATUS.OK],
            'running → ok transition emitted');
        kernel.dispose();
    });

});

describe('NotebookKernel — per-instance isolation + dispose', function () {

    test('two kernels do not share a binding store', async function () {
        const rt = makeStubRuntime();
        const k1 = new NotebookKernel(nb([{ id: 'p', lane: 'math', in: [], out: ['v'], body: 'return { v: 1 };' }]), { runtime: rt, bus: makeStubBus() });
        const k2 = new NotebookKernel(nb([{ id: 'p', lane: 'math', in: [], out: ['v'], body: 'return { v: 2 };' }]), { runtime: rt, bus: makeStubBus() });
        await k1.runCell('p');
        await k2.runCell('p');
        assert.strictEqual(k1.getBinding('v').value, 1);
        assert.strictEqual(k2.getBinding('v').value, 2, 'instances are isolated, not a module singleton');
        k1.dispose();
        k2.dispose();
    });

    test('dispose clears state and rejects further runs', async function () {
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([{ id: 'p', lane: 'math', in: [], out: ['v'], body: 'return { v: 1 };' }]), { runtime: rt, bus: makeStubBus() });
        await kernel.runCell('p');
        kernel.dispose();
        assert.strictEqual(kernel.getBinding('v'), null, 'bindings cleared on dispose');
        await assert.rejects(() => kernel.runCell('p'), /disposed/);
    });

    test('FAIL-LOUD on a bad notebook shape', function () {
        assert.throws(() => new NotebookKernel({}, {}), /requires a notebook object with a cells/);
    });

});

describe('NotebookKernel — commitViewOutputs (canvas/chart view cells)', function () {

    test('commits a view-cell binding (++version), marks consumers stale, NEVER runs them', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        // canvas cell `cv` binds dsRun (a view cell — never goes through runCell);
        // js cell `c` consumes dsRun. cv commits the live handle via commitViewOutputs.
        const kernel = new NotebookKernel(nb([
            { id: 'cv', type: 'canvas', lane: 'frqtl', in: [], out: [], bind: 'dsRun', body: '' },
            { id: 'c',  type: 'js', lane: 'frqtl', in: ['dsRun'], out: ['hist'], body: 'return { hist: 1 };' }
        ]), { runtime: rt, bus });

        const liveRunner = { __runner: true };
        kernel.commitViewOutputs('cv', { dsRun: liveRunner });
        assert.strictEqual(kernel.getBinding('dsRun').value, liveRunner, 'view binding is the live handle');
        assert.strictEqual(kernel.getBinding('dsRun').version, 1);
        assert.strictEqual(kernel.getCellState('cv').status, NOTEBOOK_CELL_STATUS.OK, 'view cell marked ok');

        // The consumer can now resolve its input (no auto-run happened).
        const runsBefore = rt.runLog.length;
        await kernel.runCell('c');
        assert.strictEqual(rt.runLog.length, runsBefore + 1, 'only the consumer ran, on explicit Run');
        assert.strictEqual(kernel.getCellState('c').status, NOTEBOOK_CELL_STATUS.OK);

        // Re-committing the view output marks the (ok) consumer stale — never re-runs it.
        kernel.commitViewOutputs('cv', { dsRun: { __runner: 2 } });
        assert.strictEqual(kernel.getBinding('dsRun').version, 2, 'version increments on re-commit');
        assert.strictEqual(kernel.getCellState('c').status, NOTEBOOK_CELL_STATUS.STALE,
            'consumer marked stale after view re-commit (NOT auto-run)');
        assert.strictEqual(rt.runLog.length, runsBefore + 1, 'no extra run from commitViewOutputs');
        kernel.dispose();
    });

    test('commitViewOutputs after dispose is a no-op', function () {
        const kernel = new NotebookKernel(nb([
            { id: 'cv', type: 'canvas', in: [], out: [], bind: 'd', body: '' }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });
        kernel.dispose();
        kernel.commitViewOutputs('cv', { d: 1 });   // must not throw
        assert.strictEqual(kernel.getBinding('d'), null);
    });

});

/* ── WS-NOTEBOOK-RUNALL — runOrder + runAll (sequencer over runCell) ──────────
 *
 * Mirrors runcell-single-handler.test.mjs intent: prove Run All is a SEQUENCER
 * over the existing runCell path — it (1) runs cells in dependency order then
 * document order, (2) skips markdown, (3) stops FAIL-LOUD on the first error
 * naming the cell, and (4) adds NO new executor (it only ever calls runCell +
 * emits one progress event per step; it registers ZERO Bus listeners — the stub
 * bus's on()/off()/once() throw, so any inbound subscription fails the test).
 */
describe('NotebookKernel.runOrder — dependency order, document-order tiebreak', function () {

    test('orders a producer before its consumers; skips markdown', function () {
        // Document order deliberately puts a consumer BEFORE its producer to prove
        // the topological sort (not document order) governs when deps are declared.
        const kernel = new NotebookKernel(nb([
            { id: 'md1', type: 'markdown', body: '# header' },
            { id: 'consumer', type: 'js', lane: 'math', in: ['v'], out: ['w'], body: 'return { w: inputs.v + 1 };' },
            { id: 'producer', type: 'js', lane: 'math', in: [], out: ['v'], body: 'return { v: 1 };' }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });

        const order = kernel.runOrder().map((c) => c.id);
        assert.deepStrictEqual(order, ['producer', 'consumer'],
            'producer runs before consumer regardless of document order; markdown skipped');
        kernel.dispose();
    });

    test('falls back to document order when no in/out is declared', function () {
        const kernel = new NotebookKernel(nb([
            { id: 'a', type: 'js', lane: 'math', in: [], out: [], body: 'return {};' },
            { id: 'md', type: 'markdown', body: 'x' },
            { id: 'b', type: 'js', lane: 'math', in: [], out: [], body: 'return {};' },
            { id: 'c', type: 'js', lane: 'math', in: [], out: [], body: 'return {};' }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });

        assert.deepStrictEqual(kernel.runOrder().map((c) => c.id), ['a', 'b', 'c'],
            'no deps → document order, markdown excluded');
        kernel.dispose();
    });

    test('FAIL-LOUD on a dependency cycle (no safe linear order)', function () {
        const kernel = new NotebookKernel(nb([
            { id: 'a', type: 'js', lane: 'math', in: ['y'], out: ['x'], body: 'return { x: 1 };' },
            { id: 'b', type: 'js', lane: 'math', in: ['x'], out: ['y'], body: 'return { y: 1 };' }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });

        assert.throws(() => kernel.runOrder(), /dependency CYCLE/,
            'a true in/out cycle cannot be linearised → FAIL-LOUD');
        kernel.dispose();
    });

});

describe('NotebookKernel.runAll — sequencer over runCell (no new executor)', function () {

    test('runs every runnable cell in dependency order, all OK, bindings flow', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([
            { id: 'md', type: 'markdown', body: '# intro' },
            { id: 'consumer', type: 'js', lane: 'math', in: ['v'], out: ['w'], body: 'return { w: inputs.v + 5 };' },
            { id: 'producer', type: 'js', lane: 'math', in: [], out: ['v'], body: 'return { v: 10 };' }
        ]), { runtime: rt, bus });

        const summary = await kernel.runAll();
        assert.strictEqual(summary.ok, true, 'whole notebook ran ok');
        assert.strictEqual(summary.total, 2, 'two runnable cells (markdown excluded)');
        assert.strictEqual(summary.ran, 2);
        // Producer ran BEFORE consumer → consumer saw v=10 and produced w=15.
        assert.deepStrictEqual(rt.runLog, ['producer', 'consumer'],
            'sequential, dependency order — producer before consumer');
        assert.strictEqual(kernel.getBinding('w').value, 15,
            'binding flowed: consumer read the producer output committed before it ran');
        kernel.dispose();
    });

    test('STOPS FAIL-LOUD at the first failing cell, naming it; does not run the rest', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([
            { id: 'ok1',    type: 'js', lane: 'math', in: [], out: ['a'], body: 'return { a: 1 };' },
            { id: 'broken', type: 'js', lane: 'math', in: [], out: ['b'], body: 'throw new Error("boom");' },
            { id: 'never',  type: 'js', lane: 'math', in: [], out: ['c'], body: 'return { c: 3 };' }
        ]), { runtime: rt, bus });

        const summary = await kernel.runAll();
        assert.strictEqual(summary.ok, false, 'a failing cell fails the whole Run All');
        assert.strictEqual(summary.failedCellId, 'broken', 'the failed cell is named');
        assert.match(summary.error, /boom/, 'the failure error is surfaced');
        assert.strictEqual(summary.ran, 2, 'ran ok1 + broken, then STOPPED');
        assert.deepStrictEqual(rt.runLog, ['ok1', 'broken'],
            'the cell AFTER the failure ("never") was NOT run — no silent continue');
        kernel.dispose();
    });

    test('uses opts.runner for canvas cells (the kernel never runCells a canvas)', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const ranByPane = [];
        const kernel = new NotebookKernel(nb([
            { id: 'cv', type: 'canvas', lane: 'frqtl', in: [], out: [], bind: 'dsRun', body: '' },
            { id: 'js', type: 'js', lane: 'math', in: [], out: ['v'], body: 'return { v: 1 };' }
        ]), { runtime: rt, bus });

        const runner = (cell) => {
            if (cell.type !== 'canvas') { return null; }   // js falls through to runCell
            ranByPane.push(cell.id);
            return Promise.resolve({ ok: true });
        };
        const summary = await kernel.runAll({ runner });
        assert.strictEqual(summary.ok, true);
        assert.deepStrictEqual(ranByPane, ['cv'], 'the canvas cell ran via the pane runner');
        assert.deepStrictEqual(rt.runLog, ['js'], 'only the js cell hit runCell — canvas never did');
        kernel.dispose();
    });

    // FRAQTL issue #61 (ws-artifact-showcase Bite A2 regression): runOrder()/runAll()
    // used to silently EXCLUDE `chart` and `view` cells entirely (RUNNABLE was
    // {js, canvas} only) — a fresh notebook reported `total:N ran:N` while never
    // running its chart/view cells at all. Fixed by adding both to RUNNABLE.
    test('runOrder includes chart and view cells (issue #61)', function () {
        const kernel = new NotebookKernel(nb([
            { id: 'md',    type: 'markdown', body: '# intro' },
            { id: 'ch',    type: 'chart',    lane: 'chart', in: ['v'], out: [], body: '' },
            { id: 'vw',    type: 'view',     lane: 'frqtl', in: ['v'], out: [], body: '' },
            { id: 'js',    type: 'js',       lane: 'math',  in: [], out: ['v'], body: 'return { v: 1 };' }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });

        const order = kernel.runOrder().map((c) => c.id);
        assert.deepStrictEqual(order, ['js', 'ch', 'vw'],
            'chart + view are RUNNABLE, ordered after their producer, markdown excluded');
        kernel.dispose();
    });

    test('runAll uses opts.runner for chart AND view cells (issue #61)', async function () {
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const ranByPane = [];
        const kernel = new NotebookKernel(nb([
            { id: 'js', type: 'js',    lane: 'math',  in: [], out: ['v'], body: 'return { v: 1 };' },
            { id: 'ch', type: 'chart', lane: 'chart',  in: ['v'], out: [], body: '' },
            { id: 'vw', type: 'view',  lane: 'frqtl',  in: ['v'], out: [], body: '' }
        ]), { runtime: rt, bus });

        const runner = (cell) => {
            if (cell.type !== 'chart' && cell.type !== 'view') { return null; }
            ranByPane.push(cell.id);
            return Promise.resolve({ ok: true });
        };
        const summary = await kernel.runAll({ runner });
        assert.strictEqual(summary.ok, true, 'all three cells ran ok');
        assert.strictEqual(summary.total, 3, 'js + chart + view are all runnable');
        assert.deepStrictEqual(ranByPane, ['ch', 'vw'],
            'BOTH chart and view ran via the pane runner (view used to be silently skipped)');
        assert.deepStrictEqual(rt.runLog, ['js'], 'only the js cell hit runCell directly');
        kernel.dispose();
    });

    test('emits exactly one notebook:runall progress event per phase, NO inbound listeners', async function () {
        // makeStubBus().on/off/once throw — so reaching here proves runAll added
        // ZERO Bus listeners (no second executor). We also check the progress shape.
        const bus = makeStubBus();
        const rt = makeStubRuntime();
        const kernel = new NotebookKernel(nb([
            { id: 'a', type: 'js', lane: 'math', in: [], out: [], body: 'return {};' }
        ]), { runtime: rt, bus });

        await kernel.runAll();
        const runallEvents = bus.events.filter((e) => e.event === 'notebook:runall');
        const phases = runallEvents.map((e) => e.payload.phase);
        assert.deepStrictEqual(phases, ['running', 'ok'],
            'one running + one ok progress event for the single cell');
        runallEvents.forEach((e) => {
            assert.strictEqual(e.payload.total, 1, 'progress carries total (cell N of M)');
            assert.strictEqual(e.payload.cellId, 'a');
        });
        kernel.dispose();
    });

    test('disposed kernel rejects runAll', async function () {
        const kernel = new NotebookKernel(nb([
            { id: 'a', type: 'js', lane: 'math', in: [], out: [], body: 'return {};' }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });
        kernel.dispose();
        await assert.rejects(() => kernel.runAll(), /disposed/);
    });

});

describe('NotebookKernel — module set (WS-NOTEBOOK-IMPORT B2)', function () {

    test('moduleSet() collects type="module" cells keyed by name, read live from body', function () {
        const kernel = new NotebookKernel(nb([
            { type: 'module', name: './setups/wave.js', body: 'export const a = 1;' },
            { type: 'module', name: './setups/lib.js',  body: 'export const b = 2;' },
            { id: 'b', type: 'js', lane: 'frqtl', in: [], out: ['r'], body: 'return { r: 1 };' }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });
        const set = kernel.moduleSet();
        assert.deepStrictEqual(Object.keys(set).sort(), ['./setups/lib.js', './setups/wave.js']);
        assert.strictEqual(set['./setups/wave.js'], 'export const a = 1;');
        // module cells are NOT runnable (excluded from runOrder)
        const order = kernel.runOrder().map((c) => c.id || c.name);
        assert.ok(!order.includes('./setups/wave.js'), 'module cell not in runOrder');
        kernel.dispose();
    });

    test('runCell threads moduleSet() into the runtime spec.modules', async function () {
        let seenModules = null;
        const rt = {
            runCell(spec) { seenModules = spec.modules; return Promise.resolve({ outputs: {}, ok: true, error: null }); }
        };
        const kernel = new NotebookKernel(nb([
            { type: 'module', name: './setups/wave.js', body: 'export const a = 1;' },
            { id: 'b', type: 'js', lane: 'frqtl', in: [], out: [], body: "import {a} from './setups/wave.js'; return {};" }
        ]), { runtime: rt, bus: makeStubBus() });
        await kernel.runCell('b');
        assert.deepStrictEqual(seenModules, { './setups/wave.js': 'export const a = 1;' },
            'kernel threads the module set so the resolver can build the in-memory closure');
        kernel.dispose();
    });
});
