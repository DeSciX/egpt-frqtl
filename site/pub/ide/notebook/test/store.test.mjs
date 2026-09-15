/**
 * lib/shim/notebook/test/store.test.mjs
 *
 * NotebookDocumentStore (lib/shim/notebook/store.js) — CRUD helpers and
 * the ONE persistence contract over the StorageProvider seam.
 *
 * Run: node --test lib/shim/notebook/test/store.test.mjs
 *
 * Node 18+ built-in test runner.  No external dependencies.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const {
    newNotebookId, saveNotebook, loadNotebook, listNotebooks, deleteNotebook,
    NOTEBOOKS_NAMESPACE, NOTEBOOK_SCHEMA_VERSION,
} = await import(path.join(repoRoot, 'lib/shim/notebook/store.js'));

// ── Minimal in-memory StorageProvider (mirrors storage.test.mjs shim) ─────────

function makeProvider() {
    const _store = new Map();
    return {
        get(ns, key) {
            const raw = _store.get(ns + ':' + key);
            return raw === undefined ? null : JSON.parse(raw);
        },
        put(ns, key, value) {
            _store.set(ns + ':' + key, JSON.stringify(value));
        },
        delete(ns, key) {
            _store.delete(ns + ':' + key);
        },
        list(ns) {
            const prefix = ns + ':';
            const results = [];
            for (const [k] of _store) {
                if (k.startsWith(prefix)) {
                    const userKey = k.slice(prefix.length);
                    results.push({ key: userKey });
                }
            }
            return results;
        },
    };
}

// ── Helper: build a minimal valid notebook envelope ────────────────────────────

function makeRecord(overrides) {
    const id = newNotebookId();
    const now = new Date().toISOString();
    return Object.assign({
        id,
        title:         'Test Notebook',
        html:          '<frqtl-notebook version="1"></frqtl-notebook>\n',
        createdAt:     now,
        updatedAt:     now,
        schemaVersion: NOTEBOOK_SCHEMA_VERSION,
    }, overrides || {});
}

// ── Section 1: newNotebookId ───────────────────────────────────────────────────

describe('newNotebookId', function () {

    test('returns a non-empty string', function () {
        assert.equal(typeof newNotebookId(), 'string');
        assert.ok(newNotebookId().length > 0);
    });

    test('starts with "nb_"', function () {
        assert.ok(newNotebookId().startsWith('nb_'));
    });

    test('returns unique ids', function () {
        const a = newNotebookId();
        const b = newNotebookId();
        assert.notEqual(a, b);
    });

});

// ── Section 2: CRUD — saveNotebook / loadNotebook ─────────────────────────────

describe('saveNotebook + loadNotebook round-trip', function () {

    test('saves and loads back verbatim', function () {
        const p = makeProvider();
        const rec = makeRecord();
        saveNotebook(p, rec);
        const loaded = loadNotebook(p, rec.id);
        assert.deepEqual(loaded, rec);
    });

    test('loadNotebook returns null for unknown id', function () {
        const p = makeProvider();
        assert.equal(loadNotebook(p, 'nb_nonexistent'), null);
    });

    test('saveNotebook overwrites on second call', function () {
        const p = makeProvider();
        const rec = makeRecord({ title: 'Old title' });
        saveNotebook(p, rec);
        const updated = Object.assign({}, rec, { title: 'New title', updatedAt: new Date().toISOString() });
        saveNotebook(p, updated);
        const loaded = loadNotebook(p, rec.id);
        assert.equal(loaded.title, 'New title');
    });

    test('uses NOTEBOOKS_NAMESPACE "notebooks"', function () {
        assert.equal(NOTEBOOKS_NAMESPACE, 'notebooks');
    });

    test('NOTEBOOK_SCHEMA_VERSION is 1', function () {
        assert.equal(NOTEBOOK_SCHEMA_VERSION, 1);
    });

});

// ── Section 3: deleteNotebook ─────────────────────────────────────────────────

describe('deleteNotebook', function () {

    test('removes the stored record', function () {
        const p = makeProvider();
        const rec = makeRecord();
        saveNotebook(p, rec);
        deleteNotebook(p, rec.id);
        assert.equal(loadNotebook(p, rec.id), null);
    });

    test('is a no-op for unknown id', function () {
        const p = makeProvider();
        assert.doesNotThrow(() => deleteNotebook(p, 'nb_ghost'));
    });

});

// ── Section 4: listNotebooks ──────────────────────────────────────────────────

describe('listNotebooks', function () {

    test('returns empty array when nothing saved', function () {
        const p = makeProvider();
        assert.deepEqual(listNotebooks(p), []);
    });

    test('returns one summary per saved record', function () {
        const p = makeProvider();
        const r1 = makeRecord({ title: 'A' });
        const r2 = makeRecord({ title: 'B' });
        saveNotebook(p, r1);
        saveNotebook(p, r2);
        const list = listNotebooks(p);
        assert.equal(list.length, 2);
    });

    test('summary contains id, title, updatedAt', function () {
        const p = makeProvider();
        const rec = makeRecord({ title: 'My NB', updatedAt: '2026-06-18T10:00:00.000Z' });
        saveNotebook(p, rec);
        const list = listNotebooks(p);
        assert.equal(list.length, 1);
        assert.equal(list[0].id, rec.id);
        assert.equal(list[0].title, 'My NB');
        assert.equal(list[0].updatedAt, '2026-06-18T10:00:00.000Z');
    });

    test('sorted by updatedAt descending', function () {
        const p = makeProvider();
        const older = makeRecord({ title: 'Older', updatedAt: '2026-06-17T10:00:00.000Z' });
        const newer = makeRecord({ title: 'Newer', updatedAt: '2026-06-18T10:00:00.000Z' });
        saveNotebook(p, older);
        saveNotebook(p, newer);
        const list = listNotebooks(p);
        assert.equal(list[0].title, 'Newer');
        assert.equal(list[1].title, 'Older');
    });

    test('does not include html in summary', function () {
        const p = makeProvider();
        const rec = makeRecord();
        saveNotebook(p, rec);
        const list = listNotebooks(p);
        // html is NOT part of the lightweight summary
        assert.equal('html' in list[0], false);
    });

    test('reflects deletions', function () {
        const p = makeProvider();
        const rec = makeRecord();
        saveNotebook(p, rec);
        deleteNotebook(p, rec.id);
        assert.deepEqual(listNotebooks(p), []);
    });

});

// ── Section 5: FAIL-LOUD validation ──────────────────────────────────────────

describe('saveNotebook — FAIL-LOUD validation', function () {

    test('throws on null record', function () {
        const p = makeProvider();
        assert.throws(() => saveNotebook(p, null), /must be a non-null object/);
    });

    test('throws on missing id', function () {
        const p = makeProvider();
        assert.throws(
            () => saveNotebook(p, { title: 'X', html: '<frqtl-notebook version="1"></frqtl-notebook>\n', schemaVersion: 1 }),
            /record\.id must be a non-empty string/
        );
    });

    test('throws on non-string title', function () {
        const p = makeProvider();
        assert.throws(
            () => saveNotebook(p, { id: newNotebookId(), title: 42, html: '<frqtl-notebook version="1"></frqtl-notebook>\n', schemaVersion: 1 }),
            /record\.title must be a string/
        );
    });

    test('throws on empty html', function () {
        const p = makeProvider();
        assert.throws(
            () => saveNotebook(p, { id: newNotebookId(), title: 'X', html: '', schemaVersion: 1 }),
            /record\.html must be a non-empty string/
        );
    });

    test('throws on missing schemaVersion', function () {
        const p = makeProvider();
        assert.throws(
            () => saveNotebook(p, { id: newNotebookId(), title: 'X', html: '<frqtl-notebook version="1"></frqtl-notebook>\n' }),
            /record\.schemaVersion must be a number/
        );
    });

});

describe('loadNotebook + deleteNotebook — FAIL-LOUD on bad id', function () {

    test('loadNotebook throws on empty id', function () {
        const p = makeProvider();
        assert.throws(() => loadNotebook(p, ''), /id must be a non-empty string/);
    });

    test('deleteNotebook throws on empty id', function () {
        const p = makeProvider();
        assert.throws(() => deleteNotebook(p, ''), /id must be a non-empty string/);
    });

});

// ── Section 6: round-trip discipline — html produced by format.serialize ──────

describe('save/load html round-trip (format.serialize discipline)', async function () {

    const { parse, serialize } = await import(path.join(repoRoot, 'lib/shim/notebook/format.js'));

    test('html stored via saveNotebook is byte-identical to format.serialize output', function () {
        const p = makeProvider();
        const nb = {
            version: '1',
            title: 'My Test Notebook',
            cells: [
                { type: 'markdown', id: 'c-md', lane: '', name: '', in: [], out: [], bind: '', body: '## Hello' },
            ],
        };
        const html = serialize(nb);
        const rec = makeRecord({ html });
        saveNotebook(p, rec);
        const loaded = loadNotebook(p, rec.id);
        assert.equal(loaded.html, html);
    });

    test('parse(loaded.html) round-trips the notebook object', function () {
        const p = makeProvider();
        const nb = {
            version: '1',
            title: 'Round-trip Test',
            cells: [
                { type: 'js', id: 'c-js', lane: 'math', name: '', in: [], out: ['x'], bind: '', body: 'return { x: 1 };' },
            ],
        };
        const html = serialize(nb);
        const rec = makeRecord({ html });
        saveNotebook(p, rec);
        const loaded = loadNotebook(p, rec.id);
        const parsed = parse(loaded.html);
        assert.equal(parsed.title, nb.title);
        assert.equal(parsed.cells.length, 1);
        assert.equal(parsed.cells[0].id, 'c-js');
        assert.deepEqual(parsed.cells[0].out, ['x']);
    });

});
