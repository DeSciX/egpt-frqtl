#!/usr/bin/env bash
# Replace site/ with an assembled FRAQTL static bundle and record its provenance.
#
#   scripts/refresh-site.sh <path-to-.deploy-static>
#
# The bundle's build sha is read from the data-frqtl-site-build attribute in its
# index.html. A bundle without it is refused: provenance is read from the bytes,
# never typed by hand. A bundle carrying KNOWN_FAILING.json is refused too.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
. "$ROOT/scripts/lib/tree.sh"

UPSTREAM_REPO="FRAQTL"
SITE="$ROOT/site"
PROVENANCE="$ROOT/.descix/site-provenance.json"

[ $# -eq 1 ] || die "usage: scripts/refresh-site.sh <path-to-.deploy-static>"
SRC=$1
[ -d "$SRC" ] || die "$SRC is not a directory"
SRC=$(cd "$SRC" && pwd)
[ -f "$SRC/index.html" ] || die "$SRC/index.html is missing — not an assembled static bundle"
[ "$SRC" != "$SITE" ] || die "source is site/ itself"
# A bundle that still ships pages the assembler knows are broken is not deployable.
[ ! -e "$SRC/KNOWN_FAILING.json" ] || die "$SRC/KNOWN_FAILING.json is present — the bundle ships known-failing pages: $(jq -c '[.. | .path? // empty]' "$SRC/KNOWN_FAILING.json" 2>/dev/null || cat "$SRC/KNOWN_FAILING.json"); land their fixes in FRAQTL and rebuild"

builds=$(grep -oE 'data-frqtl-site-build="[^"]*"' "$SRC/index.html" | sed -E 's/^data-frqtl-site-build="(.*)"$/\1/' | sort -u || true)
[ -n "$builds" ] || die "$SRC/index.html carries no data-frqtl-site-build attribute — rebuild the bundle with FRAQTL \`make static-deploy\` at a ref that stamps it"
[ "$(printf '%s\n' "$builds" | wc -l | tr -d ' ')" -eq 1 ] || die "$SRC/index.html carries conflicting data-frqtl-site-build values: $(echo $builds)"
printf '%s' "$builds" | grep -qE '^[0-9a-f]{7,40}$' || die "data-frqtl-site-build=\"$builds\" is not a git sha"
UPSTREAM_SHA=$builds

replace_tree "$SRC" "$SITE"

FILE_COUNT=$(tree_file_count "$SITE")
TREE_SHA=$(tree_sha256 "$SITE")
[ "$FILE_COUNT" -gt 0 ] || die "site/ is empty after refresh"

jq -n \
  --arg repo "$UPSTREAM_REPO" \
  --arg sha "$UPSTREAM_SHA" \
  --argjson count "$FILE_COUNT" \
  --arg tree "$TREE_SHA" \
  '{upstream_repo: $repo, upstream_sha: $sha, file_count: $count, tree_sha256: $tree, refreshed_by_script: "scripts/refresh-site.sh"}' \
  > "$PROVENANCE"

echo "site/ refreshed from $UPSTREAM_REPO@$UPSTREAM_SHA: $FILE_COUNT files, tree sha256 $TREE_SHA"
echo "wrote ${PROVENANCE#$ROOT/}"
