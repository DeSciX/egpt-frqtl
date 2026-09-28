/* Copyright 2023-2026 by Essam Abadir */

/**
 * render-state.test.mjs — the relocated PURE renderState contract (E2a).
 *
 * Confirms the shim module owns the same behavior save-state.js used to, plus the
 * new `renderStateToBootOptions` load-time/post-start split bootRecipe consumes.
 * (The re-export path through save-state.js is covered by save-state.test.mjs.)
 *
 * Run: node --test lib/shim/render-state/test/render-state.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const {
    normalizeSavedRenderState, pickCameraReplay, applySavedUrlOverrides, renderStateToBootOptions,
    partitionRenderRows
} = await import(join(resolve(__dirname, '..'), 'index.js'));

describe('render-state shim module', function () {

    test('normalizeSavedRenderState never throws + degrades to neutral defaults', function () {
        const n = normalizeSavedRenderState(undefined);
        assert.strictEqual(n.renderer, null);
        assert.strictEqual(n.egpt3D, false);
        assert.deepEqual(n.render, []);
        assert.strictEqual(n.camera, null);
    });

    test('normalizeSavedRenderState preserves a well-formed bag', function () {
        const n = normalizeSavedRenderState({
            renderer: 'three', egpt3D: true, seed: 7,
            camera: { preset: 'rooftop', orbit: { azimuth: 1 } },
            render: [{ key: 'shape', value: 'box' }, { bad: 1 }]
        });
        assert.strictEqual(n.renderer, 'three');
        assert.strictEqual(n.seed, '7');
        assert.deepEqual(n.render, [{ key: 'shape', value: 'box' }], 'malformed render row filtered');
        assert.strictEqual(n.camera.preset, 'rooftop');
    });

    test('pickCameraReplay prefers preset over orbit', function () {
        assert.deepEqual(
            pickCameraReplay({ camera: { preset: 'down-barrel', orbit: { azimuth: 2 } } }),
            { mode: 'preset', name: 'down-barrel' });
        assert.deepEqual(
            pickCameraReplay({ camera: { preset: null, orbit: { azimuth: 2 } } }),
            { mode: 'orbit', orbit: { azimuth: 2 } });
        assert.strictEqual(pickCameraReplay({ camera: null }), null);
    });

    test('applySavedUrlOverrides sets only supplied load-time params', function () {
        assert.strictEqual(applySavedUrlOverrides('/p/index.html', { renderer: 'three', egpt3D: true }),
            '/p/index.html?renderer=three&egpt3D=1');
        assert.strictEqual(applySavedUrlOverrides('/p/index.html?engine=wasm', { seed: 9 }),
            '/p/index.html?engine=wasm&seed=9');
        assert.strictEqual(applySavedUrlOverrides('/p/index.html', {}), '/p/index.html');
    });

    test('renderStateToBootOptions splits load-time from post-start', function () {
        const boot = renderStateToBootOptions({
            renderer: 'three', egpt3D: true, seed: '42', backdropVisible: true,
            camera: { preset: 'rooftop', orbit: null },
            render: [{ key: 'godrays', value: 0.8 }]
        });
        assert.strictEqual(boot.renderer, 'three');
        assert.strictEqual(boot.egpt3D, true);
        assert.strictEqual(boot.seed, '42');
        assert.deepEqual(boot.renderOptions, [{ key: 'godrays', value: 0.8 }]);
        assert.deepEqual(boot.camera, { mode: 'preset', name: 'rooftop' });
        assert.strictEqual(boot.backdropVisible, true);
    });

    test('renderStateToBootOptions tolerates a null/absent bag', function () {
        const boot = renderStateToBootOptions(null);
        assert.strictEqual(boot.renderer, null);
        assert.strictEqual(boot.egpt3D, false);
        assert.deepEqual(boot.renderOptions, []);
        assert.strictEqual(boot.camera, null);
    });
});

describe('partitionRenderRows — saved rows resolved against the TARGET renderer', function () {
    const require = createRequire(import.meta.url);
    const repoRoot = resolve(__dirname, '../../../..');
    const R = join(repoRoot, 'lib/frqtl/compat/renderer');
    const { _renderCapabilitiesThree } = require(join(R, 'providers/three-provider.js'));
    const { _renderCapabilitiesP5 } = require(join(R, 'providers/p5-provider.js'));
    const { knownRenderCapabilityNames } = require(join(R, 'renderCapabilities-common.js'));
    const known = knownRenderCapabilityNames({
        p5: { renderCapabilities: _renderCapabilitiesP5 },
        three: { renderCapabilities: _renderCapabilitiesThree }
    });
    const names = (caps) => caps().map((c) => c.name);
    // The r8-sun rung's own rows — a three project.
    const SUN_ROWS = [
        { key: 'shape', value: 'sphere' }, { key: 'colorScheme', value: 'warmcool' },
        { key: 'godrays', value: 1.08 }, { key: 'godrayDensity', value: 1.085 },
        { key: 'glowIntensity', value: 0.93 }, { key: 'heat', value: 0.35 }, { key: 'smoke', value: 0 }
    ];

    test('a three project replayed on p5: no throw; p5-declared rows apply, three-only rows are retained', function () {
        const parts = partitionRenderRows(SUN_ROWS, names(_renderCapabilitiesP5), known);
        assert.deepEqual(parts.apply, { shape: 'sphere', colorScheme: 'warmcool' });
        assert.deepEqual(parts.retained.map((r) => r.key), ['godrays', 'godrayDensity', 'glowIntensity', 'heat', 'smoke']);
        assert.equal(parts.retained[0].value, 1.08);
    });

    test('toggling back: the same rows on three apply in full, nothing retained', function () {
        const parts = partitionRenderRows(SUN_ROWS, names(_renderCapabilitiesThree), known);
        assert.deepEqual(parts.retained, []);
        assert.equal(parts.apply.godrays, 1.08);
        assert.equal(Object.keys(parts.apply).length, SUN_ROWS.length);
    });

    test('a later row with the same key wins (the ordered base+mode concat)', function () {
        const parts = partitionRenderRows([{ key: 'godrays', value: 1 }, { key: 'godrays', value: 2 }],
            names(_renderCapabilitiesThree), known);
        assert.deepEqual(parts.apply, { godrays: 2 });
    });

    test('FAIL-LOUD: a key no renderer declares (godRays) throws naming the known set', function () {
        assert.throws(() => partitionRenderRows([{ key: 'godRays', value: 1 }], names(_renderCapabilitiesThree), known),
            /"godRays" is declared by no registered renderer \(known: \[.*godrays.*\]\)/);
    });

    test('FAIL-LOUD: non-array arguments', function () {
        assert.throws(() => partitionRenderRows(null, [], []), /three arrays/);
    });
});
