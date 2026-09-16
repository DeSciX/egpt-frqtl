# The falsifiable glance — two arms, one value apart, one named pixel

> How-To-See corpus. Method only; the numbers live in your recipe.

## Step 1 — Name the prediction in PIXELS, before you build

Write down the literal pixel positions where you expect accumulation, using your
recipe's prediction rule. Do not re-derive the physics and do not invent a formula —
the rule in the recipe is the settled geometry for the experiment. A new arm (a moved
plate, an extra source, a blocked aperture) is a substitution into that rule, not a new
derivation. If the recipe declares a pedestal or offset, expect it; do not model it.

## Step 2 — Design the glance so it can FAIL

Build **two arms differing by exactly one declared value**, arranged so a **single
named pixel** tells them apart — one arm has a peak where the other is flat. **Name
that pixel before you build.** If you cannot, your arms are not a test.

Your recipe lists arms already landed and what each shows. Use one as the reference arm
and build yours to differ from it by a single value. Reuse its exact positions where
the comparison depends on them — an arm built at different coordinates is not a
comparison.

## Step 3 — Build by COMPOSING only

Compose the published parts (emitters, walls, tunnels, detectors) over the
seven-primitive surface. No engine code, no new object type, no contract change — if
you believe you need one, stop and file the gap (see `when-the-picture-is-wrong.md`).

- **Every knob you might flip is a SINGLE NAMED CONSTANT**, declared once at the top.
  When the picture is wrong, the fix must be one character and a re-capture.
- **One scene body**, arms differing by one declared value. Two copies drift and stop
  being comparable.

## Step 4 — Prove the world OBEYED you

A constant in your script is not evidence the running world used it. A parameter can be
accepted upstream and silently dropped on the way to the engine — both arms then run
IDENTICAL physics and the comparison *looks* like it ran. So, per arm, resolve from the
**running universe** and check before believing one pixel:

- the effective wavelength, read from a live quantum;
- the emitter birth centroid;
- the detector geometry as actually built;
- the derived relationship your recipe pins (e.g. leg distance = the declared fraction
  of λ), recomputed from those resolved values.

A check driven off your own geometry function cannot catch this — it asserts the map,
not the territory. And match the PHYSICS, not the knob: the same knob value over a
different mass/capacity is a different world; compare λ_eff, not settings.

## Comparing two readouts

**Read the count-axis maximum on each chart before reading the curves.** Auto-scaling
readouts make two arms of different magnitude look identical at a glance — a whole
missing band has hidden this way. Auto-scaling hides exactly the difference an A/B test
exists to find. Also check whether the readout's axis orientation matches the scene's;
a mirrored axis is harmless for a symmetric pattern and lies about an asymmetric one.
