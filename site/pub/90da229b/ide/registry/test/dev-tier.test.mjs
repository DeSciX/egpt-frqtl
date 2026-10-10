/* Copyright 2023-2026 by Essam Abadir */

/**
 * dev-tier.test.mjs — locks the registry TIER VISIBILITY contract (sweep S2).
 *
 * The mechanism under test, not the roster:
 *   EXPERIMENT_TIERS   — the tier vocabulary (tier id → { public }). Absence of
 *                        `tier` on a row means public.
 *   isPublicExperiment — THE predicate resolving a row against that table;
 *                        FAILS LOUD on an unknown tier.
 *   publicExperiments  — the filtered view every public chooser consumes.
 *   experimentById     — tier-independent id resolution (what keeps a hidden
 *                        experiment reachable by direct URL / deep link).
 *
 * Every assertion is DRIVEN OFF the registry + the exported tier table. There is
 * deliberately NO hand-listed id roster here: a roster would be a second copy of
 * the registry that rots on the next promote/retire, and it would test the list
 * instead of the mechanism. Moving a row into or out of a tier is a one-line
 * registry edit and these tests keep passing; BREAKING the mechanism (a consumer
 * re-implementing the filter, a typo'd tier, a hidden row becoming unresolvable)
 * is what fails.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    EXPERIMENTS,
    EXPERIMENT_TIERS,
    experimentById,
    experimentIs3D,
    isPublicExperiment,
    publicExperiments,
} from '../experiments.js';

/** Rows carrying a tier at all (any non-public tier is a subset of this). */
const tieredRows  = () => EXPERIMENTS.filter((e) => e.tier);
/** Rows whose declared tier resolves public:false in the exported table. */
const hiddenRows  = () => EXPERIMENTS.filter((e) => e.tier && EXPERIMENT_TIERS[e.tier] &&
                                                    EXPERIMENT_TIERS[e.tier].public === false);

test('EXPERIMENT_TIERS is a frozen table of {id, public, label}', () => {
    assert.ok(Object.isFrozen(EXPERIMENT_TIERS), 'the tier table must be frozen');
    const keys = Object.keys(EXPERIMENT_TIERS);
    assert.ok(keys.length > 0, 'at least one tier must be declared');
    for (const key of keys) {
        const tier = EXPERIMENT_TIERS[key];
        assert.equal(tier.id, key, `tier '${key}' must carry its own id`);
        assert.equal(typeof tier.public, 'boolean', `tier '${key}' must declare public:boolean`);
        assert.equal(typeof tier.label, 'string', `tier '${key}' must carry a label`);
    }
});

test('every declared tier value is a known tier (no typo silently publishes)', () => {
    for (const e of tieredRows()) {
        assert.ok(EXPERIMENT_TIERS[e.tier],
            `experiment '${e.id}' declares tier '${e.tier}', which is not in EXPERIMENT_TIERS ` +
            `(known: ${Object.keys(EXPERIMENT_TIERS).join(', ')})`);
    }
});

test('isPublicExperiment resolves against the table: no tier = public, table decides otherwise', () => {
    assert.equal(isPublicExperiment({ id: 'x' }), true, 'absence of tier means public');
    for (const key of Object.keys(EXPERIMENT_TIERS)) {
        assert.equal(isPublicExperiment({ id: 'x', tier: key }), EXPERIMENT_TIERS[key].public,
            `tier '${key}' visibility must come from the table, not a hardcoded string`);
    }
});

test('isPublicExperiment FAILS LOUD on an unknown tier', () => {
    assert.throws(() => isPublicExperiment({ id: 'x', tier: 'no-such-tier' }),
        /unknown tier "no-such-tier"/);
    // A near-miss (case drift) must throw too — never silently publish.
    const someKey = Object.keys(EXPERIMENT_TIERS)[0];
    assert.throws(() => isPublicExperiment({ id: 'x', tier: someKey.toUpperCase() }), /unknown tier/);
});

test('publicExperiments() excludes exactly the non-public-tier rows', () => {
    const publicIds   = publicExperiments().map((e) => e.id).sort();
    const expectedIds = EXPERIMENTS.filter(isPublicExperiment).map((e) => e.id).sort();
    assert.deepEqual(publicIds, expectedIds);

    const hiddenIds = new Set(hiddenRows().map((e) => e.id));
    assert.ok(hiddenIds.size > 0, 'at least one experiment is hidden — otherwise this gate is vacuous');
    for (const id of publicIds) {
        assert.ok(!hiddenIds.has(id), `hidden-tier '${id}' leaked into publicExperiments()`);
    }
    assert.equal(publicIds.length, EXPERIMENTS.length - hiddenIds.size);
});

// ─────────────────────────────────────────────────────────────────────────────
// THE PUBLISH POLICY (CEO 2026-07-27): an experiments.js row is public only once
// it has been REBUILT on the current sugar. Today none has been, so the public
// tier is legitimately EMPTY and the user-facing content set is the WALK-THROUGH
// registry (which is also what sdk/frqtl-sdk/build.js ships as dist/index.html).
//
// This pair replaces the retired `publicIds.length > 0` assertion, which asserted
// the OLD policy (that some legacy row is public) and would have to be weakened
// rather than honoured. The guarantee below is the real one, and it is a GATE:
// flipping any legacy row back to a public tier turns test (1) RED, so a
// re-publish must be deliberate (migrate the page, then update MIGRATED_TO_NEW_SUGAR
// here) — it can never happen quietly.
// ─────────────────────────────────────────────────────────────────────────────

/** experiments.js rows rebuilt on the current sugar and therefore publishable. */
const MIGRATED_TO_NEW_SUGAR = [];

test('(1) only a row rebuilt on the new sugar is public — legacy rows stay dev-tier', () => {
    const publicIds = publicExperiments().map((e) => e.id).sort();
    assert.deepEqual(
        publicIds,
        [...MIGRATED_TO_NEW_SUGAR].sort(),
        'publicExperiments() no longer matches the rows rebuilt on the current sugar.\n' +
        'A legacy experiments.js row was published without being migrated (or a migrated\n' +
        'row was not recorded). Publishing is deliberate: rebuild the page on the current\n' +
        'objects, then add its id to MIGRATED_TO_NEW_SUGAR in this test.\n' +
        'public now: ' + JSON.stringify(publicIds)
    );
});

test('(2) the WALK-THROUGH rung set is the non-empty user-facing content set', async () => {
    const { WALKTHROUGH } = await import('../walkthrough.js');
    assert.ok(Array.isArray(WALKTHROUGH) && WALKTHROUGH.length > 0,
        'the walk-through registry is the public content set — it must not be empty ' +
        '(the dist gallery, dist/index.html, derives its rungs from it)');
    for (const rung of WALKTHROUGH) {
        assert.equal(typeof rung.id, 'string', 'every rung carries an id');
        assert.ok(rung.id.length > 0, 'every rung id is non-empty');
    }
    // The two registries are disjoint surfaces: a rung is a recipe booted on the
    // blank page, never an experiments.js page id. If a rung id ever collided with
    // a public experiment id the chooser would resolve two different things.
    const publicIds = new Set(publicExperiments().map((e) => e.id));
    for (const rung of WALKTHROUGH) {
        assert.ok(!publicIds.has(rung.id),
            `walk-through rung '${rung.id}' collides with a public experiments.js id`);
    }
});

test('a hidden-tier row stays resolvable by direct id (hidden ≠ retired)', () => {
    for (const e of hiddenRows()) {
        const resolved = experimentById(e.id);
        assert.ok(resolved, `hidden-tier '${e.id}' must resolve by id (direct URL / deep link)`);
        assert.equal(resolved.id, e.id);
        assert.equal(typeof resolved.title, 'string', `'${e.id}' keeps its label for the chooser trigger`);
        // The id-keyed derived lookups are tier-independent too.
        assert.equal(experimentIs3D(e.id), e.is3D === true);
    }
    assert.equal(experimentById('no-such-experiment'), null, 'unknown id resolves to null');
});

test('publicExperiments() returns registry rows by reference (a view, not a copy)', () => {
    // Consumers ferry the SAME row objects, so title/is3D/jsOnly can never drift
    // between the public view and the registry.
    for (const e of publicExperiments()) {
        assert.equal(experimentById(e.id), e, `'${e.id}' must be the registry row itself`);
    }
});
