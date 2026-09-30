#!/usr/bin/env bash
# Controls for scripts/refresh-site.sh, run against a fabricated bundle in a scratch copy of this
# repo's scripts/ (never the real site/). Exit 0 only when every row gets its expected verdict.
#
#   scripts/test/refresh-site.sh
#
# The contract under test: the bundle's index.html is published as site/app.html; site/index.html
# (the front page) and site/images/ are owned outside the bundle and survive a refresh untouched,
# present or absent; the provenance stamp and fingerprint describe the bundle-derived set only.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
BUILD=0123456789abcdef0123456789abcdef01234567
FAIL=0

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1: $2"; FAIL=1; }

# A fresh repo copy (scripts/ only, empty .descix/) at $SCRATCH/<name>/repo.
repo() {
  local r="$SCRATCH/$1/repo"
  mkdir -p "$r/.descix"
  cp -R "$ROOT/scripts" "$r/scripts"
  echo "$r"
}

# A minimal assembled bundle at $SCRATCH/<name>/bundle, stamped <build>.
bundle() {
  local b="$SCRATCH/$1/bundle" build=${2:-$BUILD}
  mkdir -p "$b/app-assets" "$b/pub/images"
  printf '<!doctype html><html data-frqtl-site-build="%s"><body>IDE</body></html>\n' "$build" > "$b/index.html"
  printf 'console.log("chunk")\n' > "$b/app-assets/index-abc.js"
  printf 'png' > "$b/pub/images/a file with spaces.png"
  printf '{"build":"%s","phases":{"root":"GREEN","prefix":"GREEN"}}' "$build" > "$b/VERIFICATION.json"
  echo "$b"
}

refresh() { bash "$1/scripts/refresh-site.sh" "$2" >"$1/../out.txt" 2>&1; }

# --- A refresh over a site/ that already carries a front page, images/ and a stale bundle file.
R=$(repo pre); B=$(bundle pre)
mkdir -p "$R/site/images"
printf '<!doctype html><html data-frqtl-site-build="fedcba9"><body>FRONT PAGE</body></html>\n' > "$R/site/index.html"
printf 'marker\n' > "$R/site/images/marker.png"
printf 'sdk shim\n' > "$R/site/DeSciXAppSDK.js"
printf 'stale\n' > "$R/site/stale-bundle-file.js"
cp "$R/site/index.html" "$SCRATCH/front.html"; cp "$R/site/images/marker.png" "$SCRATCH/marker.png"; cp "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js"
if refresh "$R" "$B"; then pass "refresh-exits-0"; else fail "refresh-exits-0" "$(cat "$SCRATCH/pre/out.txt")"; fi
if cmp -s "$R/site/app.html" "$B/index.html"; then pass "writes-app-html-byte-identical"; else fail "writes-app-html-byte-identical" "site/app.html missing or differs from the bundle's index.html"; fi
if cmp -s "$R/site/index.html" "$SCRATCH/front.html"; then pass "front-page-index-html-survives"; else fail "front-page-index-html-survives" "site/index.html was overwritten or deleted"; fi
if cmp -s "$R/site/images/marker.png" "$SCRATCH/marker.png"; then pass "images-marker-survives"; else fail "images-marker-survives" "site/images/marker.png was deleted or changed"; fi
if cmp -s "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js"; then pass "descix-app-sdk-survives"; else fail "descix-app-sdk-survives" "site/DeSciXAppSDK.js was deleted or changed"; fi
if [ ! -e "$R/site/stale-bundle-file.js" ]; then pass "stale-bundle-file-removed"; else fail "stale-bundle-file-removed" "a file no longer in the bundle survived"; fi
if [ -f "$R/site/pub/images/a file with spaces.png" ] && [ -f "$R/site/app-assets/index-abc.js" ]; then pass "bundle-namespaces-copied"; else fail "bundle-namespaces-copied" "app-assets/ or pub/ incomplete"; fi
got=$(jq -r '.upstream_sha // empty' "$R/.descix/site-provenance.json" 2>/dev/null)
if [ "$got" = "$BUILD" ] && grep -qF "data-frqtl-site-build=\"$BUILD\"" "$R/site/app.html" 2>/dev/null; then pass "provenance-stamp-is-app-html"; else fail "provenance-stamp-is-app-html" "upstream_sha=$got, want the app.html stamp $BUILD"; fi
TREE_PRE=$(jq -r '.tree_sha256 // empty' "$R/.descix/site-provenance.json" 2>/dev/null)
COUNT_PRE=$(jq -r '.file_count // empty' "$R/.descix/site-provenance.json" 2>/dev/null)

# --- The same bundle over a site/ with NO front page and NO images/: both stay absent, and the
# fingerprint is the same as above — foreign files are not part of the bundle's provenance.
R=$(repo bare); B=$(bundle bare)
if refresh "$R" "$B"; then pass "refresh-without-front-page-exits-0"; else fail "refresh-without-front-page-exits-0" "$(cat "$SCRATCH/bare/out.txt")"; fi
if [ ! -e "$R/site/index.html" ]; then pass "absent-index-html-stays-absent"; else fail "absent-index-html-stays-absent" "refresh wrote site/index.html"; fi
if [ ! -e "$R/site/images" ]; then pass "absent-images-stays-absent"; else fail "absent-images-stays-absent" "refresh created site/images"; fi
TREE_BARE=$(jq -r '.tree_sha256 // empty' "$R/.descix/site-provenance.json" 2>/dev/null)
COUNT_BARE=$(jq -r '.file_count // empty' "$R/.descix/site-provenance.json" 2>/dev/null)
if [ -n "$TREE_PRE" ] && [ "$TREE_PRE" = "$TREE_BARE" ] && [ "$COUNT_PRE" = "$COUNT_BARE" ]; then pass "fingerprint-excludes-front-page"; else fail "fingerprint-excludes-front-page" "tree $TREE_PRE/$COUNT_PRE with front page vs $TREE_BARE/$COUNT_BARE without"; fi

# --- Refusals leave site/ untouched.
R=$(repo noindex); B=$(bundle noindex); rm "$B/index.html"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-without-index-html" "accepted"; elif grep -qF "index.html is missing" "$SCRATCH/noindex/out.txt" && [ "$(cat "$R/site/index.html")" = front ]; then pass "refuses-bundle-without-index-html"; else fail "refuses-bundle-without-index-html" "$(cat "$SCRATCH/noindex/out.txt")"; fi

for owned in app.html images DeSciXAppSDK.js; do
  R=$(repo "clash-$owned"); B=$(bundle "clash-$owned")
  if [ "$owned" = images ]; then mkdir -p "$B/images"; printf x > "$B/images/x.png"; else printf x > "$B/$owned"; fi
  if refresh "$R" "$B"; then fail "refuses-bundle-shipping-$owned" "accepted"; elif grep -qF "$owned" "$SCRATCH/clash-$owned/out.txt" && [ ! -e "$R/site" ]; then pass "refuses-bundle-shipping-$owned"; else fail "refuses-bundle-shipping-$owned" "$(cat "$SCRATCH/clash-$owned/out.txt")"; fi
done

exit "$FAIL"
