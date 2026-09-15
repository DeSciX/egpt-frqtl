/**
 * realm-kernel-binding.test.mjs — WS-NOTEBOOK-REALM-KERNEL-BINDING (the realm→kernel
 * binding commit seam). The 8-test node-only plan from the design spec §10. NO browser /
 * vite / VSCode: pure modules + doubles only.
 *
 * 1. view-handle serializability boundary (extend) — a plain histogram passes, a live ref throws.
 * 2. format.js round-trip — produces/produceVia parse + idempotent serialize (folded out omitted).
 * 3. kernel.commitViewOutputs commit → staleness (extend) — version++, re-stale, FAIL-LOUD preserved.
 * 4. producer-discovery over produces-folded out — _findProducerCellId + runOrder place canvas first.
 * 5. the C8 guard (canvas-guard) — legal producing canvas vs every retired runner-ref shape.
 * 6. realm-entry derive+post (deriveProducedBindings) — derive serializable, post one per name, FAIL-LOUD.
 * 7. [TOMBSTONE] controller-core.js DELETED (WS-VSIX-PHASE2 single-stack cut).
 * 8. [TOMBSTONE] realm-binding-barrier.js DELETED (WS-VSIX-PHASE2 single-stack cut).
 *
 * Run: node --test lib/shim/notebook/test/realm-kernel-binding.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { assertSerializable } = await import(path.join(repoRoot, 'lib/shim/notebook/view-handle.js'));
const { parse, serialize, normalize } = await import(path.join(repoRoot, 'lib/shim/notebook/format.js'));
const { NotebookKernel, NOTEBOOK_CELL_STATUS } = await import(path.join(repoRoot, 'lib/shim/notebook/kernel.js'));
const { assertDeclaredCanvasLegal } = await import(path.join(repoRoot, 'lib/shim/notebook/canvas-guard.js'));
const { deriveProducedBindings } = await import(path.join(repoRoot, 'lib/shim/notebook/produced-bindings.js'));
// controller-core.js and realm-binding-barrier.js were deleted in WS-VSIX-PHASE2.
// Tests 7 and 8 below are now tombstone assertions (file-absence guarantees).

const STATUS = NOTEBOOK_CELL_STATUS;

/* a tiny stub Bus that records emitted cellstate events (kernel must NOT call on/off). */
function makeStubBus() {
    const events = [];
    return {
        events,
        emit(event, payload) { events.push({ event, payload }); },
        on() { throw new Error('kernel must not register Bus listeners (veto #1)'); },
        off() { throw new Error('kernel must not call Bus.off'); }
    };
}

/* a stub runtime — the kernel only calls runCell for js/canvas RUNCELL cells; the seam
 * commits via commitViewOutputs which never touches the runtime. */
function makeStubRuntime() {
    return { math: { activeMathBackend: 'js-reference' }, runCell() { return Promise.resolve({ ok: true, outputs: {} }); } };
}

function nb(cells) { return { title: 't', version: '1', cells }; }

/* ── TEST 1 — view-handle serializability boundary ──────────────────────────── */
describe('1. assertSerializable boundary', function () {
    test('a plain { binKey: count } histogram passes', function () {
        const hist = { '0': 12, '1': 7, '2': 3 };
        assert.strictEqual(assertSerializable(hist, 'hist'), hist);
    });
    test('a fn-bearing live-runner double throws (the misconfigured produceVia FAIL-LOUD)', function () {
        const liveRunnerDouble = { setupResult: {}, start() {}, step() {}, dispose() {} };
        assert.throws(() => assertSerializable(liveRunnerDouble, 'produces("hist")'), /not (structured-clone-)?serializable|VETO-CLASS/);
    });
});

/* ── TEST 2 — format.js round-trip of produces/produceVia ───────────────────── */
describe('2. format produces/produceVia round-trip', function () {
    test('parse folds produces into out + keeps the raw produces/produceVia', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c-ds-canvas" setup="./s.js#f" stage="480x480" seed="42" produces="hist" produceVia="detectorHistogram"></cell>' +
            '<cell type="chart" id="c-ds-chart" in="hist" spec="bar:hist"></cell>' +
            '</frqtl-notebook>';
        const parsed = parse(html);
        const canvas = parsed.cells[0];
        assert.deepStrictEqual(canvas.produces, ['hist']);
        assert.strictEqual(canvas.produceVia, 'detectorHistogram');
        // produces is FOLDED into out (one producer-discovery authority).
        assert.deepStrictEqual(canvas.out, ['hist']);
    });

    test('normalize(parse(serialize(nb))) is idempotent; folded out is NOT re-emitted', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c" setup="./s.js#f" produces="hist" produceVia="detectorHistogram"></cell>' +
            '</frqtl-notebook>';
        const a = parse(html);
        const round = normalize(a);
        assert.deepStrictEqual(round, a);
        // The serialized form re-emits `produces` and omits the folded `out` (out == produces).
        const text = serialize(a);
        assert.match(text, /produces="hist"/);
        assert.match(text, /produceVia="detectorHistogram"/);
        assert.doesNotMatch(text, /\bout="hist"/);
    });

    test('a non-producing canvas omits produces/produceVia on serialize (idempotent)', function () {
        const html = '<frqtl-notebook version="1">' +
            '<cell type="canvas" id="c" setup="./s.js#f" stage="480x480"></cell>' +
            '</frqtl-notebook>';
        const a = parse(html);
        assert.deepStrictEqual(a.cells[0].produces, []);
        assert.strictEqual(a.cells[0].produceVia, '');
        const text = serialize(a);
        assert.doesNotMatch(text, /produces=/);
        assert.doesNotMatch(text, /produceVia=/);
        assert.deepStrictEqual(normalize(a), a);
    });
});

/* ── TEST 3 — commitViewOutputs commit → staleness, FAIL-LOUD preserved ─────── */
describe('3. kernel.commitViewOutputs commit → staleness', function () {
    test('chart-first FAILS LOUD; commit sets binding v1; second commit ++version + re-stales', async function () {
        const bus = makeStubBus();
        const k = new NotebookKernel(nb([
            { id: 'c-ds-canvas', type: 'canvas', lane: '', in: [], out: ['hist'] },
            { id: 'c-ds-chart', type: 'js', lane: 'math', in: ['hist'], out: [], body: 'return {};' }
        ]), { runtime: makeStubRuntime(), bus });

        // Run the consumer BEFORE production → FAIL-LOUD "not yet produced".
        await assert.rejects(() => k.runCell('c-ds-chart'), /not yet produced/);
        assert.strictEqual(k.getBinding('hist'), null);

        // Commit from the canvas → binding present, version 1, producer recorded.
        k.commitViewOutputs('c-ds-canvas', { hist: { '0': 5 } });
        const b1 = k.getBinding('hist');
        assert.deepStrictEqual(b1.value, { '0': 5 });
        assert.strictEqual(b1.version, 1);
        assert.strictEqual(b1.producerCellId, 'c-ds-canvas');

        // The consumer ran (errored) before → it is re-marked stale by the commit.
        assert.strictEqual(k.getCellState('c-ds-chart').status, STATUS.STALE);

        // A second commit ++version to 2 and re-stales.
        k.getCellState('c-ds-chart').status = STATUS.OK; // pretend it re-ran ok
        k.commitViewOutputs('c-ds-canvas', { hist: { '0': 9 } });
        assert.strictEqual(k.getBinding('hist').version, 2);
        assert.strictEqual(k.getCellState('c-ds-chart').status, STATUS.STALE);
    });
});

/* ── TEST 4 — producer-discovery over produces-folded out ───────────────────── */
describe('4. producer-discovery + runOrder over produces-folded out', function () {
    test('_findProducerCellId names the canvas; runOrder places it before the consumers', function () {
        // Mirror what format.parse yields: produces folded into out.
        const k = new NotebookKernel(nb([
            { id: 'c-ds-chart', type: 'canvas', lane: '', in: ['hist'], out: [] },          // a consumer first in doc order
            { id: 'c-rosetta', type: 'js', lane: 'math', in: ['hist'], out: ['chain'], body: 'return { chain: 1 };' },
            { id: 'c-ds-canvas', type: 'canvas', lane: '', in: [], out: ['hist'], produces: ['hist'] }
        ]), { runtime: makeStubRuntime(), bus: makeStubBus() });

        assert.strictEqual(k._findProducerCellId('hist'), 'c-ds-canvas');
        const order = k.runOrder().map((c) => c.id);
        // The canvas (producer of hist) must come before BOTH hist consumers.
        assert.ok(order.indexOf('c-ds-canvas') < order.indexOf('c-ds-chart'), 'canvas before chart');
        assert.ok(order.indexOf('c-ds-canvas') < order.indexOf('c-rosetta'), 'canvas before rosetta');
    });
});

/* ── TEST 5 — the C8 canvas guard ───────────────────────────────────────────── */
describe('5. C8 declared-canvas guard', function () {
    test('LEGAL: setup + produces=[hist] + out=[hist] (folded), no bind/in', function () {
        assert.doesNotThrow(() => assertDeclaredCanvasLegal(
            { id: 'c', setup: './s.js#f', produces: ['hist'], out: ['hist'], in: [], bind: '' }));
    });
    test('FAIL-LOUD: a legacy bind=dsRun runner ref', function () {
        assert.throws(() => assertDeclaredCanvasLegal(
            { id: 'c', setup: './s.js#f', produces: [], out: [], in: [], bind: 'dsRun' }), /legacy|runner reference/);
    });
    test('FAIL-LOUD: a legacy in=[dsRun] runner ref', function () {
        assert.throws(() => assertDeclaredCanvasLegal(
            { id: 'c', setup: './s.js#f', produces: [], out: [], in: ['dsRun'], bind: '' }), /legacy|runner reference/);
    });
    test('FAIL-LOUD: an out NOT in produces (legacy out=dsRun)', function () {
        assert.throws(() => assertDeclaredCanvasLegal(
            { id: 'c', setup: './s.js#f', produces: [], out: ['dsRun'], in: [], bind: '' }), /legacy|runner reference/);
    });
    test('FAIL-LOUD: a spec (retired factory)', function () {
        assert.throws(() => assertDeclaredCanvasLegal(
            { id: 'c', setup: '', spec: 'setupX', produces: [], out: [], in: [], bind: '' }), /spec|RETIRED/);
    });
    test('FAIL-LOUD: no setup', function () {
        assert.throws(() => assertDeclaredCanvasLegal(
            { id: 'c', setup: '', produces: ['hist'], out: ['hist'], in: [], bind: '' }), /no `setup`|nothing to render/);
    });
});

/* ── TEST 6 — realm-entry derive+post (deriveProducedBindings) ──────────────────
 * The frozen view-handle is ASYNC-shaped: `call()` returns a Promise on both the
 * same-origin in-app transport and the cross-origin .vsix transport. These fakes are
 * async (return Promises) to match reality — a SYNC fake masked the original bug where
 * the un-awaited Promise reached `assertSerializable` and FAILED LOUD spuriously
 * ("#<Promise> could not be cloned"). deriveProducedBindings is async; await it. */
describe('6. deriveProducedBindings (realm-entry derive+post)', function () {
    test('derives a serializable value per produces name from the ASYNC frozen handle', async function () {
        const handle = { call(fn) { if (fn === 'detectorHistogram') { return Promise.resolve({ '0': 3 }); } return Promise.reject(new Error('unknown ' + fn)); } };
        const derived = await deriveProducedBindings(handle, ['hist'], 'detectorHistogram');
        assert.deepStrictEqual(derived, [{ name: 'hist', value: { '0': 3 } }]);
    });
    test('REGRESSION: a Promise-returning call is AWAITED, not committed as a Promise', async function () {
        // The exact bug from the double-slit smoke: value must be the RESOLVED object,
        // never the Promise (a Promise is not structured-clone-serializable).
        const handle = { call() { return Promise.resolve({ binA: 5, binB: 7 }); } };
        const derived = await deriveProducedBindings(handle, ['hist'], 'detectorHistogram');
        assert.deepStrictEqual(derived, [{ name: 'hist', value: { binA: 5, binB: 7 } }]);
        assert.ok(!(derived[0].value instanceof Promise), 'value is the resolved object, not a Promise');
    });
    test('defaults produceVia to detectorHistogram', async function () {
        const handle = { call(fn) { return fn === 'detectorHistogram' ? Promise.resolve({ '0': 1 }) : Promise.reject(new Error('x')); } };
        const derived = await deriveProducedBindings(handle, ['hist']);
        assert.deepStrictEqual(derived, [{ name: 'hist', value: { '0': 1 } }]);
    });
    test('a throwing produceVia (unknown call) PROPAGATES (→ realm:error, no realm:binding)', async function () {
        const handle = { call() { return Promise.reject(new Error('[realm-frqtl] call: unknown fn')); } };
        await assert.rejects(() => deriveProducedBindings(handle, ['hist'], 'nope'), /unknown fn/);
    });
    test('a non-serializable derived value FAILS LOUD before posting', async function () {
        const handle = { call() { return Promise.resolve({ live() {} }); } };  // fn-bearing → not serializable
        await assert.rejects(() => deriveProducedBindings(handle, ['hist'], 'detectorHistogram'), /serializable|VETO-CLASS/);
    });
    test('empty produces → [] (no derive, no post)', async function () {
        assert.deepStrictEqual(await deriveProducedBindings({ call() { throw new Error('should not call'); } }, []), []);
    });
});

/* ── TEST 7 — [TOMBSTONE] controller-core.js DELETED (WS-VSIX-PHASE2) ──────── */
describe('7. [TOMBSTONE] controller-core.js deleted (Phase 2 single-stack cut)', function () {
    test('apps/vscode-notebook/src/controller-core.js does not exist', function () {
        // Phase 2 deleted the entire Notebook-API controller. File absence is the strongest
        // tombstone — commitRealmBinding cannot regress if the file is gone.
        assert.ok(!existsSync(path.join(repoRoot, 'apps/vscode-notebook/src/controller-core.js')),
            'controller-core.js must be deleted (Phase 2 single-stack cut removed the Notebook-API stack)');
    });
});

/* ── TEST 8 — [TOMBSTONE] realm-binding-barrier.js DELETED (WS-VSIX-PHASE2) ── */
describe('8. [TOMBSTONE] realm-binding-barrier.js deleted (Phase 2 single-stack cut)', function () {
    test('apps/vscode-notebook/src/realm-binding-barrier.js does not exist', function () {
        // Phase 2 deleted the Run-All barrier (it was ext-host execution machinery; the
        // single-stack shell runs all execution in-page). File absence is the tombstone.
        assert.ok(!existsSync(path.join(repoRoot, 'apps/vscode-notebook/src/realm-binding-barrier.js')),
            'realm-binding-barrier.js must be deleted (Phase 2 single-stack cut removed the Notebook-API stack)');
    });
});
