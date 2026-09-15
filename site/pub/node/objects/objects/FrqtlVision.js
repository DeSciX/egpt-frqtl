/* Copyright 2023-2026 by Essam Abadir */

/**
 * FrqtlVision.js — the reusable "video camera that takes stills" sugar object, and the
 * consumer-facing surface of the normalized capture format (CEO-named 2026-07-30).
 *
 * Peer of `CameraControls.js` in this directory, and deliberately DISJOINT from it:
 * `CameraControls` drives the VIEWPOINT (`runner.cameraControl` — where the camera looks);
 * `FrqtlVision` reads the PICTURE (`runner.capture` / `runner.captureStill` — what came out).
 * Framing a still is therefore composition, not a parameter: point the camera with
 * `CameraControls`/`cameraControl.setOrbit`, then capture what the canvas shows. A
 * `getStill({azimuth…})` would be a second write path into camera state.
 *
 * ── Vocabulary: the noun is STILL, never `frame` ─────────────────────────────
 * `Frame` is the engine's core noun (the Frame Axiom — every body, every quantum is a
 * Frame; `FrameData`, `makeLeafFrame`, `setFrameProperty`). On this surface a **STILL** is
 * one tap result, a **STREAM** is a tick-ordered sequence of stills, and a **VIDEO** is an
 * encoded stream. There is no `getFrame`, no `frames[]`, no `onFrame`, no `frameRate`
 * anywhere here. The video metaphor survives in prose ("a still is a single frame *of that
 * video*") but never in an identifier — in this codebase a stream-of-frames API would read
 * as a stream of physics `Frame` objects, and the `tick` stage makes that a genuine
 * ambiguity rather than a pedantic one: `getStill('tick').data` literally IS `FrameData[]`.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `FrqtlVision.attach(runner) → handle`
 *
 *   @param {object} runner — an FrqtlApp. The ONLY coupling: `runner.capture()`,
 *     `runner.captureStill()`, `runner.sceneRecord()` and the shim-owned stage table. No
 *     renderer-sniffing, no engine, no per-page coupling — this object knows nothing about
 *     which experiment mounts it.
 *   @returns {{
 *     getScene():Promise<object>,        // the run-invariant SceneRecord + its content id
 *     getStill(stage?):Promise<object>,  // stage omitted → the FULL composed stack
 *     stages:string[],                   // the FERRIED RenderStages.RENDER_STAGES list
 *     finalStage():string,               // the ferried final-stage derivation
 *     toDataURL(still):string,           // the BROWSER PNG encoder (data URL)
 *     toPNG(still):Buffer                // the NODE PNG encoder (bytes)
 *   }}
 *
 * ── TWO HOSTS, one contract ──────────────────────────────────────────────────
 *
 * This object runs in a browser and in Node, and the PIXEL ENCODER differs by host — so each
 * one throws naming the other rather than guessing: `toDataURL` is the browser encoder (a
 * scratch canvas) and refuses under Node naming `toPNG`; `toPNG` is the Node encoder (zlib +
 * Buffer) and refuses in a browser naming `toDataURL`. Same picture, same record, the encoder
 * for THIS host.
 *
 * That redirect is only honest if `attach()` is REACHABLE in both hosts, so the stage
 * vocabulary resolves per host too: `window.RenderStages` in a browser (the classic-script
 * load order the game-layer manifest establishes), a bare global where one is present, and a
 * `require` of the shim under Node. Pinned end to end by
 * `objects/test/frqtl-vision-node-host.test.mjs`, which seeds NO global — a test that seeded
 * one would pass whether or not the Node path worked.
 *
 * ── The normalized format: ONE scene record, MANY light stills ────────────────
 *
 * 3D scenes are high bandwidth, so the format does not repeat the scene on every capture.
 * `getScene()` returns the RUN-INVARIANT regeneration input — `seed`, `sourceRef`, `build`,
 * `physicsW/H`, `projection` — IMMUTABLE and CONTENT-ADDRESSED (`scene = sha256(...)`).
 * `getStill()` returns COORDINATES WITHIN that scene: which tick, which stage, which pose,
 * plus the payload, carrying `scene: <hash>` rather than the embedded record. A corpus
 * stores one scene plus N tiny stills, and every still is verifiable against (and
 * regenerable from) its scene. A self-contained "fat" bag is a JOIN a consumer can perform —
 * never a second stored format.
 *
 * The split is drawn by MUTABILITY, not by category. `filtersApplied`, `pose`,
 * `cssWidth`/`cssHeight` and `renderOptions` all LOOK scene-level and are not — each has a
 * live mid-run mutation surface, and hoisting one would mislabel every subsequent still. The
 * `RenderStages.RUNTIME_MUTATION_SURFACES` table declares that line and a conformance gate
 * enforces it, so a future hoist fails CI instead of rotting a corpus at training time.
 *
 * `getStill(stage)` FORWARDS — it adds nothing:
 *   - `getStill()`      → `runner.captureStill()` (the last-stage convenience)
 *   - `getStill(stage)` → `runner.capture(stage)` (the generic mechanism)
 *   - `getScene()`      → `runner.sceneRecord()`
 *   All dispatch, all throw rules and ALL provenance stamping live in the runner and nowhere
 *   else. This object holds no state at all.
 *
 * RESERVED, DEFERRED: `getStream({stage, everyNTicks}) → AsyncIterable<Still>` — a stream is
 * this same tap subscribed across ticks, yielding the SAME canonical bags (no envelope, no
 * new noun, and rate vocabulary in TICKS, never wall-clock fps: the physics clock is the only
 * clock). It needs no new capture machinery — the runner's per-tick listener fan-out is
 * already the subscription seam — so it lands with its first real caller. Nothing here
 * precludes it: `getStill` is stateless and re-entrant, every record carries a mandatory
 * `tick` (so a stream is just tick-monotone records and needs no sequence numbers — a second
 * ordering key beside `tick` would be a two-clocks bug), and provenance rides every element,
 * so a stream needs no stream-level header.
 *
 * ── Why the PNG is DERIVED here and never in a provider ──────────────────────
 *
 * The pixel array IS the still; a PNG is a lossless ENCODING of it. pixels → PNG is
 * synchronous and lossless, so it is written ONCE, here, and no provider (nor any BYO
 * renderer) ever ships image-encoding code. This is the sanctioned EDGE for encoders: when a
 * second encoding genuinely arrives it accretes HERE as a pure function over records — never
 * below this layer, and never as a format parameter on the tap (that would be format
 * negotiation inside a render capability). A video encoder in particular is a CONSUMER-side
 * module over a stream of `rgba8` records: a heavyweight codec inside `lib/frqtl` sugar would
 * ship a video encoder to every experiment page.
 *
 * ── ONE ENCODER PER HOST, both on this ONE face ──────────────────────────────
 *
 * "Get a picture from a script" is the most natural thing to want from this surface, and
 * until V4 the package shipped no node way to do it: `toDataURL` needs a DOM scratch canvas,
 * which is exactly the environment the HOSTED eyes do NOT have. Routing node pixels back
 * INTO a browser to encode them (the earlier design) is ceremony without a compensating
 * invariant when zlib is stdlib — so there are two encoders, one per host environment, and
 * BOTH are members of this face:
 *
 *   `toDataURL(still)` → `data:image/png;base64,…`   the BROWSER encoder (scratch canvas)
 *   `toPNG(still)`     → PNG `Buffer`                 the NODE encoder (zlib, no dependency)
 *
 * Each FAILS LOUD in the wrong host NAMING THE RIGHT ONE — the correct next line in the
 * error message, which is the whole P5-test discipline. What keeps the two honest is a
 * conformance row that encodes ONE known bag through BOTH and asserts the decoded pixels are
 * identical: "two implementations, one derivation" is a contract only when a test says so.
 * Row order and colour space come from the record contract, not a guess: rgba8 is row-major
 * from the TOP-LEFT origin, sRGB, NON-premultiplied — ImageData's own convention, and
 * exactly PNG colour type 6. Both encoders are therefore straight copies with no
 * re-orientation and no alpha correction.
 *
 * `eyes.saveStill(still, path)` (the hosted handle) is the write convenience over `toPNG`.
 *
 * The numbers stay first class: a consumer folding a radial profile, a histogram or a corpus
 * row reads `still.data` directly and never goes near a PNG. Analysis lives in the consumer —
 * an analysis method on this handle is how one primitive quietly becomes an instrument
 * registry. Pixel→universe mapping is likewise a separate published authority
 * (`compat/renderer/unprojectStill.js`), not a method here.
 *
 * ── FAIL-LOUD ────────────────────────────────────────────────────────────────
 *
 * `toDataURL`/`toPNG` THROW on a record whose `format` is not `'rgba8'` (a `framedata` or `r8`
 * field record has no image encoding — a plausible-looking blank PNG would be worse than an
 * error), and each throws in the wrong host naming the other. `attach` throws when handed
 * something that is not a capture-capable runner. Never a null image, never a silent empty
 * record.
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This is the output boundary reading its own output — no frame, dimension,
 * tick or op-program is touched, so no canonical-bench golden can move because of it. Its
 * product is stills, goldens, guide captures and corpus rows.
 *
 * Usage:
 *   var vision = FrqtlVision.attach(runner);
 *   var scene  = await vision.getScene();         // store ONCE
 *   var still  = await vision.getStill();         // the whole composed stack
 *   var field  = await vision.getStill('field');  // the render-free numeric channel
 *
 *   // Aligned multi-channel corpus row: capture BETWEEN ticks and assert equal tick stamps —
 *   // the tick equality IS the co-registration guard; `scene` ties them to one header.
 *   runner.stop();
 *   var rows = await Promise.all(vision.stages
 *       .filter(function (s) { return s !== 'scene'; })   // no 'scene' executor in v1
 *       .map(function (s) { return vision.getStill(s); }));
 */

'use strict';

// ── MODULE SCOPE (canonical classic-script convention — the same wrapper every game-layer
//    object carries). Classic scripts share ONE global lexical environment, so an unwrapped
//    top-level helper here would silently overwrite a same-named helper in a sibling script
//    (last loaded wins) — invisible to `node --test`, which gives every require()d file its
//    own module scope. Only the explicit module.exports / window.FrqtlVision assignment
//    reaches the shared scope. Enforced by
//    lib/shim/engine/test/classic-script-scope.test.mjs.
(function () {

/**
 * The shim-owned stage vocabulary, through a named FAIL-LOUD guard (the seam every
 * game-layer object uses for a shim contract). FERRIED, never re-listed here.
 */
function _resolveRenderStages() {
    if (typeof window !== 'undefined' && window.RenderStages) { return window.RenderStages; }
    if (typeof RenderStages !== 'undefined') { return RenderStages; }
    // NODE: the shim exports itself for CommonJS, so the two-host contract this file already
    // states — toDataURL is the browser encoder, toPNG the Node one — is only true if attach()
    // can be REACHED under Node. Without this branch it never could, and the Node half of the
    // design was unreachable while both encoders documented each other.
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
        return require('../../../shim/render/render-stages.js');
    }
    throw new Error('[FrqtlVision] canonical contract RenderStages ' +
        '(lib/shim/render/render-stages.js) is unreachable (load order) — fail-loud, not a fallback.');
}

/** The rgba8 format tag, read from the owner so this file carries no format literal. */
function _rgba8Format(RS) { return RS.STAGE_FORMATS[RS.finalStage()]; }

function _assertImageable(still, RS, who) {
    if (!still || typeof still !== 'object') {
        throw new Error('[FrqtlVision.' + who + '] expected a still record, got ' + String(still) + '.');
    }
    var want = _rgba8Format(RS);
    if (still.format !== want) {
        throw new Error('[FrqtlVision.' + who + '] this record\'s format is ' +
            JSON.stringify(still.format) + ', not ' + JSON.stringify(want) + ' — stage ' +
            JSON.stringify(still.stage) + ' carries NUMBERS (read still.data), not an image. ' +
            'Encoding it as a PNG would produce a plausible-looking picture of nothing. (FAIL-LOUD.)');
    }
}

/**
 * The BROWSER encoder: an rgba8 still record → a PNG data URL.
 *
 * FAILS LOUD with no DOM naming `toPNG` — the node counterpart on this same face. An error
 * that only says "no DOM" leaves the reader to guess; an error that names the next line is
 * the whole point (a crash is recoverable curriculum, a silent wrong outcome is not).
 *
 * @param {object} still — a `format:'rgba8'` record from `getStill()`
 * @returns {string} `data:image/png;base64,…`
 */
function toDataURL(still) {
    var RS = _resolveRenderStages();
    _assertImageable(still, RS, 'toDataURL');
    if (typeof document === 'undefined') {
        throw new Error('[FrqtlVision.toDataURL] no DOM: a data URL is encoded through a ' +
            'scratch canvas, so this is the BROWSER encoder. In node call ' +
            'FrqtlVision.toPNG(still) for PNG bytes (or eyes.saveStill(still, path) to write ' +
            'them straight to a file) — same picture, same record, the encoder for THIS host. ' +
            '(FAIL-LOUD.)');
    }
    var scratch = document.createElement('canvas');
    scratch.width  = still.width;
    scratch.height = still.height;
    var ctx = scratch.getContext('2d');
    if (!ctx || typeof ctx.putImageData !== 'function') {
        throw new Error('[FrqtlVision.toDataURL] the scratch canvas has no 2D context. (FAIL-LOUD.)');
    }
    // The record's rows are TOP-LEFT origin, sRGB and NON-premultiplied by contract (a GL
    // provider already flipped) — exactly ImageData's own convention, so this is a straight
    // copy with no re-orientation and no alpha correction.
    var img = ctx.createImageData(still.width, still.height);
    img.data.set(still.data);
    ctx.putImageData(img, 0, 0);
    return scratch.toDataURL('image/png');
}

/**
 * The NODE encoder: an rgba8 still record → PNG bytes.
 *
 * The counterpart of `toDataURL`, for the host that has no scratch canvas — which is exactly
 * where the hosted eyes run. PNG here is one filter byte per row plus `zlib.deflate`, so it
 * needs no dependency at all; zlib is resolved LAZILY through the same node-guard seam the
 * capture instrument uses for its node-only contracts, so a browser that loads this classic
 * script never touches `require`.
 *
 * @param {object} still — a `format:'rgba8'` record from `getStill()`
 * @returns {Buffer} PNG bytes
 */
function toPNG(still) {
    var RS = _resolveRenderStages();
    _assertImageable(still, RS, 'toPNG');
    if (typeof require !== 'function' || typeof Buffer === 'undefined') {
        throw new Error('[FrqtlVision.toPNG] this is the NODE encoder (zlib + Buffer) and ' +
            'neither is available here. In a browser call FrqtlVision.toDataURL(still) — same ' +
            'picture, same record, the encoder for THIS host. (FAIL-LOUD.)');
    }
    var zlib = require('zlib');
    var w = still.width, h = still.height;
    var px = Buffer.from(still.data.buffer, still.data.byteOffset, still.data.length);
    var stride = w * 4 + 1;
    var raw = Buffer.alloc(h * stride);
    for (var y = 0; y < h; y++) {
        raw[y * stride] = 0;                               // filter type 0 (None) per row
        px.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
    }
    // Node's zlib gained crc32 only in v20.15; a local one keeps this version-independent.
    function crc32(b) {
        var c, crc = 0xffffffff;
        for (var n = 0; n < b.length; n++) {
            c = (crc ^ b[n]) & 0xff;
            for (var k = 0; k < 8; k++) { c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1); }
            crc = (crc >>> 8) ^ c;
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
    function chunk(type, data) {
        var len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        var body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        var crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
        return Buffer.concat([len, body, crc]);
    }
    var ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8; ihdr[9] = 6;                              // 8-bit, colour type 6 (RGBA)
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

/**
 * attach(runner) — bind the handle to a runner. Stateless: the handle is a thin forwarder.
 * @param {object} runner — an FrqtlApp
 * @returns {object} the handle (see the module docstring)
 */
function attach(runner) {
    if (!runner || typeof runner.capture !== 'function' || typeof runner.captureStill !== 'function' ||
        typeof runner.sceneRecord !== 'function') {
        throw new Error('[FrqtlVision.attach] needs an FrqtlApp exposing capture(stage), ' +
            'captureStill() and sceneRecord() (the RENDER_STAGES tap contract). (FAIL-LOUD.)');
    }
    var RS = _resolveRenderStages();
    return {
        // FERRIED from the owner — a hand-written stage list here would be the
        // schema-mirror bug, and a stage added to the table appears here for free.
        stages:     RS.RENDER_STAGES.slice(),
        finalStage: RS.finalStage,
        /**
         * getScene() — the run-invariant SceneRecord plus its own content id. Pure forwarding.
         *
         * **MUST BE AWAITED.** It is a Promise because the scene id is a content hash and
         * `crypto.subtle.digest` — the ONE hashing implementation, a global in both Node and
         * the browser — is Promise-based; a synchronous accessor would need a second,
         * hand-rolled sha256 in the render layer. The failure mode is SILENT and has already
         * been hit once in the realm: an un-awaited Promise has NO own keys and
         * `JSON.stringify(promise)` is `'{}'`, so
         *   `JSON.stringify({ scene: vision.getScene() })`   // ← writes {} into the corpus
         * looks like an empty SceneRecord rather than a mistake. Always:
         *   `const scene = await vision.getScene();`
         *
         * The returned record is a fresh COPY each call — it shares no object identity with
         * the runner's internal memo, so mutating it cannot corrupt the record for any other
         * caller or break the hash other stills already reference.
         * @returns {Promise<object>}
         */
        getScene: function () { return runner.sceneRecord(); },
        /**
         * getStill(stage?) — pure forwarding. Omit `stage` for the fully composed stack.
         * @param {string} [stage]
         * @returns {Promise<object>}
         */
        getStill: function (stage) {
            return (stage === undefined) ? runner.captureStill() : runner.capture(stage);
        },
        toDataURL: toDataURL,
        toPNG:     toPNG
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

var FrqtlVision = { attach: attach, toDataURL: toDataURL, toPNG: toPNG };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FrqtlVision;
} else if (typeof window !== 'undefined') {
    window.FrqtlVision = FrqtlVision;
}

})();
