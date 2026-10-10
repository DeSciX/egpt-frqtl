/**
 * artifact-mirror-http.test.mjs — ws-artifact-showcase Bite A2 follow-up
 * (2026-07-10 tester finding, `.claude/agent-memory/frqtl-tester/
 * project_artifact_showcase_rule0_final_fail_cdnbase_hardcoded.md`).
 *
 * The disk-existence guard (router.test.mjs test (g)) is necessary but NOT
 * sufficient: it strips the CDN_BASE prefix off each resolved URL and checks
 * `existsSync` on disk — so it can never detect "the router resolved to the
 * REAL (wrong, unpublished) origin instead of the intended one", because it
 * never performs a network fetch at all. That is exactly the bug the tester's
 * final zero-interception Rule-0 pass found: `engineRouter({mode:'cdn'})` had
 * no override hook, so a pre-publish local-CDN-mirror could redirect the
 * artifact shell's ONE import-map entry but NOTHING downstream of it — every
 * other script (~30 URLs: chroma, wasm-engine/wasm-load-browser, every
 * RENDERER + GAME script) silently fell through to the real, unpublished
 * jsdelivr CDN and 404'd on script #1.
 *
 * This test is the cheap, repeatable, `make verify`-swept form of that Rule-0
 * check:
 *   1. Serves the ALREADY-BUILT `sdk/frqtl-sdk/dist/` at the EXACT jsdelivr
 *      path shape (`/npm/@descix/frqtl-sdk@<CDN_SDK_VERSION>/...`) on an
 *      ephemeral localhost port — a lightweight in-process static server over
 *      the SAME URL space the full npm-pack-based harness
 *      (`sdk/frqtl-sdk/scripts/serve-local-cdn-mirror.mjs`) serves. This test
 *      skips the `npm pack`/`tar` round-trip for speed — it exists to prove
 *      the ROUTER's base-override wiring (`engineRouter({mode:'cdn', base})`),
 *      not npm's `files` allowlist (that is `verify:publish-surface`'s job,
 *      and the harness script's own npm-pack fidelity).
 *   2. Builds `engineRouter({mode:'cdn', base: mirrorBase})` and calls
 *      `buildScriptLists()` from the BUILT `dist/esm/index.js` — the SAME
 *      function `bootDoubleSlit` actually calls, never a re-typed parallel
 *      list (the exact class of drift that caused the ObjectFactory/Experiment
 *      and compat/providers/ bugs on this branch).
 *   3. ACTUALLY FETCHES every URL over real HTTP, asserting 200 AND that its
 *      origin equals the mirror's own origin — NEVER `cdn.jsdelivr.net` — the
 *      exact wrong-origin bug this test exists to catch (a syntactically-valid
 *      URL pointed at the wrong host is invisible to a disk-existence check).
 *
 * Skips gracefully if `dist/` isn't built (same convention as router.test.mjs).
 * Run: node --test lib/shim/engine/test/artifact-mirror-http.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, createReadStream } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import http from 'node:http';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// lib/shim/engine/test → repo root is four levels up.
const ROOT = path.resolve(__dirname, '../../../..');
const distDir = path.join(ROOT, 'sdk/frqtl-sdk/dist');

const MIME = {
    '.js': 'application/javascript', '.mjs': 'application/javascript',
    '.wasm': 'application/wasm', '.html': 'text/html', '.css': 'text/css',
    '.json': 'application/json'
};

/** Serve `distDir` at `<routePrefix>/dist/...` on an ephemeral localhost port. */
function startDistMirror(routePrefix) {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            let url;
            try { url = new URL(req.url, 'http://127.0.0.1'); }
            catch (e) { res.writeHead(400); res.end(); return; }
            const prefix = routePrefix + '/dist/';
            if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
            const rel = url.pathname.slice(prefix.length);
            const filePath = path.join(distDir, rel);
            if (!filePath.startsWith(distDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
                res.writeHead(404); res.end(); return;
            }
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
            createReadStream(filePath).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

test('every buildScriptLists({base: mirrorBase}) URL is FETCHABLE over real HTTP through a ' +
     'local mirror, and NONE resolve to the real CDN (skips if dist/ absent)', async () => {
    const esmEntryPath = path.join(distDir, 'esm/index.js');
    if (!existsSync(esmEntryPath)) {
        console.log('[artifact-mirror-http.test] SKIP — sdk/frqtl-sdk/dist/esm/index.js not built');
        return;
    }

    const { engineRouter, CDN_BASE } = await import(pathToFileURL(path.join(ROOT, 'lib/shim/engine/router.js')).href);
    const { buildScriptLists } = await import(pathToFileURL(esmEntryPath).href);

    // Derive the jsdelivr route prefix ('/npm/@descix/frqtl-sdk@<ver>') from
    // CDN_BASE itself — never a second hardcoded package-name/version literal.
    const CDN_ORIGIN = 'https://cdn.jsdelivr.net';
    assert.ok(CDN_BASE.startsWith(CDN_ORIGIN + '/') && CDN_BASE.endsWith('/dist'),
        `unexpected CDN_BASE shape: ${CDN_BASE}`);
    const routePrefix = CDN_BASE.slice(CDN_ORIGIN.length, -'/dist'.length);

    const server = await startDistMirror(routePrefix);
    try {
        const port = server.address().port;
        const mirrorOrigin = `http://127.0.0.1:${port}`;
        const mirrorBase = mirrorOrigin + routePrefix + '/dist';

        const router = engineRouter({ mode: 'cdn', base: mirrorBase });
        const lists = buildScriptLists(router);

        const urls = [];
        for (const seq of ['ENGINE', 'RENDERER', 'GAME']) {
            for (const { src } of lists[seq]) { urls.push({ seq, src }); }
        }
        // The other three surfaces the shell/entry touch outside buildScriptLists
        // (p5, the WASM package, and the ESM entry itself — the import-map target).
        urls.push({ seq: 'P5', src: router.p5Src() });
        urls.push({ seq: 'WASM_PKG', src: router.wasmPkgUrl });
        urls.push({ seq: 'ESM_ENTRY', src: mirrorBase + '/esm/index.js' });

        assert.ok(urls.length >= 30, `sanity: expected ~30+ injected URLs, got ${urls.length}`);

        const offOrigin = [];
        const failed = [];
        for (const { seq, src } of urls) {
            let origin;
            try { origin = new URL(src).origin; } catch (e) { offOrigin.push(`${seq}: unparseable ${src}`); continue; }
            if (origin !== mirrorOrigin) {
                // THE bug this test exists to catch: a resolved URL escaping to the
                // real (unpublished) CDN instead of the supplied mirror base.
                offOrigin.push(`${seq}: ${src} (origin ${origin}, expected ${mirrorOrigin})`);
                continue;
            }
            const res = await fetch(src);
            if (res.status !== 200) {
                failed.push(`${seq}: ${src} → HTTP ${res.status}`);
            }
        }

        assert.deepEqual(offOrigin, [],
            'These URLs resolved to an origin OTHER than the mirror (would 404 against a real ' +
            'unpublished CDN, exactly the bug this test exists to catch):\n' +
            offOrigin.map((m) => '  ' + m).join('\n'));
        assert.deepEqual(failed, [],
            'These mirror-origin URLs did not fetch 200 over real HTTP:\n' +
            failed.map((m) => '  ' + m).join('\n'));
    } finally {
        // closeAllConnections() force-closes any keep-alive sockets undici's
        // fetch() left open — without it, node --test's PROCESS lingers for the
        // default keep-alive timeout (observed: ~100s) even though the test
        // itself reports done in milliseconds (Node 18.2+; well within this
        // repo's Node baseline).
        server.closeAllConnections();
        server.close();
    }
});
