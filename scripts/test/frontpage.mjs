#!/usr/bin/env node
// Static gate for the published front page, <site>/index.html. Exit 0 only when every check passes.
//
//   node scripts/test/frontpage.mjs [--site <dir>] [--origin <origin>] [--roster <file>]
//       (defaults: this repo's site/; this app's origin, scripts/lib/scenes.mjs APP_ORIGIN; scenes/roster.json)
//
// The tiles are the showcase of this repo's roster (scenes/roster.json, the bytes the media serves), normalized by
// the pinned @descix/frqtl-web ./registry (lib/served-roster.mjs::siteRoster): R's readers and the roster bag.
//
// Checks:
//   order  — section#proof (the cards) is the first element after the nav, above the hero.
//   lede   — the #proof lede is the CEO-approved paragraph, exactly.
//   tiles  — the #proof tiles are roster.showcase.rows (the cards), one per card, in roster order:
//              title (<b>) and sentence (<span>) are the card's `title` and `tile`;
//              href is the card's link from its one writer, by the self_host rule: R.showcaseHref(roster, card)
//              (relative) when the page's origin is roster.showcase.siteOrigin, else R.showcaseUrl(roster, card)
//              (absolute on that origin); the call to action is "Open live ↗";
//              a tile carries an <img> iff it is not .dark, and the img is images/<sceneKey>.png
//              (R.sceneKey of the card), present in <site>/images/, its alt the card's `still.alt`.
//   stills — every card that declares a still has images/<R.sceneKey>.png in <site>, refused by name.
//   through-line — #proof holds exactly one [data-showcase-throughline] element, after the grid, and
//              its text is roster.showcase.throughLine.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteRoster } from './lib/served-roster.mjs';
import { APP_ORIGIN } from '../lib/scenes.mjs';
import { proofSection, proofLinks, throughLines, isTile, text } from './lib/proof-tiles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };
const SITE = resolve(arg('--site') || join(ROOT, 'site'));
const ORIGIN = arg('--origin') || APP_ORIGIN;
const { R, roster } = await siteRoster(arg('--roster') ? resolve(arg('--roster')) : undefined);
if (roster.showcase === null) throw new Error('the roster declares no showcase — the front page\'s tiles are its cards');
const CARDS = roster.showcase.rows;
const SITE_ORIGIN = roster.showcase.siteOrigin;
const stillOf = (card) => 'images/' + R.sceneKey(roster, { id: card.id, modeId: card.mode }) + '.png';
const CTA = 'Open live ↗';

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
  // The self_host rule: this page is the showcase site's own iff it is served from roster.showcase.siteOrigin.
  const SELF = ORIGIN === SITE_ORIGIN;
  console.log('INFO  page origin ' + ORIGIN + (SELF ? ' is ' : ' is not ') + 'the showcase site ' + SITE_ORIGIN + ': tiles link ' +
    (SELF ? 'relative, showcaseHref(roster, card)' : 'absolute, showcaseUrl(roster, card)'));

  const links = proofLinks(html);
  for (const t of links.filter((l) => !isTile(l))) fail('tiles', 'a link in #proof that is not a tile: ' + t.href);
  const grid = links.filter(isTile);
  if (grid.length !== CARDS.length) {
    fail('tiles', grid.length + ' #proof tiles, the roster showcase has ' + CARDS.length + ' cards (' +
      CARDS.map((r) => r.id).join(', ') + ')');
  }

  const n = Math.max(grid.length, CARDS.length);
  for (let i = 0; i < n; i++) {
    const row = CARDS[i];
    const t = grid[i];
    const name = 'tile ' + (i + 1) + ' ' + (row ? row.id + (row.mode ? '/' + row.mode : '') : '(no roster card)');
    if (!row) { fail(name, 'extra tile "' + t.title + '" → ' + t.href); continue; }
    if (!t) { fail(name, 'missing — the roster card "' + row.title + '" has no tile'); continue; }
    const why = [];
    if (t.title !== row.title) why.push('title "' + t.title + '" ≠ roster "' + row.title + '"');
    if (t.tile !== row.tile) why.push('sentence "' + t.tile + '" ≠ roster tile "' + row.tile + '"');
    if (t.cta !== CTA) why.push('call to action "' + t.cta + '" ≠ "' + CTA + '"');

    // href: the card's link from its one writer, relative or absolute by the self_host rule.
    const want = SELF ? R.showcaseHref(roster, row) : R.showcaseUrl(roster, row);
    if (t.href !== want) {
      const other = SELF ? R.showcaseUrl(roster, row) : R.showcaseHref(roster, row);
      why.push('href ' + t.href + ' ≠ ' + (SELF ? 'showcaseHref' : 'showcaseUrl') + '(roster, card) ' + want +
        (t.href !== other ? '' : SELF ? ' — an absolute self-link: the showcase site\'s own page links relatively'
          : ' — a relative link on a page served from ' + ORIGIN + ', which is not ' + SITE_ORIGIN));
    }

    // image: .dark iff no image; the image is the card's still.
    const dark = t.classes.includes('dark');
    const still = stillOf(row);
    if (dark && t.img) why.push('.dark tile carries an image ' + t.img);
    else if (!dark && !t.img) why.push('tile has no image and is not .dark');
    else if (t.img && t.img !== still) why.push('image ' + t.img + ' is not the card\'s still ' + still);
    else if (t.img && !existsSync(join(SITE, t.img))) why.push('image ' + t.img + ' is not in ' + join(SITE, 'images'));
    if (t.img && (!row.still || t.alt !== row.still.alt)) {
      why.push('alt "' + t.alt + '" ≠ roster still.alt "' + (row.still ? row.still.alt : '(card declares no still)') + '"');
    }

    if (why.length) fail(name, why.join('; '));
    else pass(name + ' → ' + t.href + (t.img ? ' [' + t.img + ']' : ' [.dark]'));
  }
}

// ── stills ───────────────────────────────────────────────────────────────────
{
  const missing = CARDS.filter((c) => c.still !== null && !existsSync(join(SITE, stillOf(c))));
  for (const c of missing) fail('still ' + c.id + (c.mode ? '/' + c.mode : ''), stillOf(c) + ' (R.sceneKey of the card) is not in ' + SITE);
  if (!missing.length) pass('stills: every card\'s still is in ' + join(SITE, 'images') + ' (' + CARDS.filter((c) => c.still !== null).length + ')');
}

// ── through-line ─────────────────────────────────────────────────────────────
{
  const want = roster.showcase.throughLine === null ? null : roster.showcase.throughLine.join('');
  const got = throughLines(html);
  const gridAt = proof.indexOf('data-exhibits'), markAt = proof.indexOf('data-showcase-throughline');
  if (want === null) fail('through-line', 'the roster showcase declares no throughLine');
  else if (got.length !== 1) fail('through-line', got.length + ' [data-showcase-throughline] elements in #proof, want exactly 1');
  else if (got[0] !== text(want)) fail('through-line', '"' + got[0].slice(0, 80) + '…" ≠ the roster showcase.throughLine');
  else if (gridAt < 0 || markAt < gridAt) fail('through-line', 'the through-line is not under the tile grid');
  else pass('through-line: the roster showcase.throughLine, once, under the grid');
}

process.exit(FAIL);
