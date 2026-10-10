/* Copyright 2023-2026 by Essam Abadir */
/**
 * gallery-defork.test.mjs — WS gym-controls-as-sugar Bite 0 (node-testable).
 *
 * Proves the notebook physics-logic-fork remediation (architect OBJECT-class
 * finding, §5.6.1 / §6 call 8 / §5.7.7 / DESIGN.md §9.2 finding 5):
 *
 *   1. Every module cell that used to hand-copy a canonical setup factory now
 *      imports it via a BARE SPECIFIER (`@frqtl/setups/<id>`), never a relative
 *      path (which would hit the documented VETO-CLASS #1 404 trap).
 *   2. The bare specifier is a KNOWN entry in FRQTL_SETUPS_MANIFEST (the ONE
 *      generation authority) — never an ad-hoc, unregistered specifier string.
 *   3. The adapter cell contains ZERO physics: no direct sugar-object
 *      construction (`new PointSource(`, `new LargeObject(`, `new OvenBox(`, …)
 *      and no `universe.init(` call — those now live ONLY in the canonical
 *      factory the adapter delegates to.
 *   4. `buildModuleClosure` + the relative-import rewriter accept the bare
 *      specifier without throwing (proves it is NOT mistaken for an unresolved
 *      relative import).
 *   5. The adapter mechanically forwards `(universe, options)` to the
 *      canonical factory unchanged and returns its result verbatim (the
 *      "zero physics, argument-shape only" contract) — proven by swapping in a
 *      SPY for the bare-specifier import and invoking the adapter function.
 *
 * Companion to lib/shim/notebook/test/gallery-import.test.mjs (which proves the
 * DECLARATIVE canvas wiring generically for every gallery notebook); this file
 * proves the SPECIFIC de-fork remediation for the sites known to have hand-
 * copied a canonical factory.
 *
 * Run: node --test lib/shim/notebook/test/gallery-defork.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');
const NB_DIR    = path.join(repoRoot, 'lib/notebooks');
const { FrqtlApp } = createRequire(import.meta.url)(path.join(repoRoot, 'lib/frqtl/objects/FrqtlApp.js'));

const { parse } = await import(path.join(repoRoot, 'lib/shim/notebook/format.js'));
const { buildModuleClosure } = await import(path.join(repoRoot, 'lib/shim/notebook/module-resolver.js'));
const { FRQTL_SETUPS_MANIFEST } = await import(path.join(repoRoot, 'lib/shim/notebook/frqtl-setups-importmap.js'));

// Every notebook + module-cell name known (at Bite 0 authoring time) to have
// hand-copied a canonical setup factory, and the bare specifier it must now
// import instead.
const DEFORK_SITES = [
    { file: 'gallery-wave-interference.html', moduleName: './setups/wave-interference.js', spec: '@frqtl/setups/wave-interference', exportName: 'setupWaveInterference' },
    { file: 'gallery-double-slit.html', moduleName: './setups/double-slit.js', spec: '@frqtl/setups/double-slit', exportName: 'setupDoubleSlit' },
    { file: 'gallery-atomic-model.html', moduleName: './setups/atomic-model.js', spec: '@frqtl/setups/atomic-model', exportName: 'setupAtomicModel' },
    { file: 'gallery-blackbody.html', moduleName: './setups/blackbody.js', spec: '@frqtl/setups/blackbody', exportName: 'setupBlackbody' },
    { file: 'gallery-big-bang.html', moduleName: './setups/big-bang.js', spec: '@frqtl/setups/big-bang', exportName: 'setupBigBang' },
    { file: 'double-slit-rosetta-qft.html', moduleName: './setups/double-slit.js', spec: '@frqtl/setups/double-slit', exportName: 'setupDoubleSlit' },
    // WS gym-controls-as-sugar Bite 0 ADDENDUM (CEO 2026-07-03): three 3D
    // experiments, authored via the SAME de-fork mechanism from the start
    // (never hand-copied) — added here for the SAME conformance coverage
    // every other gallery notebook gets.
    { file: 'gallery-particle-walk-3d.html', moduleName: './setups/particle-walk-3d.js', spec: '@frqtl/setups/particle-walk-3d', exportName: 'setupParticleWalk3D' },
    { file: 'gallery-collision-matrix-3d.html', moduleName: './setups/collision-matrix-3d.js', spec: '@frqtl/setups/collision-matrix-3d', exportName: 'setupCollisionMatrix3D' }
];

// Physics constructors that must NEVER appear again in a de-forked adapter cell
// (their presence would mean the hand-copy survived).
const PHYSICS_MARKERS = [
    /\bnew\s+PointSource\s*\(/, /\bnew\s+LargeObject\s*\(/, /\bnew\s+OvenBox\s*\(/,
    /\bnew\s+SlitScreen\s*\(/, /\bnew\s+SlitLightSource\s*\(/, /\bnew\s+DetectorWall\s*\(/,
    /\bnew\s+Rectangle\s*\(/, /\bnew\s+CircuitProbe\s*\(/, /\bnew\s+CircuitGate\s*\(/,
    /\bnew\s+Tube\s*\(/,
    /\bnew\s+QuantumEmitter\s*\(/,
    /\buniverse\.init\s*\(/, /\bFrame\.makeLeafFrame\s*\(/
];

function stripComments(s) {
    return String(s)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

describe('gallery-defork — notebook physics-logic-fork remediation (Bite 0)', function () {
    for (const site of DEFORK_SITES) {
        describe(site.file + ' :: ' + site.moduleName, function () {
            const html = readFileSync(path.join(NB_DIR, site.file), 'utf8');
            const nb = parse(html);
            const cell = nb.cells.find((c) => c.type === 'module' && c.name === site.moduleName);

            test('module cell exists', function () {
                assert.ok(cell, 'module cell "' + site.moduleName + '" present in ' + site.file);
            });

            test('imports the canonical factory via the registered bare specifier (never a relative path)', function () {
                const code = stripComments(cell.body);
                const importRe = new RegExp(
                    "import\\s*\\{[^}]*\\}\\s*from\\s*['\"]" + site.spec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "['\"]"
                );
                assert.match(code, importRe, 'bare-specifier import present for ' + site.spec);
                assert.ok(!/from\s+['"]\.\.?\/[^'"]*setup[A-Z]/i.test(code),
                    'no relative import of a canonical setup file (VETO-CLASS #1)');
            });

            test('the imported specifier is a KNOWN entry in FRQTL_SETUPS_MANIFEST (the one authority)', function () {
                assert.ok(Object.prototype.hasOwnProperty.call(FRQTL_SETUPS_MANIFEST, site.spec),
                    site.spec + ' is registered in FRQTL_SETUPS_MANIFEST');
            });

            test('the adapter contains ZERO physics (no direct sugar-object construction, no universe.init)', function () {
                const code = stripComments(cell.body);
                for (const marker of PHYSICS_MARKERS) {
                    assert.ok(!marker.test(code),
                        'adapter for ' + site.moduleName + ' must not match ' + marker + ' (physics leaked into the sugar/notebook layer)');
                }
            });

            test('exports a function of the same name declared on the canvas (or imported by a sibling)', function () {
                const code = cell.body;
                assert.match(code, new RegExp('export\\s+function\\s+' + site.exportName + '\\s*\\('),
                    'adapter exports "' + site.exportName + '" with the notebook-builder 3-arg shape');
            });
        });
    }

    test('buildModuleClosure accepts every de-forked notebook without a relative-import FAIL-LOUD', function () {
        let n = 0;
        const minter = () => 'blob:test/' + (n++);
        const seen = new Set();
        for (const site of DEFORK_SITES) {
            if (seen.has(site.file)) { continue; }
            seen.add(site.file);
            const html = readFileSync(path.join(NB_DIR, site.file), 'utf8');
            const nb = parse(html);
            const moduleSet = {};
            for (const c of nb.cells) {
                if (c.type === 'module' && c.name) { moduleSet[c.name] = c.body; }
            }
            assert.doesNotThrow(() => buildModuleClosure(moduleSet, minter),
                site.file + ' module closure builds (bare specifiers pass through; no unresolved relative import)');
        }
    });

    describe('signature-bridge mechanics (adapter forwards (universe, options) unchanged)', function () {
        for (const site of DEFORK_SITES) {
            test(site.file + ' :: ' + site.exportName + ' forwards args + return value verbatim', function () {
                const html = readFileSync(path.join(NB_DIR, site.file), 'utf8');
                const nb = parse(html);
                const cell = nb.cells.find((c) => c.type === 'module' && c.name === site.moduleName);

                // Rewrite the bare-specifier import to a spy inline module the vm context
                // provides directly (proves ONLY the argument-adaptation shape, not real
                // physics — the canonical factory's own correctness is proven separately
                // by frqtl-setups-importmap.test.mjs's `require()` check + the canonical
                // bench/experiment-page conformance).
                let calledWith = null;
                const spyReturn = { spy: true, exportName: site.exportName };
                const spyFactory = function (universe, options) {
                    calledWith = { universe, options };
                    return spyReturn;
                };

                // Strip the import line(s) (everything up to and including the first
                // blank line after `import ... from '@frqtl/setups/...'`) and evaluate
                // the rest as a CJS-ish script that assigns onto `exports`.
                const body = cell.body;
                const importLineRe = /^\s*import\s*\{[^}]*\}\s*from\s*['"]@frqtl\/setups\/[^'"]+['"]\s*;?\s*$/m;
                assert.match(body, importLineRe, 'import line detected for stripping');
                const withoutImport = body.replace(importLineRe, '');
                // `export function X(...)` -> `function X(...)` so vm can eval it as a plain script.
                const asScript = withoutImport.replace(/export\s+function\s+/g, 'function ');

                const sandbox = { exports: {} };
                // The spy stands in for every imported canonical binding this adapter
                // uses (all sites import exactly one canonical export under an
                // `as _X` alias, or in the circuit-basic case up to four bindings that
                // are all thin re-exports — bind them ALL to the same spy shape so any
                // of them being invoked is observable).
                const importedNames = Array.from(body.matchAll(/(\w+)\s+as\s+(_\w+)/g)).map((m) => m[2]);
                for (const n of importedNames) { sandbox[n] = spyFactory; }
                // An adapter that carries its factory's statics uses the REAL helper the
                // transformed module re-exports (FrqtlApp.carryFactoryStatics).
                const carries = /\bcarryFactoryStatics\s*\(/.test(stripComments(body));
                // An adapter over a factory that declares statics (FrqtlApp.FACTORY_STATICS)
                // MUST carry them, or its canvas boots a different scene than the page.
                const canonical = createRequire(import.meta.url)(path.join(repoRoot,
                    'lib/frqtl/objects/setup', FRQTL_SETUPS_MANIFEST[site.spec].file));
                const canonicalFn = canonical[FRQTL_SETUPS_MANIFEST[site.spec].primary];
                const declared = FrqtlApp.FACTORY_STATICS.filter((k) => canonicalFn[k] !== undefined);
                assert.ok(declared.length === 0 || carries,
                    site.moduleName + ' wraps a factory declaring ' + declared.join(', ') +
                    ' but never calls carryFactoryStatics — the canvas would drop them');
                if (carries) {
                    spyFactory.RATE_LIMITS = Object.freeze({ tpsLimit: 1 });
                    sandbox.carryFactoryStatics = FrqtlApp.carryFactoryStatics;
                }
                vm.createContext(sandbox);
                vm.runInContext(asScript + '\nexports.fn = ' + site.exportName + ';', sandbox);
                if (carries) {
                    assert.strictEqual(sandbox.exports.fn.RATE_LIMITS, spyFactory.RATE_LIMITS,
                        'the adapter carries the canonical factory\'s statics');
                }

                const fakeUniverse = { universe_rect: { w: 480, h: 480 }, marker: 'FAKE_UNIVERSE' };
                const fakeOptions = { marker: 'FAKE_OPTIONS' };
                const result = sandbox.exports.fn({}, fakeUniverse, fakeOptions);

                assert.ok(calledWith, 'the canonical (spy) factory was invoked');
                assert.strictEqual(calledWith.universe, fakeUniverse,
                    'universe forwarded VERBATIM as the canonical factory\'s 1st arg (not the frqtl registry)');
                assert.strictEqual(calledWith.options, fakeOptions,
                    'options forwarded VERBATIM as the canonical factory\'s 2nd arg');
                assert.strictEqual(result, spyReturn, 'the canonical factory\'s return value is passed through unchanged');
            });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// render3d cell-attr wiring (WS gym-controls-as-sugar Bite 0 ADDENDUM, CEO
// 2026-07-03) — the 3 new 3D notebooks MUST declare render3d="true" on their
// canvas cell (the notebook-realm mirror of an experiment page's
// window._egpt3D=true opt-in); every 2D gallery notebook must NOT (regression
// guard — proves this addendum did not accidentally flip the render intent for
// existing 2D experiments).
// ─────────────────────────────────────────────────────────────────────────────
describe('render3d cell-attr — 3D notebooks opt in, 2D notebooks stay untouched', () => {
    const THREED_NOTEBOOKS = [
        { file: 'gallery-particle-walk-3d.html', canvasId: 'c-walk3d-canvas' },
        { file: 'gallery-collision-matrix-3d.html', canvasId: 'c-cm3d-canvas' }
    ];
    const TWOD_NOTEBOOKS = [
        'gallery-wave-interference.html', 'gallery-double-slit.html', 'gallery-atomic-model.html',
        'gallery-blackbody.html', 'gallery-big-bang.html'
    ];

    for (const nb of THREED_NOTEBOOKS) {
        test(nb.file + ' canvas "' + nb.canvasId + '" declares render3d="true"', () => {
            const html = readFileSync(path.join(NB_DIR, nb.file), 'utf8');
            const parsed = parse(html);
            const canvas = parsed.cells.find((c) => c.type === 'canvas' && c.id === nb.canvasId);
            assert.ok(canvas, 'canvas cell "' + nb.canvasId + '" present in ' + nb.file);
            assert.equal(canvas.render3d, true,
                nb.file + '\'s canvas must declare render3d="true" — the 3D-compliance bar for this addendum');
        });
    }

    for (const file of TWOD_NOTEBOOKS) {
        test(file + ' canvas cell(s) do NOT declare render3d (2D default untouched)', () => {
            const html = readFileSync(path.join(NB_DIR, file), 'utf8');
            const parsed = parse(html);
            const canvases = parsed.cells.filter((c) => c.type === 'canvas');
            assert.ok(canvases.length >= 1, 'at least one canvas cell present in ' + file);
            for (const c of canvases) {
                assert.equal(c.render3d, false, file + '\'s canvas "' + c.id + '" must NOT declare render3d');
            }
        });
    }
});
