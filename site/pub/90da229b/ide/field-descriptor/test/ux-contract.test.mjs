/* Copyright 2023-2026 by Essam Abadir */

/**
 * ux-contract.test.mjs — the UX presentation-vocabulary owner gate
 * (ws-experiments-walkthrough Bite 5b A0).
 *
 * lib/shim/field-descriptor owns the closed UX vocabularies (UX_HANDLE_ZONES /
 * UX_DRAGGABLE_MODES / UX_SHELL_RENDER) + normalizeUx — the PEER of FIELD_TYPES.
 * Consumers FERRY these:
 *   - ObjectSchema.ux(kind) runs a descriptor's `ux:{}` block through normalizeUx.
 *   - author-bbox-overlay.js asserts its emitted zone names ⊆ UX_HANDLE_ZONES.
 * These assertions are DRIVEN OFF THE EXPORTED LISTS (never a hand-copied duplicate),
 * so adding/renaming a vocab member is a CI failure in exactly one place — the
 * schema-mirror-drift gate for the ux contract.
 *
 * Run: node --test lib/shim/field-descriptor/test/ux-contract.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

const FieldDescriptorSchema = require(path.join(repoRoot, 'lib/shim/field-descriptor/index.js'));
const { UX_HANDLE_ZONES, UX_DRAGGABLE_MODES, UX_SHELL_RENDER, UX_ENVELOPE_KEYS, normalizeUx } =
    FieldDescriptorSchema;
const { ObjectSchema } = require(path.join(repoRoot, 'lib/frqtl/objects/schema/index.js'));

/* ── (1) Vocabulary is a well-formed closed set ─────────────────────────────── */

describe('ux — (1) closed vocabularies', () => {
    test('UX_HANDLE_ZONES contains move + 8 scale zones, no duplicates', () => {
        assert.ok(UX_HANDLE_ZONES.includes('move'), 'move is a zone');
        for (const z of ['scale-tl', 'scale-tr', 'scale-bl', 'scale-br',
                         'scale-t', 'scale-b', 'scale-l', 'scale-r']) {
            assert.ok(UX_HANDLE_ZONES.includes(z), 'scale zone ' + z);
        }
        assert.strictEqual(new Set(UX_HANDLE_ZONES).size, UX_HANDLE_ZONES.length, 'no dup zones');
    });
    test('UX_DRAGGABLE_MODES = [2d,3d]; UX_SHELL_RENDER = [design,run,never]', () => {
        assert.deepEqual(UX_DRAGGABLE_MODES.slice().sort(), ['2d', '3d']);
        assert.deepEqual(UX_SHELL_RENDER.slice().sort(), ['design', 'never', 'run']);
    });
    test('UX_ENVELOPE_KEYS names every field normalizeUx fills', () => {
        const bag = normalizeUx(undefined);
        for (const k of UX_ENVELOPE_KEYS) {
            assert.ok(k in bag, 'envelope key present in normalized bag: ' + k);
        }
    });
});

/* ── (2) normalizeUx — legacy defaults (R6) + throw-or-apply ────────────────── */

describe('ux — (2) normalizeUx defaults + validation', () => {
    test('absent block ⇒ today\'s behavior (resizable, both draggable, all zones, all sections, design)', () => {
        const d = normalizeUx(undefined);
        assert.strictEqual(d.resizable, true);
        assert.deepEqual(d.draggable, { '2d': true, '3d': true });
        assert.deepEqual(d.handles, UX_HANDLE_ZONES.slice());   // ferried, not a re-list
        assert.strictEqual(d.inspectorSections, null);
        assert.strictEqual(d.shellRender, 'design');
        assert.deepEqual(normalizeUx(null), d, 'null ≡ undefined ≡ legacy default');
    });
    test('resizable:false shorthand ⇒ handles:[move]', () => {
        assert.deepEqual(normalizeUx({ resizable: false }).handles, ['move']);
    });
    test('a partial block fills the rest from defaults', () => {
        const b = normalizeUx({ shellRender: 'run' });
        assert.strictEqual(b.shellRender, 'run');
        assert.strictEqual(b.resizable, true);   // unspecified → default
    });
    test('throws on an invalid member (never silently defaults around)', () => {
        assert.throws(() => normalizeUx({ shellRender: 'sometimes' }), /shellRender/);
        assert.throws(() => normalizeUx({ handles: ['scale-XX'] }), /UX_HANDLE_ZONES/);
        assert.throws(() => normalizeUx({ draggable: { '2d': 'yes' } }), /draggable/);
        assert.throws(() => normalizeUx({ resizable: 1 }), /resizable/);
        assert.throws(() => normalizeUx([1, 2, 3]), /plain object/);
    });
    test('every declared handle value is a member of UX_HANDLE_ZONES', () => {
        const b = normalizeUx({ handles: ['move', 'scale-tl'] });
        for (const z of b.handles) { assert.ok(UX_HANDLE_ZONES.includes(z)); }
    });
});

/* ── (3) ObjectSchema.ux ferries normalizeUx; SphereEmitter declares its block ── */

describe('ux — (3) ObjectSchema.ux ferry + SphereEmitter block', () => {
    test('ObjectSchema.ux(kind) returns the normalized bag for any kind', () => {
        const lo = ObjectSchema.ux('LargeObject');   // no ux block → legacy default
        assert.strictEqual(lo.resizable, true);
        assert.strictEqual(lo.shellRender, 'design');
    });
    test('SphereEmitter declares: not resizable, 2D-drag only, move-only, emitter+shell sections, design shell', () => {
        const ux = ObjectSchema.ux('SphereEmitter');
        assert.strictEqual(ux.resizable, false);
        assert.deepEqual(ux.draggable, { '2d': true, '3d': false });
        assert.deepEqual(ux.handles, ['move']);
        assert.deepEqual(ux.inspectorSections, ['emitter', 'shell']);   // R2-3 added 'shell'
        assert.strictEqual(ux.shellRender, 'design');
    });
    test('every SphereEmitter handle is a valid UX_HANDLE_ZONES member (no drift)', () => {
        for (const z of ObjectSchema.ux('SphereEmitter').handles) {
            assert.ok(UX_HANDLE_ZONES.includes(z), 'handle ' + z + ' ∈ UX_HANDLE_ZONES');
        }
    });
});

/* ── (4) author-bbox-overlay ferries the zone set (Node-side, off the exported list) ──
 *
 * The overlay is a features-layer ESM module; it CANNOT `import` the classic-script/
 * CJS+window field-descriptor contract at browser load (that blanks Studio). So the
 * ferry drift-gate lives HERE (Node can `require` field-descriptor): AUTHOR_BBOX_ZONES
 * (the overlay's exported list) MUST be ⊆ UX_HANDLE_ZONES. Same discipline as
 * render-intent-contract.test — the drift is a CI failure, driven off the exported list.
 */
describe('ux — (4) author-bbox-overlay AUTHOR_BBOX_ZONES ⊆ UX_HANDLE_ZONES + classifier', () => {
    test('every AUTHOR_BBOX_ZONES entry is a UX_HANDLE_ZONES member (the ferry, off the exported list)', async () => {
        const { AUTHOR_BBOX_ZONES, hitBboxZone } = await import(
            path.join(repoRoot, 'lib/features/ide/author-bbox-overlay.js'));
        for (const z of AUTHOR_BBOX_ZONES) {
            assert.ok(UX_HANDLE_ZONES.includes(z),
                'author-bbox-overlay zone "' + z + '" is not a member of UX_HANDLE_ZONES — ' +
                'the interaction-zone vocabulary drifted; add it at the ONE owner (field-descriptor).');
        }
        // And the runtime classifier never invents a zone outside the exported list.
        const bbox = { left: 100, top: 100, width: 60, height: 40 };
        for (let x = 80; x <= 180; x += 5) {
            for (let y = 80; y <= 160; y += 5) {
                const z = hitBboxZone(bbox, { x, y });
                assert.ok(z === null || AUTHOR_BBOX_ZONES.includes(z),
                    'hitBboxZone returned "' + z + '" — must be null or an AUTHOR_BBOX_ZONES member');
            }
        }
    });
});
