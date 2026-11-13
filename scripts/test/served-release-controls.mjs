#!/usr/bin/env node
// Controls for scripts/test/served-release.mjs: the gate runs against fixture sites copied whole from <site>
// (default: this repo's site/), never the real site/. Exit 0 only when every row gets its expected verdict: the
// faithful copy PASSES naming each placement, every planted fault FAILS naming its path.
//
//   node scripts/test/served-release-controls.mjs [--site <dir>]
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { placedReleases, siteBuildOf, siteGraph } from './lib/served-roster.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATE = join(HERE, 'served-release.mjs');
const siteArg = process.argv.indexOf('--site');
const SITE = resolve(siteArg === -1 ? join(HERE, '..', '..', 'site') : process.argv[siteArg + 1]);
const PKG_JSON = readFileSync(join(HERE, '..', '..', 'package.json'), 'utf8');
const { build, appHtml } = await siteBuildOf(SITE);
const { SITE_GRAPH_DIR, SITE_BUILD_ATTR, STATIC_APP_PAGE, SITE_ENTRY_PAGES, isSiteEntry } = await siteGraph();
const releases = await placedReleases();
const placedAt = (r, key) => (r.dir ? r.dir + '/' + key : key);
// The local-mode tell the design names: the engine wasm a local build compiles. It must be a placed release's file.
const ENGINE_WASM = 'fat/pkg-web/egpt_wasm_bg.wasm';
if (!releases.some((r) => Object.prototype.hasOwnProperty.call(r.files, ENGINE_WASM))) {
  throw new Error('no placed release lists ' + ENGINE_WASM + ' — the local-wasm control has nothing to plant into; re-pick it from the release');
}
const ENTRY = SITE_ENTRY_PAGES[0];

const SCRATCH = mkdtempSync(join(tmpdir(), 'served-release-controls-'));
let FAIL = 0;
// plant(site, graph) may return a replacement package.json object; the gate then reads the control's copy
function run(name, plant, expect) {
  const site = join(SCRATCH, name.replace(/[^A-Za-z0-9.-]+/g, '_'));
  cpSync(SITE, site, { recursive: true });
  const pkg = plant(site, join(site, SITE_GRAPH_DIR, build)) || JSON.parse(PKG_JSON);
  writeFileSync(site + '.package.json', JSON.stringify(pkg));
  const r = spawnSync(process.execPath, [GATE, '--site', site, '--package', site + '.package.json'], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  rmSync(site, { recursive: true, force: true });
  // expect: 'PASS' (exit 0), 'PASS:<text>' (exit 0 printing <text>), or <text> / [<text>, …] (exit 1 naming each)
  const passing = !Array.isArray(expect) && expect.startsWith('PASS');
  const texts = Array.isArray(expect) ? expect : [expect.startsWith('PASS:') ? expect.slice(5) : passing ? '' : expect];
  const ok = (passing ? r.status === 0 : r.status === 1) && texts.every((t) => out.includes(t));
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + ': want ' + (passing ? 'exit 0' : 'exit 1') + texts.filter(Boolean).map((t) => ' naming "' + t + '"').join(',') + ', got exit ' + r.status + (ok ? '' : ' — ' + out.trim()));
  if (ok && !passing) console.log('      gate: ' + out.split('\n').find((l) => l.includes(texts[0])).trim());
  if (!ok) FAIL = 1;
}
const flipLastByte = (file) => { const b = readFileSync(file); b[b.length - 1] ^= 1; writeFileSync(file, b); };

run('faithful', () => {}, 'PASS');
for (const r of releases) run('faithful-names-' + r.name, () => {}, 'PASS:' + r.name + '@' + r.version + ' ');

// The stamp names the graph.
run('no-build-stamp', (site) => writeFileSync(join(site, STATIC_APP_PAGE), appHtml.replace(new RegExp('\\s' + SITE_BUILD_ATTR + '="[^"]*"'), '')), SITE_BUILD_ATTR);
run('other-build', (site) => writeFileSync(join(site, STATIC_APP_PAGE), appHtml.replace(new RegExp('(' + SITE_BUILD_ATTR + '=")[^"]*"'), '$100000000"')), join(SITE_GRAPH_DIR, '00000000'));

run('other-build-dir-beside', (site) => { mkdirSync(join(site, SITE_GRAPH_DIR, '00000001')); writeFileSync(join(site, SITE_GRAPH_DIR, '00000001', 'x.js'), '//'); }, 'carries another build\'s graph directory (00000001)');

// STUDIO at the site root is the release's bytes (app.html excepted: the assembly writes into it).
const STUDIO_FILE = (() => {
  const r = releases.find((x) => x.dir === '');
  const key = Object.keys(r.files).sort().find((k) => k.startsWith('studio/') && k !== 'studio/' + STATIC_APP_PAGE);
  if (!key) throw new Error('the graph-root release lists no STUDIO file but ' + STATIC_APP_PAGE + ' — the STUDIO control has nothing to plant into');
  return key.slice('studio/'.length);
})();
run('studio-file-off', (site) => appendFileSync(join(site, STUDIO_FILE), ' '), 'site-root file ' + STUDIO_FILE + ' is ');
run('studio-file-missing', (site) => unlinkSync(join(site, STUDIO_FILE)), 'is absent from the site root (' + STUDIO_FILE + ')');

// The graph is each placement's bytes.
run('local-engine-wasm', (site, graph) => appendFileSync(join(graph, ENGINE_WASM), '\0'), 'graph file ' + ENGINE_WASM + ' is ');
for (const r of releases) {
  const key = Object.keys(r.files).sort().find((k) => !isSiteEntry(placedAt(r, k)));
  run('file-off-' + r.name, (site, graph) => appendFileSync(join(graph, placedAt(r, key)), ' '), 'graph file ' + placedAt(r, key) + ' is ');
  run('file-missing-' + r.name, (site, graph) => unlinkSync(join(graph, placedAt(r, key))), 'lists ' + key + ' but it is absent from the graph');
  run('manifest-byte-' + r.name, (site, graph) => flipLastByte(join(graph, placedAt(r, r.manifest.file))), 'graph file ' + placedAt(r, r.manifest.file) + ' is ');
  run('manifest-missing-' + r.name, (site, graph) => unlinkSync(join(graph, placedAt(r, r.manifest.file))), r.manifest.file + ' is absent from the graph');
}
run('planted-graph-file', (site, graph) => writeFileSync(join(graph, 'stray.js'), '//'), 'graph file stray.js is not listed by ');
run('graph-symlink', (site, graph) => symlinkSync(join(graph, ENGINE_WASM), join(graph, 'stray-link.wasm')), join(graphOf('graph-symlink'), 'stray-link.wasm') + ' is not a regular file');

// Each entry has one URL, at SITE_GRAPH_DIR/<entry>, outside the graph.
run('entry-missing', (site) => unlinkSync(join(site, SITE_GRAPH_DIR, ENTRY)), ['entry ' + ENTRY + ' (', 'is absent from ' + SITE_GRAPH_DIR + '/']);
run('entry-in-graph', (site, graph) => copyFileSync(join(site, SITE_GRAPH_DIR, ENTRY), join(graph, ENTRY)), ['entry ' + ENTRY + ' (', 'is still inside the graph']);

// The pins: each placed record is exactly the pinned version.
const withPin = (pkgName, pin) => { const p = JSON.parse(PKG_JSON); p.devDependencies = { ...p.devDependencies, [pkgName]: pin }; return p; };
for (const r of releases) {
  run('pin-off-placed-' + r.name, () => withPin(r.package, r.version + '-p9.1'), 'the pin is ' + r.package + '@' + r.version + '-p9.1');
  run('pin-is-a-range-' + r.name, () => withPin(r.package, '^' + r.version), 'devDependencies["' + r.package + '"] is "^' + r.version + '", not an exact version');
  run('pin-absent-' + r.name, () => { const p = JSON.parse(PKG_JSON); delete p.devDependencies[r.package]; return p; }, 'devDependencies["' + r.package + '"] is undefined, not an exact version');
}

rmSync(SCRATCH, { recursive: true, force: true });
process.exit(FAIL);

function graphOf(name) { return join(SCRATCH, name.replace(/[^A-Za-z0-9.-]+/g, '_'), SITE_GRAPH_DIR, build); }
