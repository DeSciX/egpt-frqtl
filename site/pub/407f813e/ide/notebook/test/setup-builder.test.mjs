/**
 * setup-builder.test.mjs — WS-NOTEBOOK-SHIM-MANAGED-BUILDER synthesis authority.
 *
 * Proves the SOLE setup-builder helper (lib/shim/notebook/setup-builder.js):
 *   - synthesizes the canonical builder source shape from a declared canvas
 *     (import → ensureEngine → knob → FrqtlApp(config) → setup → return);
 *   - resolves a single-export module when `#export` is omitted (C5);
 *   - FAILS LOUD on a missing module / unknown export / zero-or-multiple exports
 *     with no `#export` / a malformed stage|seed (never guesses).
 *
 * PURE node test — no DOM/engine. Run:
 *   node --test lib/shim/notebook/test/setup-builder.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { synthesizeBuilderSource, parseSetupDeclaration, moduleExportNames, parseStage, parseSeed } =
    await import(path.join(repoRoot, 'lib/shim/notebook/setup-builder.js'));

const SINGLE = { './setups/wave.js': 'export function setupWave(frqtl, u, o) { return 1; }' };
const MULTI  = { './setups/multi.js': 'export function setupA(){} export const setupB = 1;' };

describe('setup-builder — parseSetupDeclaration', function () {
    test('splits module#export', function () {
        assert.deepEqual(parseSetupDeclaration('./setups/wave.js#setupWave'),
            { moduleName: './setups/wave.js', exportName: 'setupWave' });
    });
    test('omitted #export → empty exportName', function () {
        assert.deepEqual(parseSetupDeclaration('./setups/wave.js'),
            { moduleName: './setups/wave.js', exportName: '' });
    });
    test('FAIL-LOUD on empty/non-string setup', function () {
        assert.throws(() => parseSetupDeclaration(''), /requires a `setup=/);
        assert.throws(() => parseSetupDeclaration(undefined), /requires a `setup=/);
        assert.throws(() => parseSetupDeclaration('#setupWave'), /no module name/);
    });
});

describe('setup-builder — moduleExportNames (C5 enumeration)', function () {
    test('counts function/const exports, excludes default + comments', function () {
        const src = 'export default 1;\n// export function ghost(){}\nexport function real(){}\nexport const k = 2;';
        assert.deepEqual(moduleExportNames(src), ['real', 'k']);
    });
    test('counts `export { a, b as c }` post-as names', function () {
        const src = 'function a(){} function b(){}\nexport { a, b as renamed };';
        assert.deepEqual(moduleExportNames(src), ['a', 'renamed']);
    });
});

describe('setup-builder — synthesizeBuilderSource (shape)', function () {
    test('emits the canonical template with explicit export + stage + seed', function () {
        const { builderCode, outName, moduleName, exportName, usesModulePath } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE,
            opts: { quanta: 800 }, stage: '480x480', seed: '42', outName: 'c-x_run'
        });
        assert.equal(moduleName, './setups/wave.js');
        assert.equal(exportName, 'setupWave');
        // C15 (WS gym-controls-as-sugar Bite 0a fix-loop #3): the authority declares
        // this explicitly — the caller MUST forward it as Runtime.runCell's
        // forceModulePath, since the runtime's hasImport() text-sniff cannot see a
        // body-level dynamic import. See runcell-forcemodulepath-gate.test.mjs for
        // the real-gate proof.
        assert.equal(usesModulePath, true);
        // outName is sanitized to a valid JS identifier (it is emitted as an unquoted
        // object key; a hyphen from cell.id would be a SyntaxError) — see regression test below.
        assert.equal(outName, 'c_x_run');
        assert.match(builderCode, /const \{ frqtl \} = caps;/);
        assert.match(builderCode, /await frqtl\.ensureEngine\(\);/);
        // DYNAMIC import of the editable in-notebook module by its declared name (C1),
        // placed AFTER ensureEngine (C14 — the game-layer ordering guarantee, WS
        // gym-controls-as-sugar Bite 0a REMEDIATION Finding 2).
        assert.match(builderCode, /const \{ setupWave \} = await import\('\.\/setups\/wave\.js'\);/);
        assert.ok(
            builderCode.indexOf('await frqtl.ensureEngine();') < builderCode.indexOf("await import('./setups/wave.js')"),
            'ensureEngine() must run BEFORE the dynamic import (the ordering guarantee)'
        );
        // knob spec is the export name; opts is the declared knob map
        assert.match(builderCode, /const opts = frqtl\.knob\('setupWave', \{"quanta":800\}\);/);
        // runner config from stage/seed (NOT folded into opts — C4)
        assert.match(builderCode, /const runner = frqtl\.FrqtlApp\(\{ canvasW: 480, canvasH: 480, seed: 42 \}\);/);
        assert.match(builderCode, /runner\.setup\(frqtl\.carryFactoryStatics\(\(universe, o\) => setupWave\(frqtl, universe, o\), setupWave\), opts\);/);
        assert.match(builderCode, /return \{ c_x_run: runner \};/);
    });

    test('REGRESSION: synthesized builder PARSES; hyphenated outName → valid key (not "Unexpected token \'-\'")', function () {
        const synth = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE,
            stage: '480x480', seed: '42', outName: 'c-ds-canvas_run'
        });
        // the returned outName must be a valid JS identifier...
        assert.match(synth.outName, /^[A-Za-z_$][\w$]*$/, 'outName must be a valid JS identifier');
        // ...the emitted return key must equal it (so the caller's result.outputs[outName] hits)...
        assert.ok(synth.builderCode.includes('return { ' + synth.outName + ': runner }'),
            'emitted return key matches synth.outName');
        // ...and the whole builder body must PARSE (the check the boilerplate asserts missed).
        const body = synth.builderCode.replace(/^\s*import[^\n]*\n/, ''); // strip illegal-in-Function import
        assert.doesNotThrow(() => new Function('caps', '(async () => {' + body + '})'),
            'synthesized builder body must be valid JS');
    });

    test('empty opts → frqtl.knob(export, {}) (knob returns {} for no-knob setups)', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE, stage: '480x480', seed: '42'
        });
        assert.match(builderCode, /frqtl\.knob\('setupWave', \{\}\)/);
        assert.equal(/_run: runner/.test(builderCode), true, 'default outName is _run');
    });

    test('omitted stage/seed → FrqtlApp() default config (empty literal)', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE
        });
        assert.match(builderCode, /const runner = frqtl\.FrqtlApp\(\{  \}\);/);
    });

    test('C5: omitted #export resolves a SINGLE-export module', function () {
        const { exportName, builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js', modules: SINGLE
        });
        assert.equal(exportName, 'setupWave');
        assert.match(builderCode, /const \{ setupWave \} = await import\(/);
    });
});

describe('setup-builder — renderOptions / cameraPreset (WS gym-controls-as-sugar fix-loop #6 Finding B)', function () {
    test('renderOptions emits ONE runner.setRenderOption(k, v) call per key, AFTER runner.setup(), string values quoted', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE, stage: '480x480', seed: '42',
            renderOptions: { shape: 'cube', colorScheme: 'roygbiv' }
        });
        assert.match(builderCode, /runner\.setRenderOption\("shape", "cube"\);/);
        assert.match(builderCode, /runner\.setRenderOption\("colorScheme", "roygbiv"\);/);
        const setupIdx = builderCode.indexOf('runner.setup(');
        const shapeIdx = builderCode.indexOf('runner.setRenderOption("shape"');
        assert.ok(setupIdx !== -1 && shapeIdx !== -1 && setupIdx < shapeIdx,
            'setRenderOption calls emitted AFTER runner.setup() (mirrors the page-side/fx-experiment.js order)');
    });

    test('renderOptions numeric values emit UNQUOTED JS number literals (not strings)', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE,
            renderOptions: { glowIntensity: 1.3, smoke: 4 }
        });
        assert.match(builderCode, /runner\.setRenderOption\("glowIntensity", 1\.3\);/);
        assert.match(builderCode, /runner\.setRenderOption\("smoke", 4\);/);
    });

    test('empty/absent renderOptions emits ZERO setRenderOption calls (byte-identical to before this fix-loop)', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE
        });
        assert.ok(!/setRenderOption/.test(builderCode), 'no setRenderOption call when renderOptions is absent');
    });

    test('renderOptions is a SEPARATE channel from opts — never merged into the frqtl.knob() call', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE,
            opts: { quanta: 800 }, renderOptions: { shape: 'box' }
        });
        // The physics-knob bag carries ONLY opts...
        assert.match(builderCode, /frqtl\.knob\('setupWave', \{"quanta":800\}\)/);
        assert.ok(!/"shape"/.test(builderCode.split('runner.setup(')[0]),
            'renderOptions keys do not leak into the pre-setup (knob/opts) portion of the builder');
        // ...and the render channel is a fully separate call.
        assert.match(builderCode, /runner\.setRenderOption\("shape", "box"\);/);
    });

    test('cameraPreset emits a CAPABILITY-CHECKED runner.cameraControl.setPreset() call, AFTER setRenderOption lines', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE,
            renderOptions: { glowIntensity: 1.3 }, cameraPreset: 'down-barrel'
        });
        assert.match(builderCode,
            /if \(runner\.cameraControl && typeof runner\.cameraControl\.setPreset === 'function'\) \{\n\s*runner\.cameraControl\.setPreset\("down-barrel"\);\n\}/);
        const renderOptIdx = builderCode.indexOf('runner.setRenderOption("glowIntensity"');
        const camIdx = builderCode.indexOf('runner.cameraControl &&');
        assert.ok(renderOptIdx !== -1 && camIdx !== -1 && renderOptIdx < camIdx,
            'cameraPreset block emitted AFTER renderOptions lines (mirrors fx-experiment.js order)');
    });

    test('absent cameraPreset emits ZERO cameraControl lines', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE
        });
        assert.ok(!/cameraControl/.test(builderCode), 'no cameraControl reference when cameraPreset is absent');
    });

    test('REGRESSION: the FULL synthesized body (setup + renderOptions + cameraPreset) still PARSES', function () {
        const synth = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE, stage: '480x480', seed: '42',
            renderOptions: { shape: 'cube', colorScheme: 'roygbiv' }, cameraPreset: 'down-barrel'
        });
        const body = synth.builderCode.replace(/^\s*import[^\n]*\n/, '');
        assert.doesNotThrow(() => new Function('caps', '(async () => {' + body + '})'),
            'synthesized builder body (with renderOptions + cameraPreset) must be valid JS');
    });
});

describe('setup-builder — FAIL-LOUD (C1/C5, never guess)', function () {
    test('missing module in the module set → FAIL-LOUD', function () {
        assert.throws(() => synthesizeBuilderSource({ setup: './setups/missing.js#x', modules: SINGLE }),
            /is not a `type="module"` cell/);
    });
    test('unknown export name → FAIL-LOUD', function () {
        assert.throws(() => synthesizeBuilderSource({ setup: './setups/wave.js#nope', modules: SINGLE }),
            /is not exported by module/);
    });
    test('C5: omitted #export on a MULTI-export module → FAIL-LOUD (never guess)', function () {
        assert.throws(() => synthesizeBuilderSource({ setup: './setups/multi.js', modules: MULTI }),
            /MULTIPLE exports/);
    });
    test('C5: omitted #export on a ZERO-export module → FAIL-LOUD', function () {
        assert.throws(() => synthesizeBuilderSource({ setup: './setups/empty.js', modules: { './setups/empty.js': '// nothing' } }),
            /has NO named export/);
    });
    test('malformed stage → FAIL-LOUD', function () {
        assert.throws(() => synthesizeBuilderSource({ setup: './setups/wave.js#setupWave', modules: SINGLE, stage: '480' }),
            /`stage` must be/);
    });
    test('non-integer seed → FAIL-LOUD', function () {
        assert.throws(() => synthesizeBuilderSource({ setup: './setups/wave.js#setupWave', modules: SINGLE, seed: '4.5' }),
            /`seed` must be an integer/);
    });
});

describe('setup-builder — parseStage / parseSeed', function () {
    test('parseStage', function () {
        assert.deepEqual(parseStage('480x480'), { canvasW: 480, canvasH: 480 });
        assert.equal(parseStage(''), null);
        assert.equal(parseStage(null), null);
        assert.throws(() => parseStage('480X'), /`stage` must be/);
    });
    test('parseSeed', function () {
        assert.equal(parseSeed('42'), 42);
        assert.equal(parseSeed(''), null);
        assert.throws(() => parseSeed('x'), /integer/);
    });
});

/* ── Bite 5c: the `shape` discriminator (factory | recipe) ─────────────────────
 *
 * A recipe module uses the dual-mode `window.buildExperiment` tail (NOT an ESM
 * export) — the form codegen / buildFrqnb / the walkthrough rungs emit. Before this
 * fix, feeding it through the factory-only synthesizer threw "not exported".
 */
const RECIPE = {
    './experiment.js':
        'function buildExperiment(exp) {\n' +
        "  exp.addObject('SphereEmitter', { preset: 'spherical', is2D: true });\n" +
        '}\n' +
        "if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }\n" +
        "else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }\n"
};

describe('setup-builder — shape discriminator (Bite 5c)', function () {
    test('empty shape → factory (default), byte-identical to no shape', function () {
        const withEmpty = synthesizeBuilderSource({ setup: './setups/wave.js#setupWave', modules: SINGLE, shape: '' });
        const withNone  = synthesizeBuilderSource({ setup: './setups/wave.js#setupWave', modules: SINGLE });
        assert.equal(withEmpty.shape, 'factory');
        assert.equal(withEmpty.builderCode, withNone.builderCode,
            'an empty shape produces the SAME builder as no shape at all');
    });

    test('shape="factory" is explicit + unchanged (runner.setup factory call)', function () {
        const { builderCode, shape } = synthesizeBuilderSource({
            setup: './setups/wave.js#setupWave', modules: SINGLE, shape: 'factory'
        });
        assert.equal(shape, 'factory');
        assert.match(builderCode, /runner\.setup\(frqtl\.carryFactoryStatics\(\(universe, o\) => setupWave\(frqtl, universe, o\), setupWave\), opts\);/);
        assert.match(builderCode, /frqtl\.FrqtlApp\(/);
    });

    test('shape="recipe" reproduces the flagged break under factory synthesis', function () {
        // The exact CEO-reported break: a recipe module through the factory path throws.
        assert.throws(
            () => synthesizeBuilderSource({ setup: './experiment.js#buildExperiment', modules: RECIPE }),
            /is not exported by module/);
    });

    test('shape="recipe" synthesizes the RecipeContext/buildExperiment path', function () {
        const { builderCode, shape, exportName, usesModulePath } = synthesizeBuilderSource({
            setup: './experiment.js#buildExperiment', modules: RECIPE, shape: 'recipe',
            stage: '480x480', seed: '42'
        });
        assert.equal(shape, 'recipe');
        assert.equal(exportName, 'buildExperiment');
        assert.equal(usesModulePath, true, 'recipe still uses the dynamic-import module path');
        // Imports the module for side-effect (installs window.buildExperiment), reads it,
        // FAILS LOUD if absent, builds a deferCanvas RecipeContext, exp.build(...).
        assert.match(builderCode, /await import\('\.\/experiment\.js'\);/);
        assert.match(builderCode, /window\["buildExperiment"\]/);
        assert.match(builderCode, /typeof buildExperiment !== 'function'/);
        assert.match(builderCode, /frqtl\.RecipeContext\(\{ canvasW: 480, canvasH: 480, seed: 42, deferCanvas: true \}\)/);
        assert.match(builderCode, /exp\.build\(buildExperiment\);/);
        assert.match(builderCode, /const runner = exp\.runner;/);
        // NOT the factory signature.
        assert.doesNotMatch(builderCode, /runner\.setup\(/);
        assert.doesNotMatch(builderCode, /buildExperiment\(frqtl, universe/);
    });

    test('shape="recipe" defaults the export to buildExperiment when #export omitted', function () {
        const { exportName, builderCode } = synthesizeBuilderSource({
            setup: './experiment.js', modules: RECIPE, shape: 'recipe'
        });
        assert.equal(exportName, 'buildExperiment');
        assert.match(builderCode, /window\["buildExperiment"\]/);
    });

    test('recipe canvas with non-empty opts → FAIL-LOUD (recipe takes no knob bag)', function () {
        assert.throws(
            () => synthesizeBuilderSource({ setup: './experiment.js#buildExperiment', modules: RECIPE, shape: 'recipe', opts: { quanta: 8 } }),
            /takes NO `opts`/);
    });

    test('unknown shape → FAIL-LOUD (never guess)', function () {
        assert.throws(
            () => synthesizeBuilderSource({ setup: './experiment.js#buildExperiment', modules: RECIPE, shape: 'bogus' }),
            /unknown canvas `shape`/);
    });

    test('recipe carries render-intent lines (setRenderOption / cameraPreset on the runner)', function () {
        const { builderCode } = synthesizeBuilderSource({
            setup: './experiment.js#buildExperiment', modules: RECIPE, shape: 'recipe',
            renderOptions: { shape: 'sphere' }, cameraPreset: 'rooftop'
        });
        assert.match(builderCode, /runner\.setRenderOption\("shape", "sphere"\);/);
        assert.match(builderCode, /runner\.cameraControl\.setPreset\("rooftop"\)/);
    });
});
