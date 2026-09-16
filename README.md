# egpt-frqtl — PROD app

The DeSciX PROD home for the FRQTL IDE, its knowledge bases and its Claude Code plugin. The app
is served at **https://egpt-frqtl.descix.net/**; its MCP connector is **https://descix.net/mcp**.

Self-contained by design: no cross-site linking, and no FRAQTL-monorepo-only route survives in the
bundle. **PROD is deliberately not a mirror of DEV.**

## Layout

```
site/                          the static IDE bundle — the ONLY directory uploaded as the site
  index.html                   IDE entry
  app-assets/*                 hashed React chunks (vite owns this namespace)
  pub/*                        engine, vendor, experiments, ide, notebooks, math SDK
kb/
  General/                     adopted — FRAQTL `make publish-corpus` output, never hand-edited
  frqtl_sdk/                   adopted — FRAQTL `make publish-corpus` output, never hand-edited
  HowToSee/                    authored here — method corpus
  Personas/                    authored here — frqtl-sdk-builder, frqtl-experiment-designer
  Recipes/                     authored here — dse-planar
plugin/                        Claude Code plugin `frqtl` (install string frqtl@egpt)
scripts/
  refresh-site.sh              replace site/ from a FRAQTL .deploy-static bundle
  refresh-kb.sh                replace kb/General or kb/frqtl_sdk from a publish-corpus output dir
  lib/tree.sh                  the tree fingerprint both refresh scripts use
.descix/
  manifests/site.json          site publish allowlist
  manifests/<KB>.json          one KB manifest per kb/<KB> directory
  site-provenance.json         written by scripts/refresh-site.sh
  kb-provenance.json           written by scripts/refresh-kb.sh
  workspace.json, wallet.json  per-developer config and credentials — gitignored, never committed
  sync-state/                  per-developer KB sync state — gitignored
```

`site/`'s two namespaces are **disjoint**. Serving the sdk dist at root collides with the IDE's own
`index.html`.

## Refreshing content

Provenance is read from the artifact's bytes by the refresh scripts, never typed by hand. Both
scripts exit non-zero and change nothing when the input fails a check.

### Site

```
scripts/refresh-site.sh <.deploy-static directory>
```

The argument is the `.deploy-static/` directory FRAQTL `make static-deploy` assembles and
browser-verifies at the root of a FRAQTL checkout. The script
refuses a non-directory, a directory without `index.html`, and an `index.html` without exactly one
`data-frqtl-site-build="<git sha>"` attribute. On success it replaces `site/` and writes
`.descix/site-provenance.json`:

```
{ upstream_repo, upstream_sha, file_count, tree_sha256, refreshed_by_script }
```

A `site/` with no `.descix/site-provenance.json` beside it has no recorded provenance.

### Adopted KBs

```
scripts/refresh-kb.sh <publish-corpus output directory> General
scripts/refresh-kb.sh <publish-corpus output directory> frqtl_sdk
```

The first argument is the directory FRAQTL `make publish-corpus` writes for that corpus: the
`adopted-general` output for `General`, the `adopted-sdk` output for `frqtl_sdk`.
The destination is read from `.descix/manifests/<KB>.json`. Every markdown file in the input must
open with the publish-corpus `GENERATED` stamp (source path, commit sha, commit date); the per-file
stamps are recorded under the KB's key in `.descix/kb-provenance.json`, with non-markdown files
listed as `unstamped_files`, and stripped from the files written to `kb/`. Provenance lives only in
`kb-provenance.json`: the script fails if an input markdown file has no stamp or if any stamp text
survives in the output. Links to `dev.descix.net` are rewritten to `descix.net` and the count is
recorded as `host_rewrites_dev_to_prod`.

`HowToSee`, `Personas` and `Recipes` are edited in place in `kb/`.

### Tree fingerprint

`tree_sha256` is the sha256 of the sorted `sha256  ./path` listing of every file in the tree
(`scripts/lib/tree.sh::tree_sha256`):

```
cd site && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256
```

**`-print0 | sort -z | xargs -0` is load-bearing.** `site/pub/images/` contains a filename with
spaces (`particles which did not go through a slit at all.png`). A plain `find | xargs shasum`
splits on whitespace, silently skips that file, and yields a fingerprint that cannot detect a change
to it.

## Deploying

Run from the repo root with a PROD `.descix/workspace.json` (`descix config show` prints the
workspace, API URL and environment in use). Always dry-run first.

| What | Command |
|---|---|
| Site | `descix site upload --dry-run`, then `descix site upload` |
| One KB | `descix kb corpus sync --kb <General\|frqtl_sdk\|HowToSee\|Personas\|Recipes> --dry-run`, then without `--dry-run` |

- `descix site upload` uses `.descix/manifests/site.json`. Its only source is `site` with an
  explicit include allowlist (`index.html`, `app-assets/**`, `pub/**`), so `assets/`, `kb/`,
  `plugin/`, `scripts/` and `.descix/` are never uploaded. Site URLs are non-expiring and unsigned;
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
