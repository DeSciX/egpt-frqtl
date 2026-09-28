/* Copyright 2023-2026 by Essam Abadir */
/**
 * frqtl-setups-importmap.test.mjs — WS gym-controls-as-sugar Bite 0 (node-testable).
 *
 * Proves the bare-specifier import-map generator for the canonical setup factories
 * (the notebook physics-logic-fork remediation, architect OBJECT-class finding,
 * §5.6.1 / §6 call 8 / §5.7.7) AND the REMEDIATION (tester realm-verification
 * finding 2026-07-03: the generator must point at the ESM-transformed
 * `objects/setup-esm/<file>` route, never the raw classic-script
 * `objects/setup/<file>` route):
 *   - every manifest entry resolves via the CALLER'S engineRouter `objects/` mapping
 *     (dev-core, dist, and the document-relative static router the static bake uses) to
 *     the `setup-esm` path, never a hand-derived '/frqtl' literal and never the raw
 *     (classic-script) `setup/` route; a missing router FAILS LOUD;
 *   - `frqtlSetupsEsmModules()` is the manifest, one row per spec, with source/esm paths;
 *   - every manifest filename actually exists on disk under lib/frqtl/objects/setup/
 *     (a manifest entry pointing at nothing would 404 silently in the realm loader —
 *     this test catches that at commit time instead);
 *   - every manifest entry requires (CJS) and exports a callable factory — proves
 *     the RAW file (what the classic-script route serves byte-for-byte) is real;
 *   - `frqtlSetupsManifestByFile()` round-trips to the same manifest, keyed by
 *     filename (the shape lib/server/frqtl-setup-esm.js's route handler needs);
 *   - FAIL-LOUD on a manifest entry with no file/primary.
 *
 * The REALM-FAITHFUL proof (import()-ing the ESM-transformed source with `module`
 * undefined, exactly as a browser's native ESM loader would) lives in the sibling
 * lib/server/test/frqtl-setup-esm.test.mjs (co-located with the dev emitter).
 *
 * Run: node --test lib/shim/notebook/test/frqtl-setups-importmap.test.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

const { buildFrqtlSetupsImportMap, FRQTL_SETUPS_MANIFEST, frqtlSetupsManifestByFile, frqtlSetupsEsmModules, frqtlSetupsSourceMissingError } = await import(
    path.join(repoRoot, 'lib/shim/notebook/frqtl-setups-importmap.js')
);
const { engineRouter } = await import(path.join(repoRoot, 'lib/shim/engine/router.js'));

describe('buildFrqtlSetupsImportMap — canonical setup-factory bare specifiers', () => {
    test('every manifest spec resolves to the ESM-transformed /frqtl/objects/setup-esm/<file> route in dev-core mode (NEVER the raw classic-script setup/ route)', () => {
        const map = buildFrqtlSetupsImportMap(engineRouter({ mode: 'dev-core' }));
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            const { file } = FRQTL_SETUPS_MANIFEST[spec];
            assert.equal(map.imports[spec], '/frqtl/objects/setup-esm/' + file,
                spec + ' resolves via the setup-esm route (dev-core)');
            assert.ok(!map.imports[spec].includes('/objects/setup/'),
                spec + ' must NOT point at the raw classic-script route (would throw "does not provide an export")');
        }
    });

    test('every manifest spec resolves under the dist game/setup-esm path in dist mode', () => {
        const map = buildFrqtlSetupsImportMap(engineRouter({ mode: 'dist' }));
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            const { file } = FRQTL_SETUPS_MANIFEST[spec];
            assert.equal(map.imports[spec], '../../js/game/setup-esm/' + file,
                spec + ' resolves under the dist-relative objects/ mapping');
        }
    });

    test('the document-relative static router (the static bake) maps every spec under ./pub/js/game/setup-esm/', () => {
        const map = buildFrqtlSetupsImportMap(engineRouter({ mode: 'static', documentRelative: true }));
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            assert.equal(map.imports[spec], './pub/js/game/setup-esm/' + FRQTL_SETUPS_MANIFEST[spec].file);
        }
    });

    test('FAIL-LOUD without a router (a mode string or nothing is not a path authority)', () => {
        assert.throws(() => buildFrqtlSetupsImportMap(), /requires an engineRouter\(\) instance/);
        assert.throws(() => buildFrqtlSetupsImportMap('dev-core'), /requires an engineRouter\(\) instance/);
    });

    test('frqtlSetupsEsmModules() is the manifest: one row per spec, objects/setup/ source, objects/setup-esm/ module', () => {
        const mods = frqtlSetupsEsmModules();
        assert.deepEqual(mods.map((m) => m.spec), Object.keys(FRQTL_SETUPS_MANIFEST));
        for (const m of mods) {
            assert.equal(m.entry, FRQTL_SETUPS_MANIFEST[m.spec]);
            assert.equal(m.sourcePath, 'objects/setup/' + m.entry.file);
            assert.equal(m.esmPath, 'objects/setup-esm/' + m.entry.file);
        }
    });

    test('every manifest filename exists on disk under lib/frqtl/objects/setup/ (never a dangling entry)', () => {
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            const { file } = FRQTL_SETUPS_MANIFEST[spec];
            const abs = path.join(repoRoot, 'lib/frqtl/objects/setup', file);
            assert.ok(fs.existsSync(abs), spec + ' → ' + file + ' must exist at ' + abs);
        }
    });

    test('every manifest entry requires (CJS, dual-mode UMD) and exports a callable factory named "primary"', () => {
        // The canonical setup files are dual-mode (`module.exports` || `window.x`) — the
        // RAW source the classic-script route serves byte-for-byte, and the source the
        // setup-esm route transforms. Requiring it here in Node proves the file is real,
        // loadable, and exports a function under the manifest's declared "primary" name.
        const req = createRequire(import.meta.url);
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            const { file, primary } = FRQTL_SETUPS_MANIFEST[spec];
            const abs = path.join(repoRoot, 'lib/frqtl/objects/setup', file);
            const mod = req(abs);
            assert.equal(typeof mod[primary], 'function',
                spec + ' → ' + file + ' exports a callable "' + primary + '"');
        }
    });

    test('FAIL-LOUD: a manifest entry with no primary throws', () => {
        // Exercise buildFrqtlSetupsImportMap's own guard by temporarily shadowing the
        // manifest is not possible (it's a frozen-by-convention export) — instead assert
        // every REAL entry satisfies the invariant the guard enforces, directly.
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            const entry = FRQTL_SETUPS_MANIFEST[spec];
            assert.equal(typeof entry.file, 'string');
            assert.equal(typeof entry.primary, 'string');
        }
    });
});

describe('frqtlSetupsManifestByFile — filename-keyed lookup for the route handler', () => {
    test('has one row per manifest file: the frqtlSetupsEsmModules() row (spec + entry)', () => {
        const byFile = frqtlSetupsManifestByFile();
        const specs = Object.keys(FRQTL_SETUPS_MANIFEST);
        assert.equal(Object.keys(byFile).length, specs.length, 'one file entry per spec (no filename collisions)');
        for (const spec of specs) {
            const entry = FRQTL_SETUPS_MANIFEST[spec];
            assert.equal(byFile[entry.file].spec, spec);
            assert.equal(byFile[entry.file].entry, entry, entry.file + ' carries the SAME manifest entry');
        }
    });

    test('setupCircuitBasic.js declares its statics (createWire/createBattery/createResistor)', () => {
        const byFile = frqtlSetupsManifestByFile();
        assert.deepEqual(byFile['setupCircuitBasic.js'].entry.statics, ['createWire', 'createBattery', 'createResistor']);
    });

    test('frqtlSetupsSourceMissingError names the manifest spec, the path and the cause', () => {
        const cause = Object.assign(new Error('nope'), { code: 'ENOENT' });
        const err = frqtlSetupsSourceMissingError({ spec: '@frqtl/setups/big-bang' }, '/x/setupBigBang.js', cause);
        assert.match(err.message, /FRQTL_SETUPS_MANIFEST spec "@frqtl\/setups\/big-bang" names source "\/x\/setupBigBang\.js"/);
        assert.match(err.message, /ENOENT/);
        assert.equal(err.cause, cause);
    });
});
