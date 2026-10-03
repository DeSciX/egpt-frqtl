#!/usr/bin/env node
// Gate for the authored front page, site/index.html. Exit 0 only when every check passes.
//
//   node scripts/test/frontpage.mjs
//
// Checks:
//   order  — section#proof (the cards) is the first element after the nav, above the hero.
//   lede   — the #proof lede is the CEO-approved paragraph, exactly.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

process.exit(FAIL);
