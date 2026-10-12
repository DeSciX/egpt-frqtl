#!/usr/bin/env node
// Controls for scripts/test/frontpage-tiles.mjs (executing): the gate follows fabricated front pages
// over the real bundle of <site> (default: this repo's site/). Exit 0 only when every row gets its
// expected verdict: the faithful page (every roster row as its GYM link) PASSES; an id the registry
// lacks, a STUDIO tile, and an app.html without its <link rel="home"> each FAIL naming the fault.
//
//   node scripts/test/frontpage-tiles-controls.mjs --port <n> [--site <dir>]
//
// Each row runs the gate once on <port> (it binds and releases it). Fixture sites:
// scripts/test/lib/frontpage-fixture.mjs.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { frontpageFixture } from './lib/frontpage-fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, 'frontpage-tiles.mjs');
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };
const port = Number(arg('--port'));
if (!Number.isInteger(port) || port <= 0) { console.error('ERROR: usage: node scripts/test/frontpage-tiles-controls.mjs --port <n> [--site <dir>]'); process.exit(2); }
const SITE = resolve(arg('--site') || join(HERE, '..', '..', 'site'));
const fx = await frontpageFixture(SITE);
const HOME_LINK = /<link\b[^>]*\brel="home"[^>]*>/;
if (!HOME_LINK.test(fx.appHtml)) throw new Error(join(SITE, 'app.html') + ' declares no <link rel="home"> — nothing to strip for the brand control');

const SCRATCH = mkdtempSync(join(tmpdir(), 'frontpage-tiles-controls-'));
let FAIL = 0;
function run(name, mutate, expect, opts) {
  const site = fx.build(join(SCRATCH, name), mutate, opts);
  const r = spawnSync(process.execPath, [GATE, '--port', String(port), '--site', site], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = expect === 'PASS' ? r.status === 0 : (r.status === 1 && out.includes(expect));
  if (ok) console.log('PASS  ' + name + (expect === 'PASS' ? ' (gate exit 0)' : ' (gate RED: ' + out.split('\n').find((l) => l.includes(expect)).trim().slice(0, 240) + ')'));
  else { FAIL = 1; console.log('FAIL  ' + name + ': gate exit ' + r.status + ', want ' + (expect === 'PASS' ? '0' : 'RED naming "' + expect + '"') + '\n' + out); }
}

try {
  const first = fx.faithful()[0];
  run('faithful-page', (t) => t, 'PASS');
  run('unknown-id', () => [Object.assign({}, first, { href: 'app.html?preset=compare&walkthrough=no-such-rung' })],
    'GYM error banner: Deep link error: unknown walkthrough "no-such-rung"');
  run('studio-tile', () => [Object.assign({}, first, { href: first.href.replace('preset=compare', 'preset=author') })],
    'did not land on the GYM');
  run('home-link-removed', () => [first], 'not a home link', { appHtml: fx.appHtml.replace(HOME_LINK, '') });
} finally {
  rmSync(SCRATCH, { recursive: true, force: true });
}
process.exit(FAIL);
