/* Copyright 2023-2026 by Essam Abadir */

/**
 * Tests for PostMessageStorageProvider (lib/shim/storage/post-message-storage-provider.js).
 *
 * Tests the message contract with a fake transport (no real webview/extension).
 * Covers: get / put / delete / list contract; timeout; dispose.
 */

import { strict as assert } from 'node:assert';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { PostMessageStorageProvider } from '../post-message-storage-provider.js';

// ── Minimal EventTarget shim for Node ────────────────────────────────────────

class FakeEventTarget {
  constructor() { this._listeners = {}; }
  addEventListener(type, fn) {
    if (!this._listeners[type]) { this._listeners[type] = []; }
    this._listeners[type].push(fn);
  }
  removeEventListener(type, fn) {
    if (!this._listeners[type]) { return; }
    this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
  }
  /** Simulate the ext host posting a message back to the webview. */
  dispatchMessage(data) {
    const ev = { data };
    (this._listeners['message'] || []).forEach((fn) => fn(ev));
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create a provider + a spy transport that auto-replies with `replyFn(req)`.
 *
 * @param {(req: object) => object} replyFn  Returns the reply data object.
 * @param {number} [timeoutMs]
 */
function makeProvider(replyFn, timeoutMs) {
  const target = new FakeEventTarget();
  const posted = [];
  const post = (msg) => {
    posted.push(msg);
    // Auto-reply via setImmediate so the promise resolves async (realistic).
    setImmediate(() => {
      const reply = replyFn(msg);
      if (reply) { target.dispatchMessage(reply); }
    });
  };
  const provider = new PostMessageStorageProvider(post, target, timeoutMs || 1000);
  return { provider, target, posted };
}

/**
 * Build a success reply for a given request.
 * @param {object} req
 * @param {any} result
 */
function ok(req, result) {
  return { type: 'storage:res', reqId: req.reqId, ok: true, result: result !== undefined ? result : null };
}

/**
 * Build an error reply for a given request.
 * @param {object} req
 * @param {string} error
 */
function err(req, error) {
  return { type: 'storage:res', reqId: req.reqId, ok: false, error };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PostMessageStorageProvider', () => {
  describe('constructor validation', () => {
    it('throws if postMessageFn is not a function', () => {
      const target = new FakeEventTarget();
      assert.throws(
        () => new PostMessageStorageProvider(null, target),
        /postMessageFn must be a function/
      );
    });

    it('throws if eventTarget lacks addEventListener', () => {
      assert.throws(
        () => new PostMessageStorageProvider(() => {}, {}),
        /eventTarget must support addEventListener/
      );
    });
  });

  describe('get()', () => {
    it('sends a get request and resolves with the result', async () => {
      const { provider, posted } = makeProvider((req) => ok(req, { id: 'nb_1', html: '<frqtl-notebook/>' }));
      const result = await provider.get('notebooks', 'nb_1');
      assert.equal(posted.length, 1);
      assert.deepEqual(posted[0], {
        type: 'storage:req', reqId: posted[0].reqId,
        op: 'get', namespace: 'notebooks', key: 'nb_1'
      });
      assert.deepEqual(result, { id: 'nb_1', html: '<frqtl-notebook/>' });
      provider.dispose();
    });

    it('resolves with null when result is null', async () => {
      const { provider } = makeProvider((req) => ok(req, null));
      const result = await provider.get('notebooks', 'missing');
      assert.equal(result, null);
      provider.dispose();
    });

    it('rejects on error reply', async () => {
      const { provider } = makeProvider((req) => err(req, 'not found'));
      await assert.rejects(
        () => provider.get('notebooks', 'nb_x'),
        /extension host error: not found/
      );
      provider.dispose();
    });

    it('throws on empty namespace', () => {
      const { provider } = makeProvider((req) => ok(req, null));
      assert.throws(() => provider.get('', 'key'), /namespace must be a non-empty string/);
      provider.dispose();
    });

    it('throws on empty key', () => {
      const { provider } = makeProvider((req) => ok(req, null));
      assert.throws(() => provider.get('ns', ''), /key must be a non-empty string/);
      provider.dispose();
    });
  });

  describe('put()', () => {
    it('sends a put request with namespace, key, and value', async () => {
      const { provider, posted } = makeProvider((req) => ok(req, null));
      await provider.put('notebooks', 'nb_1', { html: '<frqtl-notebook>…</frqtl-notebook>', title: 'T' });
      assert.equal(posted.length, 1);
      assert.equal(posted[0].op, 'put');
      assert.equal(posted[0].namespace, 'notebooks');
      assert.equal(posted[0].key, 'nb_1');
      assert.equal(posted[0].value.title, 'T');
      provider.dispose();
    });

    it('resolves (void) on success', async () => {
      const { provider } = makeProvider((req) => ok(req, null));
      const result = await provider.put('notebooks', 'nb_1', { html: '<frqtl-notebook/>' });
      assert.equal(result, null);
      provider.dispose();
    });
  });

  describe('delete()', () => {
    it('sends a delete request', async () => {
      const { provider, posted } = makeProvider((req) => ok(req, null));
      await provider.delete('notebooks', 'nb_1');
      assert.equal(posted[0].op, 'delete');
      assert.equal(posted[0].namespace, 'notebooks');
      assert.equal(posted[0].key, 'nb_1');
      provider.dispose();
    });
  });

  describe('list()', () => {
    it('sends a list request and resolves with the array', async () => {
      const entries = [{ key: 'nb_1' }, { key: 'nb_2' }];
      const { provider } = makeProvider((req) => ok(req, entries));
      const result = await provider.list('notebooks');
      assert.deepEqual(result, entries);
      provider.dispose();
    });

    it('resolves with empty array when no entries', async () => {
      const { provider } = makeProvider((req) => ok(req, []));
      const result = await provider.list('notebooks');
      assert.deepEqual(result, []);
      provider.dispose();
    });

    it('throws on empty namespace', () => {
      const { provider } = makeProvider((req) => ok(req, []));
      assert.throws(() => provider.list(''), /namespace must be a non-empty string/);
      provider.dispose();
    });
  });

  describe('concurrent requests', () => {
    it('matches replies to requests by reqId', async () => {
      // Delay reply for 'nb_slow'; reply 'nb_fast' immediately.
      const delays = { 'nb_slow': 50, 'nb_fast': 5 };
      const target = new FakeEventTarget();
      const post = (msg) => {
        const delay = delays[msg.key] || 10;
        setTimeout(() => {
          target.dispatchMessage({ type: 'storage:res', reqId: msg.reqId, ok: true,
                                   result: msg.key + '_result' });
        }, delay);
      };
      const provider = new PostMessageStorageProvider(post, target, 1000);

      const [slow, fast] = await Promise.all([
        provider.get('ns', 'nb_slow'),
        provider.get('ns', 'nb_fast')
      ]);
      assert.equal(slow, 'nb_slow_result');
      assert.equal(fast, 'nb_fast_result');
      provider.dispose();
    });
  });

  describe('timeout', () => {
    it('rejects with a descriptive error when the ext host does not reply', async () => {
      const target = new FakeEventTarget();
      const provider = new PostMessageStorageProvider(() => { /* never replies */ }, target, 30);
      await assert.rejects(
        () => provider.get('notebooks', 'nb_1'),
        /timed out after 30 ms/
      );
      provider.dispose();
    });
  });

  describe('dispose()', () => {
    it('removes the message listener', async () => {
      const target = new FakeEventTarget();
      const provider = new PostMessageStorageProvider(() => {}, target, 1000);
      provider.dispose();
      assert.equal((target._listeners['message'] || []).length, 0);
    });

    it('rejects pending requests', async () => {
      const target = new FakeEventTarget();
      let posted = false;
      const provider = new PostMessageStorageProvider(() => { posted = true; }, target, 10000);
      const pending = provider.get('ns', 'key');
      assert(posted);
      provider.dispose();
      await assert.rejects(() => pending, /disposed while request was in flight/);
    });
  });

  describe('ignores unrelated messages', () => {
    it('does not resolve for wrong type', async () => {
      const target = new FakeEventTarget();
      const post = (msg) => {
        setImmediate(() => {
          // Post a message with wrong type — should be ignored.
          target.dispatchMessage({ type: 'other:msg', reqId: msg.reqId, ok: true, result: 'X' });
          // Then post the real reply.
          target.dispatchMessage({ type: 'storage:res', reqId: msg.reqId, ok: true, result: 42 });
        });
      };
      const provider = new PostMessageStorageProvider(post, target, 1000);
      const result = await provider.get('ns', 'k');
      assert.equal(result, 42);
      provider.dispose();
    });

    it('does not resolve for wrong reqId', async () => {
      const target = new FakeEventTarget();
      const post = (msg) => {
        setImmediate(() => {
          // Post with wrong reqId — should be ignored.
          target.dispatchMessage({ type: 'storage:res', reqId: 'sr_wrong', ok: true, result: 'X' });
          // Then post the real reply.
          target.dispatchMessage({ type: 'storage:res', reqId: msg.reqId, ok: true, result: 99 });
        });
      };
      const provider = new PostMessageStorageProvider(post, target, 1000);
      const result = await provider.get('ns', 'k');
      assert.equal(result, 99);
      provider.dispose();
    });
  });
});
