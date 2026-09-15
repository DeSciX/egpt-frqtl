/* Copyright 2023-2026 by Essam Abadir */

/**
 * capture-envelope.test.mjs — the envelope is COMPOSITION, so this suite tests the seam and
 * the invariants the envelope itself adds. It deliberately does NOT re-assert normalizeStill's
 * own rules (unknown stage, empty payload, missing scene): those belong to render-stages.js,
 * and a test that mirrors another module's rules rots the moment the owner changes. What IS
 * asserted is that the owner is REACHED — an invalid still must be refused in the owner's
 * words, which is only possible if we call it rather than re-implement it.
 *
 * Run: node --test lib/shim/render/test/capture-envelope.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Envelope = require('../capture-envelope.js');
const RenderStages = require('../render-stages.js');

const FINAL = RenderStages.finalStage();
const RGBA8 = RenderStages.STAGE_FORMATS[FINAL];

function stillPartial() {
    return {
        scene: 'scene-hash', stage: FINAL, tick: 7, format: RGBA8,
        width: 2, height: 2, filtersApplied: [],
        data: new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255])
    };
}
const PNG = { mime: 'image/png', bytes: 'aGVsbG8=', encoder: 'FrqtlVision.toPNG' };

function track(over) {
    return Object.assign({
        scene: 'scene-hash', stage: FINAL, width: 600, height: 600,
        ticksPerFrame: 5, fps: 12,
        frames: [{ i: 0, tick: 5, pose: { azimuth: 0 } },
                 { i: 1, tick: 10, pose: { azimuth: 15 } },
                 { i: 2, tick: 15, pose: { azimuth: 30 } }]
    }, over || {});
}
const MP4 = { mime: 'video/mp4', bytes: 'AAAA', encoder: null };

describe('capture-envelope — the still rides WHOLE, normalized by its OWNER', () => {
    test('every key normalizeStill produces survives under `still` (conformance, driven off the OWNER)', () => {
        const owner = RenderStages.normalizeStill(stillPartial());
        const env = Envelope.stillEnvelope({ still: stillPartial(), encoded: PNG });
        // Drive off the owner's OWN output — never a hand-written key list here.
        for (const key of Object.keys(owner)) {
            assert.ok(key in env.still, `envelope dropped owner key "${key}"`);
        }
        assert.equal(env.still.v, RenderStages.SCHEMA_VERSION, 'the owner remains the version authority');
        assert.equal(env.kind, 'still');
    });

    test('an invalid still is refused in the OWNER\'s words — proving it is called, not mirrored', () => {
        const bad = stillPartial();
        delete bad.scene;
        assert.throws(() => Envelope.stillEnvelope({ still: bad, encoded: PNG }), /scene/);
    });

    test('pose rides INSIDE the still, never duplicated at envelope level', () => {
        const env = Envelope.stillEnvelope({ still: Object.assign(stillPartial(), { pose: { azimuth: 42 } }), encoded: PNG });
        assert.deepEqual(env.still.pose, { azimuth: 42 }, 'the owner carries pose');
        assert.ok(!('pose' in env), 'a second pose on the envelope would be a duplicated owner field');
    });

    test('the envelope does not pre-normalize: it takes a RAW partial', () => {
        const env = Envelope.stillEnvelope({ still: stillPartial(), encoded: PNG });
        assert.equal(env.still.stage, FINAL);
        assert.equal(env.still.format, RGBA8);
    });
});

describe('capture-envelope — the encoded half must be transportable and honest', () => {
    test('rejects a non-image mime on a still', () => {
        assert.throws(() => Envelope.stillEnvelope({ still: stillPartial(), encoded: { mime: 'video/mp4', bytes: 'AA' } }), /image\//);
    });

    test('rejects empty or non-string bytes — rgba8 does not cross a boundary', () => {
        for (const bytes of ['', undefined, new Uint8ClampedArray(4)]) {
            assert.throws(() => Envelope.stillEnvelope({ still: stillPartial(), encoded: { mime: 'image/png', bytes } }), /bytes/);
        }
    });

    test('rejects an encoder whose declared mime disagrees with what it produces', () => {
        assert.throws(
            () => Envelope.stillEnvelope({ still: stillPartial(), encoded: { mime: 'image/webp', bytes: 'AA', encoder: 'FrqtlVision.toPNG' } }),
            /produces/
        );
    });

    test('rejects an unknown encoder rather than trusting the label', () => {
        assert.throws(
            () => Envelope.stillEnvelope({ still: stillPartial(), encoded: { mime: 'image/png', bytes: 'AA', encoder: 'canvas.toBlob' } }),
            /unknown encoder/
        );
    });
});

describe('capture-envelope — `truncated` is REQUIRED, never defaulted', () => {
    test('omitting truncated THROWS rather than claiming completeness', () => {
        assert.throws(() => Envelope.videoEnvelope({ track: track(), encoded: MP4 }), /explicit boolean/);
    });

    test('both true and false are accepted when stated', () => {
        assert.equal(Envelope.videoEnvelope({ track: track(), encoded: MP4, truncated: false }).truncated, false);
        assert.equal(Envelope.videoEnvelope({ track: track(), encoded: MP4, truncated: true }).truncated, true);
    });
});

describe('capture-envelope — the sidecar manifest must map bytes to state', () => {
    test('a missing track is refused: bytes without a manifest are an unlabelled movie', () => {
        assert.throws(() => Envelope.videoEnvelope({ encoded: MP4, truncated: false }), /sidecar manifest/);
    });

    test('an empty frame list is refused', () => {
        assert.throws(() => Envelope.videoEnvelope({ track: track({ frames: [] }), encoded: MP4, truncated: false }), /non-empty/);
    });

    test('frame indices must be contiguous from 0', () => {
        const t = track({ frames: [{ i: 0, tick: 5 }, { i: 2, tick: 10 }] });
        assert.throws(() => Envelope.videoEnvelope({ track: t, encoded: MP4, truncated: false }), /contiguous/);
    });

    test('tick deltas MUST equal the declared cadence — a mislabelled manifest is believed', () => {
        const t = track({ ticksPerFrame: 5, frames: [{ i: 0, tick: 5 }, { i: 1, tick: 11 }] });
        assert.throws(() => Envelope.videoEnvelope({ track: t, encoded: MP4, truncated: false }), /ticksPerFrame declares 5/);
    });

    test('ticksPerFrame and fps are BOTH required — collapsing them destroys the tick index', () => {
        assert.throws(() => Envelope.videoEnvelope({ track: track({ ticksPerFrame: undefined }), encoded: MP4, truncated: false }), /ticksPerFrame/);
        assert.throws(() => Envelope.videoEnvelope({ track: track({ fps: undefined }), encoded: MP4, truncated: false }), /fps/);
    });

    test('firstTick/lastTick are DERIVED from the frames, not taken from the caller', () => {
        const t = track({ firstTick: 999, lastTick: 999 });
        const env = Envelope.videoEnvelope({ track: t, encoded: MP4, truncated: false });
        assert.equal(env.track.firstTick, 5);
        assert.equal(env.track.lastTick, 15);
    });

    test('pose is carried per frame, defaulting to null rather than being dropped', () => {
        const env = Envelope.videoEnvelope({ track: track(), encoded: MP4, truncated: false });
        assert.deepEqual(env.track.frames.map(f => f.i), [0, 1, 2]);
        assert.deepEqual(env.track.frames[1].pose, { azimuth: 15 });
        const bare = Envelope.videoEnvelope({ track: track({ frames: [{ i: 0, tick: 5 }] }), encoded: MP4, truncated: false });
        assert.equal(bare.track.frames[0].pose, null);
    });

    test('a non-video mime is refused on a video envelope', () => {
        assert.throws(() => Envelope.videoEnvelope({ track: track(), encoded: { mime: 'image/png', bytes: 'AA' }, truncated: false }), /video\//);
    });
});
