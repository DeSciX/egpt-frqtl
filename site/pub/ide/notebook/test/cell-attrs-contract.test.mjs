/**
 * cell-attrs-contract.test.mjs — CELL_ATTRS owner-completeness contract.
 *
 * Relocated from apps/vscode-notebook/src/test/cell-attr-contract.test.mjs as
 * part of WS-VSIX-PHASE2: the Notebook-API serializer (the sole consumer that
 * previously anchored this test) is deleted with the stack. The owner-completeness
 * guarantees live HERE, at the schema owner (lib/shim/notebook/format.js).
 *
 * Three assertions this test enforces:
 *
 *   (1) parse() output keys ⊆ CELL_ATTRS keys (+ `body`) — adding an attr to
 *       parse() without adding it to CELL_ATTRS FAILS this test.
 *
 *   (2) normalizeCellAttrs returns exactly the CELL_ATTRS key set with correct
 *       typed defaults — every key present, no extras, correct zero values.
 *
 *   (3) round-trip: parse(serialize(nb)) preserves every CELL_ATTRS value —
 *       including the fold-aware out/produces pair.
 *
 * The consumer-ferry legs (deserialize → coreFor / the .vsix round-trip) are
 * deleted with the serializer — they are NOT recreated here.
 *
 * Run: node --test lib/shim/notebook/test/cell-attrs-contract.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');

const { parse, serialize, normalize, normalizeCellAttrs, CELL_ATTRS } =
    await import(path.join(repoRoot, 'lib/shim/notebook/format.js'));

/* ── sentinels: a distinct non-default value for each CELL_ATTRS key ─────────
 *
 * Rules:
 *   - string keys → unique non-empty string sentinel
 *   - names keys  → a non-empty array (produces/out/in pick distinct names so
 *                   the produces→out fold is visible)
 *   - opts key    → a plain object with at least one key
 *   - bool key    → true
 *
 * The cell uses type="canvas" so it can legitimately carry every attr.
 * `produces` and `out` each carry distinct names (sentinel-produces, sentinel-out)
 * so the fold can be verified separately from the pure-out sentinel.
 */
const SENTINELS = {};
for (const { key, kind } of CELL_ATTRS) {
    if (kind === 'names') {
        SENTINELS[key] = [`sentinel-${key}`];
    } else if (kind === 'opts') {
        SENTINELS[key] = { sentinelKey: 1 };
    } else if (kind === 'bool') {
        SENTINELS[key] = true;
    } else {
        SENTINELS[key] = `sentinel-${key}`;
    }
}
// Produce a single sentinel so the fold adds it to out cleanly.
SENTINELS.produces = ['sentinel-produces'];
SENTINELS.out      = ['sentinel-out'];
SENTINELS.in       = ['sentinel-in'];

/**
 * Build a synthetic notebook HTML string carrying EVERY CELL_ATTRS key with its
 * sentinel value. Uses a canvas cell (type="canvas") so all attrs are valid.
 */
function buildSentinelHtml() {
    const cell = {
        ...SENTINELS,
        body: 'sentinel-body'
    };
    const nb = { title: 'sentinel-title', version: '1', cells: [cell] };
    return serialize(nb);
}

/* ── (1) meta: parse() output keys ⊆ CELL_ATTRS keys + body ──────────────── */

describe('cell-attrs-contract — (1) parse() output keys ⊆ CELL_ATTRS (owner-completeness)', function () {
    test('every key on a parse() output cell (minus body) is in CELL_ATTRS', function () {
        const html = buildSentinelHtml();
        const nb = parse(html);
        const cell = nb.cells[0];
        const attrKeys = new Set(CELL_ATTRS.map(({ key }) => key));
        for (const k of Object.keys(cell)) {
            if (k === 'body') { continue; }
            assert.ok(attrKeys.has(k),
                `parse() output carries key "${k}" which is NOT in CELL_ATTRS — ` +
                `add it to CELL_ATTRS or remove it from parse()`);
        }
    });

    test('CELL_ATTRS has no duplicate keys', function () {
        const seen = new Set();
        for (const { key } of CELL_ATTRS) {
            assert.ok(!seen.has(key), `duplicate key in CELL_ATTRS: "${key}"`);
            seen.add(key);
        }
    });
});

/* ── (2) normalizeCellAttrs returns exactly CELL_ATTRS key set with defaults ─ */

describe('cell-attrs-contract — (2) normalizeCellAttrs returns exactly CELL_ATTRS key set', function () {
    test('normalizeCellAttrs({}) returns every CELL_ATTRS key with zero default', function () {
        const bag = normalizeCellAttrs({});
        const attrKeys = CELL_ATTRS.map(({ key }) => key);
        // Every CELL_ATTRS key must be present
        for (const key of attrKeys) {
            assert.ok(key in bag, `normalizeCellAttrs({}) missing key "${key}"`);
        }
        // No extra keys beyond CELL_ATTRS
        for (const k of Object.keys(bag)) {
            const inSchema = CELL_ATTRS.some(({ key }) => key === k);
            assert.ok(inSchema, `normalizeCellAttrs({}) returned unexpected key "${k}"`);
        }
    });

    test('normalizeCellAttrs zero defaults are typed correctly', function () {
        const bag = normalizeCellAttrs({});
        for (const { key, kind } of CELL_ATTRS) {
            const v = bag[key];
            if (kind === 'names') {
                assert.ok(Array.isArray(v) && v.length === 0,
                    `default for "${key}" (names) should be [] got ${JSON.stringify(v)}`);
            } else if (kind === 'opts') {
                assert.ok(typeof v === 'object' && !Array.isArray(v) && v !== null,
                    `default for "${key}" (opts) should be {} got ${JSON.stringify(v)}`);
            } else if (kind === 'bool') {
                assert.strictEqual(v, false,
                    `default for "${key}" (bool) should be false got ${JSON.stringify(v)}`);
            } else {
                assert.strictEqual(v, '',
                    `default for "${key}" (string) should be '' got ${JSON.stringify(v)}`);
            }
        }
    });

    test('normalizeCellAttrs with sentinel values preserves every CELL_ATTRS key', function () {
        const html = buildSentinelHtml();
        const nb = parse(html);
        const parsedCell = nb.cells[0];
        const normalized = normalizeCellAttrs(parsedCell);

        for (const { key, kind } of CELL_ATTRS) {
            assert.ok(key in normalized, `normalized bag missing key "${key}"`);
            const actual = normalized[key];
            const expected = SENTINELS[key];
            if (kind === 'names') {
                assert.ok(Array.isArray(actual),
                    `normalized["${key}"] should be array, got ${typeof actual}`);
                if (key === 'out') {
                    // After fold, out contains sentinel-out AND sentinel-produces.
                    assert.ok(actual.includes('sentinel-out'),
                        `out should include sentinel-out after fold`);
                    assert.ok(actual.includes('sentinel-produces'),
                        `out should include sentinel-produces (folded from produces)`);
                } else {
                    assert.ok(actual.includes(expected[0]),
                        `normalized["${key}"] = ${JSON.stringify(actual)} should include ${expected[0]}`);
                }
            } else if (kind === 'opts') {
                assert.deepStrictEqual(actual, expected,
                    `normalized["${key}"] opts mismatch`);
            } else if (kind === 'bool') {
                assert.strictEqual(actual, expected,
                    `normalized["${key}"] bool mismatch`);
            } else {
                assert.strictEqual(actual, expected,
                    `normalized["${key}"] string mismatch`);
            }
        }
    });
});

/* ── (3) round-trip: parse(serialize(nb)) preserves every CELL_ATTRS value ── */

describe('cell-attrs-contract — (3) round-trip parse(serialize(nb)) preserves CELL_ATTRS values', function () {
    test('every CELL_ATTRS key survives parse → serialize → parse with sentinel value', function () {
        const html = buildSentinelHtml();
        const nb = parse(html);
        const reserialized = serialize(nb);
        const roundNb = parse(reserialized);
        const roundCell = roundNb.cells[0];

        for (const { key, kind } of CELL_ATTRS) {
            assert.ok(key in roundCell,
                `round-trip cell missing key "${key}" after serialize → parse`);
            const actual = roundCell[key];
            const expected = SENTINELS[key];
            if (kind === 'names') {
                assert.ok(Array.isArray(actual),
                    `round-trip cell["${key}"] should be array`);
                if (key === 'out') {
                    assert.ok(actual.includes('sentinel-out'),
                        `round-trip out should include sentinel-out`);
                    assert.ok(actual.includes('sentinel-produces'),
                        `round-trip out should include sentinel-produces (folded)`);
                } else {
                    assert.ok(actual.includes(expected[0]),
                        `round-trip cell["${key}"] = ${JSON.stringify(actual)} should include ${expected[0]}`);
                }
            } else if (kind === 'opts') {
                assert.deepStrictEqual(actual, expected,
                    `round-trip cell["${key}"] opts mismatch`);
            } else if (kind === 'bool') {
                assert.strictEqual(actual, expected,
                    `round-trip cell["${key}"] bool mismatch`);
            } else {
                assert.strictEqual(actual, expected,
                    `round-trip cell["${key}"] string mismatch`);
            }
        }
    });

    test('normalize(parse(serialize(nb))) is idempotent on already-normalized input', function () {
        const html = buildSentinelHtml();
        const nb = parse(html);
        const reserialized = serialize(nb);

        const original = parse(html);
        const reparsed = parse(reserialized);
        assert.deepStrictEqual(normalize(reparsed), normalize(original),
            'serialize → parse round-trip is idempotent under format.normalize');
    });
});
