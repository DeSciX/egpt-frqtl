<!-- Copyright 2023-2026 by Essam Abadir -->
# The Minimal Sim — seven primitives, and everything else is packaging

A FRQTL simulation is, in full: a **universe**, its **dimensions**, **tick-functions**
that add frames, **large objects** that hook the collision sequence, a **loop**,
**TickData** out, and a **renderer** downstream. That is the whole product surface.
`SphereEmitter`, `Wall`, `Tunnel`, every setup factory, the browser IDE — all of it is
packaging over exactly those seven things.

If you have written against Matter.js, Pixi, three.js, or any game engine, the shape is
already familiar. What is different is what you put *inside* the tick-function: you do
not compute the behavior, you set up the conditions and let it emerge. See
[the visual coding guide](FRQTL_VISUAL_CODING_GUIDE.md) for that discipline and, for the
install, query this app's `General` knowledge base (fuse `["General","frqtl_sdk"]`) for
"Getting Started with FRQTL".

---

## 1. The seven primitives

Everything below is on the shipped packages — the compiled Rust→WASM engine plus its game layer,
built twice from one source: **`@descix/frqtl-web`** for the browser and **`@descix/frqtl-node`** for
node (both `0.6.0` on the npm `latest` dist-tag). Their `.` entries carry the same symbols —
`CaptureEnvelope`, `FrqtlCapture`, `engine`, every export of the parts barrel (`frqtl/parts/index.js`
in the dist — the parts directory is the roster; among them `LargeObject`, `Wall`, `SphereEmitter`,
`Tunnel`, `Trace`, `CameraPath`, `FrqtlVision`, `Rectangle`, `CollisionTypes`, `CollisionActions`) and
the renderer-provider contract — plus each host's own door: `bootScene` / `bootProject` on the web
package, `bootNode` on the node package. The universe class is not on that barrel — it comes off the
engine handle `bootNode()` resolves (in a page, the boot does it for you), because a universe only
exists once the engine is up.

The packages serve exactly these doors:

| Import | What it gives you |
|---|---|
| `@descix/frqtl-web` / `@descix/frqtl-node` | the parts, the capture contracts, the engine accessors; plus `bootScene`/`bootProject` (web) or `bootNode` (node) |
| `@descix/frqtl-web/boot` | the browser scene doors that own the loop and the renderer for you: `bootScene` (a sketch function) and `bootProject` (a project: `{ files }` or a served `{ url }`, whose `frqtl.json` names the entry — or `{ files, entry }` / `{ url, entry }` with no manifest). In node it throws immediately, naming `@descix/frqtl-node` |
| `…/parts`, `…/parts/*` | the parts barrel; one part = one file (both packages) |
| `…/project` | `FRQTL_WEB_SPECIFIERS`, `libPathOf`, `importMapFor`, `pageImportMapFor`, `FRQTL_WEB_HOST_SPECIFIERS`, `linkProject`, `sketchProject`, `SKETCH_ENTRY`, `projectIdentity`, `MANIFEST_FILE`, `MANIFEST_KEYS`, `normalizeManifest`, `parseManifest`, `serializeManifest`, `manifestFor`, `RECORD_FILES`, `RECORD_KEYS`, `CHANGE_KEYS`, `OPS`, `BY`, `CLIP_SECONDS`, `CLIP_NAME`, `clipName`, `jsonText`, `recordFolderFaults` (both packages) |
| `@descix/frqtl-node/eyes` | `FrqtlVision` and `openHostedEyes` — look at a scene through the real renderer from a script |
| `…/kinds` | `registerKind`, `kindNamed`, `kindOf`, `registeredKinds` — the kind registry a composed fork registers its renamed class in (both packages) |
| `…/host-view` | `declareHostView`, `HOST_VIEW_OUTCOMES`, `CONTRACT_VIOLATIONS`, `HOST_SDK_SCRIPT` — the DeSciX host-view declarer an app calls under its own policy (both packages) |
| `…/registry` | the scene registry, identical in node and the browser: the walk-through rungs, a rung's look (`effectiveRenderState`) and the rung as a project folder with its look beside it (`projectOf`) |
| the six non-part scene modules and the 17 part-internal modules | each its own subpath, listed in the package README's Exports table (a scene imports the six; only a forked part file imports the 17) |
| `…/dist-manifest.json`, `…/package.json` | the dist's sha256 record; the manifest |

That is the whole map. A deeper specifier — `@descix/frqtl-web/dist/frqtl/...` — is not
served and fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`. Those files still exist in the
tarball and a CDN will hand them to you by URL if you want to *read* the source; they
are simply not import doors.

| # | Primitive | The API | Familiar analogue |
|---|---|---|---|
| 1 | **UNIVERSE** — the world | `EGPTUniverse.create(config)` — the ONE construction authority, taking ONE named config bag, `EGPTUniverse.create({ rect, seed, … })` — `rect` REQUIRED, the one world-rect declaration. A bare `new EGPTUniverse(...)` throws. The key/default/unit/effect table is published as `EGPTUniverse.CONFIG`, and it rejects unknown keys. Its `liveQuantaCap` row (default 300,000; `false` = uncapped) is the preview cap on live leaf quanta: past it `makeLeafFrame` returns `null` and the console warns once. Then **`universe.init(fundamentalDimension, options)` ALWAYS FIRST** — no rect; it reads the one `create` wrote — every simulation method throws before it | the game world / `Matter.Engine.create()` |
| 2 | **DIMENSIONS** — scale layers | `universe.addDimension(layer)`; dimension 0 is created by `init`. A dimension is a *scale* layer (1×1 quanta, then 2×2, then 4×4 …), never a spatial axis | sprite groups / render layers |
| 3 | **TICK-FUNCTIONS that add frames** — where a sim is AUTHORED | `universe.experimentTickFunctions.push(fn)` — called `fn(universe)` before every engine tick, composing the generic primitives `universe.random()` (the one deterministic stream), `universe.makeLeafFrame(left, top, level, wavelength, vx, vy, …)`, and `universe.injectFrame(handle)` | `update()` / a p5 `draw()` body that spawns sprites |
| 4 | **LARGE OBJECTS** — collision hooks | `new LargeObject(universe, rect, collisionType, actions, name)` self-registers — with the engine AND with the world's object census the renderer draws from, so constructing it puts it in the world and on screen in one act — and compiles its behavior to an op-program at registration; the engine runs it in-tick on every colliding frame. Collided-frame data comes back at `tickData.objects[handle].frames` | a collider volume with an on-collide callback |
| 5 | **START** — the loop | any loop calling `universe.doTick()` — a `requestAnimationFrame` closure in the browser, a plain `for` loop headless | `requestAnimationFrame` / the game loop |
| 6 | **TICKDATA** — data out | `doTick()` returns the full per-tick bag: `frameData` (every leaf), `objects[handle].frames` (each large object's colliders), `universeData.tick` | the frame's entity state / a scene-graph snapshot |
| 7 | **RENDERER** — entirely downstream | a renderer provider: `frqtl/compat/renderer/providers/p5-provider.js` / `three-provider.js` in the dist, each exporting `makeProvider()`; the booted DISPLAY provider is the display slot's `get()` (`frqtl/compat/renderer/display-slot.js`). Call `prov.init({ parentEl, width, height })` once, then `prov.renderTick(tickData, largeObjects, options)` per frame. The provider reads TickData and reaches back into nothing | the three.js renderer / a draw call fed a scene |

Writes after construction go through the engine accessors —
`universe.updateObjectProperty` and `universe.setFrameProperty` — which are
throw-or-apply, never a silent skip. `doTick()` returns pure data; drawing is a
separate step, so you can swap renderers (or write your own provider) without
touching physics.

## 2. Rung 0 — a working sim in seven lines of primitives

Headless, on the node package (`npm install @descix/frqtl-node`). This is the complete
path with no host, no factory, no page:

```js
const { bootNode } = require('@descix/frqtl-node');

(async function () {
    const handle = await bootNode();

    // 1. WORLD — build it through the ONE construction authority, then init (ALWAYS
    //    FIRST; everything before init throws). Every other key defaults.
    const u = handle.EGPTUniverse.create({ rect: { left: 0, top: 0, w: 600, h: 400 }, seed: 42 });
    u.init(0, { wavelengthScale: 1 });   // dim 0 = the fundamental layer

    // 3. AUTHOR — a tick-fn that adds one frame per tick. THIS is the sim.
    u.experimentTickFunctions.push(function (uni) {
        uni.injectFrame(uni.makeLeafFrame(20, 200, 0, null, 1, 0));   // born at (20,200), drifting +x
    });

    // 5-6. LOOP → TICKDATA
    let td = null;
    for (let t = 0; t < 5; t++) { td = u.doTick(); }
    console.log(td.frameData.length);   // 5 — five ticks, five leaves
})();
```

In the browser the same sim is one import away (`npm install @descix/frqtl-web`), and
`bootScene` owns primitives 5–7 for you. With a bundler or an import map — i.e. anywhere bare
specifiers resolve:

```js
import { bootScene } from '@descix/frqtl-web/boot';
import { LargeObject, CollisionTypes } from '@descix/frqtl-web/parts';

await bootScene('mount', function (exp) {
    // 1. UNIVERSE — and its canvas, in ONE call: the only place the world's size is written
    exp.createCanvas(600, 400, { dimension: 0, wavelengthScale: 1 });
    var u = exp.universe;
    u.experimentTickFunctions.push(function (uni) {
        uni.injectFrame(uni.makeLeafFrame(20, 200, 0, null, 1, 0));
    });
    // 4. COLLIDER — a wall-shaped large object; its op-program hooks collisions
    new LargeObject(u, [400, 0, 12, 400], CollisionTypes.BOUNCE, [], 'mirror');
});
```

With no build step at all — a plain `<script type="module">` in a page, where a bare
specifier does not resolve — reach the same modules by URL. Import the parts your sketch
uses from the SAME dist the doors come from, so the boot and your sketch share one module
instance of each part (every module loads its own imports relative to its own URL):

```js
const DIST = 'https://cdn.jsdelivr.net/npm/@descix/frqtl-web@0.6.0/dist';
const { bootScene } = await import(DIST + '/frqtl/experiments/_shared/doors.js');
const { LargeObject, CollisionTypes } = await import(DIST + '/frqtl/parts/index.js');

await bootScene('mount', function (exp) {
    exp.createCanvas(600, 400, { dimension: 0, wavelengthScale: 1 });
    var u = exp.universe;
    u.experimentTickFunctions.push(function (uni) {
        uni.injectFrame(uni.makeLeafFrame(20, 200, 0, null, 1, 0));
    });
    new LargeObject(u, [400, 0, 12, 400], CollisionTypes.BOUNCE, [], 'mirror');
});
```

`bootScene` takes your SKETCH — a `buildExperiment(exp)` function whose first statement
creates the world: `exp.createCanvas(w, h, cfg)` for a 2D world drawn by p5, or
`exp.createScene(w, h, d, cfg)` for a 3D world drawn by three (pass `{ renderer: 'three' }`
so the page boots three). That call is the only place the world's size is written — here
the same 600 x 400 world as the Node sim above. `bootScene` boots the WASM engine,
installs the renderer provider, runs the sketch and the loop. A beam walks right, hits
the mirror, reflects. Keep the version pinned in the CDN URL: an unpinned URL resolves to
whatever build is published as `latest`. To serve the package from your own site instead, see
[Self-hosting the SDK](COMPOSE_AND_CAPTURE.md#self-hosting-the-sdk). The one-file form needs no
module script at all: `<script src=".../dist/frqtl-web.min.js"></script>`, then `FRQTL.bootScene(…)`
with `FRQTL.LargeObject` and the other parts.

A page boots once. A second `bootScene` or `bootProject` in the same page throws; another
scene of the same world size goes through the `recipeContext` the first boot returned —
`recipeContext.build(sketch)`; for source text, link it first and hand the facade the linked result (it then
holds that text, which `toSketch` writes into):
`recipeContext.build(await linkProject({ files: { 'sketch.js': text }, entry: 'sketch.js', mint }))`
(`linkProject` is on `@descix/frqtl-web/project`).

`bootScene('mount', ...)` names an element it does not create — `mount` is *your*
page's own div. [minimal-sim.html](minimal-sim.html), beside this guide, is exactly
that page: open it directly (no build step, no server) to see §3's packaged "sun"
running through the real renderer.

## 3. A part packages a tick-fn — and adds ZERO physics

The sugar is the SAME sim. Hand-rolled with primitives, a "sun" is a tick-function:

```js
// A sun, by hand: 20 births/tick, uniform direction via ball-rejection (R = 24)
u.experimentTickFunctions.push(function (uni) {
    for (var n = 0; n < 20; n++) {
        var vx, vy;
        do {
            vx = Math.round((uni.random() * 2 - 1) * 24);
            vy = Math.round((uni.random() * 2 - 1) * 24);
        } while (vx * vx + vy * vy > 24 * 24 || (vx === 0 && vy === 0));
        uni.injectFrame(uni.makeLeafFrame(300, 200, 0, null, vx, vy));
    }
});
```

…and the packaged form is one line. The hand-rolled loop above bursts EVERY tick and
samples only `(vx, vy)` (no `vz`), so the packaged form needs the two knobs that match
those choices — `emitEveryTicks` defaults to `6` and `is2D` defaults to `false` (3D), so
both must be set explicitly to reproduce the hand-rolled example above, not left at their
defaults:

```js
new SphereEmitter([300, 200], {
    preset: 'spherical', R: 24, burstSize: 20, emitEveryTicks: 1, is2D: true
}).addTo(u);
```

Same universe, same primitives, same physics, same picture. What the part adds is
exactly what a part should add: the measured sampling presets
(`spherical | hemisphere | laser | drum | particle-walk`), live knob handles, and
`dispose()`. What it must never add is physics — if a part change makes the same setup
with the same seed behave differently, physics has leaked into the convenience layer,
and that is the bug.

**The documentation contract.** When a part gets its own datasheet, it OPENS with the
primitive it packages, in one sentence, before any knob — exactly as these openers do:
"A `SphereEmitter` is a tick-fn that calls
`makeLeafFrame` + `injectFrame` N times per tick with ball-rejected directions." "A
`Wall` is a `LargeObject` whose op-program runs on every colliding frame." "A `Tunnel`
is a set of `LargeObject`s — a pair of parallel mirror `Wall`s plus a third gate —
whose op-programs bounce a frame down a bore and release it at the exit." Read a part
that way and you always know what it will cost you and what it cannot possibly be
hiding.

## 4. Where to go next

- [The DSE worked example](DSE_WORKED_EXAMPLE.md) — the double-slit as the library's
  proof piece: the detector placed by calculation before the first tick.
- [Compose a scene, then look at it](COMPOSE_AND_CAPTURE.md) — build a small scene with
  ordinary constructors, read its numbers, and capture two stills of it from a script.
- [The visual coding guide](FRQTL_VISUAL_CODING_GUIDE.md) — the emergence discipline,
  the collision model, render intent, 2D vs 3D.
- [The human guide](HUMAN_GUIDE.md) — why the engine works the way it does.
