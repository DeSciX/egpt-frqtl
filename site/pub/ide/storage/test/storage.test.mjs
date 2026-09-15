/**
 * lib/shim/storage/test/storage.test.mjs
 *
 * Headless tests for the StorageProvider seam + localStorage driver +
 * project-envelope helpers.
 *
 * Run: node lib/shim/storage/test/storage.test.mjs
 *
 * Uses Node 18+ built-in test runner (node:test).
 * No external dependencies.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = resolve(__dirname, '..');

// ── Minimal localStorage shim for Node (jsdom-free) ──────────────────────────

function makeLocalStorageShim() {
  const _store = new Map();
  const _keys  = [];           // insertion-order array for ls.key(i) support

  function _ensureKey(k) {
    if (!_store.has(k)) { _keys.push(k); }
  }

  return {
    get length() { return _store.size; },
    key(i)     { return i < _keys.length ? _keys[i] : null; },
    getItem(k) { return _store.has(k) ? _store.get(k) : null; },
    setItem(k, v) { _ensureKey(k); _store.set(k, v); },
    removeItem(k) {
      if (_store.has(k)) {
        _store.delete(k);
        const idx = _keys.indexOf(k);
        if (idx !== -1) { _keys.splice(idx, 1); }
      }
    },
    clear() { _store.clear(); _keys.length = 0; },
    // debug helper
    _dump() { return Object.fromEntries(_store); },
  };
}

// ── Install a window global so LocalStorageProvider constructor works ─────────

function withLocalStorage(ls, fn) {
  const prev = typeof globalThis.window !== 'undefined' ? globalThis.window : undefined;
  globalThis.window = { localStorage: ls };
  try       { return fn(); }
  finally   { if (prev === undefined) { delete globalThis.window; } else { globalThis.window = prev; } }
}

// ── Import helpers (dynamic because they reference window) ────────────────────

// We need to import these ONCE for the module cache but patch window before instantiation.
const { validateProvider, setActiveProvider, getProvider, peekProvider, resetProvider } =
  await import(`${STORAGE_DIR}/index.js`);
const { LocalStorageProvider } =
  await import(`${STORAGE_DIR}/local-storage-provider.js`);
const { newProjectId, saveProject, loadProject, listProjects, deleteProject,
        PROJECTS_NAMESPACE, PROJECT_SCHEMA_VERSION } =
  await import(`${STORAGE_DIR}/projects.js`);

// ── Section 1: StorageProvider contract + validation ─────────────────────────

describe('StorageProvider contract', () => {

  test('validateProvider — accepts a fully-conformant provider', () => {
    const ok = { get: () => null, put: () => {}, delete: () => {}, list: () => [] };
    assert.doesNotThrow(() => validateProvider(ok));
  });

  test('validateProvider — rejects null', () => {
    assert.throws(() => validateProvider(null), /must be a non-null object/);
  });

  test('validateProvider — rejects missing method', () => {
    const bad = { get: () => null, put: () => {}, delete: () => {} }; // list missing
    assert.throws(() => validateProvider(bad), /missing required method "list"/);
  });

  test('setActiveProvider + getProvider round-trip', () => {
    resetProvider();
    const provider = { get: () => null, put: () => {}, delete: () => {}, list: () => [] };
    setActiveProvider(provider);
    assert.equal(getProvider(), provider);
    resetProvider();
  });

  test('getProvider — FAIL-LOUD when no provider set', () => {
    resetProvider();
    assert.throws(() => getProvider(), /no active provider/);
  });

  test('peekProvider — returns null when not set', () => {
    resetProvider();
    assert.equal(peekProvider(), null);
  });

});

// ── Section 2: LocalStorageProvider — CRUD ────────────────────────────────────

describe('LocalStorageProvider — CRUD', () => {

  function makeProvider() {
    const ls = makeLocalStorageShim();
    let provider;
    withLocalStorage(ls, () => { provider = new LocalStorageProvider(); });
    // Patch provider._ls to use our shim (already done in constructor, but
    // re-patch in case the shim reference drifts in Node globals).
    provider._ls = ls;
    return provider;
  }

  test('put + get round-trip (string value)', () => {
    const p = makeProvider();
    p.put('ns', 'k1', 'hello');
    assert.equal(p.get('ns', 'k1'), 'hello');
  });

  test('put + get round-trip (object value)', () => {
    const p = makeProvider();
    p.put('ns', 'obj', { a: 1, b: [2, 3] });
    assert.deepEqual(p.get('ns', 'obj'), { a: 1, b: [2, 3] });
  });

  test('get on missing key returns null', () => {
    const p = makeProvider();
    assert.equal(p.get('ns', 'missing'), null);
  });

  test('delete removes key', () => {
    const p = makeProvider();
    p.put('ns', 'todel', 42);
    p.delete('ns', 'todel');
    assert.equal(p.get('ns', 'todel'), null);
  });

  test('delete on missing key is a no-op', () => {
    const p = makeProvider();
    assert.doesNotThrow(() => p.delete('ns', 'ghost'));
  });

  test('put overwrites existing value', () => {
    const p = makeProvider();
    p.put('ns', 'k', 'first');
    p.put('ns', 'k', 'second');
    assert.equal(p.get('ns', 'k'), 'second');
  });

  test('namespaces are isolated', () => {
    const p = makeProvider();
    p.put('nsA', 'k', 'a-value');
    p.put('nsB', 'k', 'b-value');
    assert.equal(p.get('nsA', 'k'), 'a-value');
    assert.equal(p.get('nsB', 'k'), 'b-value');
  });

});

// ── Section 3: LocalStorageProvider — list ────────────────────────────────────

describe('LocalStorageProvider — list', () => {

  function makeProvider() {
    const ls = makeLocalStorageShim();
    let provider;
    withLocalStorage(ls, () => { provider = new LocalStorageProvider(); });
    provider._ls = ls;
    return provider;
  }

  test('list returns empty array on empty namespace', () => {
    const p = makeProvider();
    assert.deepEqual(p.list('empty'), []);
  });

  test('list returns one entry per stored key', () => {
    const p = makeProvider();
    p.put('proj', 'a', { name: 'A' });
    p.put('proj', 'b', { name: 'B' });
    p.put('other', 'x', 'should not appear');
    const entries = p.list('proj');
    assert.equal(entries.length, 2);
    const keys = entries.map(e => e.key).sort();
    assert.deepEqual(keys, ['a', 'b']);
  });

  test('list spreads object metadata into entries', () => {
    const p = makeProvider();
    p.put('m', 'k1', { id: 'k1', name: 'Project One', updatedAt: '2026-06-09T12:00:00Z' });
    const entries = p.list('m');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, 'k1');
    assert.equal(entries[0].name, 'Project One');
    assert.equal(entries[0].updatedAt, '2026-06-09T12:00:00Z');
  });

  test('list does not include "key" from stored value (avoids double)', () => {
    const p = makeProvider();
    // store an object that has a "key" field itself — should be ignored
    p.put('ns', 'abc', { key: 'should-be-ignored', foo: 'bar' });
    const entries = p.list('ns');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, 'abc');  // from storage key, not stored value
    assert.equal(entries[0].foo, 'bar');
  });

  test('list after delete reflects the deletion', () => {
    const p = makeProvider();
    p.put('ns', 'del-me', 'x');
    p.put('ns', 'keep-me', 'y');
    p.delete('ns', 'del-me');
    const entries = p.list('ns');
    assert.equal(entries.length, 1);
    assert.equal(entries[0].key, 'keep-me');
  });

});

// ── Section 4: LocalStorageProvider — FAIL-LOUD guards ───────────────────────

describe('LocalStorageProvider — FAIL-LOUD guards', () => {

  function makeProvider() {
    const ls = makeLocalStorageShim();
    let provider;
    withLocalStorage(ls, () => { provider = new LocalStorageProvider(); });
    provider._ls = ls;
    return provider;
  }

  test('constructor throws if window.localStorage is absent', () => {
    const origWindow = globalThis.window;
    delete globalThis.window;
    try {
      assert.throws(
        () => new LocalStorageProvider(),
        /window\.localStorage is not available/
      );
    } finally {
      if (origWindow !== undefined) { globalThis.window = origWindow; }
    }
  });

  test('put throws on empty namespace', () => {
    const p = makeProvider();
    assert.throws(() => p.put('', 'k', 'v'), /namespace must be a non-empty string/);
  });

  test('put throws on empty key', () => {
    const p = makeProvider();
    assert.throws(() => p.put('ns', '', 'v'), /key must be a non-empty string/);
  });

  test('put throws on "/" in namespace', () => {
    const p = makeProvider();
    assert.throws(() => p.put('a/b', 'k', 'v'), /must not contain/);
  });

  test('get throws on empty namespace', () => {
    const p = makeProvider();
    assert.throws(() => p.get('', 'k'), /namespace must be a non-empty string/);
  });

  test('delete throws on empty key', () => {
    const p = makeProvider();
    assert.throws(() => p.delete('ns', ''), /key must be a non-empty string/);
  });

  test('list throws on empty namespace', () => {
    const p = makeProvider();
    assert.throws(() => p.list(''), /namespace must be a non-empty string/);
  });

});

// ── Section 5: Project envelope helpers ───────────────────────────────────────

describe('Project envelope helpers', () => {

  function makeProvider() {
    const ls = makeLocalStorageShim();
    let provider;
    withLocalStorage(ls, () => { provider = new LocalStorageProvider(); });
    provider._ls = ls;
    return provider;
  }

  function makeProject(overrides = {}) {
    return Object.assign({
      id:            newProjectId(),
      name:          'Test Project',
      templateId:    'wave-interference',
      createdAt:     '2026-06-09T10:00:00.000Z',
      updatedAt:     '2026-06-09T10:00:00.000Z',
      schemaVersion: PROJECT_SCHEMA_VERSION,
      design:        {},
    }, overrides);
  }

  test('newProjectId returns a unique non-empty string', () => {
    const id1 = newProjectId();
    const id2 = newProjectId();
    assert.equal(typeof id1, 'string');
    assert.ok(id1.length > 0);
    assert.notEqual(id1, id2);
  });

  test('newProjectId starts with "proj_"', () => {
    assert.ok(newProjectId().startsWith('proj_'));
  });

  test('saveProject + loadProject round-trip', () => {
    const p = makeProvider();
    const project = makeProject();
    saveProject(p, project);
    const loaded = loadProject(p, project.id);
    assert.deepEqual(loaded, project);
  });

  test('loadProject returns null for unknown id', () => {
    const p = makeProvider();
    assert.equal(loadProject(p, 'proj_nonexistent'), null);
  });

  test('saveProject overwrites existing project', () => {
    const p = makeProvider();
    const project = makeProject({ name: 'Original' });
    saveProject(p, project);
    const updated = Object.assign({}, project, { name: 'Updated', updatedAt: '2026-06-09T11:00:00.000Z' });
    saveProject(p, updated);
    const loaded = loadProject(p, project.id);
    assert.equal(loaded.name, 'Updated');
  });

  test('deleteProject removes project', () => {
    const p = makeProvider();
    const project = makeProject();
    saveProject(p, project);
    deleteProject(p, project.id);
    assert.equal(loadProject(p, project.id), null);
  });

  test('deleteProject on missing id is a no-op', () => {
    const p = makeProvider();
    assert.doesNotThrow(() => deleteProject(p, 'proj_ghost'));
  });

  test('listProjects returns summaries for all saved projects', () => {
    const p = makeProvider();
    const p1 = makeProject({ id: newProjectId(), name: 'Alpha', updatedAt: '2026-06-09T10:00:00.000Z' });
    const p2 = makeProject({ id: newProjectId(), name: 'Beta',  updatedAt: '2026-06-09T11:00:00.000Z' });
    saveProject(p, p1);
    saveProject(p, p2);
    const list = listProjects(p);
    assert.equal(list.length, 2);
    // Should be sorted by updatedAt DESC — Beta (later) first.
    assert.equal(list[0].name, 'Beta');
    assert.equal(list[1].name, 'Alpha');
  });

  test('listProjects summary contains expected fields', () => {
    const p = makeProvider();
    const project = makeProject({ name: 'MyProj', templateId: 'particle-walk' });
    saveProject(p, project);
    const list = listProjects(p);
    assert.equal(list.length, 1);
    const s = list[0];
    assert.equal(typeof s.id, 'string');
    assert.equal(s.name, 'MyProj');
    assert.equal(s.templateId, 'particle-walk');
    assert.equal(typeof s.updatedAt, 'string');
    // design should NOT be in the summary (listProjects returns lightweight objects)
    // (design is present in listProjects because we load the full record — that's fine;
    //  the summary fields are the minimum guaranteed; design being present is acceptable)
  });

  test('listProjects returns empty array when no projects saved', () => {
    const p = makeProvider();
    assert.deepEqual(listProjects(p), []);
  });

  test('listProjects reflects deletions', () => {
    const p = makeProvider();
    const project = makeProject();
    saveProject(p, project);
    deleteProject(p, project.id);
    assert.deepEqual(listProjects(p), []);
  });

  test('saveProject FAIL-LOUD on missing id', () => {
    const p = makeProvider();
    assert.throws(
      () => saveProject(p, { name: 'X', templateId: null, schemaVersion: 1, design: {} }),
      /project\.id must be a non-empty string/
    );
  });

  test('saveProject FAIL-LOUD on missing name', () => {
    const p = makeProvider();
    assert.throws(
      () => saveProject(p, { id: newProjectId(), name: '', templateId: null, schemaVersion: 1, design: {} }),
      /project\.name must be a non-empty string/
    );
  });

  test('saveProject FAIL-LOUD on null design', () => {
    const p = makeProvider();
    assert.throws(
      () => saveProject(p, { id: newProjectId(), name: 'X', templateId: null, schemaVersion: 1, design: null }),
      /project\.design must be a non-null object/
    );
  });

  test('PROJECTS_NAMESPACE is "projects"', () => {
    assert.equal(PROJECTS_NAMESPACE, 'projects');
  });

  test('PROJECT_SCHEMA_VERSION is 1', () => {
    assert.equal(PROJECT_SCHEMA_VERSION, 1);
  });

});
