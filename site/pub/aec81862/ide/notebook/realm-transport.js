/* Copyright 2023-2026 by Essam Abadir */

/**
 * @module realm-transport
 * @description
 * Transport abstraction a realm pre-load's `boot(hostEl, transport)` receives.
 *
 * ONE handle, TWO transports, host-neutral:
 *  - **in-app**: same-origin direct scripting. The descriptor may ignore
 *    `post`/`subscribe` and script the realm env directly. The transport is a
 *    `kind:'in-app'` marker + an in-memory pub/sub channel.
 *  - **vsix**: postMessage marshalling for the cross-origin localhost realm
 *    (WS-VSIX-V2c). Control verbs (start/stop/step/dispose) + inject(name,data)
 *    cross postMessage; the per-frame loop NEVER crosses the seam (C3).
 *
 * The transport object shape a descriptor's `boot()` receives:
 * ```js
 * {
 *   kind: 'in-app' | 'vsix',
 *   post(message): void,           // send a control/data message
 *   subscribe(handler): unsubFn,   // receive messages from the realm
 *   isInApp(): boolean             // convenience check
 * }
 * ```
 *
 * Cell code NEVER branches on transport — it sees only the frozen `ViewHandle`.
 */

/**
 * @typedef {object} RealmTransport
 * @property {'in-app'|'vsix'} kind — transport mode.
 * @property {(message: object) => void} post — send a message across the seam.
 * @property {(handler: Function) => Function} subscribe
 *   Register a message handler; returns an unsubscribe function.
 * @property {() => boolean} isInApp — returns `true` for in-app transports.
 */

'use strict';

import { makeViewHandle } from './view-handle.js';

/**
 * Create the in-app (same-origin) transport.
 *
 * `post`/`subscribe` are a trivial in-memory pub/sub channel so a descriptor
 * written transport-agnostically still works. A descriptor that scripts its
 * env directly may call `isInApp()` and skip them.
 *
 * @returns {RealmTransport}
 *
 * @example
 * import { inAppTransport } from 'lib/shim/notebook/realm-transport.js';
 * const transport = inAppTransport();
 * const { handle } = myDescriptor.boot(hostEl, transport);
 */
export function inAppTransport() {
    var handlers = [];
    return {
        kind: 'in-app',
        isInApp: function () { return true; },
        post: function (message) {
            // Direct dispatch — same window, synchronous. (A descriptor that scripts
            // its env directly need not use this.)
            for (var i = 0; i < handlers.length; i++) {
                try { handlers[i](message); } catch (e) { /* observer error is not the sender's */ }
            }
        },
        subscribe: function (handler) {
            if (typeof handler !== 'function') {
                throw new Error('[realm-transport:in-app] subscribe requires a function.');
            }
            handlers.push(handler);
            return function () {
                var idx = handlers.indexOf(handler);
                if (idx !== -1) { handlers.splice(idx, 1); }
            };
        }
    };
}

/**
 * Create the vsix postMessage transport.
 *
 * Normalizes over two host channel shapes (DRY — no per-host fork):
 *  - VSCode shape: `{ postMessage(msg), onDidReceiveMessage(handler) → Disposable }`
 *    (used on both the controller side and the renderer side in VSCode).
 *  - Plain/test shape: `{ post(msg), subscribe(handler) → unsubFn }`.
 *
 * The data plane is already serializability-gated by `makeViewHandle`
 * (VETO-CLASS #1). This transport does NOT re-assert — it is a thin adapter.
 *
 * @param {object} [opts]
 * @param {object} [opts.channel]
 *   The host messaging channel. Accepts VSCode `postMessage`/`onDidReceiveMessage`
 *   or plain `post`/`subscribe`. FAIL-LOUD if neither shape is present.
 * @returns {RealmTransport} a transport with `kind:'vsix'`.
 * @throws {Error} if `opts.channel` is absent or has neither recognized shape.
 *
 * @example
 * // Controller side (apps/vscode-notebook/src/controller-core.js):
 * import { vsixPostMessageTransport } from 'lib/shim/notebook/realm-transport.js';
 * const transport = vsixPostMessageTransport({
 *   channel: notebooks.createRendererMessaging('frqtl-console-renderer')
 * });
 */
export function vsixPostMessageTransport(opts) {
    opts = opts || {};
    var channel = opts.channel || null;

    // Normalize the host channel to a uniform { _post, _subscribe } pair. We accept the
    // VSCode messaging shape (postMessage/onDidReceiveMessage) AND a plain post/subscribe
    // shape so the same transport serves the controller side, the renderer side, and the
    // node test — ONE adapter, no per-host fork.
    var rawPost = null, rawSubscribe = null;
    if (channel) {
        if (typeof channel.postMessage === 'function') {
            rawPost = function (m) { return channel.postMessage(m); };
        } else if (typeof channel.post === 'function') {
            rawPost = function (m) { return channel.post(m); };
        }
        if (typeof channel.onDidReceiveMessage === 'function') {
            rawSubscribe = function (handler) {
                // VSCode's onDidReceiveMessage hands { editor?, message } on the
                // controller side and the raw message on the renderer side. Unwrap a
                // wrapper so subscribers always receive the message body.
                var disposable = channel.onDidReceiveMessage(function (ev) {
                    var msg = (ev && typeof ev === 'object' && 'message' in ev) ? ev.message : ev;
                    handler(msg);
                });
                return function () {
                    if (disposable && typeof disposable.dispose === 'function') { disposable.dispose(); }
                };
            };
        } else if (typeof channel.subscribe === 'function') {
            rawSubscribe = function (handler) { return channel.subscribe(handler); };
        }
    }

    if (!rawPost || !rawSubscribe) {
        throw new Error('[realm-transport:vsix] requires opts.channel with a postMessage/' +
            'onDidReceiveMessage (VSCode) or post/subscribe (plain) shape. ' +
            '(FAIL-LOUD — a vsix transport with no channel cannot deliver the Run trigger.)');
    }

    return {
        kind: 'vsix',
        isInApp: function () { return false; },
        // Marshal the controller↔renderer message over the host channel. The body is
        // already structured-clone-safe (view-handle gate); we pass it through.
        post: function (message) { return rawPost(message); },
        subscribe: function (handler) {
            if (typeof handler !== 'function') {
                throw new Error('[realm-transport:vsix] subscribe requires a function. (FAIL-LOUD.)');
            }
            return rawSubscribe(handler);
        },
        _channel: channel
    };
}

/**
 * @typedef {object} RealmProxyHandleResult
 * @property {ViewHandle} handle — the frozen proxy view handle (renderer side).
 * @property {() => Promise<void>} whenReady
 *   Resolves with the `realm:ready` message when the realm iframe has booted.
 *   Resolves immediately if already ready.
 * @property {() => void} dispose — tear down the proxy and unsubscribe locally.
 */

/**
 * Create a renderer-side thin proxy over a cross-origin localhost realm (V2c).
 *
 * Produces the SAME frozen `ViewHandle` (via `makeViewHandle`) whose verbs marshal
 * over the transport to the realm-entry running inside the localhost iframe. The
 * realm-entry drives the LIVE handle; this proxy only POSTS control + RECEIVES events.
 * ONE transport, ONE view-handle shape — no forked realm API, no second channel (C4).
 *
 * The per-frame loop NEVER crosses the seam (C3). Only control verbs
 * (start/stop/step/dispose), `inject(name, data)` (the serializable recipe), and
 * SERIALIZABLE events cross `postMessage`.
 *
 * Message protocol (all tagged `{ __frqtlRealm: true, cellId, … }`):
 * - proxy → realm: `{ type:'realm:data', name, data }` | `{ type:'realm:control', verb }`
 * - realm → proxy: `realm:ready` | `realm:event` | `realm:result` | `realm:error`
 *
 * @param {RealmTransport} transport — a `vsixPostMessageTransport` or any `{ post, subscribe }`.
 * @param {object} [opts]
 * @param {string} [opts.cellId] — realm cell id (tags messages so a multi-realm renderer routes correctly).
 * @returns {RealmProxyHandleResult}
 * @throws {Error} if `transport` lacks `post`/`subscribe`.
 *
 * @example
 * // Renderer side of the vsix (apps/vscode-notebook/src/renderer.js):
 * import { vsixPostMessageTransport, makeRealmProxyHandle } from 'lib/shim/notebook/realm-transport.js';
 * const transport = vsixPostMessageTransport({ channel: context });
 * const { handle, whenReady } = makeRealmProxyHandle(transport, { cellId: cell.id });
 * await whenReady();
 * await handle.inject('experiment', recipe);
 * await handle.start();
 */
export function makeRealmProxyHandle(transport, opts) {
    if (!transport || typeof transport.post !== 'function' || typeof transport.subscribe !== 'function') {
        throw new Error('[realm-transport] makeRealmProxyHandle requires a transport with ' +
            'post/subscribe. (FAIL-LOUD.)');
    }
    opts = opts || {};
    var cellId = opts.cellId || null;

    // event → [cb] for handle.on(); step has at most one in-flight resolver.
    var eventSubs = Object.create(null);
    var pendingStep = null;
    var ready = false;
    var readyResolvers = [];

    function _matches(msg) {
        if (!msg || msg.__frqtlRealm !== true) { return false; }
        if (cellId && msg.cellId && msg.cellId !== cellId) { return false; }
        return true;
    }

    var unsub = transport.subscribe(function (msg) {
        if (!_matches(msg)) { return; }
        if (msg.type === 'realm:ready') {
            ready = true;
            var rs = readyResolvers; readyResolvers = [];
            for (var i = 0; i < rs.length; i++) { try { rs[i](msg); } catch (e) {} }
        } else if (msg.type === 'realm:event') {
            var cbs = eventSubs[msg.event];
            if (cbs) {
                for (var j = 0; j < cbs.length; j++) {
                    try { cbs[j](msg.payload); } catch (e) { /* observer errors are not ours */ }
                }
            }
        } else if (msg.type === 'realm:result' && msg.verb === 'step') {
            if (pendingStep) { var r = pendingStep; pendingStep = null; r.resolve(msg.value); }
        } else if (msg.type === 'realm:error') {
            if (pendingStep) { var pe = pendingStep; pendingStep = null; pe.reject(new Error(msg.message)); }
            // a non-step error surfaces via the renderer's badge/overlay (it also subscribes).
        }
    });

    function send(type, extra) {
        var m = { __frqtlRealm: true, type: type };
        if (cellId) { m.cellId = cellId; }
        if (extra) { Object.keys(extra).forEach(function (k) { m[k] = extra[k]; }); }
        transport.post(m);
    }

    // The proxy impl marshals every verb over the transport. makeViewHandle wraps it into
    // the SAME frozen surface (inject/call/on/start/stop/step/dispose) + the
    // assertSerializable gate on inject + event payloads.
    var impl = {
        _transport: transport.kind || 'vsix',
        // inject(name,data): for the realm-entry, the FIRST inject IS the initial drive
        // ('experiment'|'chart' → _driveData). We post it as realm:data carrying the recipe.
        inject: function (name, data) {
            send('realm:data', { name: name, data: data });
            return Promise.resolve();
        },
        // call(): the renderer proxy does not synchronously invoke realm fns (the live
        // handle is in the realm). The notebook controls only use start/stop/step.
        call: function (fn) {
            return Promise.reject(new Error('[realm-transport] proxy handle does not support ' +
                'call("' + fn + '") across the seam (the live handle is in the realm). (FAIL-LOUD.)'));
        },
        on: function (event, cb) {
            (eventSubs[event] = eventSubs[event] || []).push(cb);
            return function () {
                var arr = eventSubs[event];
                if (!arr) { return; }
                var idx = arr.indexOf(cb);
                if (idx !== -1) { arr.splice(idx, 1); }
            };
        },
        start: function () { send('realm:control', { verb: 'start' }); },
        stop:  function () { send('realm:control', { verb: 'stop' }); },
        step:  function () {
            send('realm:control', { verb: 'step' });
            return new Promise(function (resolve, reject) { pendingStep = { resolve: resolve, reject: reject }; });
        },
        dispose: function () {
            send('realm:control', { verb: 'dispose' });
            if (typeof unsub === 'function') { try { unsub(); } catch (e) {} }
            eventSubs = Object.create(null);
            if (pendingStep) { var p = pendingStep; pendingStep = null; p.reject(new Error('[realm-transport] disposed')); }
        }
    };

    var handle = makeViewHandle(impl);

    return {
        handle: handle,
        // whenReady() resolves with the realm:ready message (carries DERIVED backend/
        // transport for the badge, C7) — or immediately if already ready.
        whenReady: function () {
            if (ready) { return Promise.resolve({ type: 'realm:ready', transport: handle.transport }); }
            return new Promise(function (resolve) { readyResolvers.push(resolve); });
        },
        dispose: function () { handle.dispose(); }
    };
}
