/**
 * render-intent-contract.test.mjs — render-intent value-vocabulary owner-completeness +
 * decoder-ferry conformance (the schema-mirror-drift gate for render intent).
 *
 * Owner (architect ruling 2026-06-30): lib/shim/frame-data owns BOTH the render-intent
 * KEY LIST (RENDER_INTENT_KEYS) AND the VALUE SETS (RENDER_INTENT_VALUES). The decoders
 * (RenderShape for render.shape, LightColor for render.colorScheme) FERRY those value sets
 * by reference — they must NOT re-enumerate them. This test makes that drift a CI failure,
 * exactly like cell-attrs-contract.test.mjs does for CELL_ATTRS.
 *
 * Co-located with the OWNER (mirrors lib/shim/notebook/test/cell-attrs-contract.test.mjs)
 * rather than lib/frqtl/conformance/ — that dir's suites are WASM-ENGINE scenarios; the
 * render-intent contract is pure-JS (engine-opaque, no WASM), so it belongs in the
 * `node --test` sweep (auto-run by `make verify` → test-js).
 *
 * Four assertions:
 *   (1) Owner-completeness — every RENDER_INTENT_KEYS key is either ENUM (has a
 *       RENDER_INTENT_VALUES array) or OPEN-ID (no entry = accept-any-string), and
 *       assertRenderIntentConformance accepts declared values + rejects undeclared enum values.
 *   (2) Single-source ferry — RenderShape.VALID_SHAPES IS (===) the frame-data array;
 *       a decoder that copies/re-lists the values would break reference identity → fails here.
 *   (3) Reverse-drift round-trip — every declared render.shape value round-trips through
 *       RenderShape.resolve WITHOUT falling to default; every render.colorScheme value
 *       decodes to a scheme-appropriate color via LightColor (roygbiv ≠ warmcool) → catches
 *       "value declared but not decoded".
 *   (4) Open-id keys — render.color and render.mesh carry NO value set and accept any string.
 *
 * Run: node --test lib/shim/frame-data/test/render-intent-contract.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

// All three are CommonJS (module.exports). Load via require for clean interop.
const {
    RENDER_INTENT_KEYS,
    RENDER_INTENT_VALUES,
    assertRenderIntentConformance
} = require(path.join(repoRoot, 'lib/shim/frame-data/index.js'));
const { RenderShape } = require(path.join(repoRoot, 'lib/frqtl/compat/renderer/RenderShape.js'));
const { RenderMesh }  = require(path.join(repoRoot, 'lib/frqtl/compat/renderer/RenderMesh.js'));
const { LightColor }  = require(path.join(repoRoot, 'lib/frqtl/objects/constants/LightColor.js'));

/** Build a frame whose string_map carries one render-intent key. */
function frameWith(key, value) {
    return { data: { string_map: { [key]: value } } };
}

/* ── (1) Owner-completeness ────────────────────────────────────────────────── */

describe('render-intent — (1) owner-completeness (frame-data owns keys + values)', function () {
    test('every key is ENUM (has value array) or OPEN-ID (no value entry)', function () {
        for (const key of RENDER_INTENT_KEYS) {
            const vals = RENDER_INTENT_VALUES[key];
            const isEnum   = Array.isArray(vals) && vals.length > 0;
            const isOpenId = vals === undefined;
            assert.ok(isEnum || isOpenId,
                `render-intent key "${key}" is neither a non-empty ENUM array nor OPEN-ID ` +
                `(absent) in RENDER_INTENT_VALUES — got ${JSON.stringify(vals)}`);
        }
    });

    test('RENDER_INTENT_KEYS has no duplicates', function () {
        const seen = new Set();
        for (const key of RENDER_INTENT_KEYS) {
            assert.ok(!seen.has(key), `duplicate render-intent key: "${key}"`);
            seen.add(key);
        }
    });

    test('assertRenderIntentConformance accepts every declared enum value, rejects undeclared', function () {
        for (const [key, vals] of Object.entries(RENDER_INTENT_VALUES)) {
            for (const v of vals) {
                assert.doesNotThrow(() => assertRenderIntentConformance({ [key]: v }),
                    `declared value "${v}" for enum key "${key}" must pass conformance`);
            }
            // An undeclared value for an enum key must be rejected.
            assert.throws(() => assertRenderIntentConformance({ [key]: '__not_a_real_value__' }),
                `undeclared value for enum key "${key}" must be rejected`);
        }
    });
});

/* ── (2) Single-source ferry (decoder does not re-list) ─────────────────────── */

describe('render-intent — (2) decoders ferry the value set (no re-enumeration)', function () {
    test('RenderShape.VALID_SHAPES IS the frame-data array (reference identity)', function () {
        assert.strictEqual(RenderShape.VALID_SHAPES, RENDER_INTENT_VALUES['render.shape'],
            'RenderShape.VALID_SHAPES must BE (===) frame-data RENDER_INTENT_VALUES["render.shape"] — ' +
            'a copy/re-list breaks single-source and re-introduces schema-mirror drift');
    });
});

/* ── (3) Reverse-drift round-trip (every declared value is actually decoded) ── */

describe('render-intent — (3) reverse-drift: every declared value decodes (no silent default)', function () {
    test('every render.shape value round-trips through RenderShape.resolve', function () {
        for (const shape of RENDER_INTENT_VALUES['render.shape']) {
            const resolved = RenderShape.resolve(frameWith('render.shape', shape), {});
            assert.strictEqual(resolved, shape,
                `render.shape "${shape}" did not round-trip through RenderShape.resolve ` +
                `(got "${resolved}") — declared in frame-data but not decoded`);
        }
    });

    test('every render.colorScheme value decodes to a valid [r,g,b] via LightColor', function () {
        for (const scheme of RENDER_INTENT_VALUES['render.colorScheme']) {
            const rgb = LightColor.getRgbBySchemeName(scheme, 0.5);
            assert.ok(Array.isArray(rgb) && rgb.length === 3 && rgb.every((n) => typeof n === 'number'),
                `render.colorScheme "${scheme}" did not decode to a valid [r,g,b] (got ${JSON.stringify(rgb)})`);
        }
    });

    test('roygbiv is genuinely decoded (NOT silently falling through to warmcool)', function () {
        // If a refactor dropped the roygbiv branch, getRgbBySchemeName would return warmcool
        // for both — this catches that silent collapse (the reverse-drift failure mode for an
        // enum value whose decode path was removed).
        const roygbiv  = LightColor.getRgbBySchemeName('roygbiv', 0.5);
        const warmcool = LightColor.getRgbBySchemeName('warmcool', 0.5);
        assert.notDeepStrictEqual(roygbiv, warmcool,
            'roygbiv and warmcool produced the same color at v=0.5 — the roygbiv decode path ' +
            'appears to have collapsed into the warmcool default');
    });
});

/* ── (4) Open-id keys accept any string ─────────────────────────────────────── */

describe('render-intent — (4) open-id keys (render.color, render.mesh) accept any string', function () {
    test('render.mesh is OPEN-ID (no value set) and accepts an arbitrary asset id', function () {
        assert.strictEqual(RENDER_INTENT_VALUES['render.mesh'], undefined,
            'render.mesh must have NO RENDER_INTENT_VALUES entry (it is open-id)');
        assert.ok(RENDER_INTENT_KEYS.includes('render.mesh'),
            'render.mesh must be a declared render-intent key');
        assert.doesNotThrow(() => assertRenderIntentConformance({ 'render.mesh': 'objaverse://some-glb-asset-id' }),
            'an open-id render.mesh value must pass conformance (validation is the resolver\'s job, fail-loud at load)');
    });

    test('render.color is OPEN-ID and accepts an arbitrary CSV', function () {
        assert.strictEqual(RENDER_INTENT_VALUES['render.color'], undefined,
            'render.color must have NO RENDER_INTENT_VALUES entry (it is open-id)');
        assert.doesNotThrow(() => assertRenderIntentConformance({ 'render.color': '12,34,56,255' }),
            'an open-id render.color CSV must pass conformance');
    });

    test('render.meshScale / render.meshRotation are DECLARED OPEN-ID keys (Bite 5b R3-3)', function () {
        // Previously written ad-hoc but undeclared + unread (Red-Team §1). Now declared
        // at the owner + read per-clone in three-provider _layoutMeshClones. OPEN-ID: a number-string
        // (scale multiplier) / an euler-radians CSV — no enum, decoder owns validation.
        for (const k of ['render.meshScale', 'render.meshRotation']) {
            assert.ok(RENDER_INTENT_KEYS.includes(k), k + ' must be a declared render-intent key');
            assert.strictEqual(RENDER_INTENT_VALUES[k], undefined, k + ' must be OPEN-ID (no value set)');
        }
        assert.doesNotThrow(() => assertRenderIntentConformance({ 'render.meshScale': '2.5', 'render.meshRotation': '0,0,-1.5708' }),
            'open-id mesh scale/rotation strings must pass conformance');
    });

    // render.outline reverse-drift (Red-Team §6 item 3): the outline ENUM has no isolated resolver
    // (the p5 provider decodes it INLINE), so "every declared value is actually decoded" is asserted
    // at the INTEGRATION tick-loop level — see
    // lib/frqtl/compat/renderer/providers/test/per-frame-render-intent.test.mjs (outline 'true' takes
    // the stroke-outline branch; 'false' the filled glow). Owner-completeness (§1) already covers the
    // enum value set here; the decode coverage lives in that integration gate.
});

/* ── (5) RenderMesh resolver — the open-id render.mesh decode authority ──────── */

describe('render-intent — (5) RenderMesh resolver (render.mesh external-geometry intent)', function () {
    test('RenderMesh.KEY is the frame-data-owned open-id key "render.mesh"', function () {
        assert.strictEqual(RenderMesh.KEY, 'render.mesh');
        assert.ok(RENDER_INTENT_KEYS.includes(RenderMesh.KEY),
            'RenderMesh.KEY must be a declared render-intent key in frame-data');
        assert.strictEqual(RENDER_INTENT_VALUES[RenderMesh.KEY], undefined,
            'render.mesh must be OPEN-ID (no value set)');
    });

    test('per-frame render.mesh wins; then setRenderOption default; then null', function () {
        // 1. per-frame override
        assert.strictEqual(
            RenderMesh.resolve(frameWith('render.mesh', 'objaverse://chair-01'), { mesh: 'opt-default' }),
            'objaverse://chair-01');
        // 2. experiment default via renderOpts.mesh
        assert.strictEqual(RenderMesh.resolve({}, { mesh: '/assets/teapot.glb' }), '/assets/teapot.glb');
        // 3. none routed → null (frame falls back to its sprite/cube path)
        assert.strictEqual(RenderMesh.resolve({}, {}), null);
        assert.strictEqual(RenderMesh.hasMesh({}, {}), false);
        assert.strictEqual(RenderMesh.hasMesh(frameWith('render.mesh', 'x.glb'), {}), true);
    });

    test('accepts ANY string id (open-id) — no enum validation in the resolver', function () {
        for (const id of ['objaverse://abc', '/served/a.gltf', 'https://x/y.glb', 'arbitrary-asset-id']) {
            assert.strictEqual(RenderMesh.resolve(frameWith('render.mesh', id), {}), id);
        }
        // empty string is treated as "no mesh" (a frame opts out by clearing the key).
        assert.strictEqual(RenderMesh.resolve(frameWith('render.mesh', ''), {}), null);
    });
});

/* ── (6) Canonical-stack principle gate — engine emits PRIMITIVES, no render field ──
 *
 * CEO-ratified 2026-06-30 (renderer README §9): the engine emits generic FrameData
 * primitives; the renderer/sugar DERIVES all render interpretation from them. This gate
 * makes the regression the CEO retired — adding a derived render quantity (color/frequency/
 * wavelength) as a typed FrameData field — a CI FAILURE. It reads the actual Rust contract
 * (egpt_engine FrameData struct) so it can't drift from prose.
 */
import fs from 'node:fs';
describe('render-intent — (6) engine FrameData carries the derivation BASIS, no render field', function () {
    const src = fs.readFileSync(
        path.join(repoRoot, 'lib/frqtl/crates/egpt_engine/src/tick_data.rs'), 'utf8');
    // Extract the `pub struct FrameData { … }` field block.
    const m = src.match(/pub struct FrameData\s*\{([\s\S]*?)\n\}/);
    const fields = m
        ? Array.from(m[1].matchAll(/^\s*pub\s+([a-z_][a-z0-9_]*)\s*:/gm)).map((x) => x[1])
        : [];

    test('FrameData parsed (struct found)', function () {
        assert.ok(fields.length > 0, 'could not parse the FrameData struct fields from tick_data.rs');
    });

    test('derivation BASIS present (mass, fullness, w, h) — so frequency/wavelength stay derivable', function () {
        for (const f of ['mass', 'fullness', 'w', 'h']) {
            assert.ok(fields.includes(f),
                `FrameData must carry "${f}" — removing it would force a render interpretation ` +
                `into the engine contract (capacity=w·h, wavelength=K·capacity/mass derive from these)`);
        }
    });

    test('NO typed render-interpretation field on the engine contract (render intent is opaque/derived)', function () {
        const forbidden = ['color', 'color_override', 'render_color', 'frequency', 'wavelength',
                           'render_shape', 'render_mesh', 'render_outline', 'colorscheme'];
        for (const bad of forbidden) {
            assert.ok(!fields.includes(bad),
                `FrameData carries "${bad}" — a derived render quantity must NOT be a typed engine ` +
                `field. Render intent rides string_map opaque; interpretations derive from primitives ` +
                `(renderer README §9, CEO-ratified canonical-stack principle).`);
        }
    });
});
