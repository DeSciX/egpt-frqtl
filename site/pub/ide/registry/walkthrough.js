/* Copyright 2023-2026 by Essam Abadir */

/**
 * WALKTHROUGH — the ordered "Walk-through" rung registry
 * (ws-experiments-walkthrough Bite 3a; CEO ruling Q-CEO-2 + architect ruling A/B/C;
 * re-authored to addObject form in Bite 4b — architect ruling 3).
 *
 * An ORDERED array of rung recipes surfaced as a "Walk-through" group in STUDIO's
 * experiment dropdown. Each rung loads via the blank-page load-by-eval path exactly
 * like a saved project — the SAME array is the SINGLE authority for BOTH the
 * dropdown group AND the `walkthrough:<id>` lookup (no parallel id→source map, no
 * switch statement — architect condition B).
 *
 * Precedent: `source` is opaque authored DATA the shim ferries and never interprets
 * (exactly like a Module envelope's `source`). Ships automatically via the wholesale
 * lib/shim → dist copy (build.js copyCommon).
 *
 * ── Rung descriptor ──────────────────────────────────────────────────────────
 *   id      : stable dropdown id (the `walkthrough:<id>` selection value)
 *   title   : ordered display label
 *   prose   : one-line declarative description (what it shows, not a journey)
 *   source  : the `buildExperiment(exp)` recipe STRING, eval'd in the iframe.
 *   renderState : OPTIONAL opaque bag (normalizeSavedRenderState shape). The
 *             walkthrough load path ferries it into the SAME `_egptPendingRenderState`
 *             seam the `project:` path uses (E2a shim-owned contract) — renderer/
 *             egpt3D/seed thread as URL overrides (load-time); render options +
 *             camera replay after start. NO new mechanism. Absent → 2D/p5 default.
 *   modes   : OPTIONAL ordered list of named mode entries — `[{ id, label,
 *             renderState? }, …]`. The FIRST entry is the rung's DEFAULT mode.
 *             Absent (or length 1) → a single-mode rung: zero UI, byte-identical
 *             behavior. A mode entry's `renderState` is a DELTA merged over the
 *             rung's base `renderState` by the ONE derivation point,
 *             `effectiveRenderState(rung, modeId)` (below) — never merged by hand
 *             at a call site. The dropdown SELECTION VALUE stays `walkthrough:<id>`
 *             in every mode (a mode is never a second experiment id); STUDIO tracks
 *             the active mode in `project.walkthroughMode` and re-runs the ordinary
 *             walkthrough load path with the effective bag (a reload — the same
 *             pattern as `?engine=`).
 *
 * ── The mode-aware recipe form (S3/W2, CEO-ratified 2026-07-26) ───────────────
 * A multi-mode rung has exactly ONE `source`. The dimensional deltas are guarded
 * lines reading `exp.is3D` — the read-only RecipeContext getter derived from the
 * boot-time owner `window._egpt3D` (which the mode's renderState threads as the
 * `egpt3D=1` URL override). PER-MODE SOURCE STRINGS ARE REJECTED: a second source
 * is the config-mirror anti-pattern this contract exists to kill. Every mode delta
 * must be expressible as DECLARED descriptor fields (emitter `is2D`, Wall/Tunnel
 * `z`/`depth`, ordinary Walls for the z-collimators, camera on the renderState) so
 * a built scene codegens to concrete, mode-PINNED state and survives Restart.
 *
 * ── The recipe form (Bite 4b — addObject, codegen-round-trippable) ────────────
 * Rungs are OBJECT recipes: each body calls `exp.addObject('SphereEmitter', {...})`.
 * The SphereEmitter is a first-class palette object (its ObjectFactory builder
 * self-inits the universe via setupSphereEmitter3D exactly as the old factory-call
 * form did — the recipe does NOT call exp.init). Because the emitter is now a real
 * authored object (a NONE-collision visual marker + the host emit tick-fn), a loaded
 * rung is DRAGGABLE / INSPECTABLE and CODEGEN-ROUND-TRIPPABLE: a STUDIO grab/drag →
 * Save re-emits the SAME addObject recipe (the DX-3 source-verbatim ferry + the
 * per-rung `scripts[]` delta are RETIRED — setupSphereEmitter3D lives in the shared
 * game-layer roster now, so no per-rung script injection is needed). The ferry
 * MECHANISM (the `scripts` envelope field) stays as a general seam; the rungs simply
 * no longer populate it.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * Zero new physics (canonical-bench SU1) — every rung composes already-goldened
 * engine behaviors via the shared sphere-emitter sugar. Each rung un-degenerates ONE
 * already-present input of the previous (theorist Q-THEO-1: strictly compositional).
 * The addObject builder forwards the opts VERBATIM to setupSphereEmitter3D, so the
 * physics/visual is BYTE-IDENTICAL to the pre-Bite-4b factory-call rungs.
 */

'use strict';

// The ONE shim-level renderState normalizer (E2a) — `effectiveRenderState` merges
// through it so a mode bag can never drift from the saved-project bag shape.
import { normalizeSavedRenderState } from '../render-state/index.js';

/**
 * Wrap a recipe body in the standard dual-mode buildExperiment module tail (the
 * SAME shape codegen emits) so the eval'd source installs window.buildExperiment.
 * @param {string} body — the buildExperiment(exp) body (indented statements).
 * @returns {string}
 */
function recipe(body) {
    return (
        'function buildExperiment(exp) {\n' +
        body + '\n' +
        '}\n' +
        "if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }\n" +
        "else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }\n"
    );
}

// ── Shared physics recipe SOURCES (ONE authority per physics setup) ──────────
// The render-variant rungs REFERENCE these consts (never copy-paste) and express
// ONLY a renderState delta — so a future change to a base tuple flows to its
// variants automatically (no config mirror). CEO restructure 2026-07-21.

// The classic self-interference field (Rung 4). Reused VERBATIM by Rung 5
// (Fountain Pool) with only a water renderState delta.
var SELF_INTERFERENCE_SOURCE = recipe(
    "  // The classic self-interference tuple (matches self-interference-preset.png):\n" +
    "  //   dim 2 (capacity 16) + wavelength 32 -> clamped to 16 -> mass 1 (fullness 1/16);\n" +
    "  //   fundamentalWaveLength 64 -> wavelengthScale floor(64/4)=16 -> effective lambda 256px;\n" +
    "  //   chargeMode 'random' -> per-leaf +/- braiding (THE interference);\n" +
    "  //   emissionShell 'surface' + innerR 16 -> RING launch (empty center, sharp bands);\n" +
    "  //   burst 72/tick. Red is DERIVED from fullness 1/16 (ROYGBIV low end), not forced.\n" +
    "  //   Pattern = radial BRAIDED BANDS (not concentric rings).\n" +
    "  var SRC = {\n" +
    "    is2D: true, preset: 'spherical',\n" +
    "    emissionShell: 'surface', innerR: 16,\n" +
    "    fundamentalDimension: 2, wavelength: 32,\n" +
    "    chargeMode: 'random', fundamentalWaveLength: 64,\n" +
    "    burstSize: 72, emitEveryTicks: 1\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', SRC);"
);

// Two self-interference sources ±32px apart (the classic config called TWICE — one
// world, two parts). Reused VERBATIM by Rung 6B (Two Fountains) + 6C (Plasma Fusion)
// — render deltas only.
var TWO_SOURCE_SOURCE = recipe(
    "  // The classic self-interference config called TWICE, centered ±32px from canvas\n" +
    "  // center (64px apart = 1×fundamentalWaveLength, i.e. λ_eff/4 since λ_eff = 4×fWL).\n" +
    "  // The world is init'd ONCE, then TWO parts are constructed on it — no flag, no\n" +
    "  // re-init, no stacking. The\n" +
    "  // lattice BETWEEN the two visible sources is EMERGENT density superposition (SU1).\n" +
    "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
    "  var cx = Math.floor(W / 2), cy = Math.floor(H / 2);\n" +
    "  var CFG = {\n" +
    "    is2D: true, preset: 'spherical',\n" +
    "    emissionShell: 'surface', innerR: 16,\n" +
    "    fundamentalDimension: 2, wavelength: 32,\n" +
    "    chargeMode: 'random', fundamentalWaveLength: 64,\n" +
    "    burstSize: 72, emitEveryTicks: 1\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(CFG));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', Object.assign({}, CFG, { center: [cx - 32, cy] }));\n" +
    "  exp.addObject('SphereEmitter', Object.assign({}, CFG, { center: [cx + 32, cy] }));"
);

// The omni source released into 3D (is2D:false) + the reusable camera joysticks.
var OMNI_3D_SOURCE = recipe(
    "  // is2D:false opens the z-axis: the ball-rejected sampler draws a 3D BALL of\n" +
    "  // directions (bench S1). three renderer + perspective camera come from renderState.\n" +
    "  // CameraControls.attach = reusable FAIL-SOFT joystick sugar (no-op in 2D).\n" +
    "  var SRC = { preset: 'spherical', is2D: false };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', SRC);\n" +
    "  if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {\n" +
    "    var _mount = document.getElementById('canvas-wrapper');\n" +
    "    if (_mount) { window.CameraControls.attach(exp.runner, _mount); }\n" +
    "  }"
);


// ── DSE Lab (CEO 2026-07-24, DSE-rebuild-before-republish; consolidated 2026-07-26)
//    — the photoelectric experiment + THE double-slit, built on the full new
//    component set (SphereEmitter chargeMode random, v2 Walls + presets, in-scene
//    LiveChart). The single canonical double-slit is 2C (on the Tunnel object); the
//    old Light-Lab r9 and DSE 2A double-slit rungs were retired.


// 2B — the photoelectric effect on the new component set (CEO ruling 2026-07-24:
// "leave as is now" = the CURRENT absorb/radiate drip, NO workFunction threshold).
// An incoming light stream charges an ABSORBING Wall (ABSORB v2 real backing-frame mass:
// fills to capacity, then per-tick radiates lower-dimension leaves out its back with
// p=1/capacity, mass conserved). A LiveChart on the absorber's absorb-stats series shows
// stored/absorbed/radiated as the wall charges; a second Detector Screen BEHIND the wall
// counts the RADIATED quanta (the photoelectron detector) — and its own live arrivals chart
// shows them being counted. SU1 — the LO5 absorb/radiate golden, composed, zero new physics.
var DSE_PHOTOELECTRIC_SOURCE = recipe(
    "  // 2B (Photoelectric) — light stream → ABSORB wall (charges + radiates) → a Detector\n" +
    "  // Screen BEHIND counting the radiated photoelectrons. Two live charts: the wall's\n" +
    "  // charge ledger (absorberStats) and the rear detector's arrivals.\n" +
    "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
    "  var cy = Math.round(H / 2);\n" +
    "  // The incoming light stream: a thin +x beam of oppositely-charged dim-2 leaves. A\n" +
    "  // SPARSE flux (1 leaf / 2 ticks) keeps the slow absorb/radiate drip radiation-dominated\n" +
    "  // (a dense beam saturates the wall, which then leaks past it — the deferred emergent-\n" +
    "  // probability threshold would gate that; see 2B prose).\n" +
    "  var SRC = {\n" +
    "    preset: 'particle-walk', is2D: true, center: [Math.round(W * 0.1), cy],\n" +
    "    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,\n" +
    "    burstSize: 1, emitEveryTicks: 2\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', SRC);\n" +
    "  // The absorbing wall (ABSORB v2): charges up to capacity, then radiates lower-dim\n" +
    "  // leaves out its back (mass conserved) — the photocathode.\n" +
    "  var absorber = exp.addObject('Wall', {\n" +
    "    rect: [Math.round(W * 0.45), Math.round(H * 0.25), 20, Math.round(H * 0.5)],\n" +
    "    collisionBehavior: 'absorb', capacity: 64, name: 'absorber', color: [150, 90, 210]\n" +
    "  });\n" +
    "  // The photoelectron detector: a Detector Screen (destroy + count) BEHIND the absorber,\n" +
    "  // counting the radiated quanta that emerge past it.\n" +
    "  var photodetector = exp.addObject('Wall', {\n" +
    "    rect: [Math.round(W * 0.72), Math.round(H * 0.2), 20, Math.round(H * 0.6)],\n" +
    "    preset: 'detector-screen', name: 'photodetector', color: [120, 200, 120]\n" +
    "  });\n" +
    "  // The wall's charge ledger (stored / absorbed / radiated) — the absorb-stats series.\n" +
    "  exp.addObject('LiveChart', {\n" +
    "    source: absorber, projector: 'absorberStats',\n" +
    "    rect: [Math.round(W * 0.04), Math.round(H * 0.03), Math.round(W * 0.32), Math.round(H * 0.28)],\n" +
    "    series: 'bar', label: 'wall charge (stored/absorbed/radiated)', refreshMs: 100, color: [30, 22, 44], alpha: 230\n" +
    "  });\n" +
    "  // The photoelectron count beyond the wall — the rear detector's live arrivals.\n" +
    "  exp.addObject('LiveChart', {\n" +
    "    source: photodetector,\n" +
    "    rect: [Math.round(W * 0.63), Math.round(H * 0.03), Math.round(W * 0.32), Math.round(H * 0.28)],\n" +
    "    series: 'bar', label: 'photoelectrons counted', refreshMs: 100, color: [22, 40, 30], alpha: 230\n" +
    "  });"
);

// The double slit built on the TUNNEL OBJECT at physical DSE proportions. The two
// slit channels are Tunnels — TWO parallel MIRROR walls (guarded bounce, zero leak) — so
// the slit reflects the beam; the barriers + screen are v2 Walls (destroy / detector-screen
// preset) so the scene round-trips through codegen on Restart. GEOMETRY: SYMMETRIC —
// emitter->front of the slit wall equals back of the slit wall->detector. The near-field
// result is a balanced, central-dominant three-lobe double-slit interference pattern (a
// stochastic near-field walk; the ray-optics λL/d Fraunhofer regime needs L >> d²/λ ≈ 580px,
// larger than a 600px canvas allows).
//
// ONE MODE-AWARE SOURCE (S3/W2, CEO-ratified 2026-07-26). `var IS3D = exp.is3D` guards
// the dimensional deltas — there is NO second (`-3d`) source string:
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
var DSE_TUNNEL_REBUILT_SOURCE = recipe(
    "  // Double Slit (Tunnel) — the two slit channels are MIRROR TUNNELS (guarded\n" +
    "  // bounce, zero-leak); the detector sits at the SYMMETRIC distance (emitter->front ==\n" +
    "  // back->detector). X placements are wl-derived (canvas-width-independent); Y is\n" +
    "  // centered on H (groupCenterY = H/2).\n" +
    "  var IS3D = exp.is3D;   // the ONE runtime 3D owner (window._egpt3D), via the recipe facade\n" +
    "  var CW = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
    "  // GEOMETRY and WAVELENGTH are two INDEPENDENT dials, and they are kept apart on\n" +
    "  // purpose: `wl` sizes the PLATE (slit height, gap, wall placement) and nothing else,\n" +
    "  // while `lamPx` is the transverse wavelength in pixels. Doubling lambda must NOT move\n" +
    "  // the slit wall — if one variable drove both, the aperture would silently walk every\n" +
    "  // time the beam was re-tuned and no two runs would be comparable.\n" +
    "  var wl = 64, sh = Math.floor(wl * 0.8), gap = Math.floor(wl * 0.8);   // 51, 51\n" +
    "  var lamPx = 128;                          // the TRANSVERSE wavelength, in pixels\n" +
    "  var groupH = sh + gap + sh;               // 153\n" +
    "  var gcY = H / 2;                          // 300 @ H=600\n" +
    "  var s1Top = gcY - groupH / 2;             // 223.5\n" +
    "  var gapTop = s1Top + sh;                  // 274.5\n" +
    "  var s2Bot = gcY + groupH / 2;             // 376.5\n" +
    "  var s2Top = s2Bot - sh;                   // 325.5\n" +
    "  var srcX = 20;                            // source x (left, near the slit wall)\n" +
    "  var L = wl * 1.5, W = wl;                 // slit-group left 96, width 64 (wall front..back = [96,160])\n" +
    "  // THE DETECTOR LEG, DERIVED FROM THE RING LADDER (zero free parameters).\n" +
    "  // A phase-locked POINT source lays down density rings at r_m = (lambda/4)*sqrt((2m+1)^2+1)\n" +
    "  // measured from the emission point (guide row r3-radius-stall-shells;\n" +
    "  // docs/internal/records/2026-07-30-dse-ring-campaign.md). Each slit exit below\n" +
    "  // IS such a source, so the plate should be placed where\n" +
    "  // a NAMED ring crosses it rather than at a symmetric figure. Put the MIDLINE on ring m=2\n" +
    "  // of BOTH slits: with the exits at +/-halfSep from the midline, that needs a leg of\n" +
    "  //     D = sqrt(r_2^2 - halfSep^2) = sqrt(163.2^2 - 51^2) = 155\n" +
    "  // so the two ring-2 circles intersect exactly on the axis and the centre is DOUBLY\n" +
    "  // reinforced. Rings inside D (m=0 at 45.3, m=1 at 101.2) never reach the plate and\n" +
    "  // contribute no band — a measured property of the ladder, not an assumption.\n" +
    "  // This REPLACES the old symmetric-leg figure, whose own comment made it conditional on\n" +
    "  // the slits becoming directed emitters; the exit gates below are that condition.\n" +
    "  var ringR = function (m) { return (lamPx / 4) * Math.sqrt((2 * m + 1) * (2 * m + 1) + 1); };\n" +
    "  var slitCY1 = s1Top + sh / 2, slitCY2 = s2Top + sh / 2;   // 249, 351 — the bore midlines\n" +
    "  var halfSep = gcY - slitCY1;              // 51\n" +
    "  var detW = 20;                            // the detector plate's own thickness\n" +
    "  var D = Math.round(Math.sqrt(ringR(2) * ringR(2) - halfSep * halfSep));   // 155\n" +
    "  var detX = (L + W) + D;                   // 315\n" +
    "  var linerH = Math.min(10, Math.floor(sh * 0.2)), bore = sh - 2 * linerH;   // 10, 31\n" +
    "  // THE 3D DELTA, in ONE place: the plate z-band. Every barrier / tunnel liner / detector\n" +
    "  // carries the SAME z-slab, so the slit wall is a genuine SLOT IN A PLATE standing in\n" +
    "  // space (the slits are slots long in z — the 2D figure extruded). In 2D the bag is\n" +
    "  // EMPTY, so every Object.assign below is byte-identical to the flat scene.\n" +
    "  var zHalf = Math.round(groupH / 2);                                   // 77 @ wl 64\n" +
    "  var Z3 = IS3D ? { z: -zHalf, depth: 2 * zHalf } : {};\n" +
    "  // THE BEAM'S COLOUR — its own frequency band, never a forced recolor. The emitter\n" +
    "  // emits COLOURLESS leaves (no renderColor arg ⇒ no string_map['render.color']), so the\n" +
    "  // renderer derives the colour from the ONE authority, LightColor, at the leaf's\n" +
    "  // fullness. TWO INDEPENDENT dials produce it, both on the emitter:\n" +
    "  //   fullness  = mass/capacity = 1 / wavelength      -> the spectral BAND (LightColor)\n" +
    "  //   lambda_px = wavelength x wavelengthScale        -> the transverse wave, in PIXELS\n" +
    "  // (wavelengthScale = floor(fundamentalWaveLength / 4)). So the band is chosen by\n" +
    "  // scaling fundamentalWaveLength INVERSELY with the wavelength arg — lambda_px (the\n" +
    "  // fringe geometry) is untouched. 1/3.2 = 0.3125 sits in the YELLOW band; the rung's\n" +
    "  // renderState declares the spectrally correct 'roygbiv' ramp, so the beam renders\n" +
    "  // [255,243,0]. lambda_px = 3.2 x 40 = 128, INDEPENDENT of the 64-derived plate.\n" +
    "  // THIS BEAM IS LIGHT, so the band is free: these leaves are born AT the universe's\n" +
    "  // fundamental dimension (leafDimension == fundamentalDimension == 2), and a leaf at the\n" +
    "  // fundamental ALWAYS steps, P=1, whatever its fullness (bench M1) — the fullness\n" +
    "  // move-gate (bench M2) simply does not apply, and P=1 draws no RNG. Measured on the\n" +
    "  // live detector: the fringe histogram is bin-for-bin the SAME as the (64, 16) tuple\n" +
    "  // (t=30s, 16px profile: 11260 vs 11262 hits, every bin within 1, COM 201.7 both).\n" +
    "  var lamArg = 3.2;                         // fullness 1/3.2 = 0.3125 -> yellow\n" +
    "  var fwl    = 4 * (lamPx / lamArg);        // 160 -> wavelengthScale 40 -> lambda_px = 128\n" +
    "  // The light source — the current SphereEmitter sugar (braided walk), placed at the\n" +
    "  // original source pixel (srcX, gap-center = H/2).\n" +
    "  // is2D:!IS3D opens activeAxes.z — the ball-rejected sampler then draws a 3D BALL of\n" +
    "  // directions (bench S1/S5) instead of the 2D disk.\n" +
    "  // preset 'hemisphere' = 180 degrees of FORWARD emission (D1): the SAME ball-rejected\n" +
    "  // sampler with the forward axis' range halved to [0,R], i.e. the spherical distribution\n" +
    "  // RESTRICTED to the forward half — same physics, pointed one way, so nothing about the\n" +
    "  // walk changes. Forward is +X, which is where the slit wall stands (orientationDeg stays\n" +
    "  // 0), so the half of the burst that used to fly LEFT into the back-scatter sink now goes\n" +
    "  // toward the slits: the same burst size illuminates the aperture roughly twice as hard.\n" +
    "  var SRC = {\n" +
    "    preset: 'hemisphere', is2D: !IS3D, center: [srcX, Math.round(gcY)],\n" +
    "    chargeMode: 'random', wavelength: lamArg, burstSize: 8, emitEveryTicks: 1,\n" +
    "    fundamentalDimension: 2, fundamentalWaveLength: fwl\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', SRC);\n" +
    "  // Start wall — a plain sink (collisionBehavior:'destroy', [set is_alive=0]) at the\n" +
    "  // left edge, catching back-scatter. It is TRANSPARENT (alpha 40 of 255): the default\n" +
    "  // camera stands BEHIND the emitter, so an opaque slab here would be the first thing in\n" +
    "  // frame and would hide the whole experiment. alpha is a DECLARED Wall field, so codegen\n" +
    "  // captures it and Restart rebuilds the wall just as sheer. Physics is untouched — the\n" +
    "  // sink still destroys every back-scattered quantum (render-only, SU1).\n" +
    "  exp.addObject('Wall', Object.assign({ rect: [0, 0, 10, H] }, Z3, { collisionBehavior: 'destroy', name: 'start_wall', color: [120, 120, 120], alpha: 40 }));\n" +
    "  // Barrier segments — opaque plain sinks (destroy) leaving the two slit gaps.\n" +
    "  exp.addObject('Wall', Object.assign({ rect: [L, 0, W, s1Top - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall1', color: [200, 60, 60] }));\n" +
    "  exp.addObject('Wall', Object.assign({ rect: [L, gapTop, W, gap - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall2', color: [150, 40, 40] }));\n" +
    "  exp.addObject('Wall', Object.assign({ rect: [L, s2Bot, W, (H - s2Bot) - 1] }, Z3, { collisionBehavior: 'destroy', name: 'wall3', color: [200, 60, 60] }));\n" +
    "  // The two slit channels as TUNNELS — walls land at the EXACT original liner positions\n" +
    "  // ([L,s1Top,W,10] & [L,s1Top+sh-10,W,10]); the bore is the clear aperture between them.\n" +
    "  // The Tunnel ferries z/depth onto BOTH walls, so a 3D channel is a real corridor.\n" +
    "  // mode 'directed' (D2): the channel walls are no longer mirrors — a wall hit ejects the\n" +
    "  // quantum back into the bore and RE-EMITS it in a uniformly random direction within 180°\n" +
    "  // of the corridor axis (+x here, derived from axis:'x'). That is what makes the slit\n" +
    "  // itself behave as a semi-circular emitter, which is the classical picture of what a\n" +
    "  // slit does to a wavefront — and it supersedes the mirror mode FOR THIS RUNG: a\n" +
    "  // collimating mirror channel preserves the incoming direction, so the two slits could\n" +
    "  // only ever project two beams. Re-emission is what gives each slit its own angular\n" +
    "  // spread to interfere with. Mirror mode stays available on the object (mode:'mirror',\n" +
    "  // still the default) for the waveguide/light-pipe case it was built for.\n" +
    "  // THE TUNNEL IS A CONFIGURED EMITTER (CEO 2026-07-30). The exit gate's flags are not\n" +
    "  // plumbing details — they ARE the emitter vocabulary, one-to-one:\n" +
    "  //   exitRecenter ON  + exitPhaseReset ON  -> a POINT SOURCE (every quantum leaves the\n" +
    "  //        same pixel with the same phase) — what this rung uses, and what makes the ring\n" +
    "  //        ladder sharp: any spread at birth blurs every ring by exactly that spread.\n" +
    "  //   exitRecenter OFF + exitPhaseReset ON  -> an EXTENDED LOCKED APERTURE, the\n" +
    "  //        plane-wave analog (phase-flat across a finite mouth).\n" +
    "  //   mode 'directed' spread                -> the ANGULAR PRESET (here 180 deg about the\n" +
    "  //        corridor axis — the hemisphere preset, expressed at a slit).\n" +
    "  // In 3D the recenter pins the TRANSVERSE axis only, so the slot stays extended in z:\n" +
    "  // each slit is a LINE source and the bands extrude along z — the plate picture.\n" +
    "  // Unifying this with the SphereEmitter preset vocabulary (one owner, ferried — never a\n" +
    "  // second preset list) is a contract design flagged for architect + CEO ratification;\n" +
    "  // this rung uses the existing flags and documents the mapping.\n" +
    "  exp.addObject('Tunnel', Object.assign({ left: L, top: s1Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x' }, Z3, { mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, name: 'slit1_channel', color: [80, 140, 220] }));\n" +
    "  exp.addObject('Tunnel', Object.assign({ left: L, top: s2Top + linerH, length: W, bore: bore, wallThickness: linerH, axis: 'x' }, Z3, { mode: 'directed', exitCollapse: true, exitRecenter: true, exitPhaseReset: true, name: 'slit2_channel', color: [80, 140, 220] }));\n" +
    "  // The detector SCREEN — a NON-ABSORBING COUNTING wall ('transparent-probe':\n" +
    "  // collisionBehavior 'nothing' + the count hook) in BOTH modes. This is the\n" +
    "  // |psi|^2-faithful screen: an ABSORBING plate removes each quantum at first contact,\n" +
    "  // so the reading becomes a first-arrival caustic that drifts with the leg D and lands\n" +
    "  // at the WRONG radii; counting WITHOUT absorbing reproduces the ring ladder exactly,\n" +
    "  // because the census at a plane IS the density at that plane. The far-edge sink above bounds the\n" +
    "  // population that now flies past. The KIND follows the detector's dimensionality. In 2D it is a plain Wall and the\n" +
    "  // instrument is the LiveChart y-histogram below. In 3D the detector is a PLATE, so it\n" +
    "  // is a GraphingDetectorWall: it paints its OWN hit grid onto its own faces, spatially\n" +
    "  // REGISTERED (a hot cell sits exactly where the collisions landed) — the wall is the\n" +
    "  // axis, so there is no chart chrome in the scene. Both broad faces carry the map, so it\n" +
    "  // never disappears as you orbit (the back reads as the through-the-window mirror).\n" +
    "  // NOTE: a wall's collided-frame buffer may be drained by ONE consumer per tick — the\n" +
    "  // heatmap painter IS that consumer in 3D, so there is no LiveChart on this wall there.\n" +
    "  // FAR-EDGE SINK. The screen below COUNTS WITHOUT ABSORBING, so quanta fly on past it;\n" +
    "  // this destroy wall at the right edge is the experiment-boundary sink that keeps the\n" +
    "  // population bounded (Invariant 5/7 — only an experiment boundary may destroy).\n" +
    "  exp.addObject('Wall', Object.assign({ rect: [CW - 10, 0, 10, H] }, Z3, { collisionBehavior: 'destroy', name: 'far_sink', color: [120, 120, 120], alpha: 40 }));\n" +
    "  var screen = exp.addObject(IS3D ? 'GraphingDetectorWall' : 'Wall', Object.assign({ rect: [detX, 0, detW, H] }, Z3, { preset: 'transparent-probe', name: 'screen', color: [120, 200, 120] }, IS3D ? { alpha: 220, binPx: 12 } : {}));\n" +
    "  if (IS3D) {\n" +
    "    // SCENE Z-COLLIMATORS — two INVISIBLE full-canvas destroy boundaries flush OUTSIDE\n" +
    "    // the plate z-band (the cl1a-mirror-3d pattern): the emitted ball's z-tail diffuses,\n" +
    "    // and any quantum beyond the plate band would sail BESIDE the barrier and read as\n" +
    "    // pass-through. Clamping the scene to the plate band makes the barrier provably face\n" +
    "    // EVERY alive quantum. 40px deep: un-jumpable (max z step is +/-2/tick).\n" +
    "    exp.addObject('Wall', { rect: [0, 0, CW, H], z: zHalf, depth: 40,\n" +
    "      collisionBehavior: 'destroy', name: 'zClipFar', visible: false });\n" +
    "    exp.addObject('Wall', { rect: [0, 0, CW, H], z: -zHalf - 40, depth: 40,\n" +
    "      collisionBehavior: 'destroy', name: 'zClipNear', visible: false });\n" +
    "    // THE 3D INSTRUMENT IS THE DETECTOR ITSELF (the GraphingDetectorWall above): the\n" +
    "    // hits are binned over the detector FACE (y,z) and painted where they landed, so the\n" +
    "    // interference structure reads as BANDS on the plate — the 2D analog of the 1D peaks,\n" +
    "    // in the place the physics put them. No free-floating chart panel.\n" +
    "    // MOVE/LOOK camera joysticks — the OMNI_3D pattern (FAIL-SOFT no-op in 2D).\n" +
    "    if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {\n" +
    "      var _mount = document.getElementById('canvas-wrapper');\n" +
    "      if (_mount) { window.CameraControls.attach(exp.runner, _mount); }\n" +
    "    }\n" +
    "  } else {\n" +
    "    // THE 2D INSTRUMENT — the LIVE fringe histogram, standing VERTICALLY DIRECTLY\n" +
    "    // BEHIND THE DETECTOR WALL so the bulges sit at the same screen HEIGHT as the hits\n" +
    "    // that produced them (CEO 2026-07-28). The chart is then a readout OF THE WALL,\n" +
    "    // spatially registered, rather than an abstract panel parked elsewhere on the canvas\n" +
    "    // — the same principle the 3D mode already follows, where the detector paints its own\n" +
    "    // hit map on its own faces.\n" +
    "    // REGISTRATION IS DERIVED FROM THE WALL, never from canvas fractions: the panel takes\n" +
    "    // the detector's OWN rect y-origin (0) and height (H), so the two are co-extensive on\n" +
    "    // the bin axis at ANY canvas size, and it starts just past the plate's far face\n" +
    "    // (detX + detW) so it reads as sitting behind it. If those two y extents ever\n" +
    "    // disagree, a bulge lies about where the particle landed — which is worse than no\n" +
    "    // chart at all, and is why this is derived rather than tuned.\n" +
    "    // orientation:90 = horizontal bars stacked along y (the bin axis is the SCREEN\n" +
    "    // VERTICAL). The chart contract reverses the y scale when horizontal, so bin 0 — the\n" +
    "    // SMALLEST y — sits at the TOP, matching the y-DOWN world: the profile runs the same\n" +
    "    // way as the wall beside it.\n" +
    "    // HONEST LIMIT — the bin axis is a CATEGORY axis over the bins that actually received\n" +
    "    // hits (bins are per-pixel y and only occupied ones exist), NOT a linear 0..H axis.\n" +
    "    // So registration is exact in ORDER and DIRECTION always, and exact in ABSOLUTE screen\n" +
    "    // height only insofar as the hits span the wall; a pattern occupying a narrow y band\n" +
    "    // is stretched over the panel's full height. Making it literally linear would need a\n" +
    "    // numeric bin axis in the chart contract — a contract change, deliberately not made\n" +
    "    // here.\n" +
    "    exp.addObject('LiveChart', {\n" +
    "      source: screen, orientation: 90,\n" +
    "      rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],\n" +
    "      series: 'bar', label: 'fringe count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225\n" +
    "    });\n" +
    "  }"
);

// ── H1 AT THE CANONICAL DETECTOR LEG (CEO 2026-08-03) ────────────────────────
//
// The competence baseline: the most basic thing, done right, seen with eyes. One
// emitter, then two, with the plate PRE-COMPUTED at the leg the ring formula was
// written for and the count-by-y chart registered to that plate. No barrier, no
// slits, no tunnels — nothing between the source and the plate, so a band on the
// chart can have come from nothing but the walk.
//
// WHY THESE EXIST BESIDE `dse-tunnel-rebuild`. That rung places its plate at
// D = 155 px against λ_eff = 128 px — 4.84× the reference leg — which pushes the
// low orders inside the leg where they never reach the plate at all, so only high-m
// rings can land. These two rungs put the plate ON the reference leg instead.
//
// THE GEOMETRY, and it is not re-derived here. λ is the ONLY length; every other
// length below is a dimensionless constant × λ (the `published/dse/scene.js`
// discipline). The ring ladder quoted in CLAUDE.md,
//
//     r_m = (λ/4)·√((2m+1)² + 1)                       [slant, from the emission point]
//
// is the hypotenuse of a right triangle whose TRANSVERSE leg is ρ_m = (2m+1)·λ/4
// and whose AXIAL leg is λ/4 — the "+1" under the root IS the (λ/4)² axial term.
// Solve for the axial leg order by order and every order returns λ/4, so the leg is
// not fitted per-order: it is the one leg the formula was written for. At that leg
// the on-plate bands are ρ_m = (2m+1)·λ/4 from the source's own y, spacing λ/2.
//
// MEASURED, not assumed. `published/dse/h1/` ran exactly this apparatus (bare
// source, plate at D = λ/4 from the emitter, seed 1, detector 'hits') at λ = 160 /
// 320 / 640 and found a symmetric feature on the plate at |Δy| = λ/4 − 4 px — 36 /
// 76 / 156 px — holding that offset to the pixel across a 4× sweep while moving 120
// px in absolute terms. The raw histogram's shape is: a flat PLATEAU across the
// centre, a sharp MINIMUM just inside ±λ/4, and a PEAK riding immediately outside it
// at ±λ/4. At λ=640, counts by Δy/λ: −0.250 → 1107 | −0.225 → 306 | 0.000 → 1011 |
// +0.225 → 297 | +0.250 → 1125. At λ=320 the same shape, shallower. TWO points on
// the wall at ¼ λ_eff, with a plateau — not a hole — between them.
//
// AND THAT IS WHY λ IS 320 HERE. The dip-to-peak separation is 0.025λ: 16 px at
// λ=640, 8 px at λ=320, 4 px at λ=160 — which is why the λ=160 run reads as a broad
// hump with the feature only recoverable by a windowed search on a smoothed profile.
// Below ~λ=300 this stage cannot resolve the thing it exists to show. So this rung
// shows ONE well-resolved band pair per source rather than three mushy ones. The 4 px
// pedestal does NOT scale with λ (it is engine scale — a quantum steps ≤2 px/axis/
// tick) and no mechanism is offered for it here. The m ≥ 1 rungs of the ladder are
// NOT established: of the H1 runs' 8 predicted positions, 3 matched, and the m=1
// positions carried minima.
//
// THE LEG IS ONE NAMED CONSTANT (`legFrac`), and so is the plate's DETECTOR MODE —
// both so they can be moved deliberately from a one-line edit and the consequence
// re-derived, rather than being literals nobody chose.
//
// The beam is the `dse-tunnel-rebuild` beam and the H1 beam, unchanged: wavelength
// arg 3.2 → mass 5 / capacity 16 → fullness 0.3125, which LightColor renders yellow,
// and λ_eff = 3.2 × wavelengthScale. The leaves are emitted COLOURLESS; the colour
// is DERIVED from fullness, never forced.
//
// 2D ONLY, deliberately. There is no `modes` strip and no `exp.is3D` guard: these
// rungs declare one world each. A second dimensional variant would be a separate
// recipe declaration, not a mode.
var CANONICAL_LEG_BODY =
    "  var CW = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;   // 600 x 400 (page-owned)\n" +
    "  // ── THE ONLY LENGTH ─────────────────────────────────────────────────────\n" +
    "  // lamPx is lambda_eff in pixels. 320 is chosen for RESOLUTION, not for how many\n" +
    "  // orders fit: the feature this rung exists to show (the minimum just inside the\n" +
    "  // band and the peak riding outside it) is 0.025*lambda wide, which is 8 px at\n" +
    "  // lambda 320 and 3 px at lambda 128. A stage that cannot separate them shows a\n" +
    "  // smooth hump and leaves you unable to say whether the physics or the sampling\n" +
    "  // was at fault. One well-resolved pair beats three mushy ones.\n" +
    "  var lamPx  = 320;\n" +
    "  var lamArg = 3.2;                       // capacity/mass -> fullness 1/3.2 = 0.3125 (yellow)\n" +
    "  var fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100\n" +
    "  var wlScale = Math.floor(fwl / 4);      // 100\n" +
    "  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {\n" +
    "    throw new Error('[dse-h1] lamPx ' + lamPx + ' is not realisable as lambda_eff: the engine ' +\n" +
    "      'can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');\n" +
    "  }\n" +
    "  // ── THE DETECTOR LEG — ONE NAMED CONSTANT ───────────────────────────────\n" +
    "  // D = legFrac * lambda, measured from the SOURCE (there is no barrier, so the\n" +
    "  // emitter itself is the reference point of the ladder). legFrac = 1/4 is the\n" +
    "  // leg the ring formula was written for; see the block comment above.\n" +
    "  var legFrac = 1 / 4;\n" +
    "  var D    = Math.round(lamPx * legFrac); // 80\n" +
    "  var srcX = Math.round(lamPx / 16);      // 20 — launch room; the canvas edge is the back sink\n" +
    "  var cy   = Math.round(H / 2);           // 200 — the source plane's midline\n" +
    "  var detX = srcX + D;                    // 100 — the plate's FRONT FACE\n" +
    "  // PLATE THICKNESS IS AN OPTICAL CHOICE UNDER A FLUX DETECTOR, not trim. A flux\n" +
    "  // probe counts every tick a quantum overlaps it, so it integrates the density\n" +
    "  // ACROSS its thickness — and the ring crest is a CIRCLE about the source, not a\n" +
    "  // plane. At the m=0 band the crest's slope is dy/dx = -D/y = -1, so a slab t px\n" +
    "  // thick smears the band over ~t px of y. Against an 8 px feature a lambda/8 (40\n" +
    "  // px) plate would guarantee mush. lambda/64 = 5 px keeps the smear sub-feature\n" +
    "  // and is still unjumpable (a quantum steps at most 2 px/axis/tick). A 'hits'\n" +
    "  // plate would not care — it counts at first contact, i.e. at the front face —\n" +
    "  // which is exactly why the reference H1 runs could afford a lambda/8 slab.\n" +
    "  var detW = Math.round(lamPx / 64);      // 5   — plate thickness\n" +
    "  var sinkW = Math.round(lamPx / 16);     // 20  — far-edge sink thickness\n" +
    "  // TWO-SOURCE SEPARATION. Two sources reinforce when their separation is a\n" +
    "  // multiple of lambda/2, and the coupling falls as (lambda/d)^2, so lambda/2 is\n" +
    "  // the strongest case. At this leg it also puts a band of EACH source on the\n" +
    "  // midline y = H/2 (source 1's lower band and source 2's upper band coincide\n" +
    "  // there) — the doubly-reinforced central peak, equidistant from both emitters,\n" +
    "  // exactly where the one-source rung has no peak at all.\n" +
    "  var sep  = lamPx / 2;                   // 160 -> sources at y 120 and 280\n" +
    "  var srcYs = (NSRC === 2) ? [cy - sep / 2, cy + sep / 2] : [cy];\n" +
    "  // ── THE LIGHT SOURCE ────────────────────────────────────────────────────\n" +
    "  // preset 'hemisphere' = 180 degrees of FORWARD (+X) emission: the SAME\n" +
    "  // ball-rejected sampler as the omni source with the forward axis' range halved,\n" +
    "  // so nothing about the walk changes, it is simply pointed at the plate. The\n" +
    "  // default emission box is 0 for this preset, so the source is a single PIXEL —\n" +
    "  // load-bearing, because any spread at birth blurs every band by that spread.\n" +
    "  // NO START WALL: the backward population is empty by construction, and `wrap` is\n" +
    "  // false, so the canvas edge kills whatever transverse wiggle out-runs its\n" +
    "  // forward component. One sink, not two.\n" +
    "  var SRC = {\n" +
    "    preset: 'hemisphere', is2D: true, chargeMode: 'random',\n" +
    "    wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,\n" +
    "    burstSize: 8, emitEveryTicks: 1\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  for (var si = 0; si < srcYs.length; si++) {\n" +
    "    exp.addObject('SphereEmitter', Object.assign({}, SRC, { center: [srcX, Math.round(srcYs[si])] }));\n" +
    "  }\n" +
    "  // FAR-EDGE SINK. The plate below counts WITHOUT removing, so quanta fly on past\n" +
    "  // it; this is the experiment-boundary sink downstream of the plate. It is not\n" +
    "  // load-bearing (wrap is false, so the canvas edge would remove them anyway) — it\n" +
    "  // is where the population bound is STATED rather than inferred.\n" +
    "  exp.addObject('Wall', { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',\n" +
    "    name: 'far_sink', color: [120, 120, 120], alpha: 40 });\n" +
    "  // ── THE PLATE — A COUNTING WALL THAT DOES NOT ABSORB ────────────────────\n" +
    "  // ONE NAMED CONSTANT, so the reading can be swapped in a single edit and the two\n" +
    "  // instruments compared rather than argued about:\n" +
    "  //   'transparent-probe' = collisionBehavior 'nothing' + mark/count. FLUX. The\n" +
    "  //       quantum is counted on every tick it overlaps the plate and then flies on,\n" +
    "  //       so the reading is the OCCUPANCY INTEGRAL at the plate plane — the density\n" +
    "  //       at that plane. This is the shipped choice.\n" +
    "  //   'detector-screen'   = destroy + count. HITS. Each quantum is counted once, at\n" +
    "  //       arrival, and removed: a transit census, the headcount a photographic plate\n" +
    "  //       would report. It is what the H1 reference runs used.\n" +
    "  // NEITHER ABSORBS. 'absorb' stores the arriving mass and re-radiates it — that is\n" +
    "  // the photoelectric experiment, and it saturates.\n" +
    "  var detectorPreset = 'transparent-probe';\n" +
    "  // markTag — the plate's PROVENANCE stamp. The mark hook fires ONLY when the\n" +
    "  // collision trigger does (genuine overlap), whereas the engine buffers every\n" +
    "  // frame inside the LO's mb_w-PADDED search rect whether it triggered or not. So a\n" +
    "  // raw frame count off the buffer is a padded-occupancy reading and the\n" +
    "  // mark-filtered count is the trigger-gated census: two different instruments, and\n" +
    "  // an offline reader needs the tag to tell them apart.\n" +
    "  var screen = exp.addObject('Wall', { rect: [detX, 0, detW, H],\n" +
    "    preset: detectorPreset, markTag: 'plate', name: 'screen', color: [120, 200, 120] });\n" +
    "  // ── THE INSTRUMENT — the live count-by-y histogram, REGISTERED TO THE PLATE ──\n" +
    "  // The panel takes the plate's OWN rect y-origin (0) and height (H), so the two\n" +
    "  // are co-extensive on the bin axis at any canvas size, and it starts just past\n" +
    "  // the plate's far face so it reads as sitting behind it. orientation 90 = bars\n" +
    "  // stacked along y; the chart contract reverses the y scale when horizontal, so\n" +
    "  // bin 0 (the SMALLEST y) sits at the TOP, matching the y-DOWN world.\n" +
    "  // HONEST LIMIT (inherited from the shipped 2D block, and it is real): the bin\n" +
    "  // axis is a CATEGORY axis over the bins that actually received hits, not a linear\n" +
    "  // 0..H axis. Registration is exact in ORDER and DIRECTION always, and exact in\n" +
    "  // absolute screen height only insofar as the hits span the wall. Here the plate\n" +
    "  // is a full-height flux probe under a 180-degree source, so the occupied span\n" +
    "  // fills the wall within a few hundred ticks and the axis is very nearly linear —\n" +
    "  // but the ladder positions below must be read off the raw census, never measured\n" +
    "  // with a ruler on the panel.\n" +
    "  // SERIES 'line', NOT 'bar', AND THAT IS A MEASUREMENT NOT A TASTE. The bins are\n" +
    "  // per-pixel y, so a full-height plate produces ~400 categories in a ~240 px plot:\n" +
    "  // each bar is sub-pixel TALL, its 0.55 fill alpha is diluted by the coverage, and\n" +
    "  // the profile collapses into a faint sliver hugging the axis. Measured identically\n" +
    "  // on the shipped 1C Counting Wall rung, so it is the chart contract's behaviour at\n" +
    "  // this bin count and not something these rungs introduced. A line joins the same 400\n" +
    "  // points into one continuous curve, which reads as the profile it is. CAVEAT, stated\n" +
    "  // because it bites: Chart.js does not begin a LINE value axis at zero, so once the\n" +
    "  // profile's floor rises the curve compresses toward the left edge. Read positions off\n" +
    "  // it, not magnitudes; magnitudes come from getCollisionHistogram().\n" +
    "  exp.addObject('LiveChart', {\n" +
    "    source: screen, orientation: 90,\n" +
    "    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],\n" +
    "    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225\n" +
    "  });";

/**
 * canonicalLegSource(nSources) — the ONE authority for both canonical-leg rungs.
 *
 * The two rungs are the SAME apparatus with a different number of point sources, so
 * they share one body and differ by one declared integer. Writing them as two
 * hand-maintained strings would be a config mirror: the next geometry change would
 * land in one and not the other, and the A/B comparison the pair exists to make
 * would silently stop being an A/B.
 *
 * @param {1|2} nSources — how many point sources the world carries.
 * @returns {string} the buildExperiment(exp) module source.
 */
function canonicalLegSource(nSources) {
    return recipe('  var NSRC = ' + nSources + ';\n' + CANONICAL_LEG_BODY);
}

var DSE_H1_ONE_SOURCE = canonicalLegSource(1);
var DSE_H1_TWO_SOURCE = canonicalLegSource(2);

// ── TWO SLITS AT THE CANONICAL LEG (frqtl-visual-bite, 2026-08-03) ───────────
//
// The SAME apparatus as `dse-two-emitters` — same λ, same separation, same leg,
// same detector, same chart — but the two point sources are now SLIT EXITS in
// an opaque barrier rather than two free emitters. ONE emitter sits behind the
// barrier and feeds BOTH slit channels; each channel is a `directed` Tunnel
// with the exit gate COLLAPSED + PHASE-RESET, exactly the composition
// `dse-tunnel-rebuild` already uses to make a slit's own mouth stand in for a
// point source ("THE TUNNEL IS A CONFIGURED EMITTER", CEO 2026-07-30, see that
// rung's source comment for the flag-by-flag mapping). Composed only: Wall +
// Tunnel, zero new parts, zero engine code.
//
// WHY THE NUMBERS ARE THE SAME AS `dse-two-emitters`. That rung places its two
// SOURCES at y = cy∓sep/2 (120, 280) and its plate at D = λ_eff/4 past the
// SOURCE plane (srcX). Here the slit CENTRES sit at the identical y = 120, 280
// (`sep` unchanged), and the plate sits at the identical D = λ_eff/4 — now
// measured past the SLIT EXIT plane (the barrier's back face), which is this
// apparatus's new "source plane". If the exit gate's point-source claim holds,
// the two apparatuses must draw the SAME picture: a central peak at y = 200
// (source 1's lower band and source 2's upper band coincide there) flanked by
// the outer bands at y = 40 and y = 360 — because nothing about the DERIVATION
// of those positions used "free emitter" anywhere; it only used "point source
// at (x0, y0), phase-locked, λ_eff". A slit exit under `exitPhaseReset` is
// exactly that.
//
// λ_eff, the leg, and the plate/instrument are the CANONICAL_LEG_BODY numbers,
// copied rather than referenced because this rung's body is shaped completely
// differently (a barrier + two Tunnels stand where two bare SphereEmitters
// stood) — there is no shared statement to factor without re-introducing the
// exact config-mirror risk the shared-body helper exists to avoid elsewhere.
// The bare numbers (320 / 3.2 / 400 / 80 / 160) are the SAME numbers, and the
// fail-loud realisability check is repeated verbatim so a future λ edit here
// cannot silently drift from the pair it must match.
var DSE_TWO_SLITS_SOURCE = recipe(
    "  // Two Slits — reproduces dse-two-emitters' picture with the two point sources built\n" +
    "  // as SLIT EXITS in a barrier instead of two free emitters. Barrier = Wall segments\n" +
    "  // (destroy); each slit = a directed Tunnel with the exit gate collapsed + phase-reset\n" +
    "  // (the dse-tunnel-rebuild composition) so the mouth is a phase-locked point source.\n" +
    "  var CW = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;   // 600 x 400\n" +
    "  // ── THE ONLY LENGTH — IDENTICAL to the canonical-leg pair ───────────────\n" +
    "  var lamPx  = 320;\n" +
    "  var lamArg = 3.2;                       // fullness 1/3.2 = 0.3125 -> yellow\n" +
    "  var fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100\n" +
    "  var wlScale = Math.floor(fwl / 4);      // 100\n" +
    "  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {\n" +
    "    throw new Error('[dse-two-slits] lamPx ' + lamPx + ' is not realisable as lambda_eff: the ' +\n" +
    "      'engine can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');\n" +
    "  }\n" +
    "  // ── SLIT SEPARATION — IDENTICAL to dse-two-emitters' source separation ──\n" +
    "  var legFrac = 1 / 4;\n" +
    "  var D    = Math.round(lamPx * legFrac);   // 80 — the SAME leg, now measured from the\n" +
    "                                             // slit EXIT plane, this apparatus's source plane\n" +
    "  var sep  = lamPx / 2;                     // 160 -> slit centres at y 120 and 280 — the\n" +
    "                                             // EXACT y positions dse-two-emitters used\n" +
    "  var cy   = Math.round(H / 2);             // 200\n" +
    "  var slitCY1 = cy - sep / 2, slitCY2 = cy + sep / 2;   // 120, 280\n" +
    "  // ── THE BARRIER — one opaque plate, two slit apertures ──────────────────\n" +
    "  var barrierW = Math.round(lamPx / 8);     // 40 — plate thickness (dimensionless x lamPx,\n" +
    "                                             // an independent dial from the transverse\n" +
    "                                             // wavelength, same discipline as dse-tunnel-rebuild)\n" +
    "  var slitH  = Math.round(lamPx / 8);       // 40 — slit aperture height (before liners)\n" +
    "  var linerH = Math.round(lamPx / 64);      // 5  — liner thickness (unjumpable: max step 2px/tick)\n" +
    "  var bore   = slitH - 2 * linerH;          // 30 — the clear aperture between the liners\n" +
    "  var srcX   = Math.round(lamPx / 16);      // 20 — the emitter, well behind the barrier\n" +
    "  var barrierL = srcX + Math.round(lamPx / 2);   // 180 — half a wavelength of travel room\n" +
    "  var slit1Top = slitCY1 - slitH / 2, slit2Top = slitCY2 - slitH / 2;   // 100, 260\n" +
    "  var exitX  = barrierL + barrierW;         // 220 — the slit EXIT plane (barrier back face)\n" +
    "  var detX   = exitX + D;                   // 300 — SAME leg as dse-two-emitters, now\n" +
    "                                             // measured from the slit exits\n" +
    "  var detW   = Math.round(lamPx / 64);      // 5   — plate thickness (flux probe, sub-feature)\n" +
    "  var sinkW  = Math.round(lamPx / 16);      // 20  — far-edge sink thickness\n" +
    "  // ── THE LIGHT SOURCE — ONE emitter, behind the barrier, lighting BOTH slits ──\n" +
    "  // preset 'hemisphere': 180 degrees of FORWARD emission, aimed at the barrier — the\n" +
    "  // same walk-character (chargeMode/wavelength/fundamentalWaveLength) the slit exits must\n" +
    "  // carry through so the exit's phase-locked point source is at the SAME λ_eff.\n" +
    "  var SRC = {\n" +
    "    preset: 'hemisphere', is2D: true, chargeMode: 'random', center: [srcX, cy],\n" +
    "    wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,\n" +
    "    burstSize: 8, emitEveryTicks: 1\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', SRC);\n" +
    "  // Barrier segments — opaque destroy sinks, leaving the two slit gaps.\n" +
    "  exp.addObject('Wall', { rect: [barrierL, 0, barrierW, slit1Top],\n" +
    "    collisionBehavior: 'destroy', name: 'wall1', color: [200, 60, 60] });\n" +
    "  exp.addObject('Wall', { rect: [barrierL, slit1Top + slitH, barrierW, slit2Top - (slit1Top + slitH)],\n" +
    "    collisionBehavior: 'destroy', name: 'wall2', color: [150, 40, 40] });\n" +
    "  exp.addObject('Wall', { rect: [barrierL, slit2Top + slitH, barrierW, H - (slit2Top + slitH)],\n" +
    "    collisionBehavior: 'destroy', name: 'wall3', color: [200, 60, 60] });\n" +
    "  // The two slit channels — directed Tunnels, exit gate COLLAPSED + PHASE-RESET (the\n" +
    "  // dse-tunnel-rebuild composition): each channel's own mouth stands in for a point\n" +
    "  // source at the slit's own y, phase-locked — what a SphereEmitter would do at that pixel.\n" +
    "  exp.addObject('Tunnel', {\n" +
    "    left: barrierL, top: slit1Top + linerH, length: barrierW, bore: bore,\n" +
    "    wallThickness: linerH, axis: 'x', mode: 'directed',\n" +
    "    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,\n" +
    "    name: 'slit1_channel', color: [80, 140, 220]\n" +
    "  });\n" +
    "  exp.addObject('Tunnel', {\n" +
    "    left: barrierL, top: slit2Top + linerH, length: barrierW, bore: bore,\n" +
    "    wallThickness: linerH, axis: 'x', mode: 'directed',\n" +
    "    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,\n" +
    "    name: 'slit2_channel', color: [80, 140, 220]\n" +
    "  });\n" +
    "  // FAR-EDGE SINK — the same experiment-boundary sink the canonical-leg pair uses.\n" +
    "  exp.addObject('Wall', { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',\n" +
    "    name: 'far_sink', color: [120, 120, 120], alpha: 40 });\n" +
    "  // ── THE PLATE — SAME instrument as the canonical-leg pair: a counting wall that does\n" +
    "  // NOT absorb, at the SAME leg D past the new source plane (the slit exits).\n" +
    "  var screen = exp.addObject('Wall', { rect: [detX, 0, detW, H],\n" +
    "    preset: 'transparent-probe', markTag: 'plate', name: 'screen', color: [120, 200, 120] });\n" +
    "  exp.addObject('LiveChart', {\n" +
    "    source: screen, orientation: 90,\n" +
    "    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],\n" +
    "    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225\n" +
    "  });"
);

// ── ONE SLIT AT THE CANONICAL LEG (frqtl-visual-bite, 2026-08-04) ────────────
//
// The companion arm to `dse-two-slits`: the IDENTICAL apparatus (same emitter, same
// barrier x-position, same slit-1 aperture at y=120, same leg D, same plate, same
// chart) with slit 2 (the y=280 aperture) WALLED OFF — a single opaque barrier
// segment stands where `wall2` + the slit-2 `Tunnel` + `wall3` stood in
// `dse-two-slits`. Nothing else moves: this rung and `dse-two-slits` differ by
// exactly one declared thing — how many apertures the barrier has.
//
// PRE-FLIGHT PREDICTION (recorded before capture; see the ring ladder in
// CANONICAL_LEG_BODY's header comment, and `dse-one-emitter`'s use of the same
// ladder off-centre here): a slit's exit is a phase-locked point source at its own
// y (the `dse-tunnel-rebuild` composition), so with ONLY slit 1 open the surviving
// population is governed by ONE point source at y=120, D=lambda_eff/4=80 past the
// exit plane. Its own ladder (y0 +/- lambda/4, +/- 3*lambda/4, ...) places bands at
// y = 120-80=40, 120+80=200, and (the m=1 term) 120+240=360 -- the m=1 LOWER term
// (120-240=-120) falls off the 400px canvas and does not exist.
//   PREDICTED: three bands at y=40, y=200, y=360; a dip/minimum on either side of
//   each; NO claim about height relative to `dse-two-slits` — degree of
//   reinforcement is a different question this bite does not ask. The claim under
//   test is PRESENCE AND POSITION: does structure appear at all with one aperture,
//   and does it land on this specific off-centre ladder rather than smearing into
//   a single broad structureless lobe centred on y=120 (the naive "single-slit
//   diffraction hump" expectation, which this engine's per-source ring mechanism
//   does NOT predict — if that is what appears instead, it is a real null.)
var DSE_ONE_SLIT_SOURCE = recipe(
    "  // One Slit -- the SAME apparatus as dse-two-slits with slit 2 WALLED OFF. Barrier =\n" +
    "  // Wall segments (destroy); the surviving slit 1 = a directed Tunnel with the exit\n" +
    "  // gate collapsed + phase-reset (identical to dse-two-slits' slit1_channel).\n" +
    "  var CW = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;   // 600 x 400\n" +
    "  // ── THE ONLY LENGTH — IDENTICAL to the canonical-leg pair and dse-two-slits ─────\n" +
    "  var lamPx  = 320;\n" +
    "  var lamArg = 3.2;                       // fullness 1/3.2 = 0.3125 -> yellow\n" +
    "  var fwl    = 4 * (lamPx / lamArg);      // 400 -> wavelengthScale floor(400/4) = 100\n" +
    "  var wlScale = Math.floor(fwl / 4);      // 100\n" +
    "  if (Math.abs(lamArg * wlScale - lamPx) > 1e-9) {\n" +
    "    throw new Error('[dse-one-slit] lamPx ' + lamPx + ' is not realisable as lambda_eff: the ' +\n" +
    "      'engine can only produce wavelengthArg x floor(fwl/4) = ' + (lamArg * wlScale) + '. (FAIL-LOUD.)');\n" +
    "  }\n" +
    "  // ── SLIT 1's POSITION — IDENTICAL to dse-two-slits' slit-1 aperture ─────────────\n" +
    "  // sep is kept only to DERIVE slitCY1 at the exact same y dse-two-slits used (120) —\n" +
    "  // there is no slit 2 in this rung, so it is never used to place a second aperture.\n" +
    "  var legFrac = 1 / 4;\n" +
    "  var D    = Math.round(lamPx * legFrac);   // 80 — the SAME leg, measured from the\n" +
    "                                             // (single) slit EXIT plane\n" +
    "  var sep  = lamPx / 2;                     // 160 — dse-two-slits' source separation,\n" +
    "                                             // reused ONLY to derive slit 1's y below\n" +
    "  var cy   = Math.round(H / 2);             // 200\n" +
    "  var slitCY1 = cy - sep / 2;               // 120 — IDENTICAL y to dse-two-slits' slit 1\n" +
    "  // ── THE BARRIER — one opaque plate, ONE slit aperture (slit 2 walled off) ───────\n" +
    "  var barrierW = Math.round(lamPx / 8);     // 40 — plate thickness\n" +
    "  var slitH  = Math.round(lamPx / 8);       // 40 — slit aperture height (before liners)\n" +
    "  var linerH = Math.round(lamPx / 64);      // 5  — liner thickness (unjumpable: max step 2px/tick)\n" +
    "  var bore   = slitH - 2 * linerH;          // 30 — the clear aperture between the liners\n" +
    "  var srcX   = Math.round(lamPx / 16);      // 20 — the emitter, well behind the barrier\n" +
    "  var barrierL = srcX + Math.round(lamPx / 2);   // 180 — half a wavelength of travel room\n" +
    "  var slit1Top = slitCY1 - slitH / 2;       // 100 -- slit 1 spans y 100..140\n" +
    "  var exitX  = barrierL + barrierW;         // 220 — the slit EXIT plane (barrier back face)\n" +
    "  var detX   = exitX + D;                   // 300 — SAME leg as dse-two-slits\n" +
    "  var detW   = Math.round(lamPx / 64);      // 5   — plate thickness (flux probe, sub-feature)\n" +
    "  var sinkW  = Math.round(lamPx / 16);      // 20  — far-edge sink thickness\n" +
    "  // ── THE LIGHT SOURCE — ONE emitter, behind the barrier, lighting the one slit ───\n" +
    "  var SRC = {\n" +
    "    preset: 'hemisphere', is2D: true, chargeMode: 'random', center: [srcX, cy],\n" +
    "    wavelength: lamArg, fundamentalDimension: 2, fundamentalWaveLength: fwl,\n" +
    "    burstSize: 8, emitEveryTicks: 1\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', SRC);\n" +
    "  // Barrier segments — opaque destroy sinks, leaving ONE slit gap (slit 1 only). Where\n" +
    "  // dse-two-slits had wall2 (a short strip between the two slits) + a slit-2 Tunnel +\n" +
    "  // wall3 (below slit 2), this rung has ONE solid wall from slit 1's bottom liner all\n" +
    "  // the way to the far edge — slit 2's aperture is WALLED, not narrowed or moved.\n" +
    "  exp.addObject('Wall', { rect: [barrierL, 0, barrierW, slit1Top],\n" +
    "    collisionBehavior: 'destroy', name: 'wall1', color: [200, 60, 60] });\n" +
    "  exp.addObject('Wall', { rect: [barrierL, slit1Top + slitH, barrierW, H - (slit1Top + slitH)],\n" +
    "    collisionBehavior: 'destroy', name: 'wall2_blocked_slit2', color: [150, 40, 40] });\n" +
    "  // The one surviving slit channel — directed Tunnel, exit gate COLLAPSED + PHASE-RESET\n" +
    "  // (the dse-tunnel-rebuild composition): its own mouth stands in for a point source at\n" +
    "  // y=120, phase-locked — what a SphereEmitter would do at that pixel.\n" +
    "  exp.addObject('Tunnel', {\n" +
    "    left: barrierL, top: slit1Top + linerH, length: barrierW, bore: bore,\n" +
    "    wallThickness: linerH, axis: 'x', mode: 'directed',\n" +
    "    exitCollapse: true, exitRecenter: true, exitPhaseReset: true,\n" +
    "    name: 'slit1_channel', color: [80, 140, 220]\n" +
    "  });\n" +
    "  // FAR-EDGE SINK — the same experiment-boundary sink the canonical-leg pair uses.\n" +
    "  exp.addObject('Wall', { rect: [CW - sinkW, 0, sinkW, H], collisionBehavior: 'destroy',\n" +
    "    name: 'far_sink', color: [120, 120, 120], alpha: 40 });\n" +
    "  // ── THE PLATE — SAME instrument as dse-two-slits: a counting wall that does NOT\n" +
    "  // absorb, at the SAME leg D past the new source plane (the one slit exit).\n" +
    "  var screen = exp.addObject('Wall', { rect: [detX, 0, detW, H],\n" +
    "    preset: 'transparent-probe', markTag: 'plate', name: 'screen', color: [120, 200, 120] });\n" +
    "  exp.addObject('LiveChart', {\n" +
    "    source: screen, orientation: 90,\n" +
    "    rect: [detX + detW + 8, 0, Math.max(60, CW - (detX + detW + 8) - 8), H],\n" +
    "    series: 'line', label: 'count by y', refreshMs: 100, color: [24, 32, 46], alpha: 225\n" +
    "  });"
);

// LASER BUILD-UP (D4, CEO 2026-07-29: "It will be the build up of a Laser") — the three
// components of a laser assembled one at a time on top of the earlier Light Lab rungs:
//   1. a GAIN SOURCE   — the hemisphere emitter (rung 3's omni source, restricted forward)
//   2. a RESONANT BORE — the directed corridor, which re-aims every wall hit forward
//   3. an OUTPUT COUPLER — the exit gate, optionally collapsing the mouth to a point and
//      optionally re-phase-locking what leaves it
// The two exit flags are INDEPENDENT and both live, which is what lets the rung separate
// "does the point source matter?" from "does coherence matter?".
//
// SINGLE AUTHORITY: the emitter + tunnel configs come from `setupTunnelPointExit.sceneSpec()`
// — the SAME pure function the standalone `tunnel-point-exit` page's factory consumes. The
// rung is the addObject form (so STUDIO can select and edit the objects); the page is the
// slider-driven form. They share the numbers rather than each hand-carrying a copy.
var LASER_BUILDUP_SOURCE = recipe(
    "  // Laser Build-Up — gain source + resonant bore + output coupler.\n" +
    "  // Geometry and per-leaf creation conditions come from the ONE scene-spec authority,\n" +
    "  // setupTunnelPointExit.sceneSpec(), so this rung and the standalone page cannot drift.\n" +
    "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
    "  if (typeof setupTunnelPointExit === 'undefined' || !setupTunnelPointExit.sceneSpec) {\n" +
    "    throw new Error('[laser-buildup] setupTunnelPointExit.js is not loaded (game-layer roster). (FAIL-LOUD.)');\n" +
    "  }\n" +
    "  var spec = setupTunnelPointExit.sceneSpec({\n" +
    "    canvasW: W, canvasH: H,\n" +
    "    tunnelLength: 240,        // REBUILD-class: corridor geometry, re-authored not dragged\n" +
    "    wavelengthScale: 16,      // eff lambda 256px — the self-interference golden's own regime\n" +
    "    exitRecenter: true,       // output coupler collapses the mouth to a point\n" +
    "    exitPhaseReset: false     // coherence OFF by default — turning it ON is the experiment\n" +
    "  });\n" +
    "  // 1. THE GAIN SOURCE — a hemisphere emitter just inside the input mouth, so the whole\n" +
    "  //    burst is aimed down the bore instead of half of it escaping backwards.\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(spec.emitter));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', spec.emitter);\n" +
    "  // 2+3. THE BORE AND THE OUTPUT COUPLER — one directed Tunnel carrying the exit gate.\n" +
    "  //    mode 'directed': every wall hit re-emits forward within 180 degrees of the axis.\n" +
    "  //    exitRecenter / exitPhaseReset are the two coupler flags, both live in the Inspector.\n" +
    "  exp.addObject('Tunnel', spec.tunnel);"
);

// The sun — the 3D omni POINT source at the sun.png panel-visible regime (CEO
// 2026-07-21, supersedes the bare r-code-a-sun reuse for THIS rung). Panel knobs:
//   dim 2, virtual mass 16 (mass/cap 16/16, fullness 1 — the density driver, ~25012
//   activeQuanta) via wavelength arg 1 (mass = max(1, capacity 16 / 1) = 16, verified
//   vs the factory clamp); λ scale (wavelengthScale) 16 via fundamentalWaveLength 64
//   (waveLengthMultiplier = max(1, floor(64/4)) = 16 → eff λ (16/16)×16 = 16px); emit
//   every 1. force-red OFF (no color), water OFF, source-mesh OFF. FX ride the renderState.
var SUN_SOURCE = recipe(
    "  // Rung 8 (Sun) — the sun.png panel regime: a 3D omni POINT source, virtual mass 16\n" +
    "  // (fullness 1) via wavelength:1, λ scale 16 via fundamentalWaveLength:64, emit every 1.\n" +
    "  // The sphere shape + god-rays + glow FX ride the renderState (three-only capabilities).\n" +
    "  // The sun's yellow is the NATURAL fullness->color (mass=capacity, fullness 1); no forced color.\n" +
    "  var SRC = {\n" +
    "    preset: 'spherical', emissionBoxSide: 0, is2D: false,\n" +
    "    chargeMode: 'random', fundamentalDimension: 2,\n" +
    "    wavelength: 1, fundamentalWaveLength: 64, emitEveryTicks: 1\n" +
    "  };\n" +
    "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
    "  exp.addObject('SphereEmitter', SRC);\n" +
    "  if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {\n" +
    "    var _mount = document.getElementById('canvas-wrapper');\n" +
    "    if (_mount) { window.CameraControls.attach(exp.runner, _mount); }\n" +
    "  }"
);

// ── Shared render-variant renderState deltas ─────────────────────────────────
// All ride the SAME filter.<name>->setFilterActive / setRenderOption ControlBind
// dispatch a saved project's renderState uses (E2a/S6 seam; p5 supplies the filters).

// Fountain-pool: hide particles + water shader (Rung 5, Rung 6B).
var WATER_RENDER_STATE = {
    render: [
        { key: 'renderBaseCanvas', value: false },
        { key: 'filter.water', value: true }
    ]
};
// Plasma fusion: particles ON + water + additive bloom on the live field (Rung 6C).
var PLASMA_RENDER_STATE = {
    render: [
        { key: 'renderBaseCanvas', value: true },
        { key: 'filter.water', value: true },
        { key: 'filter.bloom', value: true }
    ]
};
// 3D: three renderer + perspective camera (renderer/egpt3D thread as URL overrides).
var THREE_RENDER_STATE = {
    renderer: 'three', egpt3D: true,
    camera: { orbit: null, preset: 'rooftop' }
};
// Sun: 3D + the FINAL FX bag EXACTLY as the CEO played + captured it in his export
// session (new_sun.png, the primary oracle; sun.png stays the historical dense
// reference). Camera + render values are verbatim from his exported renderState.
var SUN_RENDER_STATE = {
    renderer: 'three', egpt3D: true,
    camera: { orbit: { azimuth: 32.978, elevation: 45, distance: 2873.68 }, preset: null },
    render: [
        { key: 'shape', value: 'sphere' },
        { key: 'colorScheme', value: 'warmcool' },
        { key: 'godrays', value: 1.08 },
        { key: 'godrayDensity', value: 1.085 },
        { key: 'glowIntensity', value: 0.93 },
        { key: 'heat', value: 0.35 },
        { key: 'smoke', value: 0 }
    ]
};

/** @type {Array<{id:string, title:string, prose:string, source:string, renderState?:object}>} */
export var WALKTHROUGH = [
    {
        id:    'r1-straight-walk',
        title: '1 · Straight Walk',
        prose: 'A collimated line of quanta drifts steadily along +X, each carrying a small ' +
               'always-armed transverse ripple (λ=16) — the walk in its simplest form.',
        source: recipe(
            "  // Rung 1 — deterministic +X drift (particle-walk preset pins vx=[R,R], vy=vz=0)\n" +
            "  // with the tiny always-armed transverse coin. Born AT the fundamental (dim 0)\n" +
            "  // so it is 'light' — steps every tick (fast straight drift).\n" +
            "  var SRC = { preset: 'particle-walk', is2D: true };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);"
        )
    },
    {
        id:    'r2-wave',
        title: '2 · Wave',
        prose: 'The same straight walk, but the transverse coin is given leverage — the ripple ' +
               'grows into a visible snake as each leaf oscillates with a longer wavelength.',
        source: recipe(
            "  // Rung 2 — Rung 1 + raise the leaf dimension to 2 (WAVELENGTH_DEMO_DIMENSION):\n" +
            "  // wavelength is a NO-OP at dim 0 (capacity=1 saturates mass), so raising the\n" +
            "  // fundamental gives the wavelength arg leverage. wavelength:8 -> mass 2 ->\n" +
            "  // transverse period grows from ~16px (Rung 1) to a visible ~128px snake.\n" +
            "  var SRC = {\n" +
            "    preset: 'particle-walk', is2D: true,\n" +
            "    fundamentalDimension: 2, wavelength: 8\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);"
        )
    },
    {
        id:    'r3-omni-source',
        title: '3 · Omni Source',
        prose: 'Release the walk in every direction at once — a single point source spraying an ' +
               'even disk of quanta (the sun). Mixed-axis momentum un-degenerates the direction sampler.',
        source: recipe(
            "  // Rung 3 — full dispersion: the spherical preset draws (vx,vy) across the whole\n" +
            "  // ball; in 2D the ball-rejected sampler collapses to an even DISK of directions\n" +
            "  // (bench S5). One omni point source = the sun disk.\n" +
            "  var SRC = { preset: 'spherical', is2D: true };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);"
        )
    },
    {
        id:    'r4-self-interference',
        title: '4 · Self-Interference',
        prose: 'A single omni source of oppositely-charged quanta launched from a ring — the ' +
               'overlapping charged walks braid into radial bands of light and dark, an interference ' +
               'pattern with no wave equation.',
        source: SELF_INTERFERENCE_SOURCE
    },
    {
        // POSITION IS THE CEO'S CALL (flagged, not decided silently). Placed here because
        // Self-Interference is its closest physics sibling — the same banded fan, reached by
        // building an apparatus instead of by launching an omni source. Using the letter-suffix
        // idiom the 6A/6B/6C rungs already establish, so NO existing rung is renumbered.
        // Moving it (e.g. to the end, after Sun) is a one-line array move.
        id:    'r4b-laser-buildup',
        title: '4B · Laser Build-Up',
        prose: 'A laser, assembled from parts you have already met. A GAIN SOURCE — rung 3\'s omni ' +
               'emitter, restricted to a forward half-fan — fires into a RESONANT BORE whose walls ' +
               're-aim every hit forward instead of reflecting it, and the beam leaves through an ' +
               'OUTPUT COUPLER at the far mouth. The coupler has two independent switches: RECENTER ' +
               'collapses every exiting quantum onto the bore\'s mid-line, making the mouth a single ' +
               'point source; PHASE RESET re-locks the ensemble\'s oscillation so equal-radius quanta ' +
               'share a phase again. Recentering alone gives you the geometry of rung 4; adding phase ' +
               'gives you its coherence. Sweep the two switches against the wavelength and the bore ' +
               'length: at long wavelengths the mouth is already nearly in phase and the bands appear ' +
               'on their own, while at short ones the fan reads smooth until you switch phase on. ' +
               'Nothing here is a wave equation — it is the same charged walk, aimed and re-timed.',
        source: LASER_BUILDUP_SOURCE
    },
    {
        id:    'r5-fountain-pool',
        title: '5 · Fountain Pool',
        prose: 'The SAME self-interference field, worn as water — particles hidden and the water ' +
               'shader on. The light field and the water field are the same emergent wave, a ' +
               'different lens (the fractal aha).',
        // SAME physics as Rung 4 (references SELF_INTERFERENCE_SOURCE) — render delta only.
        source: SELF_INTERFERENCE_SOURCE,
        renderState: WATER_RENDER_STATE
    },
    {
        id:    'r6a-two-source',
        title: '6A · Two Sources',
        prose: 'Two independent self-interference sources, ±32px apart — their overlapping charged ' +
               'walks form an interference lattice between them: pure density superposition of two ' +
               'IID populations, interference without a wave equation.',
        source: TWO_SOURCE_SOURCE
    },
    {
        id:    'r6b-two-fountains',
        title: '6B · Two Fountains',
        prose: 'The two-source lattice worn as water — two fountains whose ripple fields overlap ' +
               'into the same interference web, painted by the water shader with the particles hidden.',
        // SAME physics as Rung 6A (references TWO_SOURCE_SOURCE) — render delta only.
        source: TWO_SOURCE_SOURCE,
        renderState: WATER_RENDER_STATE
    },
    {
        id:    'r6c-plasma-fusion',
        title: '6C · Plasma Fusion',
        prose: 'The two-source field lit as plasma — particles ON, water surface, and an additive ' +
               'bloom, so the two colliding charged streams read as a fusing plasma core.',
        // SAME physics as Rung 6A (references TWO_SOURCE_SOURCE) — render delta only.
        source: TWO_SOURCE_SOURCE,
        renderState: PLASMA_RENDER_STATE
    },
    {
        id:    'r7-3d',
        title: '7 · 3D',
        prose: 'The omni source released into all three dimensions — a true 3D ball of quanta ' +
               'rendered with three.js, orbit-able with the mouse or the on-screen camera joysticks.',
        source: OMNI_3D_SOURCE,
        renderState: THREE_RENDER_STATE
    },
    {
        id:    'r8-sun',
        title: '8 · Sun',
        prose: 'The finale — the 3D omni point source dressed as a star: a dense (mass-16, fullness-1) ' +
               'warm-cool glowing core with volumetric god-rays and a shimmer of heat. The same walk ' +
               'that drew the pool, now the sun.',
        source: SUN_SOURCE,
        renderState: SUN_RENDER_STATE
    },
    // ── Collision Lab (CEO 2026-07-23, W1 drive) — the wall-collision primitives,
    //    built on the first-class v2 Wall. Scaffolds for interactive tuning (drag /
    //    rotate / select / save): the CEO drives them to confirm the base object +
    //    control behaviors work bug-free. SU1 — the Walls add zero physics.
    {
        id:    'cl1a-mirror',
        title: '1A · Mirror',
        group: 'Collision Lab',
        prose: 'The first true routing demo: a LASER — a genuinely collimated +x beam (the ' +
               'tightest emission the emitter supports: pure +x momentum, a single charge, no ' +
               'wavelength-scale spreading) — fires into a rotatable mirror. The mirror compiles ' +
               'the real reflection law: a surface tilted to θ deflects the beam by 2θ (standard ' +
               'optics), so at 45° the thin beam exits straight up. ROTATE the mirror (the ' +
               'orientation slider, or LOOK-x in 3D) and the thin reflected beam steers live. The ' +
               'tilted mirror face is drawn inside a faint outline — the honest collision ' +
               'catch-zone (the broad-phase AABB now covers the whole rotated slab).',
        source: recipe(
            "  // Collision Lab 1A (Mirror) — a collimated LASER aimed at a rotatable Bounce/Reflect\n" +
            "  // Wall. LASER TUNING (CEO 2026-07-25): particle-walk pins PURE +x momentum (the\n" +
            "  // tightest constrained-angle the emitter supports — zero angular spread); a SINGLE\n" +
            "  // (positive) charge removes the random transverse braiding; wavelength 1 → the\n" +
            "  // minimal transverse wiggle; fundamentalWaveLength 4 → wavelengthScale 1 (the\n" +
            "  // 256px scale-spread REMOVED — that spray was the 'visually non-sensical' look);\n" +
            "  // a TINY burst (2/tick) keeps it a thin beam (frame-rate protection). Rotate the\n" +
            "  // mirror to steer the reflected beam: 45 -> straight-up exit, 30 -> R(120) exit.\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var cy = Math.round(H / 2);\n" +
            "  var SRC = {\n" +
            "    preset: 'particle-walk', is2D: true, center: [Math.round(W * 0.12), cy],\n" +
            "    orientationDeg: 0, chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,\n" +
            "    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  exp.addObject('Wall', {\n" +
            "    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],\n" +
            "    collisionBehavior: 'bounce', bounceDirection: 'reflect',\n" +
            "    orientationDeg: 45, name: 'mirror', color: [255, 120, 0], hooks: ['recolor']\n" +
            "  });"
        )
    },
    {
        id:    'cl1b-absorbing-wall',
        title: '1B · Absorbing Wall',
        group: 'Collision Lab',
        prose: 'A wall that ABSORBS the quanta into its OWN real mass — it fills as it soaks up ' +
               'arrivals, stops at capacity, and slowly radiates the stored mass back out as ' +
               'lower-dimension leaves. Mass is exactly conserved (the blackbody absorb/re-emit).',
        source: recipe(
            "  // Collision Lab 1B (Absorbing Wall) — ABSORB v2 (Track A): the wall LO is backed by\n" +
            "  // a REAL leaf frame; a host tick-fn tallies the killed masses into it + radiates.\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var cy = Math.round(H / 2);\n" +
            "  var SRC = {\n" +
            "    preset: 'spherical', is2D: true, center: [Math.round(W * 0.15), cy],\n" +
            "    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,\n" +
            "    burstSize: 24, emitEveryTicks: 1\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  exp.addObject('Wall', {\n" +
            "    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],\n" +
            "    collisionBehavior: 'absorb', capacity: 64,\n" +
            "    name: 'absorber', color: [150, 90, 210]\n" +
            "  });"
        )
    },
    {
        id:    'cl1c-counting-wall',
        title: '1C · Counting Wall',
        group: 'Collision Lab',
        prose: 'A detector screen — the Detector Screen preset (destroy + count) tallies every ' +
               'arrival by position. A LIVE in-scene chart (a first-class LiveChart object placed ' +
               'beside the detector) plots the running y→count histogram as the sim runs — the ' +
               'chart reads wall.getCollisionHistogram between ticks and accumulates on-screen. ' +
               'This is the basis for the double-slit fringe readout. The chart panel is a plain ' +
               'render-only object: drag it, resize it, or point it at any counting wall.',
        source: recipe(
            "  // Collision Lab 1C (Counting Wall) — the Detector Screen preset (destroy + count),\n" +
            "  // with a LIVE in-scene LiveChart of the running y-histogram placed beside it.\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var cy = Math.round(H / 2);\n" +
            "  var SRC = {\n" +
            "    preset: 'spherical', is2D: true, center: [Math.round(W * 0.15), cy],\n" +
            "    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,\n" +
            "    burstSize: 24, emitEveryTicks: 1\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  var screen = exp.addObject('Wall', {\n" +
            "    rect: [Math.round(W * 0.6), 0, 20, H],\n" +
            "    preset: 'detector-screen', name: 'screen', color: [120, 200, 120]\n" +
            "  });\n" +
            "  // The interactive counting demo: a live chart of the detector's histogram,\n" +
            "  // placed to the RIGHT of the screen (past where the quanta are absorbed).\n" +
            "  exp.addObject('LiveChart', {\n" +
            "    source: screen,\n" +
            "    rect: [Math.round(W * 0.66), Math.round(H * 0.08), Math.round(W * 0.28), Math.round(H * 0.5)],\n" +
            "    series: 'bar', label: 'arrivals by y', refreshMs: 100, color: [24, 32, 46]\n" +
            "  });"
        )
    },
    {
        id:    'cl1d-mirror-route',
        title: '1D · Mirror Loop (10-mirror {10/3} star)',
        group: 'Collision Lab',
        prose: 'The explanatory centerpiece: a single 2-PARTICLE-WIDE laser threads a CLOSED ' +
               'TEN-MIRROR {10/3} STAR and LOOPS FOREVER — m1→m2→…→m10→m1→… with no exit. Ten ' +
               'tall/thin mirrors sit at the vertices of a regular decagon; each mirror\'s tilt is ' +
               'solved from its incoming/outgoing chords so the reflected centre-line hits the next ' +
               'mirror exactly, and by the star\'s symmetry the tenth leg feeds straight back into ' +
               'the first — the polygon closes on itself. Each mirror is a DIFFERENT colour and, on ' +
               'collision, TAGS the beam with its own colour (its drawn colour = its identity): so a ' +
               'particle\'s colour history IS its bounce sequence — red after m1, orange after m2, … ' +
               'magenta after m10, then red again as it re-enters the loop (a pkg-node colour-transition ' +
               'proof shows the dominant next-colour after m_k is m_{k+1} for all ten, closing the ring). ' +
               'Reflection off the DRAWN face is the standard-optics 2θ law (the swept-OBB face ' +
               'collision), ten times over, no wave equation. Because the loop has no sink, the beam ' +
               'never leaves — an INVISIBLE full-canvas background Wall (nothing + count hook) counts ' +
               'the live population every tick (its per-tick collided frames ARE the live quanta), and ' +
               'the emitter\'s DECLARED emission gate (emissionCap + gateCounter, the blackbody pattern ' +
               'compiled at construction) reads THAT counter to pause emission at the cap and resume ' +
               'below it, so the population plateaus and FPS stays healthy while the circuit runs ' +
               'indefinitely — and the gate survives Restart (it is captured descriptor DATA, not ' +
               'recipe code). Two live charts: laps accumulating at m1 (its COUNT hook) and the live ' +
               'population against its live cap (the background counter, liveCount projector).',
        source: recipe(
            "  // Collision Lab 1D (Mirror Circuit) — a CLOSED {10/3} STAR BILLIARD (CEO 2026-07-25):\n" +
            "  // a 2-particle-wide laser loops m1→m2→…→m10→m1 FOREVER. Ten mirrors at the vertices of\n" +
            "  // a regular decagon; each tilt solved from its in/out chords so the reflected centre-\n" +
            "  // line hits the next mirror, and the star's symmetry closes the tenth leg back into the\n" +
            "  // first. Each mirror tags the beam with its own colour (recolor hook) → the beam re-\n" +
            "  // colours every bounce. No detector: the loop has no exit. The emitter's DECLARED\n" +
            "  // emission gate (emissionCap/gateCounter — the blackbody pattern as captured descriptor\n" +
            "  // DATA) keeps the population bounded so FPS stays healthy, Restart-safe.\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var f = Math.min(W, H) / 600;\n" +
            "  // R 225·f (loop-polish, CEO 2026-07-25 — was 150·f): a BIGGER ring. Adjacent decagon\n" +
            "  // vertices sit 2R·sin18° ≈ 0.618R apart vs slab height ~110·f, so at 225·f the mirrors\n" +
            "  // separate with clear gaps (at 150·f they nearly touched). Fit: R + rotated-slab\n" +
            "  // half-diagonal (≈55·f) stays inside min(W,H)/2 with margin.\n" +
            "  var CX = Math.round(W / 2), CY = Math.round(H / 2), R = Math.round(225 * f), HOP = 3, ROT = 12;\n" +
            "  // CAP 6400 / burst 8 (CEO 2026-07-25 brightness retune — 8x the 800 cap, 4x the\n" +
            "  // burst): a VERY BRIGHT braid. The cap is LIVE-controllable off the population\n" +
            "  // counter (select 'population' in Layers → Inspector 'Population Gate').\n" +
            "  var SW = Math.max(10, Math.round(14 * f)), SH = Math.max(70, Math.round(110 * f)), CAP = 6400;\n" +
            "  // Each mirror a DIFFERENT colour = its identity (a red→magenta rainbow); the recolor\n" +
            "  // hook stamps that colour onto every particle it reflects (string_map['render.color']).\n" +
            "  var PAL = [[255,60,60],[255,140,0],[255,220,0],[150,230,40],[40,210,90],[0,210,190],[0,170,255],[70,90,255],[150,70,235],[235,50,190]];\n" +
            "  // Hit-order vertices of the {10/3} star (m1..m10 named IN the order the beam visits them).\n" +
            "  var order = []; for (var k = 0; k < 10; k++) { order.push((k * HOP) % 10); }\n" +
            "  var D2R = Math.PI / 180;\n" +
            "  var vpos = function (v) { var a = (v * 36 + ROT) * D2R; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };\n" +
            "  var pos = order.map(vpos);\n" +
            "  var deg = function (a) { return ((a * 180 / Math.PI) % 360 + 360) % 360; };\n" +
            "  var angOf = function (p, q) { return deg(Math.atan2(q[1] - p[1], q[0] - p[0])); };\n" +
            "  // Per-mirror orientation from the in/out chords: ori = (in+out−180)/2, branch chosen so\n" +
            "  // the engine reflect law out = 180 + 2·ori − in reproduces the outgoing chord exactly.\n" +
            "  var ORI = [];\n" +
            "  for (var j = 0; j < 10; j++) {\n" +
            "    var pr = pos[(j + 9) % 10], cu = pos[j], nx = pos[(j + 1) % 10];\n" +
            "    var inA = angOf(pr, cu), outA = angOf(cu, nx);\n" +
            "    var o = (((inA + outA - 180) / 2) % 360 + 360) % 360;\n" +
            "    var op = ((180 + 2 * o - inA) % 360 + 360) % 360;\n" +
            "    if (Math.abs(((op - outA + 540) % 360) - 180) > 0.5) { o = (o + 90) % 360; }\n" +
            "    ORI.push(o);\n" +
            "  }\n" +
            "  // The NARROW STRAIGHT-WALK laser (CEO 2026-07-25 exemplar ruling): the SAME emitter\n" +
            "  // as Rung 1 (Straight Walk) — preset 'particle-walk' + is2D, every walk-character\n" +
            "  // field INHERITED from the same factory defaults (chargeMode 'positive', dim 0 =\n" +
            "  // 'light' P=1, fundamentalWaveLength 64 → the λ16 braided transverse ripple) — with\n" +
            "  // ONLY the deliberate loop deltas: (a) a 2px source line (emissionBoxSide 2 vs r1's\n" +
            "  // default 10 — a NARROWER version of the same band, not a point), (b) seated on the\n" +
            "  // m10→m1 leg JUST CLEAR of m10 (70·f past its vertex > the rotated-slab half-diagonal\n" +
            "  // ≈55·f) and aimed along the leg (the longest clear throw: leg 1.618R ≈ 364·f), (c) a\n" +
            "  // small burst (8/tick — the CEO's 4x brightness retune of the original 2), and (d) the\n" +
            "  // DECLARED emission gate below. The old\n" +
            "  // wavelength:1/fundamentalWaveLength:4 overrides flattened the ripple to the λ4 floor\n" +
            "  // (a braid-less dribble) — deleted: the loop beam must READ as Straight Walk, narrower.\n" +
            "  var pS = pos[9], p0 = pos[0];\n" +
            "  var dx = p0[0] - pS[0], dy = p0[1] - pS[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;\n" +
            "  var emit = [Math.round(pS[0] + 70 * f * ux), Math.round(pS[1] + 70 * f * uy)];\n" +
            "  // EMISSION-CAP GATE as DECLARED DATA (CEO ruling 05c98e1f — the blackbody-thermostat\n" +
            "  // pattern): emissionCap + gateCounter compile at CONSTRUCTION into a host tick-fn\n" +
            "  // reading Wall.getLiveCount on the background counter named 'population' (placed\n" +
            "  // below — the by-name reference resolves lazily on the first tick). The closed loop\n" +
            "  // has NO sink, so the gate pauses emission at the cap and resumes below it: the\n" +
            "  // population plateaus and FPS stays healthy. Restart-safe: codegen captures the two\n" +
            "  // fields and the rebuilt emitter recompiles the gate (no free recipe tick-fn).\n" +
            "  var SRC = {\n" +
            "    preset: 'particle-walk', is2D: true, center: emit, orientationDeg: angOf(pS, p0),\n" +
            "    emissionBoxSide: 2, burstSize: 8,\n" +
            "    emissionCap: CAP, gateCounter: 'population'\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  // The ten mirrors at the star vertices — each its own colour + the recolor tag; m1 also\n" +
            "  // carries a COUNT hook so the live chart can read laps at the first mirror.\n" +
            "  var m1 = null;\n" +
            "  for (var i = 0; i < 10; i++) {\n" +
            "    var p = pos[i];\n" +
            "    var w = exp.addObject('Wall', {\n" +
            "      rect: [Math.round(p[0] - SW / 2), Math.round(p[1] - SH / 2), SW, SH],\n" +
            "      collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[i],\n" +
            "      name: 'm' + (i + 1), color: PAL[i], hooks: (i === 0 ? ['recolor', 'count'] : ['recolor'])\n" +
            "    });\n" +
            "    if (i === 0) { m1 = w; }\n" +
            "  }\n" +
            "  // BACKGROUND POPULATION COUNTER (loop-polish B, CEO 2026-07-25 — the canonical\n" +
            "  // objects approach): an INVISIBLE full-canvas Wall with collisionBehavior 'nothing'\n" +
            "  // + the count hook. Every live leaf inside its rect collides (intersects trigger)\n" +
            "  // every tick, so its per-tick collided-frame count (Wall.getLiveCount, bench LO7\n" +
            "  // mechanics) IS the live population — the ONE 'how many live' authority. Counting\n" +
            "  // never moves/kills/recolors a frame: zero physics (SU1).\n" +
            "  var popWall = exp.addObject('Wall', {\n" +
            "    rect: [0, 0, W, H], collisionBehavior: 'nothing', hooks: ['count'],\n" +
            "    name: 'population', visible: false\n" +
            "  });\n" +
            "  // Live chart of LAPS at m1 (its count hook) — observability of the infinite loop\n" +
            "  // (the bounce tally at the first mirror keeps climbing as the beam circulates).\n" +
            "  exp.addObject('LiveChart', {\n" +
            "    source: m1,\n" +
            "    rect: [Math.round(W * 0.72), Math.round(H * 0.04), Math.round(W * 0.25), Math.round(H * 0.2)],\n" +
            "    series: 'bar', label: 'laps at m1', refreshMs: 100, color: [24, 32, 46]\n" +
            "  });\n" +
            "  // Live chart of the POPULATION (the same counter LO the gate reads, via the\n" +
            "  // liveCount projector). The '(cap N)' suffix is DERIVED at render time from the\n" +
            "  // emitter's LIVE emissionCap (truth-in-labeling — never a hardcoded literal).\n" +
            "  exp.addObject('LiveChart', {\n" +
            "    source: popWall, projector: 'liveCount',\n" +
            "    rect: [Math.round(W * 0.03), Math.round(H * 0.04), Math.round(W * 0.22), Math.round(H * 0.18)],\n" +
            "    series: 'bar', label: 'live quanta', refreshMs: 100, color: [24, 32, 46]\n" +
            "  });"
        )
    },
    // ── Collision Lab · 3D (Z2, CEO UX-pass 2026-07-24) — 1A/1B/1C driven in a 3D scene:
    //    a VOLUMETRIC (is2D:false) emitter + a 3D WALL SLAB (depth → a real z-slab, rendered
    //    as a BoxGeometry) + the THREE renderer/perspective camera (renderState). The walls'
    //    z-slabs CONTAIN z=0 (near<0<far) so the beam/spray — emitted at z=0 — collides. The
    //    reflect/absorb/count physics is the SAME as the 2D rungs (SU1); only the render layer
    //    and the wall's z-extent change (2D≡3D). Drive with LOOK/orbit (the W0 3D camera).
    {
        id:    'cl1a-mirror-3d',
        title: '1A · Mirror (3D)',
        group: 'Collision Lab · 3D',
        prose: 'The mirror in a 3D scene, FACE-ON: a directional +x beam hits a mirror SLAB ' +
               '(a box you can orbit around) square on its drawn face and bounces STRAIGHT BACK ' +
               '— beam in, recolored beam out along the same line, nothing continuing past the ' +
               'plate, from every camera angle (an actual mirror). Orbit (LOOK/drag) to see the ' +
               'retro-reflection in three dimensions; ROTATE the mirror (the orientation slider) ' +
               'to steer the exit by the same 2θ law as the 2D mirror (a 3D AABB wireframe shows ' +
               'the honest collision catch-zone when tilted) — identical physics, now a box in ' +
               'space (2D≡3D).',
        source: recipe(
            "  // Collision Lab 1A · 3D — a collimated LASER (particle-walk pins PURE +x in 2D AND\n" +
            "  // 3D) into a 3D mirror SLAB (depth → z-slab containing z=0), rendered as a box;\n" +
            "  // orbit to view. Same LASER tuning as the 2D 1A (CEO 2026-07-25): single positive\n" +
            "  // charge, wavelength 1, wavelengthScale 1 (fundamentalWaveLength 4), tiny burst.\n" +
            "  // FACE-ON default (CEO drive ruling 2026-07-26): orientation 0 presents the full\n" +
            "  // drawn face to the beam → retro-reflection (beam straight back, recolored) — the\n" +
            "  // one mirror visual that reads correctly from EVERY camera azimuth. (A tilted\n" +
            "  // default's L-shaped 2th exit is correct optics but its mirror-flipped projection\n" +
            "  // reads as pass-through from presets that view the xy-plane from behind — measured:\n" +
            "  // zero leaves ever behind the face; the read was projection handedness, not physics.)\n" +
            "  // Rotate the orientation slider to steer: 45 -> straight up, 30 -> R(120), etc.\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var cy = Math.round(H / 2);\n" +
            "  var SRC = {\n" +
            "    preset: 'particle-walk', is2D: false, center: [Math.round(W * 0.15), cy],\n" +
            "    chargeMode: 'positive', fundamentalDimension: 2, wavelength: 1,\n" +
            "    fundamentalWaveLength: 4, burstSize: 2, emitEveryTicks: 1\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  exp.addObject('Wall', {\n" +
            "    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],\n" +
            "    z: -80, depth: 160,\n" +
            "    collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: 0,\n" +
            "    name: 'mirror', color: [255, 120, 0], hooks: ['recolor']\n" +
            "  });\n" +
            "  // SCENE Z-COLLIMATOR (CEO drive ruling 2026-07-26 — 'the z is letting things\n" +
            "  // pass through, not reflect'): the beam's z-tail DIFFUSES over time (measured:\n" +
            "  // |z| at the wall trending 68 of the 80 rim within seconds), and any quantum\n" +
            "  // beyond the plate's z-band would sail BESIDE the plate — reading as pass-\n" +
            "  // through from rooftop. Two INVISIBLE full-canvas destroy boundaries flush with\n" +
            "  // the plate's z-band clamp the scene to the mirror's face: the universe z-edge\n" +
            "  // moved inward (the sanctioned experiment-boundary sink, same as 2D strays\n" +
            "  // dying at the canvas edge) — so the mirror provably faces EVERY alive quantum\n" +
            "  // and nothing can ever appear past the plate. 40px deep: un-jumpable (max z\n" +
            "  // step is ±2/tick).\n" +
            "  exp.addObject('Wall', { rect: [0, 0, W, H], z: 80, depth: 40,\n" +
            "    collisionBehavior: 'destroy', name: 'zClipFar', visible: false });\n" +
            "  exp.addObject('Wall', { rect: [0, 0, W, H], z: -120, depth: 40,\n" +
            "    collisionBehavior: 'destroy', name: 'zClipNear', visible: false });"
        ),
        renderState: THREE_RENDER_STATE
    },
    {
        id:    'cl1b-absorbing-wall-3d',
        title: '1B · Absorbing Wall (3D)',
        group: 'Collision Lab · 3D',
        prose: 'The absorbing wall as a 3D slab: a volumetric (spherical) source sprays quanta in ' +
               'three dimensions into a wall SLAB that absorbs them into its own real mass, fills ' +
               'to capacity, and radiates lower-dimension leaves back out — mass exactly conserved. ' +
               'Orbit the camera to watch the spray soak into the box from every angle (2D≡3D).',
        source: recipe(
            "  // Collision Lab 1B · 3D — a volumetric (spherical) source into a 3D ABSORB wall\n" +
            "  // slab (z-slab centered on 0 so the 3D spray collides); orbit the camera to view.\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var cy = Math.round(H / 2);\n" +
            "  var SRC = {\n" +
            "    preset: 'spherical', is2D: false, center: [Math.round(W * 0.15), cy],\n" +
            "    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,\n" +
            "    burstSize: 24, emitEveryTicks: 1\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  exp.addObject('Wall', {\n" +
            "    rect: [Math.round(W * 0.6), Math.round(H * 0.2), 20, Math.round(H * 0.6)],\n" +
            "    z: -80, depth: 160,\n" +
            "    collisionBehavior: 'absorb', capacity: 64,\n" +
            "    name: 'absorber', color: [150, 90, 210]\n" +
            "  });"
        ),
        renderState: THREE_RENDER_STATE
    },
    {
        id:    'cl1c-counting-wall-3d',
        title: '1C · Counting Wall (3D)',
        group: 'Collision Lab · 3D',
        prose: 'The detector screen as a 3D slab with a live in-scene chart: a volumetric source ' +
               'sprays into a Detector Screen SLAB (destroy + count); a first-class LiveChart panel ' +
               '— placed in the scene beside the detector — plots the running arrivals as the sim ' +
               'runs, textured into the 3D view. Orbit to see the detector box and its chart in ' +
               'space (the basis for a 3D fringe readout).',
        source: recipe(
            "  // Collision Lab 1C · 3D — a volumetric source into a 3D Detector Screen slab\n" +
            "  // (destroy+count) + a LIVE in-scene chart, textured in three; orbit to view.\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var cy = Math.round(H / 2);\n" +
            "  var SRC = {\n" +
            "    preset: 'spherical', is2D: false, center: [Math.round(W * 0.15), cy],\n" +
            "    chargeMode: 'random', fundamentalDimension: 2, wavelength: 32,\n" +
            "    burstSize: 24, emitEveryTicks: 1\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  var screen = exp.addObject('Wall', {\n" +
            "    rect: [Math.round(W * 0.6), 0, 20, H], z: -80, depth: 160,\n" +
            "    preset: 'detector-screen', name: 'screen', color: [120, 200, 120]\n" +
            "  });\n" +
            "  exp.addObject('LiveChart', {\n" +
            "    source: screen,\n" +
            "    rect: [Math.round(W * 0.66), Math.round(H * 0.08), Math.round(W * 0.28), Math.round(H * 0.5)],\n" +
            "    series: 'bar', label: 'arrivals by y', refreshMs: 100, color: [24, 32, 46]\n" +
            "  });"
        ),
        renderState: THREE_RENDER_STATE
    },
    {
        id:    'cl1d-mirror-route-3d',
        title: '1D · Mirror Loop (3D)',
        group: 'Collision Lab · 3D',
        prose: 'The ten-mirror {10/3} star as a REAL 3D scene: the same closed loop — a thin ' +
               'laser threading m1→m2→…→m10→m1 forever — with every mirror now a 3D SLAB (a ' +
               'square plate with real depth) standing at its decagon vertex, in-plane tilts ' +
               'identical to the 2D loop (2D≡3D: the reflection law and the ring geometry are ' +
               'the SAME physics, plus a z-axis). The volumetric (is2D:false) laser braids in y ' +
               'AND z; each slab\'s z-depth catches the braid — its tilted xy faces reflect by ' +
               'the 2θ law (vz passes through) and its near/far z-faces bounce vz (the z-face ' +
               'completion), so no mirror passes the beam. Each mirror tags the beam with its own ' +
               'colour on reflection — the beam legs recolor per bounce, closing the colour ring. ' +
               'ORBIT the camera (LOOK/drag or the az/el sliders) to see the ring as plates in ' +
               'space; z-strays exit between the slabs and die at the universe z-boundary, and ' +
               'the emitter\'s DECLARED emission gate (emissionCap + gateCounter on the invisible ' +
               'full-volume population counter) plateaus the population so the circuit runs ' +
               'indefinitely at healthy FPS. Two live charts: laps at m1 and live quanta vs cap.',
        source: recipe(
            "  // Collision Lab 1D · 3D (Mirror Loop) — the {10/3} STAR BILLIARD as a real 3D\n" +
            "  // scene (3D-mirrors bite, 2026-07-25). SAME ring geometry + tilts + gate as the 2D\n" +
            "  // loop (2D≡3D); the deltas are exactly: (a) every mirror is a 3D SLAB (z/depth →\n" +
            "  // a real z-slab centered on the beam plane z=0, rendered as a BoxGeometry plate),\n" +
            "  // (b) the laser is VOLUMETRIC (is2D:false — braids in y AND z; the slab depth\n" +
            "  // catches the z-braid; z-strays die at the universe z-boundary like xy strays at\n" +
            "  // the canvas edge), (c) the population counter Wall carries a z-slab covering the\n" +
            "  // WHOLE universe z-band so getLiveCount stays the one live-population authority,\n" +
            "  // (d) MOVE/LOOK camera joysticks attached (the OMNI_3D pattern).\n" +
            "  var W = exp.runner.canvas_rect.w, H = exp.runner.canvas_rect.h;\n" +
            "  var f = Math.min(W, H) / 600;\n" +
            "  var CX = Math.round(W / 2), CY = Math.round(H / 2), R = Math.round(225 * f), HOP = 3, ROT = 12;\n" +
            "  var SW = Math.max(10, Math.round(14 * f)), SH = Math.max(70, Math.round(110 * f)), CAP = 6400;\n" +
            "  // SD — the slab z-depth: a 2:1 tile (twice the slab height, z-centered on the\n" +
            "  // beam plane). The scene z-collimator below clamps ALL quanta to this band, so\n" +
            "  // every mirror provably faces every alive quantum (CEO drive ruling 2026-07-26).\n" +
            "  var SD = 2 * SH;\n" +
            "  var PAL = [[255,60,60],[255,140,0],[255,220,0],[150,230,40],[40,210,90],[0,210,190],[0,170,255],[70,90,255],[150,70,235],[235,50,190]];\n" +
            "  var order = []; for (var k = 0; k < 10; k++) { order.push((k * HOP) % 10); }\n" +
            "  var D2R = Math.PI / 180;\n" +
            "  var vpos = function (v) { var a = (v * 36 + ROT) * D2R; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };\n" +
            "  var pos = order.map(vpos);\n" +
            "  var deg = function (a) { return ((a * 180 / Math.PI) % 360 + 360) % 360; };\n" +
            "  var angOf = function (p, q) { return deg(Math.atan2(q[1] - p[1], q[0] - p[0])); };\n" +
            "  // Per-mirror IN-PLANE tilt from the in/out chords (identical to the 2D loop —\n" +
            "  // orientation is z-axis rotation; the slab depth adds NO new angle).\n" +
            "  var ORI = [];\n" +
            "  for (var j = 0; j < 10; j++) {\n" +
            "    var pr = pos[(j + 9) % 10], cu = pos[j], nx = pos[(j + 1) % 10];\n" +
            "    var inA = angOf(pr, cu), outA = angOf(cu, nx);\n" +
            "    var o = (((inA + outA - 180) / 2) % 360 + 360) % 360;\n" +
            "    var op = ((180 + 2 * o - inA) % 360 + 360) % 360;\n" +
            "    if (Math.abs(((op - outA + 540) % 360) - 180) > 0.5) { o = (o + 90) % 360; }\n" +
            "    ORI.push(o);\n" +
            "  }\n" +
            "  // The narrow Straight-Walk laser, VOLUMETRIC: same factory defaults as r1 (the\n" +
            "  // braid ripple), same loop deltas as 2D 1D (2px source line, m10→m1 seat, burst 8,\n" +
            "  // declared gate) — plus is2D:false to open the z-axis.\n" +
            "  var pS = pos[9], p0 = pos[0];\n" +
            "  var dx = p0[0] - pS[0], dy = p0[1] - pS[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;\n" +
            "  var emit = [Math.round(pS[0] + 70 * f * ux), Math.round(pS[1] + 70 * f * uy)];\n" +
            "  var SRC = {\n" +
            "    preset: 'particle-walk', is2D: false, center: emit, orientationDeg: angOf(pS, p0),\n" +
            "    emissionBoxSide: 2, burstSize: 8,\n" +
            "    emissionCap: CAP, gateCounter: 'population'\n" +
            "  };\n" +
            "  exp.init(setupSphereEmitter3D.worldCfg(SRC));   // WORLD first, then parts\n" +
            "  exp.addObject('SphereEmitter', SRC);\n" +
            "  // The ten mirror SLABS at the star vertices — 3D walls (z-slab −SD/2..SD/2), each\n" +
            "  // its own colour + recolor tag; m1 also counts (the laps chart source).\n" +
            "  var m1 = null;\n" +
            "  for (var i = 0; i < 10; i++) {\n" +
            "    var p = pos[i];\n" +
            "    var w = exp.addObject('Wall', {\n" +
            "      rect: [Math.round(p[0] - SW / 2), Math.round(p[1] - SH / 2), SW, SH],\n" +
            "      z: -Math.round(SD / 2), depth: SD,\n" +
            "      collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[i],\n" +
            "      name: 'm' + (i + 1), color: PAL[i], hooks: (i === 0 ? ['recolor', 'count'] : ['recolor'])\n" +
            "    });\n" +
            "    if (i === 0) { m1 = w; }\n" +
            "  }\n" +
            "  // SCENE Z-COLLIMATOR (CEO drive ruling 2026-07-26 — 'the z is letting things\n" +
            "  // pass through, not reflect'): the legs' z-braid diffuses lap over lap; any\n" +
            "  // quantum beyond the mirrors' z-band would sail BESIDE a plate on the leg line —\n" +
            "  // reading as a beam passing THROUGH the mirror. Two INVISIBLE full-canvas\n" +
            "  // destroy boundaries flush with the slab z-band clamp the scene to the mirror\n" +
            "  // faces (the universe z-edge moved inward — the sanctioned experiment-boundary\n" +
            "  // sink): every mirror faces every alive quantum; no leg can pass a mirror in z.\n" +
            "  // 40px deep: un-jumpable (max z step ±2/tick).\n" +
            "  exp.addObject('Wall', { rect: [0, 0, W, H], z: Math.round(SD / 2), depth: 40,\n" +
            "    collisionBehavior: 'destroy', name: 'zClipFar', visible: false });\n" +
            "  exp.addObject('Wall', { rect: [0, 0, W, H], z: -Math.round(SD / 2) - 40, depth: 40,\n" +
            "    collisionBehavior: 'destroy', name: 'zClipNear', visible: false });\n" +
            "  // BACKGROUND POPULATION COUNTER, 3D: the invisible nothing+count Wall must contain\n" +
            "  // EVERY live leaf to stay the one live-population authority — the universe z-band\n" +
            "  // is ±half-width (z-strays DIE at it, measured), so give the counter a z-slab of\n" +
            "  // ±W (a strict superset). Counting never moves/kills/recolors: zero physics (SU1).\n" +
            "  var popWall = exp.addObject('Wall', {\n" +
            "    rect: [0, 0, W, H], z: -W, depth: 2 * W, collisionBehavior: 'nothing',\n" +
            "    hooks: ['count'], name: 'population', visible: false\n" +
            "  });\n" +
            "  exp.addObject('LiveChart', {\n" +
            "    source: m1,\n" +
            "    rect: [Math.round(W * 0.72), Math.round(H * 0.04), Math.round(W * 0.25), Math.round(H * 0.2)],\n" +
            "    series: 'bar', label: 'laps at m1', refreshMs: 100, color: [24, 32, 46]\n" +
            "  });\n" +
            "  exp.addObject('LiveChart', {\n" +
            "    source: popWall, projector: 'liveCount',\n" +
            "    rect: [Math.round(W * 0.03), Math.round(H * 0.04), Math.round(W * 0.22), Math.round(H * 0.18)],\n" +
            "    series: 'bar', label: 'live quanta', refreshMs: 100, color: [24, 32, 46]\n" +
            "  });\n" +
            "  // MOVE/LOOK camera joysticks — the OMNI_3D pattern (FAIL-SOFT no-op in 2D).\n" +
            "  if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {\n" +
            "    var _mount = document.getElementById('canvas-wrapper');\n" +
            "    if (_mount) { window.CameraControls.attach(exp.runner, _mount); }\n" +
            "  }"
        ),
        // Oblique default orbit so the ring reads as PLATES IN SPACE on load (rooftop
        // top-down would read as the flat 2D star); orbit/LOOK freely from there.
        renderState: {
            renderer: 'three', egpt3D: true,
            camera: { orbit: { azimuth: 35, elevation: 42, distance: 950 }, preset: null }
        }
    },
    // ── DSE (CEO 2026-07-24, DSE-rebuild-before-republish; order + titles ruled
    //    2026-07-26) — THE double-slit (on the Tunnel object, the single canonical
    //    double-slit) then the photoelectric experiment, both on the full new
    //    component set. Letter prefixes are DROPPED: the group label carries the
    //    family, and the ids are the stable contract.
    {
        id:    'dse-tunnel-rebuild',
        title: 'Double Slit (Tunnel, symmetric)',
        group: 'DSE',
        prose: 'The double-slit REBUILT ON THE TUNNEL OBJECT at PHYSICAL DSE PROPORTIONS: the ' +
               'detector sits at the SYMMETRIC distance — emitter-to-front of the slit wall EQUALS ' +
               'back of the slit wall-to-detector. Each slit channel is a DIRECTED Tunnel: a hit on ' +
               'a channel wall ejects the quantum back into the bore and re-emits it in a uniformly ' +
               'random direction within 180 degrees of the corridor axis, so each slit acts as a ' +
               'semi-circular emitter — the classical picture of what a slit does to a wavefront — ' +
               'rather than a mirror that would only ever project the beam it was given. The exit ' +
               'angle is drawn with real trig, so the fan is flat, not diagonal-weighted; the ' +
               'barriers + screen are v2 Walls (destroy / detector ' +
               'preset) so the scene survives Restart. The source emits FORWARD over 180 degrees ' +
               '(the hemisphere preset) rather than all the way round, so the burst that used to fly ' +
               'backward into the catcher now lights the aperture — the same sampler, restricted to ' +
               'the forward half, aimed at the wall. In 2D a live chart plots the detector\'s fringe ' +
               'histogram (count by y): a balanced, central-dominant three-lobe interference pattern ' +
               'builds up. Switch the MODE strip to 3D and the SAME experiment stands up in space — ' +
               'the barrier becomes a plate with two slots, each channel a real corridor, the source ' +
               'a volumetric forward half-ball — and the instrument follows: the detector plate paints its OWN hit ' +
               'map on its faces, exactly where each particle landed, so the fringes read as bands on ' +
               'the plate itself. Identical physics, one more axis (2D≡3D).',
        source: DSE_TUNNEL_REBUILT_SOURCE,
        // The spectrally correct ramp (LightColor 'roygbiv', no pink terminus) — the right
        // instrument for a LIGHT experiment, and the one on which this beam's fullness
        // (0.3125) reads as yellow. Declared on the BASE renderState so BOTH modes inherit
        // it (effectiveRenderState CONCATENATES base render rows with the mode's).
        renderState: {
            render: [{ key: 'colorScheme', value: 'roygbiv' }]
        },
        // 3D FIRST = the rung's DEFAULT mode (the first declared entry), because this
        // rung is FIRST CONTACT: STUDIO opens on it, and the thing a newcomer should
        // meet is the experiment standing up in space with a camera they can move.
        // The 2D mode stays one click away on the MODE strip.
        modes: [
            {
                id: '3d', label: '3D',
                // FIRST-CONTACT FRAMING (CEO 2026-07-26): "standing BEHIND the emitter,
                // facing the slit wall slightly rotated, so the interference builds up
                // partially visible and invites you to move the camera."
                //
                // DERIVED FROM THE SCENE, not tuned against a picture. The camera sits at
                //     target + d·(cos el·sin az, sin el, cos el·cos az)
                // looking back at `target` (three-provider `_applyOrbit`, world y-DOWN).
                //   target (138, 200, 0) — the midpoint of the WORKING LENGTH (emitter
                //                  x=20 → detector far face x=256) at the beam height
                //                  (H/2): (20 + 256)/2 = 138. It is DERIVED from the
                //                  geometry, so it moves whenever the detector does. The
                //                  default centre is the CANVAS centre x=300, which sits
                //                  PAST the detector: orbiting about it swings the
                //                  experiment around a point outside itself and pushes
                //                  the near objects into the lens. The experiment orbits
                //                  about the experiment.
                //   azimuth -60  → sin az = -0.866 ⇒ camera x = 138 - 0.82·d ≈ -257 at
                //                  d = 480: BEHIND the emitter, looking down +x through the
                //                  slit wall (x = 96..160) toward the detector (x = 236).
                //                  cos az = 0.5 swings it 30° off that axis in z — the
                //                  "slightly rotated" part: dead-on, the slit wall would
                //                  eclipse the detector completely; at 30° the detector's
                //                  own hit map shows PAST the barrier edge, partially, which
                //                  is exactly the invitation to orbit.
                //   elevation -18 → sin el < 0 ⇒ a smaller world y = ABOVE the beam plane
                //                  (y-down): a gentle look down onto it, so the slit plate
                //                  and the tunnels read as solids rather than edge-on lines.
                //   distance 480  → the full 256-px working length and the 400-px canvas
                //                  height inside the fixed 50° vertical FOV, with the
                //                  quanta streaming through the slits still legible. It
                //                  frames the working length, so it is re-derived with the
                //                  geometry — and by MEASUREMENT (project the scene's
                //                  bounding box through the camera basis and read the frame
                //                  fill: 480 gives max|ndc| 0.851), never by scaling the
                //                  span, which over-corrects because the working length runs
                //                  mostly ALONG the view direction and foreshortens.
                //   roll +90     → the SLIT-SEPARATION AXIS onto the screen HORIZONTAL.
                //                  Derived from the scene like the rest, and forced by a
                //                  constraint 2D imposes on 3D: 2D has only x and y, so with
                //                  the beam on x the ONLY transverse axis available is y —
                //                  the slits MUST split along y and the fringes MUST spread
                //                  along y. 3D reuses that one setup (2D≡3D is this rung's
                //                  headline), so it inherits a floor-to-ceiling wall with the
                //                  detector eclipsed behind it. No orbit parameter can fix
                //                  that: `elevation` moves the eye along ±y, which is the
                //                  slit-separation axis itself, so "getting above it" slides
                //                  the eye ALONG the pattern instead of over the wall. ROLL is
                //                  the missing degree of freedom — it turns the VIEWER about
                //                  the beam axis, leaving the world untouched, and lands world
                //                  y (fringe spread) on the screen horizontal and world z (the
                //                  corridor extrusion) on the vertical: a WIDE, low plate with
                //                  the two slots SIDE BY SIDE and the fringes reading as bands
                //                  left-to-right — the textbook DSE picture. The plate's
                //                  on-screen bounding box goes 182×648 (tall) → 648×182 (wide);
                //                  the framing is otherwise IDENTICAL, since a roll moves
                //                  neither the eye nor the radius.
                //                  THE SIGN IS NOT FREE, and it is not a matter of taste: the
                //                  2D mode's fringe histogram is transposed to match (see the
                //                  LiveChart in the source recipe), and there is no x-reverse
                //                  in the chart contract — at orientation 0 bin 0 (the SMALLEST
                //                  y) always lands at the LEFT. So the roll must put small y at
                //                  screen-LEFT or the two modes read MIRRORED. Measured through
                //                  `_orbitCameraBasis` at this exact pose (detector plate
                //                  corners, 600×600): at roll +90 the low-y corner projects to
                //                  screen-x 20.9 px and the high-y corner to 633.0 px (+y →
                //                  RIGHT ✓); at roll −90 they land at 579.1 px and −33.0 px
                //                  (+y → LEFT ✗). Both are equally "wide"; only +90 agrees
                //                  with the chart.
                //   preset: null — deliberately NOT a named preset. `setPreset` is a FULL
                //                  framing reset: it forces `target: null` (and now `roll: 0`),
                //                  which is exactly what makes the preset buttons the reliable
                //                  way back — and exactly why they cannot express this pose,
                //                  whose whole point is the scene-derived `target` above.
                // NOT a compensator: the former azimuth:38 papered over a renderer defect
                // (a ferried canvas drawn with a y-up UV assumption in the y-down world,
                // on a single-sided plane), fixed at the root — orientation is derived in
                // world space and both broad faces carry the map, so every orbit is now
                // equally correct. This pose is a CHOICE about what to show first.
                renderState: {
                    renderer: 'three', egpt3D: true,
                    camera: {
                        orbit: { azimuth: -60, elevation: -18, distance: 546, roll: 90,
                                 target: { x: 177.5, y: 200, z: 0 } },
                        preset: null
                    }
                }
            },
            { id: '2d', label: '2D' }
        ]
    },
    {
        id:    'dse-photoelectric',
        title: 'Photoelectric',
        group: 'DSE',
        prose: 'The photoelectric effect as absorb/re-emit: an incoming light stream charges an ' +
               'ABSORBING wall — it fills to capacity (watch the stored bar plateau) and radiates ' +
               'lower-dimension quanta out its back, mass exactly conserved. A live chart shows the ' +
               'wall\'s charge ledger (stored / absorbed / radiated); a second Detector Screen behind ' +
               'the wall counts the radiated photoelectrons as they emerge past it. Incoming light ' +
               'charges the wall, radiated quanta appear beyond it and get counted — the current ' +
               'absorb/radiate drip (the emergent-probability threshold comes later).',
        source: DSE_PHOTOELECTRIC_SOURCE
    },
    // ── The canonical-leg pair (CEO 2026-08-03). The competence baseline: no
    //    barrier, no slits, the plate ON the leg the ring formula was written for,
    //    and the graph a DSE researcher actually looks at first. 2D only — one
    //    declared world each, no mode strip (a physics variant is a recipe
    //    declaration, never a mode).
    {
        id:    'dse-one-emitter',
        title: 'One Emitter at the Canonical Leg',
        group: 'DSE',
        prose: 'ONE point source, nothing between it and the plate, and the plate placed at the ' +
               'axial leg D = λ_eff/4 — the leg the published ring formula r_m = (λ/4)·√((2m+1)²+1) ' +
               'was written for, where the "+1" under the root IS the (λ/4)² axial term. At that leg ' +
               'the pattern crosses the wall at TWO points, one above and one below the source, each ' +
               'a quarter-wavelength out: the count-by-y chart standing behind the wall should show a ' +
               'band PAIR at y = 120 and y = 280 on the 600×400 stage, with a sharp minimum just ' +
               'inside each and a flat plateau between them. The plate COUNTS WITHOUT ABSORBING ' +
               '(preset transparent-probe), so the reading is the density at the plate plane rather ' +
               'than a first-arrival caustic, and the quanta fly on to a far-edge sink. λ = 320 px is ' +
               'chosen for resolution: the dip-to-peak structure is 0.025λ wide, so a shorter ' +
               'wavelength would smear it into a hump on this stage. The light is yellow because its ' +
               'fullness is 0.3125 — derived, never forced.',
        source: DSE_H1_ONE_SOURCE,
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    },
    {
        id:    'dse-two-emitters',
        title: 'Two Emitters at the Canonical Leg',
        group: 'DSE',
        prose: 'The SAME apparatus with a SECOND point source, separated from the first by exactly ' +
               'd = λ_eff/2 — the strongest-coupling case, since two sources reinforce when their ' +
               'separation is a multiple of λ/2 and the coupling falls as (λ/d)². The plate stays at ' +
               'the same leg D = λ_eff/4 from the emitter plane, with the same chart registered to it. ' +
               'Because each source lays its own band a quarter-wavelength above and below itself, and ' +
               'the two sources sit a half-wavelength apart, source 1\'s LOWER band and source 2\'s ' +
               'UPPER band land on the SAME line — the midline y = 200, equidistant from both ' +
               'emitters. So the chart should show a CENTRAL peak where the one-emitter rung has none, ' +
               'flanked by the two outer bands at y = 40 and y = 360. That contrast — no centre with ' +
               'one source, a doubly-reinforced centre with two — is the whole claim, and it is one ' +
               'glance at two graphs.',
        source: DSE_H1_TWO_SOURCE,
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    },
    {
        id:    'dse-two-slits',
        title: 'Two Slits at the Canonical Leg',
        group: 'DSE',
        prose: 'The SAME apparatus as "Two Emitters at the Canonical Leg", but the two point ' +
               'sources are SLIT EXITS in an opaque barrier rather than two free emitters. ONE ' +
               'emitter sits behind the barrier and lights BOTH slits; each slit is a directed ' +
               'Tunnel channel whose exit gate is COLLAPSED and PHASE-RESET, so the mouth stands ' +
               'in for a phase-locked point source at exactly the slit\'s own y — the same ' +
               '"configured emitter" composition dse-tunnel-rebuild uses. The slit centres sit at ' +
               'the identical y = 120 and y = 280 the two-emitter rung used, separated by the same ' +
               'd = λ_eff/2, and the plate sits at the identical leg D = λ_eff/4 — now measured from ' +
               'the slit exit plane, this apparatus\'s new source plane. If the slit is a faithful ' +
               'point source, the two rungs must draw the SAME picture: a central peak at y = 200 ' +
               '(source 1\'s lower band and source 2\'s upper band coincide there) flanked by outer ' +
               'bands at y = 40 and y = 360.',
        source: DSE_TWO_SLITS_SOURCE,
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    },
    {
        id:    'dse-one-slit',
        title: 'One Slit at the Canonical Leg',
        group: 'DSE',
        prose: 'The companion arm to "Two Slits at the Canonical Leg": the IDENTICAL apparatus ' +
               '(same emitter, same barrier, same slit-1 aperture at y=120, same leg D, same ' +
               'plate, same chart) with the SECOND slit walled off — one aperture instead of two. ' +
               'A slit exit is a phase-locked point source at its own y, so with only slit 1 open ' +
               'the surviving population is governed by ONE source at y=120: its own ring ladder ' +
               'predicts bands at y=40, y=200, and y=360 (the same three y positions the two-slit ' +
               'rung shows), not a single broad structureless lobe centred on the open slit. This ' +
               'is the actual double-slit claim — presence and position of structure from purely ' +
               'stochastic, non-interacting particles — read as one glance between the two charts.',
        source: DSE_ONE_SLIT_SOURCE,
        renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }] }
    }
];

// ── The mode contract (S3/W2, CEO-ratified 2026-07-26) ───────────────────────

/**
 * walkthroughModes(rung) — the rung's declared mode list, ALWAYS an array.
 * A rung without `modes` is single-mode: `[]` (the caller renders no UI and
 * loads the base renderState). This is the ONE reader of the raw field.
 * @param {object} rung
 * @returns {Array<{id:string,label:string,renderState?:object}>}
 */
export function walkthroughModes(rung) {
    return (rung && Array.isArray(rung.modes)) ? rung.modes : [];
}

/**
 * walkthroughGroup(rung) — the rung's LAB GROUP label, always a string.
 *
 * The ONE reader of the raw `group` field AND the ONE owner of the default label
 * a rung that declares none falls into. Every surface that renders the rungs in
 * groups (the STUDIO dropdown, the sdk showcase gallery) ferries THIS — spelling
 * `rung.group || 'Light Lab'` at a call site is the schema-mirror anti-pattern
 * (rename the default in one place and the other surface silently splits the
 * group in two).
 *
 * @param {object} rung — a WALKTHROUGH entry.
 * @returns {string}
 */
export function walkthroughGroup(rung) {
    return (rung && typeof rung.group === 'string' && rung.group.length > 0)
        ? rung.group : 'Light Lab';
}

/**
 * defaultWalkthroughModeId(rung) — the rung's DEFAULT mode id (the first declared
 * entry), or null for a single-mode rung.
 * @param {object} rung
 * @returns {string|null}
 */
export function defaultWalkthroughModeId(rung) {
    var modes = walkthroughModes(rung);
    return modes.length > 0 ? modes[0].id : null;
}

/**
 * effectiveRenderState(rung, modeId) — THE ONE derivation point for "what
 * renderState does this rung load in this mode".
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * Merges the selected mode entry's `renderState` DELTA over the rung's base
 * `renderState` and returns the NORMALIZED bag (`normalizeSavedRenderState`
 * shape) the walkthrough load path already ferries. Merge rules:
 *   - scalar/object keys (renderer, egpt3D, seed, camera, backdropVisible, …):
 *     the mode entry WINS when it declares the key;
 *   - `render` (the ordered setRenderOption rows): base rows THEN mode rows —
 *     a concat, so a mode row applied later naturally overrides a base row with
 *     the same key (the same last-write-wins the replay already has).
 *
 * `modeId` may be null/undefined → the rung's DEFAULT mode (first entry), or the
 * bare base bag for a single-mode rung.
 *
 * FAIL-LOUD: an undeclared `modeId` THROWS, naming the rung and its declared
 * list. There is deliberately NO silent default-to-first for an unknown id — a
 * stale mode id must surface, not quietly load the wrong scene.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 * A renderState carries ZERO physics: it selects the renderer, the boot-time
 * `window._egpt3D` flag, the seed and the camera. The SCENE's dimensional deltas
 * are authored in the rung's ONE guarded recipe (via `exp.is3D`), not here.
 *
 * @param {object} rung — a WALKTHROUGH entry.
 * @param {string|null} [modeId] — a declared mode id, or null for the default.
 * @returns {object} the normalized renderState bag.
 */
export function effectiveRenderState(rung, modeId) {
    var modes = walkthroughModes(rung);
    var entry = null;
    if (modeId === undefined || modeId === null) {
        entry = modes.length > 0 ? modes[0] : null;
    } else {
        for (var i = 0; i < modes.length; i++) {
            if (modes[i].id === modeId) { entry = modes[i]; break; }
        }
        if (!entry) {
            throw new Error('[walkthrough] rung "' + (rung && rung.id) + '" has no mode "' +
                modeId + '" — declared modes: [' +
                modes.map(function (m) { return m.id; }).join(', ') +
                ']. (FAIL-LOUD.)');
        }
    }
    var base  = (rung && rung.renderState) || {};
    var delta = (entry && entry.renderState) || {};
    var merged = Object.assign({}, base, delta);
    // `render` is an ORDERED apply-list, not a scalar: concat rather than replace.
    var baseRender  = Array.isArray(base.render)  ? base.render  : [];
    var deltaRender = Array.isArray(delta.render) ? delta.render : [];
    if (baseRender.length || deltaRender.length) {
        merged.render = baseRender.concat(deltaRender);
    }
    return normalizeSavedRenderState(merged);
}

// ── First contact (CEO 2026-07-26) ───────────────────────────────────────────

/**
 * FIRST_CONTACT_WALKTHROUGH_ID — the rung STUDIO opens on with no deep link.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * The ONE authority for "what does a newcomer see when they open the IDE". It is
 * a `walkthrough:<id>` selection value, so `AuthorView` loads it through the SAME
 * dropdown path a user click takes — no second boot branch, no template id to keep
 * in sync. Validated at module load (below): a typo fails loud immediately rather
 * than silently landing on a blank canvas.
 *
 * ── Layer 2: what it shows ───────────────────────────────────────────────────
 * The double-slit rebuilt on the Tunnel object, in its DEFAULT (3D) mode: the
 * camera stands behind the emitter looking obliquely at the slit wall, and the
 * interference pattern builds on the detector plate while you watch. This is
 * PRODUCT INTENT — the first thing FRQTL shows is its signature experiment, framed
 * so the pattern is already forming and the camera is obviously yours to move.
 *
 * @type {string}
 */
export var FIRST_CONTACT_WALKTHROUGH_ID = 'dse-tunnel-rebuild';

/**
 * HERO_WALKTHROUGH_ID — the rung the PUBLIC SITE's landing hero runs.
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 * The ONE authority for "which scene is the front page". `apps/frqtl_site`'s
 * LandingPage boots THIS rung through the ordinary blank-page load-by-eval seam
 * (`empty/index.html` + `_egptApplyWalkthrough`) — the same path STUDIO takes for
 * a dropdown selection. Declared HERE, next to the rungs themselves, so a rung
 * retirement is a one-file decision and the id is validated at module load
 * (below) rather than discovered when the front page goes blank.
 *
 * WHY IT IS SEPARATE FROM `FIRST_CONTACT_WALKTHROUGH_ID`: they answer different
 * questions for different audiences. First contact = "what does a DEVELOPER see
 * when the IDE opens with no deep link" (the signature experiment, camera
 * obviously theirs to move). The hero = "what does a STRANGER see in the first
 * two seconds on the public front page" (a self-running, immediately legible
 * scene with no chrome and no interaction required). Collapsing them into one
 * constant would couple two independent product decisions — the same mistake as
 * mirroring the gallery's curation order onto STUDIO's opening scene (see the
 * matching note in `lib/frqtl/experiments/exhibits.js`).
 *
 * ── Layer 2: what it shows ───────────────────────────────────────────────────
 * A single omni source of oppositely-charged quanta launched from a ring; the
 * overlapping charged walks braid into radial bands of light and dark. It is the
 * product beat the landing copy makes — an interference pattern with no wave
 * equation — and it is 2D/p5, so it starts instantly, needs no camera, and the
 * Water lens (the `filter.water` render capability the sibling Fountain Pool rung
 * declares) applies to the SAME running field.
 *
 * @type {string}
 */
export var HERO_WALKTHROUGH_ID = 'r4-self-interference';

/**
 * HERO_WATER_LENS_WALKTHROUGH_ID — the rung whose renderState IS the hero's
 * "Water" lens. The landing page's lens switch does NOT hand-write a filter
 * name: it replays THIS rung's `effectiveRenderState().render` rows over the
 * live scene through the same ControlBind dispatch a saved project uses. The
 * two rungs share one `source` const (SELF_INTERFERENCE_SOURCE), so the lens is
 * provably a render delta on the SAME physics — which is the claim the caption
 * makes ("the light field and the water field are the same emergent wave").
 * @type {string}
 */
export var HERO_WATER_LENS_WALKTHROUGH_ID = 'r5-fountain-pool';

/**
 * walkthroughById(id) — id → rung, or null. The ONE resolver every consumer of a
 * declared rung id (hero, first contact, a deep link) ferries instead of
 * re-writing `WALKTHROUGH.find(...)` at each call site.
 * @param {string} id
 * @returns {object|null}
 */
export function walkthroughById(id) {
    for (var i = 0; i < WALKTHROUGH.length; i++) {
        if (WALKTHROUGH[i].id === id) { return WALKTHROUGH[i]; }
    }
    return null;
}

// FAIL-LOUD at module load for EVERY declared-id constant: a retirement that
// orphans one of these must break here, loudly, at import time — never silently
// downstream where a dead id turns into a blank stage or a self-embed.
[['FIRST_CONTACT_WALKTHROUGH_ID', FIRST_CONTACT_WALKTHROUGH_ID],
 ['HERO_WALKTHROUGH_ID', HERO_WALKTHROUGH_ID],
 ['HERO_WATER_LENS_WALKTHROUGH_ID', HERO_WATER_LENS_WALKTHROUGH_ID]
].forEach(function (pair) {
    if (!walkthroughById(pair[1])) {
        throw new Error('[walkthrough] ' + pair[0] + ' "' + pair[1] +
            '" is not a declared rung — declared ids: [' +
            WALKTHROUGH.map(function (r) { return r.id; }).join(', ') + ']. (FAIL-LOUD.)');
    }
});

// ── is3D normalization (E-W0a, CEO 2026-07-23; mode-aware S3/W2) ─────────────
// STUDIO must read ONE `is3D` field for a selection regardless of whether it came
// from the gallery registry (experiments.js `is3D`) or a walkthrough rung. A rung's
// 3D-ness is ALREADY declared by its (possibly mode-merged) `renderState.egpt3D` —
// the ONE owner the load path threads into the iframe URL — so `is3D` here is
// DERIVED through `effectiveRenderState` for the rung's DEFAULT mode, never a
// hand-typed second source that could drift (schema-mirror kill). Stamped once at
// module load so every consumer sees the uniform field.
WALKTHROUGH.forEach(function (rung) {
    rung.is3D = effectiveRenderState(rung, null).egpt3D === true;
});

/**
 * walkthroughIs3D(id, modeId) — the ONE mount-time 3D predicate for a walkthrough
 * rung, the peer of experiments.js `experimentIs3D`. Derived through
 * `effectiveRenderState` (the single derivation point) for the given mode, or the
 * rung's default mode when `modeId` is omitted. Returns false for an unknown id;
 * THROWS (via effectiveRenderState) for a known id with an undeclared mode.
 * @param {string} id — a rung id (the `walkthrough:<id>` selection value).
 * @param {string|null} [modeId] — a declared mode id, or null for the default.
 * @returns {boolean}
 */
export function walkthroughIs3D(id, modeId) {
    for (var i = 0; i < WALKTHROUGH.length; i++) {
        if (WALKTHROUGH[i].id === id) {
            return effectiveRenderState(WALKTHROUGH[i], modeId).egpt3D === true;
        }
    }
    return false;
}
