# egpt-frqtl — PROD app

The DeSciX PROD home for the FRQTL IDE, its knowledge bases and its Claude Code plugin. The app
is served at **https://egpt-frqtl.descix.net/**; its MCP connector is **https://descix.net/mcp**.

Self-contained by design: no cross-site linking, and no FRAQTL-monorepo-only route survives in the
bundle. **PROD is deliberately not a mirror of DEV.**

## Make a new impossible card

Developers are encouraged to make new impossible cards — Three.js-oriented developers especially. A
card is a scene the FRQTL engine computes live in the visitor's tab: compose it from the SDK's parts,
render it with the renderer you already know, and propose it for the front page's "Impossible things,
running." grid (`site/index.html`, section `#proof`). The grid is the FRQTL showcase roster the bundle
serves (`site/pub/<build>/shim/registry/exhibits.js`, `EXHIBITS`): a new card is a new roster row, and
its tile opens the scene in the GYM.

## Layout

```
site/                          the ONLY directory uploaded as the site
  index.html                   front page — built from the shared template (CLAUDE.md), never written
                               by a refresh; its #proof tiles are the served roster's GYM links
  images/*                     front-page images (template images, tile stills) — generator output with
                               index.html, never written by a refresh
  DeSciXAppSDK.js              DeSciX app-side SDK — generator output with index.html, never written by a refresh
  share.json                   share metadata the edge worker injects into the shell head; its
                               icon and share image live in images/share/ — never written by a refresh
  app.html                     IDE entry — the bundle's app.html, published unchanged
  app-assets/*                 hashed React chunks (vite owns this namespace)
  app-assets/host-view.js      the bundle's one unhashed entry: asks the shell for full-screen
  pub/sdk.html, pub/artifact/*.html, pub/experiments/<id>/index.html
                               the bundle's HTML entries — fixed URLs, served no-store
  pub/<build>/*                everything those entries load: engine, vendor, experiment scripts, ide,
                               notebooks, math SDK — <build> is the bundle's data-frqtl-site-build stamp,
                               so a new build is a new directory and no browser-held old file is reused
kb/
  General/                     adopted — FRAQTL `make publish-corpus` output, never hand-edited
  frqtl_sdk/                   adopted — FRAQTL `make publish-corpus` output, never hand-edited
  HowToSee/                    authored here — method corpus
  Personas/                    authored here — frqtl-sdk-builder, frqtl-experiment-designer
  Recipes/                     authored here — dse-planar
plugin/                        Claude Code plugin `frqtl` (install string frqtl@egpt)
scripts/
  refresh-site.sh              replace site/'s bundle-derived files from a FRAQTL .deploy-static bundle
  refresh-kb.sh                replace kb/General or kb/frqtl_sdk from a publish-corpus output dir
  lib/tree.sh                  the tree fingerprint both refresh scripts use
  lib/share-contract.mjs       the pre-upload check of site/share.json against runbook §7.3
  test/refresh-site.sh         controls for refresh-site.sh (`npm test`)
  test/frontpage.mjs           static gate for site/index.html: #proof cards first, approved lede, tiles ==
                               the served EXHIBITS in order (title, tile line, GYM href, still and its
                               alt), the through-line == the served SHOWCASE_THROUGH_LINE (against
                               site/pub/<build>/shim/registry/, <build> = site/app.html's stamp)
  test/frontpage-controls.mjs  controls for frontpage.mjs on fixture front pages (`npm test`)
  test/frontpage-tiles.mjs     browser gate: every #proof tile lands on the GYM with its scene applied;
                               the IDE's brand links to the front page
  test/frontpage-tiles-controls.mjs  controls for frontpage-tiles.mjs (unknown id, STUDIO tile, no home link)
  test/lib/                    the #proof reader and the fixture-site builder the gates and controls share
  test/host-view.mjs           browser gate: site/ pages under a stub shell BUS, real SDK bytes
  test/host-view/              its shell-harness page — a fixture, outside site/
  test/share-contract.mjs      controls for lib/share-contract.mjs (`npm test`)
.descix/
  manifests/site.json          site publish allowlist
  manifests/<KB>.json          one KB manifest per kb/<KB> directory
  site-provenance.json         written by scripts/refresh-site.sh
  kb-provenance.json           written by scripts/refresh-kb.sh
  workspace.json, wallet.json  per-developer config and credentials — gitignored, never committed
  sync-state/                  per-developer KB sync state — gitignored
```

`site/`'s two namespaces are **disjoint**. Serving the sdk dist at root collides with the IDE's own
`app.html` and the front page `index.html`.

## Refreshing content

Provenance is read from the artifact's bytes by the refresh scripts, never typed by hand. Both
scripts exit non-zero and change nothing when the input fails a check.

### Site

```
scripts/refresh-site.sh <.deploy-static directory>
```

The argument is the `.deploy-static/` directory FRAQTL `make static-deploy` assembles and
browser-verifies at the root of a FRAQTL checkout. The script
refuses a non-directory, a bundle that ships an `index.html` (the front page is this repo's; FRAQTL
ships `app.html`), a directory without `app.html`, and an `app.html` without exactly one
`data-frqtl-site-build="<git sha>"` attribute. It refuses a bundle — or a carried-over `SITE_FOREIGN`
entry — holding a `.claude/` or `agent-memory/` directory anywhere. It also refuses a bundle containing
`KNOWN_FAILING.json`, which the FRAQTL assembler writes while it ships pages it knows are broken,
and a bundle whose `VERIFICATION.json` is missing, records a different build than the stamp, or does
not carry a non-empty `phases` object whose every verdict is exactly `"GREEN"` (the reader reads
`build` and `phases` only) — FRAQTL's `scripts/verify-static-deploy.sh` writes that record on every
run and leaves the bundle on disk when a phase goes RED, so without this check a failed browser
verification would publish silently.
It also refuses a bundle that ships any name in the script's `SITE_FOREIGN` — the one list of
top-level `site/` entries this repo owns outside the bundle (authored or vendored here; see Layout).
A bundle declares each site file it needs on the element that loads it — `data-frqtl-host-provided`
(FRAQTL's IDE: `<script src="DeSciXAppSDK.js" data-frqtl-host-provided>` and
`<link rel="home" href="index.html" data-frqtl-host-provided>`). The script reads those
names from the bundle's `app.html` and refuses, changing nothing, when a declared name is not in
the script's `SITE_FOREIGN`, or is missing from `site/`.
The stamp also names the bundle's graph directory: the script refuses a bundle without
`pub/<stamp>/`, or with any other `pub/<8 hex digits>/` beside it.
On success it publishes the bundle's `app.html` byte-identical as `site/app.html`, replaces every
other bundle-derived file in `site/` (files no longer in the bundle are removed — the previous
build's `pub/<build>/` with them), carries
every `SITE_FOREIGN` entry over untouched — or leaves it absent unless the bundle declares it — and
writes
`.descix/site-provenance.json`:

```
{ upstream_repo, upstream_sha, app_page, file_count, tree_sha256, tree_excludes, refreshed_by_script }
```

`file_count` and `tree_sha256` cover the bundle-derived files only; `tree_excludes` records the
`SITE_FOREIGN` list the refresh ran with.

A `site/` with no `.descix/site-provenance.json` beside it has no recorded provenance.

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
| Site front-page gates | `node scripts/test/frontpage.mjs` (static) and `node scripts/test/frontpage-tiles.mjs --port <n>` (browser) against `site/` — both must report every row PASS before `descix site upload` |
| Site host-view gate | `node scripts/test/host-view.mjs --port <n>` against `site/` — must report 5/5 PASS before `descix site upload` |
| Site share-contract gate | `node scripts/lib/share-contract.mjs` — `site/share.json` (the link-preview card; contract: the app-developer runbook §7.3) must report PASS before `descix site upload`; it reports ABSENT and exits 0 when there is none |
| Site | `descix site upload --dry-run`, then `descix site upload` |
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
