// The fixture site the front-page gates' controls run against (frontpage-controls.mjs,
// frontpage-tiles-controls.mjs). One builder, so the planted pages differ from the faithful page
// only by the fault each control names.
//
//   const fx = await frontpageFixture(siteDir);
//   fx.build(dir, mutate, { appHtml })  → <dir>/site: app.html (the real one, or `appHtml`), pub/,
//       app-assets/ and DeSciXAppSDK.js symlinked to the real site, images/ holding one still per
//       roster row, index.html = the real front page with its #proof .grid replaced by
//       mutate(fx.faithful(), siteDir) rendered as tiles, and its through-line element's text replaced
//       by opts.throughLine (a string; null removes the element) when given.
//
// The faithful tiles are written from the SERVED roster (<site>/pub/<stamp>/ide/registry/exhibits.js)
// in the shape EGPT-Evidence build-frontpage.js renders (FRAQTL architect shape v2 §2.2).
import { readFileSync, writeFileSync, mkdirSync, symlinkSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { servedRegistries } from './served-roster.mjs';

// #proof: the grid, then the through-line paragraph, then the grid-note
const GRID = /(<section\b[^>]*\bid="proof"[^>]*>[\s\S]*?<div class="grid"[^>]*>)[\s\S]*?(<\/div>\s*<p class="grid-note" data-showcase-throughline>)/;
const THROUGH = /(<p class="grid-note" data-showcase-throughline>)[\s\S]*?(<\/p>\s*)/;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export async function frontpageFixture(SITE) {
  const { X, appHtml } = await servedRegistries(SITE);
  const front = readFileSync(join(SITE, 'index.html'), 'utf8');
  if (!GRID.test(front)) throw new Error(join(SITE, 'index.html') + ' has no #proof .grid followed by the [data-showcase-throughline] .grid-note to plant tiles into');

  const stillOf = (row) => 'images/' + X.sceneKey({ kind: row.kind, id: row.id, modeId: row.mode }) + '.png';
  const gymHref = (row) => 'app.html?' + new URLSearchParams(row.kind === 'rung'
    ? Object.assign({ preset: 'compare', walkthrough: row.id }, row.mode ? { mode: row.mode } : {})
    : { preset: 'compare', experiment: row.id });
  const faithful = () => X.EXHIBITS.map((row) => ({ title: row.title, tile: row.tile, alt: row.still ? row.still.alt : '', href: gymHref(row), img: stillOf(row), dark: false }));
  const tileHtml = (t) => '<a class="tile' + (t.dark ? ' dark' : '') + '" href="' + esc(t.href) + '">' +
    (t.img ? '<img src="' + esc(t.img) + '" alt="' + esc(t.alt) + '">' : '') +
    '<span class="cap"><b>' + esc(t.title) + '</b><span>' + esc(t.tile) + '</span><i>Open live ↗</i></span></a>';

  function build(dir, mutate, opts = {}) {
    const site = join(dir, 'site');
    mkdirSync(join(site, 'images'), { recursive: true });
    if (opts.appHtml !== undefined) writeFileSync(join(site, 'app.html'), opts.appHtml);
    else copyFileSync(join(SITE, 'app.html'), join(site, 'app.html'));
    for (const name of ['pub', 'app-assets', 'DeSciXAppSDK.js']) {
      if (existsSync(join(SITE, name))) symlinkSync(join(SITE, name), join(site, name));
    }
    for (const row of X.EXHIBITS) writeFileSync(join(site, stillOf(row)), 'png');
    const tiles = mutate(faithful(), site);
    let page = front.replace(GRID, (_, a, b) => a + '\n    ' + tiles.map(tileHtml).join('\n    ') + '\n  ' + b);
    if (opts.throughLine !== undefined) {
      page = page.replace(THROUGH, (m, a, b) => (opts.throughLine === null ? '' : a + esc(opts.throughLine) + b));
    }
    writeFileSync(join(site, 'index.html'), page);
    return site;
  }

  return { X, appHtml, stillOf, gymHref, faithful, build };
}
