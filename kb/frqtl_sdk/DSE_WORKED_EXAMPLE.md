<!-- Copyright 2023-2026 by Essam Abadir -->
# The Double Slit — the library's worked example

This is the scene the browser IDE opens on, and it is the proof piece for the whole
library: **the detector is placed by calculation before anything runs, and the
interference bands land where the calculation said they would — with no engine tuning
and no wave equation anywhere.**

If you build lighting, VFX, or perception systems — three.js, Unreal, CV pipelines,
CGI — this is the thing to take away. You get a light field whose diffraction,
caustics, and fringe structure are *emergent* from particle walks, so it behaves
correctly at apertures and edges where a shader approximation has to be hand-faked.
And because the structure is predictable in closed form, you can place your geometry
against it up front instead of dragging things around until they look right.

## The scene

Seven objects, all of them parts over [the seven primitives](THE_MINIMAL_SIM.md):

| Object | What it is |
|---|---|
| **Source** | a `SphereEmitter` on the `hemisphere` preset — the same ball-rejected sampler as the omni source, restricted to the forward half, so the whole burst lights the aperture instead of half of it flying backward |
| **Three barrier walls** | `Wall`s with `collisionBehavior: 'destroy'`, leaving two gaps: one above the pair, one between them, one below |
| **Two slit channels** | `Tunnel`s in `directed` mode. A hit on a channel wall ejects the quantum back into the bore and re-emits it in a uniformly random direction within 180° of the corridor axis — so each slit acts as a semicircular emitter, which is the classical picture of what a slit does to a wavefront. With `exitRecenter` and `exitPhaseReset` on, each exit is a phase-locked **point source** |
| **Counting screen** | a non-absorbing probe wall (`collisionBehavior: 'nothing'` plus the count hook). It counts without removing, so the census at the plane *is* the density at that plane |
| **Back and far sinks** | two `destroy` walls at the canvas edges, catching backscatter and bounding the population |

A mirror-mode `Tunnel` would be the wrong choice here and it is worth knowing why: a
collimating mirror channel preserves the incoming direction, so two slits could only
ever project two beams. The re-emission is what gives each slit its own angular spread
to interfere with.

## The detector leg is placed by calculation

A phase-locked point source lays down density rings at

    r_m = (λ/4)·√((2m+1)² + 1)

measured **from the emission point**. Each slit exit is such a source. So instead of
choosing the detector distance by symmetry or by eye, put the midline on ring `m = 2`
of *both* slits: with the exits at ±`halfSep` from the midline, the two ring-2 circles
intersect exactly on the axis and the centre is doubly reinforced.

```js
var lamPx   = 128;                       // the transverse wavelength, in pixels
var halfSep = 51;                        // slit exit offset from the midline
var ringR   = function (m) { return (lamPx / 4) * Math.sqrt((2 * m + 1) * (2 * m + 1) + 1); };

// r_0 = 45.3, r_1 = 101.2, r_2 = 163.2
var D = Math.round(Math.sqrt(ringR(2) * ringR(2) - halfSep * halfSep));   // 155
```

The detector goes at the back face of the slit wall plus `D`. Rings inside `D` — `m=0`
at 45.3 px, `m=1` at 101.2 px — never reach the plate and contribute no band. Zero free
parameters, nothing fitted.

The wavelength itself is a derived quantity, not a knob you set directly:
**λ_eff = (capacity / mass) × wavelengthScale**. On the emitter, fullness
(`mass/capacity`) picks the spectral band and `wavelengthScale` scales the transverse
wave in pixels — two independent dials. Keep them apart: geometry sizes the plate,
wavelength sizes the fringes, and if one variable drove both, the aperture would walk
every time you re-tuned the beam.

**Read the formula honestly.** `r_m` is the **mean** of a random walk. The spread grows
with distance and, past the first ring, usually swallows the fine structure — so only
the first ring gap is measurably compressed; later gaps sit at λ/2 within the walk's
own width. Before claiming you have found structure in any FRQTL scene, ask how it fits
a random walk. The prediction here is strong because it is about *where the first
reinforcement lands*, not about resolving a whole ladder.

## Then you run it

Start the loop and the bands build up. Individual quanta arrive one at a time at
apparently random places on the screen; the pattern is the statistics of many discrete
walks through two apertures. Nothing in the engine knows the word "interference," and
there is no tuning step between placing the detector and seeing the fringes — the
central lobe lands on the axis, flanked by the symmetric pair, exactly where `m = 2`
put it.

The screen is the instrument, and your eyes are the acceptance test. FRQTL scenes are
fractal and non-linear, so a static number cannot tell you a scene is right before you
have drawn it. Score histograms if you want a design aid — never as the criterion.

## 2D and 3D are the same physics

The spatial axes are identical in physics; "2D" and "3D" differ only in which axes are
active and what the camera does. Switch the mode and the same experiment stands up in
space: the barrier becomes a plate with two slots, each channel a real corridor, the
source a volumetric forward half-ball. The `exitRecenter` pin applies to the transverse
axis only, so in 3D each slit is a **line** source and the bands extrude along z — the
fringes read as stripes across the plate rather than peaks on a chart.

That is the practically useful part for a 3D pipeline: you can prototype an optical
setup flat, confirm the geometry against the ring ladder, then turn on the third axis
and get the same field with correct depth spread, no re-authoring.

## Going deeper

The engine's discrete, integer, every-step-counted design comes out of a body of work
on computation and entropy — including machine-checked Lean proofs on the P = NP
question. That material lives with the EGPT mathematics project and its Lean artifacts;
it is worth reading there, and it is deliberately not relitigated in a simulation
guide. Proofs live with proofs; visual intuition lives here.

Next: [The Minimal Sim](THE_MINIMAL_SIM.md) for the primitive surface underneath every
object named above, and [the visual coding guide](FRQTL_VISUAL_CODING_GUIDE.md) for the
emergence discipline this scene is an instance of.
