/* Copyright 2023-2026 by Essam Abadir */

/**
 * control-descriptor-contract.test.mjs — the schema-mirror-drift conformance gate
 * for `lib/shim/controls/index.js` (WS gym-controls-as-sugar Bite 1).
 *
 * Co-located with the OWNER (mirrors lib/shim/frame-data/test/render-intent-contract
 * .test.mjs and lib/shim/notebook/test/cell-attrs-contract.test.mjs — the established
 * "owner directory, node --test sweep" convention for a pure-JS, engine-opaque
 * contract). Every assertion is DRIVEN OFF THE EXPORTED LISTS (KINDS,
 * REQUIRED_KEYS_BY_KIND, CHANNELS) —
 * never a hand-copied kind/key list — so adding a kind or a required key to the
 * schema automatically extends what this test covers.
 *
 * Five assertions:
 *   (1) Owner-completeness — REQUIRED_KEYS_BY_KIND has exactly one entry per KINDS
 *       member (no orphaned kind, no orphaned key-table).
 *   (2) Happy path — a minimal valid fixture per kind normalizes without throwing,
 *       and the returned bag carries every input key plus a resolved `channel`.
 *   (3) Per-key FAIL-LOUD — for EVERY key in REQUIRED_KEYS_BY_KIND[kind], deleting
 *       just that one key from an otherwise-valid fixture throws (iterates the
 *       exported key list; a key omitted from the iteration would silently make
 *       that field "optional" without anyone noticing).
 *   (4) Envelope FAIL-LOUD — unknown kind, missing/empty id, invalid channel all
 *       throw; DEFAULT_CHANNEL applies to 'scalar' only when channel is omitted.
 *   (5) Never mutates the input — normalize returns a NEW object; the caller's
 *       descriptor is byte-identical after the call.
 *
 * Run: node --test lib/shim/controls/test/control-descriptor-contract.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);

const {
    KINDS,
    CHANNELS,
    DEFAULT_CHANNEL,
    DEFAULT_CHANNEL_KINDS,
    REQUIRED_KEYS_BY_KIND,
    BIND_KEYS,
    ACTIONS,
    PLACE_KEYS,
    PLACE_ANCHORS,
    DEFAULT_PLACE_ANCHOR,
    WIDGETS,
    normalizeControlDescriptor
} = require(path.join(repoRoot, 'lib/shim/controls/index.js'));

/** A minimal, VALID fixture per kind — the exact shipped shapes this schema codifies
 *  (SphereEmitter.controls for scalar, three-provider getCameraControl for camera,
 *  fx-experiment _buildLoopControl for
 *  loop). Kept in ONE place so every test below shares the same ground truth. */
function validFixture(kind, id) {
    switch (kind) {
        case 'scalar':
            return {
                kind: 'scalar', id: id || 'chamberFlow', label: 'flow',
                min: 0, max: 1, step: 1, value: 1,
                fmt: function (v) { return v ? 'on' : 'off'; },
                onChange: function (v) { /* no-op */ }
            };
        case 'camera':
            return {
                kind: 'camera', id: id || 'cam',
                presets: ['down-barrel', 'table-top', 'rooftop'],
                setOrbit: function (spec) { /* no-op */ },
                getOrbit: function () { return { azimuth: 90, elevation: 0, distance: 100 }; },
                setPreset: function (name) { /* no-op */ }
            };
        case 'loop':
            return {
                kind: 'loop', id: id || 'loopControl',
                enabled: false, ticks: 720,
                setEnabled: function (v) { /* no-op */ },
                setTicks: function (n) { /* no-op */ }
            };
        // ── S1 additions (design §2.2 / gap-census #1,#4,#6,#10) ────────────────
        case 'enum':
            return {
                kind: 'enum', id: id || 'collisionType', label: 'collision type',
                values: ['NONE', 'BOUNCE', 'WALL'], value: 'BOUNCE',
                fmt: function (v) { return String(v); },
                onChange: function (v) { /* no-op */ }
            };
        case 'flags':
            return {
                kind: 'flags', id: id || 'actions', label: 'actions',
                values: ['ABSORB', 'COUNT', 'MARK', 'LOG'], value: ['COUNT', 'LOG'],
                fmt: function (v) { return v.join(', '); },
                onChange: function (v) { /* no-op */ }
            };
        case 'vector':
            return {
                kind: 'vector', id: id || 'rect', label: 'rect',
                value: [10, 20, 100, 50], min: 0, max: 600, step: 1,
                fmt: function (v) { return v.join(','); },
                onChange: function (v) { /* no-op */ }
            };
        // ── Presentation-pass Item 2 additions (E-P2a) ─────────────────────────
        case 'text':
            return {
                kind: 'text', id: id || 'label', label: 'caption',
                value: 'hello',
                fmt: function (v) { return String(v); },
                onChange: function (v) { /* no-op */ }
            };
        case 'action':
            return {
                kind: 'action', id: id || 'restart', label: 'Restart',
                action: 'restart'
            };
        default:
            throw new Error('validFixture: no fixture for kind "' + kind + '"');
    }
}

/* ── (1) Owner-completeness ──────────────────────────────────────────────────── */

describe('control-descriptor — (1) owner-completeness (KINDS <-> REQUIRED_KEYS_BY_KIND)', function () {
    test('every KINDS member has a REQUIRED_KEYS_BY_KIND entry (non-empty array)', function () {
        for (const kind of KINDS) {
            const keys = REQUIRED_KEYS_BY_KIND[kind];
            assert.ok(Array.isArray(keys) && keys.length > 0,
                `kind "${kind}" must have a non-empty REQUIRED_KEYS_BY_KIND entry`);
        }
    });

    test('REQUIRED_KEYS_BY_KIND has no orphaned kind outside KINDS', function () {
        for (const kind of Object.keys(REQUIRED_KEYS_BY_KIND)) {
            assert.ok(KINDS.includes(kind),
                `REQUIRED_KEYS_BY_KIND has an entry for "${kind}" not present in KINDS`);
        }
    });

    test('KINDS has no duplicates', function () {
        const seen = new Set();
        for (const k of KINDS) {
            assert.ok(!seen.has(k), `duplicate kind: "${k}"`);
            seen.add(k);
        }
    });

    test('CHANNELS is exactly [physics, render] and DEFAULT_CHANNEL is a member', function () {
        assert.deepEqual(CHANNELS, ['physics', 'render']);
        assert.ok(CHANNELS.includes(DEFAULT_CHANNEL), 'DEFAULT_CHANNEL must be a declared channel');
    });
});

/* ── (2) Happy path — every kind's minimal valid fixture normalizes ──────────── */

describe('control-descriptor — (2) happy path (one minimal valid fixture per kind)', function () {
    for (const kind of KINDS) {
        test(`kind "${kind}": a minimal valid fixture normalizes without throwing`, function () {
            const fixture = validFixture(kind);
            const bag = normalizeControlDescriptor(fixture);
            assert.equal(bag.kind, kind);
            assert.equal(bag.id, fixture.id);
            // Every kind-specific required key survives normalization verbatim.
            for (const key of REQUIRED_KEYS_BY_KIND[kind]) {
                assert.equal(bag[key], fixture[key], `normalized bag lost/altered key "${key}"`);
            }
        });
    }
});

/* ── (3) Per-key FAIL-LOUD (iterates REQUIRED_KEYS_BY_KIND — never hand-copied) ── */

describe('control-descriptor — (3) per-key FAIL-LOUD (every required key, every kind)', function () {
    for (const kind of KINDS) {
        for (const key of REQUIRED_KEYS_BY_KIND[kind]) {
            test(`kind "${kind}": omitting required key "${key}" throws`, function () {
                const fixture = validFixture(kind);
                delete fixture[key];
                assert.throws(() => normalizeControlDescriptor(fixture),
                    new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
                    `omitting "${key}" from a "${kind}" descriptor must throw naming that key`);
            });
        }
    }
});

/* ── (4) Envelope FAIL-LOUD (kind/id/channel) ────────────────────────────────── */

describe('control-descriptor — (4) envelope FAIL-LOUD (kind/id/channel)', function () {
    test('an unrecognized kind throws, naming the declared KINDS list', function () {
        assert.throws(
            () => normalizeControlDescriptor({ kind: 'bogus-kind', id: 'x' }),
            /unknown kind "bogus-kind"/
        );
    });

    test('a missing id throws', function () {
        const f = validFixture('scalar'); delete f.id;
        assert.throws(() => normalizeControlDescriptor(f), /"id" must be a non-empty string/);
    });

    test('an empty-string id throws', function () {
        const f = validFixture('scalar'); f.id = '';
        assert.throws(() => normalizeControlDescriptor(f), /"id" must be a non-empty string/);
    });

    test('a non-object input throws', function () {
        assert.throws(() => normalizeControlDescriptor(null), /requires a descriptor object/);
        assert.throws(() => normalizeControlDescriptor('nope'), /requires a descriptor object/);
        assert.throws(() => normalizeControlDescriptor(undefined), /requires a descriptor object/);
    });

    test('an invalid channel value throws', function () {
        const f = validFixture('scalar'); f.channel = 'bogus-channel';
        assert.throws(() => normalizeControlDescriptor(f), /"channel" must be one of/);
    });

    // Driven off DEFAULT_CHANNEL_KINDS (never a hand-copied ['scalar', ...] list) —
    // S1 extended this from 'scalar'-only to every bare-onChange kind (enum/flags/vector).
    for (const kind of DEFAULT_CHANNEL_KINDS) {
        test(`kind "${kind}": DEFAULT_CHANNEL applies when channel is omitted`, function () {
            const bag = normalizeControlDescriptor(validFixture(kind));
            assert.equal(bag.channel, DEFAULT_CHANNEL);
            assert.equal(bag.channel, 'physics');
        });

        test(`kind "${kind}": an explicit channel is honored (not overwritten by the default)`, function () {
            const f = validFixture(kind); f.channel = 'render';
            const bag = normalizeControlDescriptor(f);
            assert.equal(bag.channel, 'render');
        });
    }

    for (const kind of KINDS.filter((k) => DEFAULT_CHANNEL_KINDS.indexOf(k) === -1)) {
        test(`kind "${kind}": channel stays undefined when omitted (no forced default)`, function () {
            const bag = normalizeControlDescriptor(validFixture(kind));
            assert.equal(bag.channel, undefined);
        });
        test(`kind "${kind}": an explicit valid channel is honored`, function () {
            const f = validFixture(kind); f.channel = 'render';
            const bag = normalizeControlDescriptor(f);
            assert.equal(bag.channel, 'render');
        });
    }
});

/* ── (5) Never mutates the input ─────────────────────────────────────────────── */

describe('control-descriptor — (5) normalize never mutates the input', function () {
    for (const kind of KINDS) {
        test(`kind "${kind}": input object is untouched after normalize`, function () {
            const fixture = validFixture(kind);
            const before = Object.assign({}, fixture);
            const bag = normalizeControlDescriptor(fixture);
            assert.notStrictEqual(bag, fixture, 'normalize must return a NEW object, not the input');
            for (const k of Object.keys(before)) {
                assert.strictEqual(fixture[k], before[k], `input key "${k}" was mutated`);
            }
        });
    }
});

/* ── (7) Scalar bind — WS gym-controls-as-sugar binds+ControlSync FINAL design
   (converged 2026-07-04, XOR retracted on the 0/9 shipped-CONTROLS census) ─── */

describe('control-descriptor — (7) scalar bind (write-authority: at least one of onChange/bind)', function () {
    function bindOnlyFixture(id) {
        return {
            kind: 'scalar', id: id || 'density', label: 'density', min: 0, max: 1, step: 0.1, value: 0.5,
            fmt: function (v) { return v.toFixed(1); },
            bind: { object: 'bodyA', prop: 'mass' }
        };
    }

    test('bind-only (no onChange) normalizes without throwing', function () {
        const bag = normalizeControlDescriptor(bindOnlyFixture());
        assert.equal(bag.bind.object, 'bodyA');
        assert.equal(bag.bind.prop, 'mass');
        assert.equal(bag.onChange, undefined, 'no onChange was supplied — stays undefined, never synthesized');
    });

    test('bind + onChange coexist — both survive normalization verbatim', function () {
        const onChange = function () {};
        const f = bindOnlyFixture(); f.onChange = onChange;
        const bag = normalizeControlDescriptor(f);
        assert.equal(bag.onChange, onChange);
        assert.equal(bag.bind.object, 'bodyA');
        assert.equal(bag.bind.prop, 'mass');
    });

    test('FAIL-LOUD: neither onChange nor bind present (a dead control)', function () {
        const f = validFixture('scalar'); delete f.onChange;
        assert.throws(() => normalizeControlDescriptor(f), /"onChange" or "bind" is required/);
    });

    test('FAIL-LOUD: onChange present but not a function (bind absent)', function () {
        const f = validFixture('scalar'); f.onChange = 'not-a-function';
        assert.throws(() => normalizeControlDescriptor(f), /"onChange", when present, must be a function/);
    });

    for (const key of BIND_KEYS) {
        test(`FAIL-LOUD: bind missing "${key}" (per BIND_KEYS, never a hand-copied pair)`, function () {
            const f = bindOnlyFixture();
            delete f.bind[key];
            assert.throws(() => normalizeControlDescriptor(f), new RegExp('bind\\.' + key));
        });
    }

    test('FAIL-LOUD: bind present but not an object', function () {
        const f = bindOnlyFixture(); f.bind = 'not-an-object';
        assert.throws(() => normalizeControlDescriptor(f), /"bind" must be an object/);
    });

    test('bind shape is uniform across channels — a render-channel bind-only descriptor still validates as {object,prop}', function () {
        const f = bindOnlyFixture(); f.channel = 'render'; f.bind = { object: 'runner', prop: 'colorScheme' };
        const bag = normalizeControlDescriptor(f);
        assert.equal(bag.channel, 'render');
        assert.equal(bag.bind.object, 'runner');
        assert.equal(bag.bind.prop, 'colorScheme');
    });

    test('bind-only does not mutate the input (same never-mutate discipline as every other field)', function () {
        const fixture = bindOnlyFixture();
        const before = JSON.parse(JSON.stringify({ bind: fixture.bind }));
        const bag = normalizeControlDescriptor(fixture);
        assert.notStrictEqual(bag, fixture);
        assert.deepEqual(fixture.bind, before.bind);
    });
});

/* ── (8) enum/flags/vector bind (S1, design §2.2 — the SAME write-authority +
   BIND_KEYS discipline as scalar, generalized to the three new kinds) ────────── */

describe('control-descriptor — (8) enum/flags/vector bind (write-authority + BIND_KEYS, same as scalar)', function () {
    const BIND_CAPABLE_NEW_KINDS = ['enum', 'flags', 'vector'];

    for (const kind of BIND_CAPABLE_NEW_KINDS) {
        describe(`kind "${kind}"`, function () {
            test('bind-only (no onChange) normalizes without throwing', function () {
                const f = validFixture(kind);
                delete f.onChange;
                f.bind = { object: 'wallA', prop: 'count' };
                const bag = normalizeControlDescriptor(f);
                assert.equal(bag.bind.object, 'wallA');
                assert.equal(bag.bind.prop, 'count');
                assert.equal(bag.onChange, undefined);
            });

            test('FAIL-LOUD: neither onChange nor bind present (a dead control)', function () {
                const f = validFixture(kind); delete f.onChange;
                assert.throws(() => normalizeControlDescriptor(f), /"onChange" or "bind" is required/);
            });

            for (const key of BIND_KEYS) {
                test(`FAIL-LOUD: bind missing "${key}" (per BIND_KEYS, never a hand-copied pair)`, function () {
                    const f = validFixture(kind);
                    f.bind = { object: 'wallA', prop: 'count' };
                    delete f.bind[key];
                    assert.throws(() => normalizeControlDescriptor(f), new RegExp('bind\\.' + key));
                });
            }
        });
    }
});

/* ── (9) enum/flags value-membership (design §2.2 — census #6: collision_type/
   gateType/reposition select-one; actions multi-select) ─────────────────────── */

describe('control-descriptor — (9) enum/flags value-membership (closed candidate set)', function () {
    test('enum: "value" must be a member of "values"', function () {
        const f = validFixture('enum'); f.value = 'NOT_A_VALID_TYPE';
        assert.throws(() => normalizeControlDescriptor(f), /must be a member of "values"/);
    });

    test('enum: "values" must be a non-empty array of non-empty strings', function () {
        const f = validFixture('enum'); f.values = [];
        assert.throws(() => normalizeControlDescriptor(f), /"values" must be a non-empty array/);
    });

    test('enum: happy path — value is a member of values', function () {
        const bag = normalizeControlDescriptor(validFixture('enum'));
        assert.ok(bag.values.includes(bag.value));
    });

    test('flags: every "value[i]" must be a member of "values"', function () {
        const f = validFixture('flags'); f.value = ['COUNT', 'NOT_A_VALID_ACTION'];
        assert.throws(() => normalizeControlDescriptor(f), /value\[1\].*must be a member of "values"/);
    });

    test('flags: "value" must be an array (a bare string is NOT accepted)', function () {
        const f = validFixture('flags'); f.value = 'COUNT';
        assert.throws(() => normalizeControlDescriptor(f), /"value" must be an array/);
    });

    test('flags: an empty "value" array is valid (zero flags set)', function () {
        const f = validFixture('flags'); f.value = [];
        assert.doesNotThrow(() => normalizeControlDescriptor(f));
    });

    test('flags: happy path — every value[i] is a member of values', function () {
        const bag = normalizeControlDescriptor(validFixture('flags'));
        for (const v of bag.value) { assert.ok(bag.values.includes(v)); }
    });
});

/* ── (10) vector per-component bounds (design §2.2 — census #4/#5: placement/
   drag, rgb; min/max/step each a SHARED number or a PER-COMPONENT array) ─────── */

describe('control-descriptor — (10) vector per-component bounds (shared scalar OR per-component array)', function () {
    test('happy path: shared scalar min/max/step (the [l,t,w,h] rect fixture)', function () {
        const bag = normalizeControlDescriptor(validFixture('vector'));
        assert.deepEqual(bag.value, [10, 20, 100, 50]);
    });

    test('happy path: per-component arrays (same length as value)', function () {
        const f = validFixture('vector');
        f.min = [0, 0, 0, 0]; f.max = [600, 400, 600, 400]; f.step = [1, 1, 1, 1];
        assert.doesNotThrow(() => normalizeControlDescriptor(f));
    });

    test('happy path: length is FREE — a 2-tuple (x/y) is just as valid as a 4-tuple', function () {
        const f = validFixture('vector'); f.value = [10, 20];
        assert.doesNotThrow(() => normalizeControlDescriptor(f));
    });

    test('happy path: a 6-tuple (3D rect [l,t,z,w,h,d]) is just as valid', function () {
        const f = validFixture('vector'); f.value = [10, 20, 0, 100, 50, 100];
        assert.doesNotThrow(() => normalizeControlDescriptor(f));
    });

    test('happy path: a 3-tuple (rgb [r,g,b]) is just as valid', function () {
        const f = validFixture('vector'); f.value = [255, 0, 0]; f.min = 0; f.max = 255; f.step = 1;
        assert.doesNotThrow(() => normalizeControlDescriptor(f));
    });

    test('FAIL-LOUD: "value" must be a non-empty array of finite numbers', function () {
        const f = validFixture('vector'); f.value = [];
        assert.throws(() => normalizeControlDescriptor(f), /"value" must be a non-empty array/);
        const f2 = validFixture('vector'); f2.value = [1, 'not-a-number', 3, 4];
        assert.throws(() => normalizeControlDescriptor(f2), /"value" must be a non-empty array/);
    });

    for (const key of ['min', 'max', 'step']) {
        test(`FAIL-LOUD: per-component "${key}" array with WRONG LENGTH throws`, function () {
            const f = validFixture('vector');
            f[key] = [0, 0]; // value has 4 components, this has 2
            assert.throws(() => normalizeControlDescriptor(f), new RegExp('"' + key + '"'));
        });

        test(`FAIL-LOUD: "${key}" that is neither a number nor a matching-length array throws`, function () {
            const f = validFixture('vector');
            f[key] = 'not-a-number-or-array';
            assert.throws(() => normalizeControlDescriptor(f), new RegExp('"' + key + '"'));
        });
    }
});


/* ── (11) Presentation-pass Item 2: place, widget, text, action ───────────────
 *
 * Every row here is driven off the EXPORTED tables (PLACE_KEYS / PLACE_ANCHORS /
 * WIDGETS / ACTIONS / KINDS) — never a hand-copied list, so adding a member at
 * the owner extends this gate automatically (the schema-mirror discipline).
 */

describe('control-descriptor — (11) placement (place) is kind-orthogonal and shape-validated', function () {

    test('PLACE_KEYS / PLACE_ANCHORS are exported, frozen vocabularies', function () {
        assert.ok(Array.isArray(PLACE_KEYS) && PLACE_KEYS.length > 0);
        assert.ok(Object.isFrozen(PLACE_KEYS), 'PLACE_KEYS is frozen');
        assert.ok(Object.isFrozen(PLACE_ANCHORS), 'PLACE_ANCHORS is frozen');
        assert.ok(PLACE_ANCHORS.indexOf(DEFAULT_PLACE_ANCHOR) !== -1,
            'the default anchor is a member of the closed list');
    });

    test('a descriptor of ANY kind accepts place, and the anchor default is resolved', function () {
        for (const kind of KINDS) {
            const f = validFixture(kind);
            f.place = { x: 0.1, y: 0.9 };
            const bag = normalizeControlDescriptor(f);
            assert.deepEqual(bag.place, { x: 0.1, y: 0.9, anchor: DEFAULT_PLACE_ANCHOR },
                kind + ': place is normalized with the default anchor');
        }
    });

    test('every PLACE_ANCHORS member is accepted', function () {
        for (const anchor of PLACE_ANCHORS) {
            const f = validFixture('scalar');
            f.place = { x: 0, y: 0, anchor };
            assert.equal(normalizeControlDescriptor(f).place.anchor, anchor);
        }
    });

    test('a descriptor WITHOUT place is byte-identical to today (no place key added)', function () {
        const bag = normalizeControlDescriptor(validFixture('scalar'));
        assert.ok(!('place' in bag), 'no place key is fabricated');
    });

    test('FAIL-LOUD: x/y must be FRACTIONS in [0,1] (resize-stable), not pixels', function () {
        for (const key of PLACE_KEYS.filter((k) => k !== 'anchor')) {
            const f = validFixture('scalar');
            f.place = { x: 0.5, y: 0.5 };
            f.place[key] = 240;   // a pixel offset — the mistake this guards
            assert.throws(() => normalizeControlDescriptor(f), new RegExp('place\\.' + key));
        }
    });

    test('FAIL-LOUD: an unknown anchor throws, naming the closed list', function () {
        const f = validFixture('scalar');
        f.place = { x: 0.5, y: 0.5, anchor: 'middle' };
        assert.throws(() => normalizeControlDescriptor(f), /place\.anchor/);
    });
});

describe('control-descriptor — (11b) widget is a kind-orthogonal seam', function () {

    test('every WIDGETS member is accepted on a scalar (a toggle is scalar 0/1 + widget)', function () {
        for (const widget of WIDGETS) {
            const f = validFixture('scalar');
            f.widget = widget;
            assert.equal(normalizeControlDescriptor(f).widget, widget);
        }
    });

    test('FAIL-LOUD: an unknown widget throws (and says a toggle is not a kind)', function () {
        const f = validFixture('scalar');
        f.widget = 'dial';
        assert.throws(() => normalizeControlDescriptor(f), /"widget" must be one of/);
    });
});

describe('control-descriptor — (11c) the text + action kinds', function () {

    test('text: a STRING value round-trips; a non-string fails loud', function () {
        const bag = normalizeControlDescriptor(validFixture('text'));
        assert.equal(bag.kind, 'text');
        assert.equal(bag.value, 'hello');
        assert.equal(bag.channel, DEFAULT_CHANNEL, 'text is a bare-onChange kind → default channel');
        const f = validFixture('text'); f.value = 42;
        assert.throws(() => normalizeControlDescriptor(f), /"value" must be a string/);
    });

    test('text: the write-authority rule applies (onChange and/or bind, never neither)', function () {
        const f = validFixture('text'); delete f.onChange;
        assert.throws(() => normalizeControlDescriptor(f), /"onChange" or "bind" is required/);
    });

    test('action: EVERY member of the closed ACTIONS vocabulary normalizes', function () {
        assert.ok(Object.isFrozen(ACTIONS), 'ACTIONS is frozen');
        for (const action of ACTIONS) {
            const f = validFixture('action', action);
            f.action = action;
            const bag = normalizeControlDescriptor(f);
            assert.equal(bag.action, action);
        }
    });

    test('action: FAIL-LOUD on an unknown verb, naming the closed list', function () {
        const f = validFixture('action'); f.action = 'explode';
        assert.throws(() => normalizeControlDescriptor(f), /"action" must be one of/);
    });

    test('action: FAIL-LOUD on a bind (an action is a verb, not a property pair)', function () {
        const f = validFixture('action'); f.bind = { object: 'universe', prop: 'tick' };
        assert.throws(() => normalizeControlDescriptor(f), /must NOT declare "bind"/);
    });

    test('action: needs NO onChange/bind — the verb IS the write (execution is objects-side)', function () {
        assert.doesNotThrow(() => normalizeControlDescriptor(validFixture('action')));
    });
});
