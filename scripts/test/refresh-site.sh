#!/usr/bin/env bash
# Controls for scripts/refresh-site.sh, run against a fabricated bundle in a scratch copy of this
# repo's scripts/ (never the real site/). Exit 0 only when every row gets its expected verdict.
#
#   scripts/test/refresh-site.sh
#
# The site's shape (the IDE page APP, the graph directory GRAPH, the stamp attribute ATTR) is the pinned
# ./site-graph export through scripts/test/lib/served-roster.mjs::siteGraph, as the refresh reads it.
# The contract under test: the bundle ships its IDE entry as APP and the refresh publishes it
# as site/APP byte-identical; a bundle WITH an index.html (the front page is the publisher's)
# or WITHOUT an APP is refused. site/index.html (the front page), site/images/ and
# site/share.json (the share metadata the edge worker reads) are owned outside the bundle and
# survive a refresh untouched, present or absent; the provenance stamp and fingerprint describe
# the bundle-derived set only.
# A name the bundle DECLARES host-provided (HOST_ATTR on the consuming element,
# read from the bundle's own bytes) must be a SITE_FOREIGN name present in site/, or the
# refresh is refused and site/ is left untouched — FRAQTL's <link rel="home" href="index.html"> is
# one, so a site without its front page refuses the bundle. The stamp names the bundle's graph
# directory: a bundle without GRAPH/<stamp>/, or with another GRAPH/<build id>/ beside it, is refused.
# A .claude/ or agent-memory/ directory in the publish set is refused.
# Every fabricated bundle's graph is the pinned releases placed whole (scripts/test/lib/placed-fixture.sh::place_releases),
# with a VERIFICATION.json whose `graph` is their records' digests, so the refresh's whole-graph gate passes unless a
# row plants a fault: a local engine wasm, a math file off the pin, an unlisted graph file, a missing entry, a record
# judged on another graph, or a twin pin that is not the placed release.
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
BUILD=0123abcd
FAIL=0
# The site's shape the refresh reads (the pinned ./site-graph export, through served-roster.mjs); the fabricated
# bundles are written in it, never in typed names.
SHAPE=$(node --input-type=module -e "const { siteGraph } = await import(process.argv[1]); const g = await siteGraph(); process.stdout.write([g.STATIC_APP_PAGE, g.SITE_GRAPH_DIR, g.SITE_BUILD_ATTR, g.HOST_PROVIDED_ATTR, g.SITE_ENTRY_PAGES[0]].join('\\n'));" "$ROOT/scripts/test/lib/served-roster.mjs") \
  || { echo "FAIL  site-graph: the site shape (scripts/test/lib/served-roster.mjs siteGraph) does not load from $ROOT — run npm ci"; exit 1; }
{ read -r APP; read -r GRAPH; read -r ATTR; read -r HOST_ATTR; read -r ENTRY; } <<< "$SHAPE"
# The placed releases: one faithful graph template (moved to each bundle's build), the record digests, and the
# placement rows the plants pick from (the graph-root row and the other row, by dir).
. "$ROOT/scripts/test/lib/placed-fixture.sh"
TEMPLATE="$SCRATCH/template"
place_releases "$TEMPLATE" template || { echo "FAIL  placed-releases: the pinned releases do not place from $ROOT — run npm ci"; exit 1; }
RECORD_GRAPH=$(record_graph) || { echo "FAIL  record-graph: the placed releases' records do not read from $ROOT — run npm ci"; exit 1; }
ROWS=$(placed_rows) || { echo "FAIL  placed-rows: no SITE_PLACEMENTS from $ROOT — run npm ci"; exit 1; }
ROOT_PKG=$(awk -F'\t' '$2 == "" { print $1; exit }' <<< "$ROWS")
OTHER_PKG=$(awk -F'\t' '$2 != "" { print $1; exit }' <<< "$ROWS")
OTHER_DIR=$(awk -F'\t' '$2 != "" { print $2; exit }' <<< "$ROWS")
{ [ -n "$ROOT_PKG" ] && [ -n "$OTHER_PKG" ]; } || { echo "FAIL  placed-rows: the controls need a graph-root placement and one under a dir (got: $ROWS)"; exit 1; }
# The local-mode tell the design names: the engine wasm a local build compiles.
ENGINE_WASM=fat/pkg-web/egpt_wasm_bg.wasm
[ -f "$TEMPLATE/$GRAPH/template/$ENGINE_WASM" ] || { echo "FAIL  engine-wasm: the placed releases carry no $ENGINE_WASM — re-pick the local-graph plant"; exit 1; }
OTHER_FILE=$(cd "$TEMPLATE/$GRAPH/template/$OTHER_DIR" && find . -type f | sed 's|^\./||' | grep -v 'dist-manifest\.json$' | LC_ALL=C sort | head -1)
[ -n "$OTHER_FILE" ] || { echo "FAIL  other-file: $OTHER_PKG places no file to plant into"; exit 1; }

pass() { echo "PASS  $1"; }
fail() { echo "FAIL  $1: $2"; FAIL=1; }

# A fresh repo copy (scripts/ and package.json, node_modules linked, empty .descix/) at $SCRATCH/<name>/repo.
repo() {
  local r="$SCRATCH/$1/repo"
  mkdir -p "$r/.descix"
  cp -R "$ROOT/scripts" "$r/scripts"
  cp "$ROOT/package.json" "$r/package.json"
  ln -s "$ROOT/node_modules" "$r/node_modules"
  echo "$r"
}

# An assembled bundle at $SCRATCH/<name>/bundle, stamped <build>: the placed releases' graph and entries, an IDE
# page, app-assets/ (one file name with spaces: the fingerprint must not split it) and a GREEN record of this graph.
# Optional third argument: extra <head> markup (the host-provided declarations under test).
bundle() {
  local b="$SCRATCH/$1/bundle" build=${2:-$BUILD} head=${3:-}
  mkdir -p "$b/app-assets"
  cp -R "$TEMPLATE/." "$b/"
  mv "$b/$GRAPH/template" "$b/$GRAPH/$build"
  printf '<!doctype html><html %s="%s"><head>%s</head><body>IDE</body></html>\n' "$ATTR" "$build" "$head" > "$b/$APP"
  printf 'console.log("chunk")\n' > "$b/app-assets/index-abc.js"
  printf 'png' > "$b/app-assets/a file with spaces.png"
  printf '{"build":"%s","phases":{"root":"GREEN","prefix":"GREEN"},"graph":%s}' "$build" "$RECORD_GRAPH" > "$b/VERIFICATION.json"
  echo "$b"
}

# refused <row> <out substring>... — the refresh refused naming each substring, with site/ untouched (the front page
# still the marker, no app page, no graph).
refused() {
  local name=$1 R=$2 B=$3 want; shift 3
  if refresh "$R" "$B"; then fail "$name" "accepted"; return; fi
  for want in "$@"; do grep -qF -- "$want" "$SCRATCH/$name/out.txt" || { fail "$name" "the refusal does not name \"$want\": $(cat "$SCRATCH/$name/out.txt")"; return; }; done
  if [ "$(cat "$R/site/index.html")" = front ] && [ ! -e "$R/site/$APP" ] && [ ! -e "$R/site/$GRAPH" ]; then pass "$name"; echo "      refused: $(grep -F -- "$want" "$SCRATCH/$name/out.txt" | head -1 | sed 's/^[[:space:]]*//')"; else fail "$name" "site/ was touched"; fi
}

refresh() { bash "$1/scripts/refresh-site.sh" "$2" >"$1/../out.txt" 2>&1; }

# --- A refresh over a site/ that already carries a front page, images/ and a stale bundle file.
R=$(repo pre); B=$(bundle pre)
mkdir -p "$R/site/images"
printf '<!doctype html><html %s="fedcba9"><body>FRONT PAGE</body></html>\n' "$ATTR" > "$R/site/index.html"
printf 'marker\n' > "$R/site/images/marker.png"
printf 'sdk shim\n' > "$R/site/DeSciXAppSDK.js"
printf '{"title":"t"}\n' > "$R/site/share.json"
printf 'stale\n' > "$R/site/stale-bundle-file.js"
cp "$R/site/index.html" "$SCRATCH/front.html"; cp "$R/site/images/marker.png" "$SCRATCH/marker.png"; cp "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js"; cp "$R/site/share.json" "$SCRATCH/share.json"
if refresh "$R" "$B"; then pass "refresh-exits-0"; else fail "refresh-exits-0" "$(cat "$SCRATCH/pre/out.txt")"; fi
if cmp -s "$R/site/$APP" "$B/$APP"; then pass "writes-app-html-byte-identical"; else fail "writes-app-html-byte-identical" "site/$APP missing or differs from the bundle's $APP"; fi
if cmp -s "$R/site/index.html" "$SCRATCH/front.html"; then pass "front-page-index-html-survives"; else fail "front-page-index-html-survives" "site/index.html was overwritten or deleted"; fi
if cmp -s "$R/site/images/marker.png" "$SCRATCH/marker.png"; then pass "images-marker-survives"; else fail "images-marker-survives" "site/images/marker.png was deleted or changed"; fi
if cmp -s "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js"; then pass "descix-app-sdk-survives"; else fail "descix-app-sdk-survives" "site/DeSciXAppSDK.js was deleted or changed"; fi
if cmp -s "$R/site/share.json" "$SCRATCH/share.json"; then pass "share-json-survives"; else fail "share-json-survives" "site/share.json was deleted or changed"; fi
if [ ! -e "$R/site/stale-bundle-file.js" ]; then pass "stale-bundle-file-removed"; else fail "stale-bundle-file-removed" "a file no longer in the bundle survived"; fi
if [ -f "$R/site/app-assets/a file with spaces.png" ] && [ -f "$R/site/$GRAPH/$ENTRY" ] && [ -f "$R/site/$GRAPH/$BUILD/$ENGINE_WASM" ] && [ -f "$R/site/app-assets/index-abc.js" ]; then pass "bundle-namespaces-copied"; else fail "bundle-namespaces-copied" "app-assets/ or $GRAPH/ incomplete"; fi
got=$(jq -r '.upstream_sha // empty' "$R/.descix/site-provenance.json" 2>/dev/null)
if [ "$got" = "$BUILD" ] && grep -qF "$ATTR=\"$BUILD\"" "$R/site/$APP" 2>/dev/null; then pass "provenance-stamp-is-app-html"; else fail "provenance-stamp-is-app-html" "upstream_sha=$got, want the $APP stamp $BUILD"; fi
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
R=$(repo noapp); B=$(bundle noapp); rm "$B/$APP"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-without-app-html" "accepted"; elif grep -qF "$APP is missing" "$SCRATCH/noapp/out.txt" && [ "$(cat "$R/site/index.html")" = front ] && [ ! -e "$R/site/$APP" ]; then pass "refuses-bundle-without-app-html"; else fail "refuses-bundle-without-app-html" "$(cat "$SCRATCH/noapp/out.txt")"; fi

# A bundle that ships a front page: refused by name — the front page is the publisher's.
R=$(repo withindex); B=$(bundle withindex); printf '<!doctype html><title>bundle front</title>\n' > "$B/index.html"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-shipping-index-html" "accepted"; elif grep -qF "the front page is the publisher's; FRAQTL ships $APP" "$SCRATCH/withindex/out.txt" && [ "$(cat "$R/site/index.html")" = front ] && [ ! -e "$R/site/$APP" ]; then pass "refuses-bundle-shipping-index-html"; else fail "refuses-bundle-shipping-index-html" "$(cat "$SCRATCH/withindex/out.txt")"; fi

for owned in images DeSciXAppSDK.js share.json; do
  R=$(repo "clash-$owned"); B=$(bundle "clash-$owned")
  if [ "$owned" = images ]; then mkdir -p "$B/images"; printf x > "$B/images/x.png"; else printf x > "$B/$owned"; fi
  if refresh "$R" "$B"; then fail "refuses-bundle-shipping-$owned" "accepted"; elif grep -qF "$owned" "$SCRATCH/clash-$owned/out.txt" && [ ! -e "$R/site" ]; then pass "refuses-bundle-shipping-$owned"; else fail "refuses-bundle-shipping-$owned" "$(cat "$SCRATCH/clash-$owned/out.txt")"; fi
done

# --- The graph directory the stamp names: required, and alone.
R=$(repo nograph); B=$(bundle nograph); rm -rf "$B/$GRAPH/$BUILD"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-without-stamped-graph" "accepted a bundle stamped $BUILD with no $GRAPH/$BUILD/"; elif grep -qF "$GRAPH/$BUILD/ is missing" "$SCRATCH/nograph/out.txt" && [ "$(cat "$R/site/index.html")" = front ] && [ ! -e "$R/site/$APP" ]; then pass "refuses-bundle-without-stamped-graph"; else fail "refuses-bundle-without-stamped-graph" "$(cat "$SCRATCH/nograph/out.txt")"; fi

R=$(repo twograph); B=$(bundle twograph); mkdir -p "$B/$GRAPH/fedcba98"; printf 'old\n' > "$B/$GRAPH/fedcba98/old.js"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-with-another-builds-graph" "accepted a bundle carrying $GRAPH/fedcba98/ beside $GRAPH/$BUILD/"; elif grep -qF "fedcba98" "$SCRATCH/twograph/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-bundle-with-another-builds-graph"; else fail "refuses-bundle-with-another-builds-graph" "$(cat "$SCRATCH/twograph/out.txt")"; fi

# The other-build scan is the only guard against a stray $GRAPH/<build id>/; a scan that fails (planted: the repo copy's
# served-roster.mjs::otherBuildDirs throws) is a refusal, never "no other build".
R=$(repo scanfails); B=$(bundle scanfails); mkdir -p "$B/$GRAPH/fedcba98"; printf 'old\n' > "$B/$GRAPH/fedcba98/old.js"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
sed 's|^export async function otherBuildDirs(SITE, build) {$|&\
  throw new Error("planted scan failure");|' "$ROOT/scripts/test/lib/served-roster.mjs" > "$R/scripts/test/lib/served-roster.mjs"
if ! grep -qF 'planted scan failure' "$R/scripts/test/lib/served-roster.mjs"; then fail "refuses-when-build-scan-fails" "the plant did not land in the repo copy's served-roster.mjs"
else refused scanfails "$R" "$B" "could not be scanned for another build's graph directory" "planted scan failure"; fi

# A refresh moves the site to the new build's graph: the previous $GRAPH/<build>/ leaves site/.
R=$(repo nextbuild); B=$(bundle nextbuild)
mkdir -p "$R/site/$GRAPH/fedcba98"; printf 'old\n' > "$R/site/$GRAPH/fedcba98/old.js"
if refresh "$R" "$B" && [ ! -e "$R/site/$GRAPH/fedcba98" ] && [ -d "$R/site/$GRAPH/$BUILD" ]; then pass "previous-build-graph-leaves-site"; else fail "previous-build-graph-leaves-site" "$(cat "$SCRATCH/nextbuild/out.txt"; ls "$R/site/$GRAPH")"; fi

# --- Host-provided declarations, read from the bundle's bytes.
SDK_TAG="<script src=\"DeSciXAppSDK.js\" $HOST_ATTR></script>"

# Declared and present: accepted, the publisher's file carried over byte-identical.
R=$(repo hp-ok); B=$(bundle hp-ok "$BUILD" "$SDK_TAG")
mkdir -p "$R/site"; printf 'sdk shim\n' > "$R/site/DeSciXAppSDK.js"
if refresh "$R" "$B" && cmp -s "$R/site/DeSciXAppSDK.js" "$SCRATCH/sdk.js" && cmp -s "$R/site/$APP" "$B/$APP"; then pass "accepts-declared-host-provided-present"; else fail "accepts-declared-host-provided-present" "$(cat "$SCRATCH/hp-ok/out.txt")"; fi

# Declared and MISSING from site/: refused by name, site/ untouched.
R=$(repo hp-missing); B=$(bundle hp-missing "$BUILD" "$SDK_TAG")
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-declared-host-provided-missing" "accepted a bundle whose declared DeSciXAppSDK.js is not in site/"; elif grep -qF "DeSciXAppSDK.js" "$SCRATCH/hp-missing/out.txt" && grep -qF "$HOST_ATTR" "$SCRATCH/hp-missing/out.txt" && [ "$(cat "$R/site/index.html")" = front ] && [ ! -e "$R/site/$APP" ]; then pass "refuses-declared-host-provided-missing"; else fail "refuses-declared-host-provided-missing" "$(cat "$SCRATCH/hp-missing/out.txt")"; fi

# Declared, but not a name the publisher owns (not in SITE_FOREIGN): refused, site/ untouched.
R=$(repo hp-foreign); B=$(bundle hp-foreign "$BUILD" "<script src=\"other-host.js\" $HOST_ATTR></script>")
mkdir -p "$R/site"; printf 'x\n' > "$R/site/other-host.js"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-declared-name-not-site-foreign" "accepted"; elif grep -qF "other-host.js" "$SCRATCH/hp-foreign/out.txt" && grep -qF "SITE_FOREIGN" "$SCRATCH/hp-foreign/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-declared-name-not-site-foreign"; else fail "refuses-declared-name-not-site-foreign" "$(cat "$SCRATCH/hp-foreign/out.txt")"; fi

# The attribute on an element that names no file: refused — a declaration that names nothing.
R=$(repo hp-noref); B=$(bundle hp-noref "$BUILD" "<script $HOST_ATTR></script>")
mkdir -p "$R/site"; printf 'sdk shim\n' > "$R/site/DeSciXAppSDK.js"
if refresh "$R" "$B"; then fail "refuses-declaration-naming-no-file" "accepted"; elif grep -qF "names no src" "$SCRATCH/hp-noref/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-declaration-naming-no-file"; else fail "refuses-declaration-naming-no-file" "$(cat "$SCRATCH/hp-noref/out.txt")"; fi

# The home link FRAQTL's APP declares (<link rel="home" href="index.html">): the front page is
# the declared file, so it must be in site/ — and it is carried over, never written by the refresh.
HOME_TAG="<link rel=\"home\" href=\"index.html\" $HOST_ATTR>"
R=$(repo home-ok); B=$(bundle home-ok "$BUILD" "$HOME_TAG")
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B" && [ "$(cat "$R/site/index.html")" = front ] && cmp -s "$R/site/$APP" "$B/$APP"; then pass "accepts-home-link-with-front-page"; else fail "accepts-home-link-with-front-page" "$(cat "$SCRATCH/home-ok/out.txt")"; fi

R=$(repo home-missing); B=$(bundle home-missing "$BUILD" "$HOME_TAG")
mkdir -p "$R/site"; printf 'sdk shim\n' > "$R/site/DeSciXAppSDK.js"
if refresh "$R" "$B"; then fail "refuses-home-link-without-front-page" "accepted a bundle whose declared index.html is not in site/"; elif grep -qF "\"index.html\" $HOST_ATTR, and site/index.html is missing" "$SCRATCH/home-missing/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-home-link-without-front-page"; else fail "refuses-home-link-without-front-page" "$(cat "$SCRATCH/home-missing/out.txt")"; fi

# --- Maintainer state never ships: a .claude/ or agent-memory/ directory in the bundle, or in a
# carried-over publisher entry, is refused and site/ is left untouched.
R=$(repo leak-claude); B=$(bundle leak-claude); mkdir -p "$B/$GRAPH/$BUILD/.claude"; printf 'x\n' > "$B/$GRAPH/$BUILD/.claude/settings.json"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-carrying-.claude" "accepted"; elif grep -qF "./$GRAPH/$BUILD/.claude" "$SCRATCH/leak-claude/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-bundle-carrying-.claude"; else fail "refuses-bundle-carrying-.claude" "$(cat "$SCRATCH/leak-claude/out.txt")"; fi

R=$(repo leak-memory); B=$(bundle leak-memory); mkdir -p "$B/app-assets/agent-memory"; printf 'x\n' > "$B/app-assets/agent-memory/MEMORY.md"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-bundle-carrying-agent-memory" "accepted"; elif grep -qF "./app-assets/agent-memory" "$SCRATCH/leak-memory/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-bundle-carrying-agent-memory"; else fail "refuses-bundle-carrying-agent-memory" "$(cat "$SCRATCH/leak-memory/out.txt")"; fi

R=$(repo leak-foreign); B=$(bundle leak-foreign); mkdir -p "$R/site/images/.claude"; printf 'x\n' > "$R/site/images/.claude/x"
if refresh "$R" "$B"; then fail "refuses-carried-over-.claude" "accepted"; elif grep -qF "site/images/.claude" "$SCRATCH/leak-foreign/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-carried-over-.claude"; else fail "refuses-carried-over-.claude" "$(cat "$SCRATCH/leak-foreign/out.txt")"; fi

# The stamp must be a build id by the package's SITE_BUILD_ID_RE: a 7-hex stamp is refused, site/ untouched.
R=$(repo shortid); B=$(bundle shortid fedcba9)
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-stamp-not-a-build-id" "accepted the stamp fedcba9"; elif grep -qF "$ATTR=\"fedcba9\", not a build id" "$SCRATCH/shortid/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-stamp-not-a-build-id"; else fail "refuses-stamp-not-a-build-id" "$(cat "$SCRATCH/shortid/out.txt")"; fi

# The shape comes from the pinned package: without it installed the refresh refuses, naming npm ci.
R=$(repo nopkg); B=$(bundle nopkg); rm "$R/node_modules"
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
if refresh "$R" "$B"; then fail "refuses-without-site-graph-package" "accepted with no @descix/frqtl-web installed"; elif grep -qF "the site shape (scripts/test/lib/served-roster.mjs siteGraph) does not load" "$SCRATCH/nopkg/out.txt" && grep -qF "run npm ci" "$SCRATCH/nopkg/out.txt" && [ ! -e "$R/site/$APP" ]; then pass "refuses-without-site-graph-package"; else fail "refuses-without-site-graph-package" "$(cat "$SCRATCH/nopkg/out.txt")"; fi

# Two stamps on the IDE page: the package's reader throws, the refresh refuses.
R=$(repo twostamps); B=$(bundle twostamps)
mkdir -p "$R/site"; printf 'front\n' > "$R/site/index.html"
printf '<html %s="fedcba98"></html>\n' "$ATTR" >> "$B/$APP"
refused twostamps "$R" "$B" "has no single build stamp" "2 $ATTR stamps"

# --- The whole graph is the pinned releases (scripts/test/served-release.mjs over siteGraphFaults); each refused,
# site/ untouched.
front() { mkdir -p "$1/site"; printf 'front\n' > "$1/site/index.html"; }

R=$(repo refuses-local-graph-bundle); B=$(bundle refuses-local-graph-bundle); front "$R"
printf '\0' >> "$B/$GRAPH/$BUILD/$ENGINE_WASM"
refused refuses-local-graph-bundle "$R" "$B" "is not the releases package.json pins" "graph file $ENGINE_WASM is "

R=$(repo refuses-math-dir-off-pin); B=$(bundle refuses-math-dir-off-pin); front "$R"
printf ' ' >> "$B/$GRAPH/$BUILD/$OTHER_DIR/$OTHER_FILE"
refused refuses-math-dir-off-pin "$R" "$B" "is not the releases package.json pins" "graph file $OTHER_DIR/$OTHER_FILE is "

R=$(repo refuses-unlisted-graph-file); B=$(bundle refuses-unlisted-graph-file); front "$R"
printf '//\n' > "$B/$GRAPH/$BUILD/stray.js"
refused refuses-unlisted-graph-file "$R" "$B" "is not the releases package.json pins" "graph file stray.js is not listed by "

R=$(repo refuses-entry-missing); B=$(bundle refuses-entry-missing); front "$R"
rm "$B/$GRAPH/$ENTRY"
refused refuses-entry-missing "$R" "$B" "is not the releases package.json pins" "entry $ENTRY (" "is absent from $GRAPH/"

R=$(repo refuses-entry-in-graph); B=$(bundle refuses-entry-in-graph); front "$R"
cp "$B/$GRAPH/$ENTRY" "$B/$GRAPH/$BUILD/$ENTRY"
refused refuses-entry-in-graph "$R" "$B" "is not the releases package.json pins" "entry $ENTRY (" "is still inside the graph"

R=$(repo refuses-record-graph-mismatch); B=$(bundle refuses-record-graph-mismatch); front "$R"
other_digest=$(jq -r --arg k "$OTHER_PKG" '.[$k]' <<< "$RECORD_GRAPH")
jq -c --arg k "$ROOT_PKG" --arg v "$other_digest" '.graph[$k] = $v' "$B/VERIFICATION.json" > "$B/v.json" && mv "$B/v.json" "$B/VERIFICATION.json"
refused refuses-record-graph-mismatch "$R" "$B" "is not the graph of the pinned releases" "$ROOT_PKG: the record has $other_digest"

R=$(repo refuses-twin-pin-off-placed); B=$(bundle refuses-twin-pin-off-placed); front "$R"
placed_version=$(jq -r '.version' "$ROOT/node_modules/$OTHER_PKG/dist/dist-manifest.json")
jq --arg k "$OTHER_PKG" --arg v "$placed_version-p9.1" '.devDependencies[$k] = $v' "$ROOT/package.json" > "$R/package.json"
refused refuses-twin-pin-off-placed "$R" "$B" "is not the releases package.json pins" "the pin is $OTHER_PKG@$placed_version-p9.1"

exit "$FAIL"
