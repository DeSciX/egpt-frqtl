# Recipe — DSE planar (double slit, 2D stage)

> Recipe catalog, `egpt-frqtl`. Consumed by a `frqtl-sdk-builder` seat; authored and
> revised in the `frqtl-experiment-designer` role, never by a building seat. The
> method (`HowToSee` corpus) holds no physics constants; this recipe supplies every
> number the method asks for, by section R1–R8.
>
> Recipe version: 2026-08-07. Stage: **600×400, 2D planar.**

## R1 — The claim

Wave interference emerges from stochastic, non-interacting particles. The apparatus is
an emitter, optionally a barrier with apertures, and a counting plate; the evidence is
band structure on the plate at predicted positions — read by eye off the capture.

## R2 — Hypotheses, and the fence

**A gates B.** Unless your dispatch says otherwise in as many words, you are on **A**.

| | Claim | Evidence | Status |
|---|---|---|---|
| **A** | interference arises AT ALL from stochastic, non-interacting particles | **presence and position** — do bands appear, and where? | **evidenced** (R7) |
| **B** | the DEGREE of reinforcement (the quadratic term) | how much brighter than expected | **NOT STARTED** |

While on A you may report, per arm, which bands are present and at what y. You may
NOT: sum single-source arms into a "sum of singles"; subtract one arm from another;
compute an excess, surplus, enhancement, or reinforcement ratio; or reason about a
quadratic term, a cross term, the Born rule, or coupling versus separation.

**This is the strongest pull in the experiment.** The textbook framing is "both open ≠
sum of singles," so the moment you hold two arms your training reaches for that
subtraction. **That subtraction IS hypothesis B.** If you catch yourself writing "and
notice the combined pattern exceeds…", stop — that sentence belongs to a later run.

**IID is a DECLARED CONDITION of A**, not an incidental setting: inter-quantum
collisions OFF. It is what makes A novel, and it must be asserted from the running
world, not assumed.

## R3 — The beam (settle inputs)

| Quantity | Value | Note |
|---|---|---|
| mass / capacity | 5 / 16 | fullness 0.3125 |
| wavelengthScale | 100 | |
| **λ_eff** | **320 px** | = (capacity/mass) × wavelengthScale |
| **P_eff** | **1** | leaf born AT the fundamental dimension — the move-gate skips it |
| emitter preset | `hemisphere`, 2D | |
| **f_forward** | **0.65** | hemisphere 2D (3D would be 0.49) |
| along-axis speed | **0.65 px/tick** | = P_eff × f_forward |

Settle times for the known layouts — recompute for any layout you change (one
division; see `HowToSee/two-clocks.md`):

| Path | px | ticks |
|---|---|---|
| source → plate | 80 | 123 |
| source → barrier → plate | 280 | 431 |
| fill the 600 px canvas | 600 | 923 |

## R4 — The prediction rule

- An emitter's job is to lay down **rings** — circular fronts in 2D. Scenes are
  COMPOSED from emitters; a slit exit is an emitter too.
- With the plate at an axial leg **D = λ_eff/4** from a source, that source's bands
  land at transverse offsets **±λ_eff/4** from its own y, then ±3λ/4, ±5λ/4 …
- Two sources reinforce where their bands coincide — iff their separation is a
  multiple of **λ/2**. Coupling falls as (λ/d)², so **d = λ/2 is strongest**; use it
  unless told otherwise.
- **A constant ~4 px pedestal** puts measured bands slightly inside ideal. Additive in
  pixels, does not scale with λ. Expect it; do not model it.

The ring-ladder derivation behind this rule (`r_m = (λ/4)·√((2m+1)²+1)` from the
emission point) is worked in `DSE_WORKED_EXAMPLE.md` in this app's corpus.

## R5 — The grain constant

Dip-to-band structure spans about **0.025 λ**.

| λ_eff | structure | Verdict |
|---|---|---|
| 128 px | ~3 px | invisible — reads as a smooth hump |
| 160 px | ~4 px | mush |
| **320 px** | **8 px** | **visible — use this on the 600×400 stage** |
| 640 px | 16 px | crisp |

## R6 — The instrument

- Detector: **transparent (non-absorbing) probe** — counts without absorbing, reads
  **flux** (the density at that plane). A destroying plate reads first arrivals, a
  different quantity landing at different radii.
- Probe thickness **≈ λ/64** (5 px at λ=320). A thicker plate smears bands together.
- Add a far-edge **destroy** sink, since quanta fly past a non-absorbing probe.
- The pattern lives in the **counting surface and its readout**, never in a field
  still.

## Scene construction (through the published surface)

All arms compose published parts over the seven primitives (`THE_MINIMAL_SIM.md`,
`COMPOSE_AND_CAPTURE.md` in this app's corpus). One scene body; each arm differs by one
declared value; every knob a single named constant at the top.

- **Source(s):** hemisphere `SphereEmitter`(s) — IID leaf frames, beam per R3. Emitter
  arms place sources at **y=120 and y=280** (separation 160 px = λ/2 at the strongest
  coupling); single-emitter control at **y=200**.
- **Barrier arms:** walls with apertures at **y=120 and y=280**; each slit exit acts
  as a source under R4.
- **Detector:** the R6 flux probe at axial leg **D = λ_eff/4 = 80 px** from the
  source plane (placed by calculation, never by eye), plus the far-edge destroy sink.
- **Declared world condition:** inter-quantum collisions OFF (R2), asserted from the
  running state.

### Knobs (each a single named constant)

| Knob | Canonical value | What varying it does |
|---|---|---|
| `lamPx` (λ_eff via mass/cap × scale) | 320 | band spacing AND geometry, together (R5 floor applies) |
| `legFrac` | 1/4 | detector leg as fraction of λ |
| `srcSep` | λ/2 = 160 px | coupling strength between sources (R4) |
| `probeThickness` | λ/64 = 5 px | band sharpness on the flux read |
| arm selector | one-emitter / two-emitters / two-slits / one-slit | which R7 column you are reproducing |
| seed | 42 (reference runs) | reproducibility; new seeds = new counting, same positions |

## What to look for — the expected visual outcome

After settling (R3) plus counting budget, on the plate readout:

- **One emitter (control):** flat at the midline y=200; the source's own band
  structure at ±λ/4 around y=200.
- **Two emitters:** the midline the single source left FLAT now carries the tallest
  peak — reinforcement at y=200, plus bands near y=40 and y=360.
- **Two slits:** bands at y≈40, 200, 360 — the ladder positions.
- **One slit (counterfactual):** the blocked slit's band at y=360 GONE; the surviving
  slit's bands (y=40, y=200) stay put.

The falsifiable glance for the classic pair: **y=200** — two-emitters peaked where
one-emitter is flat. For the counterfactual pair: **y=360** — present with both slits,
gone with one. Name your pixel before you build (`HowToSee/falsifiable-glance.md`).

## R7 — Landed arms (reference — a new arm is compared against these)

λ_eff 320, legFrac 1/4 (leg 80 px verified from the running world), flux probe 5 px,
slits at y=120 / y=280, seed 42, read at tick 1500:

| y | one emitter (src 200) | two emitters (120, 280) | two slits | one slit (120) |
|---|---|---|---|---|
| 40 | 199 | 1004 | 583 | **466** |
| 120 | **1586** | 540 | — | — |
| **200** | **663** ← flat | **1954** ← peak | **974** | **442** |
| 280 | **1630** | 629 | — | — |
| 360 | 168 | **998** | 584 | **80** ← gone |

Counts are run-length dependent and are NOT goldens — **only the POSITIONS are the
claim**, plus the qualitative contrast: one emitter flat at the midline where two are
peaked; blocking a slit removes that slit's band and leaves the survivor's.

**Read the count-axis maximum before comparing two charts** — an auto-scaling readout
made one-slit and two-slit charts read as identical until the axes were compared (a
whole missing band was invisible).

## R8 — Open, unresolved (do NOT try to close these)

- **The ~4 px pedestal** has no mechanism. Designer-level question; do not supply one.
- **An earlier single-slit configuration produced the aperture's projection and no
  ladder.** The current one-slit arm does not show this, but the earlier null was
  never explained.
- **Hypothesis B is unstarted**, including the classical d ≥ λ threshold that should
  precede it.
- Readout instrument quirks: the reference chart's bin axis renders mirrored against
  its wall, and its count axis auto-scales per chart. Both bite when comparing arms.
