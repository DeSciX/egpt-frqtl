/**
 * fixtures.test.mjs — WS-NOTEBOOK-A2.
 *
 * Parses the two AUTHORED native notebooks (the QFT showcase port + the
 * double-slit → Rosetta → QFT dogfood) and asserts they are well-formed native
 * <frqtl-notebook> documents with the declared cell wiring the pane relies on.
 * This catches an authoring regression (a malformed cell, a stray Observable
 * <notebook> root, a dangling in/out edge) without a browser.
 *
 * Run: node --test lib/shim/notebook/test/fixtures.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { parse } = await import(path.join(repoRoot, 'lib/shim/notebook/format.js'));
const { synthesizeBuilderSource } = await import(path.join(repoRoot, 'lib/shim/notebook/setup-builder.js'));

function read(rel) { return readFileSync(path.join(repoRoot, rel), 'utf8'); }

// Every binding a cell consumes (`in`) must be produced somewhere (`out` or canvas `bind`).
function assertWiringClosed(nbk) {
    const produced = new Set();
    nbk.cells.forEach((c) => {
        (c.out || []).forEach((n) => produced.add(n));
        if (c.bind) { produced.add(c.bind); }
    });
    nbk.cells.forEach((c) => {
        (c.in || []).forEach((n) => {
            assert.ok(produced.has(n),
                `cell "${c.id}" consumes "${n}" but no cell produces it`);
        });
    });
}

describe('native notebook fixtures parse + wire', function () {

    test('QFT showcase — native format, no Observable root, run→verify wiring', function () {
        const html = read('lib/notebooks/frqtl-qft-benchmark.html');
        assert.ok(!/<notebook[\s>]/i.test(html), 'must NOT be an Observable <notebook> document');
        const nbk = parse(html);
        assert.ok(nbk.title && /Quantum Computer/.test(nbk.title));
        assert.ok(nbk.cells.length >= 9, 'has the showcase cells');

        const byId = Object.fromEntries(nbk.cells.filter(c => c.id).map(c => [c.id, c]));
        // The `run` cell produces `run`; verify + comparison consume it.
        assert.deepStrictEqual(byId.run.out, ['run']);
        assert.deepStrictEqual(byId.verify.in, ['run']);
        assert.deepStrictEqual(byId.comparison.in, ['run']);
        // No canvas/chart cells in the showcase (math-only).
        assert.ok(nbk.cells.every(c => c.type !== 'canvas'));
        assertWiringClosed(nbk);
    });

    test('dogfood — DECLARATIVE canvas (shim-managed builder), standalone qft', function () {
        const html = read('lib/notebooks/double-slit-rosetta-qft.html');
        assert.ok(!/<notebook[\s>]/i.test(html), 'must NOT be an Observable <notebook> document');
        const nbk = parse(html);
        const byId = Object.fromEntries(nbk.cells.filter(c => c.id).map(c => [c.id, c]));

        // The canvas DECLARES its setup (WS-NOTEBOOK-SHIM-MANAGED-BUILDER): the shim
        // synthesizes the builder + runs it realm-internal. NO authored builder cell, NO
        // opaque spec, NO bind=/in=/out= runner reference (the runner is realm-internal).
        assert.strictEqual(byId['c-ds-canvas'].type, 'canvas');
        assert.strictEqual(byId['c-ds-canvas'].setup, './setups/double-slit.js#setupDoubleSlit');
        assert.strictEqual(byId['c-ds-canvas'].stage, '480x480');
        assert.strictEqual(byId['c-ds-canvas'].seed, '42');
        assert.strictEqual(byId['c-ds-canvas'].bind, '', 'canvas carries no bind= runner ref');
        assert.deepStrictEqual(byId['c-ds-canvas'].in, [], 'canvas carries no in= runner ref');
        assert.ok(!byId['c-ds-canvas'].spec, 'canvas carries NO opaque factory spec (retired)');
        // WS-NOTEBOOK-REALM-KERNEL-BINDING: the canvas DECLARES `produces="hist"` — the
        // realm derives the serializable histogram from the runner + commits it. produces
        // is folded into out (one producer-discovery authority); a `produces`-derived out
        // is LEGAL (out ⊆ produces) under the C8 guard.
        assert.deepStrictEqual(byId['c-ds-canvas'].produces, ['hist'], 'canvas declares produces="hist"');
        assert.deepStrictEqual(byId['c-ds-canvas'].out, ['hist'], 'produces folded into out');
        // The authored builder cell + the dsRun-pulling hist cell are DELETED (retired).
        assert.ok(!byId['c-ds-build'], 'the authored c-ds-build frqtl builder cell is deleted');
        assert.ok(!byId['c-ds-hist'], 'the dsRun-pulling histogram cell is deleted (realm-internal runner)');
        assert.ok(!nbk.cells.some(c => c.type === 'js' && c.lane === 'frqtl'),
            'no authored lane=frqtl js builder cells remain');

        // The chart + Rosetta cells consume `hist` — which now arrives via the realm→kernel
        // binding seam: the canvas commits it after the runner mounts. The cells stay
        // well-formed; they resolve once the canvas has produced (FAIL LOUD only BEFORE).
        assert.strictEqual(byId['c-ds-chart'].type, 'chart');
        assert.strictEqual(byId['c-ds-chart'].spec, 'bar:hist');
        assert.deepStrictEqual(byId['c-rosetta'].in, ['hist']);
        assert.deepStrictEqual(byId['c-rosetta'].out, ['chain']);
        assert.strictEqual(byId['c-rosetta'].lane, 'math');

        // QFT cell is deliberately standalone (produces qft, consumes nothing).
        assert.deepStrictEqual(byId['c-qft'].in, []);
        assert.deepStrictEqual(byId['c-qft'].out, ['qft']);

        assert.ok(!/frqtl\.experiment\(/.test(html), 'must not use the nonexistent frqtl.experiment()');
        assert.ok(/\.claim\(/.test(html), 'Rosetta chain declares a claim (Codec.run requires it)');

        // EVERY consumed binding now has a producer — `hist` included (the canvas declares
        // produces="hist", folded into out). No dangling edges: a consumed-but-unproduced
        // binding would be an authoring bug now that the realm→kernel seam has landed.
        const produced = new Set();
        nbk.cells.forEach((c) => {
            (c.out || []).forEach((n) => produced.add(n));
            if (c.bind) { produced.add(c.bind); }
        });
        nbk.cells.forEach((c) => {
            (c.in || []).forEach((n) => {
                assert.ok(produced.has(n), `cell "${c.id}" consumes "${n}" but no cell produces it`);
            });
        });
        assert.ok(produced.has('hist'),
            '`hist` is produced by the canvas (produces="hist") via the realm→kernel binding seam');
    });

    test('recipe gallery — a shape="recipe" canvas synthesizes the RecipeContext path (Bite 5c)', function () {
        const html = read('lib/notebooks/gallery-recipe-emitter-wall.html');
        assert.ok(!/<notebook[\s>]/i.test(html), 'must NOT be an Observable <notebook> document');
        const nbk = parse(html);
        const byId = Object.fromEntries(nbk.cells.filter(c => c.id).map(c => [c.id, c]));

        // The canvas DECLARES shape="recipe" + a buildExperiment recipe module.
        const canvas = byId['c-recipe-canvas'];
        assert.strictEqual(canvas.type, 'canvas');
        assert.strictEqual(canvas.shape, 'recipe', 'canvas declares shape="recipe"');
        assert.strictEqual(canvas.setup, './setups/recipe-emitter-wall.js#buildExperiment');
        assert.strictEqual(canvas.stage, '480x480');
        assert.strictEqual(canvas.bind, '', 'canvas carries no bind= runner ref');

        // The module cell installs the recipe via the dual-mode window tail (NOT an
        // ESM export — the real codegen/STUDIO form the recipe path reads).
        const moduleCell = nbk.cells.find(c => c.type === 'module' && c.name === './setups/recipe-emitter-wall.js');
        assert.ok(moduleCell, 'the recipe module cell exists');
        assert.ok(/function buildExperiment\(exp\)/.test(moduleCell.body), 'defines buildExperiment(exp)');
        assert.ok(/window\.buildExperiment = buildExperiment/.test(moduleCell.body), 'dual-mode window tail present');

        // The SHARED synthesis authority produces the RecipeContext builder (not the
        // factory signature) from the parsed canvas — the exact path the pane runs.
        const modules = {};
        nbk.cells.filter(c => c.type === 'module').forEach(c => { modules[c.name] = c.body; });
        const synth = synthesizeBuilderSource({
            setup: canvas.setup, shape: canvas.shape, modules,
            stage: canvas.stage, seed: canvas.seed, opts: canvas.opts,
            renderOptions: canvas.renderOptions, cameraPreset: canvas.cameraPreset,
            outName: canvas.id + '_run'
        });
        assert.strictEqual(synth.shape, 'recipe');
        assert.match(synth.builderCode, /frqtl\.RecipeContext\(/);
        assert.match(synth.builderCode, /exp\.build\(buildExperiment\)/);
        assert.doesNotMatch(synth.builderCode, /runner\.setup\(/,
            'recipe canvas must NOT synthesize the factory runner.setup call');
    });

});
