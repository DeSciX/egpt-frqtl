/* Copyright 2023-2026 by Essam Abadir */

/**
 * lo-drawn-center.js — THE authority for where a LargeObject rect is DRAWN: its center point.
 *
 * Peer of `orbit-bag.js`: a shared contract-half with no geometry of its own beyond one rule, so
 * the fact has ONE owner. Its consumers are the three.js provider (it places each LO mesh at this
 * point) and `FrqtlApp::_objectCentroid` (the 3D pick and the drive feedback aim at it). Two
 * derivations of the one fact is the drift this file exists to make impossible — a pick aimed at
 * a different point than the mesh is drawn at selects the wrong object silently.
 *
 * ── The rule ─────────────────────────────────────────────────────────────────
 *
 * An LO rect is corner-mode (`left`/`top` are the near corner, never a center — the LargeObject
 * convention). A 6-element rect (`{left, top, z, w, h, d}`) also carries `z`, the NEAR-face corner
 * on the z axis, so its z-center is `z + d/2`, with `d` defaulting to `w` exactly as the engine's
 * z-capable rectangle does. A legacy 4-element rect has no `z`: it sits at z-center 0.
 *
 *   drawnCenter(rect) → [left + w/2, top + h/2, (z present) ? z + (d ?? w)/2 : 0]
 *
 * ── Layer 2: physics behaviour ───────────────────────────────────────────────
 * ZERO physics. This reads a rect the engine already published; it moves no frame and no LO.
 *
 * Classic-script module: `window.LoDrawnCenter` in the browser, `module.exports` in Node — the
 * same dual publication as every other shared contract-half in this directory.
 */

(function () {
'use strict';

/**
 * @param {{left:number, top:number, w:number, h:number, z?:number, d?:number}} rect
 * @returns {number[]} `[cx, cy, cz]` — the center the renderer draws the rect's box at.
 */
function drawnCenter(rect) {
    var cz = (typeof rect.z === 'number')
        ? rect.z + ((typeof rect.d === 'number') ? rect.d : rect.w) / 2
        : 0;
    return [rect.left + rect.w / 2, rect.top + rect.h / 2, cz];
}

var LoDrawnCenter = { drawnCenter: drawnCenter };

if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoDrawnCenter;
} else if (typeof window !== 'undefined') {
    window.LoDrawnCenter = LoDrawnCenter;
}

})();
