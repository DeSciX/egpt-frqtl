// The one locator of what a site SERVES and of the releases and the roster it is held to (frontpage.mjs,
// frontpage-tiles.mjs, lib/frontpage-fixture.mjs, served-release.mjs, assemble-site.mjs). The site's shape (its graph
// directory, the build-stamp reader of its IDE page and the build-id pattern, the IDE page's name, the package
// placements) is the pinned @descix/frqtl-web ./site-graph export. The roster is this repo's scenes/roster.json,
// normalized by the pinned ./registry export at its media URL (scripts/lib/scenes.mjs ROSTER_HREF): the bytes the
// media serves once uploaded. No path, attribute, pattern or placed package is typed here.
//
//   await siteGraph() → the ./site-graph export
//   await siteBuildOf(site) → { build, page, appHtml }: the stamp on <site>/<STATIC_APP_PAGE>, non-null and a build id
//   await otherBuildDirs(site, build) → the <site>/<SITE_GRAPH_DIR>/ directories named like a build id (SITE_BUILD_ID_RE)
//       other than <build>: another build's graph beside this one
//   await placedReleases() → one row per SITE_PLACEMENTS row, read from the ONE installed record
//       <row.package>/dist-manifest.json: { package, dir, name, version, files, manifest: { file, sha256 }, path }
//   await siteRoster([rosterFile]) → { R, roster }: R the pinned ./registry module (sceneKey, showcaseHref,
//       showcaseUrl, … — one instance, whose readers take only its own bags), roster = R.normalizeRoster(<file>, ROSTER_HREF)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROSTER_FILE, ROSTER_HREF, UPLOAD_PREFIX } from '../../lib/scenes.mjs';

export const ROSTER_PKG = '@descix/frqtl-web';
const REGISTRY_EXPORT = ROSTER_PKG + '/registry';
const SITE_GRAPH_EXPORT = ROSTER_PKG + '/site-graph';

function resolveExport(spec) {
  try { return fileURLToPath(import.meta.resolve(spec)); }
  catch (e) {
    throw new Error(spec + ' does not resolve — run npm ci (package.json pins ' + ROSTER_PKG + '): ' + e.message);
  }
}

// The pinned package's ./site-graph export: the names a static FRQTL site's documents carry.
export async function siteGraph() {
  const url = pathToFileURL(resolveExport(SITE_GRAPH_EXPORT)).href;
  return import(url);
}

// The build a site serves: the one stamp on <site>/<STATIC_APP_PAGE>, read by the package's siteBuildStampOf (which
// throws on more than one), refused when absent or not a build id.
export async function siteBuildOf(SITE) {
  const { SITE_BUILD_ATTR, SITE_BUILD_ID_RE, STATIC_APP_PAGE, siteBuildStampOf } = await siteGraph();
  const page = join(SITE, STATIC_APP_PAGE);
  const appHtml = readFileSync(page, 'utf8');
  let build;
  try { build = siteBuildStampOf(appHtml); }
  catch (e) { throw new Error(page + ': ' + e.message + ' — run npm run assemble'); }
  if (build === null) throw new Error(page + ' carries no ' + SITE_BUILD_ATTR + ' stamp — run npm run assemble');
  if (!SITE_BUILD_ID_RE.test(build)) throw new Error(page + ' is stamped ' + SITE_BUILD_ATTR + '=' + JSON.stringify(build) + ', not a build id (' + SITE_BUILD_ID_RE + ')');
  return { build, page, appHtml };
}

// Another build's graph beside <build>: siteGraphFaults judges only <build>/ and the entries, so a stray
// <SITE_GRAPH_DIR>/<build id>/ is refused by this scan alone.
export async function otherBuildDirs(SITE, build) {
  const { SITE_GRAPH_DIR, SITE_BUILD_ID_RE } = await siteGraph();
  return readdirSync(join(SITE, SITE_GRAPH_DIR), { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== build && SITE_BUILD_ID_RE.test(d.name)).map((d) => d.name).sort();
}

// The releases the site is held to: for each SITE_PLACEMENTS row, the installed <row.package>/dist-manifest.json,
// parsed (name, version, files) and fingerprinted (its dist-relative name and the sha256 of its bytes: the record no
// manifest lists). A record that is not the row's package is refused.
export async function placedReleases() {
  const { SITE_PLACEMENTS } = await siteGraph();
  if (!Array.isArray(SITE_PLACEMENTS) || !SITE_PLACEMENTS.length) throw new Error(SITE_GRAPH_EXPORT + ' exports no SITE_PLACEMENTS rows');
  return SITE_PLACEMENTS.map((row) => {
    const path = resolveExport(row.package + '/dist-manifest.json');
    const bytes = readFileSync(path);
    let rec;
    try { rec = JSON.parse(bytes.toString('utf8')); }
    catch (e) { throw new Error(path + ' is not JSON (' + e.message + ') — run npm ci'); }
    if (rec.name !== row.package) throw new Error(path + ' records name ' + JSON.stringify(rec.name) + ', but it is the installed record of the placement ' + row.package + ' — run npm ci');
    if (typeof rec.version !== 'string' || !rec.files || typeof rec.files !== 'object') throw new Error(path + ' carries no version or files table');
    return {
      package: row.package, dir: row.dir, name: rec.name, version: rec.version, files: rec.files, path,
      manifest: { file: basename(path), sha256: createHash('sha256').update(bytes).digest('hex') },
    };
  });
}

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..', '..');

export async function siteRoster(rosterFile = join(ROOT, UPLOAD_PREFIX, ROSTER_FILE)) {
  const R = await import(REGISTRY_EXPORT);
  let json;
  try { json = JSON.parse(readFileSync(rosterFile, 'utf8')); }
  catch (e) { throw new Error(rosterFile + ' is unreadable or not JSON: ' + e.message); }
  return { R, roster: R.normalizeRoster(json, ROSTER_HREF) };
}
