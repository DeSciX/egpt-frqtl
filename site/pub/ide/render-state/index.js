/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render-state/index.js — the ONE shim-level owner of the PURE
 * renderState contract (ws-experiments-walkthrough Bite 2, CEO ruling E2a).
 *
 * ── Why this lives in the shim ───────────────────────────────────────────────
 *
 * A saved project's `renderState` bag (renderer/egpt3D/seed load-time selections
 * + render capability values + camera + backdrop visibility) is replayed by THREE
 * consumers now: STUDIO's `AuthorView` (feature), the standalone bundle's
 * `bootRecipe` (sdk esm entry), and any future DeSciX publisher. Each must ferry
 * the SAME normalize/decision logic — so the PURE, DOM-free helpers live at the
 * shim level (below features, packaged into the sdk dist by `build.js`'s
 * copyCommon), and `lib/features/ide/save-state.js` RE-EXPORTS them (keeping only
 * its feature-coupled capture helpers). A second copy in `bundle/` or the sdk esm
 * entry is forbidden (E2 ruling).
 *
 * ── Layer 1: API contract ────────────────────────────────────────────────────
 *
 *   normalizeSavedRenderState(raw)     — tolerant normalizer for a LOADED bag
 *                                        (undefined/null/legacy → neutral defaults,
 *                                        never throws).
 *   pickCameraReplay(saved)            — pure decision: named preset over raw orbit.
 *   applySavedUrlOverrides(src, over)  — pure URL-string mutation for the load-TIME
 *                                        renderer/egpt3D/seed query params.
 *   renderStateToBootOptions(raw)      — pure translation of a renderState bag into
 *                                        the boot-opts split a recipe host applies:
 *                                        LOAD-TIME (renderer/egpt3D/seed) vs
 *                                        POST-START (renderOptions/camera/backdrop).
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero physics — pure data shaping over an already-captured / about-to-be-replayed
 * state bag. Replaying a value produces the IDENTICAL effect as a user re-dragging
 * the same control to that value; the render/physics accessors downstream
 * (`runner.setRenderOption` / `cameraControl.setPreset` / …) do the actual work.
 */

'use strict';

// ── shape guard ──────────────────────────────────────────────────────────────

/** @returns {boolean} */
function _isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

// ── applySavedUrlOverrides ───────────────────────────────────────────────────

/**
 * Set (or leave untouched) the `renderer`/`egpt3D`/`seed` query params on an
 * experiment iframe `src` — the load-TIME axis of a saved render-state bag.
 *
 * @param {string} src — an iframe `src` (with or without an existing `?query`).
 * @param {{renderer?:string|null, egpt3D?:boolean, seed?:number|string|null}} [overrides]
 * @returns {string} `src` with the requested overrides applied. Identical to
 *   `src` when `overrides` is absent or every field is falsy/undefined.
 */
function applySavedUrlOverrides(src, overrides) {
    if (typeof src !== 'string' || !overrides) { return src; }
    var qIdx = src.indexOf('?');
    var base = qIdx === -1 ? src : src.slice(0, qIdx);
    var qs   = qIdx === -1 ? '' : src.slice(qIdx + 1);
    var params = new URLSearchParams(qs);

    if (overrides.renderer) { params.set('renderer', overrides.renderer); }
    if (overrides.egpt3D) { params.set('egpt3D', '1'); }
    if (overrides.seed !== undefined && overrides.seed !== null && overrides.seed !== '') {
        params.set('seed', String(overrides.seed));
    }

    var qsOut = params.toString();
    return qsOut ? (base + '?' + qsOut) : base;
}

// ── pickCameraReplay ─────────────────────────────────────────────────────────

/**
 * @param {{camera?: {orbit?:object|null, preset?:string|null}|null}} saved —
 *   a normalized saved-state bag (see `normalizeSavedRenderState`).
 * @returns {{mode:'preset', name:string}|{mode:'orbit', orbit:object}|null}
 *   `null` — no camera was captured (2D session, or nothing to replay).
 */
function pickCameraReplay(saved) {
    if (!saved || !saved.camera) { return null; }
    var cam = saved.camera;
    if (typeof cam.preset === 'string' && cam.preset.length > 0) {
        return { mode: 'preset', name: cam.preset };
    }
    if (cam.orbit && typeof cam.orbit === 'object') {
        return { mode: 'orbit', orbit: cam.orbit };
    }
    return null;
}

// ── normalizeSavedRenderState ────────────────────────────────────────────────

/**
 * Tolerant normalizer for a saved module's `renderState` field — a stored
 * record may be `undefined` (a pre-S6 legacy module), `null`, or a shape from
 * a future/older `version` — NEVER throws; every missing/malformed field
 * degrades to a neutral default (empty array / null / false) so every replay
 * call site can iterate/read without its own defensive shape checks.
 *
 * @param {*} raw
 * @returns {{
 *   version: number,
 *   renderer: string|null,
 *   engine: string|null,
 *   egpt3D: boolean,
 *   seed: string|null,
 *   backdropVisible: boolean,
 *   camera: {orbit:object|null, preset:string|null}|null,
 *   render: {key:string, value:*}[],
 *   pageControls: {id:string, value:*, bind:{object:string,prop:string}|null}[]
 * }}
 */
function normalizeSavedRenderState(raw) {
    var r = _isPlainObject(raw) ? raw : {};
    var camera = null;
    if (_isPlainObject(r.camera)) {
        camera = {
            orbit: _isPlainObject(r.camera.orbit) ? r.camera.orbit : null,
            preset: (typeof r.camera.preset === 'string') ? r.camera.preset : null
        };
    }
    return {
        version: (typeof r.version === 'number') ? r.version : 1,
        renderer: (typeof r.renderer === 'string' && r.renderer.length > 0) ? r.renderer : null,
        engine: (typeof r.engine === 'string' && r.engine.length > 0) ? r.engine : null,
        egpt3D: !!r.egpt3D,
        seed: (r.seed !== undefined && r.seed !== null && r.seed !== '') ? String(r.seed) : null,
        backdropVisible: !!r.backdropVisible,
        camera: camera,
        render: Array.isArray(r.render) ? r.render.filter(function (row) {
            return _isPlainObject(row) && typeof row.key === 'string' && row.key.length > 0;
        }) : [],
        pageControls: Array.isArray(r.pageControls) ? r.pageControls.filter(function (row) {
            return _isPlainObject(row) && typeof row.id === 'string' && row.id.length > 0;
        }).map(function (row) {
            return {
                id: row.id,
                value: row.value,
                bind: (_isPlainObject(row.bind) && typeof row.bind.object === 'string' &&
                       typeof row.bind.prop === 'string') ? { object: row.bind.object, prop: row.bind.prop } : null
            };
        }) : []
    };
}

// ── renderStateToBootOptions ─────────────────────────────────────────────────

/**
 * Translate a (raw or normalized) renderState bag into the boot-opts split a
 * standalone recipe host (`bootRecipe`) applies. Splits the bag into:
 *   - LOAD-TIME  : renderer / egpt3D / seed (chosen BEFORE the engine boots)
 *   - POST-START : renderOptions (`setRenderOption` each) + camera replay decision
 *                  + backdropVisible (applied AFTER `runner.start()`)
 *
 * PURE + DOM-free. Normalizes defensively so a caller can hand it a raw stored
 * bag. `camera` is the `pickCameraReplay` decision (preset over orbit).
 *
 * @param {*} raw — a renderState bag (raw stored, or already normalized).
 * @returns {{
 *   renderer: string|null,
 *   egpt3D: boolean,
 *   seed: string|null,
 *   renderOptions: {key:string, value:*}[],
 *   camera: {mode:'preset',name:string}|{mode:'orbit',orbit:object}|null,
 *   backdropVisible: boolean
 * }}
 */
function renderStateToBootOptions(raw) {
    var n = normalizeSavedRenderState(raw);
    return {
        renderer: n.renderer,
        egpt3D: n.egpt3D,
        seed: n.seed,
        renderOptions: n.render,
        camera: pickCameraReplay(n),
        backdropVisible: n.backdropVisible
    };
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    normalizeSavedRenderState,
    pickCameraReplay,
    applySavedUrlOverrides,
    renderStateToBootOptions
};
