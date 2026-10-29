#!/usr/bin/env node
// Controls for scripts/test/frontpage.mjs (static): the gate runs against fabricated front pages
// over this repo's roster and the bundle of <site> (default: this repo's site/).
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
const { R, roster, cards, stillOf } = fx;
const ORIGIN = roster.showcase.siteOrigin;

const SCRATCH = mkdtempSync(join(tmpdir(), 'frontpage-controls-'));
let FAIL = 0;
function run(name, mutate, expect, opts) {
  const site = fx.build(join(SCRATCH, name), mutate, opts);
  const r = spawnSync(process.execPath, ['--no-warnings', GATE, '--site', site, ...((opts && opts.args) || [])], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = expect === 'PASS' ? r.status === 0 : (r.status === 1 && out.includes(expect));
  if (ok) console.log('PASS  ' + name + (expect === 'PASS' ? ' (gate exit 0)' : ' (gate RED: ' + out.split('\n').find((l) => l.includes(expect)).trim().slice(0, 200) + ')'));
  else { FAIL = 1; console.log('FAIL  ' + name + ': gate exit ' + r.status + ', want ' + (expect === 'PASS' ? '0' : 'RED naming "' + expect + '"') + '\n' + out); }
}

try {
  const [r0, r1, r2, r3, r4] = cards;
  run('faithful-page', (t) => t, 'PASS');
  run('faithful-page-one-dark-tile', (t) => { t[1] = Object.assign({}, t[1], { img: null, dark: true }); return t; }, 'PASS');
  const hrefOf = (i) => R.showcaseHref(roster, cards[i]);
  const urlOf = (i) => R.showcaseUrl(roster, cards[i]);
  // A planted GYM link (the deleted tile shape): the same rung, preset=compare.
  const gym = (h) => h.replace('preset=author', 'preset=compare');
  if (gym(hrefOf(0)) === hrefOf(0)) throw new Error('showcaseHref(row) carries no preset=author to plant a GYM link into: ' + hrefOf(0));
  run('gym-href-tile', (t) => { t[0].href = gym(t[0].href); return t; }, 'href ' + gym(hrefOf(0)) + ' ≠ showcaseHref(roster, card) ' + hrefOf(0));
  run('player-href-tile', (t) => { t[1].href = 'pub/index.html?rung=' + r1.id; return t; }, '≠ showcaseHref(roster, card) ' + hrefOf(1));
  run('wrong-href-key', (t) => { t[2].href = t[2].href.replace('walkthrough=', 'rung='); return t; }, '≠ showcaseHref(roster, card) ' + hrefOf(2));
  run('unknown-id', (t) => { t[3].href = t[3].href.replace('walkthrough=' + r3.id, 'walkthrough=no-such-rung'); return t; }, '≠ showcaseHref(roster, card) ' + hrefOf(3));
  const m = cards.findIndex((r) => r.mode !== null);
  if (m < 0) throw new Error('the roster has no card carrying a mode — the mode-dropped control needs one');
  run('mode-dropped', (t) => { t[m].href = t[m].href.replace(/&mode=[^&]*/, ''); return t; }, '≠ showcaseHref(roster, card) ' + hrefOf(m));
  run('zero-tiles', () => [], '0 #proof tiles, the roster showcase has ' + cards.length);
  // The self_host rule. This site is the showcase site: its tiles link relatively.
  run('absolute-self-link', (t) => { t[0].href = urlOf(0); return t; }, 'an absolute self-link');
  // A page served from another origin links absolute on roster.showcase.siteOrigin.
  const OTHER = { args: ['--origin', 'https://other.example'] };
  const absolute = (t) => t.map((x, i) => Object.assign(x, { href: urlOf(i) }));
  run('other-origin-absolute-page', absolute, 'PASS', OTHER);
  run('other-origin-relative-tile', (t) => t, 'a relative link on a page served from https://other.example', OTHER);
  // Origin drift: an absolute tile on any origin but roster.showcase.siteOrigin.
  const drift = (h) => h.replace(ORIGIN + '/', 'https://frqtl.com/');
  run('other-origin-drift', (t) => { absolute(t); t[0].href = drift(t[0].href); return t; }, 'href ' + drift(urlOf(0)) + ' ≠ showcaseUrl(roster, card)', OTHER);

  run('dropped-row', (t) => { t.splice(4, 1); return t; }, (cards.length - 1) + ' #proof tiles, the roster showcase has ' + cards.length);
  run('reordered-pair', (t) => { [t[0], t[1]] = [t[1], t[0]]; return t; }, 'title "' + r1.title + '" ≠ roster "' + r0.title + '"');
  run('undeclared-image', (t) => { t[4].img = 'images/' + r4.id + '.jpg'; return t; }, 'is not the card\'s still');
  run('image-not-in-site', (t, site) => { rmSync(join(site, stillOf(r4))); return t; }, 'is not in ');
  // A dark tile's card still declares a still: the still must exist even when no tile shows it.
  run('dark-tile-still-missing', (t, site) => { t[4] = Object.assign({}, t[4], { img: null, dark: true }); rmSync(join(site, stillOf(r4))); return t; }, 'still ' + r4.id);
  run('dark-tile-with-image', (t) => { t[1].dark = true; return t; }, '.dark tile carries an image');
  run('tile-line-is-card-what', (t) => { t[0].tile = r0.what; return t; }, '≠ roster tile "');
  run('mutated-alt', (t) => { t[2].alt = t[2].alt + ' (edited)'; return t; }, '≠ roster still.alt "');
  run('alt-is-title', (t) => { t[3].alt = t[3].title; return t; }, '≠ roster still.alt "');
  const through = roster.showcase.throughLine.join('');
  run('mutated-through-line', (t) => t, '≠ the roster showcase.throughLine', { throughLine: through.replace('fractal', 'factual') });
  run('empty-through-line', (t) => t, '≠ the roster showcase.throughLine', { throughLine: '' });
  run('no-through-line', (t) => t, '0 [data-showcase-throughline] elements in #proof', { throughLine: null });
} finally {
  rmSync(SCRATCH, { recursive: true, force: true });
}
process.exit(FAIL);
