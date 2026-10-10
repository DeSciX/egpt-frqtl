/**
 * gallery-import.test.mjs — WS-NOTEBOOK-SHIM-MANAGED-BUILDER end-to-end (node-safe).
 *
 * SUPERSEDES the WS-NOTEBOOK-IMPORT B5 authored-builder shape. Parses every gallery
 * notebook and proves the DECLARATIVE canvas wiring is coherent WITHOUT a browser:
 *   - every canvas cell DECLARES a `setup="<module>#<export>"` (no authored builder cell;
 *     no `bind=`/`in=`/`out=`/`spec=` runner reference — those are RETIRED);
 *   - the declared module is a `<cell type="module" name="…">` in the same notebook and
 *     the declared export exists (synthesizeBuilderSource resolves it without throwing);
 *   - the SYNTHESIZED builder's relative import resolves against the in-memory module
 *     closure (the transitive resolution succeeds — e.g. circuit-sat → circuit-basic);
 *   - no gallery notebook references the retired `setupSource`/`loadSetup`, reads window.*,
 *     or imports lib/frqtl/objects in CODE (the veto-class constraints).
 *
 * This is the node-testable half of the acceptance test; the live-physics half
 * (edit emitter → re-run → fringes change) is the orchestrator's central browser visual.
 *
 * Run: node --test lib/shim/notebook/test/gallery-import.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');
const NB_DIR    = path.join(repoRoot, 'lib/notebooks');

const { parse } = await import(path.join(repoRoot, 'lib/shim/notebook/format.js'));
const { buildModuleClosure, compileEntryModuleSource } =
    await import(path.join(repoRoot, 'lib/shim/notebook/module-resolver.js'));
const { synthesizeBuilderSource } = await import(path.join(repoRoot, 'lib/shim/notebook/setup-builder.js'));

// Fetch-free minter so the closure builds in node (proves the closure is fully
// in-memory — no URL.createObjectURL / no fetch needed to resolve siblings).
function makeMinter() {
    let n = 0;
    return (src) => 'blob:test/' + (n++);
}

const GALLERY = readdirSync(NB_DIR).filter((f) => /^gallery-.*\.html$/.test(f));

describe('gallery notebooks — DECLARATIVE canvas (shim-managed builder)', function () {

    test('the gallery set is non-empty (sanity)', function () {
        assert.ok(GALLERY.length >= 6, 'expected the 6 gallery notebooks, found ' + GALLERY.length);
    });

    for (const file of GALLERY) {
        describe(file, function () {
            const html = readFileSync(path.join(NB_DIR, file), 'utf8');
            const nb = parse(html);

            const moduleSet = {};
            for (const c of nb.cells) {
                if (c.type === 'module' && c.name) { moduleSet[c.name] = c.body; }
            }
            const canvases = nb.cells.filter((c) => c.type === 'canvas');

            test('has at least one module cell + one declarative canvas (no authored builder)', function () {
                assert.ok(Object.keys(moduleSet).length >= 1, 'module cell present');
                assert.ok(canvases.length >= 1, 'a canvas cell is present');
                // No authored frqtl-lane js BUILDER cells remain (retired — one dev way).
                const frqtlBuilders = nb.cells.filter((c) => c.type === 'js' && (c.lane || '') === 'frqtl');
                assert.equal(frqtlBuilders.length, 0,
                    'no authored lane=frqtl js builder cells (the synthesized builder is the SOLE source-origin)');
            });

            test('every canvas declares setup (no spec / no bind / no in / no out runner ref)', function () {
                for (const c of canvases) {
                    assert.ok(c.setup, 'canvas "' + c.id + '" declares setup="<module>#<export>"');
                    assert.equal(c.spec, '', 'canvas "' + c.id + '" carries no retired spec');
                    assert.equal(c.bind, '', 'canvas "' + c.id + '" carries no retired bind= runner ref');
                    assert.deepEqual(c.in, [], 'canvas "' + c.id + '" carries no in= runner ref');
                    assert.deepEqual(c.out, [], 'canvas "' + c.id + '" carries no out= runner ref');
                }
            });

            test('no retired verb / window.* / objects-import in CODE', function () {
                function stripComments(s) {
                    return String(s)
                        .replace(/\/\*[\s\S]*?\*\//g, '')
                        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
                }
                // Bite 5c: a RECIPE module (referenced by a shape="recipe" canvas) legitimately
                // carries the dual-mode `window.<export> = <export>` PUBLICATION tail — that is
                // the canonical recipe form (codegen/STUDIO emit it; the setup-builder recipe
                // path reads window.<export> after importing the module). It is NOT reaching a
                // game-layer global (LargeObject/SlitScreen); the recipe BODY reaches sugar via
                // `exp` (RecipeContext), never window. So the window.* prohibition (a
                // setup-factory B1 rule) is exempted ONLY for those module names — the
                // `frqtl/objects`-import + retired-verb guards still apply to every cell.
                const recipeModuleNames = new Set(
                    canvases.filter((c) => c.shape === 'recipe')
                        .map((c) => String(c.setup || '').split('#')[0].trim())
                );
                for (const c of nb.cells) {
                    if (c.type !== 'js' && c.type !== 'module') { continue; }
                    const code = stripComments(c.body || '');
                    assert.ok(!/\bsetupSource\b/.test(code), 'no setupSource in code (' + (c.id || c.name) + ')');
                    assert.ok(!/\bloadSetup\b/.test(code), 'no loadSetup in code (' + (c.id || c.name) + ')');
                    const isRecipeModule = c.type === 'module' && recipeModuleNames.has(c.name);
                    if (!isRecipeModule) {
                        assert.ok(!/\bwindow\s*\./.test(code), 'no window.* in code (' + (c.id || c.name) + ')');
                    }
                    assert.ok(!/from\s+['"][^'"]*frqtl\/objects/.test(code),
                        'no lib/frqtl/objects import (' + (c.id || c.name) + ')');
                }
            });

            test('each declared canvas SYNTHESIZES a builder whose import resolves against the module closure', function () {
                const closure = buildModuleClosure(moduleSet, makeMinter());
                assert.strictEqual(
                    Object.keys(closure.blobUrlByKey).length,
                    Object.keys(moduleSet).length,
                    'every module cell got a blob URL in the closure'
                );
                for (const c of canvases) {
                    // The SOLE synthesis authority resolves the declared module + export (or
                    // FAILS LOUD — caught here as a test failure, never a silent guess).
                    const synth = synthesizeBuilderSource({
                        setup: c.setup, shape: c.shape || '', modules: moduleSet,
                        // A recipe-shape canvas takes no opts (FAIL-LOUD otherwise) — ferry
                        // opts only for the factory form (Bite 5c).
                        opts: (c.shape === 'recipe') ? {} : (c.opts || {}),
                        stage: c.stage || '', seed: c.seed || '', outName: (c.id || 'x') + '_run'
                    });
                    assert.match(synth.builderCode, /await frqtl\.ensureEngine\(\)/,
                        'synthesized builder for "' + c.id + '" has the canonical boilerplate');
                    // C14 (WS gym-controls-as-sugar Bite 0a REMEDIATION, Finding 2): the
                    // module-cell reference is now a DYNAMIC `await import(...)` placed
                    // AFTER ensureEngine (never a static header import) — the ordering
                    // guarantee against the game-layer boot race.
                    assert.match(synth.builderCode, /await import\(['"]\.\//,
                        'synthesized "' + c.id + '" references its module via a dynamic import()');
                    assert.ok(
                        synth.builderCode.indexOf('await frqtl.ensureEngine()') <
                        synth.builderCode.indexOf('await import('),
                        'synthesized "' + c.id + '" defers the module import until AFTER ensureEngine'
                    );
                    // The synthesized builder compiles against the closure: its relative
                    // import (static OR dynamic) resolves to a module-set sibling blob (no
                    // raw ./ specifier survives anywhere in the compiled entry source).
                    const entrySrc = compileEntryModuleSource(
                        synth.builderCode, '__cell__-' + (c.id || 'x') + '.js', closure.blobUrlByKey);
                    assert.ok(entrySrc.includes('export default async (caps, inputs) =>'),
                        'synthesized "' + c.id + '" wraps body keeping caps/inputs injected');
                    assert.ok(!/from\s+['"]\.\//.test(entrySrc) && !/import\(['"]\.\//.test(entrySrc),
                        'synthesized "' + c.id + '" relative import (static or dynamic) rewritten to a blob URL (none raw)');
                    assert.match(entrySrc, /await import\(['"]blob:/,
                        'synthesized "' + c.id + '" dynamic import resolves to a blob: URL sibling');
                }
            });
        });
    }
});
