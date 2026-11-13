#!/usr/bin/env node
// The EXECUTING gate for the front page's tiles: every #proof tile is followed in a real browser.
//
//   node scripts/test/frontpage-tiles.mjs --port <n> [--site <dir>] [--shots <dir>]
//
// Serves <dir> (default: this repo's site/) at http://127.0.0.1:<port>/site/ (refused if the port is
// taken — never drifts). Tile i is the roster's showcase card i (scenes/roster.json through lib/served-roster.mjs
// siteRoster; frontpage.mjs gates each href to its card's showcaseHref). STUDIO reads the roster its app.html links,
// the media URL, so the roster and its scenes must be uploaded before this gate can pass. In a fresh browser context, the tile's href must land on STUDIO
// on that row's scene:
//   - STUDIO renders ([data-role=studio-canvas-region]), its scene dropdown names the card's scene
//     (R.walkthroughById(roster, card.id).title) and, when the row carries a mode, that mode's segment is active;
//   - the STUDIO frame is the scene host (experiments/empty/index.html) and the scene is booted: the frame's page
//     door (window.FrqtlPage) publishes its runner, with no boot overlay and no boot failure recorded;
//   - no deep-link error, no STUDIO error strip, zero uncaught errors or unhandled rejections in any frame;
//   - ZERO Monaco requests from the open through the boot and a settle (Monaco is a dynamic load: STUDIO
//     opens without the editor, the condition the showcase link shape rests on).
// Then the brand row: on the first tile's STUDIO, [data-role=frqtl-brand-home] is a link that resolves to
// <site>/index.html, served 200 and titled "FRQTL — Impossible things, running".
// Exit 0 only when every row passes. The server and browser it starts are torn down before it exits;
// --shots saves each row's page as <dir>/<row>.png.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { proofLinks, isTile } from './lib/proof-tiles.mjs';
import { siteRoster, siteGraph } from './lib/served-roster.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONT_TITLE = 'FRQTL — Impossible things, running';
const BOOT_MS = 60000;
const SETTLE_MS = 3000;
// A request for the Monaco editor: any URL with a path segment named monaco (the vendored editor's directory).
const MONACO = /\/monaco\//;

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const port = Number(arg('--port'));
if (!Number.isInteger(port) || port <= 0) {
  console.error('ERROR: usage: node scripts/test/frontpage-tiles.mjs --port <n> [--site <dir>] [--shots <dir>]');
  process.exit(2);
}
const SITE = path.resolve(arg('--site') || path.join(ROOT, 'site'));
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const { STATIC_APP_PAGE } = await siteGraph();
for (const f of [STATIC_APP_PAGE, 'index.html']) {
  if (!fs.existsSync(path.join(SITE, f))) {
    console.error(`ERROR: ${path.join(SITE, f)} is missing — this gate drives the published site as it is`);
    process.exit(2);
  }
}
const tiles = proofLinks(fs.readFileSync(path.join(SITE, 'index.html'), 'utf8')).filter(isTile);
if (tiles.length === 0) {
  console.error(`ERROR: ${path.join(SITE, 'index.html')} has no #proof tiles — nothing to follow`);
  process.exit(2);
}
const { R, roster } = await siteRoster();
const CARDS = roster.showcase.rows;

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  let file = null;
  if (p.startsWith('/site/')) {
    const f = path.resolve(SITE, '.' + p.slice('/site'.length));
    if (f.startsWith(SITE + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile()) file = f;
  }
  if (!file) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve, reject) => {
  server.once('error', (e) => reject(new Error(`cannot bind 127.0.0.1:${port}: ${e.code || e.message} — refusing to drift to another port`)));
  server.listen(port, '127.0.0.1', resolve);
});
const ORIGIN = `http://127.0.0.1:${port}`;
console.log(`serving ${SITE} at ${ORIGIN}/site/ (pid ${process.pid}); ${tiles.length} tiles`);

let FAIL = 0;
const pass = (n, d) => console.log(`PASS  ${n}${d ? '  ' + d : ''}`);
const fail = (n, d) => { console.log(`FAIL  ${n}: ${d}`); FAIL = 1; };

// Every frame reports its uncaught errors and unhandled rejections to the top document.
const ERROR_TRAP = () => {
  const report = (msg) => { try { (window.top.__gateErrors = window.top.__gateErrors || []).push(location.pathname + ': ' + msg); } catch (e) { /* cross-origin top */ } };
  window.addEventListener('error', (e) => report(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => report('unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));
};

const browser = await chromium.launch();
try {
  async function open(name, href, check) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(ERROR_TRAP);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    const monaco = [];
    ctx.on('request', (r) => { if (MONACO.test(new URL(r.url()).pathname)) monaco.push(r.url()); });
    try {
      const resp = await page.goto(`${ORIGIN}/site/${href}`, { waitUntil: 'load' });
      const why = await check(page, ctx, resp);
      const errs = pageErrors.concat(await page.evaluate(() => window.__gateErrors || []).catch(() => []));
      const uniq = [...new Set(errs)];
      if (uniq.length) why.push(uniq.length + ' uncaught error(s): ' + uniq.join(' | '));
      if (monaco.length) why.push(monaco.length + ' Monaco request(s) at open: ' + [...new Set(monaco)].slice(0, 3).join(' | '));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
      return why;
    } finally {
      await ctx.close();
    }
  }

  if (tiles.length !== CARDS.length) fail('tiles', `${tiles.length} #proof tiles, the roster showcase has ${CARDS.length} cards`);
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const row = CARDS[i];
    const name = `tile-${i + 1}`;
    if (!row) { fail(`${name} "${t.title}" → ${t.href}`, 'no roster card at this position'); continue; }
    const rung = R.walkthroughById(roster, row.id);
    const why = await open(name, t.href, async (page, ctx, resp) => {
      const why = [];
      if (!resp || resp.status() !== 200) { why.push(`${t.href} answered ${resp ? resp.status() : 'nothing'}`); return why; }
      if (!rung) { why.push(`card ${row.id} names no scene row of the roster`); return why; }
      const region = await page.waitForSelector('[data-role="studio-canvas-region"]', { timeout: 30000 }).catch(() => null);
      if (!region) { why.push(`${t.href} did not land on STUDIO (no [data-role=studio-canvas-region] after 30 s)`); return why; }
      const deadline = Date.now() + BOOT_MS;
      let st;
      for (;;) {
        st = await page.evaluate(() => {
          const trigger = document.querySelector('button[title="Switch experiment or open saved project"]');
          const active = document.querySelector('[data-role="studio-mode-segment"][data-active="true"]');
          const strip = document.querySelector('[data-studio-error]');
          const deep = (document.body.innerText.match(/Deep link error[^\n]*/) || [null])[0];
          const frame = document.querySelector('[data-role="studio-canvas-region"] iframe') || document.querySelector('iframe');
          return { title: trigger ? trigger.innerText.trim() : null, activeMode: active ? active.dataset.modeId : null,
                   strip: strip && strip.textContent.trim() ? strip.textContent.trim() : null, deep,
                   frameSrc: frame ? frame.getAttribute('src') : null };
        });
        let booted = false;
        if (st.frameSrc) {
          const url = new URL(st.frameSrc, page.url()).href;
          const frame = page.frames().find((f) => f.url() === url);
          if (frame) {
            st.frame = await frame.evaluate(() => ({ door: !!window.FrqtlPage, runner: !!(window.FrqtlPage && window.FrqtlPage.runner),
              failed: document.documentElement.dataset.egptBootFailed || null, overlay: document.querySelectorAll('[data-egpt-boot-error]').length }))
              .catch(() => null);
            booted = !!(st.frame && st.frame.runner);
          }
        }
        if ((booted && st.title && st.title.includes(rung.title)) || st.deep || st.strip || Date.now() > deadline) break;
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(SETTLE_MS);
      if (st.deep) why.push(st.deep.slice(0, 300));
      if (st.strip) why.push('STUDIO error strip: ' + st.strip.slice(0, 300));
      if (!st.title || !st.title.includes(rung.title)) why.push(`the STUDIO scene dropdown reads ${JSON.stringify(st.title)}, the row's rung is "${rung.title}"`);
      if (row.mode !== null && st.activeMode !== row.mode) why.push(`the active STUDIO mode is ${JSON.stringify(st.activeMode)}, the row carries ${row.mode}`);
      if (!st.frameSrc) why.push('no STUDIO frame');
      else {
        const u = new URL(st.frameSrc, page.url());
        if (!/\/experiments\/empty\/index\.html$/.test(u.pathname)) why.push(`the STUDIO frame is ${u.pathname}, not the scene host experiments/empty/index.html`);
        if (!st.frame) why.push('the STUDIO frame never loaded');
        else if (!st.frame.door) why.push('the frame defines no page door (window.FrqtlPage) — it is not a booted FRQTL page');
        else if (!st.frame.runner) why.push(`the frame publishes no runner (FrqtlPage.runner) after ${BOOT_MS / 1000} s — the scene never booted`);
        if (st.frame && st.frame.failed) why.push('the frame recorded boot failure at phase ' + st.frame.failed);
        if (st.frame && st.frame.overlay) why.push('the frame shows a boot overlay');
      }
      return why;
    });
    if (why.length) fail(`${name} "${t.title}" → ${t.href}`, why.join('; '));
    else pass(`${name} "${t.title}" → ${t.href}`, 'STUDIO, scene booted, 0 errors, 0 Monaco requests');
  }

  // The brand: a link to the front page this site serves.
  const brandWhy = await open('brand', tiles[0].href, async (page, ctx) => {
    const why = [];
    const el = await page.waitForSelector('[data-role="frqtl-brand-home"], [data-role="frqtl-brand"]', { timeout: 30000 }).catch(() => null);
    if (!el) { why.push('no FRQTL brand on STUDIO'); return why; }
    const b = await el.evaluate((n) => ({ tag: n.tagName, role: n.dataset.role, href: n.href || null }));
    if (b.tag !== 'A' || b.role !== 'frqtl-brand-home') { why.push(`the brand is <${b.tag.toLowerCase()} data-role=${b.role}>, not a home link — ${STATIC_APP_PAGE} declares no <link rel="home">`); return why; }
    if (b.href !== `${ORIGIN}/site/index.html`) why.push(`the brand links to ${b.href}, not ${ORIGIN}/site/index.html`);
    const r = await ctx.request.get(b.href);
    const title = ((await r.text()).match(/<title>([^<]*)<\/title>/) || [])[1];
    if (r.status() !== 200) why.push(`${b.href} answered ${r.status()}`);
    else if (title !== FRONT_TITLE) why.push(`${b.href} is titled ${JSON.stringify(title)}, not ${JSON.stringify(FRONT_TITLE)}`);
    return why;
  });
  if (brandWhy.length) fail('brand', brandWhy.join('; '));
  else pass('brand', `<a data-role=frqtl-brand-home> → ${ORIGIN}/site/index.html "${FRONT_TITLE}"`);
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
process.exit(FAIL);
