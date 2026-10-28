#!/usr/bin/env node
// Static gate for the published front page, <site>/index.html. Exit 0 only when every check passes.
//
//   node scripts/test/frontpage.mjs [--site <dir>]        (default: this repo's site/)
//
// The tiles are the SERVED showcase roster: EXHIBITS from <site>/pub/<build>/shim/registry/exhibits.js,
// <build> = the data-frqtl-site-build stamp on <site>/app.html (the bytes the refresh published).
// Never FRAQTL's tree.
//
// Checks:
//   order  — section#proof (the cards) is the first element after the nav, above the hero.
//   lede   — the #proof lede is the CEO-approved paragraph, exactly.
//   tiles  — the #proof tiles are EXHIBITS, one per row, in roster order:
//              title (<b>) and sentence (<span>) are the row's `title` and `tile`;
//              href is a RELATIVE GYM deep link (an absolute link to this site's own origin is
//              refused as a self-link) — app.html?preset=compare&walkthrough=<id>[&mode=<m>] (mode iff
//              the row names one) — with exactly those keys, the id resolving in the served
//              walk-through registry; a row of any kind but 'rung' fails;
//              the call to action is "Open live ↗";
//              a tile carries an <img> iff it is not .dark, and the img is images/<sceneKey>.png
//              (exhibits.js sceneKey of the row), present in <site>/images/, its alt the row's
//              `still.alt`.
//   through-line — #proof holds exactly one [data-showcase-throughline] element, after the grid, and
//              its text is the served SHOWCASE_THROUGH_LINE.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { servedRegistries } from './lib/served-roster.mjs';
import { proofSection, proofLinks, throughLines, isTile, text } from './lib/proof-tiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const siteArg = process.argv.indexOf('--site');
const SITE = resolve(siteArg === -1 ? join(ROOT, 'site') : process.argv[siteArg + 1]);
const APP_PAGE = 'app.html';
const GYM_PRESET = 'compare';
const CTA = 'Open live ↗';
// This site's own origin: a tile on its own front page links the GYM relatively; the generator's
// self_host rule writes the absolute form only for OTHER sites' pages.
const SELF_ORIGIN = 'https://egpt-frqtl.descix.net';

const html = readFileSync(join(SITE, 'index.html'), 'utf8');
let FAIL = 0;
const pass = (n) => console.log('PASS  ' + n);
const fail = (n, why) => { console.log('FAIL  ' + n + ': ' + why); FAIL = 1; };

// ── order ────────────────────────────────────────────────────────────────────
{
  const navEnd = html.indexOf('</nav>');
  const after = navEnd < 0 ? '' : html.slice(navEnd + '</nav>'.length);
  const first = after.match(/<(section|header|main|div)\b[^>]*>/);
  if (navEnd < 0) fail('order', 'no </nav> in ' + join(SITE, 'index.html'));
  else if (!first || !/\bid="proof"/.test(first[0]) || first[1] !== 'section')
    fail('order', 'first element after </nav> is ' + (first ? first[0] : '(none)') + ', not <section id="proof">');
  else pass('order: section#proof is the first element after the nav');
}

const proofBody = proofSection(html);
const proof = proofBody || '';
if (proofBody === null) fail('proof', 'no <section id="proof"> in ' + join(SITE, 'index.html'));

// ── lede ─────────────────────────────────────────────────────────────────────
{
  // The author's paragraph, verbatim from EGPT 64a728f site-src/frontpage/egpt-frqtl.json.
  const LEDE = 'FRQTL is an actual quantum computer that is so efficient it runs in an iPhone. ' +
    'The double-slit experiment, or DSE, is what Richard Feynman called the ‘only mystery’ and ' +
    '‘absolutely impossible.’ In 1981 Feynman birthed the idea of what the world now calls ‘qubit’ ' +
    'based quantum computing but FRQTL takes a different approach. FRQTL uses a Monte Carlo ' +
    'method-like approach based on the work of Stanislaw Ulam and John von Neumann, Feynman\'s ' +
    'collaborators on the Super at the Manhattan Project. The Ulam and von Neumann approach was ' +
    'continued by Gian-Carlo Rota at Los Alamos National Laboratory and later pursued at Brookhaven ' +
    'National Laboratory Quantum Chromodynamics (QCD) and other governmental super-computing projects.';
  const m = proof.match(/<div class="sec-head">[\s\S]*?<p class="lede">([\s\S]*?)<\/p>/);
  const got = m ? text(m[1]) : '(no lede)';
  if (got === LEDE) pass('lede: the #proof lede is the approved paragraph');
  else fail('lede', 'got "' + got + '"');
}

// ── tiles ────────────────────────────────────────────────────────────────────
{
  const { X, W } = await servedRegistries(SITE);

  const links = proofLinks(html);
  for (const t of links.filter((l) => !isTile(l))) fail('tiles', 'a link in #proof that is not a tile: ' + t.href);
  const grid = links.filter(isTile);
  if (grid.length !== X.EXHIBITS.length) {
    fail('tiles', grid.length + ' #proof tiles, the served roster has ' + X.EXHIBITS.length + ' rows (' +
      X.EXHIBITS.map((r) => r.id).join(', ') + ')');
  }

  const n = Math.max(grid.length, X.EXHIBITS.length);
  for (let i = 0; i < n; i++) {
    const row = X.EXHIBITS[i];
    const t = grid[i];
    const name = 'tile ' + (i + 1) + ' ' + (row ? row.kind + ':' + row.id + (row.mode ? '/' + row.mode : '') : '(no roster row)');
    if (!row) { fail(name, 'extra tile "' + t.title + '" → ' + t.href); continue; }
    if (!t) { fail(name, 'missing — the roster row "' + row.title + '" has no tile'); continue; }
    const why = [];
    if (t.title !== row.title) why.push('title "' + t.title + '" ≠ roster "' + row.title + '"');
    if (t.tile !== row.tile) why.push('sentence "' + t.tile + '" ≠ roster tile "' + row.tile + '"');
    if (t.cta !== CTA) why.push('call to action "' + t.cta + '" ≠ "' + CTA + '"');

    // href: the GYM deep link of this row, nothing else.
    const href = t.href || '';
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href)) {
      why.push(new URL(href, SELF_ORIGIN + '/').origin === SELF_ORIGIN
        ? 'href ' + href + ' is an absolute self-link — this site\'s own page links its GYM relatively (' + APP_PAGE + '?preset=' + GYM_PRESET + '…)'
        : 'href ' + href + ' leaves this site — a tile opens this site\'s GYM (' + APP_PAGE + '?preset=' + GYM_PRESET + '…)');
      fail(name, why.join('; '));
      continue;
    }
    const [path, query = ''] = href.split('?');
    const q = new URLSearchParams(query);
    const keys = [...q.keys()].sort().join(',');
    if (path !== APP_PAGE) why.push('href ' + t.href + ' is not the GYM (' + APP_PAGE + '?preset=' + GYM_PRESET + '…)');
    else if (q.get('preset') !== GYM_PRESET) why.push('href ' + t.href + ' preset=' + q.get('preset') + ', not ' + GYM_PRESET);
    else if (row.kind === 'rung') {
      const want = row.mode ? 'mode,preset,walkthrough' : 'preset,walkthrough';
      if (keys !== want) why.push('href ' + t.href + ' keys {' + keys + '}, want {' + want + '}');
      else if (q.get('walkthrough') !== row.id) why.push('href walkthrough=' + q.get('walkthrough') + ', roster id ' + row.id);
      else if (row.mode && q.get('mode') !== row.mode) why.push('href mode=' + q.get('mode') + ', roster mode ' + row.mode);
      else {
        const rung = W.walkthroughById(q.get('walkthrough'));
        if (!rung) why.push('walkthrough "' + q.get('walkthrough') + '" is not in the served walkthrough registry');
        else if (q.has('mode') && !W.walkthroughModes(rung).map((m) => m.id).includes(q.get('mode'))) {
          why.push('mode "' + q.get('mode') + '" is not declared by ' + rung.id);
        }
      }
    } else {
      why.push('roster row kind "' + row.kind + '" — a tile is a walk-through rung (?walkthrough=<id>)');
    }

    // image: .dark iff no image; the image is the row's still.
    const dark = t.classes.includes('dark');
    const still = 'images/' + X.sceneKey({ kind: row.kind, id: row.id, modeId: row.mode }) + '.png';
    if (dark && t.img) why.push('.dark tile carries an image ' + t.img);
    else if (!dark && !t.img) why.push('tile has no image and is not .dark');
    else if (t.img && t.img !== still) why.push('image ' + t.img + ' is not the row\'s still ' + still);
    else if (t.img && !existsSync(join(SITE, t.img))) why.push('image ' + t.img + ' is not in ' + join(SITE, 'images'));
    if (t.img && (!row.still || t.alt !== row.still.alt)) {
      why.push('alt "' + t.alt + '" ≠ roster still.alt "' + (row.still ? row.still.alt : '(row declares no still)') + '"');
    }

    if (why.length) fail(name, why.join('; '));
    else pass(name + ' → ' + t.href + (t.img ? ' [' + t.img + ']' : ' [.dark]'));
  }
}

// ── through-line ─────────────────────────────────────────────────────────────
{
  const { X } = await servedRegistries(SITE);
  const want = Array.isArray(X.SHOWCASE_THROUGH_LINE) ? X.SHOWCASE_THROUGH_LINE.join('') : null;
  const got = throughLines(html);
  const gridAt = proof.indexOf('data-exhibits'), markAt = proof.indexOf('data-showcase-throughline');
  if (want === null) fail('through-line', 'the served roster exports no SHOWCASE_THROUGH_LINE');
  else if (got.length !== 1) fail('through-line', got.length + ' [data-showcase-throughline] elements in #proof, want exactly 1');
  else if (got[0] !== text(want)) fail('through-line', '"' + got[0].slice(0, 80) + '…" ≠ the served SHOWCASE_THROUGH_LINE');
  else if (gridAt < 0 || markAt < gridAt) fail('through-line', 'the through-line is not under the tile grid');
  else pass('through-line: the served SHOWCASE_THROUGH_LINE, once, under the grid');
}

process.exit(FAIL);
