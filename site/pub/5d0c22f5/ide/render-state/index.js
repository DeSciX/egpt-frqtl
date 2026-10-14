/* Copyright 2023-2026 by Essam Abadir */

/**
 * lib/shim/render-state/index.js — the ONE shim-level owner of the PURE
 * renderState contract (ws-experiments-walkthrough Bite 2, CEO ruling E2a).
 *
 * ── Why this lives in the shim ───────────────────────────────────────────────
 *
 * A saved project's `renderState` bag (renderer/seed load-time selections
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
 *                                        renderer/seed query params.
 *   renderStateToBootOptions(raw)      — pure translation of a renderState bag into
 *                                        the boot-opts split a recipe host applies:
 *                                        LOAD-TIME (renderer/seed) vs
 *                                        POST-START (renderOptions/camera/backdrop).
 *   partitionRenderRows(rows, declared, known)
 *                                      — resolve saved render rows against the TARGET
 *                                        renderer before anything is written: apply /
 *                                        retain / throw.
 *   renderRowsFromBag(bag)             — a { key: value } render-option bag as ordered
 *                                        [{ key, value }] render rows.
 *
 * ── Layer 2: physics behavior ────────────────────────────────────────────────
 *
 * Zero physics — pure data shaping over an already-captured / about-to-be-replayed
 * state bag. Replaying a value produces the IDENTICAL effect as a user re-dragging
 * the same control to that value; the render/physics accessors downstream
 * (`runner.setRenderOptions` / `cameraControl.setPreset` / …) do the actual work.
 */

'use strict';

// ── shape guard ──────────────────────────────────────────────────────────────

/** @returns {boolean} */
function _isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

// ── applySavedUrlOverrides ───────────────────────────────────────────────────

/**
 * Set (or leave untouched) the `renderer`/`seed` query params on an
 * experiment iframe `src` — the load-TIME axis of a saved render-state bag.
 *
 * @param {string} src — an iframe `src` (with or without an existing `?query`).
 * @param {{renderer?:string|null, seed?:number|string|null}} [overrides]
 * @returns {string} `src` with the requested overrides applied. Identical to
 *   `src` when `overrides` is absent or every field is falsy/undefined.
 */
function applySavedUrlOverrides(src, overrides) {
    if (typeof src !== 'string' || !overrides) { return src; }
    if (Object.prototype.hasOwnProperty.call(overrides, 'egpt3D')) {
        throw new Error('[render-state] applySavedUrlOverrides: `egpt3D` is DELETED — 3D-ness is the scene\'s ' +
            'co-init call (exp.createScene), and the display is `renderer` (three IS the 3D display). (FAIL-LOUD.)');
    }
    var qIdx = src.indexOf('?');
    var base = qIdx === -1 ? src : src.slice(0, qIdx);
    var qs   = qIdx === -1 ? '' : src.slice(qIdx + 1);
    var params = new URLSearchParams(qs);

    if (overrides.renderer) { params.set('renderer', overrides.renderer); }
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
 *   - LOAD-TIME  : renderer / seed (chosen BEFORE the engine boots)
 *   - POST-START : renderOptions (partitioned by `partitionRenderRows`, then ONE
 *                  `setRenderOptions` batch) + camera replay decision
 *                  + backdropVisible (applied AFTER `runner.start()`)
 *
 * PURE + DOM-free. Normalizes defensively so a caller can hand it a raw stored
 * bag. `camera` is the `pickCameraReplay` decision (preset over orbit).
 *
 * @param {*} raw — a renderState bag (raw stored, or already normalized).
 * @returns {{
 *   renderer: string|null,
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
        seed: n.seed,
        renderOptions: n.render,
        camera: pickCameraReplay(n),
        backdropVisible: n.backdropVisible
    };
}

// ── partitionRenderRows ──────────────────────────────────────────────────────

/**
 * Resolve a saved bag's `render[]` rows against the renderer that will RECEIVE them,
 * before anything is written. A saved row was authored against the renderer its bag
 * names; after a renderer switch (STUDIO's 3D/2D toggle is a reload onto another
 * provider) each row falls in exactly one class:
 *   - declared by the target        → `apply` (a `{key: value}` bag for ONE
 *                                     `runner.setRenderOptions` call; a later row wins)
 *   - declared by another renderer  → `retained` (NOT applied; the host keeps it in the
 *                                     saved bag and shows it, so switching back restores it)
 *   - declared by no renderer       → THROWS (a typo, or a deleted option)
 *
 * PURE + DOM-free. `declaredNames` is the target's `renderCapabilities()` names;
 * `knownNames` is `RenderCapabilitiesCommon.knownRenderCapabilityNames(registry)`.
 *
 * @param {{key:string, value:*}[]} rows
 * @param {string[]} declaredNames
 * @param {string[]} knownNames
 * @returns {{apply: Object<string, *>, retained: {key:string, value:*}[]}}
 * @throws {Error} on a row whose key no registered renderer declares, or bad arguments.
 */
function partitionRenderRows(rows, declaredNames, knownNames) {
    if (!Array.isArray(rows) || !Array.isArray(declaredNames) || !Array.isArray(knownNames)) {
        throw new Error('[render-state] partitionRenderRows(rows, declaredNames, knownNames) takes three ' +
            'arrays. (FAIL-LOUD.)');
    }
    var apply = {};
    var retained = [];
    for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        if (declaredNames.indexOf(row.key) !== -1) {
            apply[row.key] = row.value;
        } else if (knownNames.indexOf(row.key) !== -1) {
            retained.push({ key: row.key, value: row.value });
        } else {
            throw new Error('[render-state] saved render option "' + row.key + '" is declared by no ' +
                'registered renderer (known: [' + knownNames.join(', ') + ']). (FAIL-LOUD: a typo or a ' +
                'deleted option would otherwise silently change the picture.)');
        }
    }
    return { apply: apply, retained: retained };
}

/**
 * renderRowsFromBag(bag) — a render-option BAG (`{ key: value }`, the `runner.setRenderOptions`
 * shape) as the ordered `[{ key, value }]` render rows a renderState carries, in the bag's own key
 * order. The ONE place a bag becomes rows, so a look owned as a bag (lib/shim/render/sun-look.js)
 * reaches a rung's renderState without a hand-typed row list.
 *
 * PURE + DOM-free.
 *
 * @param {Object<string, *>} bag
 * @returns {{key:string, value:*}[]}
 * @throws {Error} on a non-object or an array.
 */
function renderRowsFromBag(bag) {
    if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
        throw new Error('[render-state] renderRowsFromBag(bag) takes a plain { key: value } object; got ' +
            (Array.isArray(bag) ? 'an array' : String(bag)) + '. (FAIL-LOUD.)');
    }
    return Object.keys(bag).map(function (k) { return { key: k, value: bag[k] }; });
}

// ── Export ────────────────────────────────────────────────────────────────────

export {
    normalizeSavedRenderState,
    pickCameraReplay,
    applySavedUrlOverrides,
    renderStateToBootOptions,
    partitionRenderRows,
    renderRowsFromBag
};
