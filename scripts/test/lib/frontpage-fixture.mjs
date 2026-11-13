// The fixture site the front-page gates' controls run against (frontpage-controls.mjs,
// frontpage-tiles-controls.mjs). One builder, so the planted pages differ from the faithful page
// only by the fault each control names.
//
//   const fx = await frontpageFixture(siteDir);
//   fx.build(dir, mutate, { appHtml })  → <dir>/site: the IDE page (the real one, or `appHtml`), the graph
//       directory, app-assets/ and DeSciXAppSDK.js symlinked to the real site, images/ holding one still per
//       showcase card, index.html = the real front page with its #proof .grid replaced by
//       mutate(fx.faithful(), siteDir) rendered as tiles, and its through-line element's text replaced
//       by opts.throughLine (a string; null removes the element) when given.
//
// The faithful tiles are written from this repo's roster (lib/served-roster.mjs::siteRoster), each href the card's
// R.showcaseHref (this site is the showcase site), in the shape the front page renders.
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { siteRoster, siteGraph } from './served-roster.mjs';

// #proof: the grid, then the through-line paragraph, then the grid-note
const GRID = /(<section\b[^>]*\bid="proof"[^>]*>[\s\S]*?<div class="grid"[^>]*>)[\s\S]*?(<\/div>\s*<p class="grid-note" data-showcase-throughline>)/;
const THROUGH = /(<p class="grid-note" data-showcase-throughline>)[\s\S]*?(<\/p>\s*)/;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function frontpageFixture(SITE) {
  const { R, roster } = await siteRoster();
  const { STATIC_APP_PAGE, SITE_GRAPH_DIR } = await siteGraph();
  const appHtml = readFileSync(join(SITE, STATIC_APP_PAGE), 'utf8');
  const cards = roster.showcase.rows;
  const front = readFileSync(join(SITE, 'index.html'), 'utf8');
  if (!GRID.test(front)) throw new Error(join(SITE, 'index.html') + ' has no #proof .grid followed by the [data-showcase-throughline] .grid-note to plant tiles into');

  const stillOf = (card) => 'images/' + R.sceneKey(roster, { id: card.id, modeId: card.mode }) + '.png';
  // The showcase site's own page: every tile is the card's relative link from its one writer.
  const faithful = () => cards.map((c) => ({ title: c.title, tile: c.tile, alt: c.still ? c.still.alt : '', href: R.showcaseHref(roster, c), img: stillOf(c), dark: false }));
  const tileHtml = (t) => '<a class="tile' + (t.dark ? ' dark' : '') + '" href="' + esc(t.href) + '">' +
    (t.img ? '<img src="' + esc(t.img) + '" alt="' + esc(t.alt) + '">' : '') +
    '<span class="cap"><b>' + esc(t.title) + '</b><span>' + esc(t.tile) + '</span><i>Open live ↗</i></span></a>';

  function build(dir, mutate, opts = {}) {
    const site = join(dir, 'site');
    mkdirSync(join(site, 'images'), { recursive: true });
    if (opts.appHtml !== undefined) writeFileSync(join(site, STATIC_APP_PAGE), opts.appHtml);
    else copyFileSync(join(SITE, STATIC_APP_PAGE), join(site, STATIC_APP_PAGE));
    for (const name of [SITE_GRAPH_DIR, 'app-assets', 'DeSciXAppSDK.js']) {
      if (existsSync(join(SITE, name))) symlinkSync(join(SITE, name), join(site, name));
    }
    for (const c of cards) writeFileSync(join(site, stillOf(c)), 'png');
    const tiles = mutate(faithful(), site);
    let page = front.replace(GRID, (_, a, b) => a + '\n    ' + tiles.map(tileHtml).join('\n    ') + '\n  ' + b);
    if (opts.throughLine !== undefined) {
      page = page.replace(THROUGH, (m, a, b) => (opts.throughLine === null ? '' : a + esc(opts.throughLine) + b));
    }
    writeFileSync(join(site, 'index.html'), page);
    return site;
  }

  return { R, roster, cards, appHtml, stillOf, faithful, build };
}
