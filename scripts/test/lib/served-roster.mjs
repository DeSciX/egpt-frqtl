// The one locator of what a site SERVES and of the releases it is held to (frontpage.mjs, frontpage-tiles.mjs,
// lib/frontpage-fixture.mjs, served-release.mjs, lib/verification.sh). The site's shape (its graph directory, the
// build-stamp reader of its IDE page and the build-id pattern, the IDE page's name, the package placements) is the
// pinned @descix/frqtl-web ./site-graph export. The build is siteBuildStampOf(<site>/<STATIC_APP_PAGE>) (the bytes
// the refresh published); the in-graph registry path is derived from the pinned package's ./registry export, made
// relative to the package's dist root (the directory holding its exported dist-manifest.json), and joined onto
// <site>/<SITE_GRAPH_DIR>/<build>/. No path, attribute, pattern or placed package is typed here; never FRAQTL's tree.
//
//   await siteGraph() → the ./site-graph export
//   await siteBuildOf(site) → { build, page, appHtml }: the stamp on <site>/<STATIC_APP_PAGE>, non-null and a build id
//   await otherBuildDirs(site, build) → the <site>/<SITE_GRAPH_DIR>/ directories named like a build id (SITE_BUILD_ID_RE)
//       other than <build>: another build's graph beside this one
//   await placedReleases() → one row per SITE_PLACEMENTS row, read from the ONE installed record
//       <row.package>/dist-manifest.json: { package, dir, name, version, files, manifest: { file, sha256 }, path }
//   await servedRegistryDir(site) → { build, appHtml, dir, rel, distRoot, entry }
//       dir: <site>/<SITE_GRAPH_DIR>/<build>/<rel>; rel: the registry directory relative to the dist root;
//       entry: the export's entry file name inside it
//   await servedRegistries(site) → { build, appHtml, X }
//       X: the SERVED copy of the ./registry export's entry module — EXHIBITS, showcaseHref, showcaseUrl,
//       SHOWCASE_SITE, sceneKey, walkthroughById, … from ONE module instance (showcaseHref refuses a row
//       of any other instance)
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROSTER_PKG = '@descix/frqtl-web';
const REGISTRY_EXPORT = ROSTER_PKG + '/registry';
const MANIFEST_EXPORT = ROSTER_PKG + '/dist-manifest.json';
const SITE_GRAPH_EXPORT = ROSTER_PKG + '/site-graph';

function resolveExport(spec) {
  try { return fileURLToPath(import.meta.resolve(spec)); }
  catch (e) {
    throw new Error(spec + ' does not resolve — run npm ci (package.json pins ' + ROSTER_PKG + '): ' + e.message);
  }
}

// The pinned package's dist root, its manifest file, its registry directory relative to that root (posix
// form, as dist-manifest.json keys its files) and its release name.
export function pinnedRegistry() {
  const entry = resolveExport(REGISTRY_EXPORT);
  const manifest = resolveExport(MANIFEST_EXPORT);
  const distRoot = dirname(manifest);
  const rel = relative(distRoot, dirname(entry));
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(REGISTRY_EXPORT + ' resolves to ' + entry + ', outside the dist root ' + distRoot + ' (the directory holding ' +
      MANIFEST_EXPORT + ') — the package does not place its registry in its dist graph');
  }
  const { version } = JSON.parse(readFileSync(resolveExport(ROSTER_PKG + '/package.json'), 'utf8'));
  return { distRoot, manifest, rel: rel.split(sep).join('/'), entry: basename(entry), release: ROSTER_PKG + '@' + version, version };
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
  catch (e) { throw new Error(page + ': ' + e.message + ' — refresh site/ from a bundle stamped once (scripts/refresh-site.sh)'); }
  if (build === null) throw new Error(page + ' carries no ' + SITE_BUILD_ATTR + ' stamp — refresh site/ from a stamped bundle (scripts/refresh-site.sh)');
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

export async function servedRegistryDir(SITE) {
  const { SITE_GRAPH_DIR } = await siteGraph();
  const { build, appHtml } = await siteBuildOf(SITE);
  const { distRoot, rel, entry } = pinnedRegistry();
  return { build, appHtml, dir: join(SITE, SITE_GRAPH_DIR, build, ...rel.split('/')), rel, distRoot, entry };
}

export async function servedRegistries(SITE) {
  const { build, appHtml, dir, entry } = await servedRegistryDir(SITE);
  const file = join(dir, entry);
  if (!existsSync(file)) {
    throw new Error(file + ' is missing — the site serves build ' + build + ', which ships no copy of the ' + REGISTRY_EXPORT +
      ' entry; the tiles are the served showcase roster, so refresh site/ from a FRAQTL bundle of the pinned release (scripts/refresh-site.sh)');
  }
  const X = await import(pathToFileURL(file).href);
  return { build, appHtml, X };
}
