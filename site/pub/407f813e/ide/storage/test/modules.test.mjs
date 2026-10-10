/**
 * lib/shim/storage/test/modules.test.mjs
 *
 * Headless tests for the modules.js helpers (files namespace).
 *
 * Run: node lib/shim/storage/test/modules.test.mjs
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
  };
}

// ── Install window global so LocalStorageProvider constructor works ───────────

function withLocalStorage(ls, fn) {
  const prev = typeof globalThis.window !== 'undefined' ? globalThis.window : undefined;
  globalThis.window = { localStorage: ls };
  try       { return fn(); }
  finally   { if (prev === undefined) { delete globalThis.window; } else { globalThis.window = prev; } }
}

// ── Import helpers (dynamic because they reference window) ────────────────────

const { LocalStorageProvider } =
  await import(`${STORAGE_DIR}/local-storage-provider.js`);
const { newModuleId, saveModule, loadModule, listModules, deleteModule,
        MODULES_NAMESPACE, MODULE_SCHEMA_VERSION } =
  await import(`${STORAGE_DIR}/modules.js`);

// ── Shared provider factory ───────────────────────────────────────────────────

function makeProvider() {
  const ls = makeLocalStorageShim();
  let provider;
  withLocalStorage(ls, () => { provider = new LocalStorageProvider(); });
  // Patch provider._ls to use our shim.
  provider._ls = ls;
  return provider;
}

function makeModule(overrides) {
  overrides = overrides || {};
  var now = new Date().toISOString();
  return Object.assign({
    id:            newModuleId(),
    name:          'Test Module',
    language:      'javascript',
    source:        'function buildExperiment(exp) { exp.init({ dimension: 2 }); }',
    templateId:    'wave-interference',
    kind:          'frqtl',
    createdAt:     now,
    updatedAt:     now,
    schemaVersion: MODULE_SCHEMA_VERSION,
    renderState:   null,
    scripts:       [],
  }, overrides);
}

// ── Constants ─────────────────────────────────────────────────────────────────

describe('Module constants', () => {

  test('MODULES_NAMESPACE is "files"', () => {
    assert.equal(MODULES_NAMESPACE, 'files');
  });

  test('MODULE_SCHEMA_VERSION is 4', () => {
    assert.equal(MODULE_SCHEMA_VERSION, 4);
  });

});

// ── scripts field + v3→v4 migration (DX-3, the rung-source ferry) ─────────────

describe('scripts field and v3→v4 migration', () => {

  test('loadModule defaults scripts to [] for a legacy envelope (R6 extended)', () => {
    const p = makeProvider();
    const legacyId = newModuleId();
    // A raw v3 envelope — has renderState, no `scripts` at all.
    p.put('files', legacyId, {
      id: legacyId, name: 'Legacy v3 module', language: 'javascript',
      source: 'function buildExperiment(exp) {}', templateId: null, kind: 'frqtl',
      createdAt: '2026-07-01T00:00:00.000Z', updatedAt: '2026-07-01T00:00:00.000Z',
      schemaVersion: 3, renderState: null,
    });
    const loaded = loadModule(p, legacyId);
    assert.deepEqual(loaded.scripts, []);
  });

  test('a saved scripts delta round-trips verbatim', () => {
    const p = makeProvider();
    const scripts = ['objects/setup/setupSphereEmitter3D.js'];
    const mod = makeModule({ scripts });
    saveModule(p, mod);
    assert.deepEqual(loadModule(p, mod.id).scripts, scripts);
  });

  test('saveModule rejects a non-string scripts entry (FAIL-LOUD)', () => {
    const p = makeProvider();
    const mod = makeModule({ scripts: ['ok.js', 42] });
    assert.throws(() => saveModule(p, mod), /scripts must be an array of strings/);
  });

  test('saveModule accepts scripts omitted (defaults on load)', () => {
    const p = makeProvider();
    const mod = makeModule();
    delete mod.scripts;
    saveModule(p, mod);
    assert.deepEqual(loadModule(p, mod.id).scripts, []);
  });
});

// ── newModuleId ───────────────────────────────────────────────────────────────

describe('newModuleId', () => {

  test('returns a unique non-empty string', () => {
    const id1 = newModuleId();
    const id2 = newModuleId();
    assert.equal(typeof id1, 'string');
    assert.ok(id1.length > 0);
    assert.notEqual(id1, id2);
  });

  test('starts with "mod_"', () => {
    assert.ok(newModuleId().startsWith('mod_'));
  });

});

// ── save → load round-trip ────────────────────────────────────────────────────

describe('saveModule + loadModule round-trip', () => {

  test('save and load returns the full envelope unchanged', () => {
    const p = makeProvider();
    const mod = makeModule();
    saveModule(p, mod);
    const loaded = loadModule(p, mod.id);
    assert.deepEqual(loaded, mod);
  });

  test('loadModule returns null for an unknown id', () => {
    const p = makeProvider();
    assert.equal(loadModule(p, 'mod_does_not_exist'), null);
  });

  test('saveModule overwrites an existing module', () => {
    const p = makeProvider();
    const mod = makeModule({ name: 'Original' });
    saveModule(p, mod);
    const updated = Object.assign({}, mod, {
      name: 'Updated',
      source: 'function buildExperiment(exp) { exp.init({ dimension: 3 }); }',
      updatedAt: new Date().toISOString(),
    });
    saveModule(p, updated);
    const loaded = loadModule(p, mod.id);
    assert.equal(loaded.name, 'Updated');
    assert.ok(loaded.source.includes('dimension: 3'));
  });

  test('source text survives the round-trip verbatim', () => {
    const p = makeProvider();
    const src = [
      'function buildExperiment(exp) {',
      '  exp.init({ dimension: 2, wavelengthScale: 8 });',
      '  exp.addObject("PointSource", { x: 300, y: 200, _wavelength: 32 });',
      '}',
    ].join('\n');
    const mod = makeModule({ source: src });
    saveModule(p, mod);
    const loaded = loadModule(p, mod.id);
    assert.equal(loaded.source, src);
  });

});

// ── listModules ────────────────────────────────────────────────────────────────

describe('listModules', () => {

  test('returns empty array when no modules saved', () => {
    const p = makeProvider();
    assert.deepEqual(listModules(p), []);
  });

  test('returns one summary per saved module', () => {
    const p = makeProvider();
    const m1 = makeModule({ id: newModuleId(), name: 'Alpha', updatedAt: '2026-06-09T10:00:00.000Z' });
    const m2 = makeModule({ id: newModuleId(), name: 'Beta',  updatedAt: '2026-06-09T11:00:00.000Z' });
    saveModule(p, m1);
    saveModule(p, m2);
    const list = listModules(p);
    assert.equal(list.length, 2);
  });

  test('list is sorted by updatedAt descending (most recent first)', () => {
    const p = makeProvider();
    const m1 = makeModule({ id: newModuleId(), name: 'Old',    updatedAt: '2026-06-09T10:00:00.000Z' });
    const m2 = makeModule({ id: newModuleId(), name: 'Recent', updatedAt: '2026-06-09T11:00:00.000Z' });
    saveModule(p, m1);
    saveModule(p, m2);
    const list = listModules(p);
    // Most recent first.
    assert.equal(list[0].name, 'Recent');
    assert.equal(list[1].name, 'Old');
  });

  test('each summary entry has id, name, kind, templateId, updatedAt', () => {
    const p = makeProvider();
    const mod = makeModule({ name: 'MySim', templateId: 'double-slit', kind: 'frqtl' });
    saveModule(p, mod);
    const list = listModules(p);
    assert.equal(list.length, 1);
    const s = list[0];
    assert.equal(typeof s.id, 'string');
    assert.equal(s.name, 'MySim');
    assert.equal(s.kind, 'frqtl');
    assert.equal(s.templateId, 'double-slit');
    assert.equal(typeof s.updatedAt, 'string');
    // source should NOT be required in the summary (the point is a lightweight list).
    // It may appear (because the full record is loaded) but is not required.
  });

  test('listModules reflects deletions', () => {
    const p = makeProvider();
    const mod = makeModule();
    saveModule(p, mod);
    deleteModule(p, mod.id);
    assert.deepEqual(listModules(p), []);
  });

});

// ── deleteModule ──────────────────────────────────────────────────────────────

describe('deleteModule', () => {

  test('removes a saved module', () => {
    const p = makeProvider();
    const mod = makeModule();
    saveModule(p, mod);
    deleteModule(p, mod.id);
    assert.equal(loadModule(p, mod.id), null);
  });

  test('deleting a non-existent id is a no-op (does not throw)', () => {
    const p = makeProvider();
    assert.doesNotThrow(() => deleteModule(p, 'mod_ghost'));
  });

  test('only the deleted module is removed from the list', () => {
    const p = makeProvider();
    const m1 = makeModule({ id: newModuleId(), name: 'Keep' });
    const m2 = makeModule({ id: newModuleId(), name: 'Remove' });
    saveModule(p, m1);
    saveModule(p, m2);
    deleteModule(p, m2.id);
    const list = listModules(p);
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Keep');
  });

});

// ── Validation (FAIL-LOUD) ────────────────────────────────────────────────────

describe('saveModule validation', () => {

  test('throws on missing id', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { name: 'X', language: 'javascript', source: 'x', templateId: null, schemaVersion: 1 }),
      /module\.id must be a non-empty string/
    );
  });

  test('throws on empty id', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: '', name: 'X', language: 'javascript', source: 'x', templateId: null, schemaVersion: 1 }),
      /module\.id must be a non-empty string/
    );
  });

  test('throws on missing name', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: newModuleId(), name: '', language: 'javascript', source: 'x', templateId: null, schemaVersion: 1 }),
      /module\.name must be a non-empty string/
    );
  });

  test('throws on missing source', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: newModuleId(), name: 'X', language: 'javascript', source: '', templateId: null, schemaVersion: 1 }),
      /module\.source must not be empty/
    );
  });

  test('throws when source is not a string', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: newModuleId(), name: 'X', language: 'javascript', source: 42, templateId: null, schemaVersion: 1 }),
      /module\.source must be a string/
    );
  });

  test('throws on invalid templateId type (not null and not string)', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: newModuleId(), name: 'X', language: 'javascript', source: 'x', templateId: 123, kind: 'frqtl', schemaVersion: 2 }),
      /module\.templateId must be a string or null/
    );
  });

  test('accepts null templateId', () => {
    const p = makeProvider();
    const mod = makeModule({ templateId: null });
    assert.doesNotThrow(() => saveModule(p, mod));
  });

  test('throws on non-number schemaVersion', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: newModuleId(), name: 'X', language: 'javascript', source: 'x', templateId: null, kind: 'frqtl', schemaVersion: '2' }),
      /module\.schemaVersion must be a number/
    );
  });

  test('throws on invalid kind (not "frqtl" or "math")', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: newModuleId(), name: 'X', language: 'javascript', source: 'x', templateId: null, kind: 'unknown', schemaVersion: 2 }),
      /module\.kind must be "frqtl" or "math"/
    );
  });

  test('throws on missing kind field', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, { id: newModuleId(), name: 'X', language: 'javascript', source: 'x', templateId: null, schemaVersion: 2 }),
      /module\.kind must be "frqtl" or "math"/
    );
  });

  test('accepts kind "frqtl"', () => {
    const p = makeProvider();
    const mod = makeModule({ kind: 'frqtl' });
    assert.doesNotThrow(() => saveModule(p, mod));
  });

  test('accepts kind "math"', () => {
    const p = makeProvider();
    const mod = makeModule({ kind: 'math' });
    assert.doesNotThrow(() => saveModule(p, mod));
  });

  test('throws if module is not an object', () => {
    const p = makeProvider();
    assert.throws(() => saveModule(p, null), /module must be a non-null object/);
    assert.throws(() => saveModule(p, 'string'), /module must be a non-null object/);
  });

});

// ── kind field + v1→v2 migration ────────────────────────────────────────────────

describe('kind field and v1→v2 migration', () => {

  test('loadModule defaults kind to "frqtl" for a legacy v1 envelope (R6)', () => {
    const p = makeProvider();
    // Write a raw v1 envelope directly — no `kind` field.
    const legacyId = newModuleId();
    p.put('files', legacyId, {
      id:            legacyId,
      name:          'Legacy v1 module',
      language:      'javascript',
      source:        'function buildExperiment(exp) {}',
      templateId:    null,
      createdAt:     '2025-01-01T00:00:00.000Z',
      updatedAt:     '2025-01-01T00:00:00.000Z',
      schemaVersion: 1,
    });
    const loaded = loadModule(p, legacyId);
    // Must not throw; must default kind to 'frqtl'.
    assert.equal(loaded.kind, 'frqtl');
  });

  test('listModules migrates legacy v1 entries and includes them with kind "frqtl" (R6)', () => {
    const p = makeProvider();
    const legacyId = newModuleId();
    p.put('files', legacyId, {
      id: legacyId, name: 'Old', language: 'javascript',
      source: 'x', templateId: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      schemaVersion: 1,
    });
    const list = listModules(p);
    assert.equal(list.length, 1);
    assert.equal(list[0].kind, 'frqtl');
  });

  test('listModules with kind:"frqtl" filter returns only frqtl modules', () => {
    const p = makeProvider();
    const frqtlMod = makeModule({ id: newModuleId(), name: 'FRQTL', kind: 'frqtl' });
    const mathMod  = makeModule({ id: newModuleId(), name: 'Math',  kind: 'math'  });
    saveModule(p, frqtlMod);
    saveModule(p, mathMod);
    const list = listModules(p, { kind: 'frqtl' });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'FRQTL');
    assert.equal(list[0].kind, 'frqtl');
  });

  test('listModules with kind:"math" filter returns only math modules', () => {
    const p = makeProvider();
    const frqtlMod = makeModule({ id: newModuleId(), name: 'FRQTL', kind: 'frqtl' });
    const mathMod  = makeModule({ id: newModuleId(), name: 'Math',  kind: 'math'  });
    saveModule(p, frqtlMod);
    saveModule(p, mathMod);
    const list = listModules(p, { kind: 'math' });
    assert.equal(list.length, 1);
    assert.equal(list[0].name, 'Math');
    assert.equal(list[0].kind, 'math');
  });

  test('listModules with no kind filter returns all kinds', () => {
    const p = makeProvider();
    const frqtlMod = makeModule({ id: newModuleId(), name: 'FRQTL', kind: 'frqtl' });
    const mathMod  = makeModule({ id: newModuleId(), name: 'Math',  kind: 'math'  });
    saveModule(p, frqtlMod);
    saveModule(p, mathMod);
    const list = listModules(p);
    assert.equal(list.length, 2);
  });

  test('kind filter also applies to migrated legacy v1 entries', () => {
    const p = makeProvider();
    const legacyId = newModuleId();
    // v1 legacy — no kind — should be treated as 'frqtl' after migration.
    p.put('files', legacyId, {
      id: legacyId, name: 'Legacy', language: 'javascript',
      source: 'x', templateId: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
      schemaVersion: 1,
    });
    // Filter by 'frqtl' — legacy entry should appear.
    const frqtlList = listModules(p, { kind: 'frqtl' });
    assert.equal(frqtlList.length, 1);
    // Filter by 'math' — legacy entry should NOT appear.
    const mathList = listModules(p, { kind: 'math' });
    assert.equal(mathList.length, 0);
  });

});

// ── renderState field + v2→v3 migration (WS Studio Controls Realignment §2.6, S6) ──

describe('renderState field and v2→v3 migration', () => {

  test('loadModule defaults renderState to null for a legacy v2 envelope (R6 extended)', () => {
    const p = makeProvider();
    const legacyId = newModuleId();
    // A raw v2 envelope — has `kind`, no `renderState` at all.
    p.put('files', legacyId, {
      id: legacyId, name: 'Legacy v2 module', language: 'javascript',
      source: 'function buildExperiment(exp) {}', templateId: null, kind: 'frqtl',
      createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
      schemaVersion: 2,
    });
    const loaded = loadModule(p, legacyId);
    assert.equal(loaded.renderState, null);
  });

  test('listModules migrates legacy v2 entries without throwing', () => {
    const p = makeProvider();
    const legacyId = newModuleId();
    p.put('files', legacyId, {
      id: legacyId, name: 'Old', language: 'javascript', source: 'x',
      templateId: null, kind: 'frqtl',
      createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z',
      schemaVersion: 2,
    });
    assert.doesNotThrow(() => listModules(p));
    assert.equal(listModules(p).length, 1);
  });

  test('a saved renderState bag round-trips verbatim', () => {
    const p = makeProvider();
    const renderState = {
      version: 1, renderer: 'three', engine: 'wasm', egpt3D: true, seed: '42',
      backdropVisible: true,
      camera: { orbit: { azimuth: 90, elevation: 0, distance: 400 }, preset: 'down-barrel' },
      render: [{ key: 'shape', value: 'box' }],
      pageControls: [{ id: 'wavelengthScale', value: 12, bind: { object: 'universe', prop: 'wavelengthScale' } }],
    };
    const mod = makeModule({ renderState });
    saveModule(p, mod);
    const loaded = loadModule(p, mod.id);
    assert.deepEqual(loaded.renderState, renderState);
  });

  test('saveModule accepts renderState: null (the common/legacy case)', () => {
    const p = makeProvider();
    const mod = makeModule({ renderState: null });
    assert.doesNotThrow(() => saveModule(p, mod));
  });

  test('saveModule accepts renderState omitted entirely', () => {
    const p = makeProvider();
    const mod = makeModule();
    delete mod.renderState;
    assert.doesNotThrow(() => saveModule(p, mod));
    assert.equal(loadModule(p, mod.id).renderState, null);
  });

  test('throws when renderState is a non-object (e.g. a string)', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, makeModule({ renderState: 'not an object' })),
      /module\.renderState must be an object, null, or omitted/
    );
  });

  test('throws when renderState is an array (Array is typeof "object" but structurally wrong)', () => {
    const p = makeProvider();
    assert.throws(
      () => saveModule(p, makeModule({ renderState: [1, 2, 3] })),
      /module\.renderState must be an object, null, or omitted/
    );
  });

});

// ── Namespace isolation ────────────────────────────────────────────────────────

describe('Namespace isolation', () => {

  test('modules namespace "files" is isolated from "projects" namespace', () => {
    const p = makeProvider();
    // Save something in the projects namespace directly.
    p.put('projects', 'proj_test', { id: 'proj_test', name: 'A project' });
    const mod = makeModule();
    saveModule(p, mod);

    // listModules must not include the project entry.
    const list = listModules(p);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, mod.id);
  });

});
