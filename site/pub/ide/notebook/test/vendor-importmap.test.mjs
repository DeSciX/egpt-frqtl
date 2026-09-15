/* Copyright 2023-2026 by Essam Abadir */
/**
 * vendor-importmap.test.mjs — WS-NOTEBOOK-VENDOR §2a.3 + §6 (node-testable).
 *
 * Proves the ONE pure import-map generator:
 *   - maps each manifest lib entry → `<vendorBase>/<entry>`;
 *   - normalizes a trailing slash on vendorBase + a leading slash on entry;
 *   - FAIL-LOUD on a manifest without `.libs`, and on a lib without `.entry`
 *     (the slit-objects-hardcoded-list bug class — a lib is NEVER silently dropped);
 *   - FAIL-LOUD on a missing vendorBase (the surface must pass router.vendorBase);
 *   - importMapScriptBody returns the JSON.stringify of the same map (the ONE body
 *     both host injection paths use).
 *   - the router exposes a `vendorBase` accessor present on BOTH profiles (parity).
 *
 * Run: node --test lib/shim/notebook/test/vendor-importmap.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { buildImportMap, importMapScriptBody } = await import(
    path.join(repoRoot, 'lib/shim/notebook/vendor-importmap.js')
);
const { engineRouter, DEV_CORE_PROFILE, DIST_PROFILE } = await import(
    path.join(repoRoot, 'lib/shim/engine/router.js')
);

describe('buildImportMap — the ONE pure import-map generator', () => {
    test('maps each lib entry → vendorBase/entry', () => {
        const manifest = {
            version: 1,
            libs: { 'd3-array': { entry: 'd3-array/src/index.js' }, 'chart.js': { entry: 'chart.js/dist/chart.js' } }
        };
        const map = buildImportMap(manifest, '/vendor');
        assert.deepEqual(map, {
            imports: {
                'd3-array': '/vendor/d3-array/src/index.js',
                'chart.js': '/vendor/chart.js/dist/chart.js'
            }
        });
    });

    test('normalizes a trailing slash on vendorBase + a leading slash on entry', () => {
        const manifest = { libs: { d3: { entry: '/d3/d3.js' } } };
        const map = buildImportMap(manifest, '/vendor/');
        assert.equal(map.imports.d3, '/vendor/d3/d3.js');
    });

    test('works with a dist-relative vendorBase (no leading slash)', () => {
        const manifest = { libs: { d3: { entry: 'd3/d3.js' } } };
        const map = buildImportMap(manifest, '../../../egpt-math-sdk/vendor');
        assert.equal(map.imports.d3, '../../../egpt-math-sdk/vendor/d3/d3.js');
    });

    test('FAIL-LOUD: manifest without .libs throws', () => {
        assert.throws(() => buildImportMap({ version: 1 }, '/vendor'), /missing `.libs`/);
        assert.throws(() => buildImportMap(null, '/vendor'), /missing `.libs`/);
    });

    test('FAIL-LOUD: a lib without .entry throws (never silently dropped)', () => {
        const manifest = { libs: { good: { entry: 'good/i.js' }, bad: {} } };
        assert.throws(() => buildImportMap(manifest, '/vendor'), /lib "bad" has no `\.entry`/);
    });

    test('FAIL-LOUD: a missing vendorBase throws (surface must pass router.vendorBase)', () => {
        assert.throws(() => buildImportMap({ libs: {} }, ''), /vendorBase is required/);
        assert.throws(() => buildImportMap({ libs: {} }), /vendorBase is required/);
    });

    test('empty libs → empty imports (valid, FAIL-SOFT for no placed libs)', () => {
        assert.deepEqual(buildImportMap({ version: 1, libs: {} }, '/vendor'), { imports: {} });
    });
});

describe('importMapScriptBody — the ONE script body for both hosts', () => {
    test('is the JSON.stringify of buildImportMap', () => {
        const manifest = { libs: { 'd3-array': { entry: 'd3-array/src/index.js' } } };
        const body = importMapScriptBody(manifest, '/vendor');
        assert.equal(body, JSON.stringify(buildImportMap(manifest, '/vendor')));
        assert.deepEqual(JSON.parse(body).imports['d3-array'], '/vendor/d3-array/src/index.js');
    });
});

describe('router.vendorBase — the single path authority (parity)', () => {
    test('__vendorBase is defined in BOTH profiles', () => {
        assert.ok(DEV_CORE_PROFILE.__vendorBase, 'DEV_CORE_PROFILE.__vendorBase present');
        assert.ok(DIST_PROFILE.__vendorBase, 'DIST_PROFILE.__vendorBase present');
    });

    test('dev router exposes vendorBase = /vendor', () => {
        const r = engineRouter({ mode: 'dev-core', engine: 'wasm' });
        assert.equal(r.vendorBase, '/vendor');
    });

    test('dist router exposes the dist-relative vendorBase', () => {
        const r = engineRouter({ mode: 'dist', engine: 'wasm' });
        assert.equal(r.vendorBase, DIST_PROFILE.__vendorBase);
        assert.match(r.vendorBase, /egpt-math-sdk\/vendor$/);
    });
});
