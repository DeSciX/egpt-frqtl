/* Copyright 2023-2026 by Essam Abadir */

/**
 * scene-source.js — the ONE reader of a scene's sketch file.
 *
 * A scene is ONE file, `lib/frqtl/scenes/<file>.js`: a dual-mode `buildExperiment(exp)`
 * module holding the whole scene (world, parts, render intent). A registry row carries
 * its frqtl-relative PATH (`source: 'scenes/<file>.js'`), never its text. Every browser
 * consumer that needs the text (the GYM's rung frame, STUDIO, the hero) asks here, so
 * the path → URL → text chain exists once.
 *
 *   scenePath(rung)                 → 'scenes/<file>.js'   (THROWS on any other shape)
 *   loadSceneSource(router, rung)   → Promise<string>      (the file's text)
 *
 * FAIL-LOUD: a row without a scenes/ path, a non-200 response, or an empty body REJECTS
 * naming the rung and the URL. A blank scene is never a result.
 *
 * Zero physics: this moves text. The scene's physics is whatever its file composes.
 */

'use strict';

/** The one path prefix a scene file lives under (the router's `scenes/` profile key). */
export var SCENES_PREFIX = 'scenes/';

/**
 * The blank world — STUDIO's "Empty Universe" — is itself a scene file (the empty page states no
 * world of its own). A row-shaped handle so it reads through the same `loadSceneSource`.
 */
export var EMPTY_SCENE = Object.freeze({ id: 'empty', source: 'scenes/empty.js' });

/**
 * @param {{id?:string, source?:string}} rung — a registry row.
 * @returns {string} the frqtl-relative scene path.
 */
export function scenePath(rung) {
    var src = rung && rung.source;
    if (typeof src !== 'string' || src.indexOf(SCENES_PREFIX) !== 0 || !/\.js$/.test(src)) {
        throw new Error('[scene-source] rung "' + (rung && rung.id) + '" declares source ' +
            JSON.stringify(src) + ' — a scene row carries the path of its sketch file, ' +
            "'scenes/<file>.js' (lib/frqtl/scenes/). (FAIL-LOUD.)");
    }
    return src;
}

/**
 * Fetch a scene file's text through the router's path authority.
 * @param {{resolve:function(string):string}} router — an engineRouter() instance.
 * @param {{id:string, source:string}} rung
 * @param {function} [fetchImpl] — defaults to the global fetch (injectable for tests).
 * @returns {Promise<string>}
 */
export function loadSceneSource(router, rung, fetchImpl) {
    var rel;
    try { rel = scenePath(rung); } catch (e) { return Promise.reject(e); }
    if (!router || typeof router.resolve !== 'function') {
        return Promise.reject(new Error('[scene-source] loadSceneSource needs the engineRouter ' +
            '(lib/shim/engine/router.js) to resolve ' + rel + '. (FAIL-LOUD.)'));
    }
    var url = router.resolve(rel);
    var f = fetchImpl || (typeof fetch === 'function' ? fetch : null);
    if (!f) {
        return Promise.reject(new Error('[scene-source] no fetch available to load ' + url + '.'));
    }
    return Promise.resolve(f(url)).then(function (res) {
        if (!res || !res.ok) {
            throw new Error('[scene-source] scene "' + rung.id + '" — GET ' + url + ' answered ' +
                (res ? res.status : 'nothing') + '. (FAIL-LOUD.)');
        }
        return res.text();
    }).then(function (text) {
        if (typeof text !== 'string' || !text.trim()) {
            throw new Error('[scene-source] scene "' + rung.id + '" — ' + url +
                ' has an empty body. (FAIL-LOUD.)');
        }
        return text;
    });
}
