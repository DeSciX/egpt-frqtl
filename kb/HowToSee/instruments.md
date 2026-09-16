# Instruments — match the instrument to the quantity, and stamp everything

> How-To-See corpus. Method only; the numbers live in your recipe.

Before capturing, ask what quantity your claim is about. Getting this wrong sends
experiments into tick-sweeping expeditions that cannot succeed.

| Your question | Instrument | What it is |
|---|---|---|
| Did I build the apparatus I meant to? | **field still / composite capture** | INSTANTANEOUS — quanta in flight at one tick |
| Where does accumulation land? (the physics) | **counting surface + its readout** | INTEGRATES over the whole run |

**A field still can never show the accumulation pattern**, at any tick. The in-flight
population saturates right after settling and then stops changing. Do not sweep ticks
looking for a pattern in it.

## The counting surface is a piece of paper in the scene

A counting surface is an instrument standing IN the scene, and its reading is a sample
over time — like a piece of paper in front of a light source, whose temperature is a
real reading that builds. **The nature of the paper changes the reading, and that is a
property, not a defect:**

- a **transparent (non-absorbing) probe** counts without removing quanta and reads
  **flux** — the density at that plane;
- a **destroying plate** reads **first arrivals** — a different quantity, landing at
  different radii.

Your recipe names the detector, its thickness, and the sinks its experiment uses.
Follow it, and NAME which paper you used in your report. If you deliberately change the
paper, that IS the experiment — say so, and expect a different reading, not a broken
one. A thick flux probe smears fine structure; your recipe carries the thickness that
resolves its bands.

## Capturing — the eyes are part of the SDK

The published capture stack is how you see:

- `require('@descix/frqtl-sdk/eyes')` → `openHostedEyes({...})` → `getStill(...)`
  returns provenance-stamped stills of the real rendered scene (guide:
  `COMPOSE_AND_CAPTURE.md` in this app's corpus).
- `capture('field')` is the renderer-free heightfield tap — the cheap machine channel
  for scoring and search; pay for the full composite only on frames you actually look at.

**Every capture carries a provenance stamp** — tick, seed, scene identity. **If you did
not produce a provenance record, you did not measure anything.** A screenshot of a
browser window with no tick, no seed, and no scene identity cannot be tied to the world
that produced it and is not citable evidence.

And then: **actually open the images and look.** A capture you did not view is not
evidence.
