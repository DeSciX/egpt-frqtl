/* Copyright 2023-2026 by Essam Abadir */

/**
 * no-esm-binding-import-tombstone.test.mjs — WS gym-controls-as-sugar Bite 3
 * fix-loop (tester regression, 2026-07-04): the STATIC detection-gap closer.
 *
 * THE GAP: `node --test` could not see `presets.js:34`'s browser-fatal
 * `import PageParamsMod from '…/page-params/index.js'` (a default import of
 * a dual CommonJS/window module with zero ES exports) because Node's own
 * ESM loader auto-detects such a file as CommonJS and synthesizes a default
 * export — masking the exact defect that blank-screened the real browser
 * IDE. See `esm-linker-page-params.test.mjs` for the real-linker reproduction
 * and `presets.js`'s own docstring for the fix (a side-effect import + lazy
 * `window.PageParams` read).
 *
 * THIS FILE is the cheap, ALWAYS-ON static guard: a comment-stripped scan of
 * every `.js`/`.jsx` file under `lib/features/` and `lib/components/` (the
 * ESM feature/component layer — the ONLY layer that can hit this class of
 * bug; script-tag experiment pages and CJS `require()` consumers are
 * unaffected by construction) for ANY `import … from '…'` (default, named,
 * or namespace — anything that REQUESTS A BINDING) targeting one of the
 * dual CommonJS/window contract modules (`page-params/index.js`,
 * `controls/index.js`, `controls/registry.js`). The ONLY sanctioned
 * mechanism is a bare side-effect import (`import '…/index.js';` — no
 * `from`-less binding requested) followed by a runtime `window.<Contract>`
 * read (a named FAIL-LOUD guard, per `presets.js`'s `_getPageParams()`).
 *
 * Mirrors `pane-manifest-vestige-tombstone.test.mjs`'s technique (comment-
 * stripped source scan, no test-side re-implementation of the contract).
 *
 * Run: node --test lib/shim/page-params/test/no-esm-binding-import-tombstone.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot  = path.resolve(__dirname, '../../../..');

function stripComments(src) {
    return src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map(function (line) { return line.replace(/\/\/.*$/, ''); })
        .join('\n');
}

/** Recursively collect every .js/.jsx file under `dir` (repo-root-relative). */
function collectSourceFiles(relDir) {
    const abs = path.join(repoRoot, relDir);
    const out = [];
    (function walk(cur) {
        for (const entry of readdirSync(cur)) {
            const full = path.join(cur, entry);
            const st = statSync(full);
            if (st.isDirectory()) {
                if (entry === 'node_modules') { continue; }
                walk(full);
            } else if (/\.(js|jsx)$/.test(entry)) {
                out.push(full);
            }
        }
    })(abs);
    return out;
}

// The dual CommonJS/window contract modules a genuine ESM consumer may ONLY
// side-effect-import (never bind-import). Derived from the file paths
// themselves (a suffix match), not a hand re-description of their exports.
const DUAL_MODE_TARGETS = [
    'shim/page-params/index.js',
    'shim/controls/index.js',
    'shim/controls/registry.js'
];

// A binding-requesting import: `import <anything> from '<specifier>'`
// (covers default `import X from`, named `import {X} from`, and namespace
// `import * as X from` — all three put `from` right before the specifier
// string; a bare side-effect import `import '<specifier>';` never has a
// `from` clause at all, so this single pattern class captures every
// forbidden form without needing three separate regexes).
function findForbiddenImports(source) {
    const stripped = stripComments(source);
    const hits = [];
    const re = /import\s+[\s\S]*?\bfrom\s+['"]([^'"]+)['"]/g;
    let m;
    while ((m = re.exec(stripped)) !== null) {
        const specifier = m[1];
        for (const target of DUAL_MODE_TARGETS) {
            if (specifier.endsWith(target) || specifier.endsWith(target.replace('index.js', ''))) {
                hits.push({ specifier: specifier, target: target });
            }
        }
    }
    return hits;
}

describe('no ESM binding-import of a dual CommonJS/window shim contract in lib/features or lib/components', function () {
    const surfaces = ['lib/features', 'lib/components'];

    surfaces.forEach(function (surface) {
        test(surface + ': zero `import … from` bindings of page-params/controls (side-effect import + window read is the ONLY sanctioned form)', function () {
            const violations = [];
            for (const file of collectSourceFiles(surface)) {
                const src = readFileSync(file, 'utf8');
                const hits = findForbiddenImports(src);
                if (hits.length > 0) {
                    violations.push(path.relative(repoRoot, file) + ': ' +
                        hits.map(function (h) { return h.specifier; }).join(', '));
                }
            }
            assert.deepEqual(
                violations,
                [],
                'Found ESM binding-import(s) of a dual CommonJS/window shim contract module ' +
                '(page-params/controls) — the EXACT class of bug that blank-screened the real ' +
                'browser IDE (Node\'s CJS-interop masks it, the browser does not). Replace with ' +
                'a bare side-effect import (`import \'…/index.js\';`) plus a runtime ' +
                '`window.<Contract>` read behind a named FAIL-LOUD guard (see presets.js\'s ' +
                '`_getPageParams()`).\n' + violations.join('\n')
            );
        });
    });

    test('sanity: presets.js\'s real side-effect import of page-params IS present (the scan above is not accidentally matching zero files)', function () {
        const src = readFileSync(path.join(repoRoot, 'lib/features/ide/presets.js'), 'utf8');
        const stripped = stripComments(src);
        assert.ok(/import\s+'\.\.\/\.\.\/shim\/page-params\/index\.js'/.test(stripped),
            'expected the sanctioned side-effect import form to be present and NOT flagged as a violation');
    });
});
