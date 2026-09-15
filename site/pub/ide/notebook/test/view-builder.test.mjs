/**
 * view-builder.test.mjs — WS-NOTEBOOK-VENDOR-VIEW Phase 2b.
 *
 * Proves the SOLE view-entry synthesizer: it imports the user render module's export +
 * returns it as a realm-internal binding, single-export-else-FAIL-LOUD, with the same
 * outName-sanitization (hyphen bug class) and module-resolution discipline as setup-builder.
 *
 * Run: node --test lib/shim/notebook/test/view-builder.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const { synthesizeViewEntrySource, parseViewDeclaration } = await import(
    path.join(repoRoot, 'lib/shim/notebook/view-builder.js')
);

const RENDER_MOD = 'export function render(ctx) { ctx.mount.textContent = "hi"; }';
const TWO_EXPORTS = 'export function render(ctx) {}\nexport function other() {}';

describe('view-builder — parseViewDeclaration', function () {
    test('splits module#export', function () {
        assert.deepStrictEqual(parseViewDeclaration('./v.js#render'), { moduleName: './v.js', exportName: 'render' });
    });
    test('export optional', function () {
        assert.deepStrictEqual(parseViewDeclaration('./v.js'), { moduleName: './v.js', exportName: '' });
    });
    test('FAIL-LOUD on empty', function () {
        assert.throws(() => parseViewDeclaration(''), /requires a `module=/);
        assert.throws(() => parseViewDeclaration('#render'), /no module name/);
    });
});

describe('view-builder — synthesizeViewEntrySource', function () {
    test('synthesizes import + return of the named export', function () {
        const synth = synthesizeViewEntrySource({
            module: './views/d3.js#render',
            modules: { './views/d3.js': RENDER_MOD },
            outName: 'v1_view'
        });
        assert.match(synth.entryCode, /import \{ render \} from '\.\/views\/d3\.js'/);
        assert.match(synth.entryCode, /return \{ v1_view: render \}/);
        assert.strictEqual(synth.outName, 'v1_view');
        assert.strictEqual(synth.exportName, 'render');
    });

    test('single-export resolution when #export omitted', function () {
        const synth = synthesizeViewEntrySource({
            module: './views/d3.js',
            modules: { './views/d3.js': RENDER_MOD }
        });
        assert.strictEqual(synth.exportName, 'render');
    });

    test('FAIL-LOUD on multiple exports with no #export (never guess)', function () {
        assert.throws(() => synthesizeViewEntrySource({
            module: './views/d3.js',
            modules: { './views/d3.js': TWO_EXPORTS }
        }), /MULTIPLE exports/);
    });

    test('FAIL-LOUD on zero exports', function () {
        assert.throws(() => synthesizeViewEntrySource({
            module: './views/d3.js',
            modules: { './views/d3.js': '// nothing here' }
        }), /NO named export/);
    });

    test('FAIL-LOUD on an unknown export name', function () {
        assert.throws(() => synthesizeViewEntrySource({
            module: './views/d3.js#nope',
            modules: { './views/d3.js': RENDER_MOD }
        }), /is not exported/);
    });

    test('FAIL-LOUD on a missing module', function () {
        assert.throws(() => synthesizeViewEntrySource({
            module: './views/missing.js#render',
            modules: { './views/d3.js': RENDER_MOD }
        }), /is not a `type="module"` cell/);
    });

    test('outName with hyphens is sanitized to a legal JS identifier (hyphen bug class)', function () {
        const synth = synthesizeViewEntrySource({
            module: './v.js#render',
            modules: { './v.js': RENDER_MOD },
            outName: 'c-d3-view_view'
        });
        // The emitted key must equal the returned outName so result.outputs[outName] hits.
        assert.ok(/^[A-Za-z_$][\w$]*$/.test(synth.outName), 'outName is a legal identifier');
        assert.ok(synth.entryCode.indexOf('return { ' + synth.outName + ': render }') !== -1);
    });

    test('module canon-key match (./v.js vs v.js)', function () {
        const synth = synthesizeViewEntrySource({
            module: 'views/d3.js#render',
            modules: { './views/d3.js': RENDER_MOD }
        });
        assert.strictEqual(synth.exportName, 'render');
    });
});
