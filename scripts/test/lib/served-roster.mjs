// The one loader of the registries a site SERVES (frontpage.mjs, lib/frontpage-fixture.mjs): the
// build is the data-frqtl-site-build stamp on <site>/app.html (the bytes the refresh published), the
// modules are <site>/pub/<build>/ide/registry/{exhibits,walkthrough,experiments}.js. Never FRAQTL's tree.
//
//   await servedRegistries(site) → { build, appHtml, X (exhibits), W (walkthrough), E (experiments) }
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function servedRegistries(SITE) {
  const appHtml = readFileSync(join(SITE, 'app.html'), 'utf8');
  const stamps = [...appHtml.matchAll(/<html\b[^>]*\bdata-frqtl-site-build="([^"]*)"/g)].map((m) => m[1]);
  if (stamps.length !== 1 || !/^[0-9a-f]{8}$/.test(stamps[0])) {
    throw new Error(join(SITE, 'app.html') + ' must carry exactly one data-frqtl-site-build="<8 hex>" stamp (got ' +
      JSON.stringify(stamps) + ') — refresh site/ from a stamped bundle (scripts/refresh-site.sh)');
  }
  const build = stamps[0];
  const reg = join(SITE, 'pub', build, 'ide', 'registry');
  const mods = {};
  for (const [key, file] of [['X', 'exhibits.js'], ['W', 'walkthrough.js'], ['E', 'experiments.js']]) {
    if (!existsSync(join(reg, file))) {
      throw new Error(join(reg, file) + ' is missing — the site serves build ' + build + ', which ships no ' + file +
        ' in its registry; the tiles are the served showcase roster, so refresh site/ from a FRAQTL bundle that serves it (scripts/refresh-site.sh)');
    }
    mods[key] = await import(pathToFileURL(join(reg, file)).href);
  }
  return { build, appHtml, ...mods };
}
