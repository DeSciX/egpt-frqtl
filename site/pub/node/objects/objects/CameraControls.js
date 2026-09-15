/* Copyright 2023-2026 by Essam Abadir */

/**
 * CameraControls.js — a REUSABLE first-person-game-style camera-controls sugar
 * object (ws-emitter-wave Bite 3B, CEO 2026-07-20). ANY 3D experiment page drops
 * it in with ONE call; it drives the existing `runner.cameraControl` capability
 * (the camera-as-sugar / BYO-renderer pattern — `getCameraControl()` →
 * `look({spin,pitch})` ROTATES, `move({forward,strafe})` TRANSLATES) with two
 * on-screen joysticks + arrow/WASD keys, replacing the preset-dropdown pair.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 * `CameraControls.attach(runner, mountEl, opts) → handle`
 *
 *   @param {object} runner  — an FrqtlApp. The ONLY coupling: it reads
 *     `runner.cameraControl` (the OPTIONAL camera sugar handle the active
 *     renderer provider exposes via `getCameraControl()`; three → a handle, p5/2D
 *     → null). NO renderer-sniffing, NO engine, NO per-page coupling — the object
 *     knows nothing about which experiment mounts it.
 *   @param {HTMLElement} mountEl — the container the two joystick pads are
 *     absolutely positioned within (typically the experiment's canvas wrapper).
 *     Its `position` is set to `relative` while attached if it is `static`
 *     (restored on dispose) so the pads anchor to it.
 *   @param {object} [opts]
 *     @param {{azimuth?:number,elevation?:number,distance?:number}} [opts.initialOrbit]
 *       — applied to the camera at attach (via setOrbit) so the page keeps its
 *       default framing. Omitted ⇒ the camera's CURRENT `getOrbit()` is kept.
 *       CALLER CONTRACT: name ONLY axes the TARGET camera declares. Every camera
 *       publishes its own axes as `cameraControl.poseFields` (the CameraPath idiom:
 *       ask what axes EXIST, never what mode the camera is in) — and NOT every
 *       camera is angular: the p5 2D camera declares `{distance, target}` and no
 *       azimuth/elevation/roll, so an `{azimuth,…}` bag aimed at it FAILS LOUD
 *       inside `setOrbit` (by design, at the provider that owns the axes). This
 *       widget deliberately does not re-validate or filter the bag: a second
 *       enumeration of the pose vocabulary here would be a schema mirror, and
 *       silently dropping an axis the caller asked for is the failure mode
 *       CameraPath's own check exists to prevent. Derive the bag from
 *       `poseFields`; do not hand the same literal to every camera.
 *     @param {number} [opts.lookSpeed=90]   — deg/sec of screen-relative ROTATION
 *       at full LOOK-stick deflection (and full arrow-key hold): x spins (roll),
 *       y pitches. Forwarded to `cameraControl.look()`; this widget integrates no
 *       angles of its own.
 *     @param {number} [opts.moveRate=0.6]   — TRANSLATION rate at full MOVE-stick
 *       deflection (and full WASD hold), on both the walk and strafe axes, as a
 *       FRACTION OF THE CURRENT ORBIT DISTANCE per second. Scale-invariant on
 *       purpose — the same pad has to feel right in a 600-px scene and a 3000-px
 *       one, exactly like the camera presets scale distance to the scene.
 *     @param {number} [opts.dollySpeed=900] — world-px/sec of distance change used
 *       ONLY as the fallback walk for a provider whose cameraControl exposes no
 *       `move()` translate primitive (see the mapping note below).
 *     @param {number} [opts.wheelStep=60]   — world-px of distance per wheel notch
 *       (wheel/pinch zoom on mountEl). Set 0 to disable wheel zoom.
 *     @param {number} [opts.minDistance=20] — dolly/zoom clamp (near).
 *     @param {number} [opts.maxDistance=12000] — dolly/zoom clamp (far).
 *     @param {boolean} [opts.keyboard=true] — bind arrow + WASD keys. When on,
 *       `mountEl` is made focusable (tabindex -1) and focused on attach + on any
 *       pointer interaction with the canvas, so REAL key presses (which are only
 *       delivered to this iframe while it holds focus) reach the handler — the
 *       natural "click the canvas, then the keys drive it" behavior. (tabindex is
 *       restored on dispose.)
 *     @param {Window|HTMLElement} [opts.keyboardTarget=window] — where key
 *       listeners attach. Default `window` receives the bubbled keydown once the
 *       focused mount (inside the iframe) delivers it; also lets a headless test
 *       dispatch synthetic events straight at window.
 *     @param {boolean} [opts.joysticks=true] — render the two on-screen pads.
 *     @param {string} [opts.hookName='__frqtlCamera'] — the `window[hookName]`
 *       object continuously reflecting the camera's WHOLE `getOrbit()` bag (the
 *       realm hook Playwright asserts against). Every NUMERIC field of that bag is
 *       also stamped as `data-cam-<field>` on the control container
 *       (`data-role="camera-controls"`). The bag is FERRIED, never re-listed: a
 *       hand-written {azimuth,elevation,distance} triple here would have silently
 *       dropped `roll` the moment the camera declared it.
 *   @returns {{
 *     dispose():void,               // remove pads + listeners + rAF, restore mountEl
 *     getState():object,            // the camera's whole orbit bag
 *     setState(spec):void,          // apply an orbit-bag PATCH to the camera + publish
 *     sync():void,                  // re-read the camera's orbit into the hook (e.g. after an external setOrbit)
 *     mounted:boolean               // false when the provider had no cameraControl (FAIL-SOFT 2D no-op)
 *   }} handle. When `runner.cameraControl` is null (2D/p5 provider) NOTHING mounts
 *   and a no-op handle (`mounted:false`, all methods safe) is returned — the
 *   capability check IS the presence of the handle; the object never throws in 2D.
 *
 * ── Input mapping — the STANDARD FPS SPLIT (CEO-ruled 2026-07-26/07-28) ──────
 *   The two pads are the two halves of a first-person camera and they do NOT
 *   overlap: LOOK rotates, MOVE translates. MOVE never rotates.
 *     LOOK pad (bottom-RIGHT) — ROTATION ONLY, and it is SCREEN-RELATIVE.
 *       x → SPIN about the view axis (the picture ROLLS — the horizon tilts).
 *       y → PITCH about screen-right (the view tilts up/down at a FIXED radius).
 *       Both are forwarded as DELTAS to `cameraControl.look({spin, pitch})`.
 *       Azimuth is no longer driven directly: spin + pitch generate the whole
 *       rotation group (roll 90° then pitch IS yaw), so azimuth is DERIVED by the
 *       provider's decomposition. There is no elevation clamp — pitching over the
 *       pole is legal, which is what makes any view reachable.
 *     MOVE pad (bottom-LEFT)  — TRANSLATION ONLY, via `cameraControl.move()`.
 *       y → walk forward/back along the view direction (up = into the picture,
 *           so objects grow) · x → strafe left/right along screen-right. MOVE is
 *           ALWAYS screen-relative: walking forward while pitched down DESCENDS
 *           (fly, not FPS ground-walk).
 *     Arrow keys  → mirror the LOOK pad  (←/→ spin/roll, ↑/↓ pitch).
 *     W/A/S/D     → mirror the MOVE pad  (W/S walk, A/D strafe).
 *     Wheel/pinch → dolly (distance), independent of the pads.
 *   OBJECT-DRIVE FORK: when the runner has an input-drive target the sticks are
 *   routed to that OBJECT and the camera pose is FROZEN (see the drive block in
 *   frame()). LOOK-x therefore means ROLL with no drive target and OBJECT-ROTATE
 *   with one — one stick, two well-defined meanings selected by the target's
 *   presence, never an overlap.
 *   All the geometry lives at the ONE camera authority (the provider's
 *   `getCameraControl()` handle: `look` rotates, `move` translates) — this object
 *   re-derives NO orbit math and integrates NO angles. A BYO provider whose handle
 *   omits `look()` / `move()` is capability-checked by that absence: the affected
 *   axis becomes a defined NO-OP (walk falls back to a dolly), never a substituted
 *   different rotation.
 *   Drive is CONTINUOUS while a pad is held or a key is down (a single rAF loop
 *   integrates the current input each frame; it idles — no rAF scheduled — when
 *   no input is active, and is torn down on dispose).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *   ZERO physics (canonical-bench SU1). This is an OUTPUT-BOUNDARY view control:
 *   it only re-points the camera through the renderer's `setOrbit` sugar; it never
 *   touches the engine, a frame, a dimension, or emission. Toggling / driving it
 *   leaves every physics golden byte-identical — the same guarantee the camera
 *   preset dropdown it replaces already had (rendering is downstream of doTick()).
 */

(function () {

    function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

    // No-op handle returned when the active provider exposes no cameraControl
    // (2D/p5) — the capability check. All methods are safe to call.
    function noopHandle() {
        return {
            mounted: false,
            dispose: function () {},
            getState: function () { return null; },
            setState: function () {},
            sync: function () {}
        };
    }

    function attach(runner, mountEl, opts) {
        opts = opts || {};

        // ── CAPABILITY CHECK (FAIL-SOFT) ─────────────────────────────────────
        // The presence of runner.cameraControl IS the check — never a renderer
        // sniff. Null in 2D/p5 (getCameraControl returns null) ⇒ mount nothing.
        var cam = (runner && runner.cameraControl) ? runner.cameraControl : null;
        if (!cam || typeof cam.setOrbit !== 'function' || typeof cam.getOrbit !== 'function') {
            return noopHandle();
        }

        // ── IDEMPOTENT per mountEl (F4, CEO 2026-07-23) ──────────────────────
        // A second attach() on the SAME container returns the LIVE instance instead of
        // stacking a second pad set + a second window keydown listener. This kills the
        // double-mount race for EVERY caller — a page that wires its own joysticks
        // (a walkthrough rung) AND STUDIO's host mount (F2) both target the same
        // #canvas-wrapper, and whichever runs second must be a no-op. Ordering-
        // independent: no reliance on the host's DOM-timing guard. The marker is cleared
        // in dispose(), so a re-attach after dispose mounts fresh.
        if (mountEl && mountEl.__frqtlCameraHandle && mountEl.__frqtlCameraHandle.mounted) {
            return mountEl.__frqtlCameraHandle;
        }

        var doc = (mountEl && mountEl.ownerDocument) ? mountEl.ownerDocument
                : (typeof document !== 'undefined' ? document : null);

        var lookSpeed  = (typeof opts.lookSpeed  === 'number') ? opts.lookSpeed  : 90;
        var moveRate   = (typeof opts.moveRate   === 'number') ? opts.moveRate   : 0.6;
        var dollySpeed = (typeof opts.dollySpeed === 'number') ? opts.dollySpeed : 900;
        // Capability check for TRANSLATION (the getCameraControl precedent — the
        // presence of the method IS the check, never a renderer sniff). A provider
        // without move() still gets forward/back as a dolly; its strafe axis is a
        // no-op, because MOVE must never rotate.
        var canTranslate = (typeof cam.move === 'function');
        // Capability check for screen-relative ROTATION, the same idiom: the
        // presence of the method IS the check. A provider without look() gets a
        // defined NO-OP on the LOOK pad — never a substituted azimuth/elevation
        // integration here, which would put orbit geometry back in the widget.
        var canLook = (typeof cam.look === 'function');
        // STAGE 3: engine-px/sec the OBJECT moves at full stick deflection when an input-drive
        // target is set on the runner (camera-locked object drive). Distinct from the orbit
        // speeds (deg/sec / px-distance/sec) — this drives a world position, not the camera pose.
        var driveSpeed = (typeof opts.driveSpeed === 'number') ? opts.driveSpeed : 300;
        // STAGE 3 (B7b): deg/sec the rotate-capable OBJECT spins at full LOOK-x deflection when
        // it is the input-drive target. Angular (not distance-scaled) — an angle is zoom-invariant.
        var rotDriveSpeed = (typeof opts.rotDriveSpeed === 'number') ? opts.rotDriveSpeed : 90;
        var ROT_DRIVE_SPEED = rotDriveSpeed;
        var wheelStep  = (typeof opts.wheelStep  === 'number') ? opts.wheelStep  : 60;
        var minDist    = (typeof opts.minDistance === 'number') ? opts.minDistance : 20;
        var maxDist    = (typeof opts.maxDistance === 'number') ? opts.maxDistance : 12000;
        var useKeyboard = opts.keyboard !== false;
        var kbTarget   = opts.keyboardTarget || (typeof window !== 'undefined' ? window : null);
        var useJoysticks = opts.joysticks !== false;
        var hookName   = opts.hookName || '__frqtlCamera';

        // ── Seed the camera framing ──────────────────────────────────────────
        if (opts.initialOrbit) { cam.setOrbit(opts.initialOrbit); }

        // ── Realm hook + data-attr publishing ────────────────────────────────
        var container = null;
        function publishState() {
            // FERRY the whole bag — never a hand-listed {azimuth,elevation,distance}
            // triple. The retired hand list would have silently omitted `roll` from
            // both the realm hook and the data attrs the moment the camera declared
            // it: the schema-mirror failure mode in miniature — the datum exists,
            // one consumer sees it, another does not.
            var o = cam.getOrbit();
            if (typeof window !== 'undefined') { window[hookName] = o; }
            if (container) {
                for (var k in o) {
                    if (!Object.prototype.hasOwnProperty.call(o, k)) { continue; }
                    // Numeric pose axes become data-cam-<axis>; `target` is an object
                    // (the walked centre), read off the hook instead.
                    if (typeof o[k] !== 'number') { continue; }
                    container.setAttribute('data-cam-' + k.toLowerCase(),
                        String(Math.round(o[k] * 100) / 100));
                }
            }
            return o;
        }

        // ── Live input state (joystick vectors + held keys), integrated by rAF ─
        // Each vector component is in [-1, 1]; keyboard contributes ±1 additively.
        var jMove = { x: 0, y: 0 };   // MOVE pad
        var jLook = { x: 0, y: 0 };   // LOOK pad
        var keys  = {};               // keyCode → true while held

        function keyMove() {
            var x = 0, y = 0;
            if (keys.KeyA) { x -= 1; } if (keys.KeyD) { x += 1; }   // strafe left/right
            if (keys.KeyW) { y += 1; } if (keys.KeyS) { y -= 1; }   // walk forward/back
            return { x: x, y: y };
        }
        function keyLook() {
            var x = 0, y = 0;
            if (keys.ArrowLeft)  { x -= 1; } if (keys.ArrowRight) { x += 1; }  // spin (roll)
            if (keys.ArrowUp)    { y += 1; } if (keys.ArrowDown)  { y -= 1; }  // pitch
            return { x: x, y: y };
        }

        function anyInputActive() {
            if (jMove.x || jMove.y || jLook.x || jLook.y) { return true; }
            for (var k in keys) { if (keys[k]) { return true; } }
            return false;
        }

        // ── The single rAF integration loop ──────────────────────────────────
        var rafId = null;
        var lastT = 0;
        var nowFn = (typeof performance !== 'undefined' && performance.now)
            ? function () { return performance.now(); } : function () { return Date.now(); };
        var rAF = (typeof requestAnimationFrame === 'function')
            ? requestAnimationFrame : function (cb) { return setTimeout(function () { cb(nowFn()); }, 16); };
        var cAF = (typeof cancelAnimationFrame === 'function')
            ? cancelAnimationFrame : clearTimeout;

        function frame(t) {
            rafId = null;
            var dt = (t - lastT) / 1000;
            lastT = t;
            if (dt <= 0) { dt = 0.016; }
            if (dt > 0.1) { dt = 0.1; }   // clamp long gaps (tab switch)

            var km = keyMove(), kl = keyLook();
            // Combine pad + keyboard, clamped to a unit deflection per channel.
            var lookX = clamp(jLook.x + kl.x, -1, 1);   // spin  (roll, about the view axis)
            var lookY = clamp(jLook.y + kl.y, -1, 1);   // pitch (about screen-right)
            var moveX = clamp(jMove.x + km.x, -1, 1);   // strafe (translation, screen-right)
            var moveY = clamp(jMove.y + km.y, -1, 1);   // walk   (translation, into the picture)

            // STAGE 3 — OBJECT-DRIVE (camera LOCKED). If the runner has an input-drive target,
            // route the sticks to the OBJECT via runner.driveInput (the runner owns the basis
            // math + the clamp) and emit ZERO camera output (no setOrbit, no wheel-dolly) — the
            // presence of the target IS the lock (spec §2b). The camera pair reused verbatim; this
            // is a dumb forwarder (no center/basis/clamp knowledge here). Signs follow the §1
            // convention (LOOK-x → screen x slide, LOOK-y → y lift, MOVE-y → view-forward z
            // push/pull); MOVE-x is unused in drive mode. The on-screen sign confirmation is the
            // tester's named LOOK item (§2b) — flip a term here if a direction reads inverted.
            if (runner && typeof runner.getInputDriveTarget === 'function' && runner.getInputDriveTarget()) {
                if (typeof runner.driveInput === 'function') {
                    runner.driveInput({
                        // SIGN CRITERION (do NOT re-flip without re-reading this): the acceptance
                        // test is stick-direction == CROSSHAIR screen-direction, in ANY camera basis
                        // (docs/internal/engine/DRIVE_FEEDBACK_CONTRACT.md §SIGN CRITERION — do NOT
                        // re-flip without re-reading it). The crosshair is the object's TRUE projected
                        // feedback (a scene reticle at the drive target), so `right` here IS the
                        // camera-basis rightward offset and it projects to screen-right in every basis
                        // by construction — no negation. (The earlier `-lookX` was calibrated against
                        // the camera-BLIND flat marker, which decoupled from the projection at az≠0 and
                        // read inverted at rung 7 az=45; the crosshair dissolves that decoupling.)
                        // LOOK-y (lift) and MOVE (forward = z push/pull, pull=toward camera) were
                        // confirmed correct and are untouched.
                        right:   lookX * driveSpeed * dt,
                        up:      lookY * driveSpeed * dt,
                        forward: moveY * driveSpeed * dt,
                        // ROTATION (B7b) — LOOK's HORIZONTAL also carries a rotate rate (deg/frame,
                        // = lookX × ROT_DRIVE_SPEED × dt). This is a DUMB forwarder: it always sends
                        // `rotate`; the runner CONSUMES it only when the drive target is rotate-capable
                        // (a wall/emitter with setOrientation), and in that case drops the `right`
                        // slide (LOOK-x becomes the aim). MOVE is untouched. deg/sec, NOT
                        // distance-scaled (an angle is zoom-invariant; the runner distance-scales
                        // only the positional terms). The CEO-identified redundancy fix: LOOK-x no
                        // longer duplicates a lateral slide when an object exposes an orientation.
                        rotate:  lookX * ROT_DRIVE_SPEED * dt
                    });
                }
                publishState();   // camera pose unchanged; keep the realm hook fresh
                if (anyInputActive()) { scheduleFrame(); }
                return;
            }

            var o = cam.getOrbit();
            // ── THE FPS SPLIT (CEO 2026-07-26, screen-relative 2026-07-28) ───
            // LOOK = rotation ONLY, and the widget COMPOSES NOTHING: it hands the
            //        provider a screen-relative DELTA (spin about the view axis,
            //        pitch about screen-right) and the ONE camera authority does
            //        the compose -> rotate -> decompose. The old widget-side
            //        `az/el += rate*dt` integration is DELETED: three Euler angles
            //        applied in a fixed order do NOT compose the way successive
            //        screen-relative rotations do, so integrating them here could
            //        not express a rolled pitch at all.
            // MOVE = translation ONLY (y = walk along the view direction, x =
            //        strafe along screen-right). MOVE never contributes rotation —
            //        that was the mis-wire where BOTH pads orbited when grabbed
            //        sideways.
            if (canLook && (lookX || lookY)) {
                cam.look({ spin: lookX * lookSpeed * dt, pitch: lookY * lookSpeed * dt });
            }
            if (moveX || moveY) {
                if (canTranslate) {
                    // SCALE-INVARIANT walk: a step is a FRACTION of how far away the
                    // camera currently is, the same way the presets scale distance to
                    // the scene. A fixed px/sec felt right in one scene and walked
                    // clean out of a smaller one in under two seconds.
                    var step = Math.max(o.distance, 1) * moveRate * dt;
                    cam.move({ forward: moveY * step, strafe: moveX * step });
                } else {
                    // FAIL-SOFT for a provider with no translate primitive: forward/back
                    // still reads as into/out of the picture (a dolly); strafe is a
                    // defined NO-OP rather than a rotation. ONLY distance is written —
                    // the LOOK axes are look()'s business, never smuggled in here.
                    if (moveY) {
                        cam.setOrbit({ distance: clamp(o.distance - moveY * dollySpeed * dt,
                                                       minDist, maxDist) });
                    }
                }
            }
            publishState();

            if (anyInputActive()) { scheduleFrame(); }
        }
        function scheduleFrame() {
            if (rafId === null) { lastT = nowFn(); rafId = rAF(frame); }
        }

        // ── Keyboard ─────────────────────────────────────────────────────────
        var HANDLED_KEYS = {
            ArrowLeft: 1, ArrowRight: 1, ArrowUp: 1, ArrowDown: 1,
            KeyW: 1, KeyA: 1, KeyS: 1, KeyD: 1
        };
        function onKeyDown(e) {
            var code = e.code || e.key;
            if (!HANDLED_KEYS[code]) { return; }
            keys[code] = true;
            if (e.preventDefault) { e.preventDefault(); }   // stop arrow-key page scroll
            scheduleFrame();
        }
        function onKeyUp(e) {
            var code = e.code || e.key;
            if (!HANDLED_KEYS[code]) { return; }
            keys[code] = false;
        }
        if (useKeyboard && kbTarget && kbTarget.addEventListener) {
            kbTarget.addEventListener('keydown', onKeyDown);
            kbTarget.addEventListener('keyup', onKeyUp);
        }

        // ── Canvas focus — so REAL keyboard input reaches this iframe ─────────
        // The experiment page runs INSIDE an iframe. A real, human keydown is only
        // delivered to this window when the iframe holds focus; if the iframe body
        // never receives focus, real arrow/WASD presses fire in the PARENT document
        // and never reach onKeyDown. (The old smoke test passed only because it
        // DISPATCHED synthetic KeyboardEvents straight at window, bypassing focus.)
        // Fix: make the mount focusable and grab focus on attach + on any pointer
        // interaction with the canvas — the natural "click the game canvas, then
        // the keys drive it" behavior. Key delivery still routes through kbTarget
        // (window) via event bubbling once the mount (inside the iframe) is focused.
        var restoreTabIndex = null;
        var onMountPointerDown = null;
        function focusMount() {
            if (mountEl && typeof mountEl.focus === 'function') {
                try { mountEl.focus({ preventScroll: true }); }
                catch (e) { try { mountEl.focus(); } catch (e2) {} }
            }
        }
        if (useKeyboard && mountEl && mountEl.addEventListener) {
            if (typeof mountEl.tabIndex !== 'number' || mountEl.tabIndex < 0) {
                restoreTabIndex = (mountEl.getAttribute && mountEl.hasAttribute && mountEl.hasAttribute('tabindex'))
                    ? mountEl.getAttribute('tabindex') : false;   // false ⇒ no attr to restore
                mountEl.tabIndex = -1;                              // focusable, out of tab order
                if (mountEl.style) { mountEl.style.outline = 'none'; }
            }
            // Capture phase so this fires even when a joystick pad handles the same down.
            onMountPointerDown = function () { focusMount(); };
            mountEl.addEventListener('pointerdown', onMountPointerDown, true);
            focusMount();   // best-effort focus at attach
        }

        // ── On-screen joystick pads ──────────────────────────────────────────
        var padEls = [];
        var padCleanups = [];        // per-pad force-release (used on dispose mid-drag)
        var restoreMountPosition = null;
        var onWheel = null;

        function makePad(side, label, vec) {
            var pad = doc.createElement('div');
            pad.setAttribute('data-role', 'camera-joystick');
            pad.setAttribute('data-stick', side === 'left' ? 'move' : 'look');
            pad.style.cssText =
                'position:absolute;bottom:16px;' + (side === 'left' ? 'left:16px;' : 'right:16px;') +
                'width:96px;height:96px;border-radius:50%;' +
                'background:rgba(20,30,38,0.55);border:1px solid rgba(126,200,227,0.5);' +
                'touch-action:none;z-index:40;box-sizing:border-box;user-select:none;' +
                '-webkit-user-select:none;cursor:grab;';
            var cap = doc.createElement('div');
            cap.textContent = label;
            cap.style.cssText =
                'position:absolute;top:4px;left:0;right:0;text-align:center;' +
                'color:rgba(126,200,227,0.85);font:10px sans-serif;pointer-events:none;';
            var knob = doc.createElement('div');
            knob.setAttribute('data-role', 'camera-joystick-knob');
            knob.style.cssText =
                'position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px 0 0 -17px;' +
                'border-radius:50%;background:rgba(126,200,227,0.85);pointer-events:none;' +
                'transition:transform 0.06s linear;';
            pad.appendChild(cap); pad.appendChild(knob);

            var R = 48;          // pad radius (px); knob travels within it
            var activePointer = null;
            function setFromEvent(e) {
                var rect = pad.getBoundingClientRect();
                var cx = rect.left + rect.width / 2;
                var cy = rect.top + rect.height / 2;
                var dx = (e.clientX - cx);
                var dy = (e.clientY - cy);
                // Normalize to [-1,1]; invert y so "up" is +1 (screen y grows down).
                var nx = clamp(dx / R, -1, 1);
                var ny = clamp(-dy / R, -1, 1);
                vec.x = nx; vec.y = ny;
                knob.style.transform = 'translate(' + (nx * (R - 17)) + 'px,' + (-ny * (R - 17)) + 'px)';
                scheduleFrame();
            }
            // A REAL mouse/touch drag routinely leaves the 96 px pad. Relying on the
            // pad's own pointermove (+ setPointerCapture) is fragile — capture can be
            // silently lost, and without it a pointer outside the pad stops firing pad
            // events, so the drag "dies" and the camera never moves. Instead we track
            // the drag at the DOCUMENT level for its whole lifetime (attached on down,
            // detached on release), which works regardless of where the pointer goes or
            // whether capture is honored. setPointerCapture stays as a harmless bonus.
            var onDocMove = null, onDocUp = null;
            function detachDoc() {
                if (doc && doc.removeEventListener) {
                    if (onDocMove) { doc.removeEventListener('pointermove', onDocMove); }
                    if (onDocUp) {
                        doc.removeEventListener('pointerup', onDocUp);
                        doc.removeEventListener('pointercancel', onDocUp);
                    }
                }
                onDocMove = null; onDocUp = null;
            }
            function release() {
                if (pad.releasePointerCapture && activePointer !== null) {
                    try { pad.releasePointerCapture(activePointer); } catch (err) {}
                }
                activePointer = null;
                vec.x = 0; vec.y = 0;
                knob.style.transform = 'translate(0px,0px)';
                pad.style.cursor = 'grab';
                detachDoc();
            }
            pad.addEventListener('pointerdown', function (e) {
                activePointer = e.pointerId;
                pad.style.cursor = 'grabbing';
                focusMount();   // clicking a joystick focuses the canvas ⇒ keys work too
                if (pad.setPointerCapture) { try { pad.setPointerCapture(e.pointerId); } catch (err) {} }
                // Document-level drag tracking for the life of this gesture.
                onDocMove = function (ev) { if (activePointer === ev.pointerId) { setFromEvent(ev); } };
                onDocUp = function (ev) { if (activePointer === ev.pointerId) { release(); } };
                if (doc && doc.addEventListener) {
                    doc.addEventListener('pointermove', onDocMove);
                    doc.addEventListener('pointerup', onDocUp);
                    doc.addEventListener('pointercancel', onDocUp);
                }
                setFromEvent(e);
                if (e.preventDefault) { e.preventDefault(); }
            });
            padCleanups.push(function () { release(); });
            return pad;
        }

        if (useJoysticks && doc && mountEl) {
            // Anchor pads to mountEl.
            var computed = (typeof window !== 'undefined' && window.getComputedStyle)
                ? window.getComputedStyle(mountEl).position : mountEl.style.position;
            if (computed === 'static' || !computed) {
                restoreMountPosition = mountEl.style.position || '';
                mountEl.style.position = 'relative';
            }
            container = doc.createElement('div');
            container.setAttribute('data-role', 'camera-controls');
            container.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:39;';
            // Pads themselves re-enable pointer events (container passes clicks through
            // to the canvas everywhere else).
            var movePad = makePad('left',  'MOVE', jMove);
            var lookPad = makePad('right', 'LOOK', jLook);
            movePad.style.pointerEvents = 'auto';
            lookPad.style.pointerEvents = 'auto';
            container.appendChild(movePad);
            container.appendChild(lookPad);
            mountEl.appendChild(container);
            padEls = [movePad, lookPad];

            // Wheel/pinch zoom on the mount surface (dolly), independent of the pads.
            if (wheelStep > 0) {
                onWheel = function (e) {
                    // F1 (architect closure condition 1 — the CAMERA LOCK): while an object is
                    // being driven the camera pose is FROZEN, so the wheel-dolly must be inert too
                    // (a mid-drive scroll would move the camera → the accumulated drive offset's
                    // basis diverges from the live basis → the object jumps). The rAF frame() loop
                    // already honors the lock; this handler is a SEPARATE input path and must honor
                    // it identically. Suppress (the object's z is driven by the MOVE stick, §2b).
                    if (runner && typeof runner.getInputDriveTarget === 'function' && runner.getInputDriveTarget()) {
                        if (e.preventDefault) { e.preventDefault(); }
                        return;
                    }
                    var o = cam.getOrbit();
                    var di = clamp(o.distance + (e.deltaY > 0 ? 1 : -1) * wheelStep, minDist, maxDist);
                    cam.setOrbit({ distance: di });
                    publishState();
                    if (e.preventDefault) { e.preventDefault(); }
                };
                mountEl.addEventListener('wheel', onWheel, { passive: false });
            }
        }

        // Publish once so the hook is live immediately (headless can read it
        // before any drive).
        publishState();

        // ── Handle ───────────────────────────────────────────────────────────
        var liveHandle = {
            mounted: true,
            dispose: function () {
                // F4: release the idempotency marker so a later attach() mounts fresh.
                if (mountEl && mountEl.__frqtlCameraHandle === liveHandle) {
                    mountEl.__frqtlCameraHandle = null;
                }
                if (rafId !== null) { cAF(rafId); rafId = null; }
                // Force-release any in-flight joystick drag (detaches its doc listeners).
                for (var i = 0; i < padCleanups.length; i++) {
                    try { padCleanups[i](); } catch (e) {}
                }
                padCleanups = [];
                if (useKeyboard && kbTarget && kbTarget.removeEventListener) {
                    kbTarget.removeEventListener('keydown', onKeyDown);
                    kbTarget.removeEventListener('keyup', onKeyUp);
                }
                if (onMountPointerDown && mountEl && mountEl.removeEventListener) {
                    mountEl.removeEventListener('pointerdown', onMountPointerDown, true);
                }
                if (restoreTabIndex !== null && mountEl) {
                    if (restoreTabIndex === false) {
                        if (mountEl.removeAttribute) { mountEl.removeAttribute('tabindex'); }
                    } else if (mountEl.setAttribute) {
                        mountEl.setAttribute('tabindex', restoreTabIndex);
                    }
                }
                if (onWheel && mountEl && mountEl.removeEventListener) {
                    mountEl.removeEventListener('wheel', onWheel);
                }
                if (container && container.parentNode) { container.parentNode.removeChild(container); }
                if (restoreMountPosition !== null && mountEl) { mountEl.style.position = restoreMountPosition; }
                padEls = [];
                container = null;
            },
            getState: function () { return cam.getOrbit(); },
            setState: function (spec) { cam.setOrbit(spec); publishState(); },
            sync: function () { publishState(); }
        };
        // F4: mark the container as owning this live instance (idempotency guard above).
        if (mountEl) { mountEl.__frqtlCameraHandle = liveHandle; }
        return liveHandle;
    }

    // ── Export ──────────────────────────────────────────────────────────────
    var CameraControls = { attach: attach };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = CameraControls;
    } else if (typeof window !== 'undefined') {
        window.CameraControls = CameraControls;
    }

})();
