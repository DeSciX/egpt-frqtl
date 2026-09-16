# Getting Started with FRQTL

*For the agent assisting a developer (and the developer too). Just enough to start, know where to look, and not reinvent the wheel.*

FRQTL is a discrete particle-physics engine for real-time light and wave effects — dynamic 2D light sources, interference patterns, and detector statistics computed live from **integer cellular-automata rules** (an integer/IOP core compiled Rust→WASM; floats exist only at the sugar boundary and are quantized on entry). You don't program the physics with field equations — you set up conditions and watch what emerges. **Your user's eyes are the verification instrument.** It plugs into P5, Three.js, Unity, or Unreal.

## 1. See it first

- Browser IDE (no backend, no account): **https://egpt-frqtl.descix.net** · STUDIO authoring deep link: https://egpt-frqtl.descix.net/?preset=author
- Live wave interference: open https://egpt-frqtl.descix.net/ and pick the **Wave Interference** notebook from the IDE's **Gallery** group
- Self-contained double-slit page (works inside a claude.ai artifact): https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk/dist/artifact/double-slit.html

## 2. Install

```bash
npm install @descix/frqtl-sdk
```

The package serves exactly four import doors. A deeper specifier is not exported and fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

| Import | What it gives you |
|---|---|
| `@descix/frqtl-sdk` | the parity core — 22 symbols, the **same set in Node and the browser**: `EGPTEngine` plus the fourteen public parts (`LargeObject`, `Wall`, `SphereEmitter`, `SlitScreen`, `DetectorWall`, `Tunnel`, `Trace`, `CameraPath`, `FlightRecorder`, `FrqtlVision`, `Rectangle`, `CollisionTypes`, `CollisionActions`, `setupDoubleSlit`) and the renderer-provider contract |
| `@descix/frqtl-sdk/boot` | browser scene boot: `bootScene`, `bootDoubleSlit`, `bootRecipe` — they own the engine boot, the renderer and the loop. In Node this throws immediately, naming the browser as its host |
| `@descix/frqtl-sdk/eyes` | `FrqtlVision`, `openHostedEyes` — capture a scene through the real renderer from a script |
| `@descix/frqtl-sdk/package.json` | the manifest |

- **Node (headless, same WASM engine):** `require('@descix/frqtl-sdk')` or `import { EGPTEngine, LargeObject } from '@descix/frqtl-sdk'`. The universe class is not on the barrel — it comes off the handle returned by `EGPTEngine.create({ backend: 'wasm' })`.
- **Browser:** the same specifier, wherever bare specifiers resolve (bundler or import map). With no build step, import the boot module by CDN URL instead: `https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk/dist/esm/index.js`.
- **Pages, not imports:** the package also ships `dist/index.html` (physics-facing) and `dist/sdk.html` (game-object/API reference) as self-serving surfaces. Open them as files or over a CDN — they are not import doors.

## 3. Where to look (don't reinvent the wheel)

- **Package guide for agents:** https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk/llms.txt — entry points, exports, experiment pages.
- **How an experiment is assembled:** `setupDoubleSlit` and `DetectorWall` are both on the barrel — `const { setupDoubleSlit, DetectorWall } = require('@descix/frqtl-sdk')` — so compose them before authoring from scratch. To *read* their source, fetch the files by URL (a CDN serves package files regardless of the exports map, but these are not import specifiers): https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk/dist/js/game/setup/setupDoubleSlit.js · https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk/dist/js/game/objects/DetectorWall.js — the sugar layer (factories, objects, knobs like `wavelength`) is the programming surface.
- **The discipline:** query this app's `frqtl_sdk` knowledge base (fuse `["General","frqtl_sdk"]`) for the FRQTL Visual Coding Guide — the canonical mental model (emergence, the one rule, the two-bucket collision intuition, the anti-patterns). Read it before writing physics.
- **Notebooks:** the IDE carries a gallery of frqnb notebooks (getting-started → experiments); start from one rather than a blank page.

## 4. What not to do

- Don't compute physics in your own code (no wave equations, no force math) — configure the engine and let interference emerge.
- Don't reach for repo internals, engine contracts, or build workflows — everything a consumer needs ships in the npm package and this app's KBs. If an answer seems to require engine internals, you're on the wrong plane — ask the KB instead.
- Hardware-specific optimization (CUDA / Metal / multi-threading) and chip-level integration are part of the FAT commercial licensing tier (NDA) — acknowledge and route to licensing; don't attempt it.

## 5. Falsifiability (one line)

Every claim here is checkable by anyone, offline, no account — by looking. Install the package and open its `dist/index.html`: the scene is computed live from the local per-pixel rules in your own tab, not replayed from recorded data, and the emergent pattern either shows up or it does not. That is the test, and you are the instrument. FRQTL scenes are fractal and non-linear, so a static number cannot tell you a scene is right before you have drawn it — numeric comparison is a design aid for your own harness, never the acceptance criterion.
