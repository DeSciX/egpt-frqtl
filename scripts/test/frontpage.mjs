#!/usr/bin/env node
// Gate for the authored front page, site/index.html. Exit 0 only when every check passes.
//
//   node scripts/test/frontpage.mjs
//
// Checks:
//   order  — section#proof (the cards) is the first element after the nav, above the hero.
//   lede   — the #proof lede is the CEO-approved paragraph, exactly.
//   hrefs  — every #proof tile opens the SDK player (pub/index.html) on a scene id the SERVED
//            registries (site/pub/ide/registry/) declare, with a mode that rung declares.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const html = readFileSync(join(ROOT, 'site', 'index.html'), 'utf8');
let FAIL = 0;
const pass = (n) => console.log('PASS  ' + n);
const fail = (n, why) => { console.log('FAIL  ' + n + ': ' + why); FAIL = 1; };

const decode = (s) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const text = (s) => decode(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();

// ── order ────────────────────────────────────────────────────────────────────
{
  const navEnd = html.indexOf('</nav>');
  const after = navEnd < 0 ? '' : html.slice(navEnd + '</nav>'.length);
  const first = after.match(/<(section|header|main|div)\b[^>]*>/);
  if (navEnd < 0) fail('order', 'no </nav> in site/index.html');
  else if (!first || !/\bid="proof"/.test(first[0]) || first[1] !== 'section')
    fail('order', 'first element after </nav> is ' + (first ? first[0] : '(none)') + ', not <section id="proof">');
  else pass('order: section#proof is the first element after the nav');
}

// The #proof section body.
const proofMatch = html.match(/<section\b[^>]*\bid="proof"[^>]*>([\s\S]*?)<\/section>/);
const proof = proofMatch ? proofMatch[1] : '';
if (!proofMatch) fail('proof', 'no <section id="proof"> in site/index.html');

// ── lede ─────────────────────────────────────────────────────────────────────
{
  const LEDE = 'FRQTL is an actual quantum computer that runs so efficiently it calculates what the ' +
    'father of quantum computing called ‘absolutely impossible.’ In 1981 Feynman birthed the idea of ' +
    'what you know as qubit based quantum computing. FRQTL takes a different approach based on the ' +
    'Monte Carlo method and the work of Stanislaw Ulam. FRQTL’s model is inspired by the approach of ' +
    'Stanislaw Ulam which was continued after the Manhattan Project at Los Alamos National Laboratory ' +
    'and later pursued at Brookhaven National Laboratory Quantum Chromodynamics (QCD) and ' +
    'super-computing projects.';
  const m = proof.match(/<div class="sec-head">[\s\S]*?<p class="lede">([\s\S]*?)<\/p>/);
  const got = m ? text(m[1]) : '(no lede)';
  if (got === LEDE) pass('lede: the #proof lede is the approved paragraph');
  else fail('lede', 'got "' + got + '"');
}

// ── hrefs ────────────────────────────────────────────────────────────────────
{
  const reg = join(ROOT, 'site', 'pub', 'ide', 'registry');
  const W = await import(pathToFileURL(join(reg, 'walkthrough.js')).href);
  const E = await import(pathToFileURL(join(reg, 'experiments.js')).href);
  const tiles = [...proof.matchAll(/<a class="tile[^"]*" href="([^"]*)"[\s\S]*?<b>([^<]*)<\/b>[\s\S]*?<i>([^<]*)<\/i>/g)]
    .map(([, href, title, cta]) => ({ href: decode(href), title, cta }));
  if (tiles.length !== 9) fail('hrefs', 'expected 9 #proof tiles, found ' + tiles.length);
  for (const { href, title, cta } of tiles) {
    const n = 'hrefs: ' + title;
    const [path, query = ''] = href.split('?');
    if (path !== 'pub/index.html') { fail(n, href + ' is not a player URL (pub/index.html)'); continue; }
    const q = new URLSearchParams(query);
    const keys = [...q.keys()].sort().join(',');
    if (keys === 'rung' || keys === 'mode,rung') {
      const rung = W.WALKTHROUGH.find((r) => r.id === q.get('rung'));
      if (!rung) { fail(n, 'rung "' + q.get('rung') + '" is not in the walkthrough registry'); continue; }
      const modes = (rung.modes || []).map((m) => m.id);
      if (q.has('mode') && !modes.includes(q.get('mode'))) {
        fail(n, 'mode "' + q.get('mode') + '" is not declared by ' + rung.id + ' [' + modes.join(',') + ']'); continue;
      }
    } else if (keys === 'experiment') {
      if (!E.EXPERIMENTS.some((x) => x.id === q.get('experiment'))) {
        fail(n, 'experiment "' + q.get('experiment') + '" is not in the experiments registry'); continue;
      }
    } else { fail(n, href + ' names neither exactly one rung (+mode) nor one experiment'); continue; }
    if (cta !== 'Open live ↗') { fail(n, 'call to action is "' + cta + '", not "Open live ↗"'); continue; }
    pass(n + ' → ' + href);
  }
}

process.exit(FAIL);
