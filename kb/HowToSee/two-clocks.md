# The two clocks — settle, then count

> How-To-See corpus. Method only; the numbers live in your recipe.

Every steady-state FRQTL experiment runs on two different clocks, and confusing them is
the single most expensive mistake made with this engine so far.

## Clock 1 — SETTLE: how long until anything at the detector means anything

A scene with nothing moving (a steady-state apparatus) fills up, settles, and then just
accumulates. The settle time is one division:

```
t_settle = longest flight path (px) / (P_eff × f_forward)    [ticks]
```

- `P_eff` — the move-gate probability: 1 if the leaf is born AT the fundamental
  dimension (the gate skips it); else fullness = mass/capacity.
- `f_forward` — the measured forward-fraction of the emission spread (a property of
  the emitter preset; your recipe carries the value for its beam).

This is a MEAN, not a deadline. Your recipe gives P_eff, f_forward, and settle times
for its known layouts; recompute for any layout you change — it is one division.

**Wait past t_settle. Waiting FURTHER buys you nothing at all.** Nothing develops
after settling. A run was once burned sweeping to 65× past settle, trying to make a
pattern "develop." If your captures at two well-separated ticks look identical, that is
not a broken instrument — **that is the steady state, and it is the signal you were
waiting for.**

## Clock 2 — BUDGET: how much counting

Everything after settling is **counting, not physics**. A longer run means a smoother
picture, forever, with no completion point — only "smooth enough to see." Counting is
the ONLY lever that helps graininess.

## The trap between the clocks

Trying to fix a graininess problem by *waiting* (clock 1 thinking) does nothing —
graininess is a counting problem (clock 2). Trying to make structure *appear* by
counting longer does nothing either — if structure is absent after settle, the setup is
wrong or the structure is below the grain (see `resolution-gate.md`). Ask which clock
your problem lives on before touching the run length.
