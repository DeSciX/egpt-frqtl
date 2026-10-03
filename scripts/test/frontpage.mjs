#!/usr/bin/env node
// Gate for the authored front page, site/index.html. Exit 0 only when every check passes.
//
//   node scripts/test/frontpage.mjs
//
// Checks:
//   order  — section#proof (the cards) is the first element after the nav, above the hero.
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

process.exit(FAIL);
