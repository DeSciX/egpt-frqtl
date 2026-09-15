/**
 * module-resolver.test.mjs — WS-NOTEBOOK-IMPORT B2 cell-as-module resolver.
 *
 * Proves the IN-MEMORY blob closure (VETO-CLASS constraint #1):
 *   - relative `./x.js` resolves to a SIBLING blob URL from the notebook module set;
 *   - the closure is built entirely in memory (the injected mintBlobUrl is the ONLY
 *     way a URL is produced — NO fetch, NO scoped-mount sibling resolution);
 *   - bare specifiers pass through to the host loader;
 *   - caps/inputs stay INJECTED (the entry wraps the body in
 *     `default async (caps, inputs) => {…}`, imports hoisted above it);
 *   - transitive closure (a module importing another module) resolves;
 *   - FAIL-LOUD on an unresolved relative specifier and on a dependency cycle.
 *
 * Run: node --test lib/shim/notebook/test/module-resolver.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const {
    canonKey, resolveRelativeKey, hasImport, splitImportsAndBody,
    rewriteRelativeToSiblingBlobs, buildModuleClosure, compileEntryModuleSource
} = await import(path.join(repoRoot, 'lib/shim/notebook/module-resolver.js'));

// A deterministic, fetch-free blob-URL minter the resolver injects. It records
// EVERY source it is asked to mint so a test can assert the closure is fully
// in-memory (the only path a URL is produced). The URL form `blob:test/<n>` is
// stable, so rewritten specifiers are assertable.
function makeMinter() {
    const minted = [];
    function mint(source) {
        const url = 'blob:test/' + minted.length;
        minted.push({ url, source });
        return url;
    }
    mint.minted = minted;
    mint.sourceOf = (url) => (minted.find((m) => m.url === url) || {}).source;
    return mint;
}

describe('module-resolver — path math (pure)', function () {

    test('canonKey folds ./ , empty, ..', function () {
        assert.strictEqual(canonKey('./setups/x.js'), 'setups/x.js');
        assert.strictEqual(canonKey('setups/x.js'), 'setups/x.js');
        assert.strictEqual(canonKey('setups/../setups/x.js'), 'setups/x.js');
        assert.strictEqual(canonKey('./a/b/../c.js'), 'a/c.js');
    });

    test('resolveRelativeKey resolves a sibling against the importer dir', function () {
        // a sat.js in ./setups/ importing ./setupCircuitBasic.js → setups/setupCircuitBasic.js
        assert.strictEqual(
            resolveRelativeKey('./setupCircuitBasic.js', './setups/setupCircuitSAT.js'),
            'setups/setupCircuitBasic.js'
        );
        // a builder cell (entry at the notebook root, a single-segment name)
        // importing ./setups/wave.js resolves to the module-set key
        assert.strictEqual(
            resolveRelativeKey('./setups/wave-interference.js', '__cell__-c-wave-build.js'),
            'setups/wave-interference.js'
        );
    });
});

describe('module-resolver — hasImport + splitImportsAndBody', function () {

    test('hasImport detects a top-level import; ignores a body with no import', function () {
        assert.ok(hasImport("import { x } from './a.js';\nconst y = x;"));
        assert.ok(hasImport("\n  import x from './a.js';"));
        assert.ok(!hasImport('const a = caps.math; return { a };'));
        // a bare word "important" must NOT trip the matcher
        assert.ok(!hasImport('const important = 1; return { important };'));
    });

    test('splitImportsAndBody separates leading imports (single + multi-line) from body', function () {
        const code = [
            "import { setupWave } from './setups/wave.js';",
            "import {",
            "  helper",
            "} from './lib/helper.js';",
            "",
            "const { frqtl } = caps;",
            "return { run: 1 };"
        ].join('\n');
        const { imports, body } = splitImportsAndBody(code);
        assert.ok(imports.includes("from './setups/wave.js'"));
        assert.ok(imports.includes("from './lib/helper.js'"));
        assert.ok(body.includes('const { frqtl } = caps;'));
        assert.ok(body.includes('return { run: 1 };'));
        // imports must NOT leak into body (would be an illegal nested import)
        assert.ok(!body.includes('import '));
    });
});

describe('module-resolver — in-memory closure (VETO #1)', function () {

    test('relative specifier rewrites to a SIBLING blob URL; bare passes through', function () {
        const mint = makeMinter();
        const modules = {
            './setups/wave-interference.js':
                "import { somethingBare } from 'chart.js';\nexport function setupWaveInterference(frqtl, u, o) { return 1; }"
        };
        const closure = buildModuleClosure(modules, mint);
        const waveUrl = closure.blobUrlByKey['setups/wave-interference.js'];
        assert.ok(waveUrl, 'wave module got a blob URL');
        const src = mint.sourceOf(waveUrl);
        // the bare specifier is UNTOUCHED (host loader), proving we never tried to
        // resolve it to a sibling/HTTP mount.
        assert.ok(src.includes("from 'chart.js'"), 'bare specifier left verbatim');
    });

    test('transitive closure: SAT importing ./setupCircuitBasic.js resolves to its sibling blob', function () {
        const mint = makeMinter();
        const modules = {
            './setups/setupCircuitBasic.js':
                "export function setupCircuitBasic(frqtl, u, o) { return 'basic'; }\nexport function createWire(){ return 'w'; }",
            './setups/setupCircuitSAT.js':
                "import { setupCircuitBasic, createWire } from './setupCircuitBasic.js';\nexport function setupCircuitSAT(frqtl, u, o) { return setupCircuitBasic(frqtl,u,o); }"
        };
        const closure = buildModuleClosure(modules, mint);
        const satUrl = closure.blobUrlByKey['setups/setupCircuitSAT.js'];
        const basicUrl = closure.blobUrlByKey['setups/setupCircuitBasic.js'];
        assert.ok(satUrl && basicUrl);
        const satSrc = mint.sourceOf(satUrl);
        // SAT's relative import now points at the BASIC blob URL — in memory, no fetch.
        assert.ok(satSrc.includes("from '" + basicUrl + "'"),
            'SAT relative import rewritten to the in-memory basic blob URL');
        assert.ok(!satSrc.includes("'./setupCircuitBasic.js'"),
            'no raw relative specifier survives (would 404 on the native loader)');
    });

    test('the closure is built ENTIRELY via the injected minter (no other URL source)', function () {
        const mint = makeMinter();
        const modules = {
            './setups/a.js': "export const a = 1;",
            './setups/b.js': "import { a } from './a.js';\nexport const b = a + 1;"
        };
        const closure = buildModuleClosure(modules, mint);
        // every blob URL in the map was produced by the injected minter — there is
        // no `URL.createObjectURL`, no `fetch`, no http(s):// anywhere.
        const urls = Object.values(closure.blobUrlByKey);
        for (const u of urls) {
            assert.ok(u.startsWith('blob:test/'), 'URL minted only by the injected minter: ' + u);
        }
        assert.strictEqual(closure.created.length, 2);
    });

    test('compileEntryModuleSource hoists imports + wraps body as default async (caps,inputs)', function () {
        const mint = makeMinter();
        const modules = {
            './setups/wave-interference.js':
                "export function setupWaveInterference(frqtl, u, o) { return 1; }"
        };
        const closure = buildModuleClosure(modules, mint);
        const code = [
            "import { setupWaveInterference } from './setups/wave-interference.js';",
            "const { frqtl } = caps;",
            "return { waveRun: 42 };"
        ].join('\n');
        const entrySrc = compileEntryModuleSource(code, '__cell__-c-wave-build.js', closure.blobUrlByKey);
        const waveUrl = closure.blobUrlByKey['setups/wave-interference.js'];
        // import hoisted, specifier → sibling blob URL
        assert.ok(entrySrc.includes("from '" + waveUrl + "'"));
        // caps/inputs stay INJECTED via the default-export wrapper
        assert.ok(entrySrc.includes('export default async (caps, inputs) =>'));
        assert.ok(entrySrc.includes('const { frqtl } = caps;'));
        assert.ok(entrySrc.includes('return { waveRun: 42 };'));
        // the import must be OUTSIDE the wrapper (a top-level import in a module),
        // i.e. it appears before the wrapper text.
        assert.ok(entrySrc.indexOf("from '" + waveUrl + "'") <
                  entrySrc.indexOf('export default async'));
    });
});

describe('module-resolver — FAIL-LOUD', function () {

    test('unresolved relative specifier throws (never an HTTP fetch)', function () {
        const mint = makeMinter();
        assert.throws(function () {
            buildModuleClosure({
                './setups/x.js': "import { y } from './missing.js';\nexport const x = 1;"
            }, mint);
        }, /not in the notebook module set|NOT a notebook-local module cell/i);
    });

    test('dependency cycle throws (no safe order)', function () {
        const mint = makeMinter();
        assert.throws(function () {
            buildModuleClosure({
                './a.js': "import { b } from './b.js';\nexport const a = 1;",
                './b.js': "import { a } from './a.js';\nexport const b = 1;"
            }, mint);
        }, /cycle|did not converge|unresolvable/i);
    });

    test('rewriteRelativeToSiblingBlobs FAIL-LOUD on an unknown sibling', function () {
        assert.throws(function () {
            rewriteRelativeToSiblingBlobs(
                "import { z } from './nope.js';", './setups/x.js', {}
            );
        }, /NOT a notebook-local module cell/i);
    });
});
