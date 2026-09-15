/* Copyright 2023-2026 by Essam Abadir */

/**
 * capture-envelope.js — the TRANSPORT contract for a capture leaving this process.
 *
 * ── What it packages ─────────────────────────────────────────────────────────
 *
 * A still that stays in-process is `normalizeStill`'s bag and nothing more. A capture that
 * CROSSES a boundary — to a model, an app microservice, a corpus row — needs two things the
 * bag deliberately does not carry: the ENCODED bytes (rgba8 is not transportable), and, for
 * a sequence, the map from frame index back to simulation state.
 *
 * This module adds exactly that envelope and NOTHING else.
 *
 * ── Why it composes rather than re-declares ──────────────────────────────────
 *
 * `render-stages.js` in this same directory OWNS the still schema: it holds `SCHEMA_VERSION`,
 * refuses an unknown stage, refuses a `format` disagreeing with its stage, refuses an empty
 * payload, refuses a still with no `scene` hash, and snapshots `data` so a live reference can
 * never leak into a corpus. Re-listing `{stage, format, width, height, data, tick, scene}`
 * here would be a hand mirror of that schema and would drift the first time a stage is added
 * — the review-blocking bug class this codebase names by hand. So the still rides WHOLE,
 * under one key, normalized by its owner, and this file never reads inside it except to
 * cross-check what the encoder claims.
 *
 * ── The two forms ────────────────────────────────────────────────────────────
 *
 *   stillEnvelope({ still, encoded })        one capture
 *
 * NOTE the still envelope carries NO pose of its own: `normalizeStill` already holds `pose`,
 * and adding a second one here would be a duplicated owner field - the very mirror this
 * module exists to avoid. The VIDEO track does carry pose per frame, because the owner has
 * no notion of a sequence and nothing there could hold it.
 *   videoEnvelope({ track, encoded, truncated })   a sequence + its sidecar manifest
 *
 * ── Why `truncated` has NO default ───────────────────────────────────────────
 *
 * `FlightRecorder` stops at its cap and raises `overflowed` precisely because "a truncated
 * sequence that LOOKS complete is worse than a refusal". Defaulting `truncated` to false here
 * would re-create that lie one layer up: a caller who forgot to ferry the flag would ship a
 * short flight carrying an explicit claim of completeness. So it is REQUIRED, and a missing
 * one throws.
 *
 * ── Why frame cadence is checked against the declared cadence ────────────────
 *
 * `ticksPerFrame` is the CAPTURE cadence (a tick IS the frame); `fps` is a PLAYBACK choice
 * with no physical meaning — engine speed is 1 px/tick, so a presentation rate says nothing
 * about the simulation. Both are required because collapsing them destroys the tick index,
 * and the tick index is the only thing that makes a frame comparable to engine state. The
 * frames' own tick deltas must equal the declared cadence: a manifest whose label disagrees
 * with its data is worse than an unlabelled one, because it will be believed.
 */

var RenderStages = _resolveRenderStages();

/**
 * The stage vocabulary and the normalizer are FERRIED from their owner. Same two-host
 * resolution FrqtlVision uses: a browser global, else the shim by require under Node.
 */
function _resolveRenderStages() {
    if (typeof window !== 'undefined' && window.RenderStages) { return window.RenderStages; }
    if (typeof globalThis !== 'undefined' && globalThis.RenderStages) { return globalThis.RenderStages; }
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
        return require('./render-stages.js');
    }
    throw new Error('[capture-envelope] RenderStages is unavailable. It owns the still schema ' +
        'this module composes; there is no local copy of it by design. (FAIL-LOUD.)');
}

/** Envelope schema version. Independent of the still's own `v`, which its owner sets. */
var ENVELOPE_VERSION = 1;

/** The encoders this contract recognises, and the mime each produces. */
var ENCODERS = {
    'FrqtlVision.toPNG':      'image/png',
    'FrqtlVision.toDataURL':  'image/png'
};

function _fail(msg) { throw new Error('[capture-envelope] ' + msg + ' (FAIL-LOUD.)'); }

function _requireBool(value, name) {
    if (typeof value !== 'boolean') {
        _fail(name + ' must be an explicit boolean, got ' + String(value) +
              ' — it is never defaulted, because a fabricated completeness claim is the ' +
              'exact failure the recorder\'s own cap reporting exists to prevent');
    }
    return value;
}

function _requirePosInt(value, name) {
    if (typeof value !== 'number' || !isFinite(value) || value <= 0 || value % 1 !== 0) {
        _fail(name + ' must be a positive whole number, got ' + String(value));
    }
    return value;
}

function _requireNonEmptyString(value, name, why) {
    if (typeof value !== 'string' || !value) { _fail(name + ' must be a non-empty string' + (why ? ' — ' + why : '') + ', got ' + String(value)); }
    return value;
}

/** Validate the encoded half, whatever it wraps. */
function _normalizeEncoded(encoded, expectMimePrefix) {
    if (!encoded || typeof encoded !== 'object') { _fail('`encoded` must be an object carrying the transportable bytes'); }
    var mime = _requireNonEmptyString(encoded.mime, 'encoded.mime');
    if (expectMimePrefix && mime.indexOf(expectMimePrefix) !== 0) {
        _fail('encoded.mime ' + JSON.stringify(mime) + ' is not a ' + expectMimePrefix + '* type');
    }
    var bytes = encoded.bytes;
    if (typeof bytes !== 'string' || !bytes) {
        _fail('encoded.bytes must be a non-empty base64 string — the envelope carries TRANSPORTABLE ' +
              'bytes; an rgba8 payload does not cross a boundary and the still already holds it');
    }
    return { mime: mime, bytes: bytes, encoder: encoded.encoder === undefined ? null : encoded.encoder };
}

/**
 * Compose a single-capture envelope.
 *
 * @param {{still:object, encoded:{mime:string,bytes:string,encoder?:string}}} partial
 *   `still` is a RAW partial bag; it is normalized HERE by its owner, never pre-normalized
 *   by the caller (that would let two callers disagree about who validated).
 * @returns {object} the envelope
 */
function stillEnvelope(partial) {
    if (!partial || typeof partial !== 'object') { _fail('expected an object, got ' + String(partial)); }

    var still = RenderStages.normalizeStill(partial.still);
    var encoded = _normalizeEncoded(partial.encoded, 'image/');

    if (encoded.encoder !== null) {
        if (!Object.prototype.hasOwnProperty.call(ENCODERS, encoded.encoder)) {
            _fail('unknown encoder ' + JSON.stringify(encoded.encoder) + ' — known: ' +
                  Object.keys(ENCODERS).join(', '));
        }
        if (ENCODERS[encoded.encoder] !== encoded.mime) {
            _fail('encoder ' + JSON.stringify(encoded.encoder) + ' produces ' +
                  JSON.stringify(ENCODERS[encoded.encoder]) + ', but encoded.mime says ' +
                  JSON.stringify(encoded.mime));
        }
    }

    return {
        kind:     'still',
        v:        ENVELOPE_VERSION,
        still:    still,
        encoded:  encoded
    };
}

/**
 * Compose a sequence envelope. `track` is the SIDECAR MANIFEST — without it the bytes are an
 * unlabelled movie and no frame can be aligned to the state that produced it.
 *
 * @param {{track:object, encoded:object, truncated:boolean}} partial
 * @returns {object} the envelope
 */
function videoEnvelope(partial) {
    if (!partial || typeof partial !== 'object') { _fail('expected an object, got ' + String(partial)); }

    var t = partial.track;
    if (!t || typeof t !== 'object') { _fail('`track` (the sidecar manifest) is REQUIRED — without it the bytes are an unlabelled movie'); }

    _requireNonEmptyString(t.scene, 'track.scene',
        'a sequence without a scene id is unmoored exactly as a still without one is');
    var stage = RenderStages.assertStage(t.stage);

    var width  = _requirePosInt(t.width,  'track.width');
    var height = _requirePosInt(t.height, 'track.height');
    var ticksPerFrame = _requirePosInt(t.ticksPerFrame, 'track.ticksPerFrame');
    var fps = _requirePosInt(t.fps, 'track.fps');

    var frames = t.frames;
    if (!Array.isArray(frames) || frames.length === 0) {
        _fail('track.frames must be a non-empty array of {i, tick, pose} — an empty manifest ' +
              'over real bytes is a measurement built on nothing');
    }

    for (var n = 0; n < frames.length; n++) {
        var f = frames[n];
        if (!f || typeof f !== 'object') { _fail('track.frames[' + n + '] must be an object'); }
        if (f.i !== n) {
            _fail('track.frames[' + n + '].i is ' + String(f.i) + ' — frame indices must be ' +
                  'contiguous from 0, or the map from bytes to state is guesswork');
        }
        if (typeof f.tick !== 'number' || !isFinite(f.tick) || f.tick % 1 !== 0) {
            _fail('track.frames[' + n + '].tick must be a whole number, got ' + String(f.tick));
        }
        if (n > 0) {
            var delta = f.tick - frames[n - 1].tick;
            if (delta !== ticksPerFrame) {
                _fail('track.frames[' + n + '] is ' + delta + ' ticks after its predecessor, but ' +
                      'track.ticksPerFrame declares ' + ticksPerFrame + ' — a manifest whose ' +
                      'label disagrees with its data is worse than none, because it is believed');
            }
        }
    }

    var encoded = _normalizeEncoded(partial.encoded, 'video/');

    return {
        kind:      'video',
        v:         ENVELOPE_VERSION,
        track: {
            scene:         t.scene,
            stage:         stage,
            width:         width,
            height:        height,
            ticksPerFrame: ticksPerFrame,
            fps:           fps,
            firstTick:     frames[0].tick,
            lastTick:      frames[frames.length - 1].tick,
            frames:        frames.map(function (f) {
                return { i: f.i, tick: f.tick, pose: f.pose === undefined ? null : f.pose };
            })
        },
        encoded:   encoded,
        truncated: _requireBool(partial.truncated, 'truncated')
    };
}

var CaptureEnvelope = {
    ENVELOPE_VERSION: ENVELOPE_VERSION,
    ENCODERS:         ENCODERS,
    stillEnvelope:    stillEnvelope,
    videoEnvelope:    videoEnvelope
};

if (typeof module !== 'undefined' && module.exports) { module.exports = CaptureEnvelope; }
if (typeof window !== 'undefined') { window.CaptureEnvelope = CaptureEnvelope; }
