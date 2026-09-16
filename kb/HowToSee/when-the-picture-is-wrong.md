# When the picture is wrong — the iteration loop, and when to stop

> How-To-See corpus. Method only; the numbers live in your recipe.
> Source: FRAQTL visual-bite skill §6–§7 @ `335bbc15`; distilled 2026-08-07.

Not seeing the expected pattern means **the set-up is wrong**, not that the physics is
interesting. Work this order; do not write an analysis instead:

1. **Wrong instrument for the quantity?** Are you hunting an accumulation pattern in a
   field still? (See `instruments.md`.)
2. **Detector in the wrong place?** Re-derive the leg from the recipe's rule; check the
   resolved readback from the running world.
3. **Wrong data — flux vs first arrivals?** Flip the detector preset, re-capture.
4. **Below the grain?** (See `resolution-gate.md`.) Raise λ, or claim fewer bands.
5. **Not enough counting?** Run longer past settling. This is the ONLY fix for
   graininess. (See `two-clocks.md`.)
6. **Detector too thick?** A fat flux probe smears bands together.

Each is a one-line change and a re-capture. If all six are clean and the picture still
disagrees, **that is a finding — report it LOUDLY as a null.** A null result on a
physics change is a result, never a failure to smooth over.

## Stop and report — do not reconcile it yourself

If an instruction contradicts something you have **observed**, stop and report what you
saw. Do not quietly reconcile them. **Suspect the instrument — including your
coordinator's arithmetic — before the engine.** A seat that stopped and showed its
records once saved a build cycle: the coordinator's order was based on a misread
column, and the seat was right.

Also stop — and file a gap request rather than working around — when you need:

- engine code, a new object type, or a contract change;
- a part or instrument that the published SDK does not expose;
- documentation the corpus does not contain.

**Never break the clean room.** Working around a missing surface with an improvised
local hack destroys the value of the run: the gap you would have filed is exactly the
product signal the platform needs. The request IS the deliverable.
