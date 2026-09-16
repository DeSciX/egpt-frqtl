# Units and the c-anchor — how a scene acquires physical scale

> How-To-See corpus. Method only; the numbers live in your recipe.

## The engine's native units are the pixel and the tick

- **Speed is always 1 px/tick per axis.** The velocity triple `(vx, vy, vz)` is
  DIRECTION only, never magnitude. The effective speed is the move-gate probability
  P_eff (your recipe states it for its beam), times the forward-fraction of the
  emission spread — how much of a step projects onto the flight axis.
- **Wavelength is a derived length in pixels, not a free knob:**
  `λ_eff = (capacity/mass) × wavelengthScale`. The trajectory IS the wave: a
  wave-walking frame traces a triangle wave of amplitude λ/4 and spatial period λ
  along its motion axis, which ensemble-averages into a statistical sine. Engine λ is
  the textbook crest-to-crest wavelength, applied literally to the path.
- **Every apparatus length should be a multiple of λ.** A well-built scene is
  dimensionless in λ — leg, apertures, plate thickness all expressed as fractions of
  λ, converted to pixels in exactly one place. Sweeping λ is then a pure scale change.

## The c-anchor: one calibration choice fixes both scales

A leaf at the fundamental dimension always steps 1 px/tick and nothing in the world
outruns it — so **1 px/tick is the engine's c**. This is a structural property, not a
convention, and it is the key that unlocks physical units:

- You make exactly ONE calibration choice: declare the physical identity of your
  light (what λ physically is).
- That one choice fixes BOTH scales at once: pinning pixels to metres fixes ticks to
  seconds through `Δt = Δx / c`. Space and time are one calibration, not two.

Worked magnitude (illustrative; your recipe carries your λ): with λ_eff = 320 px
standing for 500 nm green light, 1 px = 1.56 nm and 1 tick = 5.2×10⁻¹⁸ s — a 600 px
canvas is ~0.94 µm, and a 60,000-tick run is 0.31 picoseconds.

## The consequence you must internalize

**Run length is NEVER about physical duration in this engine. It is always counting.**
A "long run" is a fraction of a picosecond of physical time; what a longer run buys is
more counted arrivals, i.e. a smoother picture (see `two-clocks.md`). If a duration
ever feels wrong, do the c-anchor arithmetic — it will feel right again.
