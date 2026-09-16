# Simulating Reality — The FRQTL Physics Engine

*FRQTL — the FRame And QuanTum Language — is a discrete physics engine. It has roots in computer graphics, but it does not work like Box2D or the Unreal engine. Those solve field equations and impulse approximations to fake physics convincingly. FRQTL runs the constructs of Einstein, von Neumann, and Ulam directly — discrete quanta, relativity frames, and stochastic walks — and lets real physics emerge from them. This is a guide to how it works and why it is more than a simulation.*

*FRQTL is a product line. **This version targets desktop and mobile browsers** — it deliberately does not compute every invisible particle or every raindrop in a far-off storm, because an interactive consumer experience does not need to. (Scientific-computing builds for supercomputer clusters, which may want exactly that, are a different release.) Even this consumer-grade engine unlocks methods no other physics engine can touch — but it asks you to think differently about what a physics engine is. The rest of this guide is about that different way of thinking.*

---

## Part 0 — Why FRQTL works

You can use FRQTL without this part. But the reason it works — and why it is not a toy — is worth a few minutes.

### The premise: the universe is discrete

Mainstream physics is written in calculus: continuous space, continuous time, forces with infinite reach. Elegant, and computationally brutal. If every particle influences every other at once, predicting the future is O(Nᴺ) — for 100 particles that is a 1 followed by 200 zeros, beyond any machine that could ever be built. The N-body problem has no closed-form solution (Poincaré), so engines approximate, and the approximations introduce the very errors that limit progress in fusion, materials, and medicine.

FRQTL takes the other road: **the universe is fundamentally discrete** — pixels on graph paper, ticks like frames of film. Space comes in indivisible pixels, time in indivisible ticks, and **nothing moves faster than one pixel per tick** — an absolute speed limit, the discrete speed of light. That single limit pegs space and time together (1 pixel = space, 1 tick = time, so 1 px/tick = *c*) and makes the whole system *scale-invariant*: the same rules govern a quantum and a galaxy. From these simple local rules, the behaviors of real physics — waves, interference, gravity, structure formation — *emerge*. There are no force equations anywhere in the engine.

### von Neumann's stochastic computer

In *The Computer and the Brain*, John von Neumann argued the brain is not a digital machine but a **statistical** one: it computes with probabilities and noise, not exact arithmetic. FRQTL is that machine. Stochastic particles obey physical constraints — single occupancy, the speed limit — exactly the way electrons and photons do in a real circuit, and the answer *emerges* from their walks. The computational method underneath is **Monte Carlo**, the Ulam–von Neumann technique of solving hard problems by letting many random samples run under the real constraints and reading off the statistics. FRQTL is Monte Carlo given a physics machine to run in.

### The 1931 claim, and the 1956 concession

This is not a recent idea. It is the resolution of a conversation begun in 1931.

In a [letter to Kurt Gödel dated January 12, 1931](https://frqtl.com/history/von-neumann-godel-1931.md), von Neumann opens by announcing "a method that always allows a **finite decision** for the effective provability question" for propositions built up from *not*, *or*, *and*, *implies*, and *provable* — which is exactly what we now call Boolean satisfiability, CNF. A finite decision procedure: decidable, and provable. In the same letter he **flatly rejects Gödel's view that intuitionism (constructive mathematics) cannot be formalized**, and challenges Gödel to name a single construction that cannot be formalized in his system. Before complexity classes existed, "a finite decision procedure" for this class of problems meant one thing: it terminates in a bounded number of steps. It meant polynomial.

Gödel never names that construction. For twenty-five years. Then, in his now-famous [1956 letter to von Neumann](https://frqtl.com/history/godel-von-neumann-1956.md), he concedes the point that anticipates the entire P-versus-NP question:

> "...in spite of the undecidability of the *Entscheidungsproblem* ... it seems to me, however, to be completely within the realm of possibility that the complexity φ(N) grows only **polynomially**. For it seems that **φ(N) ≤ KN²** is the correct order of magnitude... since every proof consists of a sequence of propositions each of which is either an axiom or is obtained from earlier propositions by a small number of logical rules."

Gödel's "correct order of magnitude" is **KN²** — quadratic. Hold onto that number.

### The honest cost of computation

Here is the part everyone gets wrong, and we will not hedge it.

The honest measure of a computation is the number of steps actually taken — its **entropy**. Every real step is a physical event and costs something. **Big-O notation lets you not count steps.** It treats a memory access as O(1) as though fetching a value were free. It lets the Fast Fourier Transform "drop" from N² to N log N — but only because it does not count the precomputed twiddle tables that the speedup depends on. Those steps did not vanish; they were paid for in advance and then left off the bill. Big-O is bookkeeping with permitted blank lines.

Strict step-counting has no blank lines. It is what the Lean proof assistant enforces at the compiler level: every step is accounted for, no no-ops, nothing free. Under that honest accounting, Gödel's KN² is the order of magnitude — **O(N²)** — and the sub-quadratic bounds of the textbooks are artifacts of uncounted work. This is the standard FRQTL is built on: stochastic computing at the **absolute limit of entropy** set by [Shannon's Coding Theorem](https://frqtl.com/history/shannon-coding-theorem.md), where every step is a real, counted, physical event. Nothing is free, because in physics nothing is free. (The scientific-computing builds realize this bit-for-bit; this browser release applies the same discipline while approximating the invisible — see *Which FRQTL this is*, below.)

### Why you should believe this

There are two kinds of proof here, and FRQTL supplies the second.

The **mathematical proof** is in Lean: the [P = NP proof chain](https://frqtl.com/history/p-equals-np-proof-chains.md) is sorry-free, axiom-clean, and compiles. The **visual proof** is FRQTL. It encodes reality and renders it, live, in your browser — not a movie, not a mock-up, not a curve fit. It runs, it compiles, it proves, and you can watch it.

The burden of proof is reversed. **If this were wrong, FRQTL could not compute what light does** — yet it reproduces double-slit interference from nothing but particle walks. **It could not simulate a working logic circuit** — yet it runs a half-adder built from diffusing particles, with no equations, in your browser. Everything is verifiable in every way at once: the math compiles, the physics renders, the circuits compute. To dispute the claim you do not get to cite intuition or a textbook; you have to find the line of math that fails to compile or the experiment that fails to run. There isn't one.

### Attraction is gravity (and Coulomb, and quantum gravity)

The one "force" in FRQTL — particles nudging toward the center of their parent frame — is not a force at all. It is a statistical inevitability.

[*Emergent Inverse-Square Laws from Cellular Automata*](https://frqtl.com/history/emergent-inverse-square-laws.md) shows that two swarms of particles doing single-occupancy random walks on a grid **interact with probability P ∝ m₁m₂ / r²** — the exact form of Newton's law of gravitation, and with one charge bit, Coulomb's law. The "force" is the **Shannon entropy** of that interaction's probability distribution (justified by the constructive proof of [Rota's Entropy Theorem](https://frqtl.com/history/rota-entropy-theorem.md), which establishes Shannon entropy as the unique measure for any physically reasonable system). The constants G and k_e are demoted to unit-conversion factors that turn a unitless probability into human force units. [*Without Attraction, You've Got Nothing*](https://frqtl.com/history/without-attraction.md) extends this to a scale-invariant Einsteinian physics that unifies quantum mechanics and general relativity without superposition — Brownian balls inside relativity-frame boxes, gravity at every scale.

The practical payoff, and a thing people get wrong: **you do not have to simulate every raindrop.** In a storm the lowest-pressure point is between two people, so the wind pushes them together — predictable from the aggregate without tracking each drop. FRQTL gets this for free, but **not** by computing an average-pressure term. It gets it from **scale-invariant recursion**: a parent frame is itself a single ball inside *its* parent's box, so a cluster compresses as one unit at its own scale. The aggregation is structural, built into the frames-of-frames hierarchy — there is no pressure subroutine, and you should never add one.

### Thinking in FRQTL: compute only the emergence you need

This is the mental shift, and it is the whole reason FRQTL is fast enough to run in a browser.

FRQTL behaviors are **fractal and emergent** — they build up, level by level, the way a Koch snowflake develops from a triangle through successive iterations. Crucially, **you rarely want to start from iteration zero.** Most of the time your experiment is meant to begin at a level of development that has *already emerged* — a particular FRQTL dimension — and FRQTL lets you **skip straight to it**, the way you can draw a well-developed snowflake without redrawing every earlier stage.

Two consequences follow:

- **Brownian motion and top-down frame generation (`frameGenMode:'topDown'`) are root-level drivers.** They are what *generate* the statistical behaviors — waves, fields, structure — from the bottom up, and they are expensive. Most of the time you do not want to pay for that: you want the already-emergent (still stochastic) wave behavior, or you only care about a specific band of dimensional layers. Turning those root drivers on is asking the engine to grow the snowflake from scratch.
- **Different experiments care about different layers.** The double-slit does not need quantum gravity from the blackbody or the strong force from atomic formation; atomic formation does not need the blackbody's gravity; and a game or a piece of CGI wants almost none of it. You choose the layers your phenomenon lives on and let the rest go uncomputed.

Even the attractive `compress()` and parent frames are, themselves, an **optimization.** As the gravity paper shows, you could get *all* of this emergent behavior from nothing but leaf frames and inter-quantum collisions — but you would be doing an astronomical amount of calculation. Compress and the frame hierarchy are the shortcut that delivers the same emergent gravity at a fraction of the cost.

So FRQTL unlocks programming things no field-equation engine can — but it asks you to think in terms of *which emergence you need and at which scale*, rather than "simulate everything." The flags and convenience settings exist to make that easy, and their defaults are chosen for the common case.

### Which FRQTL this is

Hold the two ideas together. The strict, every-step-counted, entropy-limit computation described above is the **principle** FRQTL is built on and what the **scientific-computing builds** deliver bit-for-bit. **This browser release is the consumer engine**: it honors the same physics and the same discipline, but it deliberately *approximates the invisible* — skipping the far-off raindrop and the unneeded layer — to stay interactive on a phone or a laptop. It is approximate **by choice**, not by limitation, and it still does things no other engine can.

---

## Part 1 — Core concepts

### The three axioms

Everything reduces to three indivisible units:

- **Time** = 1 **tick**.
- **Space** = 1 **pixel**.
- **Mass** = **occupancy** — the count of leaf quanta inside a frame.

A universe-level scale factor lets you map a pixel to a Planck length or a meter, but the engine only ever counts ticks, pixels, and occupancy. The binding rule — **1 pixel per tick** — ties space and time together and is what makes the physics scale-invariant.

### The Frame Axiom

**Everything is a Frame.** There is no separate particle class. A "quantum" or fundamental particle is simply a *leaf* Frame. By Ulam's law of conditional additivity, every body is at once an **actor** (it moves and collides) and an **inertial reference frame** for its children. The system is strictly recursive and scale-invariant — the same code runs an electron and a galaxy.

### Universe, Dimension, Frame, Quantum

Think in the language of a graphics program:

- **Universe** = the canvas/stage. It holds everything and advances one `tick` at a time.
- **Dimension** = a **layer**, like a Photoshop layer — **not** a spatial axis. Each Dimension holds frames of one size: layer 0 = 1×1 leaf quanta, layer 1 = 2×2, layer 2 = 4×4, and so on by powers of two. *This is the single most common conceptual mistake: Dimensions are scale layers, not X/Y/Z.*
- **Frame** = a sprite/group with a dual nature: a container of children from the layer below, and an object/particle relative to its parent above.
- **Quantum** = the fundamental leaf Frame at the bottom layer.

### The six invariants

1. **The speed limit is absolute.** A leaf frame moves at most **one pixel per tick** — period. This is the discrete speed of light. The actual displacement each tick is a bounded unit step, no matter how much force has accumulated; any push from parent attraction that would carry the leaf past one pixel is stored as **momentum** and spent on later ticks. Momentum is precisely the mechanism that enforces the absolute limit while conserving the parent's influence — the engine never lets a particle exceed *c*, it banks the excess instead.
2. **Single occupancy.** No two leaf quanta share a pixel in the same tick. A failed placement *is* a collision.
3. **Recursive relativity.** A parent's movement is passed to its children as **momentum** (added to their velocity), which they spend on their own subsequent ticks — never as an instantaneous position jump that would break the one-pixel limit. Every frame is an inertial frame for its children; structure holds together because children continually catch up to their parent's motion within the speed limit.
4. **No forces.** No F=ma, no gravitational constant, no continuous force. Only local greedy choices: attraction is a 1px nudge toward the parent's center; repulsion is a collision bounce.
5. **Conservation is emergent.** Mass, momentum, and energy are not tracked variables; they fall out of the movement and collision rules.
6. **Wavelength = capacity / mass.** Every frame is an oscillator (Part 2).

---

## Part 2 — How a tick works

Physics is computed first, then rendered. A tick returns pure data; drawing happens downstream.

### The pipeline

Each tick runs four phases:

- **Injection.** Registered experiment tick-functions emit new leaf quanta (an emitter, a quantum gun), added to the bottom dimension.
- **Structure.** Higher dimensions are (re)built from the fundamental spatial index. This runs only in top-down (`frameGenMode:'topDown'`) mode, on an interval.
- **Physics.** For each dimension, low to high: optionally an inter-quantum collision pass, then the core update — **reinit → move → compress → collide → merge → promote** — then re-injection of any escaped children.
- **Collect.** Package the tick's state into data for the renderer.

The engine moves first and collides second within a dimension; this ordering is fixed and should not be reshuffled to chase a test result.

### Movement: two modes

Movement has two mutually exclusive modes, chosen by flags:

- **Wave-walk** (neither top-down frame generation nor brownian on): one step along the velocity vector plus one perpendicular step decided by a biased coin. This is the **leaf-only, free-particle** mode, and it is what produces interference in a double-slit with no parent frames.
- **Brownian** (`frameGenMode:'topDown'` or `brownianMotion` on): a random −1/0/+1 step weighted by velocity, accumulated into the velocity. This is the correct mode for **parent-child oscillation**.

Choose the mode the experiment's physics requires; never switch modes just to make a test pass.

### Attraction (gravity)

For each off-center child, the compress step applies a **deterministic** ±1 nudge toward the parent's center, added to the child's **velocity** (its momentum), not directly to its position. That is the whole of gravity — and because the nudge lands in momentum rather than displacement, it never lets the child exceed the one-pixel-per-tick limit; it just biases where the child walks over the ticks that follow. As Part 0 explained, this per-child nudge under single-occupancy random walks *is* emergent inverse-square attraction; there is no aggregated pressure term, and the "don't simulate every raindrop" efficiency comes from the recursion, not from any shortcut. (A probabilistic attraction variant is a possible future option, but deterministic is canonical.)

### Collisions: bounce, merge, promote

When single occupancy is violated, the engine resolves it. The basic response is to undo part of a move (bounce). With inter-quantum collisions enabled, two colliding quanta can **merge** and **promote** — a new parent frame is created one layer up, containing both. This is collision-born structure ("entanglement," minimum occupancy two): it is how a flat field of quanta grows a hierarchy.

### The oscillator: wavelength

Every frame is an oscillator. Its wavelength is `max(4, floor((capacity / mass) × WAVELENGTH_CONSTANT))`, which sets a biased coin. Higher mass → shorter wavelength → higher frequency (the E=mc² analog). This oscillator drives wave behavior in **leaf-only** experiments that have no parent to compress against — the double-slit fringes come from this coin, not from parent-child compression.

---

## Part 3 — The knobs (flags)

Flags are **compute/fidelity dials** — they let you choose how much emergence to pay for (see *Thinking in FRQTL*), not on/off correctness switches. They are also the most common source of confusion, and they are **not** all independent: `frameGenMode:'topDown'` force-overrides three others.

| Flag | Default | What it does |
|---|---|---|
| `withInterQuantumCollisions` | off | Turns on inter-frame collisions, merging, and **collision-born parent frames**. Off → leaf quanta pass through each other and no hierarchy forms. This is the switch that makes collisions create parents. |
| `frameGenMode` | `'groundUp'` | How PARENT frames are generated. `'groundUp'` = bottom-up, by actual collisions between the smallest frames. `'topDown'` = by how many frames an area can parent — auto-spawns higher dimensions, an **expensive root-level emergence driver**. Usually left at `'groundUp'`; skip to the dimensional layer you need instead. **Cascades:** `'topDown'` forces brownian on, collisions off, bonding off. |
| `brownianMotion` | off | Selects brownian (parent-child oscillation) vs wave-walk (leaf-only). |
| `noEscape` | off | On → children are trapped to the parent (frustrated motion). Off → an escaped child becomes a free particle (radiation). |
| `withBonding` | off | Bond vs charge-flip on collision. |
| `emergentPhysics` | — | **RETIRED 2026-08-05 — it THROWS.** It was the boolean this table's `frameGenMode` row replaced, so migrate the VALUE and not just the name: `emergentPhysics: true` becomes `frameGenMode: 'topDown'`, `emergentPhysics: false` becomes `frameGenMode: 'groundUp'`. |
| `noObserverFrame` | — | **RETIRED 2026-08-05 — it THROWS.** It was the INVERTED alias of `brownianMotion` (`noObserverFrame:true` meant `brownianMotion:false`, i.e. wave-walk), and its `false` was inert. Wave-walk is already the default, so **omit the key**; pass `brownianMotion: true` only if you want the random walk. |
| `is_stationary` (per-frame) | off | Pins a frame in place (e.g. a nucleus) — a pedagogical override. |
| `withWrapping` | off | Currently unused — accepted for signature compatibility only; has no effect on either engine. |

To enable collision-born structure, set `withInterQuantumCollisions = true` and leave `frameGenMode` at `'groundUp'` (`'topDown'` would force collisions back off).

---

## Part 4 — Worked experiments

No one can read spatial behavior off tens of thousands of per-particle steps, so each experiment ships a captured figure — a screenshot of the real engine at a fixed tick, with the read-off written down. These run live in the browser; the figures are ground truth.

| Experiment | What emerges | Key knob |
|---|---|---|
| **Double-slit** | Wave-particle interference fringes from purely particle paths through two slits | `wavelength` (master geometry knob) |
| **Wave interference** | Fringe spacing from the per-frame oscillator | `wavelengthScale` |
| **Blackbody** | The blackbody spectrum from quanta thermalizing | `temperature` |
| **Atomic model** | Emergent electron orbit via attraction to the nucleus; quantized levels via fullness | `quarksPerProton` |
| **Big Bang** | Structure formation — higher dimensions auto-spawn as quanta collide | `lightSourceDiameter` |
| **Circuit-SAT** | Logic gates (a half-adder) from particle diffusion, no equations — the bridge to P = NP | circuit geometry |

The double-slit and the half-adder are the two to watch. One shows FRQTL reproducing the canonical mystery of quantum mechanics from particle walks alone. The other shows it computing — a working logic circuit emerging from diffusion, with no logic equations anywhere. Run them yourself at [frqtl.com](https://frqtl.com).

---

## Part 5 — On the roadmap

One capability is designed but not yet built: the **Monte-Carlo swarm.** Today FRQTL runs on a single device. The design distributes a simulation across many nodes, each running the algorithm with *different parameters* — the Ulam–von Neumann parameter sweep, which is also the most direct bridge to the P = NP / Circuit-SAT framing, since the sweep *is* the non-deterministic search. The first step toward it is on-machine multithreading, not a distributed server.

---

## Learn more

- The 1931 and 1956 letters: [von Neumann → Gödel, 1931](https://frqtl.com/history/von-neumann-godel-1931.md) · [Gödel → von Neumann, 1956](https://frqtl.com/history/godel-von-neumann-1956.md)
- The gravity papers: [Emergent Inverse-Square Laws from Cellular Automata](https://frqtl.com/history/emergent-inverse-square-laws.md) · [Without Attraction, You've Got Nothing](https://frqtl.com/history/without-attraction.md)
- The information theory: [Rota's Entropy Theorem](https://frqtl.com/history/rota-entropy-theorem.md) · [Shannon's Coding Theorem](https://frqtl.com/history/shannon-coding-theorem.md)
- The proofs: [the P = NP proof chains](https://frqtl.com/history/p-equals-np-proof-chains.md)
- Run the experiments live at [frqtl.com](https://frqtl.com).
