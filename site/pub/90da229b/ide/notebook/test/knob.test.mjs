/* Copyright 2023-2026 by Essam Abadir */

/**
 * knob.test.mjs — the SINGLE knob authority (WS-NOTEBOOK-D GAP2).
 *
 * Verifies validateAndMap:
 *   - maps the manifest param (quanta) → the factory option (quantumLimit),
 *   - FAILS LOUD on an unknown key, an out-of-range value, and a spec with no
 *     knob (the hint-only-knob class the gate forbids),
 *   - returns {} for an empty opts map (no knob requested ≠ an error).
 *
 * knobSchemaFor + validateAndMap read the notebook-scoped declaration
 * (lib/shim/notebook/notebook-knobs.js — NOTEBOOK_KNOBS), the SINGLE knob-schema
 * home. The gallery-wave-interference notebook declares { spec:'setupWaveInterference',
 * knob:{ param:'quanta', min:100, max:2000, … } }; if that declaration changes
 * these tests track it. The gallery-wave-interference notebook's live quanta knob
 * is the instance these assertions guard.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAndMap, knobSchemaFor } from '../knob.js';

test('knobSchemaFor resolves the wave-interference knob from the manifest', () => {
    const schema = knobSchemaFor('setupWaveInterference');
    assert.ok(schema, 'wave-interference defines a knob');
    assert.equal(schema.param, 'quanta');
    assert.equal(typeof schema.min, 'number');
    assert.equal(typeof schema.max, 'number');
});

test('knobSchemaFor returns null for a spec with no knob', () => {
    assert.equal(knobSchemaFor('setupDoubleSlit'), null);
    assert.equal(knobSchemaFor(''), null);
});

test('validateAndMap maps quanta → quantumLimit (the genuine driving wire)', () => {
    const mapped = validateAndMap('setupWaveInterference', { quanta: 800 });
    assert.deepEqual(mapped, { quantumLimit: 800 });
});

test('validateAndMap returns {} for empty/absent opts (not an error)', () => {
    assert.deepEqual(validateAndMap('setupWaveInterference', {}), {});
    assert.deepEqual(validateAndMap('setupWaveInterference', undefined), {});
    // even a no-knob spec is fine when there are no opts to validate
    assert.deepEqual(validateAndMap('setupDoubleSlit', {}), {});
});

test('FAIL-LOUD: unknown key throws (no silent ignore)', () => {
    assert.throws(
        () => validateAndMap('setupWaveInterference', { frobnicate: 9 }),
        /unknown knob key "frobnicate"/
    );
});

test('FAIL-LOUD: out-of-range value throws', () => {
    assert.throws(
        () => validateAndMap('setupWaveInterference', { quanta: 999999 }),
        /out of range/
    );
    assert.throws(
        () => validateAndMap('setupWaveInterference', { quanta: 1 }),
        /out of range/
    );
});

test('FAIL-LOUD: opts on a spec with no knob throws', () => {
    assert.throws(
        () => validateAndMap('setupDoubleSlit', { quanta: 800 }),
        /defines NO knob/
    );
});

test('FAIL-LOUD: a non-numeric value throws', () => {
    assert.throws(
        () => validateAndMap('setupWaveInterference', { quanta: 'lots' }),
        /not a finite number/
    );
});
