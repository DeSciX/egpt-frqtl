<!-- Copyright 2023-2026 by Essam Abadir -->
# Compose a scene, then look at it — a getting-started walkthrough

*For a reader who already knows `setup()`/`draw()`, sprites, "put a thing at x,y", and a
camera you can move around a scene. FRQTL's whole pitch is that it reuses exactly that
mental model: a world, things you place in it, an update loop, a camera, a snapshot.*

This walkthrough builds one small scene — a light source and a detector plate, in 3D —
and then gets two pictures of it programmatically: a close-up on the detector, and the
same detector seen from behind. By the end you will have run every line of code below
yourself and be holding two PNG files.

## 1. Install

```bash
npm install @descix/frqtl-web @descix/frqtl-node
```

FRQTL ships as two packages built from one source, both `0.6.0` on the npm `latest` dist-tag.
Two entry points matter for this walkthrough:

- **`@descix/frqtl-web`**'s browser dist (`dist/`), which ships a blank canvas page —
  `experiments/empty/index.html` — that you build scenes into;
- **`@descix/frqtl-node/eyes`**, a node entry that hands you a picture of that same scene
  from a script, with no browser tab of your own to babysit.

```js
const { openHostedEyes } = require('@descix/frqtl-node/eyes');
```

Serve `@descix/frqtl-web`'s `dist/` folder with any static file server (the WASM engine loads
over `fetch`, so a bare `file://` page will not boot it) and open
`http://localhost:<port>/experiments/empty/index.html` in a tab. You now have an empty
world and nothing in it — the FRQTL equivalent of a blank p5 canvas after `createCanvas()`.

To serve the package from your own site rather than the CDN, see
[Self-hosting the SDK](#self-hosting-the-sdk) at the end of this page.

## 2. Writing the scene

A scene is one module whose default export is one function. It imports the parts it uses
from `@descix/frqtl-web/parts`, takes a small handle onto the world — call it `exp` — and
does two things: set the world's rules, then place your objects on it, same idiom as
`new Sprite(x, y)`. Constructing an object is enough to make it real: it is in the
physics *and* on screen, nothing further to wire up.

```js
import { SphereEmitter, GraphingDetectorWall } from '@descix/frqtl-web/parts';

export default function buildExperiment(exp) {
  // 1. The world — its canvas and its universe in ONE call, the only place
  //    its size is written. Every FRQTL sim starts the same way underneath —
  //    build the universe, then initialize it (EGPTUniverse.create(), then
  //    .init(), always in that order) — and this call is that step, restated
  //    with the rules THIS scene needs. createScene(w, h, d, …) is what makes
  //    it 3D (drawn by three); a 2D world is createCanvas(w, h, …), and
  //    everything else about the physics is identical either way.
  //    wavelengthScale is how far a ripple spreads, in pixels.
  exp.createScene(600, 400, 600, { dimension: 0, wavelengthScale: 16 });

  // 2. The light source: a little sun, aimed forward (+x) at the far wall.
  //    The first argument is where it sits ([x, y, z]); preset:'hemisphere'
  //    aims its burst in one general direction instead of every direction
  //    at once.
  var sun = new SphereEmitter([70, 200, 0], {
    preset: 'hemisphere', burstSize: 24, emitEveryTicks: 2, chargeMode: 'random'
  }).addTo(exp.universe);

  // 3. The detector: a plate that counts every quantum that lands on it and
  //    paints a live heatmap of exactly what it counted, on its own face —
  //    no separate chart panel to wire up.
  var detector = new GraphingDetectorWall(exp.universe, {
    rect: [260, 40, 20, 320], z: -100, depth: 200,
    name: 'detector', color: [120, 200, 120], binPx: 12
  });

  exp.detector = detector;   // stash it so it is reachable after this function returns
}
```

The same module text can be handed to a live page (below) or to the eyes (§6) without change:
each imports it as an ES module, and its `@descix/frqtl-web/...` imports resolve through the
page's import map.

## 3. Before running: how long until there's something to see?

Worth estimating before you run anything, the same way you'd estimate how many frames a
sprite needs to cross the screen. A quantum moves at roughly one pixel per tick, but only
a straight beam spends *all* of that going one way — `SphereEmitter`'s `hemisphere` preset
spreads its burst across a half-sphere of directions, so only a fraction of each step
counts toward the wall. That fraction is measured and published per preset (the
`SphereEmitter` datasheet carries the full table); for `hemisphere` in 3D it is **~0.49
pixels per tick, forward**. The estimate is then just:

```
ticks ≈ flight distance (px) ÷ forward speed (px/tick)
      ≈ 190 ÷ 0.49
      ≈ 388
```

— the source sits at x=70, the detector's front face at x=260, so 190 px of flight
distance. That is the **mean** of a random walk, not a deadline: the earliest arrivals
land well before it and the bulk lands after, so run comfortably past it. This walkthrough
runs to tick **900** — over twice the estimate — so the detector has accumulated a solid,
dense heatmap rather than just its first few hits.

## 4. Loading it and running it

The blank page exposes one hook for turning a scene description like the above into a
running world: `window.FrqtlPage.applyModuleSource(source)`, where `source` is that
module's text. It returns a promise. Paste the scene into the page's console (or fetch it and
pass it in):

```js
await window.FrqtlPage.applyModuleSource(sceneSource);   // sceneSource = the text from §2, as a string
```

This builds the scene and leaves it **stopped** — the page door hands you back
`window.FrqtlPage.runner` (the runner) and `window.FrqtlPage.experiment` (the same `exp` your
function received). A **tick** is one physics step — the same thing a p5 `draw()` call is
for rendering, except here it advances the actual simulation. Watching it live is
`runner.start()`, which drives one tick per animation frame, exactly like a
`requestAnimationFrame` loop driving `draw()`. For the specific moment estimated above,
drive it by hand instead:

```js
var runner = window.FrqtlPage.runner;
for (var i = 0; i < 900; i++) { runner.step(); }
```

### Finding and moving what the scene declared

An object a scene adds with `exp.addObject(kind, config)` is **declared**: it goes on the
scene's own list of things a host may read and move, and STUDIO's grab moves only these.
An object built directly with `new …(exp.universe, …)`, like the two in §2, is not
declared. It runs and draws, but no host can pick it or place it.

```js
// in the scene:
exp.addObject('Wall', { rect: [260, 40, 20, 320], collisionBehavior: 'absorb', name: 'screen' });
exp.addObject('SphereEmitter', { center: [70, 200, 0], preset: 'hemisphere', name: 'sun' });

// from the host, on a 600x400 world:
var runner = window.FrqtlPage.runner;
runner.declared.map(function (o) { return o.name; });   // ['screen', 'sun'], the one list
var screen = runner.declared.find(function (o) { return o.name === 'screen'; });
runner.kindOf(screen);                 // 'Wall'
runner.positionAuthorityOf(screen);    // 'rect' (an emitter answers 'center'; null cannot be moved)
runner.centerOf(screen);               // [270, 200, 0], where it is placed
runner.envelopeOf(screen);             // {left: 260, top: 40, w: 20, h: 320}, the box it occupies
runner.placeDeclaredAt(screen, [300, 200]);   // {center: [300, 200, 0], zHeld: false}
```

`placeDeclaredAt(d, [x, y, z?])` is the same placement write STUDIO's grab uses. An omitted
`z` is 0. A wall drawn without a z-extent stays on the z = 0 plane, so a non-zero `z` places
it at 0 and returns `zHeld: true`. `kindOf`, `centerOf` and `placeDeclaredAt` throw for an
object that is not on `runner.declared` (a part's member, or something built with `new`).
`placeDeclaredAt` also throws for a point outside the world, a `RangeError` naming
`runner.getUniverseBounds()`: x in [0, width], y in [0, height], z in [-zHalf, zHalf]. To move
an object gradually, call it once per tick from `runner.addTickListener(fn)`.

`runner.restart()` runs the scene again from tick 0 on the same page: it tears the current
scene down (every declared object and every `exp.addTickFunction` function) and rebuilds it. A scene
linked from text is re-linked from the facade's CURRENT text, so a restart after `toSketch()` (below)
keeps what a hand moved. It returns a Promise; await it. Your `runner.addTickListener` functions belong
to your page, not the scene, so they keep running across a restart.

### The parts block: hands that write code

A scene's movable parts can be DATA instead of calls: `export const parts`, an object whose keys are
the declared names and whose values are `[Kind, { …props }]` with `Kind` an imported class, declared by
one `exp.declare(parts)` in key order (exactly `exp.addObject(Kind, { name: key, ...props })` per entry).
It returns the frozen build-time map `{ key: handle }`, so later code in the build reaches a declared part
by its key:

```js
import { SphereEmitter, Wall } from '@descix/frqtl-web/parts';

export const parts = {
  sun:    [SphereEmitter, { center: [70, 200, 0], preset: 'hemisphere' }],
  screen: [Wall, { rect: [260, 40, 20, 320], collisionBehavior: 'absorb' }],
};

export default function buildExperiment(exp) {
  exp.createCanvas(600, 400, SphereEmitter.worldCfg(parts.sun[1]));
  const p = exp.declare(parts);
  exp.addObject('LiveChart', { source: p.screen, rect: [400, 40, 180, 200], series: 'bar', label: 'arrivals by y' });
}
```

The facade that linked the sketch holds its text, and is its one writer. A hand is a write through
`runner.updateObjectProperty` or `runner.placeDeclaredAt`; a host that calls a part's own setter is
driving the run, and the writer does not write it. A hand never renames: the key is the name.

- `await recipeContext.toSketch()` → `{ files, changes, refused }` writes every hand since the last call
  (a `placeDeclaredAt`, an `updateObjectProperty`, a `removeObject`, a new `addObject`) into the `parts`
  literal. Only the touched values change; untouched entries, expressions and comments stay byte for
  byte; an added part is the last key, with one import line when the sketch does not import its kind
  yet. A touched expression (`center: [W * 0.15, cy]`) becomes its literal and `changes` names it. A
  hand on an object declared in code (not in `parts`) is not written: `refused` names it. Call it at
  the END of an act (a drop, a drag's release), never per placement. A second call with no hand
  between returns the same files.
- `await recipeContext.setDeclared('screen', { rect: [300, 40, 20, 320] })` patches one entry and runs
  the scene again from tick 0 in the same page, keeping its seed and, when one was set, the camera pose;
  it resolves `{ set, from, to, tick: 0, kept, files }`, `kept` being `['seed']` or
  `['seed', 'cameraPose']`. `from` and `to` are the patched values as the world held them before and
  after the re-run, in one form (a wall with a z-extent reports a 6-number `rect` even when you patched 4);
  what you typed is in `files`. A key the kind does not declare writable, a value its descriptor refuses, or
  `name` throws naming it; so does a call while a hand is unwritten (`await recipeContext.toSketch()`
  first).
- `await recipeContext.fork('screen', 'MyScreen')` copies the part file of the entry's kind into the folder as
  `parts/MyScreen.js` (the class renamed, its imports rewritten to package specifiers, every other byte the
  part's), points the entry at it, and re-runs the scene in the same page as `setDeclared` does; it resolves
  `{ fork, file, from, files }`. An unmodified fork is the same physics. A name outside `parts`, an unwritten
  hand, or a kind a fork cannot copy throws naming it; `recipeContext.forkRefusal(name)` returns that sentence,
  or null when `fork` may run.
- `runner.declared` rows read `inParts` (an entry of `parts`) and `module` (the specifier its kind is
  imported by: `'@descix/frqtl-web/parts'`, a project path such as `'parts/MyEmitter.js'`, or null).

### One engine per page

A page holds one engine. To show a different scene on the same page, build it on the
`exp` you already have: `FrqtlPage.applyModuleSource({ files: { 'sketch.js': text }, entry: 'sketch.js' })`
again on the blank page, or, after a boot through the doors (`@descix/frqtl-web/boot`), the
`recipeContext` that `bootScene` / `bootProject` returned:

```js
import { bootProject } from '@descix/frqtl-web/boot';
import { linkProject } from '@descix/frqtl-web/project';
const blobMint = (text) => ({ url: URL.createObjectURL(new Blob([text], { type: 'text/javascript' })) });

const { runner, recipeContext } = await bootProject('mount', { files: { 'sketch.js': firstSource }, entry: 'sketch.js' });
recipeContext.build(await linkProject({ files: { 'sketch.js': secondSource }, entry: 'sketch.js', mint: blobMint }));
// same runner, same canvas; the first scene is torn down, and the facade now holds the second's text
```

`linkProject` is the same step `applyModuleSource` and `bootProject` take: it links the project's
files as ES modules (a file imports another by a relative specifier and the package by
`@descix/frqtl-web/...`; an import that names no project file, or a cycle, is refused naming the
file), takes the entry from the folder's `frqtl.json` when it carries one (`./project` `manifestFor`
writes it), requires the entry's default export `buildExperiment(exp)`, and returns
`{ buildExperiment, module, manifest, files, urls, project }` — `module` the entry's namespace, `project`
the folder as text; `recipeContext.build(linked)` builds it and holds that text (the writer's source). A scene with a different world (another size, or
3D instead of 2D) needs a fresh page: building it on the same `exp` throws ("this page already holds
a 600x400 world …").

There is no `dispose()`. Calling `bootScene` or `bootProject` a second time in one page throws
before it touches its mount element, and the first scene keeps running:

```
[doors] bootProject: this document already booted the FRQTL stack (through bootProject). One engine
stack per document — there is no dispose(). To show another scene, use the facade the first boot
returned: recipeContext.build(buildExperiment) — for a project, build(await linkProject({ files, entry,
mint })) (same runner, same canvas); a different world size needs a fresh document. (FAIL-LOUD.)
```

A second call made while the first boot is still loading throws at once too, before any
`recipeContext` exists. Await the first boot's promise instead:

```
[doors] bootProject: a boot through bootProject is IN PROGRESS in this document; await its promise.
When it resolves, show another scene through the facade it returns (recipeContext.build); if it
rejects, this document cannot host a second attempt. (FAIL-LOUD.)
```

If the first boot failed, it returned no `recipeContext`, and the page cannot boot again: a
second call throws, asking for a fresh page:

```
[doors] bootProject: a boot through bootProject was attempted in this document and FAILED; the stack
cannot be re-booted in the same document — open a fresh document. (FAIL-LOUD.)
```

## 5. Reading the numbers behind the picture

Before there is a picture, there is data — the detector already knows what it has
counted, independent of anything being drawn:

```js
var hist = window.FrqtlPage.experiment.detector.getCollisionHistogram();
console.log(hist.total);   // 3486, after 900 ticks in this scene
```

`hist.total` is the running count of quanta the plate has absorbed; the same object also
holds the per-cell grid the heatmap in the next section is a picture *of*. This is a
generally useful habit to keep: the numbers exist whether or not you ever render
anything, and they are cheap to check while you are still tuning a scene's geometry.

## 6. The eyes: getting pictures of it

Everything so far runs in a live tab. To get PNG files out of a script instead — no
browser window of your own to click through — hand the **exact same scene text** from §2
to the eyes:

First, download the browser the eyes drive:

```bash
npx playwright install
```

`playwright` comes down with `@descix/frqtl-node`, but its **browser binaries do not**, and `npm install`
exits 0 without them. Skip this step and the call below fails with a Playwright error about a
missing executable — which reads like a Playwright problem rather than a step you have not run
yet.

```js
const { openHostedEyes } = require('@descix/frqtl-node/eyes');

const eyes = await openHostedEyes({
  sceneRecord: { seed: 42, sourceRef: 'compose-and-capture:double-slit-3d' },
  sceneSource: { kind: 'project', files: { 'sketch.js': sceneSource }, entry: 'sketch.js' },   // the §2 text, as a string
  pageUrl: 'http://localhost:<port>/experiments/empty/index.html'
});

try {
  await eyes.driveToTick(900);                              // the estimate from §3

  // The scene's identity card. Store this once; every still below refers back
  // to it rather than repeating the whole scene description. Whether this is a
  // 2D or 3D scene, and which renderer draws it, come from the scene text itself
  // (its createScene call) — nothing to declare here.
  const scene = await eyes.vision.getScene();
  console.log(scene.scene);   // "sha256:7daf6..." — a content hash of this exact setup

  // Pose 1: zoom onto the detector's front face. An orbit pose is four
  // numbers: azimuth/elevation (which way you are looking from), distance
  // (how far back), and target (the point the camera looks at — [x, y, z],
  // same shape as the emitter's own position argument above).
  await eyes.setPose({ azimuth: -90, elevation: -5, distance: 220, target: [270, 200, 0] });
  const zoomStill = await eyes.vision.getStill('composite');
  eyes.saveStill(zoomStill, 'zoom-detector.png');

  // Pose 2: spin around it — azimuth +180 from the first pose, same everything else.
  await eyes.setPose({ azimuth: 90, elevation: -5, distance: 220, target: [270, 200, 0] });
  const backsideStill = await eyes.vision.getStill('composite');
  eyes.saveStill(backsideStill, 'backside-detector.png');
} finally {
  await eyes.dispose();   // closes the hidden browser tab
}
```

`getStill('composite')` returns a bag of raw pixels (`{ width, height, format: 'rgba8',
data: Uint8ClampedArray, … }`) — `eyes.saveStill` is the write step, so the numbers
(`still.data`) stay reachable even when you also want the file.

The eyes draw the scene text **plus the render state you hand them, and nothing else**. The
call above passes none, so it records the scene's plain render, which is the right picture for
a scene you wrote yourself. A scene's *look* (render options such as god rays or glow, the
water filter, hidden particles, the camera) can also come from a **render state** bag, passed
as `renderState`:

```js
const eyes = await openHostedEyes({
  sceneRecord, sceneSource,
  renderState: { render: [{ key: 'colorScheme', value: 'roygbiv' }],   // the §2 scene, rainbow-coloured
                 camera: { orbit: null, preset: 'rooftop' } },                // and seen from a named view
  pageUrl: 'http://localhost:<port>/experiments/empty/index.html'
});
```

The page applies it after it builds the scene and before the first tick is drawn: its
`renderer` picks the display the page boots, its `render` rows go to the renderer, its
`camera` points the camera, and every still's provenance (`renderOptions`, `filtersApplied`,
`renderBaseCanvas`, `pose`) reports what landed. A `setPose` after `openHostedEyes` overrides
the bag's camera: the bag declares the view, and a pose is a coordinate for one still.

These fail loud rather than recording a picture that differs from what you declared:

- a `render` key no renderer declares (a typo, or a deleted option);
- a `render` row or camera preset the booted display cannot take, such as a 3D-only option on
  a 2D scene. Inside a hosted eye nothing is set aside for later;
- a `renderer` the scene text does not build (a 2D scene with `renderer: 'three'`);
- a `seed` that is not `sceneRecord.seed`, or an `engine` other than `'wasm'`.

### A rung as the GYM shows it

A walk-through rung's look is on its **registry row**, not in its sketch file. `r8-sun`'s
sketch builds a dense 3D point source; the sun the GYM shows (warm-cool glow, god rays, its
camera) is that row's render state. Hand the eyes only the sketch and you get the plain
point source. To record the rung the way the GYM shows it, read the rung as a project through the
registry; its render state comes beside the folder:

```js
const { projectOf } = await import('@descix/frqtl-node/registry');

// files = { 'frqtl.json', 'sketch.js' } (the sketch the package ships, scenes/sun.js);
// renderState = effectiveRenderState(rung, mode), the rung's default mode here
const { files, renderState } = await projectOf('r8-sun');

const eyes = await openHostedEyes({
  sceneRecord: { seed: 42, sourceRef: 'walkthrough:r8-sun' },
  sceneSource: { kind: 'project', files, entry: 'sketch.js' },
  renderState,
  pageUrl: 'http://localhost:<port>/experiments/empty/index.html'
});
```

`projectOf(id, { mode })` hands back `effectiveRenderState(rung, mode)`, the same derivation the GYM's
frame replays, so the two pictures come from one bag. The registry is host-neutral:
`@descix/frqtl-web/registry` in a page and `@descix/frqtl-node/registry` in node are the same module.
`projectOf` reads the rung's sketch from the installed package (a file read in Node, a fetch in a
page), and an unknown id rejects, naming the declared ids.

### A video instead of stills

`eyes.vision.record` turns the same capture into an MP4. The cadence is in **ticks** (a tick
is this world's frame); `fps` only sets playback speed. `everyTicks`, `stopAt`, `maxFrames`
and `fps` are all **required** — there is no default cadence, stop condition, memory bound,
or playback rate; omit one and the call refuses, naming it. This continues straight from §6
above — the world is already at tick 900 there. Call `record()`, then drive the clock: the
recorder samples the first tick after the call and every `everyTicks` after it:

```js
  const recording = eyes.vision.record({
    everyTicks: 10,             // one picture every 10 ticks
    stopAt: { ticks: 290 },     // or { tick: 1191 } (absolute), or { path: { waypoints } }
    maxFrames: 40,              // required memory bound — reaching it first reports truncated: true
    fps: 10                     // playback rate of the file
  });
  await eyes.driveToTick(1191);   // 900 (already reached in §6) + 1 (first capture) + 290 (stopAt.ticks)
  const video = await recording;
  eyes.saveVideo(video, 'double-slit.mp4');
  console.log(video.track.frames);   // [{ i: 0, tick: 901, pose }, { i: 1, tick: 911, pose }, …]
```

`video` is `CaptureEnvelope.videoEnvelope` from either package's `.`: `video.track` is the
sidecar manifest — `{ scene, stage, width, height, ticksPerFrame, fps, firstTick, lastTick,
frames }` — and `video.track.frames` is `[{ i, tick, pose }]`, one row per encoded frame in
order, mapping it back to the tick (and camera pose) it shows. `video.encoded` carries the
transportable bytes: `{ mime, bytes (base64), encoder, codec (as the encoder actually
PRODUCED, never the request), muxer }`. `video.truncated` says whether the recording ended
before its `stopAt` — because `maxFrames` was reached, or because you stopped it: pass
`signal: controller.signal` from an `AbortController` and call `controller.abort()` to end it
early with the frames so far.

#### Flying the camera while recording

An alternative to the plain recording above, and its own example: it too continues straight
from §6's tick 900, not from the recording above it. `stopAt: { path: { waypoints } }` starts
a camera flight together with the recording and stops it on arrival at the flight's last
waypoint. Every waypoint's `atTick` is **relative to the recording's own start** — tick 0 is
the moment `record()` is called, never an absolute universe tick. Passing an absolute tick
(`now + offset`) makes the flight run *late* by however many ticks the universe was already
at, because the flight re-anchors its own tick 0 when the recording starts. Size `maxFrames`
off the flight's own length so the bound never cuts a planned flight short:

A `CameraPath` waypoint's `target` is a **point object**, `{x, y}` or `{x, y, z}` — not the
`[x, y, z]` array `setPose`/`setOrbit` accept above; a waypoint written with an array is
refused at attach:

```js
const startTick = 900;   // wherever eyes.driveToTick(...) already put the scene (§6 above)

const waypoints = [
  { atTick: 0,   pose: { azimuth: -90, elevation: -5, distance: 220, target: { x: 270, y: 200, z: 0 } } },
  { atTick: 200, pose: { azimuth:  90, elevation: -5, distance: 220, target: { x: 270, y: 200, z: 0 } } }
];
const everyTicks = 10;
const lastAtTick = waypoints[waypoints.length - 1].atTick;    // 200 — relative to record()'s start

const flight = eyes.vision.record({
  everyTicks: everyTicks,
  stopAt: { path: { waypoints: waypoints } },
  maxFrames: Math.floor(lastAtTick / everyTicks) + 1,         // 21 — sized off the flight's own length
  fps: 10
});
await eyes.driveToTick(startTick + lastAtTick);    // drive PAST the flight's length, not by absolute ticks
const orbitVideo = await flight;
```

The flight always runs for `lastAtTick` ticks measured from wherever the scene already was
when `record()` was called, regardless of the universe's own tick. `driveToTick` only drives
a world **forward**, though: driving to `lastAtTick` (200) instead of `startTick + lastAtTick`
(1100) does not quietly wait or rewind — the world is already at tick 900 (past 200), so it
throws ("already at tick 900, past 200 ... open a fresh handle to reach an earlier tick")
rather than pretending the flight already arrived.

#### Recording from your own page

`record()` loads its video encoder from the vendored files beside the module that records
(`frqtl/assets/vendor/mediabunny.min.mjs` and its `mediabunny.PINNED.json` in the package's
`dist/`). Serve the dist, and every page that imports `FrqtlVision` from it finds the encoder;
there is nothing for a page to define.

Two things worth looking at once you have both files open:

- **compose-and-capture-zoom.png** — the detector's heatmap, filling most of the frame,
  with the source's glow visible on either side behind it.
- **compose-and-capture-backside.png** — the *same* heatmap footprint (mirrored — the
  wall paints its hit map on both faces), but now with almost nothing behind it, because
  you are looking at the side facing away from the light. Same plate, opposite view — and
  the missing glow is how you can tell, at a glance, that the camera genuinely moved.

![Zoomed in on the detector's front face — the heatmap fills the frame, with the source's glow visible behind it on either side.](img/compose-and-capture-zoom.png)

![The same detector from the back — the same heatmap footprint, mirrored, with the source's glow gone because this side faces away from it.](img/compose-and-capture-backside.png)

### A Record: the footage and the code change

A **Record** is one round of work on a scene, kept as a folder: the clips that show it, the change
list, the `parts` block before and after, and the project as it stood at the end. It needs a scene
booted as a project **folder** (one with a `frqtl.json`: add
`files['frqtl.json'] = serializeManifest(manifestFor({ name, entry: SKETCH_ENTRY }))`, all from `./project`,
to the files you boot) and a facade that holds its text:

```js
const rec = await recipeContext.startRecord();          // its own clock: rec.tick is 0 now
runner.placeDeclaredAt(wall, [150, 120]);               // a hand…
await recipeContext.toSketch({ by: 'human' });          // …written at the end of the act: one row
await recipeContext.setDeclared('src', { burstSize: 5 }, { by: 'maxi' });   // one row
await rec.film({ seconds: 12, fps: 30, everyTicks: 1 });   // two 6 s clips, back to back
const { files, record, clips } = await rec.stop();      // or { empty: true }
```

- **What it holds so far.** `rec.changes` is a frozen copy of the rows, a new one per read, open or
  closed; one act's rows are `rec.changes.slice(n)` with `n` read before the act.
- **Who acted.** While a Record is open, every act names it: `toSketch({ by })`,
  `setDeclared(name, patch, { by })` and `fork(name, NewKind, { by })`, `by` one of `BY` (`'human'`, `'maxi'`). An
  act without it throws, and so does an act while `stop()` is pending (it names "stopping": that act belongs to the
  next Record). A fork writes one `op: 'fork'` row, `from` the parent kind and `to` `{ kind, file }`.
- **One row per act**, made from what the writer WROTE (a refused hand makes none): a placement is
  `op: 'move'` with `from`/`to` as `{ center: [x, y, z] }` or `{ rect: […] }` (6 numbers with a
  z-extent, 4 when flat); another touched value is `op: 'setDeclared'` with the keys before and after;
  an added part is `add` (`to: ['<kind>', { props }]`), a removed one `remove`. A move that moved nothing
  writes no row.
- **The clock.** `rec.tick` starts at 0 and climbs one per tick the world runs, across a `setDeclared`
  re-run or a Restart, while the runner's own tick starts over. Every row's `tick` and clip span is on it.
- **Clips.** While the Record is open, every `FrqtlVision.record` on its runner is one of its clips,
  `clip-01.mp4` onward, and each must be 5–10 s long (`CLIP_SECONDS`, frames / fps) or the recording
  is refused. `rec.film({ seconds, fps, everyTicks })` cuts `seconds` into `ceil(seconds / 10)`
  equal segments for you; keep the world ticking (its loop, or your driver) while it films.
- **stop()** refuses a Record whose changes no clip shows, or one with a change after its last clip
  ends: film after your last change. With nothing changed and nothing filmed it resolves
  `{ empty: true }`, which has no folder. It also runs `recordFolderFaults` on its own folder. A refused
  `stop()` leaves the Record open, and every refusal (of `stop()` or of `rec.closed`) carries
  `err.record = { changes, clips }`, so nothing the Record held is lost without a word.
- **One Record per booted world.** Building different text into the same facade (a new sketch) closes
  the open Record; `rec.closed` resolves with `closedBy: 'reauthor'` and the folder of the world before.
  `restart()`, `setDeclared` and `fork` keep it open. `rec.closed` resolves `closedBy: 'stop'` after `stop()`.
  Both carry `droppedClips`: the clips still filming when the Record closed (0 after `stop()`); a refused
  re-authoring close carries it as `err.droppedClips`.
  If a re-authoring close is refused (say, a change no clip shows) and you never read `rec.closed`, the
  next `startRecord()` rejects, naming it, until you do.

The folder:

| Path | Holds |
|---|---|
| `record.json` | exactly `{ tickRange: [first, last], clips: ['clip-01.mp4', …], changes: [{ tick, name, op, by, from, to }] }` |
| `clip-NN.mp4` | the footage, in the order filmed |
| `parts.before.json`, `parts.after.json` | `{ "<name>": ["<kind>", { props }] }` in key order; their diff is the code change |
| `project/` | the project's files at stop; `bootProject(mount, { files }, { renderState })` replays it |

Your own notes about the round (an outline, a verdict, which clip you hand back) go in a file of your
own beside these, never in `record.json`; `stop()` gives you each clip's `{ file, firstTick, lastTick }`
for that. `recordFolderFaults(files)` from `./project` is `[]` for a complete folder and names every
fault otherwise; it never reads a file of yours.

From node, the hosted eyes drive the same door in their page, so the folder is the one a page writes.
The handle has no re-authoring door: a Record opened by `eyes.record.start()` closes only by
`eyes.record.stop()`. A refusal carries `err.record = { changes, clips }`, as in a page.
`await eyes.record.changes()` is the rows so far (the page's `rec.changes`), and `await eyes.act.fork(name, NewKind,
{ by })` is the page's `fork`, through the same door.

```js
import { openHostedEyes, writeRecordFolder } from '@descix/frqtl-node/eyes';
const eyes = await openHostedEyes({ sceneRecord: { seed: 42 }, sceneSource: { kind: 'project', files }, pageUrl });
await eyes.record.start();
await eyes.act.placeDeclaredAt('wall', [150, 120]);
await eyes.act.toSketch({ by: 'maxi' });
const filming = eyes.record.film({ seconds: 6, fps: 30, everyTicks: 1 });
await eyes.driveToTick((await eyes.tick()) + 180);
await filming;
writeRecordFolder(await eyes.record.stop(), 'out/record-01');   // refuses an empty Record or a used directory
```

## What just happened

Everything above is the familiar shape, end to end: a **world** (`exp.createScene`), **things**
placed in it with ordinary constructors (`new SphereEmitter(...)`, `new
GraphingDetectorWall(...)`), an **update loop** (`runner.step()` / `runner.start()`), a
**camera** you point with four numbers (`setPose`), and a **snapshot** of whatever the
camera sees (`getStill`, `saveStill`). The one part with no p5 equivalent is that the
snapshot is numbers before it is ever a picture (`hist.total`, `still.data`) — the picture
is always a derived view of that data, never the other way around. That is also why the
exact same scene text works whether you are watching it live in a tab or asking a script
for a still of it days later: nothing about the setup depends on a screen being open.

## Self-hosting the SDK

The pages above load the package from the published copy on the jsdelivr CDN. You can serve it from
your own site instead: copy `@descix/frqtl-web`'s `dist/` folder into your site as it is, and import
the doors from that copy. Every module loads its own imports relative to its own URL, so the copy you
import from IS the copy the boot runs from — there is no base option.

**1. Copy the whole `dist/` folder, unchanged.**

```bash
npm install @descix/frqtl-web
mkdir -p site/vendor/frqtl-web
cp -R node_modules/@descix/frqtl-web/dist site/vendor/frqtl-web/dist
```

Copy all of it, with every file at its own relative path. Do not pick out the files you think a
scene needs, and do not minify, re-bundle or rename anything. The boot loads the engine, both
renderers, the whole game layer and the vendored libraries from fixed places beside itself, so a
partial or edited copy is not a supported setup.

**2. Import the doors from your copy.**

```html
<div id="mount"></div>
<script type="module">
  import { bootScene } from './vendor/frqtl-web/dist/frqtl/experiments/_shared/doors.js';

  await bootScene('mount', function (exp) {
    exp.createCanvas(600, 400, { dimension: 0, wavelengthScale: 1 });
    exp.addTickFunction(function (uni) { uni.injectFrame(uni.makeLeafFrame(20, 200, 0, null, 1, 0)); });
  });
</script>
```

A sketch that imports `@descix/frqtl-web/...` needs those specifiers mapped onto the same copy: put
an import map on the page rendered from the package's own table — `importMapFor('./vendor/frqtl-web/dist/')`
from `@descix/frqtl-web/project`. Or use the one-file form: `<script src="./vendor/frqtl-web/dist/frqtl-web.min.js">`
and `FRQTL.bootScene(…)`.

**3. One origin, one copy.** Serve your page and the copy from the same origin, and take every
import from the same copy. If one module comes from your copy and another from jsdelivr, the page
runs two instances of the game layer at once. The sibling package `@descix/egpt-math-sdk`, which
serves the notebook realm, is not part of a scene boot.

**4. Content types.** Your host must serve:

- `.js` and `.mjs` files as `text/javascript`. Browsers refuse to run a module script served
  with any other type.
- `.wasm` files as `application/wasm`. The engine is compiled WebAssembly, and browsers compile
  it while it downloads only when it carries this type.

**What fails, and how.** A copy that is missing a file fails at that file's import, and the boot
paints an overlay in the mount naming it; the promise `bootScene` returns rejects. Nothing falls back
to the CDN.

### Checking your copy

`dist/dist-manifest.json` lists every other file of the published `dist/` with its SHA-256. Your
served copy is the published release when every file it serves hashes to its entry. Check it with
this script, run from the project where you installed the package (node 22.12 or later). Its argument
is the URL of your copy's `dist` folder, with no trailing slash:

```js
// check-frqtl-copy.mjs — node check-frqtl-copy.mjs https://example.org/vendor/frqtl-web/dist
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const base = process.argv[2];
const manifestPath = createRequire(import.meta.url).resolve('@descix/frqtl-web/dist-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const expected = { ...manifest.files };
expected['dist-manifest.json'] = createHash('sha256').update(readFileSync(manifestPath)).digest('hex');

const bad = [];
for (const [file, sha] of Object.entries(expected)) {
  const res = await fetch(base + '/' + file);
  const got = res.ok ? createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex')
                     : 'HTTP ' + res.status;
  if (got !== sha) { bad.push(file + ': ' + got); }
}
const total = Object.keys(expected).length;
console.log(`${manifest.name}@${manifest.version}: ` +
  (bad.length ? `${bad.length} of ${total} served files differ\n${bad.join('\n')}` : `all ${total} served files match`));
process.exit(bad.length ? 1 : 0);
```

It reads the manifest from your installed package, not from the site, so a changed copy cannot
vouch for itself. It exits 0 only when every file matches, and otherwise prints each file that
differs or is missing. Run it after every deploy of the copy, and against the same version you
installed: a copy of another release fails it.
