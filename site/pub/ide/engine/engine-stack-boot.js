/* Copyright 2023-2026 by Essam Abadir */

/**
 * ensureEngineStack — boot the canonical engine + game layer so that the engine
 * globals a builder cell needs (window.FrqtlApp, window.EGPTUniverse,
 * LargeObject, QuantumEmitter, …) are installed.
 *
 * Named ESM export. Lives in lib/shim so the runtime builtin `frqtl.ensureEngine`
 * can boot the engine WITHOUT importing GraphicsPane (the upward-arrow veto) and
 * WITHOUT importing lib/frqtl/objects (the cross-arrow veto). It injects the SAME
 * canonical loader GraphicsPane.boot() injects — `experiments/_shared/stack-boot.js`
 * — via the caller's router resolve (the one path authority), then awaits the
 * `_egptWhenEngineReady` hook stack-boot/engine-boot install. ONE engine-boot
 * authority (stack-boot.js); no second loader.
 *
 * Why the runtime needs this: in the builder+canvas split, the builder js cell
 * (the producer) runs BEFORE the canvas cell (the consumer) — but the builder
 * calls frqtl.FrqtlApp, which needs window.FrqtlApp already
 * installed. GraphicsPane installs it only when the canvas cell boots, which is
 * too late. So frqtl.ensureEngine boots the engine stack first. We boot only up to
 * `_egptWhenEngineReady` (engine + game layer) — NOT p5/the renderer, which is the
 * canvas cell's GraphicsPane concern.
 *
 * Idempotent + cached: stack-boot.js's own <script> idempotency plus a cached
 * promise here mean repeated builder cells (and the StrictMode double-run) boot
 * the stack exactly once. FAIL-LOUD: if engine-boot never installs the ready hook
 * (the JS engine is missing) or the WASM ready promise rejects, the returned
 * promise rejects — never a silent half-boot.
 */

'use strict';

// This module owns its own idempotent <script> injector to load the engine STACK.
// (The former setup-factory <script> loader, setup-resolver.js, was retired in
// WS-NOTEBOOK-FACTORY-RETIRE — setups now load via the explicit-import builder path.)

var _bootPromise = null;

function _injectScript(src) {
    return new Promise(function (resolve, reject) {
        if (!src) { resolve(); return; }
        if (typeof document === 'undefined') {
            reject(new Error('[engine-stack-boot] no document — the engine can only boot in a browser.'));
            return;
        }
        var existing = document.querySelector('script[src="' + src + '"]');
        if (existing) {
            if (existing.getAttribute('data-egpt-loaded') === '1') { resolve(); }
            else if (existing.getAttribute('data-egpt-failed') === '1') { reject(new Error('Failed to load script: ' + src)); }
            else {
                existing.addEventListener('load',  function () { resolve(); });
                existing.addEventListener('error', function () { reject(new Error('Failed to load script: ' + src)); });
            }
            return;
        }
        var s = document.createElement('script');
        s.src = src;
        s.onload  = function () { s.setAttribute('data-egpt-loaded', '1'); resolve(); };
        s.onerror = function () { s.setAttribute('data-egpt-failed', '1'); reject(new Error('Failed to load script: ' + src)); };
        document.body.appendChild(s);
    });
}

/**
 * ensureEngineStack(routerResolveFn) → Promise<void>
 * Resolves once window.FrqtlApp + the engine globals are live.
 *
 * @param {(relPath:string)=>string} routerResolveFn — the engineRouter resolve.
 */
export function ensureEngineStack(routerResolveFn) {
    if (typeof window !== 'undefined' && typeof window.FrqtlApp === 'function') {
        // Already booted (e.g. a canvas cell ran first, or a prior builder cell).
        return Promise.resolve();
    }
    if (_bootPromise) { return _bootPromise; }
    if (typeof routerResolveFn !== 'function') {
        return Promise.reject(new Error(
            '[engine-stack-boot] ensureEngineStack requires a router-resolve function (FAIL-LOUD).'
        ));
    }
    _bootPromise = _injectScript(routerResolveFn('experiments/_shared/stack-boot.js'))
        .then(function () {
            return new Promise(function (resolve, reject) {
                if (typeof window === 'undefined' || typeof window._egptWhenEngineReady !== 'function') {
                    reject(new Error(
                        '[engine-stack-boot] engine-boot.js did not install _egptWhenEngineReady — ' +
                        'JS engine missing. (FAIL-LOUD.)'
                    ));
                    return;
                }
                // stack-boot.js drains the _egptWhenEngineReady queue right after
                // engine-boot.js, but BEFORE the GAME layer (which loads
                // FrqtlApp.js, EGPTUniverse, LargeObject, …) finishes. The
                // builder cell needs window.FrqtlApp, so we wait past the
                // engine-ready hook for the GAME layer's FrqtlApp global to
                // appear (it loads async immediately after). Poll with a hard
                // timeout → FAIL-LOUD rather than hang.
                window._egptWhenEngineReady(function () {
                    var start = Date.now();
                    (function pollRunner() {
                        if (typeof window.FrqtlApp === 'function') { resolve(); return; }
                        if (Date.now() - start > 15000) {
                            reject(new Error(
                                '[engine-stack-boot] window.FrqtlApp did not appear within 15s ' +
                                'after the engine became ready — the game layer failed to load. (FAIL-LOUD.)'
                            ));
                            return;
                        }
                        setTimeout(pollRunner, 50);
                    })();
                });
                // Mirror engine-boot's rejection surface (WASM path).
                (window._wasmReadyPromise || Promise.resolve()).catch(function (err) { reject(err); });
            });
        });
    // On failure, clear the cache so a later retry can re-attempt rather than
    // forever resolving the rejected promise.
    _bootPromise.catch(function () { _bootPromise = null; });
    return _bootPromise;
}
