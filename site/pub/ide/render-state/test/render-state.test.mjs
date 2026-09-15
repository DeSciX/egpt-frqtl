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

const __dirname = dirname(fileURLToPath(import.meta.url));
const {
    normalizeSavedRenderState, pickCameraReplay, applySavedUrlOverrides, renderStateToBootOptions
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
