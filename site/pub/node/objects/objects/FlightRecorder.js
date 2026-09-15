/* Copyright 2023-2026 by Essam Abadir */

/**
 * FlightRecorder.js — records a camera flight as a frame sequence (CEO-approved 2026-08-18).
 *
 * PACKAGES: primitive 7, the RENDERER — a `RendererProvider` consuming TickData. It adds ZERO
 * physics. It is composition and nothing else: `CameraPath` moves the camera over a waypoint
 * track but captures nothing; `FrqtlVision` taps stills but cannot fly. Every consumer that
 * wanted "record the flight" was writing the same join by hand, so the join is the object.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `FlightRecorder.attach(runner, { waypoints, loop?, waypointTimeoutMs?,
 *                                  captureEveryTicks?, maxFrames? }) → handle`
 *
 *   @param {object} runner — an FrqtlApp. Couplings are exactly the two objects composed:
 *     whatever `CameraPath.attach` needs, plus `FrqtlVision.attach` when capturing. No
 *     renderer-sniffing, no engine, no per-page knowledge.
 *   @param {Array<{atTick:number, pose:object}>} waypoints — ferried verbatim to `CameraPath`,
 *     which owns their validation against the camera's declared `poseFields`. NOT re-checked
 *     here: re-listing another module's field rules is the schema-mirror bug this codebase
 *     treats as review-blocking.
 *   @param {boolean} [loop=false] — ferried to `CameraPath`.
 *   @param {number} [waypointTimeoutMs] — ferried to `CameraPath`.
 *   @param {number} [captureEveryTicks] — capture a still every N ticks. OMITTED (or 0) means
 *     FLY WITHOUT RECORDING; the vision tap is then never attached at all.
 *   @param {number} [maxFrames=24] — hard cap on frames held. See "the cap reports itself".
 *   @returns {{
 *     start():handle, stop():handle, dispose():void,
 *     frames():Promise<object[]>,   // settled stills, in capture order
 *     frameCount:number,            // captures STARTED (synchronous, exact)
 *     overflowed:boolean,           // true once the cap stopped the flight early
 *     poseAt(tick):object,          // ferried from CameraPath — PURE
 *     onWaypoint(cb):function,      // ferried from CameraPath
 *     running:boolean
 *   }}
 *
 * ── The cadence is in TICKS, and that is not a convenience ───────────────────
 *
 * A tick IS this world's frame, so `captureEveryTicks` is the frame rate. A cadence in
 * wall-clock seconds would drift against the sim — the same path replayed on a slower machine
 * would sample DIFFERENT ticks and produce a different sequence, which destroys the exact
 * property `CameraPath` exists to guarantee. Tick cadence gives byte-identical sequences for
 * identical waypoints, and it is the only cadence offered.
 *
 * ── The cap reports itself ───────────────────────────────────────────────────
 *
 * An uncompressed 600x600 rgba8 still is 1,440,000 bytes; a per-tick feed was measured at
 * ~14 MB/s. An unbounded recording exhausts memory. So the recorder stops at `maxFrames` —
 * and `overflowed` goes true, because a truncated sequence that LOOKS complete is worse than
 * a refusal: a corpus row or a golden built from a partial flight is fabricated evidence in
 * exactly the sense `CameraPath` already refuses elsewhere. Silence here would be the
 * observability lie this codebase treats as a bug class.
 *
 * ── Why `frames()` is async ──────────────────────────────────────────────────
 *
 * `FrqtlVision.getStill()` returns a Promise. The tick listener that drives capture is
 * synchronous, so what is held per tick is the PENDING capture; `frames()` settles them in
 * order and is the single accessor. `frameCount` counts captures STARTED and is exact
 * synchronously — the two answer different questions and both are honest about which.
 */

(function () {

function _fail(msg) {
    throw new Error('[FlightRecorder] ' + msg + ' (FAIL-LOUD.)');
}

function _resolve(name) {
    if (typeof module !== 'undefined' && module.exports) {
        return require('./' + name + '.js');
    }
    if (typeof window !== 'undefined' && window[name]) { return window[name]; }
    _fail('canonical contract ' + name + ' (lib/frqtl/objects/objects/' + name + '.js) is ' +
          'unreachable (load order) — fail-loud, not a fallback');
}

var FlightRecorder = {

    attach: function (runner, opts) {
        opts = opts || {};

        var CameraPath = _resolve('CameraPath');
        var every = opts.captureEveryTicks;
        if (every !== undefined && every !== null && every !== 0) {
            if (typeof every !== 'number' || !isFinite(every) || every <= 0 || every % 1 !== 0) {
                _fail('captureEveryTicks must be a positive whole number of ticks, got ' +
                      String(every) + '. A tick is this world\'s frame, so this IS the frame ' +
                      'rate; there is deliberately no wall-clock cadence');
            }
        }
        var capturing = typeof every === 'number' && every > 0;

        var maxFrames = opts.maxFrames === undefined ? 24 : opts.maxFrames;
        if (typeof maxFrames !== 'number' || !isFinite(maxFrames) || maxFrames <= 0 || maxFrames % 1 !== 0) {
            _fail('maxFrames must be a positive whole number, got ' + String(maxFrames));
        }

        // Attached ONLY when recording: a flight that does not capture must not require a
        // renderer that can capture.
        var vision = capturing ? _resolve('FrqtlVision').attach(runner) : null;

        var path = CameraPath.attach(runner, {
            waypoints: opts.waypoints,
            loop: !!opts.loop,
            waypointTimeoutMs: opts.waypointTimeoutMs
        });

        if (capturing && typeof runner.addTickListener !== 'function') {
            _fail('recording needs the per-tick listener fan-out (runner.addTickListener), ' +
                  'which this runner does not expose. Fly without captureEveryTicks, or ' +
                  'upgrade the runner — a recorder that silently captured nothing would be ' +
                  'a feed you could not tell from an empty one');
        }

        var pending = [];
        var sinceLast = 0;
        var unTick = null;
        var overflowed = false;
        var handle;

        function onTick() {
            sinceLast += 1;
            if (sinceLast < every) { return; }
            sinceLast = 0;
            if (pending.length >= maxFrames) {
                if (!overflowed) { overflowed = true; handle.stop(); }
                return;
            }
            pending.push(vision.getStill());
        }

        handle = {
            get running() { return path.running; },
            get frameCount() { return pending.length; },
            get overflowed() { return overflowed; },
            get capturing() { return capturing; },

            frames: function () {
                return Promise.all(pending.slice());
            },

            poseAt: function (tick) { return path.poseAt(tick); },
            onWaypoint: function (cb) { return path.onWaypoint(cb); },

            start: function () {
                if (capturing && !unTick) { unTick = runner.addTickListener(onTick); }
                path.start();
                return handle;
            },

            stop: function () {
                if (unTick) { unTick(); unTick = null; }
                path.stop();
                return handle;
            },

            dispose: function () {
                handle.stop();
                path.dispose();
                pending = [];
            }
        };

        return handle;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlightRecorder;
} else if (typeof window !== 'undefined') {
    window.FlightRecorder = FlightRecorder;
}

})();
