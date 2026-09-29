/* Copyright 2023-2026 by Essam Abadir */
/**
 * setup-builder-factory-statics.test.mjs — a notebook canvas boots its factory's statics.
 *
 * The FACTORY builder template hands runner.setup() an arrow around the module's export.
 * The arrow must carry the export's factory statics (FrqtlApp.FACTORY_STATICS — initWorld,
 * RATE_LIMITS) through `frqtl.carryFactoryStatics`, or a notebook canvas silently runs a
 * scene at a different pace (or on a different world) than every other surface that boots
 * the same factory. Drives the REAL synthesizeBuilderSource() output, compiled and
 * executed, against the REAL FrqtlApp.setup().
 *
 * Run: node --test lib/shim/notebook/test/setup-builder-factory-statics.test.mjs
 */
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');
const require   = createRequire(import.meta.url);

const { synthesizeBuilderSource } = await import(path.join(repoRoot, 'lib/shim/notebook/setup-builder.js'));
const { buildModuleClosure, compileEntryModuleSource } = await import(
    path.join(repoRoot, 'lib/shim/notebook/module-resolver.js')
);

const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'frqtl-builder-statics-'));
after(() => { fs.rmSync(scratchDir, { recursive: true, force: true }); });

let _mint = 0;
function mintFileUrl(source) {
    const f = path.join(scratchDir, 'blob-' + (_mint++) + '.mjs');
    fs.writeFileSync(f, source, 'utf8');
    return pathToFileURL(f).href;
}

let FrqtlApp;
before(async () => {
    const LIB_FRQTL = path.join(repoRoot, 'lib/frqtl');
    const EGPTEngine = require(path.join(LIB_FRQTL, 'compat/egpt-engine.js'));
    const handle = await EGPTEngine.create({ backend: 'wasm' });
    globalThis.Rectangle    = handle.Rectangle;
    globalThis.EGPTUniverse = handle.EGPTUniverse;
    const { installHeadlessRenderer } = await import(
        pathToFileURL(path.join(LIB_FRQTL, 'objects/test/_headless-renderer.mjs')).href);
    installHeadlessRenderer();
    globalThis.requestAnimationFrame = function () { return 0; };
    globalThis.cancelAnimationFrame  = function () {};
    FrqtlApp = require(path.join(LIB_FRQTL, 'objects/FrqtlApp.js')).FrqtlApp;
});

// caps.frqtl as the builder sees it, over the REAL FrqtlApp (runner + helper).
function caps() {
    return {
        frqtl: {
            ensureEngine() { return Promise.resolve(); },
            knob(_name, opts) { return opts || {}; },
            FrqtlApp(cfg) { return new FrqtlApp(cfg); },
            carryFactoryStatics(wrapper, factory) { return FrqtlApp.carryFactoryStatics(wrapper, factory); }
        }
    };
}

async function runBuilder(moduleSource) {
    const modules = { './setups/paced.js': moduleSource };
    const { builderCode, outName } = synthesizeBuilderSource({ setup: './setups/paced.js#setupPaced', modules });
    const closure  = buildModuleClosure(modules, mintFileUrl);
    const entryUrl = mintFileUrl(compileEntryModuleSource(builderCode, '__entry__.js', closure.blobUrlByKey));
    const mod = await import(entryUrl);
    return (await mod.default(caps(), {}))[outName];
}

describe('FACTORY builder template carries the export\'s factory statics into runner.setup()', () => {
    test('a module export carrying RATE_LIMITS runs its canvas at that rate', async () => {
        const runner = await runBuilder(
            "export function setupPaced(frqtl, universe, options) { return { built: true }; }\n" +
            "setupPaced.RATE_LIMITS = Object.freeze({ tpsLimit: 240 });\n");
        assert.equal(runner.setupResult.built, true, 'the factory ran');
        assert.equal(runner.getRateLimits().tpsLimit, 240,
            'RATE_LIMITS reached FrqtlApp.setup() through the builder arrow');
    });

    test('control: an export with no statics leaves the canvas at the 1:1 default', async () => {
        const runner = await runBuilder(
            "export function setupPaced(frqtl, universe, options) { return { built: true }; }\n");
        assert.equal(runner.getRateLimits().tpsLimit, 0);
    });
});
