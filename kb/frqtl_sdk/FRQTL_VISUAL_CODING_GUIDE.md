<!-- Copyright 2023-2026 by Essam Abadir -->
# FRQTL Experiments Programming Guide — "Visual Coding"

**Companion to [`FRQTL_VISUAL_CODING_GUIDE.jsonl`](FRQTL_VISUAL_CODING_GUIDE.jsonl)** — a growing Q&A training set that teaches an LLM (or a new human author) to translate physical concepts ("smoke", "a flash of light", "a projectile", "a gun shot") into terse, machine-readable FRQTL **sugar**, and to explain the primitives / op-programs underneath when sugar is not enough.

FRQTL programming is **wildly different** from ordinary coding: it is *visual* and *emergent*. The single most common failure — for every LLM agent that has touched this codebase, and for new humans — is the trained instinct to **program a physics behavior directly** instead of setting up initial conditions and letting the behavior **emerge**. This guide exists to retrain that instinct.

## Ground truth: run a scene and look at it

**The eye is the acceptance instrument.** FRQTL scenes are fractal and non-linear; a static number cannot tell you a scene is right before you have drawn it. So the way you check your intuition — and the way you check your work — is to run the smallest scene that isolates the thing you are unsure about and watch what it does. Change one knob, run it again, watch what moved. That loop is the development workflow; there is nothing to run instead of it.

The engine's elementary behaviors below are the ones worth having concrete intuition for before opening a complex experiment. Each is a settled, measured property of the compiled Rust→WASM engine this package ships — build a small scene for any row you cannot predict, and watch it hold.

| Group | IDs | What it proves |
|---|---|---|
| Movement | M1–M5 | Speed limit (1px/tick); fullness→speed (P=mass/capacity); `speed_prob` override; `wavelength=capacity/mass`; inertia |
| Spatial | S1 | x-walk ≡ y-walk ≡ z-walk — 2D and 3D use the SAME physics per axis |
| Collision | C2, C3, C5 | Two-bucket conserving bounce; density→timing (rigid fast, soft slow); z-hit ≡ x-hit |
| Hierarchy | H1, A1, A2 | Parent = sprite group, mass = child count; compress = emergent attraction (no F=ma); recursive relativity |
| Sugar | SU1 | A setup factory produces the SAME physics as raw engine calls (sugar adds zero new physics) |

**Engine-vs-sugar guard (SU1):** sugar adds zero new physics. If a sugar change makes a scene behave differently — the same setup, the same seed, a visibly different result — physics has leaked into the convenience layer. That is the bug.

## The one rule that governs everything

> **You do not program the behavior. You set up the initial conditions and let the engine enact it.**

There is no force code, no `applyGravity`, no `makeBillow`. You declare an emitter, a few universe knobs (`activeAxes`, `withInterQuantumCollisions`, `addDimension`, wavelength), and render options — and smoke billows, light flashes, atoms form, waves interfere. If your draft *computes or imposes* the visible effect, you are coding the wrong layer.

## The four layers (one-way arrows, top to bottom)

| Layer | What it is | What you touch |
|---|---|---|
| **Render** | BYO RendererProvider (three.js/p5). Paints `TickData`. Output-only — never feeds physics. | `setRenderOption(...)` |
| **Sugar** | Engine-agnostic objects + setup factories (emitter, `LargeObject`, `Bullet`, `OvenBox`). Declares initial conditions; compiles collision intent to op-programs. | **almost everything you write** |
| **Interpreter / contract** | The shim: the op-program AST, `actionCompiler`, the property-accessor substrate, the scope bag. | only to author an op-program |
| **Engine** | Rust/WASM core. A generic property-setter: finds frames in an LO's search region, runs its ops. Knows **no** behavior. | essentially never |

**You write at the Sugar layer.** The table above is the whole picture a consumer needs: everything you author is initial conditions plus render options, and the two layers below it are contract surfaces you consume rather than files you open. When you need more — how a collision op-program is compiled, what the engine will and will not do — ask this app's `frqtl_sdk` knowledge base (fuse `["General","frqtl_sdk"]`), and read the shipped worked examples in the package (`dist/js/game/setup/` for how an experiment is assembled, `dist/js/game/objects/` for how a detector/region object is declared). If an answer seems to require engine or interpreter internals, you are on the wrong layer — re-ask as a sugar question.

## Collision physics: the two-bucket rule

The collision model has **no elasticity coefficient, no restitution formula, and no overlap-volume math**. All of that emerges from one stateless rule (empirically derived, verified in bench C2/C3/C5):

- Each body keeps **two momentum buckets that never mix**: `current` (its own momentum — an exhaustible supply it pays out) and `incoming` (momentum received from the other body, held aside).
- On any overlap the move is **reverted** (single occupancy — no continued interpenetration).
- Each tick each body pays `min(|current|, ceiling)` into the other's `incoming`. The ceiling = overlap-pixel-area × ρ_A·ρ_B (relative occupancy).
- When `current` is **exhausted**, `incoming` is **promoted** to velocity → clean reversal.

What falls out without being programmed: symmetric boxes swap (bounce); timing ∝ 1/density (denser → faster bounce, bench C3); the heavy box plows through the light one; momentum is conserved in every case. Every one of those is a measured golden in the bench (C2/C3/C5) — run it and read the numbers rather than deriving them.

**No elasticity/restitution knob exists** — "how bouncy" a collision is is purely a function of each body's fullness (mass/capacity). Do not look for a restitution setting; tune fullness instead.

## Render is shape/color as data

All render intent rides `string_map` keys in the frame's opaque data bubble — the engine carries those strings and interprets nothing (I1). The **value vocabulary is owned by `lib/shim/frame-data`** (`RENDER_INTENT_KEYS` + `RENDER_INTENT_VALUES`); the decoders below **ferry it by reference** — they never re-list it (drift gate: `lib/shim/frame-data/test/render-intent-contract.test.mjs`).

| Authority | File | What it decodes |
|---|---|---|
| **`RenderShape`** | `lib/frqtl/compat/renderer/RenderShape.js` | Per-frame shape: `'ball'` (glow sprite) \| `'box'` (solid square) \| `'circle'` (outline) \| `'cube'` (true 3D InstancedMesh, 3D only). `RenderShape.resolve(frame, renderOpts)`; `VALID_SHAPES` is FERRIED from frame-data. Priority: `string_map['render.shape']` → `setRenderOption('shape',…)` default → `'ball'`. |
| **`LightColor`** | `lib/frqtl/parts/LightColor.js` | Color (by fullness/frequency) and alpha (by intensity). `LightColor.getRgbBySchemeName(scheme, v01)`. Schemes: `'warmcool'` (default) and `'roygbiv'`. |
| **`RenderMesh`** | `lib/frqtl/compat/renderer/RenderMesh.js` | External-geometry routing: `render.mesh` (OPEN-ID — any asset id, e.g. an Objaverse glTF). `RenderMesh.resolve(frame, renderOpts)` → asset id or `null`. The renderer loads/caches the asset and FAILS LOUD on load failure. |

`render.color` rides `string_map['render.color']` as CSV `'r,g,b,a'`; `render.outline` rides `string_map['render.outline']==='true'`. Two key shapes: ENUM keys (`render.shape`/`render.colorScheme`/`render.outline` — a value list, ferried) and OPEN-ID keys (`render.color`/`render.mesh` — any string, validated at the renderer boundary). **Never re-implement a color map, shape dispatch, or value list in a renderer.**

### The engine emits primitives; you DERIVE interpretation from FrameData

The engine emits generic FrameData primitives — `mass`, `fullness`, `w`, `h`, `layer`, `child_count`, position/velocity. **All render interpretation is derived from these by the renderer/sugar — the engine never grows a field for a derivable render quantity**. Because `capacity = w·h` and `wavelength = K·(capacity/mass)` (Invariant 6), *frequency / wavelength / capacity are derivable renderer-side* — so "color by frequency", "tint by wavelength", and "route a frame to a loaded mesh (`render.mesh`)" are renderer/sugar choices reading FrameData, **not** engine changes. A render feature needs an engine change ONLY for a genuinely new *measured primitive* — never a derivable quantity.

## 2D vs 3D

The spatial axes `x`, `y`, `z` are **identical in physics** (bench S1 and C5 confirm this with measured goldens). "2D" and "3D" differ only in which axes are active and whether the camera is orthographic or perspective:

| What | How |
|---|---|
| Enable 3D physics | `universe.activeAxes = { x:true, y:true, z:true }` |
| Switch camera to perspective (orbitable) | A scene states it in its first call, `exp.createScene(w, h, d, cfg)` (three, perspective, `activeAxes {x,y,z}`); an experiment page boots the three display (`bootPage({ renderer: 'three' })`) and builds its runner with `is3D: true` |
| Camera sugar handle | `runner.cameraControl` — the renderer's `getCameraControl()` result: a handle in 2D too (it declares `{distance, target}` in `poseFields`), null only with no pose control. A scene is 3D when `OrbitBag.hasAngularPose(runner.cameraControl)` — never branch on handle presence or `if(engine==='wasm')`. Wire presets/UI widgets to this handle. |
| 3D ejects from LOs | Use `reposition:'closest3d'` (6-face) instead of `'closest'` (4-face) |

Two senses of "dimension" that authors must keep distinct: **engine dimension** (`addDimension` — aggregation scale, the render-layer axis) vs **spatial 3D** (`activeAxes:{x,y,z}` — the x/y/z position axes). They are orthogonal.

## Game-engine Rosetta

| Game engine | FRQTL |
|---|---|
| sprite / particle | leaf **quantum** (`is_leaf` frame) |
| sprite group | collision-parented **frame** (dimension > 0) |
| render **layer** | engine **dimension** (a *scale/aggregation* axis — **not** spatial) |
| world update tick | engine **tick** (`doTick()`) |
| draw pass | `doRender(tickData)` (strictly separated) |
| trigger volume + `onCollision` | a **LargeObject** + collision op-program |
| `update()` callback | an `experimentTickFunctions` tick-fn |

## File format

Each line of the `.jsonl` is one object:

```json
{"category": "...", "concept": "...", "q": "...", "a": "..."}
```

- **`category`** — one of: `mental-model`, `game-engine-correspondence`, `translate` (physical-concept→sugar), `ops` (primitives/op-programs), `render`, `2d-3d`, `discipline`, `worked-example`, `anti-pattern`.
- **`q`** — the question / prompt (how a developer would ask it).
- **`a`** — the answer: terse sugar code where possible, plus the *why* (the emergence reasoning, the primitive explanation).

It converts trivially to chat-format fine-tuning data — map each entry to `{messages:[{role:"system", content:<the rule above>}, {role:"user", content:q}, {role:"assistant", content:a}]}`.

## How to extend it

This is a **living training set** — add entries as new hard-won tricks surface. Rules of thumb:
1. Every `translate` entry should answer "make `<physical concept>`" with **terse sugar** + the emergence reasoning, never a behavior function.
2. Prefer citing the canonical pattern (`setupFxSmoke`, `OvenBox`, `Bullet`, the Blackbody thermostat) over inventing new primitives.
3. When you add an entry that touches the engine/interpreter, cross-check it against the layer table — most "I need the engine to…" turns out to be "I need a tick-fn / op-program / render option."
4. Keep answers self-contained; a reader (or model) should act without chasing five files.
5. Validate after editing: every line must be parseable JSON. From the directory holding the corpus: `node -e 'require("fs").readFileSync("FRQTL_VISUAL_CODING_GUIDE.jsonl","utf8").trim().split("\n").forEach(l=>JSON.parse(l))'`.
6. New physics facts must be grounded in an observed run — a scene you built, ran, and looked at — never asserted from type signatures or intuition.

## The anti-pattern, stated once more

If you catch yourself writing a function that **iterates frames to move them**, applies a force, decides "this is smoke now", or **times effects on/off** to fake a sequence — stop. Replace it with: an emitter + universe knobs (let it emerge), an LO collision op-program (declarative region reaction), an `experimentTickFunctions` tick-fn (per-tick control), or a `setRenderOption` (render-only). The engine enacts; your sugar only sets up.
