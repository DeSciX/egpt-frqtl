#!/usr/bin/env bash
# Replace the bundle-derived part of site/ with an assembled FRAQTL static bundle and record its
# provenance.
#
#   scripts/refresh-site.sh <path-to-.deploy-static>
#
# The site's shape is the pinned @descix/frqtl-web ./site-graph export, read by a node one-liner and never
# typed here: STATIC_APP_PAGE (the IDE entry, APP_PAGE below), SITE_GRAPH_DIR (GRAPH_DIR), SITE_BUILD_ATTR
# (BUILD_ATTR), HOST_PROVIDED_ATTR (HOST_ATTR), SITE_BUILD_ID_RE and siteBuildStampOf, all through
# scripts/test/lib/served-roster.mjs (siteGraph, siteBuildOf, otherBuildDirs), which names the package once. The bundle ships its IDE entry as APP_PAGE beside its
# relative app-assets/ and GRAPH_DIR/, and the refresh publishes it as site/APP_PAGE unchanged. The front page is the publisher's: a bundle that
# ships an index.html is refused. site/index.html (the front page), site/images/,
# site/DeSciXAppSDK.js (the shell SDK shim the front page and the IDE load) and site/share.json (the
# share metadata the edge worker injects into the shell head; its assets live under images/) are
# owned OUTSIDE the bundle (SITE_FOREIGN): a refresh carries them over byte-identical when present,
# leaves them absent when absent, and refuses a bundle that ships any of those names.
#
# HOST-PROVIDED: a bundle declares each publisher file it NEEDS on the element that consumes it —
# HOST_ATTR on a src/href in its APP_PAGE (FRAQTL's static build splices
# <script src="DeSciXAppSDK.js" HOST_ATTR> and <link rel="home" href="index.html" HOST_ATTR>). The set is read from those bytes, never typed here. Each declared
# name must be a SITE_FOREIGN name present in site/, or the refresh is refused with site/ untouched: "absent stays absent" does not hold for a declared name, because
# the published APP_PAGE would load a file the site does not serve.
#
# The bundle's build sha is the one BUILD_ATTR stamp on its APP_PAGE (siteBuildStampOf, which throws on more
# than one) — the bytes published as site/APP_PAGE. A bundle without it is refused: provenance
# is read from the bytes, never typed by hand. The stamp also NAMES the bundle's graph directory:
# every file the entry pages load sits under GRAPH_DIR/<build>/ (the HTML entries stay at fixed URLs),
# so the bundle must carry GRAPH_DIR/<build>/ and no other GRAPH_DIR/<build id>/ directory — derived from the
# stamp, never a second derivation. The previous build's GRAPH_DIR/<build>/ leaves site/ with the rest of
# the old bundle.
#
# Maintainer state never ships: a bundle (or a carried-over publisher entry) holding a .claude/ or
# agent-memory/ directory anywhere is refused, site/ untouched.
#
# THREE refusals, three facts, all read from the bundle itself:
#   KNOWN_FAILING.json   present  → the bundle ships surfaces known to fail with no
#                                  mechanical detector (FRAQTL scripts/_known-failing.mjs).
#   the pinned releases  the bundle's whole graph (GRAPH_DIR/<build>/ and the entries beside it) is not the
#                                  releases package.json pins, byte for byte, by the package's siteGraphFaults
#                                  (scripts/test/served-release.mjs --site <bundle>) → refused before site/ is touched.
#                                  A GRAPH=local bundle carries locally built bytes, so it is refused by construction.
#   VERIFICATION.json    missing, stale, or not all-GREEN → the bundle was never verified,
#                                  or was verified RED, or the record belongs to a DIFFERENT
#                                  build than the one being published. FRAQTL's
#                                  scripts/verify-static-deploy.sh writes it on every run and
#                                  leaves .deploy-static/ on disk when a phase goes RED, so
#                                  without this check a failed verification publishes silently.
#                                  Read: `build`, `phases` ({<phase>: "GREEN"|...}) and `graph`
#                                  ({<placed package>: <its dist-manifest.json sha256>}). The
#                                  verdicts are the members of `phases` ONLY, each exactly "GREEN";
#                                  a record without a non-empty `phases` object, or whose `graph` is not
#                                  the installed records of the placed packages, is refused
#                                  (scripts/lib/verification.sh::check_verification; controls:
#                                  scripts/test/verification-record.sh).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/scripts/lib/tree.sh"
. "$ROOT/scripts/lib/verification.sh"

UPSTREAM_REPO="FRAQTL"
SITE="$ROOT/site"
PROVENANCE="$ROOT/.descix/site-provenance.json"
# The top-level site/ entries owned outside the bundle. The provenance fingerprint and file count cover the bundle-derived set:
# SITE_FOREIGN is excluded from both and named in the record as tree_excludes.
SITE_FOREIGN=(index.html images DeSciXAppSDK.js share.json)

# The site's shape, from the pinned package (resolved from this repo's node_modules).
SITE_ROSTER="$ROOT/scripts/test/lib/served-roster.mjs"
SHAPE=$(node --input-type=module -e "const { siteGraph } = await import(process.argv[1]); try { const g = await siteGraph(); for (const k of ['STATIC_APP_PAGE', 'SITE_GRAPH_DIR', 'SITE_BUILD_ATTR', 'HOST_PROVIDED_ATTR']) { if (typeof g[k] !== 'string' || !g[k]) throw new Error('no ' + k + ' export'); } if (!(g.SITE_BUILD_ID_RE instanceof RegExp)) throw new Error('no SITE_BUILD_ID_RE export'); if (typeof g.siteBuildStampOf !== 'function') throw new Error('no siteBuildStampOf export'); process.stdout.write([g.STATIC_APP_PAGE, g.SITE_GRAPH_DIR, g.SITE_BUILD_ATTR, g.HOST_PROVIDED_ATTR].join('\\n')); } catch (e) { process.stdout.write(e.message); process.exit(1); }" "$SITE_ROSTER" 2>&1) \
  || die "the site shape (scripts/test/lib/served-roster.mjs siteGraph) does not load from $ROOT — run npm ci: $SHAPE"
{ read -r APP_PAGE; read -r GRAPH_DIR; read -r BUILD_ATTR; read -r HOST_ATTR; } <<< "$SHAPE"

[ $# -eq 1 ] || die "usage: scripts/refresh-site.sh <path-to-.deploy-static>"
SRC=$1
[ -d "$SRC" ] || die "$SRC is not a directory"
SRC=$(cd "$SRC" && pwd)
[ "$SRC" != "$SITE" ] || die "source is site/ itself"
[ ! -e "$SRC/index.html" ] || die "$SRC/index.html is present — the front page is the publisher's; FRAQTL ships $APP_PAGE"
[ -f "$SRC/$APP_PAGE" ] || die "$SRC/$APP_PAGE is missing — not an assembled static bundle (FRAQTL ships its IDE entry as $APP_PAGE)"
# Maintainer state never ships, from the bundle or from a carried-over publisher entry.
leaked=$( (cd "$SRC" && find . \( -name .claude -o -name agent-memory \) -print)
  for name in "${SITE_FOREIGN[@]}"; do [ ! -d "$SITE/$name" ] || (cd "$SITE" && find "./$name" \( -name .claude -o -name agent-memory \) -print | sed 's|^\./|site/|'); done)
[ -z "$leaked" ] || die "maintainer state in the publish set ($(echo $leaked)) — a .claude/ or agent-memory/ directory never ships; rebuild the bundle from a clean tree"
# A bundle that still ships pages the assembler knows are broken is not deployable.
[ ! -e "$SRC/KNOWN_FAILING.json" ] || die "$SRC/KNOWN_FAILING.json is present — the bundle ships known-failing pages: $(jq -c '[.. | .path? // empty]' "$SRC/KNOWN_FAILING.json" 2>/dev/null || cat "$SRC/KNOWN_FAILING.json"); land their fixes in FRAQTL and rebuild"

# The one stamp, by the package's reader (it throws on more than one; null and a non-build-id are refused).
UPSTREAM_SHA=$(node --input-type=module -e "const { siteBuildOf } = await import(process.argv[1]); try { process.stdout.write((await siteBuildOf(process.argv[2])).build); } catch (e) { process.stdout.write(e.message); process.exit(1); }" "$SITE_ROSTER" "$SRC" 2>&1) \
  || die "$SRC/$APP_PAGE has no single build stamp — rebuild the bundle with FRAQTL \`make static-deploy GRAPH=release\` at the pinned release's tag: $UPSTREAM_SHA"

# The graph directory the stamp names, and no other build's.
[ -d "$SRC/$GRAPH_DIR/$UPSTREAM_SHA" ] || die "$SRC/$GRAPH_DIR/$UPSTREAM_SHA/ is missing — the bundle's $APP_PAGE is stamped $UPSTREAM_SHA, so its graph must sit under $GRAPH_DIR/$UPSTREAM_SHA/"
# One scan (served-roster.mjs::otherBuildDirs) whose exit code is read: a scan that did not run is a refusal. It is the
# only guard against a stray GRAPH_DIR/<build id>/, which the whole-graph gate does not judge.
others=$(node --input-type=module -e "const { otherBuildDirs } = await import(process.argv[1]); try { process.stdout.write((await otherBuildDirs(process.argv[2], process.argv[3])).join(' ')); } catch (e) { process.stdout.write(e.message); process.exit(1); }" "$SITE_ROSTER" "$SRC" "$UPSTREAM_SHA" 2>&1) \
  || die "$SRC/$GRAPH_DIR/ could not be scanned for another build's graph directory — refusing: $others"
[ -z "$others" ] || die "$SRC/$GRAPH_DIR/ carries another build's graph directory ($(echo $others)) beside $GRAPH_DIR/$UPSTREAM_SHA/ — one bundle, one build"

# The verification record must exist, belong to THIS build, and be GREEN in every phase.
check_verification "$SRC/VERIFICATION.json" "$UPSTREAM_SHA"

# The host-provided set, from the bundle's own bytes: every element carrying the attribute.
HOST_PROVIDED=()
while IFS= read -r tag; do
  [ -n "$tag" ] || continue
  ref=$(printf '%s' "$tag" | sed -nE 's/.*[[:space:]](src|href)="([^"]*)".*/\2/p')
  [ -n "$ref" ] || die "$SRC/$APP_PAGE: an element carries $HOST_ATTR but names no src or href: $tag"
  HOST_PROVIDED+=("$ref")
done < <(grep -oE "<[A-Za-z][^>]*[[:space:]]$HOST_ATTR([[:space:]=/>])[^>]*>?" "$SRC/$APP_PAGE" || true)
for name in ${HOST_PROVIDED[@]+"${HOST_PROVIDED[@]}"}; do
  owned=0
  for foreign in "${SITE_FOREIGN[@]}"; do [ "$name" != "$foreign" ] || owned=1; done
  [ "$owned" -eq 1 ] || die "$SRC/$APP_PAGE declares \"$name\" $HOST_ATTR, but it is not a name this site owns outside the bundle (SITE_FOREIGN: ${SITE_FOREIGN[*]}) — refusing to publish an app page that loads a file nobody publishes"
  [ -e "$SITE/$name" ] || die "$SRC/$APP_PAGE declares \"$name\" $HOST_ATTR, and site/$name is missing — the published $APP_PAGE would load a file the site does not serve; vendor it into site/ first"
done

# The bundle must be the pinned releases: its whole graph is the placed packages' bytes at the versions
# package.json pins (scripts/test/served-release.mjs, run against the bundle), checked before site/ is touched.
release=$(node "$ROOT/scripts/test/served-release.mjs" --site "$SRC" --package "$ROOT/package.json" 2>&1) \
  || die "$SRC is not the releases package.json pins — refresh from a FRAQTL \`make static-deploy GRAPH=release\` bundle built at the pinned release's tag, or bump both pins to the bundle's releases first (README, Pin bump): $release"

# The bundle as published: unchanged.
replace_tree "$SRC" "$SITE" "${SITE_FOREIGN[@]}"
cmp -s "$SRC/$APP_PAGE" "$SITE/$APP_PAGE" || die "site/$APP_PAGE is not byte-identical to $SRC/$APP_PAGE after refresh"
for name in ${HOST_PROVIDED[@]+"${HOST_PROVIDED[@]}"}; do
  [ -e "$SITE/$name" ] || die "site/$name, declared $HOST_ATTR by $APP_PAGE, did not survive the refresh"
done

FILE_COUNT=$(tree_file_count "$SITE" "${SITE_FOREIGN[@]}")
TREE_SHA=$(tree_sha256 "$SITE" "${SITE_FOREIGN[@]}")
[ "$FILE_COUNT" -gt 0 ] || die "site/ is empty after refresh"

jq -n \
  --arg repo "$UPSTREAM_REPO" \
  --arg sha "$UPSTREAM_SHA" \
  --argjson count "$FILE_COUNT" \
  --arg tree "$TREE_SHA" \
  --arg app "$APP_PAGE" \
  --args \
  '{upstream_repo: $repo, upstream_sha: $sha, app_page: $app, file_count: $count, tree_sha256: $tree, tree_excludes: $ARGS.positional, refreshed_by_script: "scripts/refresh-site.sh"}' \
  "${SITE_FOREIGN[@]}" \
  > "$PROVENANCE"

echo "site/ refreshed from $UPSTREAM_REPO@$UPSTREAM_SHA: $FILE_COUNT bundle files (IDE entry $APP_PAGE), tree sha256 $TREE_SHA (excluding ${SITE_FOREIGN[*]})"
echo "wrote ${PROVENANCE#$ROOT/}"
