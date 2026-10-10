/* Copyright 2023-2026 by Essam Abadir */

/**
 * classic-script-scope.test.mjs — the drift gate for the SHARED BROWSER GLOBAL
 * SCOPE of EVERY classic script an experiment page loads.
 *
 * ## What this guards (and why `node --test` alone cannot)
 *
 * `lib/frqtl/experiments/_shared/stack-boot.js` injects its whole roster as
 * classic `<script>` tags — the ENGINE array (engine/compat + the `lib/shim`
 * contract scripts), the RENDERER array, the GAME array, the two boot files,
 * and each page's own `data-page-scripts` CSV. Classic scripts do NOT get a
 * module scope: every top-level `function`/`var`/`let`/`const`/`class`
 * declaration lands in ONE shared global lexical environment, and the script
 * that loads LAST silently wins. Node, by contrast, gives each `require()`d
 * file its own module scope — so a collision of this class is invisible to
 * every unit test BY CONSTRUCTION, and only shows up in the realm.
 *
 * Two observed instances of the class:
 *
 * - `frqtl-control-widgets.js` declared a top-level `function _label(text)`
 *   returning an HTMLSpanElement and loaded AFTER `makeControlsForObject.js`,
 *   whose own `function _label(field)` returns the control's display string.
 *   Every generated control descriptor's `label` became a DOM node,
 *   `normalizeControlDescriptor` FAILED LOUD on "label must be a non-empty
 *   string", and both the STUDIO render-controls panel AND every experiment's
 *   saved render state (water/bloom/god-rays/glow/heat) went dark.
 * - `lib/shim/field-descriptor/index.js`'s `_fail(name, msg)` and
 *   `lib/shim/controls/index.js`'s `_fail(id, kind, msg)` — both ENGINE-phase
 *   classic scripts, controls loading last. A `normalizeFieldDescriptor`
 *   validation failure threw the CONTROLS module's message with the real
 *   message shifted into the `kind` slot: still FAIL-LOUD, but the diagnostic
 *   lied about both the module and the shape.
 *
 * ## The rule
 *
 * A classic script reaches the shared global scope through EXACTLY ONE door:
 * its explicit `window.<Namespace> = …` assignment. Everything else is
 * private, which the codebase expresses with the canonical module-scope IIFE
 * (`(function () { … })();` — see `Wall.js`, `LargeObject.js`,
 * `shim/controls/index.js` and their siblings). A dual CommonJS/window file
 * keeps its whole `module.exports` / `window.X` export block INSIDE the
 * wrapper, so both consumption modes are unchanged.
 *
 * ## Where the roster comes from (never a hand-copied list)
 *
 * `stack-boot.js` IS the loader, so it is the authority for what loads as a
 * classic script — this file parses its `_u('…')` literals directly, the same
 * extraction its sibling gate `renderer-stack-wiring.test.mjs` performs on the
 * RENDERER array. The two ESM manifests that mirror parts of that roster
 * (`GAME_LAYER_SCRIPTS`, `ENGINE_SHIM_CONTRACT_SCRIPTS`) are asserted to be
 * COVERED by the parse, so a parser regression that silently narrowed the
 * roster fails here instead of passing vacuously. Per-page scripts come from
 * each experiment page's own `data-page-scripts` attribute — the page's
 * roster, by the same principle.
 *
 * Run: node --test lib/shim/engine/test/classic-script-scope.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAME_LAYER_SCRIPTS } from '../game-layer-manifest.js';
import { ENGINE_SHIM_CONTRACT_SCRIPTS } from '../shim-contract-manifest.js';

const HERE       = path.dirname(fileURLToPath(import.meta.url));
const LIB_DIR    = path.resolve(HERE, '../../..');            // lib/
const FRQTL_DIR  = path.join(LIB_DIR, 'frqtl');
const EXP_DIR    = path.join(FRQTL_DIR, 'experiments');
const STACK_BOOT = path.join(EXP_DIR, '_shared/stack-boot.js');

/** A top-level declaration = one starting in COLUMN 0 (never indented). */
const TOP_LEVEL_DECL = /^(?:function|var|let|const|class)\s+([A-Za-z_$][\w$]*)/gm;
/** The canonical module-scope wrapper, at column 0. */
const IIFE_OPEN = /^\(function \(\) \{/m;

/**
 * `assets/vendor/` is third-party code (chroma.min.js et al) vendored verbatim.
 * It carries its own upstream wrapper and is never edited here — reformatting it
 * to this repo's IIFE convention would fork the upstream file.
 */
const VENDOR_PREFIX = 'assets/vendor/';

/** '/lib/shim/x.js' (a dev-mount absolute) → <LIB_DIR>/shim/x.js */
function fromLibMount(absMountPath) {
    return path.join(LIB_DIR, absMountPath.replace(/^\/lib\//, ''));
}

/**
 * Resolve one stack-boot `_u('<rel>')` literal, mirroring `_u()`'s own dev-core
 * fallback: a `shim/` prefix resolves at the `/lib/shim` mount, everything else
 * under `lib/frqtl`.
 */
function resolveStackBootPath(rel) {
    return rel.startsWith('shim/') ? path.join(LIB_DIR, rel) : path.join(FRQTL_DIR, rel);
}

/** Every classic script stack-boot.js injects: the three arrays + the two boot files. */
function stackBootRoster() {
    const src = fs.readFileSync(STACK_BOOT, 'utf8');
    const rels = [...src.matchAll(/_u\('([^']+)'\)/g)]
        .map((m) => m[1])
        .filter((rel) => rel.endsWith('.js') && !rel.startsWith(VENDOR_PREFIX));
    return [...new Set(rels)].map((rel) => ({
        rel,
        abs: resolveStackBootPath(rel),
        phase: 'stack-boot'
    }));
}

/** Every per-page classic script, read from the pages' own `data-page-scripts` CSV. */
function pageScriptRoster() {
    const byAbs = new Map();
    for (const dirent of fs.readdirSync(EXP_DIR, { withFileTypes: true })) {
        if (!dirent.isDirectory()) { continue; }
        const pageDir = path.join(EXP_DIR, dirent.name);
        for (const file of fs.readdirSync(pageDir)) {
            if (!file.endsWith('.html')) { continue; }
            const attr = fs.readFileSync(path.join(pageDir, file), 'utf8')
                .match(/data-page-scripts="([^"]*)"/);
            if (!attr) { continue; }
            for (const raw of attr[1].split(',')) {
                const rel = raw.trim();
                if (!rel.endsWith('.js')) { continue; }
                // A page-scripts entry is either page-relative ('../../objects/x.js')
                // or absolute at a dev mount ('/lib/shim/x.js') — stack-boot's own
                // _pageScripts block resolves both against document.baseURI.
                const abs = rel.startsWith('/') ? fromLibMount(rel) : path.resolve(pageDir, rel);
                if (!byAbs.has(abs)) {
                    byAbs.set(abs, { rel: path.relative(LIB_DIR, abs), abs, phase: 'page-scripts' });
                }
            }
        }
    }
    return [...byAbs.values()];
}

/** The COMPLETE classic-script roster — every file that shares the one global scope. */
function classicScriptRoster() {
    const byAbs = new Map();
    for (const entry of [...stackBootRoster(), ...pageScriptRoster()]) {
        if (!byAbs.has(entry.abs)) { byAbs.set(entry.abs, entry); }
    }
    return [...byAbs.values()];
}

/** Top-level identifiers a file would LEAK into the shared global scope. */
function leakedIdentifiers(src) {
    if (IIFE_OPEN.test(src)) { return []; }   // module-scoped — leaks nothing
    return [...new Set([...src.matchAll(TOP_LEVEL_DECL)].map((m) => m[1]))];
}

const ROSTER = classicScriptRoster();

describe('classic scripts share ONE browser global scope', () => {

    test('the roster parses out of stack-boot.js + the pages, and every entry is a real file', () => {
        // A floor, not an exact count: the assertions below would pass VACUOUSLY if the
        // parse ever collapsed to [] (the empty-list failure mode this gate exists to
        // outlive). The roster is ~100 files today.
        assert.ok(ROSTER.length > 50, `the parsed roster collapsed to ${ROSTER.length} entries`);
        const missing = ROSTER.filter((e) => !fs.existsSync(e.abs)).map((e) => e.rel);
        assert.deepEqual(missing, [], 'every roster entry resolves to a file on disk');
    });

    test('the roster COVERS both ESM manifests (it can never silently narrow to one load phase)', () => {
        const rosterAbs = new Set(ROSTER.map((e) => e.abs));
        const uncovered = [];
        for (const rel of GAME_LAYER_SCRIPTS) {
            if (!rosterAbs.has(path.join(FRQTL_DIR, rel))) { uncovered.push(`GAME: ${rel}`); }
        }
        for (const abs of ENGINE_SHIM_CONTRACT_SCRIPTS) {
            if (!rosterAbs.has(fromLibMount(abs))) { uncovered.push(`ENGINE-SHIM: ${abs}`); }
        }
        assert.deepEqual(uncovered, [],
            'a manifest entry missing from the parsed roster means the PARSE drifted — the gate ' +
            'would silently stop covering that load phase');
    });

    test('no two scripts declare the same top-level identifier (the _label / _fail collision class)', () => {
        /** identifier -> the roster entries that declare it at top level */
        const byIdentifier = new Map();
        for (const entry of ROSTER) {
            for (const id of leakedIdentifiers(fs.readFileSync(entry.abs, 'utf8'))) {
                if (!byIdentifier.has(id)) { byIdentifier.set(id, []); }
                byIdentifier.get(id).push(entry.rel);
            }
        }
        const collisions = [...byIdentifier.entries()].filter(([, files]) => files.length > 1);
        assert.deepEqual(
            collisions.map(([id, files]) => `${id} <- ${files.join(', ')}`),
            [],
            'two classic scripts declaring the same top-level name silently overwrite each other in ' +
            'the browser (last loaded wins) — wrap each file in the canonical module-scope IIFE ' +
            '`(function () { … })();` so only its explicit window.<Namespace> assignment is global'
        );
    });

    test('every classic script is module-scoped (leaks nothing but its window namespace)', () => {
        const leaking = [];
        for (const entry of ROSTER) {
            const leaked = leakedIdentifiers(fs.readFileSync(entry.abs, 'utf8'));
            if (leaked.length > 0) {
                leaking.push(`${entry.rel} [${entry.phase}] leaks [${leaked.join(', ')}]`);
            }
        }
        assert.deepEqual(leaking, [],
            'a classic <script> has no module scope — wrap the file body in `(function () { … })();` ' +
            'and keep the `module.exports` / `window.<Namespace> = …` export block INSIDE it');
    });
});
