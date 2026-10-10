/* Copyright 2023-2026 by Essam Abadir */

/**
 * PostMessageStorageProvider — .vsix webview-side StorageProvider transport.
 *
 * Implements the StorageProvider contract (lib/shim/storage/index.js) by posting
 * structured messages to the VSCode extension host and awaiting their replies.
 *
 * This is the .vsix TRANSPORT for the ONE persistence contract — it does NOT
 * fork the contract; only the backing driver changes (extension host document
 * instead of browser localStorage). The consumer (notebook-pane) calls the same
 * get/put/delete/list interface regardless of which provider is active.
 *
 * ── Wire protocol ──────────────────────────────────────────────────────────────
 *
 * Every operation posts a request and awaits a reply matched by a unique reqId:
 *
 *   webview → ext host:
 *     { type: 'storage:req', reqId: '<uuid>', op: 'get'|'put'|'delete'|'list',
 *       namespace: string, key?: string, value?: any }
 *
 *   ext host → webview:
 *     { type: 'storage:res', reqId: '<uuid>', ok: true, result: any }
 *     { type: 'storage:res', reqId: '<uuid>', ok: false, error: string }
 *
 * The webview sends via the acquireVsCodeApi() vscode.postMessage surface;
 * the ext host replies via webviewPanel.webview.postMessage.
 *
 * ── Timeout ────────────────────────────────────────────────────────────────────
 *
 *   Default 10 s. Operations that time out FAIL-LOUD — never a silent no-op.
 *
 * ── Usage (in the IDE host page, after acquireVsCodeApi) ────────────────────────
 *
 *   import { PostMessageStorageProvider } from 'lib/shim/storage/post-message-storage-provider.js';
 *   import { setActiveProvider } from 'lib/shim/storage/index.js';
 *
 *   // vscodeApi = acquireVsCodeApi() called once at page load.
 *   const provider = new PostMessageStorageProvider(vscodeApi.postMessage.bind(vscodeApi), window);
 *   setActiveProvider(provider);
 *
 * ── Arrow legality ─────────────────────────────────────────────────────────────
 *
 *   lib/shim/storage/ → lib/shim/storage/ (no upward or lateral dep).
 *   The VSCode API surface (postMessage, addEventListener) is injected via
 *   constructor args — NOT imported — so this file is host-neutral and
 *   node-testable without a real webview.
 */

'use strict';

var _DEFAULT_TIMEOUT_MS = 10000;
var _REQ_TYPE = 'storage:req';
var _RES_TYPE = 'storage:res';

/**
 * Generate a short unique request id.
 * @returns {string}
 */
function _reqId() {
  return 'sr_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
}

/**
 * Assert that a string argument is a valid namespace or key.
 * @param {string} value
 * @param {string} argName
 */
function _assertNonEmptyString(value, argName) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('[PostMessageStorageProvider] ' + argName +
      ' must be a non-empty string; got: ' + JSON.stringify(value));
  }
}

export class PostMessageStorageProvider {
  /**
   * @param {function(any): void} postMessageFn
   *   Sends a message to the extension host.  In the webview: pass
   *   `acquireVsCodeApi().postMessage.bind(vscodeApi)`.
   *   In tests: pass a spy/stub function.
   *
   * @param {EventTarget} eventTarget
   *   Receives `message` events from the extension host.  In the webview:
   *   pass `window`.  In tests: pass a mock EventTarget or an EventEmitter
   *   shim that fires 'message' events with `{ data: ... }`.
   *
   * @param {number} [timeoutMs=10000]
   *   Per-request timeout in milliseconds.  FAIL-LOUD on expiry.
   */
  constructor(postMessageFn, eventTarget, timeoutMs) {
    if (typeof postMessageFn !== 'function') {
      throw new Error('[PostMessageStorageProvider] postMessageFn must be a function');
    }
    if (!eventTarget || typeof eventTarget.addEventListener !== 'function') {
      throw new Error('[PostMessageStorageProvider] eventTarget must support addEventListener');
    }

    this._post = postMessageFn;
    this._target = eventTarget;
    this._timeout = (typeof timeoutMs === 'number' && timeoutMs > 0) ? timeoutMs : _DEFAULT_TIMEOUT_MS;

    // Map<reqId, { resolve, reject }> — pending requests awaiting extension-host reply.
    this._pending = new Map();

    // Bind the listener so we can remove it on dispose().
    this._onMessage = this._handleMessage.bind(this);
    this._target.addEventListener('message', this._onMessage);
  }

  /**
   * Handle incoming message events from the extension host.
   * @private
   */
  _handleMessage(ev) {
    // The webview receives data as ev.data; plain EventTarget shims may also use this shape.
    var msg = ev && ev.data;
    if (!msg || msg.type !== _RES_TYPE || typeof msg.reqId !== 'string') { return; }
    var entry = this._pending.get(msg.reqId);
    if (!entry) { return; }
    this._pending.delete(msg.reqId);
    clearTimeout(entry.timer);
    if (msg.ok) {
      entry.resolve(msg.result !== undefined ? msg.result : null);
    } else {
      entry.reject(new Error('[PostMessageStorageProvider] extension host error: ' +
        (msg.error || 'unknown error')));
    }
  }

  /**
   * Send a request to the extension host and await the reply.
   * @private
   * @param {object} req  — request body (without reqId; added here).
   * @returns {Promise<any>}
   */
  _request(req) {
    var self = this;
    var id = _reqId();
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () {
        self._pending.delete(id);
        reject(new Error('[PostMessageStorageProvider] request timed out after ' +
          self._timeout + ' ms — op=' + req.op + ' ns=' + req.namespace +
          (req.key ? ' key=' + req.key : '')));
      }, self._timeout);
      self._pending.set(id, { resolve: resolve, reject: reject, timer: timer });
      self._post(Object.assign({}, req, { type: _REQ_TYPE, reqId: id }));
    });
  }

  // ── StorageProvider contract ────────────────────────────────────────────────

  /**
   * Retrieve a value.  Returns null if not found; never throws on missing key.
   * @param {string} namespace
   * @param {string} key
   * @returns {Promise<any|null>}
   */
  get(namespace, key) {
    _assertNonEmptyString(namespace, 'namespace');
    _assertNonEmptyString(key, 'key');
    return this._request({ op: 'get', namespace: namespace, key: key });
  }

  /**
   * Write a JSON-serialisable value.  Overwrites any existing value.
   * @param {string} namespace
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  put(namespace, key, value) {
    _assertNonEmptyString(namespace, 'namespace');
    _assertNonEmptyString(key, 'key');
    return this._request({ op: 'put', namespace: namespace, key: key, value: value });
  }

  /**
   * Remove a key.  No-op if key does not exist.
   * @param {string} namespace
   * @param {string} key
   * @returns {Promise<void>}
   */
  delete(namespace, key) {
    _assertNonEmptyString(namespace, 'namespace');
    _assertNonEmptyString(key, 'key');
    return this._request({ op: 'delete', namespace: namespace, key: key });
  }

  /**
   * Enumerate all keys in a namespace.
   * @param {string} namespace
   * @returns {Promise<Array<{key: string}>>}
   */
  list(namespace) {
    _assertNonEmptyString(namespace, 'namespace');
    return this._request({ op: 'list', namespace: namespace });
  }

  /**
   * Remove the message listener and reject all pending requests.
   * Call when the provider is no longer needed (page unload).
   */
  dispose() {
    this._target.removeEventListener('message', this._onMessage);
    this._pending.forEach(function (entry, id) {
      clearTimeout(entry.timer);
      entry.reject(new Error('[PostMessageStorageProvider] disposed while request was in flight (reqId=' + id + ')'));
    });
    this._pending.clear();
  }
}
