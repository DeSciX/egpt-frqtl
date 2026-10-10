/* Copyright 2023-2026 by Essam Abadir */
/**
 * caps-frqtl-failloud.test.mjs — FRAQTL #73, the second half.
 *
 * THE DEFECT: `caps.frqtl.RecipeContext(cfg)` (lib/shim/runtime/index.js) logged a
 * console line and RETURNED NULL when `window.RecipeContext` was not installed yet.
 * The synthesized recipe builder's very next line is `exp.build(buildExperiment)`, so
 * the null surfaced one frame later as
 *
 *     [frqtl] synthesized builder failed: Cannot read properties of null (reading 'build')
 *
 * — a property-access TypeError that names neither the missing thing nor the gate. Two
 * sibling members had the same soft shape: `FrqtlApp` (console + null) and the
 * `Universe` getter (`window.EGPTUniverse || null`).
 *
 * THE FIX: every caps.frqtl member that reads a game-layer global now goes through the
 * ONE reader `_sugar(name)`, which THROWS naming the global and the `ensureEngine()`
 * gate. So the guarantee is uniform across the surface — the sugar getters, the
 * constructor members, and Universe — rather than per-call-site null checks at each
 * consumer.
 *
 * These tests drive the REAL `Runtime.frqtl` object (the same object a builder cell
 * receives as `caps.frqtl`) with the game-layer globals ABSENT — which is exactly the
 * pre-boot state — and assert a throw, never a null. The negative control is the
 * second describe: with the global installed, the same member constructs normally, so
 * the assertions are not merely "everything throws".
 *
 * Run: node --test lib/shim/runtime/test/caps-frqtl-failloud.test.mjs
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

// Minimal DOM stubs so the runtime module loads in Node (the established pattern in
// runcell-forcemodulepath-gate.test.mjs / runcell-single-handler.test.mjs).
const _noop = function () {};
const _noEl = { setAttribute: _noop, style: {}, appendChild: _noop };
globalThis.document = {
    readyState: 'complete',
    addEventListener: _noop,
    removeEventListener: _noop,
    getElementById: function () { return null; },
    createElement: function () { return Object.assign({}, _noEl); },
    head: { appendChild: _noop },
    body: { appendChild: _noop }
};
globalThis.window = globalThis;

const { Runtime } = await import(path.join(repoRoot, 'lib/shim/runtime/index.js'));

// The three formerly-soft members, each paired with the window global it reads. The
// getter/constructor split is what the member IS, not a style choice, so the table
// carries a `read` closure rather than re-deriving a call shape per assertion.
const SOFT_MEMBERS_BEFORE_THE_FIX = [
    { member: 'RecipeContext', global: 'RecipeContext', read: () => Runtime.frqtl.RecipeContext({}) },
    { member: 'FrqtlApp',      global: 'FrqtlApp',      read: () => Runtime.frqtl.FrqtlApp({}) },
    { member: 'Universe',      global: 'EGPTUniverse',  read: () => Runtime.frqtl.Universe }
];

// One sugar getter, to show the guarantee is now the SAME one across the surface.
const A_SUGAR_GETTER = { member: 'PointSource', global: 'PointSource', read: () => Runtime.frqtl.PointSource };

function clearGameLayerGlobals() {
    for (const name of ['RecipeContext', 'FrqtlApp', 'EGPTUniverse', 'PointSource', 'Experiment']) {
        delete globalThis[name];
    }
}

describe('caps.frqtl pre-boot: every game-layer read FAILS LOUD, never returns null (FRAQTL #73)', () => {
    beforeEach(() => { clearGameLayerGlobals(); });

    for (const { member, global, read } of SOFT_MEMBERS_BEFORE_THE_FIX.concat([A_SUGAR_GETTER])) {
        test(`caps.frqtl.${member} throws naming "${global}" and the ensureEngine() gate`, () => {
            assert.throws(read, (err) => {
                assert.ok(err instanceof Error, `${member} threw an Error (got ${typeof err})`);
                assert.match(err.message, new RegExp('"' + global + '"'),
                    `the message names the missing global ("${global}") — not a bare TypeError`);
                assert.match(err.message, /ensureEngine\(\)/,
                    'the message names the gate the caller must await');
                assert.match(err.message, /FAIL-LOUD/, 'tagged FAIL-LOUD like every other shim throw');
                return true;
            }, `caps.frqtl.${member} must throw pre-boot`);
        });

        test(`caps.frqtl.${member} does not return null/undefined pre-boot (the shape that produced #73's TypeError)`, () => {
            let returned = Symbol('never');
            try { returned = read(); } catch (e) { returned = Symbol('threw'); }
            assert.notEqual(returned, null, `${member} must not hand back null`);
            assert.notEqual(returned, undefined, `${member} must not hand back undefined`);
        });
    }
});

describe('NEGATIVE CONTROL: with the game-layer global installed, the same member works', () => {
    beforeEach(() => { clearGameLayerGlobals(); });

    test('caps.frqtl.RecipeContext constructs window.RecipeContext with the config it was given', () => {
        let seen = null;
        globalThis.RecipeContext = function FakeRecipeContext(opts) { seen = opts; this.tag = 'recipe'; };
        const exp = Runtime.frqtl.RecipeContext({ canvasW: 480, deferCanvas: true });
        assert.equal(exp.tag, 'recipe', 'the real window.RecipeContext was constructed');
        assert.deepEqual(seen, { canvasW: 480, deferCanvas: true }, 'the config is ferried verbatim');
    });

    test('caps.frqtl.FrqtlApp constructs window.FrqtlApp; caps.frqtl.Universe returns window.EGPTUniverse', () => {
        globalThis.FrqtlApp = function FakeFrqtlApp(opts) { this.opts = opts; };
        globalThis.EGPTUniverse = function FakeUniverse() {};
        assert.deepEqual(Runtime.frqtl.FrqtlApp({ seed: 42 }).opts, { seed: 42 });
        assert.equal(Runtime.frqtl.Universe, globalThis.EGPTUniverse);
    });
});
