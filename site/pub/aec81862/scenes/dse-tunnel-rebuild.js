/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — Double Slit (Tunnel, symmetric)
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung dse-tunnel-rebuild).
 */

// The double slit built on the TUNNEL OBJECT at physical DSE proportions. The two
// slit channels are Tunnels — TWO parallel MIRROR walls (guarded bounce, zero leak) — so
// the slit reflects the beam; the barriers + screen are v2 Walls (destroy / detector-screen
// preset) so the scene round-trips through codegen on Restart. GEOMETRY: SYMMETRIC —
// emitter->front of the slit wall equals back of the slit wall->detector. The near-field
// result is a balanced, central-dominant three-lobe double-slit interference pattern (a
// stochastic near-field walk; the ray-optics λL/d Fraunhofer regime needs L >> d²/λ ≈ 580px,
// larger than a 600px canvas allows).
//
// ONE MODE-AWARE SOURCE (S3/W2, CEO-ratified 2026-07-26; CEO Q21 2026-10-12). The mode strip
// selects the RENDERER the host boots (renderState.renderer), and this scene reads it ONCE,
// before its world: `three` ⇒ exp.createScene (a 3D world), else exp.createCanvas (2D). `IS3D`
// then guards the dimensional deltas — there is NO second (`-3d`) source file:
//   * the emitter opens the z-axis   (is2D:!IS3D → activeAxes.z, a 3D ball of directions);
//   * every barrier / tunnel / detector gains the SAME z-slab (z/depth → a 6-element rect),
//     so the slit wall is a real SLOT-in-a-PLATE and what you SEE is what collides;
//   * two invisible `destroy` z-collimators sit flush OUTSIDE the plate z-band (the
//     cl1a-mirror-3d pattern — the universe z-edge moved inward, the sanctioned
//     experiment-boundary sink), so no quantum can sail BESIDE a plate and read as
//     pass-through, and every alive quantum provably faces the barrier;
//   * the instrument follows the detector's dimensionality: 2D bins hits by y (the 1D
//     fringe histogram, a LiveChart panel); 3D makes the detector a GraphingDetectorWall
//     that paints the SAME hits over its OWN face (y,z), spatially registered — the
//     fringes read as BANDS on the plate, in the place the physics put them.
// The 3D physics is the SAME engine physics (2D≡3D, bench H2a/H2b) — zero new physics.
//
// COLOUR: the beam is YELLOW because it IS a yellow-band beam — the leaves are emitted
// COLOURLESS and the renderer derives their colour from LightColor at their fullness
// (= mass/capacity = 1/wavelength). See the emitter block in the source for the two
// independent dials (band vs pixel wavelength) and why the fringe geometry is unchanged.

function buildExperiment(exp) {
  // Double Slit (Tunnel) — the two slit channels are MIRROR TUNNELS (guarded
  // bounce, zero-leak); the detector sits at the SYMMETRIC distance (emitter->front ==
  // back->detector). X placements are wl-derived (canvas-width-independent); Y is
  // centered on H (groupCenterY = H/2).
  // The booted display (the host's renderState.renderer) decides which world this mode makes.
  var IS3D = (typeof window !== 'undefined' && window.FrqtlDisplay && window.FrqtlDisplay.name() === 'three');
  var CW = 600, H = 400, WORLD_D = 600;   // THE WORLD this scene states (its co-init call below)
  // GEOMETRY and WAVELENGTH are two INDEPENDENT dials, and they are kept apart on
  // purpose: `wl` sizes the PLATE (slit height, gap, wall placement) and nothing else,
  // while `lamPx` is the transverse wavelength in pixels. Doubling lambda must NOT move
  // the slit wall — if one variable drove both, the aperture would silently walk every
  // time the beam was re-tuned and no two runs would be comparable.
  var wl = 64, sh = Math.floor(wl * 0.8), gap = Math.floor(wl * 0.8);   // 51, 51
  var lamPx = 128;                          // the TRANSVERSE wavelength, in pixels
  var groupH = sh + gap + sh;               // 153
  var gcY = H / 2;                          // 300 @ H=600
  var s1Top = gcY - groupH / 2;             // 223.5
  var gapTop = s1Top + sh;                  // 274.5
  var s2Bot = gcY + groupH / 2;             // 376.5
  var s2Top = s2Bot - sh;                   // 325.5
  var srcX = 20;                            // source x (left, near the slit wall)
  var L = wl * 1.5, W = wl;                 // slit-group left 96, width 64 (wall front..back = [96,160])
  // THE DETECTOR LEG, DERIVED FROM THE RING LADDER (zero free parameters).
  // A phase-locked POINT source lays down density rings at r_m = (lambda/4)*sqrt((2m+1)^2+1)
  // measured from the emission point (guide row r3-radius-stall-shells;
  // docs/internal/records/2026-07-30-dse-ring-campaign.md). Each slit exit below
  // IS such a source, so the plate should be placed where
  // a NAMED ring crosses it rather than at a symmetric figure. Put the MIDLINE on ring m=2
  // of BOTH slits: with the exits at +/-halfSep from the midline, that needs a leg of
  //     D = sqrt(r_2^2 - halfSep^2) = sqrt(163.2^2 - 51^2) = 155
  // so the two ring-2 circles intersect exactly on the axis and the centre is DOUBLY
  // reinforced. Rings inside D (m=0 at 45.3, m=1 at 101.2) never reach the plate and
  // contribute no band — a measured property of the ladder, not an assumption.
  // This REPLACES the old symmetric-leg figure, whose own comment made it conditional on
  // the slits becoming directed emitters; the exit gates below are that condition.
  var ringR = function (m) { return (lamPx / 4) * Math.sqrt((2 * m + 1) * (2 * m + 1) + 1); };
  var slitCY1 = s1Top + sh / 2, slitCY2 = s2Top + sh / 2;   // 249, 351 — the bore midlines
  var halfSep = gcY - slitCY1;              // 51
  var detW = 20;                            // the detector plate's own thickness
  var D = Math.round(Math.sqrt(ringR(2) * ringR(2) - halfSep * halfSep));   // 155
  var detX = (L + W) + D;                   // 315
  var linerH = Math.min(10, Math.floor(sh * 0.2)), bore = sh - 2 * linerH;   // 10, 31
  // THE 3D DELTA, in ONE place: the plate z-band. Every barrier / tunnel liner / detector
  // carries the SAME z-slab, so the slit wall is a genuine SLOT IN A PLATE standing in
  // space (the slits are slots long in z — the 2D figure extruded). In 2D the bag is
  // EMPTY, so every Object.assign below is byte-identical to the flat scene.
  var zHalf = Math.round(groupH / 2);                                   // 77 @ wl 64
  var Z3 = IS3D ? { z: -zHalf, depth: 2 * zHalf } : {};
  // THE BEAM'S COLOUR — its own frequency band, never a forced recolor. The emitter
  // emits COLOURLESS leaves (no renderColor arg ⇒ no string_map['render.color']), so the
  // renderer derives the colour from the ONE authority, LightColor, at the leaf's
  // fullness. TWO INDEPENDENT dials produce it, both on the emitter:
  //   fullness  = mass/capacity = 1 / wavelength      -> the spectral BAND (LightColor)
  //   lambda_px = wavelength x wavelengthScale        -> the transverse wave, in PIXELS
  // (wavelengthScale = floor(fundamentalWaveLength / 4)). So the band is chosen by
  // scaling fundamentalWaveLength INVERSELY with the wavelength arg — lambda_px (the
  // fringe geometry) is untouched. 1/3.2 = 0.3125 sits in the YELLOW band; the rung's
  // renderState declares the spectrally correct 'roygbiv' ramp, so the beam renders
  // [255,243,0]. lambda_px = 3.2 x 40 = 128, INDEPENDENT of the 64-derived plate.
  // THIS BEAM IS LIGHT, so the band is free: these leaves are born AT the universe's
  // fundamental dimension (leafDimension == fundamentalDimension == 2), and a leaf at the
  // fundamental ALWAYS steps, P=1, whatever its fullness (bench M1) — the fullness
  // move-gate (bench M2) simply does not apply, and P=1 draws no RNG. Measured on the
  // live detector: the fringe histogram is bin-for-bin the SAME as the (64, 16) tuple
  // (t=30s, 16px profile: 11260 vs 11262 hits, every bin within 1, COM 201.7 both).
  var lamArg = 3.2;                         // fullness 1/3.2 = 0.3125 -> yellow
  var fwl    = 4 * (lamPx / lamArg);        // 160 -> wavelengthScale 40 -> lambda_px = 128
  // The light source — the current SphereEmitter sugar (braided walk), placed at the
  // original source pixel (srcX, gap-center = H/2).
  // is2D:!IS3D opens activeAxes.z — the ball-rejected sampler then draws a 3D BALL of
  // directions (bench S1/S5) instead of the 2D disk.
  // preset 'hemisphere' = 180 degrees of FORWARD emission (D1): the SAME ball-rejected
  // sampler with the forward axis' range halved to [0,R], i.e. the spherical distribution
  // RESTRICTED to the forward half — same physics, pointed one way, so nothing about the
  // walk changes. Forward is +X, which is where the slit wall stands (orientationDeg stays
  // 0), so the half of the burst that used to fly LEFT into the back-scatter sink now goes
  // toward the slits: the same burst size illuminates the aperture roughly twice as hard.
  var SRC = {
    preset: 'hemisphere', is2D: !IS3D, center: [srcX, Math.round(gcY)],
    chargeMode: 'random', wavelength: lamArg, burstSize: 8, emitEveryTicks: 1,
    fundamentalDimension: 2, fundamentalWaveLength: fwl
  };
  // THE WORLD — first, then parts: a 3D scene + universe (600x400x600) or a 2D canvas + universe.
  if (IS3D) { exp.createScene(CW, H, WORLD_D, setupSphereEmitter3D.worldCfg(SRC)); }
  else      { exp.createCanvas(CW, H, setupSphereEmitter3D.worldCfg(SRC)); }
  exp.addObject('SphereEmitter', SRC);
  // Start wall — a plain sink (collisionBehavior:'destroy', [set is_alive=0]) at the
  // left edge, catching back-scatter. It is TRANSPARENT (alpha 40 of 255): the default
  // camera stands BEHIND the emitter, so an opaque slab here would be the first thing in
  // frame and would hide the whole experiment. alpha is a DECLARED Wall field, so codegen
  // captures it and Restart rebuilds the wall just as sheer. Physics is untouched — the
  // sink still destroys every back-scattered quantum (render-only, SU1).
  exp.addObject('Wall', Object.assign({ rect: [0, 0, 10, H] }, Z3, { collisionBehavior: 'destroy', name: 'start_wall', color: [120, 120, 120], alpha: 40 }));
  // Barrier segments — opaque plain sinks (destroy) leaving the two slit gaps.
  exp.addObject('Wall', Object.assign({ rect: [L, 0, W, s1Top - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall1', color: [200, 60, 60] }));
  exp.addObject('Wall', Object.assign({ rect: [L, gapTop, W, gap - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall2', color: [150, 40, 40] }));
  exp.addObject('Wall', Object.assign({ rect: [L, s2Bot, W, (H - s2Bot) - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall3', color: [200, 60, 60] }));
  // The two slit channels as TUNNELS — walls land at the EXACT original liner positions
  // ([L,s1Top,W,10] & [L,s1Top+sh-10,W,10]); the bore is the clear aperture between them.
  // The Tunnel ferries z/depth onto BOTH walls, so a 3D channel is a real corridor.
  // mode 'directed' (D2): the channel walls are no longer mirrors — a wall hit ejects the
  // quantum back into the bore and RE-EMITS it in a uniformly random direction within 180°
  // of the corridor axis (+x here, derived from axis:'x'). That is what makes the slit
  // itself behave as a semi-circular emitter, which is the classical picture of what a
  // slit does to a wavefront — and it supersedes the mirror mode FOR THIS RUNG: a
  // collimating mirror channel preserves the incoming direction, so the two slits could
  // only ever project two beams. Re-emission is what gives each slit its own angular
  // spread to interfere with. Mirror mode stays available on the object (mode:'mirror',
  // still the default) for the waveguide/light-pipe case it was built for.
  // THE TUNNEL IS A CONFIGURED EMITTER (CEO 2026-07-30). The exit gate's flags are not
  // plumbing details — they ARE the emitter vocabulary, one-to-one:
  //   exitRecenter ON  + exitPhaseReset ON  -> a POINT SOURCE (every quantum leaves the
  //        same pixel with the same phase) — what this rung uses, and what makes the ring
  //        ladder sharp: any spread at birth blurs every ring by exactly that spread.
  //   exitRecenter OFF + exitPhaseReset ON  -> an EXTENDED LOCKED APERTURE, the
  //        plane-wave analog (phase-flat across a finite mouth).
  //   mode 'directed' spread                -> the ANGULAR PRESET (here 180 deg about the
  //        corridor axis — the hemisphere preset, expressed at a slit).
  // In 3D the recenter pins the TRANSVERSE axis only, so the slot stays extended in z:
  // each slit is a LINE source and the bands extrude along z — the plate picture.
  // Unifying this with the SphereEmitter preset vocabulary (one owner, ferried — never a
  // second preset list) is a contract design flagged for architect + CEO ratification;
  // this rung uses the existing flags and documents the mapping.
  exp.addObject('Tunnel', Object.assign({ left: L, top: s1Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x' }, Z3, { mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, name: 'slit1_channel', color: [80, 140, 220] }));
  exp.addObject('Tunnel', Object.assign({ left: L, top: s2Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x' }, Z3, { mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, name: 'slit2_channel', color: [80, 140, 220] }));
  // The detector SCREEN — a NON-ABSORBING COUNTING wall ('transparent-probe':
  // collisionBehavior 'nothing' + the count hook) in BOTH modes. This is the
  // |psi|^2-faithful screen: an ABSORBING plate removes each quantum at first contact,
  // so the reading becomes a first-arrival caustic that drifts with the leg D and lands
  // at the WRONG radii; counting WITHOUT absorbing reproduces the ring ladder exactly,
  // because the census at a plane IS the density at that plane. The far-edge sink above bounds the
  // population that now flies past. The KIND follows the detector's dimensionality. In 2D it is a plain Wall and the
  // instrument is the LiveChart y-histogram below. In 3D the detector is a PLATE, so it
  // is a GraphingDetectorWall: it paints its OWN hit grid onto its own faces, spatially
  // REGISTERED (a hot cell sits exactly where the collisions landed) — the wall is the
  // axis, so there is no chart chrome in the scene. Both broad faces carry the map, so it
  // never disappears as you orbit (the back reads as the through-the-window mirror).
  // NOTE: a wall's collided-frame buffer may be drained by ONE consumer per tick — the
  // heatmap painter IS that consumer in 3D, so there is no LiveChart on this wall there.
  // FAR-EDGE SINK. The screen below COUNTS WITHOUT ABSORBING, so quanta fly on past it;
  // this destroy wall at the right edge is the experiment-boundary sink that keeps the
  // population bounded (Invariant 5/7 — only an experiment boundary may destroy).
  exp.addObject('Wall', Object.assign({ rect: [CW - 10, 0, 10, H] }, Z3, { collisionBehavior: 'destroy', name: 'far_sink', color: [120, 120, 120], alpha: 40 }));
  var screen = exp.addObject(IS3D ? 'GraphingDetectorWall' : 'Wall', Object.assign({ rect: [detX, 0, detW, H] }, Z3, { preset: 'transparent-probe', name: 'screen', color: [120, 200, 120] }, IS3D ? { alpha: 220, binPx: 12 } : {}));
  if (IS3D) {
    // SCENE Z-COLLIMATORS — two INVISIBLE full-canvas destroy boundaries flush OUTSIDE
    // the plate z-band (the cl1a-mirror-3d pattern): the emitted ball's z-tail diffuses,
    // and any quantum beyond the plate band would sail BESIDE the barrier and read as
    // pass-through. Clamping the scene to the plate band makes the barrier provably face
    // EVERY alive quantum. 40px deep: un-jumpable (max z step is +/-2/tick).
    exp.addObject('Wall', { rect: [0, 0, CW, H], z: zHalf, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipFar', visible: false });
    exp.addObject('Wall', { rect: [0, 0, CW, H], z: -zHalf - 40, depth: 40,
      collisionBehavior: 'destroy', name: 'zClipNear', visible: false });
    // THE 3D INSTRUMENT IS THE DETECTOR ITSELF (the GraphingDetectorWall above): the
    // hits are binned over the detector FACE (y,z) and painted where they landed, so the
    // interference structure reads as BANDS on the plate — the 2D analog of the 1D peaks,
    // in the place the physics put them. No free-floating chart panel.
    // MOVE/LOOK camera joysticks — the OMNI_3D pattern (FAIL-SOFT no-op in 2D).
    if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {
      var _mount = document.getElementById('canvas-wrapper');
      if (_mount) { window.CameraControls.attach(exp.runner, _mount); }
    }
  } else {
    // THE 2D INSTRUMENT — the LIVE fringe histogram, standing VERTICALLY DIRECTLY
    // BEHIND THE DETECTOR WALL so the bulges sit at the same screen HEIGHT as the hits
    // that produced them (CEO 2026-07-28). The chart is then a readout OF THE WALL,
    // spatially registered, rather than an abstract panel parked elsewhere on the canvas
    // — the same principle the 3D mode already follows, where the detector paints its own
    // hit map on its own faces.
    // REGISTRATION IS DERIVED FROM THE WALL, never from canvas fractions: the panel takes
    // the detector's OWN rect y-origin (0) and height (H), so the two are co-extensive on
    // the bin axis at ANY canvas size, and it starts just past the plate's far face
    // (detX + detW) so it reads as sitting behind it. If those two y extents ever
    // disagree, a bulge lies about where the particle landed — which is worse than no
    // chart at all, and is why this is derived rather than tuned.
    // orientation:90 = horizontal bars stacked along y (the bin axis is the SCREEN
    // VERTICAL). The chart contract reverses the y scale when horizontal, so bin 0 — the
    // SMALLEST y — sits at the TOP, matching the y-DOWN world: the profile runs the same
    // way as the wall beside it.
    // HONEST LIMIT — the bin axis is a CATEGORY axis over the bins that actually received
    // hits (bins are per-pixel y and only occupied ones exist), NOT a linear 0..H axis.
    // So registration is exact in ORDER and DIRECTION always, and exact in ABSOLUTE screen
    // height only insofar as the hits span the wall; a pattern occupying a narrow y band
    // is stretched over the panel's full height. Making it literally linear would need a
    // numeric bin axis in the chart contract — a contract change, deliberately not made
    // here.
    exp.addObject('LiveChart', {
      source: screen, orientation: 90,
      rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],
      series: 'bar', label: 'fringe count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225
    });
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
