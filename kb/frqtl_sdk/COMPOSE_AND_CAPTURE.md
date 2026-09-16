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
npm install @descix/frqtl-sdk
```

This walkthrough needs **0.1.8 or later**. The `@descix/frqtl-sdk/eyes` entry point does not
exist in any earlier release, so every instruction that uses it is false on 0.1.0–0.1.7 —
starting with the `require` a few lines below, not waiting until §6. A plain `npm install`
gives you the current release; if you have pinned an older one, check with
`npm ls @descix/frqtl-sdk`.

Two entry points matter for this walkthrough:

- the package's **browser bundle** (`dist/`), which ships a blank 600×400 canvas page —
  `experiments/empty/index.html` — that you build scenes into;
- **`@descix/frqtl-sdk/eyes`**, a Node entry that hands you a picture of that same scene
  from a script, with no browser tab of your own to babysit.

```js
const { openHostedEyes } = require('@descix/frqtl-sdk/eyes');
```

Serve the package's `dist/` folder with any static file server (the WASM engine loads
over `fetch`, so a bare `file://` page will not boot it) and open
`http://localhost:<port>/experiments/empty/index.html` in a tab. You now have an empty
world and nothing in it — the FRQTL equivalent of a blank p5 canvas after `createCanvas()`.

## 2. Writing the scene

A scene is one function. It takes a small handle onto the world — call it `exp` — and
does two things: set the world's rules, then place your objects on it, same idiom as
`new Sprite(x, y)`. Constructing an object is enough to make it real: it is in the
physics *and* on screen, nothing further to wire up.

```js
function buildExperiment(exp) {
  // 1. The world's rules. Every FRQTL sim starts the same way underneath —
  //    build the universe, then initialize it (EGPTUniverse.create(), then
  //    .init(), always in that order) — exp.init(...) is that step, restated
  //    with the rules THIS scene needs. activeAxes.z:true is the one line
  //    that makes it 3D instead of 2D; everything else about the physics is
  //    identical either way. wavelengthScale is how far a ripple spreads,
  //    in pixels.
  exp.init({ dimension: 0, wavelengthScale: 16, activeAxes: { x: true, y: true, z: true } });

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
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
```

The two closing lines are boilerplate every FRQTL scene carries: they let the exact same
function text be handed to a live page (below) or to a headless script (§5) without
change.

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
function's text. Paste the scene into the page's console (or fetch it and pass it in):

```js
window.FrqtlPage.applyModuleSource(sceneSource);   // sceneSource = the text from §2, as a string
```

This builds the scene and leaves it **stopped** — the page hands you back
`window._frqtlApp` (the runner) and `window._egptExperiment` (the same `exp` your
function received). A **tick** is one physics step — the same thing a p5 `draw()` call is
for rendering, except here it advances the actual simulation. Watching it live is
`runner.start()`, which drives one tick per animation frame, exactly like a
`requestAnimationFrame` loop driving `draw()`. For the specific moment estimated above,
drive it by hand instead:

```js
var runner = window._frqtlApp;
for (var i = 0; i < 900; i++) { runner.step(); }
```

## 5. Reading the numbers behind the picture

Before there is a picture, there is data — the detector already knows what it has
counted, independent of anything being drawn:

```js
var hist = window._egptExperiment.detector.getCollisionHistogram();
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

`playwright` comes down with the SDK, but its **browser binaries do not**, and `npm install`
exits 0 without them. Skip this step and the call below fails with a Playwright error about a
missing executable — which reads like a Playwright problem rather than a step you have not run
yet.

```js
const { openHostedEyes } = require('@descix/frqtl-sdk/eyes');

const eyes = await openHostedEyes({
  sceneRecord: { seed: 42, sourceRef: 'compose-and-capture:double-slit-3d',
                 physicsW: 600, physicsH: 400 },
  sceneSource: { kind: 'module', source: sceneSource },   // the §2 text, as a string
  pageUrl: 'http://localhost:<port>/experiments/empty/index.html'
});

try {
  await eyes.driveToTick(900);                              // the estimate from §3

  // The scene's identity card. Store this once; every still below refers back
  // to it rather than repeating the whole scene description. Whether this is a
  // 2D or 3D scene, and which renderer draws it, come from the scene text itself
  // (exp.init's activeAxes) — nothing to declare here.
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

Two things worth looking at once you have both files open:

- **compose-and-capture-zoom.png** — the detector's heatmap, filling most of the frame,
  with the source's glow visible on either side behind it.
- **compose-and-capture-backside.png** — the *same* heatmap footprint (mirrored — the
  wall paints its hit map on both faces), but now with almost nothing behind it, because
  you are looking at the side facing away from the light. Same plate, opposite view — and
  the missing glow is how you can tell, at a glance, that the camera genuinely moved.

![Zoomed in on the detector's front face — the heatmap fills the frame, with the source's glow visible behind it on either side.](img/compose-and-capture-zoom.png)

![The same detector from the back — the same heatmap footprint, mirrored, with the source's glow gone because this side faces away from it.](img/compose-and-capture-backside.png)

## What just happened

Everything above is the familiar shape, end to end: a **world** (`exp.init`), **things**
placed in it with ordinary constructors (`new SphereEmitter(...)`, `new
GraphingDetectorWall(...)`), an **update loop** (`runner.step()` / `runner.start()`), a
**camera** you point with four numbers (`setPose`), and a **snapshot** of whatever the
camera sees (`getStill`, `saveStill`). The one part with no p5 equivalent is that the
snapshot is numbers before it is ever a picture (`hist.total`, `still.data`) — the picture
is always a derived view of that data, never the other way around. That is also why the
exact same scene text works whether you are watching it live in a tab or asking a script
for a still of it days later: nothing about the setup depends on a screen being open.
