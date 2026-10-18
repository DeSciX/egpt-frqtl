# Getting Started with FRQTL

*For the agent assisting a developer (and the developer too). Just enough to start, know where to look, and not reinvent the wheel.*

FRQTL is a discrete particle-physics engine for real-time light and wave effects — dynamic 2D light sources, interference patterns, and detector statistics computed live from **integer cellular-automata rules** (an integer/IOP core compiled Rust→WASM; floats exist only at the sugar boundary and are quantized on entry). You don't program the physics with field equations — you set up conditions and watch what emerges. **Your user's eyes are the verification instrument.** It plugs into P5, Three.js, Unity, or Unreal.

## 1. See it first

- Browser IDE (no backend, no account): **https://egpt-frqtl.descix.net** · STUDIO authoring deep link: https://egpt-frqtl.descix.net/?preset=author
- Deep-link keys (query string): `preset=author|ide|codec|compare` · `walkthrough=<rung id>` with optional `mode=<mode id>` (a walk-through scene, e.g. `?preset=author&walkthrough=r8-sun` for Sun, `?preset=author&walkthrough=dse-tunnel-rebuild&mode=2d`) · `project=<name>` with `preset=author` (a saved STUDIO project) · `notebook=<id>` with `preset=ide` (a FAT notebook, e.g. `gallery-collision-matrix-3d`). An unknown id, an undeclared mode, or a `walkthrough` beside a `project` shows a named "Deep link error" instead of a scene.
- Live wave interference: open https://egpt-frqtl.descix.net/ and pick the **Wave Interference** notebook from the IDE's **Gallery** group
- Self-contained double-slit page (works inside a claude.ai artifact): https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.0/dist/artifact/double-slit.html

## 2. Install

FRQTL ships as two packages built from one source (`0.6.0`, npm dist-tag `latest`):

```bash
npm install @descix/frqtl-web     # the browser
npm install @descix/frqtl-node    # node (headless, same WASM engine)
```

A deeper specifier than the rows below is not exported and fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.

| Import | What it gives you |
|---|---|
| `@descix/frqtl-web` / `@descix/frqtl-node` | the **same symbols in node and the browser** — `CaptureEnvelope`, `FrqtlCapture`, `engine`, every export of the parts barrel (the parts directory is the roster: among them `LargeObject`, `Wall`, `SphereEmitter`, `Tunnel`, `Trace`, `CameraPath`, `FrqtlVision`, `Rectangle`, `CollisionTypes`, `CollisionActions`) and the renderer-provider contract — plus each host's door: `bootScene`/`bootProject` (web), `bootNode` (node) |
| `@descix/frqtl-web/boot` | browser scene doors: `bootScene(mount, buildExperiment, opts)` (a sketch function) and `bootProject(mount, { files: { 'sketch.js': text }, entry: 'sketch.js' }, opts)` (a project — more files beside the sketch, e.g. a forked part, or a served `{ url, entry }`) — they own the engine boot, the renderer and the loop; the sketch's first statement, `exp.createCanvas(w, h, cfg)` or `exp.createScene(w, h, d, cfg)`, states the world. One boot per page: a second throws, and another scene goes through the returned `recipeContext.build(fn)`. In node this throws immediately, naming `@descix/frqtl-node` |
| `…/parts`, `…/parts/*` | the parts barrel; one part = one file |
| `…/project` | `FRQTL_WEB_SPECIFIERS`, `libPathOf`, `importMapFor` (a page's import map, from the package's own table), `pageImportMapFor` (a host page's map: those rows plus `./boot`, `./registry`, `./project`, `./host-view`; the manifest is read from the root URL, `new URL('dist-manifest.json', root)`), `FRQTL_WEB_HOST_SPECIFIERS` (those host rows `{ specifier, libPath }`: a page holding only its map recovers the root as `imports[row.specifier]` minus `row.libPath`), `linkProject`, `sketchProject` + `SKETCH_ENTRY` (a sketch held as text as the one-file project), `MANIFEST_FILE` + `MANIFEST_KEYS` + `normalizeManifest` + `parseManifest` + `serializeManifest` + `manifestFor` (the one owner of a folder's `frqtl.json`: name, kind, entry, version), `projectIdentity`, `RECORD_FILES` + `RECORD_KEYS` + `CHANGE_KEYS` + `OPS` + `BY` + `CLIP_SECONDS` + `CLIP_NAME` + `clipName` + `jsonText` + `recordFolderFaults` (the one owner of a Record folder's shape: `exp.startRecord()` writes it, `recordFolderFaults(files)` is `[]` for a complete one) |
| `@descix/frqtl-node/eyes` | `FrqtlVision`, `openHostedEyes` — capture a scene through the real renderer from a script: stills (`eyes.vision.getStill`, `eyes.saveStill`) and MP4 video (`eyes.vision.record`, `eyes.saveVideo`) |
| `…/registry` | the scene registry, the **same module in node and the browser**: the walk-through rungs (`walkthroughById`, `effectiveRenderState` for a rung's look as the GYM shows it), the showcase roster, the scene list (`sceneGroups`), and `projectOf(id, { mode })` for a rung as a project folder (`frqtl.json` + `sketch.js`) with its `renderState` beside it |
| `…/kinds` | `registerKind`, `kindNamed`, `kindOf`, `registeredKinds` — the kind registry a composed fork registers its renamed class in |
| `…/host-view` | `declareHostView`, `HOST_VIEW_OUTCOMES`, `CONTRACT_VIOLATIONS`, `HOST_SDK_SCRIPT` — the DeSciX host-view declarer an app calls once, under its own policy |
| `…/dist-manifest.json`, `…/package.json` | the dist's per-file sha256; the manifest |

- **Node (headless, same WASM engine):** `require('@descix/frqtl-node')` or `import { bootNode, LargeObject } from '@descix/frqtl-node'`. The universe class is not on the barrel — it comes off the engine handle `bootNode()` resolves.
- **Browser:** the same rows, wherever bare specifiers resolve (bundler or import map — render the map with `importMapFor`). With no build step, import the doors by CDN URL: `https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.0/dist/frqtl/experiments/_shared/doors.js`, or load the one-file form `https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.0/dist/frqtl-web.min.js` (global `FRQTL`).
- **Pages, not imports:** the web package also ships `dist/sdk.html` (game-object/API reference) and `dist/artifact/*.html` as self-serving surfaces. Open them over a CDN — they are not import doors.

## 3. Where to look (don't reinvent the wheel)

- **Package guide for agents:** https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.0/llms.txt — entry points, exports, pages.
- **How an experiment is assembled:** read a scene before authoring from scratch — the double slit is the sketch `scenes/double-slit.js` (a scene is one module: it imports its parts from `@descix/frqtl-web/parts` and exports `buildExperiment(exp)`), and `DetectorWall` is on the barrel — `import { DetectorWall } from '@descix/frqtl-web/parts'`. To *read* their source, fetch the files by URL (a CDN serves package files regardless of the exports map): https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.0/dist/frqtl/scenes/double-slit.js · https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.0/dist/frqtl/parts/DetectorWall.js — the sugar layer (parts and their knobs, like `wavelength`) is the programming surface.
- **The discipline:** query this app's `frqtl_sdk` knowledge base (fuse `["General","frqtl_sdk"]`) for the FRQTL Visual Coding Guide — the canonical mental model (emergence, the one rule, the two-bucket collision intuition, the anti-patterns). Read it before writing physics.
- **Notebooks:** the IDE carries a gallery of frqnb notebooks (getting-started → experiments); start from one rather than a blank page.

## 4. What not to do

- Don't compute physics in your own code (no wave equations, no force math) — configure the engine and let interference emerge.
- Don't reach for repo internals, engine contracts, or build workflows — everything a consumer needs ships in the npm package and this app's KBs. If an answer seems to require engine internals, you're on the wrong plane — ask the KB instead.
- Hardware-specific optimization (CUDA / Metal / multi-threading) and chip-level integration are part of the FAT commercial licensing tier (NDA) — acknowledge and route to licensing; don't attempt it.

## 5. Falsifiability (one line)

Every claim here is checkable by anyone, offline, no account — by looking. Install the package and open its `dist/index.html`: the scene is computed live from the local per-pixel rules in your own tab, not replayed from recorded data, and the emergent pattern either shows up or it does not. That is the test, and you are the instrument. FRQTL scenes are fractal and non-linear, so a static number cannot tell you a scene is right before you have drawn it — numeric comparison is a design aid for your own harness, never the acceptance criterion.
