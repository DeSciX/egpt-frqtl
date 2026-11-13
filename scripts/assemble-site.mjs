#!/usr/bin/env node
/**
 * assemble-site — build site/ from the pinned npm packages.
 *
 *   node scripts/assemble-site.mjs        (npm run assemble)
 *
 * 1. Each SITE_PLACEMENTS package must be installed at the version package.json pins (else npm ci).
 * 2. `assembleSite` (@descix/frqtl-web/site-assemble) writes STUDIO (the package's ./studio) at the site root and
 *    the placed dists under pub/<build>/, writes the roster link (ROSTER_HREF, scripts/lib/scenes.mjs) into
 *    app.html and proves the graph (G-GRAPH). <build> is the first 8 hex of the sha256 of the placed releases'
 *    `name@version <dist-manifest.json sha256>` lines, so a new release is a new graph directory.
 * 3. The site files this repo owns (SITE_FOREIGN, scripts/lib/site.mjs) are carried over from site/; every name
 *    app.html declares host-provided must be one of them and present. The assembly may ship none of them, no
 *    scenes/ directory and no roster.json: scenes and the roster are app media.
 * 4. site/ is replaced (staged beside it, so a failure leaves site/ untouched) and .descix/site-provenance.json
 *    written: the build, the releases, the roster href, the file count and tree fingerprint of the assembled
 *    files (scripts/lib/tree.sh, SITE_FOREIGN excluded).
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { placedReleases, siteGraph } from './test/lib/served-roster.mjs';
import { ROSTER_HREF } from './lib/scenes.mjs';
import { SITE_FOREIGN, hostProvidedOf } from './lib/site.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'site');
const PROVENANCE = join(ROOT, '.descix', 'site-provenance.json');
const fail = (msg) => { throw new Error('assemble-site: ' + msg); };

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const releases = await placedReleases();
for (const r of releases) {
    const pin = (pkg.devDependencies || {})[r.package];
    if (pin !== r.version) { fail('package.json pins ' + r.package + ' ' + JSON.stringify(pin) + ' but ' + r.version + ' is installed — run npm ci.'); }
}
const { HOST_PROVIDED_ATTR, STATIC_APP_PAGE } = await siteGraph();
const { assembleSite } = await import('@descix/frqtl-web/site-assemble');
const distOf = (name) => dirname(releases.find((r) => r.package === name).path);
const build = createHash('sha256').update(releases.map((r) => r.name + '@' + r.version + ' ' + r.manifest.sha256 + '\n').join('')).digest('hex').slice(0, 8);

const stage = mkdtempSync(join(ROOT, '.assemble-stage-'));
try {
    const out = join(stage, 'site');
    const res = assembleSite({ out, build, rosterHref: ROSTER_HREF, webDist: distOf('@descix/frqtl-web'), mathDist: distOf('@descix/egpt-math-sdk') });

    for (const name of SITE_FOREIGN) {
        if (existsSync(join(out, name))) { fail('the assembly ships ' + name + ', which this repo owns outside it (SITE_FOREIGN).'); }
    }
    const stray = [];
    (function walk(rel) {
        for (const d of readdirSync(join(out, rel), { withFileTypes: true })) {
            const r = rel ? rel + '/' + d.name : d.name;
            if ((d.isDirectory() && d.name === 'scenes') || d.name === 'roster.json') { stray.push(r); }
            if (d.isDirectory()) { walk(r); }
        }
    })('');
    if (stray.length) { fail('the assembly ships ' + stray.join(', ') + ' — scenes and the roster are app media, never site files.'); }

    for (const name of hostProvidedOf(readFileSync(join(out, STATIC_APP_PAGE), 'utf8'), HOST_PROVIDED_ATTR)) {
        if (!SITE_FOREIGN.includes(name)) { fail(STATIC_APP_PAGE + ' declares "' + name + '" ' + HOST_PROVIDED_ATTR + ', which is not a site file this repo owns (SITE_FOREIGN: ' + SITE_FOREIGN.join(', ') + ').'); }
        if (!existsSync(join(SITE, name))) { fail(STATIC_APP_PAGE + ' declares "' + name + '" ' + HOST_PROVIDED_ATTR + ', and site/' + name + ' is missing.'); }
    }
    for (const name of SITE_FOREIGN) {
        if (existsSync(join(SITE, name))) { cpSync(join(SITE, name), join(out, name), { recursive: true }); }
    }

    if (existsSync(SITE)) { renameSync(SITE, join(stage, 'site-before')); }
    renameSync(out, SITE);

    const tree = (fn) => {
        const r = spawnSync('bash', ['-c', '. "$1"; shift; ' + fn + ' "$@"', 'tree', join(ROOT, 'scripts/lib/tree.sh'), SITE, ...SITE_FOREIGN], { encoding: 'utf8' });
        if (r.status !== 0 || !r.stdout.trim()) { fail(fn + ' failed: ' + r.stderr); }
        return r.stdout.trim();
    };
    const record = {
        assembled_by_script: 'scripts/assemble-site.mjs',
        build,
        releases: releases.map((r) => ({ name: r.name, version: r.version, dist_manifest_sha256: r.manifest.sha256 })),
        roster_href: ROSTER_HREF,
        app_page: STATIC_APP_PAGE,
        file_count: Number(tree('tree_file_count')),
        tree_sha256: tree('tree_sha256'),
        tree_excludes: SITE_FOREIGN,
    };
    writeFileSync(PROVENANCE, JSON.stringify(record, null, 2) + '\n');
    console.log('assemble-site: site/ is build ' + build + ' of ' + res.releases.join(', ') + ': ' + res.graphFiles + ' graph files, ' +
        res.entries.length + ' entry pages, ' + res.appFiles.length + ' site-root files; roster link ' + ROSTER_HREF +
        '; ' + record.file_count + ' assembled files, tree ' + record.tree_sha256);
} finally {
    rmSync(stage, { recursive: true, force: true });
}
