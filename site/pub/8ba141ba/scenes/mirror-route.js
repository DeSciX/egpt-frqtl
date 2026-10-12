/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1D · Mirror Loop (10-mirror {10/3} star)
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1d-mirror-route).
 */

function buildExperiment(exp) {
  // Collision Lab 1D (Mirror Circuit) — a CLOSED {10/3} STAR BILLIARD (CEO 2026-07-25):
  // a 2-particle-wide laser loops m1→m2→…→m10→m1 FOREVER. Ten mirrors at the vertices of
  // a regular decagon; each tilt solved from its in/out chords so the reflected centre-
  // line hits the next mirror, and the star's symmetry closes the tenth leg back into the
  // first. Each mirror tags the beam with its own colour (recolor hook) → the beam re-
  // colours every bounce. No detector: the loop has no exit. The emitter's DECLARED
  // emission gate (emissionCap/gateCounter — the blackbody pattern as captured descriptor
  // DATA) keeps the population bounded so FPS stays healthy, Restart-safe.
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  var f = Math.min(W, H) / 600;
  // R 225·f (loop-polish, CEO 2026-07-25 — was 150·f): a BIGGER ring. Adjacent decagon
  // vertices sit 2R·sin18° ≈ 0.618R apart vs slab height ~110·f, so at 225·f the mirrors
  // separate with clear gaps (at 150·f they nearly touched). Fit: R + rotated-slab
  // half-diagonal (≈55·f) stays inside min(W,H)/2 with margin.
  var CX = Math.round(W / 2), CY = Math.round(H / 2), R = Math.round(225 * f), HOP = 3, ROT = 12;
  // CAP 6400 / burst 8 (CEO 2026-07-25 brightness retune — 8x the 800 cap, 4x the
  // burst): a VERY BRIGHT braid. The cap is LIVE-controllable off the population
  // counter (select 'population' in Layers → Inspector 'Population Gate').
  var SW = Math.max(10, Math.round(14 * f)), SH = Math.max(70, Math.round(110 * f)), CAP = 6400;
  // Each mirror a DIFFERENT colour = its identity (a red→magenta rainbow); the recolor
  // hook stamps that colour onto every particle it reflects (string_map['render.color']).
  var PAL = [[255,60,60],[255,140,0],[255,220,0],[150,230,40],[40,210,90],[0,210,190],[0,170,255],[70,90,255],[150,70,235],[235,50,190]];
  // Hit-order vertices of the {10/3} star (m1..m10 named IN the order the beam visits them).
  var order = []; for (var k = 0; k < 10; k++) { order.push((k * HOP) % 10); }
  var D2R = Math.PI / 180;
  var vpos = function (v) { var a = (v * 36 + ROT) * D2R; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
  var pos = order.map(vpos);
  var deg = function (a) { return ((a * 180 / Math.PI) % 360 + 360) % 360; };
  var angOf = function (p, q) { return deg(Math.atan2(q[1] - p[1], q[0] - p[0])); };
  // Per-mirror orientation from the in/out chords: ori = (in+out−180)/2, branch chosen so
  // the engine reflect law out = 180 + 2·ori − in reproduces the outgoing chord exactly.
  var ORI = [];
  for (var j = 0; j < 10; j++) {
    var pr = pos[(j + 9) % 10], cu = pos[j], nx = pos[(j + 1) % 10];
    var inA = angOf(pr, cu), outA = angOf(cu, nx);
    var o = (((inA + outA - 180) / 2) % 360 + 360) % 360;
    var op = ((180 + 2 * o - inA) % 360 + 360) % 360;
    if (Math.abs(((op - outA + 540) % 360) - 180) > 0.5) { o = (o + 90) % 360; }
    ORI.push(o);
  }
  // The NARROW STRAIGHT-WALK laser (CEO 2026-07-25 exemplar ruling): the SAME emitter
  // as Rung 1 (Straight Walk) — preset 'particle-walk' + is2D, every walk-character
  // field INHERITED from the same factory defaults (chargeMode 'positive', dim 0 =
  // 'light' P=1, fundamentalWaveLength 64 → the λ16 braided transverse ripple) — with
  // ONLY the deliberate loop deltas: (a) a 2px source line (emissionBoxSide 2 vs r1's
  // default 10 — a NARROWER version of the same band, not a point), (b) seated on the
  // m10→m1 leg JUST CLEAR of m10 (70·f past its vertex > the rotated-slab half-diagonal
  // ≈55·f) and aimed along the leg (the longest clear throw: leg 1.618R ≈ 364·f), (c) a
  // small burst (8/tick — the CEO's 4x brightness retune of the original 2), and (d) the
  // DECLARED emission gate below. The old
  // wavelength:1/fundamentalWaveLength:4 overrides flattened the ripple to the λ4 floor
  // (a braid-less dribble) — deleted: the loop beam must READ as Straight Walk, narrower.
  var pS = pos[9], p0 = pos[0];
  var dx = p0[0] - pS[0], dy = p0[1] - pS[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  var emit = [Math.round(pS[0] + 70 * f * ux), Math.round(pS[1] + 70 * f * uy)];
  // EMISSION-CAP GATE as DECLARED DATA (CEO ruling 05c98e1f — the blackbody-thermostat
  // pattern): emissionCap + gateCounter compile at CONSTRUCTION into a host tick-fn
  // reading Wall.getLiveCount on the background counter named 'population' (placed
  // below — the by-name reference resolves lazily on the first tick). The closed loop
  // has NO sink, so the gate pauses emission at the cap and resumes below it: the
  // population plateaus and FPS stays healthy. Restart-safe: codegen captures the two
  // fields and the rebuilt emitter recompiles the gate (no free recipe tick-fn).
  var SRC = {
    preset: 'particle-walk', is2D: true, center: emit, orientationDeg: angOf(pS, p0),
    emissionBoxSide: 2, burstSize: 8,
    emissionCap: CAP, gateCounter: 'population'
  };
  exp.createCanvas(W, H, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 2D canvas + universe — first, then parts
  exp.addObject('SphereEmitter', SRC);
  // The ten mirrors at the star vertices — each its own colour + the recolor tag; m1 also
  // carries a COUNT hook so the live chart can read laps at the first mirror.
  var m1 = null;
  for (var i = 0; i < 10; i++) {
    var p = pos[i];
    var w = exp.addObject('Wall', {
      rect: [Math.round(p[0] - SW / 2), Math.round(p[1] - SH / 2), SW, SH],
      collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[i],
      name: 'm' + (i + 1), color: PAL[i], hooks: (i === 0 ? ['recolor', 'count'] : ['recolor'])
    });
    if (i === 0) { m1 = w; }
  }
  // BACKGROUND POPULATION COUNTER (loop-polish B, CEO 2026-07-25 — the canonical
  // objects approach): an INVISIBLE full-canvas Wall with collisionBehavior 'nothing'
  // + the count hook. Every live leaf inside its rect collides (intersects trigger)
  // every tick, so its per-tick collided-frame count (Wall.getLiveCount, bench LO7
  // mechanics) IS the live population — the ONE 'how many live' authority. Counting
  // never moves/kills/recolors a frame: zero physics (SU1).
  var popWall = exp.addObject('Wall', {
    rect: [0, 0, W, H], collisionBehavior: 'nothing', hooks: ['count'],
    name: 'population', visible: false
  });
  // Live chart of LAPS at m1 (its count hook) — observability of the infinite loop
  // (the bounce tally at the first mirror keeps climbing as the beam circulates).
  exp.addObject('LiveChart', {
    source: m1,
    rect: [Math.round(W * 0.72), Math.round(H * 0.04), Math.round(W * 0.25), Math.round(H * 0.2)],
    series: 'bar', label: 'laps at m1', refreshMs: 100, color: [24, 32, 46]
  });
  // Live chart of the POPULATION (the same counter LO the gate reads, via the
  // liveCount projector). The '(cap N)' suffix is DERIVED at render time from the
  // emitter's LIVE emissionCap (truth-in-labeling — never a hardcoded literal).
  exp.addObject('LiveChart', {
    source: popWall, projector: 'liveCount',
    rect: [Math.round(W * 0.03), Math.round(H * 0.04), Math.round(W * 0.22), Math.round(H * 0.18)],
    series: 'bar', label: 'live quanta', refreshMs: 100, color: [24, 32, 46]
  });
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
