<!-- PROMOTED TO CATALOG 2026-08-07 per CEO voice pass. Authored by the vibe-builder
     robot proxy (Sonnet seat) in the L3 clean-room run, ws-frqtl-vibe-h2-run round 3.
     R8 questions OPEN — designer iteration boarded (ws-frqtl-dse-composed-iteration).
     Run record: docs/design/vibe-run-2026-08-07/ -->

# dse-composed — a double-slit apparatus composed object-by-object

Author: vibe-builder (frqtl-sdk-builder persona). Session: 2026-08-07, round 3
(resumed after an infra-terminated session; round 3 itself started fresh — no
prior round-3 recipe existed to build on). SDK: `@descix/frqtl-sdk@0.1.8`, real
`./eyes` (`openHostedEyes`, Playwright-backed). Scene:
`clean-room/run/scene-composed-dse.js`. Capture: `clean-room/run/look-composed.cjs`.

Unlike `dse-planar` (the served recipe I read against in rounds 1-2), this
apparatus is **mine**: every object, every coordinate, every constant below was
placed by hand via the published `exp.addObject(kind, config)` registry — not a
factory (`setupDoubleSlit`), not the served recipe's numbers. Where I borrowed a
*rule* from `dse-planar` (R4's reinforcement condition, R5's grain-visibility
threshold) I say so explicitly; the coordinates themselves are my own design.

## R1 claim
Wave-interference-relevant structure (banded/asymmetric transmission through a
two-slit barrier) emerges from stochastic, non-interacting particles emitted
from a single point source. Apparatus = emitter + barrier with two apertures +
transparent counting plate (detector). Evidence = what the counting plate's own
live histogram shows, read by eye, corroborated by a camera-free numeric probe.

## R2 fence
Hypothesis A only (presence/position of transmitted structure) — never
sum-of-singles subtraction, never an excess/reinforcement ratio, never the Born
rule. That is Hypothesis B, not attempted this round. No physics-correctness
auditing was performed on the results below: every claim is "did I build what I
meant to, does the running world match what I predicted," never "is the physics
right."

## R3 beam (my apparatus, as built)
- Stage: 600×400, seed 42.
- `exp.init({ dimension: 2, wavelengthScale: 320 })` — 320 chosen by applying
  `dse-planar`'s own R5 visibility rule (dip-to-band structure ≈ 0.025λ must
  clear ~8px to read by eye on this canvas scale; 0.025×320 = 8px, the same
  threshold that recipe already validated at λ=320) to a scene of my own design.
  No explicit emitter mass/capacity override — default fullness (1.0), so this
  IS the effective λ (per the SDK's own accounting: wavelength =
  floor(capacity/mass × wavelengthScale), = wavelengthScale at fullness 1).
- Emitter: `SphereEmitter`, `preset: 'hemisphere'`, `center: [70, 200, 0]`,
  `burstSize: 24`, `emitEveryTicks: 2` — left edge, vertical mid-line of the
  stage.
- Barrier: three `Wall` objects at `left: 250, w: 20`, `collisionBehavior:
  'destroy'`, forming two 32px apertures:
  - top wall `top: 0, h: 104` → covers y 0-104
  - middle wall `top: 136, h: 128` → covers y 136-264
  - bottom wall `top: 296, h: 104` → covers y 296-400
  - **slit 1**: y 104-136 (centered y=120). **slit 2**: y 264-296 (centered
    y=280). Separation = 160px = λ/2 — `dse-planar`'s R4 "strongest
    reinforcement" condition, applied here by my own choice of slit spacing.
- Detector: `GraphingDetectorWall`, `rect: {left: 290, top: 0, w: 20, h: 400}`,
  `binPx: 8` — **moved from an originally-planned `left: 400`** (see R7/R8 for
  why; the running world, not my pre-flight guess, decided this number).

## R4 prediction rule (borrowed from dse-planar, applied to my geometry)
Two slits reinforce most strongly where their separation is a multiple of λ/2.
Mine is exactly λ/2 (160px), by design — the recipe's own "strongest" case.
Pre-flight (written before the fix, and again before the final capture):
symmetric, two-lobed structure diverging from both slits, densest near the
geometric midline (y≈200), reaching whatever detector position turned out to
be inside the populated zone.

## R5 grain (visibility, borrowed from dse-planar)
Dip-to-band structure ≈ 0.025λ. At λ=320 that is the recipe's own validated
"visible" scale (~8px on this canvas) — the reason 320 was chosen over the
SDK's own defaults (`wavelengthScale` default 8, `setupDoubleSlit`'s canonical
64) or `dse-planar`'s own served λ_eff (also 320, so this doubles as a partial
replication of that choice, arrived at independently from the same rule).

## R6 instrument
Transparent (non-absorbing) `GraphingDetectorWall`, 20px thick, binned every
8px, drawn live into the composite (a colored bar-graph rendered directly on
the detector object by the SDK's own render stack) — not a separate readout.
`getStill('field')` (the SDK's documented render-free numeric channel, physics-
pixel space, camera-independent) was used as a corroborating numeric probe, not
as the primary instrument — the composite's own on-canvas histogram is.

## R7 landed arms — the ground truth I actually built and captured

### Iteration timeline (every wall, fixed or explained, never hidden)
1. **First narrow capture** (pre-existing from the terminated session,
   `composed-composite.png`, distance=220 target=[270,200,0]): emitter cloud +
   barrier + one visible gap, **pure black past the barrier**.
2. **Widened camera** (`composed-composite-wide-buggy-oneslit.png`,
   distance=420 target=[300,200,0]): full 600×400 stage visible. This **ruled
   out framing as the cause** — the whole stage was on-screen and it really was
   almost empty past the barrier, except one stray lit pixel. It also showed,
   by eye, that **only one slit gap was actually open** — the second "gap" was
   an unbroken grey column.
3. **Traced the bug in my own code**: the middle wall's `top:136, h:128` ends
   at y=264; the bottom wall started AT `top:264` — a **zero-pixel gap**,
   contradicting my own header comment ("bottom wall from y=296"). A real
   arithmetic slip, not an SDK defect. Fixed: bottom wall now `top: 296, h:
   104`.
4. **Empirical probe** (`getStill('field')`, tick checkpoints 1200/2400/4800/
   9600, camera-free numeric channel):

   | tick | occupancy past barrier (x≥250) | rightmost nonzero physics-x | occupancy at/past x=400 |
   |------|-------------------------------:|-----------------------------:|-------------------------:|
   | 1200 (buggy, 1 slit) | 21,359 | 308 | 0 |
   | 2400 (buggy, 1 slit) | 24,550 | 262 | 0 |
   | 4800 (buggy, 1 slit) | 12,057 | 254 | 0 |
   | 9600 (buggy, 1 slit) | 20,283 | 264 | 0 |
   | 1200 (fixed, 2 slits) | 138,085 | 356 | 0 |
   | 2400 (fixed, 2 slits) | 146,439 | 352 | 0 |
   | 4800 (fixed, 2 slits) | 142,994 | 350 | 0 |
   | 9600 (fixed, 2 slits) | 150,139 | 350 | 0 |

   The fix alone moved occupancy past the barrier up **~6-10×**. But in both
   the buggy and fixed configurations, the transmitted front **plateaus** and
   does not advance with more ticks (1200→9600, an 8× range) — a real,
   reproducible ceiling in this apparatus at these emitter settings, not an
   insufficient-settle-time artifact. This is why the detector moved.
5. **Moved detector** from the pre-flight plan (`left: 400`, 150px past the
   barrier — outside the ever-populated zone, confirmed above) to `left: 290`
   (40px past the barrier's right edge at x=270 — inside the consistently
   populated x=250-356 zone).
6. **Final captures**, tick=2400 (chosen as a comfortably-settled, cheap point
   — the probe above shows the field is already at its steady-state shape by
   1200 and flat through 9600):
   - `composed-composite-wide.png` — full stage.
   - `composed-composite-detector-zone.png` — barrier-to-detector close-up.

### LOOK — what I SEE, in words, before any number
**composed-composite-wide.png** (final, fixed, tick=2400): a bright wedge of
yellow dots (the emitter cloud) filling the left third of the stage, densest
near the source and thinning toward the barrier. The barrier itself now shows
**two clear openings**, not one — a short gap near the top and a short gap
near the bottom, both letting a fan of dots spill through. Past the barrier,
the transmitted dots form a **diverging two-lobed spray**, widest right at the
gaps and thinning out as it travels right, fading to black well before the far
edge of the canvas. The detector — a dark navy vertical bar — sits close to
the barrier now (not far off at the right edge as originally planned), and
where it crosses the spray's densest surviving band, it shows a **small but
distinct colored stripe** (blue → orange → red → orange → blue), the SDK's own
live histogram render. That colored stripe sits noticeably lower on the
detector than the stage's vertical midline — roughly level with the *bottom*
slit, not the top one. **I do not see any comparable colored stripe anywhere
else on the detector's height**, including opposite the top slit — that
portion of the detector reads as flat, uniform dark navy, same as everywhere
else with no signal.

**composed-composite-detector-zone.png** (close framing): confirms the same
read at higher resolution — a dense field of yellow dots between the barrier
and the detector, and the detector's colored histogram band sitting at the
bottom of the frame, aligned with the lower slit gap, not spread evenly along
the column.

### Numbers, after the words — detector-column probe (getStill('field'),
40px y-bands, physics x=290-310, corroborating the on-canvas histogram)

| y band | tick 2400 | tick 9600 |
|--------|----------:|----------:|
| 0-40 | 0 | 0 |
| 40-80 | 0 | 0 |
| 80-120 | 0 | 0 |
| 120-160 (opposite TOP slit) | 0 | 0 |
| 160-200 | 0 | 0 |
| 200-240 | 0 | 0 |
| **240-280** | **829** | **957** |
| **280-320 (opposite BOTTOM slit)** | 0 | **192** |
| 320-360 | 0 | 0 |
| 360-400 | 0 | 0 |

The numeric probe matches the visual read exactly: signal exists only in the
band aligned with the bottom slit (240-320), and is exactly zero everywhere
else at both tick=2400 and tick=9600 — including the band directly opposite
the top slit (120-160). This is a stable, reproducible, structural asymmetry
in what reaches x=290-310, not a one-tick sampling fluke.

### Predicted vs observed
| | Predicted (R4, before the final capture) | Observed |
|---|---|---|
| Slit openings | two, symmetric | two, confirmed by eye AND by the fix (was one before the fix) |
| Transmission reach | assumed detector at x=400 would see it | front caps at x~350-356 regardless of tick; x=400 never populated at any sampled tick — detector relocated |
| Structure shape | symmetric two-lobed spray, densest at midline y=200 | visually two-lobed and diverging, confirmed — but the DETECTOR READING is asymmetric top/bottom, not symmetric |
| Band character | visible, non-smooth (R5 threshold cleared) | confirmed: a distinct colored band on the detector, not a smooth wash |

The "symmetric reinforcement at the midline" part of R4 was **not** confirmed
as literally stated at the detector's position — the top slit contributes
nothing measurable there, while the bottom slit does. That mismatch is
reported plainly (see R8), not smoothed over.

## R8 open (designer questions, not physics-audited)
1. **Top/bottom detector asymmetry.** Both slits are geometrically symmetric
   about the emitter's y=200 axis and both are confirmed open (the fix
   increased total post-barrier occupancy 6-10×, consistent with two live
   slits, not one). Yet the detector at x=290-310 sees signal only in the
   band aligned with the bottom slit, at both tick=2400 and tick=9600. Is this
   seed=42's own finite-sample stochastic asymmetry (a different seed might
   flip or balance it), a hemisphere-preset directional bias I'm not aware of,
   or something about how `collisionBehavior:'destroy'` walls interact with a
   2D hemisphere burst that isn't azimuthally symmetric? Not diagnosed — the
   persona's discipline is build-verification, not this kind of physics
   question, so it is recorded here rather than chased.
2. **The transmission ceiling (~x=350-356, flat from tick 1200 through
   9600).** Real and reproducible (see R7's table), and moving the detector
   inside it was the right build response. But WHY it caps there rather than
   continuing to spread (even slowly) with more ticks is an open question for
   whoever owns the emitter/momentum model — not chased here as it would be
   exactly the "is the physics right" question the eyes-trust doctrine fences
   off.
3. **No SDK gaps were hit this round.** Both walls encountered (the closed
   second slit, the mis-placed detector) were self-authored construction
   mistakes, not package defects — fixed in-persona, not filed to
   `gap-filler`. Worth naming explicitly since rounds 1-2 both ended in a
   filed SDK gap; this round did not.

## Files
- `clean-room/run/scene-composed-dse.js` — the composed scene (buildExperiment
  module), with the full iteration history in its own header comments.
- `clean-room/run/look-composed.cjs` — the capture driver (pre-flight, iteration
  log, and the two final `setPose` framings).
- `clean-room/run/probe-transmission.cjs`, `probe-colprofile.cjs`,
  `probe-detector-band.cjs` — the camera-free `getStill('field')` numeric
  probes used to corroborate what the composite showed by eye.
- `clean-room/run/composed-composite-wide.png`,
  `clean-room/run/composed-composite-detector-zone.png` — final evidence
  (fixed geometry, moved detector, tick=2400).
- `clean-room/run/composed-composite-wide-buggy-oneslit.png`,
  `clean-room/run/composed-composite-buggy-oneslit.png` — kept deliberately as
  the "before" evidence for the iteration story in R7.
