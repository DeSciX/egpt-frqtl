#!/usr/bin/env node
// Static gate for the assembled site: what STUDIO needs from the host and what scenes-as-media forbids.
//
//   node scripts/test/site-static.mjs [--site <dir>]      (default: this repo's site/)
//
// Checks:
//   roster-link   <site>/<STATIC_APP_PAGE> carries exactly one roster link (the pinned ./registry rosterLinksOfHtml),
//                 its href absolute by the package's own rule (rosterHrefRefusalOf) and equal to ROSTER_HREF
//                 (scripts/lib/scenes.mjs): inside the store shell a relative /assets/ resolves to another app.
//   host-provided every file <STATIC_APP_PAGE> declares HOST_PROVIDED_ATTR is a SITE_FOREIGN name present in <site>.
//   no-scenes     no directory named scenes and no roster.json anywhere under <site>: they are app media.
// Exit 0 only when every check passes.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { siteGraph } from './lib/served-roster.mjs';
import { ROSTER_FILE, ROSTER_HREF, UPLOAD_PREFIX } from '../lib/scenes.mjs';
import { SITE_FOREIGN, hostProvidedOf } from '../lib/site.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const i = process.argv.indexOf('--site');
const SITE = resolve(i === -1 ? join(ROOT, 'site') : process.argv[i + 1]);
const { STATIC_APP_PAGE, HOST_PROVIDED_ATTR } = await siteGraph();
const { rosterLinksOfHtml, rosterHrefRefusalOf } = await import('@descix/frqtl-web/registry');

let FAIL = 0;
const pass = (n) => console.log('PASS  ' + n);
const fail = (n, why) => { console.log('FAIL  ' + n + ': ' + why); FAIL = 1; };

const appHtml = readFileSync(join(SITE, STATIC_APP_PAGE), 'utf8');
{
  const links = rosterLinksOfHtml(appHtml);
  const why = links.length === 1 ? rosterHrefRefusalOf(links[0].href) : null;
  if (links.length !== 1) fail('roster-link', STATIC_APP_PAGE + ' carries ' + links.length + ' roster links, want exactly 1');
  else if (why) fail('roster-link', why);
  else if (links[0].href !== ROSTER_HREF) fail('roster-link', 'href ' + links[0].href + ' ≠ ROSTER_HREF ' + ROSTER_HREF);
  else pass('roster-link: ' + STATIC_APP_PAGE + ' links ' + ROSTER_HREF);
}
{
  const bad = [];
  for (const name of hostProvidedOf(appHtml, HOST_PROVIDED_ATTR)) {
    if (!SITE_FOREIGN.includes(name)) bad.push(name + ' is not a SITE_FOREIGN name');
    else if (!existsSync(join(SITE, name))) bad.push(name + ' is missing from ' + SITE);
  }
  if (bad.length) fail('host-provided', bad.join('; '));
  else pass('host-provided: every ' + HOST_PROVIDED_ATTR + ' file is in ' + SITE);
}
{
  const stray = [];
  (function walk(rel) {
    for (const d of readdirSync(join(SITE, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + d.name : d.name;
      if ((d.isDirectory() && d.name === UPLOAD_PREFIX) || d.name === ROSTER_FILE) stray.push(r);
      if (d.isDirectory()) walk(r);
    }
  })('');
  if (stray.length) fail('no-scenes', 'the site holds ' + stray.join(', ') + ' — scenes and the roster are app media');
  else pass('no-scenes: no ' + UPLOAD_PREFIX + '/ directory and no ' + ROSTER_FILE + ' under ' + SITE);
}
process.exit(FAIL);
