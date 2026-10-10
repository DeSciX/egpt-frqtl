/* Copyright 2023-2026 by Essam Abadir */

/**
 * experiment-frame.test.mjs — the FALSE-200 gate.
 *
 * Reproduces, as a unit, the exact failure observed on the site landing page on
 * 2026-07-28: `GET /frqtl/experiments/<retired-id>/index.html` returned HTTP 200
 * `text/html` (vite's SPA fallback serving the SITE'S OWN index.html), the hero
 * iframe embedded the site inside itself, and every automated signal stayed
 * clean (0 4xx/5xx, 0 requestfailed, 0 pageerror).
 *
 * The assertions below are driven off the EXPORTED contract
 * (`EXPERIMENT_PAGE_MARKERS`, `HOST_SHELL_ROOT_SELECTOR`, `FRAME_VERDICTS`) —
 * never a hand-typed marker list, so adding a marker to the contract cannot
 * leave this gate testing a stale one.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    EXPERIMENT_PAGE_MARKERS,
    HOST_SHELL_ROOT_SELECTOR,
    FRAME_VERDICTS,
    DEFAULT_FRAME_TIMEOUT_MS,
    classifyFrameProbe,
} from '../index.js';

const REQUESTED = 'http://localhost:5611/frqtl/experiments/double-slit/index.html?engine=wasm';

/** A real canonical experiment page: every boot marker, no host shell root. */
const experimentPageProbe = (over = {}) => ({
    src: REQUESTED,
    href: REQUESTED,
    sameOrigin: true,
    readyState: 'complete',
    markers: [...EXPERIMENT_PAGE_MARKERS],
    hasHostShellRoot: false,
    elapsedMs: 300,
    ...over,
});

/**
 * THE OBSERVED FAILURE: the SPA fallback answered 200 with the host's own
 * index.html. It has the React root and ZERO experiment-page boot markers.
 */
const spaShellProbe = (over = {}) => ({
    src: REQUESTED,
    href: REQUESTED,               // the URL is unchanged — the STATUS lied, not the URL
    sameOrigin: true,
    readyState: 'complete',
    markers: [],
    hasHostShellRoot: true,
    elapsedMs: 300,
    ...over,
});

test('contract: markers are a non-empty frozen list and the shell selector is declared', () => {
    assert.ok(Object.isFrozen(EXPERIMENT_PAGE_MARKERS));
    assert.ok(EXPERIMENT_PAGE_MARKERS.length > 0);
    assert.equal(typeof HOST_SHELL_ROOT_SELECTOR, 'string');
    assert.ok(HOST_SHELL_ROOT_SELECTOR.length > 0);
    assert.ok(Object.isFrozen(FRAME_VERDICTS));
});

test('a real experiment page passes', () => {
    const r = classifyFrameProbe(experimentPageProbe());
    assert.equal(r.verdict, FRAME_VERDICTS.OK);
    assert.equal(r.ok, true);
    assert.equal(r.done, true);
});

test('THE FALSE-200: an HTTP-200 SPA shell is caught, named, and NOT waited out', () => {
    const r = classifyFrameProbe(spaShellProbe());
    assert.equal(r.verdict, FRAME_VERDICTS.SPA_SHELL, 'the impostor is identified by name');
    assert.equal(r.ok, false);
    assert.equal(r.done, true, 'a shell document fails IMMEDIATELY — it never burns the timeout');
    assert.match(r.message, /FALSE-200/);
    assert.match(r.message, /embedding ITSELF/);
    assert.ok(r.message.includes(REQUESTED), 'the message names the URL that was requested');
    assert.ok(r.message.includes(HOST_SHELL_ROOT_SELECTOR), 'and the evidence it used');
});

test('the 200 cannot fool it: status is never consulted — only the loaded document', () => {
    // The probe carries NO status field at all. Same URL, same 200, same
    // readyState as the passing case; ONLY the document differs.
    const ok   = classifyFrameProbe(experimentPageProbe());
    const bad  = classifyFrameProbe(spaShellProbe());
    assert.equal(ok.ok, true);
    assert.equal(bad.ok, false);
    assert.equal(ok.verdict !== bad.verdict, true);
});

test('a shell that somehow lacks #root STILL fails on the missing boot markers', () => {
    const r = classifyFrameProbe(spaShellProbe({ hasHostShellRoot: false }));
    assert.equal(r.verdict, FRAME_VERDICTS.NOT_EXPERIMENT);
    assert.equal(r.done, true);
    for (const m of EXPERIMENT_PAGE_MARKERS) {
        assert.ok(r.message.includes(m), `the message lists the missing marker ${m}`);
    }
});

test('a PARTIAL marker set is not enough (every marker must be present)', () => {
    const r = classifyFrameProbe(experimentPageProbe({
        markers: EXPERIMENT_PAGE_MARKERS.slice(0, EXPERIMENT_PAGE_MARKERS.length - 1),
    }));
    assert.equal(r.ok, false);
    assert.equal(r.verdict, FRAME_VERDICTS.NOT_EXPERIMENT);
});

test('a still-booting page is PENDING, not a failure (no false alarm on a slow WASM fetch)', () => {
    const r = classifyFrameProbe(experimentPageProbe({
        readyState: 'loading', markers: [], elapsedMs: 200,
    }));
    assert.equal(r.verdict, FRAME_VERDICTS.PENDING);
    assert.equal(r.done, false);
});

test('about:blank between src assignments is PENDING, never a failure', () => {
    const r = classifyFrameProbe(experimentPageProbe({
        href: 'about:blank', readyState: 'complete', markers: [], elapsedMs: 50,
    }));
    assert.equal(r.verdict, FRAME_VERDICTS.PENDING);
    assert.equal(r.done, false);
});

test('a page that never boots eventually fails on the timeout', () => {
    const r = classifyFrameProbe(experimentPageProbe({
        readyState: 'loading', markers: [], elapsedMs: DEFAULT_FRAME_TIMEOUT_MS + 1,
    }));
    assert.equal(r.verdict, FRAME_VERDICTS.NOT_EXPERIMENT);
    assert.equal(r.done, true);
});

test('a cross-origin frame fails loud rather than being trusted', () => {
    const r = classifyFrameProbe({ src: REQUESTED, sameOrigin: false });
    assert.equal(r.verdict, FRAME_VERDICTS.CROSS_ORIGIN);
    assert.equal(r.done, true);
});

// ── The anti-drift gate: the markers must be REAL ────────────────────────────
// The guard is only as good as its positive proof. If stack-boot.js renamed one
// of these globals, the guard would start failing every real experiment page —
// so the contract is asserted against the producer's own source.
test('every declared marker is actually installed by _shared/stack-boot.js', () => {
    const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
    const stackBoot = fs.readFileSync(
        path.join(repoRoot, 'lib/frqtl/experiments/_shared/stack-boot.js'), 'utf8');
    for (const marker of EXPERIMENT_PAGE_MARKERS) {
        assert.match(stackBoot, new RegExp('window\\.' + marker + '\\s*='),
            `stack-boot.js must assign window.${marker} — the guard's positive proof depends on it`);
    }
});

test('the host SPA shells really do carry the declared shell root selector', () => {
    const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');
    const id = HOST_SHELL_ROOT_SELECTOR.replace(/^#/, '');
    for (const shell of ['apps/frqtl_site/index.html', 'apps/ide/index.html']) {
        const html = fs.readFileSync(path.join(repoRoot, shell), 'utf8');
        assert.match(html, new RegExp('id="' + id + '"'),
            `${shell} must carry id="${id}" — the guard identifies the SPA fallback by it`);
    }
});

test('every failure message is prefixed and names the requested URL', () => {
    for (const probe of [spaShellProbe(), spaShellProbe({ hasHostShellRoot: false }),
                         { src: REQUESTED, sameOrigin: false }]) {
        const r = classifyFrameProbe(probe);
        assert.match(r.message, /^\[experiment-frame\]/);
        assert.ok(r.message.includes(REQUESTED));
    }
});
