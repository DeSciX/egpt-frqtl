# egpt-frqtl — PROD app

The DeSciX PROD home for the FRQTL IDE, its knowledge bases and its Claude Code plugin. The app
is served at **https://egpt-frqtl.descix.net/**; its MCP connector is **https://descix.net/mcp**.

Self-contained by design: no cross-site linking, and no FRAQTL-monorepo-only route survives in the
bundle. **PROD is deliberately not a mirror of DEV.**

## Make a new impossible card

Developers are encouraged to make new impossible cards — Three.js-oriented developers especially. A
card is a scene the FRQTL engine computes live in the visitor's tab: compose it from the SDK's parts,
render it with the renderer you already know, and propose it for the front page's "Impossible things,
running." grid (`site/index.html`, section `#proof`). The grid is the showcase of this repo's roster,
`scenes/roster.json` (`scenes/README.md`): a new card is a scene in `scenes/src/`, its roster row and a showcase
card, and its tile opens the scene in STUDIO.

## Layout

```
site/                          the ONLY directory uploaded as the site
  index.html                   front page — built from the shared template (CLAUDE.md), never written
                               by the assembly; its #proof tiles are the roster's showcase cards
  images/*                     front-page images (template images, tile stills images/<sceneKey>.png) —
                               generator output with index.html, never written by the assembly
  DeSciXAppSDK.js              DeSciX app-side SDK — generator output with index.html, never written by the assembly
  share.json                   share metadata the edge worker injects into the shell head; its
                               icon and share image live in images/share/ — never written by the assembly
  app.html                     STUDIO — @descix/frqtl-web ./studio, with the build stamp, the import map and the
                               roster link (the absolute media URL of scenes/roster.json) written in
  app-assets/*                 STUDIO's hashed chunks (vite owns this namespace)
  app-assets/host-view.js      STUDIO's one unhashed entry: asks the shell for full-screen
  pub/sdk.html, pub/experiments/<id>/index.html
                               the packages' HTML entries — fixed URLs, served no-store
  pub/<build>/*                everything those entries load: the @descix/frqtl-web dist at the root and the
                               @descix/egpt-math-sdk dist at egpt-math-sdk/ — <build> is the app.html stamp, the
                               sha8 of the placed releases, so a new release is a new directory
kb/
  General/                     adopted — FRAQTL `make publish-corpus` output, never hand-edited
  frqtl_sdk/                   adopted — FRAQTL `make publish-corpus` output, never hand-edited
  HowToSee/                    authored here — method corpus
  Personas/                    authored here — frqtl-sdk-builder, frqtl-experiment-designer
  Recipes/                     authored here — dse-planar
plugin/                        Claude Code plugin `frqtl` (install string frqtl@egpt)
scenes/                        the showcase scenes (src/) and their roster — app media, never in site/;
                               scenes/README.md owns their procedure
scripts/
  assemble-site.mjs            build site/ from the pinned npm packages (`npm run assemble`)
  refresh-kb.sh                replace kb/General or kb/frqtl_sdk from a publish-corpus output dir
  lib/tree.sh                  the tree fingerprint (refresh-kb.sh, assemble-site.mjs)
  lib/scenes.mjs               the app origin, the media prefix, the roster's name and absolute URL, sha8
  lib/site.mjs                 SITE_FOREIGN (the site files this repo owns outside the assembly)
  upload-scenes.mjs            upload the scenes and the roster as app media, then read them back
  ship.sh                      the site ladder: assemble check, gates, local smoke, upload, served == built, PROD smoke
  site-upload.mjs              descix site upload (and --dry-run) through the PROD-banner-checked CLI owner
  served-equals-built.mjs      every published site file's PROD bytes == site/ (sha256)
  lib/descix.mjs               the one runner of the published CLI (refuses a non-PROD first line)
  scene-check.mjs              static gate on scenes/ (`npm run scene-check`): imports vs the pinned exports, the
                               roster by the pinned normalizeRoster, content-addressed sources, the planned upload list
  lib/share-contract.mjs       the pre-upload check of site/share.json against runbook §7.3
  test/frontpage.mjs           static gate for site/index.html: #proof cards first, approved lede, tiles ==
                               the roster's showcase cards in order (title, tile line, href == the card's
                               showcaseHref, still and its alt), every card's still present (by sceneKey), the
                               through-line == the roster's showcase.throughLine (the pinned ./registry readers)
  test/frontpage-controls.mjs  controls for frontpage.mjs on fixture front pages (`npm test`)
  test/frontpage-tiles.mjs     browser gate: every #proof tile lands on STUDIO with its scene booted and
                               zero Monaco requests at open; the IDE's brand links to the front page
  test/frontpage-tiles-controls.mjs  controls for frontpage-tiles.mjs (unknown id, GYM tile, Monaco at open,
                               no home link)
  test/served-release.mjs      gate: the whole served graph (pub/<build>/, the entries beside it and STUDIO at the
                               root) is the pinned releases, byte for byte, by the pinned ./site-graph
                               siteGraphFaults, no other build's graph sits beside it, and each pin is installed
  test/site-static.mjs         gate: app.html's one roster link is ROSTER_HREF (absolute), host-provided files
                               present, no scenes/ or roster.json in the site
  test/site-static.test.mjs    controls for site-static.mjs (`npm test`)
  test/served-release-controls.mjs  controls for served-release.mjs (`npm test`)
  test/lib/                    the served-site locator (build stamp, placed releases, the roster), the #proof
                               reader and the fixture builders the gates and controls share
  test/host-view.mjs           browser gate: site/ pages under a stub shell BUS, real SDK bytes
  test/studio-smoke.mjs        browser smoke through the App Shell at a root URL (local gateway or PROD): first
                               contact, the dropdown's roster groups, a showcase tile's scene running; stills
  test/host-view/              its shell-harness page — a fixture, outside site/
  test/share-contract.mjs      controls for lib/share-contract.mjs (`npm test`)
  test/scene-check.test.mjs    controls for scene-check.mjs (`npm test`)
.descix/
  manifests/site.json          site publish allowlist
  manifests/<KB>.json          one KB manifest per kb/<KB> directory
  site-provenance.json         written by scripts/assemble-site.mjs
  kb-provenance.json           written by scripts/refresh-kb.sh
  workspace.json, wallet.json  per-developer config and credentials — gitignored, never committed
  sync-state/                  per-developer KB sync state — gitignored
```

`site/`'s two namespaces are **disjoint**. Serving the sdk dist at root collides with the IDE's own
`app.html` and the front page `index.html`.

## Refreshing content

Provenance is read from the artifacts' bytes by the scripts, never typed by hand. Each script exits non-zero
and changes nothing when an input fails a check.

### Site

```
npm ci && npm run assemble
```

`scripts/assemble-site.mjs` builds `site/` from the pinned `@descix/frqtl-web` and `@descix/egpt-math-sdk`; nothing
is copied from FRAQTL. It refuses, `site/` untouched, unless each placed package is installed at the version
`package.json` pins. `assembleSite` (`@descix/frqtl-web/site-assemble`) places STUDIO (`./studio`) at the site root and
the dists under `pub/<build>/`, writes the build stamp, the import map and the roster link
(`https://egpt-frqtl.descix.net/assets/scenes/roster.json`, `scripts/lib/scenes.mjs` ROSTER_HREF: absolute, because
inside the store shell a relative `/assets/` resolves to another app) into `app.html`, and proves the graph is the
releases' bytes. `<build>` is the first 8 hex of the sha256 of the placed releases' `name@version <dist-manifest.json
sha256>` lines.

The site files this repo owns (`scripts/lib/site.mjs` SITE_FOREIGN: `index.html`, `images`, `DeSciXAppSDK.js`,
`share.json`) are carried over from `site/` byte-identical. The assembly refuses when it ships one of them, a
`scenes/` directory or a `roster.json` (scenes are app media), or when `app.html` declares a `data-frqtl-host-provided`
file that is not one of them or is missing.

It writes `.descix/site-provenance.json`:

```
{ assembled_by_script, build, releases: [{ name, version, dist_manifest_sha256 }], roster_href, app_page,
  file_count, tree_sha256, tree_excludes }
```

`file_count` and `tree_sha256` cover the assembled files only; `tree_excludes` is SITE_FOREIGN.

Pin bump: bump BOTH exact pins in `package.json` to the new releases, `npm ci`, `npm run assemble`, then the gates;
`scripts/test/served-release.mjs` holds the served graph to the pins, so a bump without the assembly is red.

### Adopted KBs

```
scripts/refresh-kb.sh <FRAQTL checkout>/.corpus-out/General General
scripts/refresh-kb.sh <FRAQTL checkout>/.corpus-out/frqtl_sdk frqtl_sdk
```

The first argument is the directory FRAQTL `make publish-corpus` writes for that corpus,
`.corpus-out/<corpus>/` at the root of the FRAQTL checkout — a gitignored build artifact. The corpus
and KB names are the same today (`General`, `frqtl_sdk`).
The destination is read from `.descix/manifests/<KB>.json`. Every markdown file in the input must
open with the publish-corpus `GENERATED` stamp (source path, commit sha, commit date); the per-file
stamps are recorded under the KB's key in `.descix/kb-provenance.json`, with non-markdown files
listed as `unstamped_files`, and stripped from the files written to `kb/`. Provenance lives only in
`kb-provenance.json`: the script fails if an input markdown file has no stamp or if any stamp text
survives in the output. Links to `dev.descix.net` are rewritten to `descix.net` and the count is
recorded as `host_rewrites_dev_to_prod`.

`HowToSee`, `Personas` and `Recipes` are edited in place in `kb/`.

### Tree fingerprint

`tree_sha256` is the sha256 of the sorted `sha256  ./path` listing of every file in the tree, minus
any top-level `tree_excludes` (`scripts/lib/tree.sh::tree_sha256`). To re-check `site/` against its
record, with the owner function and the record's own excludes:

```
(. scripts/lib/tree.sh; tree_sha256 site $(jq -r '.tree_excludes[]' .descix/site-provenance.json))
```

**Inside `tree_sha256`, `-print0 | sort -z | xargs -0` is load-bearing.** `site/pub/<build>/images/` contains a filename with
spaces (`particles which did not go through a slit at all.png`). A plain `find | xargs shasum`
splits on whitespace, silently skips that file, and yields a fingerprint that cannot detect a change
to it.

## Deploying

`descix …` is the published CLI exactly as CLAUDE.md's CLI line pins it (an `npx` invocation; it is not a dependency). Run from the repo root with a PROD `.descix/workspace.json` (`descix config show` prints the
workspace, API URL and environment in use). Always dry-run first.

| What | Command |
|---|---|
| Site front-page gates | `node scripts/test/frontpage.mjs` (static) and `node scripts/test/frontpage-tiles.mjs --port <n>` (browser) against `site/`, with `node scripts/test/frontpage-tiles-controls.mjs --port <n>` beside it (the browser gate's negative detectors fail open on drift; the controls show they still bite) — all must report every row PASS before `descix site upload` |
| Site host-view gate | `node scripts/test/host-view.mjs --port <n>` against `site/` — must report 5/5 PASS before `descix site upload` |
| Site share-contract gate | `node scripts/lib/share-contract.mjs` — `site/share.json` (the link-preview card; contract: the app-developer runbook §7.3) must report PASS before `descix site upload`; it reports ABSENT and exits 0 when there is none |
| Scenes | `node scripts/upload-scenes.mjs --checkout <checkout>` (scenes/README.md) |
| Site | `scripts/ship.sh --checkout <checkout> --port <n>`: every gate above, `descix site upload --dry-run`, the upload, served == built, the PROD smoke |
| One KB | `descix kb corpus sync --kb <General\|frqtl_sdk\|HowToSee\|Personas\|Recipes> --dry-run`, then without `--dry-run` |

- `descix site upload` uses `.descix/manifests/site.json`. Its only source is `site` with an
  explicit include allowlist (the manifest's `include`), so `assets/`, `kb/`, `plugin/`, `scripts/`
  (with the host-view shell harness) and `.descix/` are never uploaded. Site URLs are non-expiring and unsigned;
  never add a source whose path is `.` or a repo-root directory. SiteWalker traps: an empty
  `include` matches everything, `exclude` is tested **before** `include`, and a bare-name directory
  exclude matches that name at any depth.
- `descix kb corpus sync` reads KB files from the working tree, but takes each tracked file's blob
  sha — its chunk id and the key the delta sync compares — from the manifest `ref`; a tracked file
  edited but not committed is treated as unchanged. Sync from a clean checkout of `main`
  (`git status` empty).

## Plugin

`plugin/` is the `frqtl` Claude Code plugin: two loader skills (`/frqtl-builder`,
`/frqtl-designer`), the same two seats as agents, and the `descix` HTTP connector at
`https://descix.net/mcp`. Validate before publishing:

```
claude plugin validate --strict plugin
```

## Two traps this repo exists to stop repeating

1. **Never refresh `site/` from `apps/ide/dist/`.** It is half a site — no `/pub` payload, and a
   bare `vite build` leaves it in DEV-CORE mode with every engine/monaco/notebook/math URL resolving
   at `/frqtl/…` and `/egpt-src/…`, which nothing serves on a backend-less host.
2. **A stale `.deploy-static/` looks exactly like a fresh one.** The assembly directory is
   gitignored and survives between builds. Compare the `data-frqtl-site-build` sha the script
   reports against the FRAQTL ref you meant to ship.
