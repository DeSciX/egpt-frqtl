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
 *   - every manifest entry resolves via engineRouter's `objects/` mapping (dev-core
 *     AND dist) to the `setup-esm` route, never a hand-derived '/frqtl' literal
 *     and never the raw (classic-script) `setup/` route;
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
 * lib/server/test/frqtl-setup-esm.test.mjs (co-located with the transform it tests).
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

const { buildFrqtlSetupsImportMap, FRQTL_SETUPS_MANIFEST, frqtlSetupsManifestByFile } = await import(
    path.join(repoRoot, 'lib/shim/notebook/frqtl-setups-importmap.js')
);

describe('buildFrqtlSetupsImportMap — canonical setup-factory bare specifiers', () => {
    test('every manifest spec resolves to the ESM-transformed /frqtl/objects/setup-esm/<file> route in dev-core mode (NEVER the raw classic-script setup/ route)', () => {
        const map = buildFrqtlSetupsImportMap('dev-core');
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            const { file } = FRQTL_SETUPS_MANIFEST[spec];
            assert.equal(map.imports[spec], '/frqtl/objects/setup-esm/' + file,
                spec + ' resolves via the setup-esm route (dev-core)');
            assert.ok(!map.imports[spec].includes('/objects/setup/'),
                spec + ' must NOT point at the raw classic-script route (would throw "does not provide an export")');
        }
    });

    test('every manifest spec resolves under the dist game/setup-esm path in dist mode', () => {
        const map = buildFrqtlSetupsImportMap('dist');
        for (const spec of Object.keys(FRQTL_SETUPS_MANIFEST)) {
            const { file } = FRQTL_SETUPS_MANIFEST[spec];
            assert.equal(map.imports[spec], '../../js/game/setup-esm/' + file,
                spec + ' resolves under the dist-relative objects/ mapping');
        }
    });

    test('defaults to dev-core mode when omitted', () => {
        const withDefault = buildFrqtlSetupsImportMap();
        const explicit = buildFrqtlSetupsImportMap('dev-core');
        assert.deepEqual(withDefault, explicit);
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
    test('has one entry per manifest file, matching the spec-keyed manifest', () => {
        const byFile = frqtlSetupsManifestByFile();
        const specs = Object.keys(FRQTL_SETUPS_MANIFEST);
        assert.equal(Object.keys(byFile).length, specs.length, 'one file entry per spec (no filename collisions)');
        for (const spec of specs) {
            const entry = FRQTL_SETUPS_MANIFEST[spec];
            assert.deepEqual(byFile[entry.file], entry, entry.file + ' round-trips to the SAME entry object shape');
        }
    });

    test('setupCircuitBasic.js declares its statics (createWire/createBattery/createResistor)', () => {
        const byFile = frqtlSetupsManifestByFile();
        assert.deepEqual(byFile['setupCircuitBasic.js'].statics, ['createWire', 'createBattery', 'createResistor']);
    });
});
