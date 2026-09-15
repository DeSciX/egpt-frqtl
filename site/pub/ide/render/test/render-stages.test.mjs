/* Copyright 2023-2026 by Essam Abadir */

/**
 * render-stages.test.mjs — the OWNER-side contract gate for
 * `lib/shim/render/render-stages.js` (the RENDER_STAGES tap vocabulary).
 *
 * Two jobs:
 *
 *   (A) The contract itself: the ordered stage table, the per-stage format tags, the
 *       final-stage derivation, `upstreamStages`, and every FAIL-LOUD rule in
 *       `normalizeStill` (each of which closes a specific way a capture bag could LIE —
 *       an empty payload, a wrong format, a missing tick, caller-supplied provenance).
 *
 *   (B) THE FERRY GATE. Every consumer must READ the exported list, never re-list the
 *       stage names. This is asserted as a SOURCE-STATIC check over the real consumer
 *       files, with comments stripped first: twice on this branch a gate was satisfied by
 *       PROSE (a `runner.start()` in a comment, a `sceneSpec()` in a comment), so a
 *       stage-name array that only appears inside a docstring must not be able to pass or
 *       fail this test. The rule the gate encodes: a consumer may MENTION individual
 *       stage names (a dispatcher has to bind each stage to its executor) but may NOT
 *       build its own ordered stage ARRAY — that array is the schema mirror.
 *
 * Run: node --test lib/shim/render/test/render-stages.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');
const require   = createRequire(import.meta.url);

const RS = require(path.join(repoRoot, 'lib/shim/render/render-stages.js'));

/** A minimally-valid partial bag for a given stage (the fixture every rule mutates). */
function partialFor(stage, over) {
    const format = RS.STAGE_FORMATS[stage];
    const data = (format === 'framedata')
        ? [{ rect: { x: 1, y: 1 }, fullness: 0.5 }]
        : (format === 'r8' ? new Uint8Array(4) : new Uint8ClampedArray(16));
    if (format !== 'framedata') { data[0] = 7; }   // non-empty, non-uniform enough
    return Object.assign({
        stage, tick: 3, data, scene: 'sha256:' + 'a'.repeat(64),
        width: 2, height: 2,
        filtersApplied: []
    }, over || {});
}

// ─────────────────────────────────────────────────────────────────────────────
// (A) The contract
// ─────────────────────────────────────────────────────────────────────────────

describe('RENDER_STAGES — the ordered stage vocabulary', () => {
    test('the table is the four canonical pipeline points, in data-flow order', () => {
        assert.deepEqual(RS.RENDER_STAGES, ['tick', 'field', 'scene', 'composite'],
            'tick (the frame-data bubble) → field (the heightfield) → scene (the three-layer ' +
            'composite) → composite (after the filter passes)');
    });

    test('every stage declares a format; no format is declared for a non-stage', () => {
        for (const s of RS.RENDER_STAGES) {
            assert.equal(typeof RS.STAGE_FORMATS[s], 'string', `stage ${s} has a format tag`);
        }
        assert.deepEqual(Object.keys(RS.STAGE_FORMATS).sort(), RS.RENDER_STAGES.slice().sort(),
            'STAGE_FORMATS keys ≡ RENDER_STAGES — a stage added to one list and not the other ' +
            'is exactly the drift the single owner exists to prevent');
    });

    test('finalStage() is DERIVED from the table (not a literal) — the convenience follows it', () => {
        assert.equal(RS.finalStage(), RS.RENDER_STAGES[RS.RENDER_STAGES.length - 1]);
        assert.equal(RS.finalStage(), 'composite', 'today the last stage is composite');
        // And the derivation is real: monkey-patching the table moves finalStage with it.
        // (Proves it is not a cached literal that would silently keep saying 'composite'
        // after a later stage landed — truth-in-labeling at the API level.)
        const saved = RS.RENDER_STAGES.slice();
        RS.RENDER_STAGES.push('__probe');
        try { assert.equal(RS.finalStage(), '__probe'); }
        finally { RS.RENDER_STAGES.length = 0; RS.RENDER_STAGES.push(...saved); }
    });

    test('upstreamStages() is the ordered prefix — strictly BEFORE the stage', () => {
        assert.deepEqual(RS.upstreamStages('tick'), []);
        assert.deepEqual(RS.upstreamStages('field'), ['tick']);
        assert.deepEqual(RS.upstreamStages('composite'), ['tick', 'field', 'scene']);
        assert.notEqual(RS.upstreamStages('field'), RS.RENDER_STAGES,
            'returns a fresh array — a caller cannot mutate the shared table');
    });

    test('assertStage names the WHOLE table in its message (a typo names its own fix)', () => {
        assert.throws(() => RS.assertStage('bloom'), (e) => {
            assert.match(e.message, /unknown stage/);
            for (const s of RS.RENDER_STAGES) { assert.ok(e.message.includes(s), `lists ${s}`); }
            return true;
        });
        assert.throws(() => RS.assertStage(undefined), /unknown stage/,
            'the stage argument is REQUIRED on the mechanism — a default belongs to the convenience');
        assert.equal(RS.assertStage('field'), 'field');
    });

    test('stageNotTappableError is a DISTINCT diagnosis from unknown-stage', () => {
        const e = RS.stageNotTappableError('scene', 'the active renderer provider');
        assert.match(e.message, /is known, but.*not tappable/s);
        assert.doesNotMatch(e.message, /unknown stage/,
            '"you named a real pipeline point nothing can read yet" must not send the caller ' +
            'hunting for a typo that is not there');
    });
});

describe('normalizeStill — every FAIL-LOUD rule closes a way a bag could lie', () => {
    test('the happy path returns EVERY STILL_BAG_KEYS key (no key-existence tests downstream)', () => {
        const bag = RS.normalizeStill(partialFor('field'));
        for (const k of RS.STILL_BAG_KEYS) {
            assert.ok(Object.prototype.hasOwnProperty.call(bag, k), `bag carries ${k}`);
        }
        assert.equal(bag.format, 'r8', 'the format is a property of the STAGE, stamped here');
        assert.deepEqual(bag.composedOf, ['tick'], 'composedOf is derived, not supplied');
    });

    test('STILL_PROVENANCE_KEYS is a genuine subset of STILL_BAG_KEYS', () => {
        for (const k of RS.STILL_PROVENANCE_KEYS) {
            assert.ok(RS.STILL_BAG_KEYS.includes(k), `${k} is a bag key`);
        }
    });

    test('an EMPTY payload throws — never a blank still', () => {
        assert.throws(() => RS.normalizeStill(partialFor('composite', { data: new Uint8ClampedArray(0) })),
            /EMPTY `data` payload/,
            'a measurement or golden built on an empty capture is fabricated evidence');
        assert.throws(() => RS.normalizeStill(partialFor('composite', { data: null })), /no `data` payload/);
    });

    test('a format that disagrees with the stage throws', () => {
        assert.throws(() => RS.normalizeStill(partialFor('field', { format: 'rgba8' })),
            /does not match stage/);
    });

    test('a missing/NaN tick throws — the tick stamp IS the co-registration guard', () => {
        assert.throws(() => RS.normalizeStill(partialFor('field', { tick: undefined })), /tick must be/);
        assert.throws(() => RS.normalizeStill(partialFor('field', { tick: NaN })), /tick must be/);
    });

    test('non-positive-integer dims throw', () => {
        assert.throws(() => RS.normalizeStill(partialFor('field', { width: 0 })), /width must be/);
        assert.throws(() => RS.normalizeStill(partialFor('field', { height: 2.5 })), /height must be/);
        // physicsW/physicsH moved to the SCENE record (universe bounds, init-fixed).
        assert.throws(() => RS.normalizeScene({ seed: 1, physicsW: -1, physicsH: 4 }), /physicsW must be/);
    });

    test('filtersApplied must be an ARRAY — order is contract, a map is not an order', () => {
        assert.throws(() => RS.normalizeStill(partialFor('composite', { filtersApplied: { water: true } })),
            /must be the provider's ORDERED filter-name array|must be an ARRAY/);
    });

    test('a CALLER-SUPPLIED composedOf that disagrees with the table throws', () => {
        assert.throws(
            () => RS.normalizeStill(partialFor('composite', { composedOf: ['tick'] })),
            /composedOf is DERIVED/,
            'a caller-supplied provenance field is the hardcoded-backend-label anti-pattern');
        // Supplying the CORRECT derived value is tolerated (a re-normalize round-trip).
        const once = RS.normalizeStill(partialFor('composite'));
        assert.deepEqual(RS.normalizeStill(Object.assign({}, once, { data: once.data })).composedOf,
            once.composedOf, 'normalize is idempotent — re-normalizing its own output is legal');
    });

    test('renderBaseCanvas is NULL (not false) when nothing composited', () => {
        assert.equal(RS.normalizeStill(partialFor('field')).renderBaseCanvas, null,
            'reporting `true` on a channel where no compositing pass ran would be a claim ' +
            'about something that never happened');
        assert.equal(RS.normalizeStill(partialFor('composite', { renderBaseCanvas: false })).renderBaseCanvas,
            false);
    });

    test('R8: a typed-array payload is SNAPSHOT, never aliased', () => {
        const src = new Uint8ClampedArray([1, 2, 3, 4]);
        const bag = RS.normalizeStill(partialFor('composite', { data: src, width: 1, height: 1 }));
        assert.notEqual(bag.data, src, 'the bag holds its OWN buffer');
        assert.notEqual(bag.data.buffer, src.buffer, 'and its own backing buffer');
        assert.deepEqual(Array.from(bag.data), [1, 2, 3, 4], 'values copied exactly');
        src[0] = 99;
        assert.equal(bag.data[0], 1, 'a later write to the source cannot reach the record');
    });

    test('R8: snapshotPayload flattens PROTOTYPE ACCESSORS into plain data', () => {
        // The engine's FrameData.rect is exactly this shape: private backing fields with
        // non-enumerable prototype accessors. Object.keys / structuredClone / JSON all copy
        // only own enumerable DATA props and would silently drop `x` here.
        function Rectish(x, w) { this._x = x; this.w = w; }
        Object.defineProperty(Rectish.prototype, 'x', { get() { return this._x; } });
        Object.defineProperty(Rectish.prototype, 'right', { get() { return this._x + this.w; } });
        Rectish.prototype.overlaps = function () { return false; };

        assert.equal(Object.keys(new Rectish(5, 2)).indexOf('x'), -1,
            'sanity: `x` is NOT an own enumerable key — the trap is real');

        const snap = RS.snapshotPayload([{ rect: new Rectish(5, 2), fullness: 0.5 }], 'framedata');
        assert.equal(snap[0].rect.x, 5, 'the accessor value survived');
        assert.equal(snap[0].rect.right, 7, 'a derived accessor survived');
        assert.equal(snap[0].rect._x, 5, 'the backing field survived too (no naming convention known)');
        assert.equal(snap[0].rect.overlaps, undefined, 'an INHERITED method is flattened away');
        assert.equal(Object.getPrototypeOf(snap[0].rect), Object.prototype, 'plain data');
        assert.equal(JSON.parse(JSON.stringify(snap))[0].rect.x, 5, 'JSON-safe end to end');
    });

    test('R8: an OWN function-valued field THROWS; an inherited method does not', () => {
        assert.throws(() => RS.snapshotPayload([{ cb: () => 1 }], 'framedata'), /carries a FUNCTION/,
            'a function you put on your data object is a contract violation, named loudly');
        function WithMethod() { this.a = 1; }
        WithMethod.prototype.m = function () {};
        assert.deepEqual(RS.snapshotPayload([new WithMethod()], 'framedata'), [{ a: 1 }],
            'an inherited method is flattening, not an error');
    });

    test('filtersApplied is COPIED, not aliased (a later provider mutation cannot rewrite history)', () => {
        const src = ['water'];
        const bag = RS.normalizeStill(partialFor('composite', { filtersApplied: src }));
        src.push('bloom');
        assert.deepEqual(bag.filtersApplied, ['water']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (A2) The NORMALIZED FORMAT: one SCENE record, many light STILL records
// ─────────────────────────────────────────────────────────────────────────────

const SCENE_FIXTURE = {
    seed: 42, sourceRef: 'exp/ring-radius#3', build: { engine: 'wasm', renderer: 'three' },
    physicsW: 600, physicsH: 400, projection: { kind: 'perspective', fovY: 50 }
};

describe('the two records — SCENE (run-invariant) vs STILL (per capture)', () => {
    test('v is stamped on BOTH records by the NORMALIZER, never caller-supplied', () => {
        assert.equal(RS.normalizeScene(SCENE_FIXTURE).v, RS.SCHEMA_VERSION);
        assert.equal(RS.normalizeStill(partialFor('field')).v, RS.SCHEMA_VERSION);
        assert.ok(RS.SCENE_KEYS.includes('v') && RS.STILL_KEYS.includes('v'),
            'both records self-describe — they are encountered separately');
        assert.throws(() => RS.normalizeScene(Object.assign({}, SCENE_FIXTURE, { v: 99 })),
            /disagrees with the contract version/);
        assert.throws(() => RS.normalizeStill(partialFor('field', { v: 99 })),
            /disagrees with the contract version/);
    });

    test('SCENE_KEYS and STILL_KEYS are DISJOINT except for the self-describing v', () => {
        const both = RS.SCENE_KEYS.filter((k) => RS.STILL_KEYS.includes(k));
        assert.deepEqual(both, ['v'],
            'a field living in BOTH records is two authorities for one value — only `v` is ' +
            'deliberately duplicated, and it is 4 bytes');
    });

    test('composedOf is DERIVED, so it is NOT a serialized still key', () => {
        assert.equal(RS.STILL_KEYS.includes('composedOf'), false,
            'serializing a derivable is stored drift');
        assert.ok(RS.STILL_DERIVED_KEYS.includes('composedOf'), 'it stays an in-memory convenience');
        assert.ok(RS.STILL_BAG_KEYS.includes('composedOf'), 'and the in-memory bag carries it');
    });

    test('normalizeScene: every SCENE_KEYS key present; seed is MANDATORY and finite', () => {
        const rec = RS.normalizeScene(SCENE_FIXTURE);
        for (const k of RS.SCENE_KEYS) {
            assert.ok(Object.prototype.hasOwnProperty.call(rec, k), `record carries ${k}`);
        }
        assert.throws(() => RS.normalizeScene({ physicsW: 4, physicsH: 4 }), /seed must be a finite number/,
            'a null seed downgrades "regenerate" to "trust the raster"');
        // sourceRef/build/projection are legitimately nullable — honestly absent.
        const bare = RS.normalizeScene({ seed: 0, physicsW: 4, physicsH: 4 });
        assert.equal(bare.sourceRef, null);
        assert.equal(bare.build, null);
        assert.equal(bare.projection, null);
    });

    test('normalizeScene COPIES the nested build/projection it is handed (no live view)', () => {
        // Defense at the OWNER, independent of the copy runner.sceneRecord() makes on the
        // way out: `normalizeScene` is a published export, and a BYO provider is free to
        // return a CACHED object from `projection()`. Aliasing it would make the record —
        // the thing the content hash is taken over — a live view of provider state, so a
        // later provider-side mutation would silently change what the record means while
        // the memo still considered it unchanged.
        const build = { engine: 'wasm' };
        const projection = { kind: 'perspective', fovY: 50 };
        const rec = RS.normalizeScene({ seed: 1, physicsW: 4, physicsH: 4, build, projection });
        assert.notEqual(rec.build, build, 'build copied, not aliased');
        assert.notEqual(rec.projection, projection, 'projection copied, not aliased');
        assert.deepEqual(rec.build, build, 'by value, unchanged');
        assert.deepEqual(rec.projection, projection);
        // A later mutation of the CALLER's / provider's object cannot reach the record.
        build.engine = 'MUTATED';
        projection.fovY = 999;
        assert.equal(rec.build.engine, 'wasm');
        assert.equal(rec.projection.fovY, 50);
    });

    test('a still without a scene id is REJECTED — an unmoored record is unverifiable', () => {
        assert.throws(() => RS.normalizeStill(partialFor('field', { scene: null })),
            /scene must be the content hash/);
        assert.throws(() => RS.normalizeStill(partialFor('field', { scene: '' })),
            /scene must be the content hash/);
    });

    test('the still no longer carries physicsW/physicsH — they are the SCENE\'s (join, do not duplicate)', () => {
        const bag = RS.normalizeStill(partialFor('field'));
        assert.equal('physicsW' in bag, false);
        assert.ok(RS.SCENE_KEYS.includes('physicsW') && RS.SCENE_KEYS.includes('physicsH'));
    });

    test('fieldOpts rides the STILL (an r8 channel is comparable only at equal options)', () => {
        assert.ok(RS.STILL_KEYS.includes('fieldOpts'));
        assert.deepEqual(RS.normalizeStill(partialFor('field', { fieldOpts: { gain: 4 } })).fieldOpts,
            { gain: 4 });
        assert.equal(RS.normalizeStill(partialFor('composite')).fieldOpts, null,
            'null on every non-field stage');
    });
});

describe('content addressing — one hashing authority', () => {
    test('canonicalizeScene is key-ORDER independent (identity cannot depend on insertion order)', () => {
        const a = RS.normalizeScene(SCENE_FIXTURE);
        const b = {};
        for (const k of Object.keys(a).reverse()) { b[k] = a[k]; }
        assert.equal(RS.canonicalizeScene(a), RS.canonicalizeScene(b));
    });

    test('canonicalizeScene PROJECTS onto SCENE_KEYS — an id carried alongside cannot perturb its own hash', () => {
        const rec = RS.normalizeScene(SCENE_FIXTURE);
        const withId = Object.assign({}, rec, { scene: 'sha256:deadbeef', extra: 'ignored' });
        assert.equal(RS.canonicalizeScene(withId), RS.canonicalizeScene(rec),
            'which is what lets getScene() hand back the record AND its id in one object');
    });

    test('nested objects are encoded with SORTED keys (build/projection cannot re-order)', () => {
        const a = RS.normalizeScene(Object.assign({}, SCENE_FIXTURE, { build: { engine: 'wasm', renderer: 'three' } }));
        const b = RS.normalizeScene(Object.assign({}, SCENE_FIXTURE, { build: { renderer: 'three', engine: 'wasm' } }));
        assert.equal(RS.canonicalizeScene(a), RS.canonicalizeScene(b));
    });

    test('sceneHash is STABLE for identical content and SENSITIVE to every SCENE field', async () => {
        const base = RS.normalizeScene(SCENE_FIXTURE);
        const h0 = await RS.sceneHash(base);
        assert.match(h0, /^sha256:[0-9a-f]{64}$/, 'algorithm-prefixed, so a swap can never be silent');
        assert.equal(await RS.sceneHash(RS.normalizeScene(SCENE_FIXTURE)), h0,
            'identical setups SHARE a scene identity across runs — the point of content addressing');
        const variants = {
            seed:       { seed: 43 },
            sourceRef:  { sourceRef: 'other' },
            build:      { build: { engine: 'wasm', renderer: 'p5' } },
            physicsW:   { physicsW: 601 },
            physicsH:   { physicsH: 401 },
            projection: { projection: { kind: 'perspective', fovY: 60 } }
        };
        for (const [name, over] of Object.entries(variants)) {
            const h = await RS.sceneHash(RS.normalizeScene(Object.assign({}, SCENE_FIXTURE, over)));
            assert.notEqual(h, h0, `changing ${name} mints a DIFFERENT identity (drift is detectable)`);
        }
    });
});

describe('THE MUTABILITY DRIFT GATE — what makes the line real', () => {
    test('every field a runtime mutation surface touches is a STILL key and NEVER a SCENE key', () => {
        const surfaces = RS.RUNTIME_MUTATION_SURFACES;
        assert.ok(Object.keys(surfaces).length >= 4, 'the declared surfaces are enumerated');
        for (const [api, fields] of Object.entries(surfaces)) {
            assert.ok(Array.isArray(fields) && fields.length, `${api} declares its fields`);
            for (const f of fields) {
                assert.ok(RS.STILL_KEYS.includes(f),
                    `${api} mutates "${f}", so "${f}" MUST be a still field`);
                assert.equal(RS.SCENE_KEYS.includes(f), false,
                    `"${f}" is mutable mid-run (${api}) — hoisting it into the immutable scene ` +
                    'header would MISLABEL every subsequent still. That is corpus corruption ' +
                    'arriving through the back door of a bandwidth optimisation.');
            }
        }
    });

    test('the four named traps are covered by name (pose, filtersApplied, cssWidth/Height, renderOptions)', () => {
        const touched = new Set(Object.values(RS.RUNTIME_MUTATION_SURFACES).flat());
        for (const f of ['pose', 'filtersApplied', 'cssWidth', 'cssHeight', 'renderOptions', 'renderBaseCanvas']) {
            assert.ok(touched.has(f),
                `"${f}" LOOKS scene-level and is not — it must be declared as mutable so the ` +
                'gate above pins it to the still record');
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// (B) THE FERRY GATE — consumers read the exported list, they never re-list it
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strip block + line comments so a gate can NEVER be satisfied (or broken) by prose.
 * Twice on this branch a source assertion passed on a docstring mention.
 */
function stripComments(src) {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

const CONSUMERS = [
    // The MECHANISM (the render-pipeline tap instrument) and the FACE. The editor host
    // (FrqtlApp.js) is no longer a consumer: it forwards to the instrument and resolves no
    // stage vocabulary of its own.
    'lib/frqtl/objects/instruments/capture.js',
    'lib/frqtl/objects/objects/FrqtlVision.js',
    // The capture-host KIND + the hosted implementation: a REMOTE stage executor is the
    // consumer most tempted to keep its own list ("the stages I can do"), and the page's own
    // dispatcher is the authority on that — so it ferries the table like everyone else.
    'lib/frqtl/objects/instruments/capture-host.js',
    'lib/frqtl/objects/instruments/hosted-eyes.js'
];

describe('ferry gate — no consumer re-lists the stage vocabulary', () => {
    for (const rel of CONSUMERS) {
        test(`${rel} builds NO ordered stage array of its own`, () => {
            const code = stripComments(readFileSync(path.join(repoRoot, rel), 'utf8'));
            // The schema-mirror shape: an array literal enumerating two or more stage
            // names. A consumer legitimately MENTIONS single names (binding a stage to its
            // executor) — it must never own the ordered list.
            const names = RS.RENDER_STAGES.map((s) => `'${s}'`).join('\\s*,\\s*');
            assert.doesNotMatch(code, new RegExp('\\[\\s*' + names),
                'a hand-written RENDER_STAGES array here is the schema mirror — ferry ' +
                'RenderStages.RENDER_STAGES instead');
            // Any 2+ stage-name array literal, in any order, is equally a mirror.
            const anyTwo = "\\[\\s*'(?:" + RS.RENDER_STAGES.join('|') + ")'\\s*,\\s*'(?:" +
                RS.RENDER_STAGES.join('|') + ")'";
            assert.doesNotMatch(code, new RegExp(anyTwo),
                'even a two-element stage array is a second stage list');
        });

        test(`${rel} resolves the owner through a named FAIL-LOUD guard`, () => {
            const code = stripComments(readFileSync(path.join(repoRoot, rel), 'utf8'));
            assert.match(code, /RenderStages/, 'reads the owner');
            assert.match(code, /unreachable/,
                'a missing contract is a hard error naming the canonical file — never a fallback');
        });
    }

    test('the convenience derives the final stage from the table, with NO composite literal', () => {
        const code = stripComments(
            readFileSync(path.join(repoRoot, 'lib/frqtl/objects/instruments/capture.js'), 'utf8'));
        const conv = code.slice(code.indexOf('prototype.captureStill'));
        const body = conv.slice(0, conv.indexOf('};'));
        assert.match(body, /finalStage\(\)/,
            'captureStill() must resolve the LAST stage through finalStage()');
        assert.doesNotMatch(body, /'composite'/,
            'a hardcoded composite literal in the convenience would keep claiming "the full ' +
            'stack" while naming a stage that had stopped being last');
        assert.match(body, /this\.capture\(/,
            'PURE DELEGATION: the convenience calls the mechanism, it never re-implements it');
    });
});
