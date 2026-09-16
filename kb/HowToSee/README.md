# How To See — the FRQTL visual-experiment method

This corpus teaches an agent to run a FRQTL experiment **the way a human experimenter
does**: compute a few numbers before building, build by composing published parts, then
**look at the picture and trust what you see**. It exists because the single most common
failure of an LLM at this bench is reaching for code and statistics instead of eyes.

**This corpus holds NO physics constants.** Every number an experiment needs — beam
parameters, prediction rules, grain thresholds, landed reference results — lives in a
**recipe** (the `Recipes` knowledge base). The method here is generic; a recipe supplies
the numbers. If you are asked for a constant and it is not in your recipe, the answer is
"my recipe does not carry that," never a guess.

## Reading order

| Doc | What it teaches |
|---|---|
| `look-then-claim.md` | Who you are; the three facts about the engine; look first, statistics after |
| `units-and-anchor.md` | Pixels and ticks; λ as the one length; the c-anchor that gives a scene physical scale |
| `two-clocks.md` | The settle clock and the counting clock — the two run-length questions, and the trap between them |
| `resolution-gate.md` | Structure smaller than a few pixels does not exist — the grain check |
| `instruments.md` | Match the instrument to the quantity; provenance or it didn't happen |
| `falsifiable-glance.md` | Two arms, one value apart, one named pixel — designing a look that can fail |
| `when-the-picture-is-wrong.md` | The six-step iteration loop; stop-and-report; a null is a finding |
