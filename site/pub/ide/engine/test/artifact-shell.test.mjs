/**
 * artifact-shell.test.mjs — ws-artifact-showcase Bite A2 conformance.
 *
 * Asserts the generated claude.ai Artifact host shell:
 *   1. embeds an import map that is BYTE-IDENTICAL to buildArtifactImportMap()'s
 *      own output — "never hand-drifted" (docs/design/frqtl-artifact-showcase-
 *      scoping-2026-07-10.md §4 Step 3 AC).
 *   2. references NO script/network origin outside the captured artifact CSP
 *      allowlist (§1 of the design doc) — a static grep, FAIL-LOUD on any
 *      unrecognized origin (never silently pass a shell that would 500 under
 *      the real CSP).
 *   3. contains NO `blob:` module usage (forbidden by that same CSP).
 *   4. imports the bare specifier '@descix/frqtl-sdk' (never a relative path —
 *      the whole point of the import map).
 *
 * Run: node --test lib/shim/engine/test/artifact-shell.test.mjs
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const { buildArtifactImportMap, renderArtifactShellHtml } = await import(
    path.join(__dirname, '../artifact-shell.js')
);
const { CDN_BASE, CDN_SDK_VERSION } = await import(path.join(__dirname, '../router.js'));

// The exact origins the captured claude.ai Artifact CSP's script-src allows
// (docs/design/frqtl-artifact-showcase-scoping-2026-07-10.md §1, verbatim).
// 'self' and inline/eval are not URLs and are not part of this grep.
const CSP_ALLOWED_HOSTS = new Set([
    'www.claudeusercontent.com',
    'cdnjs.cloudflare.com',
    'cdn.jsdelivr.net',
    'cdn.tailwindcss.com',
    'code.jquery.com'
]);

function extractUrls(html) {
    const matches = html.match(/https?:\/\/[^\s"'<>)]+/g);
    return matches || [];
}

describe('buildArtifactImportMap — the ONE import-map entry', function () {

    test('maps @descix/frqtl-sdk to an absolute jsdelivr URL under CDN_BASE', function () {
        const map = buildArtifactImportMap();
        assert.deepStrictEqual(Object.keys(map.imports), ['@descix/frqtl-sdk'],
            'exactly one bare specifier — never a per-script map (see module docstring)');
        assert.strictEqual(map.imports['@descix/frqtl-sdk'], CDN_BASE + '/esm/index.js');
        assert.ok(map.imports['@descix/frqtl-sdk'].startsWith('https://cdn.jsdelivr.net/npm/@descix/frqtl-sdk@' + CDN_SDK_VERSION),
            'pinned to the SAME CDN_SDK_VERSION router.js uses elsewhere — no second version literal');
    });

    test('opts.base overrides the default (the local-CDN-mirror harness seam)', function () {
        const map = buildArtifactImportMap({ base: 'http://127.0.0.1:9999/npm/@descix/frqtl-sdk@0.1.0/dist' });
        assert.strictEqual(map.imports['@descix/frqtl-sdk'], 'http://127.0.0.1:9999/npm/@descix/frqtl-sdk@0.1.0/dist/esm/index.js');
        // No-opts call is UNAFFECTED — the override never leaks into the default.
        assert.strictEqual(buildArtifactImportMap().imports['@descix/frqtl-sdk'], CDN_BASE + '/esm/index.js');
    });

});

describe('renderArtifactShellHtml — the generated artifact host shell', function () {

    test('embeds an import map byte-identical to buildArtifactImportMap() — never hand-drifted', function () {
        const html = renderArtifactShellHtml();
        const m = html.match(/<script type="importmap">([^<]*)<\/script>/);
        assert.ok(m, 'a <script type="importmap"> tag is present');
        const embedded = JSON.parse(m[1]);
        assert.deepStrictEqual(embedded, buildArtifactImportMap(),
            'the embedded import map is generated FROM buildArtifactImportMap(), not re-typed');
    });

    test('imports the bare specifier "@descix/frqtl-sdk", never a relative/blob path', function () {
        const html = renderArtifactShellHtml();
        assert.match(html, /import\s*\{\s*bootDoubleSlit\s*\}\s*from\s*'@descix\/frqtl-sdk';/,
            'the inline module imports bootDoubleSlit via the bare specifier');
        assert.doesNotMatch(html, /from\s*['"]\.\.?\//, 'no relative-path import in the shell itself');
    });

    test('contains a <script type="module"> and NO blob: usage anywhere (CSP forbids blob: modules)', function () {
        const html = renderArtifactShellHtml();
        assert.match(html, /<script type="module">/, 'the boot script is a genuine ES module');
        assert.doesNotMatch(html, /blob:/i, 'FAIL-LOUD guard: no blob: URL anywhere in the generated shell');
    });

    test('references NO origin outside the captured claude.ai Artifact CSP allowlist', function () {
        const html = renderArtifactShellHtml();
        const urls = extractUrls(html);
        assert.ok(urls.length > 0, 'sanity: the shell does reference at least one absolute URL (jsdelivr)');
        const offenders = [];
        for (const url of urls) {
            let host;
            try { host = new URL(url).host; } catch (e) { offenders.push(url); continue; }
            if (!CSP_ALLOWED_HOSTS.has(host)) { offenders.push(url); }
        }
        assert.deepStrictEqual(offenders, [],
            'every absolute URL in the shell must resolve to a CSP-allowlisted host: ' +
            Array.from(CSP_ALLOWED_HOSTS).join(', '));
        // And specifically: it should ONLY need jsdelivr (this shell has no
        // tailwind/jquery/cdnjs/claudeusercontent dependency at all).
        const hosts = new Set(urls.map((u) => new URL(u).host));
        assert.deepStrictEqual(Array.from(hosts), ['cdn.jsdelivr.net'],
            'the double-slit shell needs ONLY cdn.jsdelivr.net — a strict subset of the allowlist');
    });

    test('is deterministic and pure (no DOM/browser globals touched at generation time)', function () {
        const a = renderArtifactShellHtml({ wavelength: 32, canvasSize: 300, seed: 7 });
        const b = renderArtifactShellHtml({ wavelength: 32, canvasSize: 300, seed: 7 });
        assert.strictEqual(a, b, 'same opts → byte-identical output (pure function)');
        assert.match(a, /wavelength:\s*32,/);
        assert.match(a, /seed:\s*7,/);
    });

    // ws-artifact-showcase Bite A2 follow-up (2026-07-10 tester finding,
    // project_artifact_showcase_rule0_final_fail_cdnbase_hardcoded.md): the
    // import-map-only override left ~30 downstream script URLs pointed at the
    // real CDN. `opts.base` must ALSO propagate into the embedded
    // `bootDoubleSlit(..., {base})` call so the ESM entry's OWN engineRouter()
    // construction is redirected too — this is that propagation, asserted.
    test('opts.base propagates into the embedded bootDoubleSlit({base}) call (the full pre-publish override)', function () {
        const withBase = renderArtifactShellHtml({ base: 'http://127.0.0.1:9999/npm/@descix/frqtl-sdk@0.1.0/dist' });
        assert.match(withBase, /base:\s*"http:\/\/127\.0\.0\.1:9999\/npm\/@descix\/frqtl-sdk@0\.1\.0\/dist",/,
            'the inline bootDoubleSlit() call receives the SAME base the import map used');
        // The published/default shell (no opts.base) NEVER emits a `base:` line at
        // all — not even `base: undefined,` — so a diff against a pre-this-fix
        // shell is empty for the default call.
        const withoutBase = renderArtifactShellHtml();
        assert.doesNotMatch(withoutBase, /base:/, 'the default (published) shell never mentions `base` at all');
    });

});
