#!/usr/bin/env node
// The site smoke, in a real browser, through the App Shell at a ROOT URL: the local gateway
// (https://localhost:5173/, `descix serve`) or PROD (https://egpt-frqtl.descix.net/).
//
//   node scripts/test/studio-smoke.mjs --root <url> [--shots <dir>] [--card <scene id>]
//
// STUDIO reads the roster its app.html links (the media URL), so this exercises the uploaded roster and scenes.
// The expectations come from this repo's roster through the pinned registry (lib/served-roster.mjs siteRoster):
//   front    the shell frames this app: one frame holds the front page (section#proof)
//   first    in that frame, app.html?preset=author lands on first contact (STUDIO_LANDING_ATTR = first-contact):
//            the scene dropdown names roster.firstContact's title, the active mode is its default mode, the scene is
//            3D exactly when walkthroughIs3D says so (and the runner agrees), and runner.worldTick advances
//   groups   the scene dropdown, opened, shows every group label of sceneGroups(roster) (at least one of them
//            absent before it opens, or the check would be vacuous; read as textContent, before any CSS case)
//   card     on the front page, the tile of the showcase card (--card, default: the first card that is not first
//            contact) is clicked: STUDIO lands on that card's scene and mode and runner.worldTick advances
// Run-once explainer cards are dismissed with Continue; a scene not running is started with Run. Uncaught errors
// and unhandled rejections in any frame fail the row, and so does a frame the smoke cannot read (named). Exit 0 only when every row passes. --shots saves a
// screenshot per row (<dir>/<row>.png) with a provenance line beside it (<dir>/<row>.json).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { siteRoster } from './lib/served-roster.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i === -1 ? undefined : process.argv[i + 1]; };
const ROOT = arg('--root');
if (!ROOT || !/^https?:\/\/[^/]+\/$/.test(ROOT)) { console.error('usage: node scripts/test/studio-smoke.mjs --root <origin>/ [--shots <dir>] [--card <id>]'); process.exit(2); }
const SHOTS = arg('--shots') ? path.resolve(arg('--shots')) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const { R, roster } = await siteRoster();
const first = R.firstContactOf(roster);
if (!first) throw new Error('the roster declares no firstContact — the first-contact row has nothing to expect');
const card = arg('--card') ? roster.showcase.rows.find((c) => c.id === arg('--card')) : roster.showcase.rows.find((c) => c.id !== first.id);
if (!card) throw new Error('no showcase card ' + (arg('--card') || 'other than first contact'));
const LANDING = R.STUDIO_LANDING_ATTR;
// A landing outcome id, refused unless the pinned registry declares it (STUDIO_LANDING_OUTCOMES).
const landingId = (id) => {
  if (!R.STUDIO_LANDING_OUTCOMES.some((o) => o.id === id)) throw new Error('the pinned registry declares no STUDIO landing outcome "' + id + '"');
  return id;
};
const BOOT_MS = 90000;

const ERROR_TRAP = () => {
  const report = (msg) => { try { (window.top.__smokeErrors = window.top.__smokeErrors || []).push(location.href + ': ' + msg); } catch (e) { (window.__smokeErrors = window.__smokeErrors || []).push(location.href + ': ' + msg); } };
  window.addEventListener('error', (e) => report(e.message || String(e.error)));
  window.addEventListener('unhandledrejection', (e) => report('unhandled rejection: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason))));
};

let FAIL = 0;
const pass = (n, d) => console.log('PASS  ' + n + (d ? '  ' + d : ''));
const fail = (n, d) => { console.log('FAIL  ' + n + ': ' + d); FAIL = 1; };

const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, ignoreHTTPSErrors: true });
  await ctx.addInitScript(ERROR_TRAP);
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  const errorsSince = async (n) => {
    const all = [...pageErrors];
    // A frame this smoke cannot read is a failure naming it, never a frame with no errors.
    for (const f of page.frames()) {
      try { all.push(...(await f.evaluate(() => window.__smokeErrors || []))); }
      catch (e) { all.push('unreadable frame ' + (f.url() || '(no url)') + ': ' + String(e.message || e).split('\n')[0]); }
    }
    return [...new Set(all)].slice(n);
  };
  async function shot(name, facts) {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, name + '.png') });
    fs.writeFileSync(path.join(SHOTS, name + '.json'), JSON.stringify(Object.assign({ root: ROOT, at: new Date().toISOString(), roster: roster.href }, facts), null, 2) + '\n');
  }

  // The app frame: the one frame whose document holds the front page.
  await page.goto(ROOT, { waitUntil: 'load' });
  let app = null;
  for (const t0 = Date.now(); !app && Date.now() - t0 < 60000; await page.waitForTimeout(500)) {
    for (const f of page.frames()) {
      if (await f.evaluate(() => !!document.querySelector('section#proof')).catch(() => false)) { app = f; break; }
    }
  }
  if (!app) { fail('front', 'no frame under ' + ROOT + ' shows the front page (section#proof) after 60 s'); throw new Error('stop'); }
  pass('front', 'the shell at ' + ROOT + ' frames the front page at ' + app.url());
  await shot('front', { frame: app.url() });

  // A STUDIO landing in the app frame: dismiss run-once cards, start the scene, wait for its runner to advance.
  async function studio(expect) {
    const why = [];
    const deadline = Date.now() + BOOT_MS;
    let st = null;
    let t1 = null;
    for (;;) {
      // the topmost Continue first (cards stack)
      const cont = app.getByRole('button', { name: 'Continue' });
      if (await cont.count().catch(() => 0)) { await cont.last().click({ timeout: 2000 }).catch(() => {}); }
      st = await app.evaluate((attr) => {
        const trigger = document.querySelector('button[title="Switch experiment or open saved project"]');
        const active = document.querySelector('[data-role="studio-mode-segment"][data-active="true"]');
        const frame = document.querySelector('[data-role="studio-canvas-region"] iframe');
        return { landing: document.documentElement.getAttribute(attr), title: trigger ? trigger.innerText.replace(/\s*▼\s*$/, '').trim() : null,
                 mode: active ? active.dataset.modeId : null, frame: frame ? frame.src : null,
                 strip: (document.querySelector('[data-studio-error]') || {}).textContent || null };
      }, LANDING).catch(() => null);
      const sf = st && st.frame ? page.frames().find((f) => f.url() === st.frame) : null;
      const run = sf ? await sf.evaluate(() => {
        const r = window.FrqtlPage && window.FrqtlPage.runner;
        return r ? { running: r.isRunning, tick: r.worldTick, is3D: r._is3D } : null;
      }).catch(() => null) : null;
      if (st) st.run = run;
      if (run && !run.running) {
        const btn = app.getByRole('button', { name: /^\W*Run$/ });
        if (await btn.count().catch(() => 0)) { await btn.first().click({ timeout: 2000 }).catch(() => {}); }
      }
      if (run && run.running && run.tick > 0) {
        if (t1 === null) { t1 = run.tick; await page.waitForTimeout(3000); continue; }
        if (run.tick > t1) break;
      }
      if (Date.now() > deadline) break;
      await page.waitForTimeout(500);
    }
    if (!st) { why.push('STUDIO never rendered in the app frame'); return { why, st }; }
    if (st.strip && st.strip.trim()) why.push('STUDIO error strip: ' + st.strip.trim().slice(0, 300));
    if (st.landing !== expect.landing) why.push(LANDING + '=' + JSON.stringify(st.landing) + ', want ' + JSON.stringify(expect.landing));
    if (!st.title || !st.title.includes(expect.title)) why.push('the scene dropdown reads ' + JSON.stringify(st.title) + ', want "' + expect.title + '"');
    if (st.mode !== expect.mode) why.push('active mode ' + JSON.stringify(st.mode) + ', want ' + JSON.stringify(expect.mode));
    if (!st.run) why.push('the scene frame publishes no runner (FrqtlPage.runner) after ' + BOOT_MS / 1000 + ' s');
    else {
      if (st.run.is3D !== expect.is3D) why.push('runner 3D is ' + st.run.is3D + ', walkthroughIs3D says ' + expect.is3D);
      if (!(t1 !== null && st.run.tick > t1)) why.push('runner.worldTick did not advance (' + t1 + ' → ' + st.run.tick + ', running ' + st.run.running + ')');
    }
    return { why, st, t1 };
  }

  // first contact
  {
    const n = (await errorsSince(0)).length;
    await app.goto(new URL('app.html?preset=author', app.url()).href, { waitUntil: 'load' });
    const mode = R.defaultWalkthroughModeId(first);
    const expect = { landing: landingId('first-contact'), title: first.title, mode, is3D: R.walkthroughIs3D(roster, first.id, mode) };
    const { why, st, t1 } = await studio(expect);
    const errs = await errorsSince(n);
    if (errs.length) why.push(errs.length + ' uncaught error(s): ' + errs.join(' | ').slice(0, 600));
    await shot('first-contact', { scene: first.id, mode, is3D: expect.is3D, title: st && st.title, ticks: [t1, st && st.run && st.run.tick] });
    if (why.length) fail('first', why.join('; '));
    else pass('first', first.id + ' (' + mode + ', 3D ' + expect.is3D + ') "' + st.title + '", worldTick ' + t1 + ' → ' + st.run.tick);
  }

  // the dropdown's groups
  {
    const labels = [...new Set(R.sceneGroups(roster).map((g) => g.label))];
    const before = await app.evaluate(() => document.body.textContent);
    await app.click('button[title="Switch experiment or open saved project"]');
    await page.waitForTimeout(1000);
    const after = await app.evaluate(() => document.body.textContent);
    const missing = labels.filter((l) => !after.includes(l));
    const absentBefore = labels.filter((l) => !before.includes(l));
    await shot('dropdown', { groups: labels });
    await page.keyboard.press('Escape');
    if (missing.length) fail('groups', 'the open dropdown lacks ' + missing.map((l) => JSON.stringify(l)).join(', '));
    else if (!absentBefore.length) fail('groups', 'every group label was on the page before the dropdown opened — the check cannot tell');
    else pass('groups', labels.length + ' roster groups in the open dropdown (' + labels.join(' | ') + ')');
  }

  // a showcase card's tile → STUDIO at its scene
  {
    const n = (await errorsSince(0)).length;
    await app.goto(new URL('index.html', app.url()).href, { waitUntil: 'load' });
    const href = R.showcaseHref(roster, card);
    const tile = app.locator('section#proof a.tile[href="' + href.replace(/"/g, '\\"') + '"]');
    const why0 = [];
    if ((await tile.count()) !== 1) why0.push('the front page has ' + (await tile.count()) + ' tiles linking ' + href);
    else await tile.click();
    const row = R.walkthroughById(roster, card.id);
    const expect = { landing: landingId('ok'), title: row.title, mode: card.mode, is3D: R.walkthroughIs3D(roster, card.id, card.mode) };
    const { why, st, t1 } = why0.length ? { why: why0, st: null, t1: null } : await studio(expect);
    const errs = await errorsSince(n);
    if (errs.length) why.push(errs.length + ' uncaught error(s): ' + errs.join(' | ').slice(0, 600));
    await shot('card', { card: card.id, mode: card.mode, href, title: st && st.title, landing: st && st.landing, ticks: [t1, st && st.run && st.run.tick] });
    if (why.length) fail('card', card.id + ': ' + why.join('; '));
    else pass('card', 'tile ' + href + ' → STUDIO "' + st.title + '" (' + LANDING + '=' + st.landing + '), worldTick ' + t1 + ' → ' + st.run.tick);
  }
} catch (e) {
  if (e.message !== 'stop') { fail('smoke', e.stack || e.message); }
} finally {
  await browser.close();
}
process.exit(FAIL);
