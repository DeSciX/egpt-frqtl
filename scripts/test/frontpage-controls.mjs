#!/usr/bin/env node
// Controls for scripts/test/frontpage.mjs (static): the gate runs against fabricated front pages
// over the SERVED registries of <site> (default: this repo's site/), never against FRAQTL's tree.
// Exit 0 only when every row gets its expected verdict: the faithful page PASSES, every planted
// fault FAILS naming itself.
//
//   node scripts/test/frontpage-controls.mjs [--site <dir>]
//
// Fixture sites: scripts/test/lib/frontpage-fixture.mjs.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { frontpageFixture } from './lib/frontpage-fixture.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, 'frontpage.mjs');
const siteArg = process.argv.indexOf('--site');
const SITE = resolve(siteArg === -1 ? join(HERE, '..', '..', 'site') : process.argv[siteArg + 1]);
const fx = await frontpageFixture(SITE);
const { X, stillOf, gymHref } = fx;

const SCRATCH = mkdtempSync(join(tmpdir(), 'frontpage-controls-'));
let FAIL = 0;
function run(name, mutate, expect) {
  const site = fx.build(join(SCRATCH, name), mutate);
  const r = spawnSync(process.execPath, ['--no-warnings', GATE, '--site', site], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = expect === 'PASS' ? r.status === 0 : (r.status === 1 && out.includes(expect));
  if (ok) console.log('PASS  ' + name + (expect === 'PASS' ? ' (gate exit 0)' : ' (gate RED: ' + out.split('\n').find((l) => l.includes(expect)).trim().slice(0, 200) + ')'));
  else { FAIL = 1; console.log('FAIL  ' + name + ': gate exit ' + r.status + ', want ' + (expect === 'PASS' ? '0' : 'RED naming "' + expect + '"') + '\n' + out); }
}

try {
  const [r0, r1, r2, r3, r4] = X.EXHIBITS;
  run('faithful-page', (t) => t, 'PASS');
  run('faithful-page-one-dark-tile', (t) => { t[1] = Object.assign({}, t[1], { img: null, dark: true }); return t; }, 'PASS');
  run('studio-preset-tile', (t) => { t[0].href = t[0].href.replace('preset=compare', 'preset=author'); return t; }, 'preset=author, not compare');
  run('player-href-tile', (t) => { t[1].href = 'pub/index.html?rung=' + r1.id; return t; }, 'is not the GYM');
  run('wrong-href-key', (t) => { t[2].href = 'app.html?preset=compare&rung=' + r2.id; return t; }, 'keys {preset,rung}');
  run('unknown-id', (t) => { t[3].href = 'app.html?preset=compare&walkthrough=no-such-rung'; return t; }, 'walkthrough=no-such-rung, roster id ' + r3.id);
  const m = X.EXHIBITS.findIndex((r) => r.mode);
  if (m >= 0) run('mode-dropped', (t) => { t[m].href = gymHref(Object.assign({}, X.EXHIBITS[m], { mode: null })); return t; }, 'want {mode,preset,walkthrough}');
  run('zero-tiles', () => [], '0 #proof tiles, the served roster has ' + X.EXHIBITS.length);
  run('absolute-self-link', (t) => { t[0].href = 'https://egpt-frqtl.descix.net/' + t[0].href; return t; }, 'is an absolute self-link');
  run('dropped-row', (t) => { t.splice(4, 1); return t; }, (X.EXHIBITS.length - 1) + ' #proof tiles, the served roster has ' + X.EXHIBITS.length);
  run('reordered-pair', (t) => { [t[0], t[1]] = [t[1], t[0]]; return t; }, 'title "' + r1.title + '" ≠ roster "' + r0.title + '"');
  run('undeclared-image', (t) => { t[4].img = 'images/' + r4.id + '.jpg'; return t; }, 'is not the row\'s still');
  run('image-not-in-site', (t, site) => { rmSync(join(site, stillOf(r4))); return t; }, 'is not in ');
  run('dark-tile-with-image', (t) => { t[1].dark = true; return t; }, '.dark tile carries an image');
} finally {
  rmSync(SCRATCH, { recursive: true, force: true });
}
process.exit(FAIL);
