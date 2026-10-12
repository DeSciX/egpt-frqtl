/* Copyright 2023-2026 by Essam Abadir */

/**
 * SCENE — 1D · Mirror Loop (3D)
 *
 * A sketch file: the WHOLE scene as one dual-mode `buildExperiment(exp)` module. The world
 * (its co-init call, `exp.createCanvas` / `exp.createScene` — the one place its size is written),
 * the parts (`exp.addObject`) and the render intent are all here; the sugar
 * objects, renderer and engine are includes. Registered by lib/shim/registry/walkthrough.js
 * (rung cl1d-mirror-route-3d).
 */

function buildExperiment(exp) {
  // Collision Lab 1D · 3D (Mirror Loop) — the {10/3} STAR BILLIARD as a real 3D
  // scene (3D-mirrors bite, 2026-07-25). SAME ring geometry + tilts + gate as the 2D
  // loop (2D≡3D); the deltas are exactly: (a) every mirror is a 3D SLAB (z/depth →
  // a real z-slab centered on the beam plane z=0, rendered as a BoxGeometry plate),
  // (b) the laser is VOLUMETRIC (is2D:false — braids in y AND z; the slab depth
  // catches the z-braid; z-strays die at the universe z-boundary like xy strays at
  // the canvas edge), (c) the population counter Wall carries a z-slab covering the
  // WHOLE universe z-band so getLiveCount stays the one live-population authority,
  // (d) MOVE/LOOK camera joysticks attached (the OMNI_3D pattern).
  var W = 600, H = 400;   // THE WORLD this scene states (its co-init call below)
  var f = Math.min(W, H) / 600;
  var CX = Math.round(W / 2), CY = Math.round(H / 2), R = Math.round(225 * f), HOP = 3, ROT = 12;
  var SW = Math.max(10, Math.round(14 * f)), SH = Math.max(70, Math.round(110 * f)), CAP = 6400;
  // SD — the slab z-depth: a 2:1 tile (twice the slab height, z-centered on the
  // beam plane). The scene z-collimator below clamps ALL quanta to this band, so
  // every mirror provably faces every alive quantum (CEO drive ruling 2026-07-26).
  var SD = 2 * SH;
  var PAL = [[255,60,60],[255,140,0],[255,220,0],[150,230,40],[40,210,90],[0,210,190],[0,170,255],[70,90,255],[150,70,235],[235,50,190]];
  var order = []; for (var k = 0; k < 10; k++) { order.push((k * HOP) % 10); }
  var D2R = Math.PI / 180;
  var vpos = function (v) { var a = (v * 36 + ROT) * D2R; return [CX + R * Math.cos(a), CY + R * Math.sin(a)]; };
  var pos = order.map(vpos);
  var deg = function (a) { return ((a * 180 / Math.PI) % 360 + 360) % 360; };
  var angOf = function (p, q) { return deg(Math.atan2(q[1] - p[1], q[0] - p[0])); };
  // Per-mirror IN-PLANE tilt from the in/out chords (identical to the 2D loop —
  // orientation is z-axis rotation; the slab depth adds NO new angle).
  var ORI = [];
  for (var j = 0; j < 10; j++) {
    var pr = pos[(j + 9) % 10], cu = pos[j], nx = pos[(j + 1) % 10];
    var inA = angOf(pr, cu), outA = angOf(cu, nx);
    var o = (((inA + outA - 180) / 2) % 360 + 360) % 360;
    var op = ((180 + 2 * o - inA) % 360 + 360) % 360;
    if (Math.abs(((op - outA + 540) % 360) - 180) > 0.5) { o = (o + 90) % 360; }
    ORI.push(o);
  }
  // The narrow Straight-Walk laser, VOLUMETRIC: same factory defaults as r1 (the
  // braid ripple), same loop deltas as 2D 1D (2px source line, m10→m1 seat, burst 8,
  // declared gate) — plus is2D:false to open the z-axis.
  var pS = pos[9], p0 = pos[0];
  var dx = p0[0] - pS[0], dy = p0[1] - pS[1], L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L;
  var emit = [Math.round(pS[0] + 70 * f * ux), Math.round(pS[1] + 70 * f * uy)];
  var SRC = {
    preset: 'particle-walk', is2D: false, center: emit, orientationDeg: angOf(pS, p0),
    emissionBoxSide: 2, burstSize: 8,
    emissionCap: CAP, gateCounter: 'population'
  };
  exp.createScene(W, H, 600, setupSphereEmitter3D.worldCfg(SRC));   // THE WORLD: a 3D scene + universe, 600x400x600 — first, then parts
  exp.addObject('SphereEmitter', SRC);
  // The ten mirror SLABS at the star vertices — 3D walls (z-slab −SD/2..SD/2), each
  // its own colour + recolor tag; m1 also counts (the laps chart source).
  var m1 = null;
  for (var i = 0; i < 10; i++) {
    var p = pos[i];
    var w = exp.addObject('Wall', {
      rect: [Math.round(p[0] - SW / 2), Math.round(p[1] - SH / 2), SW, SH],
      z: -Math.round(SD / 2), depth: SD,
      collisionBehavior: 'bounce', bounceDirection: 'reflect', orientationDeg: ORI[i],
      name: 'm' + (i + 1), color: PAL[i], hooks: (i === 0 ? ['recolor', 'count'] : ['recolor'])
    });
    if (i === 0) { m1 = w; }
  }
  // SCENE Z-COLLIMATOR (CEO drive ruling 2026-07-26 — 'the z is letting things
  // pass through, not reflect'): the legs' z-braid diffuses lap over lap; any
  // quantum beyond the mirrors' z-band would sail BESIDE a plate on the leg line —
  // reading as a beam passing THROUGH the mirror. Two INVISIBLE full-canvas
  // destroy boundaries flush with the slab z-band clamp the scene to the mirror
  // faces (the universe z-edge moved inward — the sanctioned experiment-boundary
  // sink): every mirror faces every alive quantum; no leg can pass a mirror in z.
  // 40px deep: un-jumpable (max z step ±2/tick).
  exp.addObject('Wall', { rect: [0, 0, W, H], z: Math.round(SD / 2), depth: 40,
    collisionBehavior: 'destroy', name: 'zClipFar', visible: false });
  exp.addObject('Wall', { rect: [0, 0, W, H], z: -Math.round(SD / 2) - 40, depth: 40,
    collisionBehavior: 'destroy', name: 'zClipNear', visible: false });
  // BACKGROUND POPULATION COUNTER, 3D: the invisible nothing+count Wall must contain
  // EVERY live leaf to stay the one live-population authority — the universe z-band
  // is ±half-width (z-strays DIE at it, measured), so give the counter a z-slab of
  // ±W (a strict superset). Counting never moves/kills/recolors: zero physics (SU1).
  var popWall = exp.addObject('Wall', {
    rect: [0, 0, W, H], z: -W, depth: 2 * W, collisionBehavior: 'nothing',
    hooks: ['count'], name: 'population', visible: false
  });
  exp.addObject('LiveChart', {
    source: m1,
    rect: [Math.round(W * 0.72), Math.round(H * 0.04), Math.round(W * 0.25), Math.round(H * 0.2)],
    series: 'bar', label: 'laps at m1', refreshMs: 100, color: [24, 32, 46]
  });
  exp.addObject('LiveChart', {
    source: popWall, projector: 'liveCount',
    rect: [Math.round(W * 0.03), Math.round(H * 0.04), Math.round(W * 0.22), Math.round(H * 0.18)],
    series: 'bar', label: 'live quanta', refreshMs: 100, color: [24, 32, 46]
  });
  // MOVE/LOOK camera joysticks — the OMNI_3D pattern (FAIL-SOFT no-op in 2D).
  if (typeof document !== 'undefined' && window.CameraControls && exp.runner) {
    var _mount = document.getElementById('canvas-wrapper');
    if (_mount) { window.CameraControls.attach(exp.runner, _mount); }
  }
}
if (typeof module !== 'undefined' && module.exports) { module.exports = { buildExperiment: buildExperiment }; }
else if (typeof window !== 'undefined') { window.buildExperiment = buildExperiment; }
