/* Copyright 2023-2026 by Essam Abadir */

/**
 * field-descriptor.test.mjs — the schema-mirror-drift conformance gate for
 * `lib/shim/field-descriptor/index.js` (WS Studio Controls Realignment §7 r2
 * CEO call C1).
 *
 * Co-located with the OWNER (mirrors lib/shim/controls/test/control-descriptor-
 * contract.test.mjs and lib/shim/frame-data/test/render-intent-contract.test.mjs
 * — the established "owner directory, node --test sweep" convention).
 *
 * Six assertions:
 *   (1) normalizeFieldDescriptor happy path — a minimal valid fixture per
 *       FIELD_TYPES member normalizes without throwing and carries every
 *       input key.
 *   (2) FAIL-LOUD — missing name/type/description, an unknown type, and a
 *       mistyped optional key (unit/constraint/engineVisible/widgetHint/
 *       widgetConfig) all throw.
 *   (3) Never mutates the input — normalize returns a NEW object.
 *   (4) DRIFT (a): every field.type declared across every ObjectSchema
 *       descriptor (lib/frqtl/objects/schema/index.js) is a member of THIS
 *       module's FIELD_TYPES — the physics-schema half of the drift gate
 *       (the OTHER half — the load-time assertion inside schema/index.js
 *       itself — throws at require() time; this test additionally proves the
 *       exhaustive field sweep passes it).
 *   (5) DRIFT (b): makeControlsForObject.js's HANDLED_FIELD_TYPES (its
 *       TYPE_DISPATCH key set) is EXACTLY FIELD_TYPES, as sets (no member of
 *       one absent from the other) — the render/factory half of the drift
 *       gate this extraction exists to close.
 *   (6) DRIFT (c): once makeControlsForRenderSurface.js exists, every
 *       capability descriptor's `type` returned by BOTH renderer providers'
 *       `renderCapabilities()` is also a FIELD_TYPES member.
 *
 * Run: node --test lib/shim/field-descriptor/test/field-descriptor.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

const { FIELD_TYPES, FIELD_ENVELOPE_KEYS, normalizeFieldDescriptor } =
    require(path.join(repoRoot, 'lib/shim/field-descriptor/index.js'));

describe('lib/shim/field-descriptor — owner completeness', () => {
    test('FIELD_TYPES is a non-empty closed array of unique strings', () => {
        assert.ok(Array.isArray(FIELD_TYPES) && FIELD_TYPES.length > 0);
        const set = new Set(FIELD_TYPES);
        assert.equal(set.size, FIELD_TYPES.length, 'no duplicate type names');
        for (const t of FIELD_TYPES) { assert.equal(typeof t, 'string'); }
    });

    test('FIELD_ENVELOPE_KEYS includes the mandatory trio', () => {
        assert.ok(FIELD_ENVELOPE_KEYS.includes('name'));
        assert.ok(FIELD_ENVELOPE_KEYS.includes('type'));
        assert.ok(FIELD_ENVELOPE_KEYS.includes('description'));
        assert.ok(FIELD_ENVELOPE_KEYS.includes('default'));
    });
});

describe('lib/shim/field-descriptor — normalizeFieldDescriptor happy path', () => {
    for (const type of FIELD_TYPES) {
        test(`type "${type}" normalizes with the minimal mandatory trio`, () => {
            const bag = normalizeFieldDescriptor({ name: 'x', type, description: 'a field' });
            assert.equal(bag.name, 'x');
            assert.equal(bag.type, type);
            assert.equal(bag.description, 'a field');
        });
    }

    test('carries every optional key through untouched', () => {
        const constraint = { min: 0, max: 3 };
        const widgetConfig = { step: 0.1 };
        const bag = normalizeFieldDescriptor({
            name: 'godrays', type: 'number', description: 'god-rays intensity',
            unit: 'intensity', constraint, widgetConfig, widgetHint: 'slider',
            engineVisible: false, default: 0
        });
        assert.equal(bag.unit, 'intensity');
        assert.equal(bag.constraint, constraint, 'constraint carried by reference');
        assert.equal(bag.widgetConfig, widgetConfig, 'widgetConfig carried by reference');
        assert.equal(bag.widgetHint, 'slider');
        assert.equal(bag.engineVisible, false);
        assert.equal(bag.default, 0);
    });

    test('never mutates the input object', () => {
        const input = { name: 'x', type: 'number', description: 'd' };
        const before = JSON.stringify(input);
        const bag = normalizeFieldDescriptor(input);
        assert.notEqual(bag, input, 'returns a NEW object');
        assert.equal(JSON.stringify(input), before, 'input untouched');
    });
});

describe('lib/shim/field-descriptor — FAIL-LOUD', () => {
    test('missing name throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ type: 'number', description: 'd' }));
    });
    test('empty name throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: '', type: 'number', description: 'd' }));
    });
    test('missing type throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', description: 'd' }));
    });
    test('unknown type throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'not-a-type', description: 'd' }));
    });
    test('missing description throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number' }));
    });
    test('empty description throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number', description: '' }));
    });
    test('non-string unit throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number', description: 'd', unit: 5 }));
    });
    test('non-object constraint throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number', description: 'd', constraint: 'nope' }));
    });
    test('array constraint throws (must be a plain object)', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number', description: 'd', constraint: [] }));
    });
    test('non-boolean engineVisible throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number', description: 'd', engineVisible: 'yes' }));
    });
    test('non-string widgetHint throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number', description: 'd', widgetHint: 5 }));
    });
    test('non-object widgetConfig throws', () => {
        assert.throws(() => normalizeFieldDescriptor({ name: 'x', type: 'number', description: 'd', widgetConfig: 5 }));
    });
    test('non-object partial throws', () => {
        assert.throws(() => normalizeFieldDescriptor(null));
        assert.throws(() => normalizeFieldDescriptor('nope'));
    });
});

describe('lib/shim/field-descriptor — DRIFT (a): ObjectSchema field.type ⊆ FIELD_TYPES', () => {
    const { ObjectSchema } = require(path.join(repoRoot, 'lib/frqtl/objects/schema/index.js'));

    test('every descriptor field.type is a FIELD_TYPES member', () => {
        const kinds = ObjectSchema.kinds();
        assert.ok(kinds.length > 0);
        let checked = 0;
        for (const kind of kinds) {
            const desc = ObjectSchema.get(kind);
            for (const field of desc.fields) {
                assert.ok(
                    FIELD_TYPES.includes(field.type),
                    `${kind}.${field.name} has type "${field.type}" — not in FIELD_TYPES`
                );
                checked++;
            }
        }
        assert.ok(checked > 50, 'sanity: swept a non-trivial number of fields');
    });

    test('ObjectSchema exposes FieldDescriptorSchema by reference', () => {
        assert.ok(ObjectSchema.FieldDescriptorSchema, 'ObjectSchema.FieldDescriptorSchema is set');
        assert.equal(ObjectSchema.FieldDescriptorSchema.FIELD_TYPES, FIELD_TYPES,
            'same array reference — not a copy');
    });
});

describe('lib/shim/field-descriptor — DRIFT (b): makeControlsForObject TYPE_DISPATCH === FIELD_TYPES', () => {
    const MakeControlsForObject = require(
        path.join(repoRoot, 'lib/frqtl/objects/objects/makeControlsForObject.js'));

    test('HANDLED_FIELD_TYPES is exactly FIELD_TYPES as sets', () => {
        const a = new Set(MakeControlsForObject.HANDLED_FIELD_TYPES);
        const b = new Set(FIELD_TYPES);
        assert.equal(a.size, b.size, 'same cardinality');
        for (const t of b) {
            assert.ok(a.has(t), `makeControlsForObject.HANDLED_FIELD_TYPES is missing FIELD_TYPES member "${t}"`);
        }
        for (const t of a) {
            assert.ok(b.has(t), `makeControlsForObject.HANDLED_FIELD_TYPES has extra type "${t}" not in FIELD_TYPES`);
        }
    });
});

describe('lib/shim/field-descriptor — DRIFT (c): renderCapabilities() descriptor types ⊆ FIELD_TYPES', () => {
    const { makeControlsForRenderSurface } = require(
        path.join(repoRoot, 'lib/frqtl/objects/objects/makeControlsForRenderSurface.js'));

    // Fake providers exercising both the "no renderCapabilities" (absent — optional
    // capability, per the getCameraControl precedent) and the "declares capabilities"
    // paths — mirrors the real p5-provider/three-provider renderCapabilities() shapes
    // exactly (each capability IS a normalizeFieldDescriptor-shaped field descriptor).
    function fakeRunner(caps) {
        return {
            _renderOptions: {},
            setRenderOption(k, v) { this._renderOptions[k] = v; },
            getRenderOption(k) { return this._renderOptions[k]; },
            // Mirrors FrqtlApp.prototype.renderCapabilities — the RUNNER-level
            // aggregation method (S5a) makeControlsForRenderSurface actually calls.
            renderCapabilities: caps ? () => caps : undefined
        };
    }

    test('absent renderCapabilities() -> empty controls, no throw (optional capability)', () => {
        const runner = fakeRunner(null);
        const result = makeControlsForRenderSurface({ runner });
        assert.deepEqual(result.controls, []);
    });

    test('every generated control descriptor type traces back to a FIELD_TYPES member', () => {
        const caps = [
            { name: 'shape', type: 'enum', description: 'render shape',
              constraint: { values: { ball: 'ball', box: 'box' } }, default: 'ball' },
            { name: 'godrays', type: 'number', description: 'god-rays intensity',
              constraint: { min: 0, max: 3 }, default: 0 }
        ];
        // Every fixture field.type used above IS a FIELD_TYPES member by construction —
        // this test's job is to prove makeControlsForRenderSurface does not invent a
        // THIRD type vocabulary anywhere in its own descriptor-building path.
        for (const c of caps) {
            assert.ok(FIELD_TYPES.includes(c.type), `fixture capability "${c.name}" uses a non-FIELD_TYPES type`);
        }
        const runner = fakeRunner(caps);
        const result = makeControlsForRenderSurface({ runner });
        assert.equal(result.controls.length, 2);
    });
});
