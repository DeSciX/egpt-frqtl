#!/usr/bin/env bash
# Replace the bundle-derived part of site/ with an assembled FRAQTL static bundle and record its
# provenance.
#
#   scripts/refresh-site.sh <path-to-.deploy-static>
#
# The bundle's index.html (the IDE entry) is published as site/app.html, beside its relative
# app-assets/ and pub/. site/index.html (the front page), site/images/ and site/DeSciXAppSDK.js
# (the shell SDK shim the front page loads) are owned OUTSIDE the bundle (SITE_FOREIGN): a
# refresh carries them over byte-identical when present, leaves them
# absent when absent, and refuses a bundle that ships either name or an app.html of its own.
#
# The bundle's build sha is read from the data-frqtl-site-build attribute in its
# index.html — the bytes published as site/app.html. A bundle without it is refused: provenance
# is read from the bytes, never typed by hand.
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
# Where the bundle's index.html is published, and the top-level site/ entries owned outside the
# bundle. The provenance fingerprint and file count cover the bundle-derived set: SITE_FOREIGN
# is excluded from both and named in the record as tree_excludes.
APP_PAGE="app.html"
SITE_FOREIGN=(index.html images DeSciXAppSDK.js)

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

# The verification record must exist, belong to THIS build, and be GREEN in every phase.
check_verification "$SRC/VERIFICATION.json" "$UPSTREAM_SHA"

[ ! -e "$SRC/$APP_PAGE" ] || die "$SRC/$APP_PAGE is present — the bundle's index.html is published as $APP_PAGE, so the bundle may not ship one"

# The bundle as published: its index.html renamed to the app page, nothing else changed.
BUNDLE=$(mktemp -d "${TMPDIR:-/tmp}/refresh-site.XXXXXX")
trap 'rm -rf "$BUNDLE"' EXIT
cp -R "$SRC/." "$BUNDLE/" || die "copy $SRC -> $BUNDLE failed"
mv "$BUNDLE/index.html" "$BUNDLE/$APP_PAGE"

replace_tree "$BUNDLE" "$SITE" "${SITE_FOREIGN[@]}"
cmp -s "$SRC/index.html" "$SITE/$APP_PAGE" || die "site/$APP_PAGE is not byte-identical to $SRC/index.html after refresh"

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
