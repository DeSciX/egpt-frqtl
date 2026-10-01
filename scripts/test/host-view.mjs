#!/usr/bin/env node
// The EXECUTING gate for the host-view declaration, with the REAL vendored SDK bytes.
//
//   node scripts/test/host-view.mjs --port <n> [--site <dir>] [--shots <dir>]
//
// Serves <dir> (default: this repo's site/) at /site/ and the shell harness at /harness.html on
// ONE origin (127.0.0.1:<port>, refused if taken), so the framed page's DeSciXAppSDK.js walks up to
// the harness's stub BUS exactly as it walks up to the shell's. Then, for the IDE page (app.html,
// the bundle's index.html) and the front page (index.html), it asserts what the page RECORDED on
// document.documentElement.dataset.descixView and how many times it called view.set:
//   view-aware host (available() true)   -> requested:CodeSite, exactly one set('CodeSite')
//   bare-iframe host (available() false) -> not-listening, zero set calls
// and measures one platform behavior the declarer depends on: with NO bus above a framed page,
// the SDK's ready() rejects and the page records embedded-no-bridge.
//
// A page records nothing until FRAQTL's host-view declarer runs in it: app.html after a refresh
// from a bundle that ships it, index.html once it loads the bundle's app-assets/host-view.js.
// Exit 0 only when every row gets its expected verdict. The server and browser it starts are torn
// down before it exits. --shots saves each row's harness page (the framed site page as the stub
// shell shows it) as <dir>/<row>.png.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HARNESS = path.join(ROOT, 'scripts/test/host-view/shell-harness.html');
const MODE = 'CodeSite';
const SDK = 'DeSciXAppSDK.js';

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const port = Number(arg('--port'));
if (!Number.isInteger(port) || port <= 0) {
  console.error('ERROR: usage: node scripts/test/host-view.mjs --port <n> [--site <dir>]');
  process.exit(2);
}
const SITE = path.resolve(arg('--site') || path.join(ROOT, 'site'));
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
for (const f of ['app.html', 'index.html', SDK]) {
  if (!fs.existsSync(path.join(SITE, f))) {
    console.error(`ERROR: ${path.join(SITE, f)} is missing — this gate drives the published site as it is`);
    process.exit(2);
  }
}

const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json',
};
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = null;
  if (p === '/harness.html') file = HARNESS;
  else if (p.startsWith('/site/')) {
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
const sdkSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(SITE, SDK))).digest('hex').slice(0, 16);
console.log(`serving ${SITE} at ${ORIGIN}/site/ (pid ${process.pid}); real ${SDK} sha256 ${sdkSha}`);

let FAIL = 0;
const pass = (n, d) => console.log(`PASS  ${n}${d ? '  ' + d : ''}`);
const fail = (n, d) => { console.log(`FAIL  ${n}: ${d}`); FAIL = 1; };

const browser = await chromium.launch();
try {
  // Drive one row: frame `page` under the harness, wait for the page's record, read set calls.
  async function row(name, query, page) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
    const tab = await ctx.newPage();
    const declarerErrors = [];
    tab.on('console', (m) => {
      if (m.type() === 'error' && /\/app-assets\/host-view\.js$/.test(m.location().url || '')) declarerErrors.push(m.text());
    });
    try {
      await tab.goto(`${ORIGIN}/harness.html?${query}&page=${encodeURIComponent(page)}`, { waitUntil: 'load' });
      const frame = await tab.waitForSelector('iframe').then((h) => h.contentFrame());
      await frame.waitForLoadState('load');
      let view, detail;
      const deadline = Date.now() + 30000;
      for (;;) {
        ({ view, detail } = await frame.evaluate(() => ({
          view: document.documentElement.dataset.descixView,
          detail: document.documentElement.dataset.descixViewDetail,
        })));
        if ((view && view !== 'pending') || Date.now() > deadline) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      await tab.waitForTimeout(500);   // a late second declaration would land here
      const sets = await tab.evaluate(() => window.__viewSets);
      if (SHOTS) await tab.screenshot({ path: path.join(SHOTS, name + '.png') });
      return { view, detail, sets, declarerErrors };
    } finally {
      await ctx.close();
    }
  }

  const CASES = [
    { name: 'app-html-view-aware-host', query: 'listening=1', page: 'app.html?preset=author', view: 'requested:' + MODE, sets: [MODE] },
    { name: 'app-html-bare-iframe-host', query: 'listening=0', page: 'app.html?preset=author', view: 'not-listening', sets: [] },
    { name: 'front-page-view-aware-host', query: 'listening=1', page: 'index.html', view: 'requested:' + MODE, sets: [MODE] },
    { name: 'front-page-bare-iframe-host', query: 'listening=0', page: 'index.html', view: 'not-listening', sets: [] },
    // The SDK, framed with no readable bus, rejects ready() (an unnamed TypeError today); the
    // declarer names that state instead of throwing.
    { name: 'app-html-no-bus-embedded-no-bridge', query: 'bus=none', page: 'app.html?preset=author', view: 'embedded-no-bridge', sets: [], detail: /^ready\(\) rejected: / },
  ];
  for (const c of CASES) {
    const got = await row(c.name, c.query, c.page);
    const what = `view=${JSON.stringify(got.view)} sets=${JSON.stringify(got.sets)} detail=${JSON.stringify(got.detail)}`;
    const ok = got.view === c.view
      && JSON.stringify(got.sets) === JSON.stringify(c.sets)
      && got.declarerErrors.length === 0
      && (!c.detail || c.detail.test(got.detail || ''));
    if (ok) pass(c.name, what);
    else fail(c.name, `${what}; want view=${c.view} sets=${JSON.stringify(c.sets)}${c.detail ? ' detail~' + c.detail : ''}${got.declarerErrors.length ? '; declarer console errors: ' + got.declarerErrors.join(' | ') : ''}`);
  }
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
process.exit(FAIL);
