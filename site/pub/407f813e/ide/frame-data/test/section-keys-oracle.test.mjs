/* Copyright 2023-2026 by Essam Abadir */

/**
 * section-keys-oracle.test.mjs — THE data-bubble round-trip oracle.
 *
 * `lib/shim/frame-data/index.js` owns `SECTION_KEYS = ['detection','string_map']`
 * and states that conformance ITERATES that list to assert completeness. This file
 * is that iteration: every assertion below is generated from the exported list, so
 * a section added to `SECTION_KEYS` without a normalizer case and a real engine
 * round-trip turns this suite RED instead of riding along silently.
 *
 * Three layers, all table-driven off `SECTION_KEYS`:
 *
 *   (A) PROBE COMPLETENESS — the probe table below covers `SECTION_KEYS` exactly,
 *       both directions. Adding a key to the contract with no probe fails here
 *       first, with the message naming what to write.
 *
 *   (B) NORMALIZER COMPLETENESS — `normalizeDataBubble` yields every section key
 *       for every input shape (absent → null), preserves a written section BY
 *       REFERENCE, and leaves the other sections null. A dropped case in the
 *       normalizer fails on its own row.
 *
 *   (C) ENGINE ROUND-TRIP on the REAL WASM engine (pkg-node): each section is
 *       written through `setFrameProperty('data', …)`, read back verbatim through
 *       `getFrameProperty`, and — after a further tick — is still carried on the
 *       marshalled `TickData.frameData[i].data` the renderer reads. The engine
 *       interprets NOTHING: an arbitrary `string_map` key it has never seen must
 *       survive the JS→WASM→JS crossing byte-for-byte.
 *
 * Run: node --test lib/shim/frame-data/test/section-keys-oracle.test.mjs
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

const { SECTION_KEYS, normalizeDataBubble } =
    require(path.join(repoRoot, 'lib/shim/frame-data/index.js'));
const EGPTEngine = require(path.join(repoRoot, 'lib/frqtl/compat/egpt-engine.js'));

// ── The probe table — ONE row per canonical section ──────────────────────────
//
// `write` is the section payload handed to the engine; `read` pulls the value the
// round-trip must reproduce out of a returned section object. No test below names
// a section directly — every one of them is generated from SECTION_KEYS.
const SECTION_PROBES = {
    detection: {
        write: { detector_name: 'oracle-detector' },
        read: (section) => section.detector_name,
        expect: 'oracle-detector'
    },
    string_map: {
        // A key the engine has never heard of: the bubble is engine-OPAQUE, so an
        // unknown key must cross verbatim exactly like the render.* keys do.
        write: { 'oracle.unknown.key': 'oracle-opaque-value' },
        read: (section) => section['oracle.unknown.key'],
        expect: 'oracle-opaque-value'
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// (A) Probe completeness — the table IS the contract list
// ─────────────────────────────────────────────────────────────────────────────
describe('(A) the oracle covers SECTION_KEYS exactly', () => {

    test('every SECTION_KEYS entry has a probe (a new section cannot ship untested)', () => {
        const missing = SECTION_KEYS.filter((k) => !SECTION_PROBES[k]);
        assert.deepEqual(missing, [],
            'SECTION_KEYS gained ' + JSON.stringify(missing) + ' with no probe row. Add ' +
            '{ write, read, expect } to SECTION_PROBES so the new section is round-tripped ' +
            'through the engine like its siblings.');
    });

    test('every probe names a real section (no stale row for a retired section)', () => {
        const stale = Object.keys(SECTION_PROBES).filter((k) => SECTION_KEYS.indexOf(k) === -1);
        assert.deepEqual(stale, [],
            'SECTION_PROBES still probes ' + JSON.stringify(stale) + ', which lib/shim/frame-data ' +
            'no longer declares — delete the row with the section.');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (B) Normalizer completeness — generated per section key
// ─────────────────────────────────────────────────────────────────────────────
describe('(B) normalizeDataBubble is complete over SECTION_KEYS', () => {

    for (const shape of [
        { label: 'null', input: null },
        { label: 'undefined', input: undefined },
        { label: 'an empty bag', input: {} }
    ]) {
        test(`${shape.label} normalizes to every section present and null`, () => {
            const bag = normalizeDataBubble(shape.input);
            for (const key of SECTION_KEYS) {
                assert.ok(key in bag, `normalized bag is missing the "${key}" section`);
                assert.equal(bag[key], null, `absent "${key}" must normalize to null, not undefined`);
            }
        });
    }

    for (const key of SECTION_KEYS) {
        test(`a partial carrying only "${key}" keeps it BY REFERENCE and nulls the rest`, () => {
            const section = SECTION_PROBES[key].write;
            const bag = normalizeDataBubble({ [key]: section });
            assert.equal(bag[key], section,
                `"${key}" must be ferried by reference (a copy is a second authority for the bag)`);
            for (const other of SECTION_KEYS) {
                if (other === key) continue;
                assert.equal(bag[other], null, `"${other}" must stay null when only "${key}" is written`);
            }
        });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// (C) Engine round-trip — the real WASM engine, per section
// ─────────────────────────────────────────────────────────────────────────────
describe('(C) the data bubble round-trips JS → WASM → JS, per section', () => {
    let handle;
    before(async () => { handle = await EGPTEngine.create({ backend: 'wasm' }); });

    /** A one-leaf world; returns { u, id } with the leaf's tick-data id. */
    const worldWithLeaf = () => {
        const u = handle.EGPTUniverse.create({
            rect: new handle.Rectangle(0, 0, 200, 200, null, false), seed: 42
        });
        u.init(u.universe_rect, 0, { wavelengthScale: 1 });
        u.experimentTickFunctions.push((uni) => {
            uni.injectFrame(uni.makeLeafFrame(20, 100, 0, null, 1, 0));
        });
        const td = u.doTick();
        const frames = (td.frameData || []).filter((f) => f.isAlive !== false);
        assert.ok(frames.length >= 1, 'the tick-fn must place one leaf before the bubble is written');
        return { u, id: frames[0].id };
    };

    for (const key of SECTION_KEYS) {
        const probe = SECTION_PROBES[key];

        test(`"${key}" survives setFrameProperty → getFrameProperty verbatim`, () => {
            const { u, id } = worldWithLeaf();
            u.setFrameProperty(id, 'data', { [key]: probe.write });
            const got = u.getFrameProperty(id, 'data');
            assert.ok(got && got[key],
                `the "${key}" section came back empty — the engine dropped a declared section`);
            assert.equal(probe.read(got[key]), probe.expect,
                `"${key}" must cross the JS↔WASM boundary byte-for-byte (engine-opaque)`);
        });

        test(`"${key}" is still on TickData after a further tick (the renderer's read path)`, () => {
            const { u, id } = worldWithLeaf();
            u.setFrameProperty(id, 'data', { [key]: probe.write });
            const td = u.doTick();
            const frame = (td.frameData || []).find((f) => f.id === id);
            assert.ok(frame, 'the leaf must still be in the tick data');
            assert.ok(frame.data && frame.data[key],
                `"${key}" is absent from the marshalled TickData bubble — every section the ` +
                'contract declares must reach Phase D COLLECT, which is where sugar and the ' +
                'renderer read it');
            assert.equal(probe.read(frame.data[key]), probe.expect);
        });
    }

    test('writing one section does not clear the others (the bubble MERGES)', () => {
        const { u, id } = worldWithLeaf();
        for (const key of SECTION_KEYS) {
            u.setFrameProperty(id, 'data', { [key]: SECTION_PROBES[key].write });
        }
        const got = u.getFrameProperty(id, 'data');
        for (const key of SECTION_KEYS) {
            assert.ok(got && got[key], `"${key}" was lost when a later section was written`);
            assert.equal(SECTION_PROBES[key].read(got[key]), SECTION_PROBES[key].expect);
        }
    });
});
