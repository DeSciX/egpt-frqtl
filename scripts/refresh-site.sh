#!/usr/bin/env bash
# Replace the bundle-derived part of site/ with an assembled FRAQTL static bundle and record its
# provenance.
#
#   scripts/refresh-site.sh <path-to-.deploy-static>
#
# The bundle ships its IDE entry as app.html (APP_PAGE; FRAQTL's owner is
# lib/shim/engine/router.js STATIC_APP_PAGE) beside its relative app-assets/ and pub/, and the
# refresh publishes it as site/app.html unchanged. The front page is the publisher's: a bundle that
# ships an index.html is refused. site/index.html (the front page), site/images/,
# site/DeSciXAppSDK.js (the shell SDK shim the front page and the IDE load) and site/share.json (the
# share metadata the edge worker injects into the shell head; its assets live under images/) are
# owned OUTSIDE the bundle (SITE_FOREIGN): a refresh carries them over byte-identical when present,
# leaves them absent when absent, and refuses a bundle that ships any of those names.
#
# HOST-PROVIDED: a bundle declares each publisher file it NEEDS on the element that consumes it —
# `data-frqtl-host-provided` on a src/href in its app.html (FRAQTL's static build splices
# <script src="DeSciXAppSDK.js" data-frqtl-host-provided> and <link rel="home" href="index.html"
# data-frqtl-host-provided>). The set is read from those bytes, never typed here. Each declared
# name must be a SITE_FOREIGN name present in site/, or the refresh is refused with site/ untouched: "absent stays absent" does not hold for a declared name, because
# the published app.html would load a file the site does not serve.
#
# The bundle's build sha is read from the data-frqtl-site-build attribute in its
# app.html — the bytes published as site/app.html. A bundle without it is refused: provenance
# is read from the bytes, never typed by hand. The stamp also NAMES the bundle's graph directory:
# every file the entry pages load sits under pub/<build>/ (the HTML entries stay at fixed URLs),
# so the bundle must carry pub/<build>/ and no other pub/<8-hex>/ directory — derived from the
# stamp, never a second derivation. The previous build's pub/<build>/ leaves site/ with the rest of
# the old bundle.
#
# Maintainer state never ships: a bundle (or a carried-over publisher entry) holding a .claude/ or
# agent-memory/ directory anywhere is refused, site/ untouched.
#
# TWO refusals, two facts, both read from the bundle itself:
#   KNOWN_FAILING.json   present  → the bundle ships surfaces known to fail with no
#                                  mechanical detector (FRAQTL scripts/_known-failing.mjs).
#   VERIFICATION.json    missing, stale, or not all-GREEN → the bundle was never verified,
#                                  or was verified RED, or the record belongs to a DIFFERENT
#                                  build than the one being published. FRAQTL's
#                                  scripts/verify-static-deploy.sh writes it on every run and
#                                  leaves .deploy-static/ on disk when a phase goes RED, so
#                                  without this check a failed verification publishes silently.
#                                  Read: `build` and `phases` ({<phase>: "GREEN"|...}). The
#                                  verdicts are the members of `phases` ONLY, each exactly "GREEN";
#                                  a record without a non-empty `phases` object is refused
#                                  (scripts/lib/verification.sh::check_verification; controls:
#                                  scripts/test/verification-record.sh).
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/scripts/lib/tree.sh"
. "$ROOT/scripts/lib/verification.sh"

UPSTREAM_REPO="FRAQTL"
SITE="$ROOT/site"
PROVENANCE="$ROOT/.descix/site-provenance.json"
# The IDE entry the bundle ships and the site publishes, and the top-level site/ entries owned
# outside the bundle. The provenance fingerprint and file count cover the bundle-derived set:
# SITE_FOREIGN is excluded from both and named in the record as tree_excludes.
APP_PAGE="app.html"
SITE_FOREIGN=(index.html images DeSciXAppSDK.js share.json)

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

builds=$(grep -oE 'data-frqtl-site-build="[^"]*"' "$SRC/$APP_PAGE" | sed -E 's/^data-frqtl-site-build="(.*)"$/\1/' | sort -u || true)
[ -n "$builds" ] || die "$SRC/$APP_PAGE carries no data-frqtl-site-build attribute — rebuild the bundle with FRAQTL \`make static-deploy\` at a ref that stamps it"
[ "$(printf '%s\n' "$builds" | wc -l | tr -d ' ')" -eq 1 ] || die "$SRC/$APP_PAGE carries conflicting data-frqtl-site-build values: $(echo $builds)"
printf '%s' "$builds" | grep -qE '^[0-9a-f]{8}$' || die "data-frqtl-site-build=\"$builds\" is not a build id (8 hex digits)"
UPSTREAM_SHA=$builds

# The graph directory the stamp names, and no other build's.
[ -d "$SRC/pub/$UPSTREAM_SHA" ] || die "$SRC/pub/$UPSTREAM_SHA/ is missing — the bundle's $APP_PAGE is stamped $UPSTREAM_SHA, so its graph must sit under pub/$UPSTREAM_SHA/"
others=$(cd "$SRC/pub" && for d in */; do d=${d%/}; printf '%s\n' "$d"; done | grep -E '^[0-9a-f]{8}$' | grep -vx "$UPSTREAM_SHA" || true)
[ -z "$others" ] || die "$SRC/pub/ carries another build's graph directory ($(echo $others)) beside pub/$UPSTREAM_SHA/ — one bundle, one build"

# The verification record must exist, belong to THIS build, and be GREEN in every phase.
check_verification "$SRC/VERIFICATION.json" "$UPSTREAM_SHA"

# The host-provided set, from the bundle's own bytes: every element carrying the attribute.
HOST_ATTR="data-frqtl-host-provided"
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
