/* Copyright 2023-2026 by Essam Abadir */

/**
 * artifact-fetch-clone-proxy.mjs — reusable simulation of the claude.ai
 * Artifact iframe's fetch proxy (ws-artifact-showcase Bite A5).
 *
 * WHY THIS EXISTS: a pasted claude.ai Artifact runs inside a sandboxed iframe
 * whose `window.fetch` is NOT a direct network fetch — it is PROXIED to the
 * parent frame via `postMessage`. Every argument that call carries must be
 * structured-clonable (the HTML Structured Clone Algorithm); a `URL` or
 * `Request` object is NOT clonable, so the browser throws `DataCloneError`.
 * This is EXACTLY the class of defect that broke wasm-pack's generated
 * `__wbg_init()` glue when called bare (`wasmModule.default()`): with no
 * argument it defaults to `new URL('..._bg.wasm', import.meta.url)` and calls
 * `fetch(urlObject)` — the real claude.ai paste's stack trace, verbatim:
 *   `DataCloneError: Failed to execute 'postMessage' on 'Window': URL object
 *   could not be cloned` at `window.fetch (about:srcdoc:109)` <-
 *   `Module.__wbg_init (egpt_wasm.js:1197)` <- `load (wasm-load-browser.js:82)`
 *   <- `bootDoubleSlit (esm/index.js:285)`.
 *
 * Confirmed via the platform's OWN global `structuredClone()`: `new URL(...)`
 * throws `DataCloneError` identically to a real browser's fetch-proxy check
 * (Node's `structuredClone()` implements the same algorithm) — see the
 * regression tests that consume this helper for the verified trace.
 *
 * USAGE — node --test regression (see wasm-load-browser.test.mjs and
 * sdk/egpt-math-sdk/test/wasm-loader-artifact-proxy.test.mjs):
 *   globalThis.fetch = wrapFetchWithArtifactCloneProxy(realFetchImpl);
 *   // ... exercise code that calls fetch(...) — non-clonable args reject
 *   //     with a DataCloneError; clonable args (strings, bytes) pass through
 *   //     to realFetchImpl unchanged.
 *
 * USAGE — Playwright / real-browser "CSP-replay" harness (frqtl-tester owns
 * running this; this module only supplies the reusable simulation source):
 *   await page.addInitScript({ content: injectArtifactCloneProxySource() });
 *   // BEFORE navigation, so window.fetch is wrapped from the very first
 *   // script the page runs — mirrors how the real Artifact host installs
 *   // its own fetch proxy before any page script executes. A boot that
 *   // succeeds under this simulation plus the captured claude.ai CSP is the
 *   // strongest pre-publish signal short of an actual paste-and-run.
 *
 * Pure — no DOM/browser globals touched at module-eval time; both exports
 * are safe to call in Node (this file) AND to stringify verbatim into a page
 * context (the Playwright usage above).
 */

'use strict';

/**
 * @param {*} arg
 * @returns {string} a short, legible description for the thrown DataCloneError message.
 */
export function describeUnclonableArg(arg) {
    if (typeof URL !== 'undefined' && arg instanceof URL) return 'URL object';
    if (typeof Request !== 'undefined' && arg instanceof Request) return 'Request object';
    return String(arg);
}

/**
 * Wrap a real `fetch` implementation so it REJECTS with a `DataCloneError`
 * for any argument (or `init` options bag) that fails `structuredClone()` —
 * the same check a claude.ai Artifact iframe's fetch-proxy performs when it
 * postMessages the call to its parent frame.
 *
 * @param {typeof fetch} realFetch
 * @returns {typeof fetch}
 * @example
 *   const proxied = wrapFetchWithArtifactCloneProxy(realFetch);
 *   await proxied('https://example.com/x');       // OK — strings clone fine.
 *   await proxied(new URL('https://example.com')); // rejects: DataCloneError.
 */
export function wrapFetchWithArtifactCloneProxy(realFetch) {
    return function proxiedFetch(input, init) {
        try {
            structuredClone(input);
        } catch (e) {
            return Promise.reject(new DOMException(
                "Failed to execute 'postMessage' on 'Window': " + describeUnclonableArg(input) + ' could not be cloned.',
                'DataCloneError'
            ));
        }
        if (init !== undefined) {
            try {
                structuredClone(init);
            } catch (e) {
                return Promise.reject(new DOMException(
                    "Failed to execute 'postMessage' on 'Window': the fetch() init object could not be cloned.",
                    'DataCloneError'
                ));
            }
        }
        return realFetch(input, init);
    };
}

/**
 * Self-contained source text for `page.addInitScript({content})` — wraps
 * `window.fetch` in place with the identical clone-check `
 * wrapFetchWithArtifactCloneProxy` performs above. A `page.addInitScript`
 * payload cannot `import` this module, so the check is duplicated here as a
 * plain string (kept intentionally tiny and dependency-free so the
 * duplication is trivially auditable by eye against the function above).
 *
 * @returns {string} an IIFE source string that installs the wrapped `window.fetch`.
 */
export function injectArtifactCloneProxySource() {
    return '(' + function () {
        var _realFetch = window.fetch.bind(window);
        function _describe(arg) {
            if (typeof URL !== 'undefined' && arg instanceof URL) return 'URL object';
            if (typeof Request !== 'undefined' && arg instanceof Request) return 'Request object';
            return String(arg);
        }
        window.fetch = function (input, init) {
            try {
                structuredClone(input);
            } catch (e) {
                return Promise.reject(new DOMException(
                    "Failed to execute 'postMessage' on 'Window': " + _describe(input) + ' could not be cloned.',
                    'DataCloneError'
                ));
            }
            if (init !== undefined) {
                try {
                    structuredClone(init);
                } catch (e) {
                    return Promise.reject(new DOMException(
                        "Failed to execute 'postMessage' on 'Window': the fetch() init object could not be cloned.",
                        'DataCloneError'
                    ));
                }
            }
            return _realFetch(input, init);
        };
    }.toString() + ')();';
}
