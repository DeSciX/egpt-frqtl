#!/usr/bin/env bash
# Controls for scripts/refresh-site.sh, run against a fabricated bundle in a scratch copy of this
# repo's scripts/ (never the real site/). Exit 0 only when every row gets its expected verdict.
#
#   scripts/test/refresh-site.sh
#
# The contract under test: the bundle's index.html is published as site/app.html; site/index.html
# (the front page), site/images/ and site/share.json (the share metadata the edge worker reads) are
# owned outside the bundle and survive a refresh untouched,
# present or absent; the provenance stamp and fingerprint describe the bundle-derived set only.
# A name the bundle DECLARES host-provided (data-frqtl-host-provided on the consuming element,
# read from the bundle's own bytes) must be a SITE_FOREIGN name present in site/, or the
# refresh is refused and site/ is left untouched.
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

# A minimal assembled bundle at $SCRATCH/<name>/bundle, stamped <build>. Optional third argument:
# extra <head> markup (the host-provided declarations under test).
bundle() {
  local b="$SCRATCH/$1/bundle" build=${2:-$BUILD} head=${3:-}
  mkdir -p "$b/app-assets" "$b/pub/images"
  printf '<!doctype html><html data-frqtl-site-build="%s"><head>%s</head><body>IDE</body></html>\n' "$build" "$head" > "$b/index.html"
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
printf '{"title":"t"}\n' > "$R/site/share.json"
printf 'stale\n' > "$R/site/stale-bundle-file.js"
cp "$R/site/index.html" "$SCRATCH/front.html"; cp "$R/site/images/marker.png" "$SCRATCH/marker.png"; cp "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js"; cp "$R/site/share.json" "$SCRATCH/share.json"
if refresh "$R" "$B"; then pass "refresh-exits-0"; else fail "refresh-exits-0" "$(cat "$SCRATCH/pre/out.txt")"; fi
if cmp -s "$R/site/app.html" "$B/index.html"; then pass "writes-app-html-byte-identical"; else fail "writes-app-html-byte-identical" "site/app.html missing or differs from the bundle's index.html"; fi
if cmp -s "$R/site/index.html" "$SCRATCH/front.html"; then pass "front-page-index-html-survives"; else fail "front-page-index-html-survives" "site/index.html was overwritten or deleted"; fi
if cmp -s "$R/site/images/marker.png" "$SCRATCH/marker.png"; then pass "images-marker-survives"; else fail "images-marker-survives" "site/images/marker.png was deleted or changed"; fi
if cmp -s "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js"; then pass "descix-app-sdk-survives"; else fail "descix-app-sdk-survives" "site/DeSciXAppSDK.js was deleted or changed"; fi
if cmp -s "$R/site/share.json" "$SCRATCH/share.json"; then pass "share-json-survives"; else fail "share-json-survives" "site/share.json was deleted or changed"; fi
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
if [ ! -e "$R/site/share.json" ]; then pass "absent-share-json-stays-absent"; else fail "absent-share-json-stays-absent" "refresh wrote site/share.json"; fi
if [ ! -e "$R/site/images" ]; then pass "absent-images-stays-absent"; else fail "absent-images-stays-absent" "refresh created site/images"; fi
TREE_BARE=$(jq -r '.tree_sha256 // empty' "$R/.descix/site-provenance.json" 2>/dev/null)
COUNT_BARE=$(jq -r '.file_count // empty' "$R/.descix/site-provenance.json" 2>/dev/null)
if [ -n "$TREE_PRE" ] && [ "$TREE_PRE" = "$TREE_BARE" ] && [ "$COUNT_PRE" = "$COUNT_BARE" ]; then pass "fingerprint-excludes-front-page"; else fail "fingerprint-excludes-front-page" "tree $TREE_PRE/$COUNT_PRE with front page vs $TREE_BARE/$COUNT_BARE without"; fi

# --- Refusals leave site/ untouched.
R=$(repo noindex); B=$(bundle noindex); rm "$B/index.html"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-without-index-html" "accepted"; elif grep -qF "index.html is missing" "$SCRATCH/noindex/out.txt" && [ "$(cat "$R/site/index.html")" = front ]; then pass "refuses-bundle-without-index-html"; else fail "refuses-bundle-without-index-html" "$(cat "$SCRATCH/noindex/out.txt")"; fi

for owned in app.html images DeSciXAppSDK.js share.json; do
  R=$(repo "clash-$owned"); B=$(bundle "clash-$owned")
  if [ "$owned" = images ]; then mkdir -p "$B/images"; printf x > "$B/images/x.png"; else printf x > "$B/$owned"; fi
  if refresh "$R" "$B"; then fail "refuses-bundle-shipping-$owned" "accepted"; elif grep -qF "$owned" "$SCRATCH/clash-$owned/out.txt" && [ ! -e "$R/site" ]; then pass "refuses-bundle-shipping-$owned"; else fail "refuses-bundle-shipping-$owned" "$(cat "$SCRATCH/clash-$owned/out.txt")"; fi
done

# --- Host-provided declarations, read from the bundle's bytes.
SDK_TAG='<script src="DeSciXAppSDK.js" data-frqtl-host-provided></script>'

# Declared and present: accepted, the publisher's file carried over byte-identical.
R=$(repo hp-ok); B=$(bundle hp-ok "$BUILD" "$SDK_TAG")
mkdir -p "$R/site"; printf 'sdk shim\n' > "$R/site/DeSciXAppSDK.js"
if refresh "$R" "$B" && cmp -s "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js" && cmp -s "$R/site/app.html" "$B/index.html"; then pass "accepts-declared-host-provided-present"; else fail "accepts-declared-host-provided-present" "$(cat "$SCRATCH/hp-ok/out.txt")"; fi

# Declared and MISSING from site/: refused by name, site/ untouched.
R=$(repo hp-missing); B=$(bundle hp-missing "$BUILD" "$SDK_TAG")
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-declared-host-provided-missing" "accepted a bundle whose declared DeSciXAppSDK.js is not in site/"; elif grep -qF "DeSciXAppSDK.js" "$SCRATCH/hp-missing/out.txt" && grep -qF "data-frqtl-host-provided" "$SCRATCH/hp-missing/out.txt" && [ "$(cat "$R/site/index.html")" = front ] && [ ! -e "$R/site/app.html" ]; then pass "refuses-declared-host-provided-missing"; else fail "refuses-declared-host-provided-missing" "$(cat "$SCRATCH/hp-missing/out.txt")"; fi

# Declared, but not a name the publisher owns (not in SITE_FOREIGN): refused, site/ untouched.
R=$(repo hp-foreign); B=$(bundle hp-foreign "$BUILD" '<script src="other-host.js" data-frqtl-host-provided></script>')
mkdir -p "$R/site"; printf 'x\n' > "$R/site/other-host.js"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-declared-name-not-site-foreign" "accepted"; elif grep -qF "other-host.js" "$SCRATCH/hp-foreign/out.txt" && grep -qF "SITE_FOREIGN" "$SCRATCH/hp-foreign/out.txt" && [ ! -e "$R/site/app.html" ]; then pass "refuses-declared-name-not-site-foreign"; else fail "refuses-declared-name-not-site-foreign" "$(cat "$SCRATCH/hp-foreign/out.txt")"; fi

# The attribute on an element that names no file: refused — a declaration that names nothing.
R=$(repo hp-noref); B=$(bundle hp-noref "$BUILD" '<script data-frqtl-host-provided></script>')
mkdir -p "$R/site"; printf 'sdk shim\n' > "$R/site/DeSciXAppSDK.js"
if refresh "$R" "$B"; then fail "refuses-declaration-naming-no-file" "accepted"; elif grep -qF "names no src" "$SCRATCH/hp-noref/out.txt" && [ ! -e "$R/site/app.html" ]; then pass "refuses-declaration-naming-no-file"; else fail "refuses-declaration-naming-no-file" "$(cat "$SCRATCH/hp-noref/out.txt")"; fi

# --- Every SITE_FOREIGN entry is in the site manifest's upload set: a file this repo owns outside the
# bundle that the upload never sends is served by nobody. SITE_FOREIGN is read from the script itself
# (the one owner of the list); the matcher is scripts/lib/site-manifest.mjs.
line=$(grep -E '^SITE_FOREIGN=\(.*\)$' "$ROOT/scripts/refresh-site.sh" || true)
if [ -z "$line" ]; then
  fail "site-foreign-is-uploaded" "no single-line SITE_FOREIGN=(...) in scripts/refresh-site.sh"
else
  eval "$line"
  if out=$(node "$ROOT/scripts/lib/site-manifest.mjs" --manifest "$ROOT/.descix/manifests/site.json" "${SITE_FOREIGN[@]}" 2>&1); then pass "site-foreign-is-uploaded"; else fail "site-foreign-is-uploaded" "$out"; fi
  # Control: the same list against a manifest that dropped share.json must be refused, naming it.
  jq '.sources[0].include -= ["share.json"]' "$ROOT/.descix/manifests/site.json" > "$SCRATCH/no-share-manifest.json"
  if out=$(node "$ROOT/scripts/lib/site-manifest.mjs" --manifest "$SCRATCH/no-share-manifest.json" "${SITE_FOREIGN[@]}" 2>&1); then fail "site-foreign-not-uploaded-is-refused" "accepted a manifest without share.json"; elif printf '%s' "$out" | grep -qF "site/share.json"; then pass "site-foreign-not-uploaded-is-refused"; else fail "site-foreign-not-uploaded-is-refused" "$out"; fi
fi

exit "$FAIL"
