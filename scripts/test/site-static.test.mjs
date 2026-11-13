// Controls for scripts/test/site-static.mjs: the assembled site passes; each plant, in a copy of site/, is refused.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ROSTER_HREF } from '../lib/scenes.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = join(REPO, 'scripts', 'test', 'site-static.mjs');
const run = (site) => { const r = spawnSync(process.execPath, [GATE, ...(site ? ['--site', site] : [])], { encoding: 'utf8' }); return { rc: r.status, out: r.stdout + r.stderr }; };

function planted(plant) {
    const dir = mkdtempSync(join(tmpdir(), 'site-static-'));
    const site = join(dir, 'site');
    cpSync(join(REPO, 'site'), site, { recursive: true });
    plant(site);
    return { site, done: () => rmSync(dir, { recursive: true, force: true }) };
}
const editApp = (site, f) => writeFileSync(join(site, 'app.html'), f(readFileSync(join(site, 'app.html'), 'utf8')));

test('the assembled site passes', () => {
    const r = run(null);
    assert.equal(r.rc, 0, r.out);
});

const cases = [
    ['a relative roster link', (s) => editApp(s, (h) => h.replace('href="' + ROSTER_HREF + '"', 'href="/assets/scenes/roster.json"')), 'is relative'],
    ['no roster link', (s) => editApp(s, (h) => h.replace(/\s*<link rel="frqtl-roster"[^>]*>/, '')), 'carries 0 roster links'],
    ['a second roster link', (s) => editApp(s, (h) => h.replace('</head>', '<link rel="frqtl-roster" href="' + ROSTER_HREF + '"></head>')), 'carries 2 roster links'],
    ['another absolute roster', (s) => editApp(s, (h) => h.replace(ROSTER_HREF, 'https://other.example/assets/scenes/roster.json')), '≠ ROSTER_HREF'],
    ['a scenes directory in the site', (s) => { mkdirSync(join(s, 'pub', 'scenes')); writeFileSync(join(s, 'pub', 'scenes', 'x.js'), '//'); }, 'the site holds pub/scenes'],
    ['a roster.json in the site', (s) => writeFileSync(join(s, 'roster.json'), '{}'), 'the site holds roster.json'],
    ['a missing host-provided file', (s) => rmSync(join(s, 'DeSciXAppSDK.js')), 'DeSciXAppSDK.js is missing'],
];
for (const [name, plant, want] of cases) {
    test(name + ' is refused', () => {
        const p = planted(plant);
        try {
            const r = run(p.site);
            assert.equal(r.rc, 1, r.out);
            assert.ok(r.out.includes(want), r.out);
        } finally { p.done(); }
    });
}
