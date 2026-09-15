/**
 * lib/shim/storage/test/make-namespace-store.test.mjs
 *
 * Unit tests for the makeNamespaceStore factory (make-namespace-store.js).
 *
 * Run: node --test lib/shim/storage/test/make-namespace-store.test.mjs
 *
 * Node 18+ built-in test runner.  No external dependencies.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { makeNamespaceStore } =
  await import(resolve(__dirname, '..', 'make-namespace-store.js'));

// ── Minimal in-memory StorageProvider ─────────────────────────────────────

function makeProvider() {
  const _store = new Map();
  return {
    get(ns, key)          { const v = _store.get(ns + ':' + key); return v === undefined ? null : JSON.parse(v); },
    put(ns, key, value)   { _store.set(ns + ':' + key, JSON.stringify(value)); },
    delete(ns, key)       { _store.delete(ns + ':' + key); },
    list(ns)              {
      const prefix = ns + ':';
      const out = [];
      for (const [k] of _store) {
        if (k.startsWith(prefix)) { out.push({ key: k.slice(prefix.length) }); }
      }
      return out;
    },
  };
}

// ── Minimal config factory ─────────────────────────────────────────────────

function makeConfig(overrides) {
  return Object.assign({
    namespace:     'widgets',
    schemaVersion: 1,
    idPrefix:      'w_',
    validate:      function (r) {
      if (!r || typeof r !== 'object') { throw new Error('[widgets] must be an object'); }
      if (typeof r.id !== 'string' || r.id.length === 0) { throw new Error('[widgets] id required'); }
      if (typeof r.label !== 'string') { throw new Error('[widgets] label required'); }
    },
    summaryFields: function (r) {
      return { id: r.id, label: r.label, updatedAt: r.updatedAt || '' };
    },
  }, overrides || {});
}

function makeRecord(store, overrides) {
  return Object.assign({
    id:            store.newId(),
    label:         'Widget',
    createdAt:     '2026-06-18T10:00:00.000Z',
    updatedAt:     '2026-06-18T10:00:00.000Z',
    schemaVersion: 1,
  }, overrides || {});
}

// ── newId ─────────────────────────────────────────────────────────────────

describe('makeNamespaceStore — newId', () => {

  test('returns a non-empty string', () => {
    const s = makeNamespaceStore(makeConfig());
    assert.equal(typeof s.newId(), 'string');
    assert.ok(s.newId().length > 0);
  });

  test('prefixes with idPrefix', () => {
    const s = makeNamespaceStore(makeConfig({ idPrefix: 'xyz_' }));
    assert.ok(s.newId().startsWith('xyz_'));
  });

  test('returns unique ids', () => {
    const s = makeNamespaceStore(makeConfig());
    assert.notEqual(s.newId(), s.newId());
  });

});

// ── save / load round-trip ─────────────────────────────────────────────────

describe('makeNamespaceStore — save + load', () => {

  test('save and load returns the full record', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    const r = makeRecord(s);
    s.save(p, r);
    assert.deepEqual(s.load(p, r.id), r);
  });

  test('load returns null for unknown id', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    assert.equal(s.load(p, 'w_nonexistent'), null);
  });

  test('save overwrites on second call', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    const r = makeRecord(s, { label: 'Old' });
    s.save(p, r);
    s.save(p, Object.assign({}, r, { label: 'New' }));
    assert.equal(s.load(p, r.id).label, 'New');
  });

  test('save FAIL-LOUD on invalid record', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    assert.throws(() => s.save(p, null), /must be an object/);
  });

  test('load FAIL-LOUD on empty id', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    assert.throws(() => s.load(p, ''), /id must be a non-empty string/);
  });

});

// ── delete ─────────────────────────────────────────────────────────────────

describe('makeNamespaceStore — delete', () => {

  test('removes a saved record', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    const r = makeRecord(s);
    s.save(p, r);
    s['delete'](p, r.id);
    assert.equal(s.load(p, r.id), null);
  });

  test('no-op on unknown id', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    assert.doesNotThrow(() => s['delete'](p, 'w_ghost'));
  });

  test('FAIL-LOUD on empty id', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    assert.throws(() => s['delete'](p, ''), /id must be a non-empty string/);
  });

});

// ── list ───────────────────────────────────────────────────────────────────

describe('makeNamespaceStore — list', () => {

  test('returns empty array when nothing saved', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    assert.deepEqual(s.list(p), []);
  });

  test('returns one summary per saved record', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    s.save(p, makeRecord(s, { label: 'A' }));
    s.save(p, makeRecord(s, { label: 'B' }));
    assert.equal(s.list(p).length, 2);
  });

  test('sorted by updatedAt descending', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    s.save(p, makeRecord(s, { label: 'Old',    updatedAt: '2026-06-17T00:00:00.000Z' }));
    s.save(p, makeRecord(s, { label: 'Recent', updatedAt: '2026-06-18T00:00:00.000Z' }));
    const list = s.list(p);
    assert.equal(list[0].label, 'Recent');
    assert.equal(list[1].label, 'Old');
  });

  test('reflects deletions', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    const r = makeRecord(s);
    s.save(p, r);
    s['delete'](p, r.id);
    assert.deepEqual(s.list(p), []);
  });

  test('silently skips records with missing id', () => {
    const s = makeNamespaceStore(makeConfig());
    const p = makeProvider();
    // Directly inject a malformed record.
    p.put('widgets', 'bad', { label: 'No id' });
    assert.deepEqual(s.list(p), []);
  });

  test('summaryFields null return skips the record', () => {
    const s = makeNamespaceStore(makeConfig({
      summaryFields: function (r) {
        return typeof r.label === 'string' ? { id: r.id, label: r.label, updatedAt: '' } : null;
      },
    }));
    const p = makeProvider();
    // valid record — included
    s.save(p, makeRecord(s, { label: 'Good' }));
    // directly inject a record that summaryFields will return null for
    const badId = s.newId();
    p.put('widgets', badId, { id: badId, label: 42, updatedAt: '' });
    const list = s.list(p);
    assert.equal(list.length, 1);
    assert.equal(list[0].label, 'Good');
  });

});

// ── migrate ────────────────────────────────────────────────────────────────

describe('makeNamespaceStore — migrate', () => {

  test('migrate is applied in load', () => {
    const s = makeNamespaceStore(makeConfig({
      migrate: function (r) {
        if (!r.label) { r = Object.assign({}, r, { label: 'default' }); }
        return r;
      },
    }));
    const p = makeProvider();
    const id = s.newId();
    // Inject a record without label directly.
    p.put('widgets', id, { id: id, updatedAt: '' });
    const loaded = s.load(p, id);
    assert.equal(loaded.label, 'default');
  });

  test('migrate is applied in list', () => {
    const s = makeNamespaceStore(makeConfig({
      migrate: function (r) {
        if (!r.label) { r = Object.assign({}, r, { label: 'migrated' }); }
        return r;
      },
    }));
    const p = makeProvider();
    const id = s.newId();
    p.put('widgets', id, { id: id, updatedAt: '' });
    const list = s.list(p);
    assert.equal(list.length, 1);
    assert.equal(list[0].label, 'migrated');
  });

});

// ── listFilter ─────────────────────────────────────────────────────────────

describe('makeNamespaceStore — listFilter', () => {

  test('listFilter restricts results based on opts', () => {
    const s = makeNamespaceStore(makeConfig({
      listFilter: function (r, opts) {
        if (!opts || !opts.type) { return true; }
        return r.type === opts.type;
      },
      validate: function (r) {
        if (!r || !r.id || !r.label) { throw new Error('invalid'); }
      },
      summaryFields: function (r) {
        return { id: r.id, label: r.label, type: r.type, updatedAt: r.updatedAt || '' };
      },
    }));
    const p = makeProvider();
    const r1 = makeRecord(s, { label: 'A', type: 'foo' });
    const r2 = makeRecord(s, { label: 'B', type: 'bar' });
    s.save(p, r1);
    s.save(p, r2);
    const fooList = s.list(p, { type: 'foo' });
    assert.equal(fooList.length, 1);
    assert.equal(fooList[0].label, 'A');
    const allList = s.list(p);
    assert.equal(allList.length, 2);
  });

});

// ── namespace isolation ────────────────────────────────────────────────────

describe('makeNamespaceStore — namespace isolation', () => {

  test('two stores with different namespaces do not interfere', () => {
    const s1 = makeNamespaceStore(makeConfig({ namespace: 'ns1', idPrefix: 'n1_' }));
    const s2 = makeNamespaceStore(makeConfig({ namespace: 'ns2', idPrefix: 'n2_' }));
    const p  = makeProvider();
    s1.save(p, makeRecord(s1, { label: 'In ns1' }));
    assert.equal(s2.list(p).length, 0);
  });

});
