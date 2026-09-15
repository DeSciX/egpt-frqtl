/* Copyright 2023-2026 by Essam Abadir */

/**
 * producer-conformance.test.mjs — WS gym-controls-as-sugar Bite 3 item 7
 * (architect's Bite-1 charter item, due at Bite 3).
 *
 * Binds the FOUR REAL, ALREADY-SHIPPED control shapes named in
 * lib/shim/controls/index.js's own docstring to `normalizeControlDescriptor` —
 * proving the contract codifies what production code ACTUALLY returns, not a
 * hand-copied fixture (control-descriptor-contract.test.mjs's `validFixture`
 * helper is a hand fixture; THIS file replaces "looks right" with "IS right"
 * by executing the real producer wherever feasible):
 *
 *   1. SphereEmitter.controls         (scalar × 5) — REAL construction via a
 *      minimal fake universe (`experimentTickFunctions` + `universe_rect`) and
 *      the REAL setupSphereEmitter3D factory — no WASM/pkg-node required.
 *   2. RenderTiers.buildTierMatrixSpec (matrix)     — REAL call against a
 *      small fixture `tiers` table.
 *   3. three-provider.js getCameraControl() (camera) — REAL execution: the
 *      REAL vendored three.min.js + the REAL three-provider.js + the REAL
 *      render-boot.js source, driven through a vm sandbox (the SAME
 *      established technique as realm-frqtl-three-monaco-collision.test.mjs),
 *      `window._egpt3D=true` so the 3D orbit camera branch is live.
 *   4. fx-experiment.js `_buildLoopControl()` (loop) — NOT independently
 *      reachable: it is a private, non-exported function inside fx-
 *      experiment.js's IIFE, invoked only from deep within the full p5/
 *      FrqtlApp setup-time driver (`_wireExperimentControls`-class
 *      code, itself requiring a live `runner`). Reaching it for real would
 *      need a full engine+setup-factory+p5 boot — disproportionate for one
 *      shape when the other three are cheaply real. This ONE case is
 *      COPY-VERBATIM, cited by exact source location, flagged transparently
 *      here rather than silently presented as "real" alongside the other
 *      three (the schema-mirror-drift risk this whole file exists to avoid).
 *
 * Run: node --test lib/shim/controls/test/producer-conformance.test.mjs
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
const require   = createRequire(import.meta.url);

const { normalizeControlDescriptor } = require(path.join(repoRoot, 'lib/shim/controls/index.js'));

// ─────────────────────────────────────────────────────────────────────────────
// 1. SphereEmitter.controls (scalar) — REAL construction.
// SphereEmitter is the V2 emitter primitive and publishes the standardized
// `runner.experimentControls`-compatible descriptor array (a straight ref to
// setupSphereEmitter3D's `control.controls` — SphereEmitter.js's `controls`
// getter). Constructed for real against a minimal fake universe: the factory
// reads only `experimentTickFunctions` (to register its emit tick-fn) and
// `universe_rect` (to default the emission centre) — no WASM/pkg-node.
// ─────────────────────────────────────────────────────────────────────────────
describe('producer conformance (1/4) — SphereEmitter.controls (REAL construction) -> scalar', function () {
    const { setupSphereEmitter3D } =
        require(path.join(repoRoot, 'lib/frqtl/objects/setup/setupSphereEmitter3D.js'));
    // SphereEmitter.addTo resolves the factory off the global scope (the game-layer
    // classic-branch pattern); publish it the way stack-boot does.
    globalThis.window = globalThis.window || globalThis;
    globalThis.setupSphereEmitter3D = setupSphereEmitter3D;
    const { SphereEmitter } =
        require(path.join(repoRoot, 'lib/frqtl/objects/objects/SphereEmitter.js'));

    function makeFakeUniverse() {
        return {
            experimentTickFunctions: [],
            universe_rect: { left: 0, top: 0, w: 600, h: 400 }
        };
    }

    test('every real scalar-shaped SphereEmitter.controls entry passes normalizeControlDescriptor({kind:\'scalar\', ...})', function () {
        const universe = makeFakeUniverse();
        // `new SphereEmitter([x,y], opts)` — the documented overload. This used to read
        // `new SphereEmitter(universe, { x: 300, y: 200, is2D: true })`, which the
        // constructor's overload resolution DISCARDED entirely: the universe was dropped
        // (position must be an ARRAY) and `x`/`y` are read by nobody, so the emitter sat
        // at the canvas centre while the test claimed (300,200). The setup-factory option
        // gate surfaced it.
        const se = new SphereEmitter([300, 200], { is2D: true });
        se.addTo(universe);

        assert.ok(Array.isArray(se.controls) && se.controls.length > 0,
            'SphereEmitter.controls is the real descriptor array');

        // The array mixes SCALAR-shaped rows (no explicit `kind` — min/max/step/value)
        // with `kind:'select'` enum rows. This producer row gates the SCALAR shape,
        // so it binds exactly the rows that ARE scalars; the enum rows are a
        // different kind and are not this row's subject.
        const scalars = se.controls.filter(function (c) { return c.kind === undefined; });
        assert.ok(scalars.length >= 2,
            'the real array carries the scalar rows (R, emissionBoxSide, burstSize, …), got ' + scalars.length);

        scalars.forEach(function (raw) {
            // These entries predate the Bite-1 contract and do not carry a `kind`
            // field themselves (the contract is OPT-IN for existing producers per
            // lib/shim/controls/index.js's own "Scope" docstring) — supplying it
            // here is the BINDING act this test performs, not a modification of
            // the real object.
            const bag = normalizeControlDescriptor(Object.assign({ kind: 'scalar' }, raw));
            assert.equal(bag.kind, 'scalar');
            assert.equal(bag.id, raw.id);
            assert.equal(bag.channel, 'physics', 'scalar default channel');
            // Round-trip: the REAL onChange/fmt closures survive normalize verbatim.
            assert.equal(bag.onChange, raw.onChange);
            assert.equal(bag.fmt, raw.fmt);
        });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RenderTiers.buildTierMatrixSpec (matrix) — REAL call.
// ─────────────────────────────────────────────────────────────────────────────
describe('producer conformance (2/4) — RenderTiers.buildTierMatrixSpec (REAL call) -> matrix', function () {
    const { RenderTiers } = require(path.join(repoRoot, 'lib/frqtl/compat/renderer/RenderTiers.js'));

    test('the real buildTierMatrixSpec() output passes normalizeControlDescriptor({kind:\'matrix\', ...})', function () {
        const tiers = [
            { layerMin: 0, label: 'L0', mode: 'crisp', paint: 'sharp' },
            { layerMin: 4, label: 'L4', mode: 'greyscale', paint: 'soft' }
        ];
        const spec = RenderTiers.buildTierMatrixSpec(tiers);

        assert.ok(Array.isArray(spec.columns) && spec.columns.length === 2, 'one column per real tier row');
        assert.ok(Array.isArray(spec.effectOptions) && spec.effectOptions.length > 0, 'real EFFECT_OPTIONS list');

        // id is a registry-addressing concern the schema requires on every
        // kind — RenderTiers (a page-scoped singleton table, not a
        // multiplicity of instances) has no natural id of its own; binding
        // it here supplies one, exactly like the scalar case above.
        const bag = normalizeControlDescriptor({ kind: 'matrix', id: 'tierMatrix', ...spec });
        assert.equal(bag.kind, 'matrix');
        assert.equal(bag.columns, spec.columns, 'real columns array carried verbatim (not cloned/re-derived)');
        assert.equal(bag.effectOptions, spec.effectOptions);
        assert.equal(bag.setAllHidden, spec.setAllHidden);

        // The real mutator closures actually work post-normalize (not just
        // shape-checked) — setHidden on column 0 flips the REAL row.hidden.
        bag.columns[0].setHidden(true);
        assert.equal(tiers[0].hidden, true, 'the real row object was mutated through the normalized bag');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. three-provider.js getCameraControl() (camera) — REAL execution via vm
// sandbox: real three.min.js + real three-provider.js + real render-boot.js,
// exactly the established technique in realm-frqtl-three-monaco-collision.test.mjs.
// ─────────────────────────────────────────────────────────────────────────────
describe('producer conformance (3/4) — three-provider.js getCameraControl() (REAL execution) -> camera', function () {
    const THREE_SRC = readFileSync(path.join(repoRoot, 'lib/frqtl/assets/vendor/three.min.js'), 'utf8');
    const THREE_PROVIDER_SRC = readFileSync(path.join(repoRoot, 'lib/frqtl/compat/renderer/providers/three-provider.js'), 'utf8');
    const RENDER_BOOT_SRC = readFileSync(path.join(repoRoot, 'lib/frqtl/experiments/_shared/render-boot.js'), 'utf8');
    const DISPLAY_SLOT_SRC = readFileSync(path.join(repoRoot, 'lib/frqtl/compat/renderer/display-slot.js'), 'utf8');
    const PAGE_PARAMS_SRC = readFileSync(path.join(repoRoot, 'lib/shim/page-params/index.js'), 'utf8');
    // getCameraControl()'s `poseFields` are normalized through the shared
    // lib/shim/field-descriptor contract (the SAME module renderCapabilities()
    // uses), resolved FAIL-LOUD at call time from window.FieldDescriptorSchema.
    // stack-boot.js loads the whole ENGINE array — field-descriptor included —
    // before the RENDERER array, so the sandbox mirrors that order here.
    const FIELD_DESCRIPTOR_SRC = readFileSync(path.join(repoRoot, 'lib/shim/field-descriptor/index.js'), 'utf8');
    // …and the camera's DECLARATIVE contract (the preset table + pose-axis
    // descriptors the handle publishes), which the RENDERER phase loads
    // immediately before three-provider.js for the same reason.
    const CAMERA_CONTRACT_SRC = readFileSync(
        path.join(repoRoot, 'lib/frqtl/compat/renderer/providers/three-camera-contract.js'), 'utf8');
    // THE point-shape authority for the pose bag ({x,y,z} AND [x,y,z]) — a shared
    // contract-half BOTH camera handles ferry every point-valued field through, which the
    // RENDERER phase loads before both providers for exactly this reason.
    const ORBIT_BAG_SRC = readFileSync(
        path.join(repoRoot, 'lib/frqtl/compat/renderer/orbit-bag.js'), 'utf8');

    async function getRealCameraControl() {
        const sandbox = { console };
        sandbox.window = sandbox;
        sandbox.self = sandbox;
        sandbox._egpt3D = true; // the 3D orbit-camera opt-in (real-provider precondition)
        sandbox.URLSearchParams = URLSearchParams;
        sandbox.location = { search: '' };
        sandbox.document = {
            getElementById() { return null; },
            createElement(tag) { return { tagName: tag, style: {}, _attrs: {}, setAttribute(k, v) { this._attrs[k] = v; }, appendChild() {} }; },
            body: { appendChild() {} },
            documentElement: { appendChild() {} },
            addEventListener() {}
        };
        // render-boot.js's tail call reads window.PageParams synchronously.
        sandbox.fetch = async function () {
            return { ok: true, status: 200, statusText: 'OK', text: async () => THREE_SRC };
        };
        vm.createContext(sandbox);
        vm.runInContext('(function(){' + PAGE_PARAMS_SRC + '\n})();', sandbox, { filename: 'page-params.js' });
        vm.runInContext(FIELD_DESCRIPTOR_SRC, sandbox, { filename: 'field-descriptor.js' });
        vm.runInContext(CAMERA_CONTRACT_SRC, sandbox, { filename: 'three-camera-contract.js' });
        vm.runInContext(ORBIT_BAG_SRC, sandbox, { filename: 'orbit-bag.js' });
        vm.runInContext(THREE_PROVIDER_SRC, sandbox, { filename: 'three-provider.js' });
        // THE DISPLAY SLOT heads the RENDERER phase; render-boot registers INTO it.
        vm.runInContext(DISPLAY_SLOT_SRC, sandbox, { filename: 'display-slot.js' });
        vm.runInContext(RENDER_BOOT_SRC, sandbox, { filename: 'render-boot.js' });
        await sandbox._egptSelectRenderer('three');
        assert.equal(sandbox._egptRenderer, 'three');
        return sandbox.FrqtlDisplay.get().getCameraControl();
    }

    test('the real getCameraControl() handle passes normalizeControlDescriptor({kind:\'camera\', ...})', async function () {
        const cam = await getRealCameraControl();
        assert.ok(cam, 'real 3D provider returns a non-null camera control');

        const bag = normalizeControlDescriptor({ kind: 'camera', id: 'cam', ...cam });
        assert.equal(bag.kind, 'camera');
        // bag.presets is a vm-realm Array (a DIFFERENT Array constructor than
        // this file's) — deepStrictEqual's prototype check fails on it even
        // with identical contents; compare via Array.from + plain values.
        assert.deepEqual(Array.from(bag.presets), ['down-barrel', 'table-top', 'rooftop'], 'real preset list');
        assert.equal(bag.setOrbit, cam.setOrbit);
        assert.equal(bag.getOrbit, cam.getOrbit);
        assert.equal(bag.setPreset, cam.setPreset);

        // The real setPreset/getOrbit round-trip actually works post-normalize.
        bag.setPreset('table-top');
        const orbit = bag.getOrbit();
        assert.equal(orbit.azimuth, 0, 'table-top preset (real computed orbit, not a stub)');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. fx-experiment.js _buildLoopControl() (loop) — COPY-VERBATIM EXCEPTION.
// Cited source: lib/frqtl/experiments/_shared/fx-experiment.js, the `state`
// object literal + its two setEnabled/setTicks methods (as of this writing,
// function _buildLoopControl(cfg) body). NOT independently invokable — see
// the file docstring above for why REAL execution is disproportionate here.
// ─────────────────────────────────────────────────────────────────────────────
describe('producer conformance (4/4) — fx-experiment.js _buildLoopControl() (COPY-VERBATIM, cited — see file docstring) -> loop', function () {
    test('a byte-for-byte copy of the real _buildLoopControl() state shape passes normalizeControlDescriptor({kind:\'loop\', ...})', function () {
        // Verbatim from lib/frqtl/experiments/_shared/fx-experiment.js
        // _buildLoopControl(cfg)'s `state` object (the bar-absent early-return
        // shape — the GYM's chrome=canvas path, which is the MORE restrictive
        // of the two return shapes since it omits the cb/numInput DOM mirror).
        const cfg = { loopTicks: undefined };
        let cb = null;
        let numInput = null;
        const state = { enabled: false, ticks: (typeof cfg.loopTicks === 'number' && cfg.loopTicks > 0) ? cfg.loopTicks : 720 };
        state.setEnabled = function (v) {
            state.enabled = !!v;
            if (cb) { cb.checked = state.enabled; }
        };
        state.setTicks = function (n) {
            if (typeof n === 'number' && n > 0) {
                state.ticks = n;
                if (numInput) { numInput.value = n; }
            }
        };

        const bag = normalizeControlDescriptor({ kind: 'loop', id: 'loopControl', ...state });
        assert.equal(bag.kind, 'loop');
        assert.equal(bag.enabled, false);
        assert.equal(bag.ticks, 720, 'the real default (cfg.loopTicks absent)');
        assert.equal(bag.setEnabled, state.setEnabled);
        assert.equal(bag.setTicks, state.setTicks);

        bag.setTicks(300);
        assert.equal(state.ticks, 300, 'the real closure mutated the real state object post-normalize');
    });
});
