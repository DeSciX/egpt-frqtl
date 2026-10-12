#!/usr/bin/env node
// The EXECUTING gate for the front page's tiles: every #proof tile is followed in a real browser.
//
//   node scripts/test/frontpage-tiles.mjs --port <n> [--site <dir>] [--shots <dir>]
//
// Serves <dir> (default: this repo's site/) at http://127.0.0.1:<port>/site/ (refused if the port is
// taken — never drifts). For each tile of <site>/index.html, in a fresh browser context, the tile's
// href must land on the GYM playing the scene the link names:
//   - [data-role=gym-root] renders, with data-scene = walkthrough:<id> (or <id> for ?experiment=),
//     the scene select on that value and, when the link names a mode, that mode's strip button active;
//   - the GYM's frame is the scene host (experiments/empty/index.html for a rung,
//     experiments/<id>/ for an experiment page) and the scene is applied: the GYM records
//     data-booted=1 and the frame publishes its runner;
//   - zero uncaught errors or unhandled rejections in any frame, no GYM error banner, no boot failure
//     recorded by the frame.
// Then the brand row: on the GYM, [data-role=frqtl-brand-home] is a link that resolves to
// <site>/index.html, served 200 and titled "FRQTL — Impossible things, running".
// Exit 0 only when every row passes. The server and browser it starts are torn down before it exits;
// --shots saves each row's page as <dir>/<row>.png.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { proofLinks, isTile } from './lib/proof-tiles.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONT_TITLE = 'FRQTL — Impossible things, running';
const BOOT_MS = 60000;

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
for (const f of ['app.html', 'index.html']) {
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

/** The scene a GYM link names: { value, mode, host } or null when the link names none. */
function linkedScene(href) {
  const q = new URLSearchParams(href.split('?')[1] || '');
  if (q.has('walkthrough')) return { value: 'walkthrough:' + q.get('walkthrough'), mode: q.get('mode'), host: /\/experiments\/empty\/index\.html$/ };
  if (q.has('experiment')) return { value: q.get('experiment'), mode: null, host: new RegExp('/experiments/' + q.get('experiment') + '/(index\\.html)?$') };
  return null;
}

const browser = await chromium.launch();
try {
  async function open(name, href, check) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    await ctx.addInitScript(ERROR_TRAP);
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    try {
      const resp = await page.goto(`${ORIGIN}/site/${href}`, { waitUntil: 'load' });
      const why = await check(page, ctx, resp);
      const errs = pageErrors.concat(await page.evaluate(() => window.__gateErrors || []).catch(() => []));
      const uniq = [...new Set(errs)];
      if (uniq.length) why.push(uniq.length + ' uncaught error(s): ' + uniq.join(' | '));
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') });
      return why;
    } finally {
      await ctx.close();
    }
  }

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const name = `tile-${i + 1}`;
    const why = await open(name, t.href, async (page, ctx, resp) => {
      const why = [];
      if (!resp || resp.status() !== 200) { why.push(`${t.href} answered ${resp ? resp.status() : 'nothing'}`); return why; }
      const want = linkedScene(t.href);
      if (!want) { why.push(`${t.href} names no GYM scene (?walkthrough= or ?experiment=)`); return why; }
      const root = await page.waitForSelector('[data-role="gym-root"]', { timeout: 30000 }).catch(() => null);
      if (!root) { why.push(`${t.href} did not land on the GYM (no [data-role=gym-root] after 30 s)`); return why; }
      const deadline = Date.now() + BOOT_MS;
      let st;
      for (;;) {
        st = await page.evaluate(() => {
          const r = document.querySelector('[data-role="gym-root"]');
          const sel = document.querySelector('[data-role="gym-experiment-select"]');
          const active = document.querySelector('[data-role="gym-mode-strip"] [data-active="1"]');
          const banner = [...document.querySelectorAll('[data-role="gym-root"] div')]
            .map((d) => d.textContent).find((s) => /^(Deep link error|\[GYM\]|\[Benchmark\])/.test(s || '')) || null;
          return { scene: r.dataset.scene, mode: r.dataset.sceneMode, booted: r.dataset.booted, select: sel ? sel.value : null,
                   activeMode: active ? active.dataset.mode : null, banner };
        });
        if (st.booted === '1' || st.banner || Date.now() > deadline) break;
        await page.waitForTimeout(100);
      }
      if (st.banner) why.push('GYM error banner: ' + st.banner.slice(0, 300));
      if (st.scene !== want.value) why.push(`gym-root data-scene=${JSON.stringify(st.scene)}, the link names ${want.value}`);
      if (st.select !== want.value) why.push(`scene select=${JSON.stringify(st.select)}, the link names ${want.value}`);
      if (want.mode && (st.mode !== want.mode || st.activeMode !== want.mode)) why.push(`mode: gym-root ${JSON.stringify(st.mode)}, strip ${JSON.stringify(st.activeMode)}, the link names ${want.mode}`);
      if (st.booted !== '1') why.push(`the scene never booted (data-booted=${st.booted} after ${BOOT_MS / 1000} s)`);
      const frame = page.frames().find((f) => f !== page.mainFrame() && /\/experiments\//.test(f.url()));
      if (!frame) why.push('no experiment frame in the GYM');
      else {
        const u = new URL(frame.url());
        if (!want.host.test(u.pathname)) why.push(`the GYM frame is ${u.pathname}, not the scene host ${want.host}`);
        const fr = await frame.evaluate(() => ({ runner: !!window._frqtlApp, failed: document.documentElement.dataset.egptBootFailed || null }));
        if (!fr.runner) why.push('the frame publishes no runner (_frqtlApp) — the scene was not applied');
        if (fr.failed) why.push('the frame recorded boot failure at phase ' + fr.failed);
      }
      return why;
    });
    if (why.length) fail(`${name} "${t.title}" → ${t.href}`, why.join('; '));
    else pass(`${name} "${t.title}" → ${t.href}`, 'GYM, scene applied, 0 errors');
  }

  // The brand: a link to the front page this site serves.
  const brandWhy = await open('brand', 'app.html?preset=compare', async (page, ctx) => {
    const why = [];
    const el = await page.waitForSelector('[data-role="frqtl-brand-home"], [data-role="frqtl-brand"]', { timeout: 30000 }).catch(() => null);
    if (!el) { why.push('no FRQTL brand on the GYM'); return why; }
    const b = await el.evaluate((n) => ({ tag: n.tagName, role: n.dataset.role, href: n.href || null }));
    if (b.tag !== 'A' || b.role !== 'frqtl-brand-home') { why.push(`the brand is <${b.tag.toLowerCase()} data-role=${b.role}>, not a home link — app.html declares no <link rel="home">`); return why; }
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
