#!/usr/bin/env bash
# Ship the site (R5): only when the site itself changed — a pin bump, the front page, STUDIO via the npm. A scene
# addition or edit ships with scripts/upload-scenes.mjs alone.
#
#   scripts/ship.sh --checkout <app checkout> --port <n> [--shots <dir>]
#
# --checkout  the app checkout holding the PROD workspace and wallet (the CLI runs there). When it is not this
#             tree, its site/ is replaced with this tree's (rsync --delete, never a symlink) for the upload and put
#             back to its HEAD afterwards, whatever happens; it must be clean, and its site manifest this tree's.
# --port      two free local ports, <n> and <n>+1, for the local smoke (refused if taken).
# --shots     where the PROD smoke saves its stills (default .scratch/ship-<sha8>/).
#
#  1. this tree is clean (the site uploaded is a commit); npm ci at the pins
#  2. npm run assemble: the committed site/ must be what the pins assemble (no diff)
#  3. static gates: npm test (served graph, site-static, front page, scene-check and their controls), the licence file
#  4. the served roster (read with a one-off query, scripts/lib/scenes.mjs probeUrl — never STUDIO's cache bucket,
#     which a read here would seed with whatever is served now) is scenes/roster.json byte for byte, and the front page names no card
#     that roster lacks (frontpage.mjs --roster <served copy>)
#  5. local smoke from the assembled bytes: frontpage-tiles.mjs (every tile boots its scene from the media roster)
#     and host-view.mjs
#  6. descix site upload --dry-run (both lists printed), then descix site upload
#  7. served == built: every published file's PROD bytes equal site/ (scripts/served-equals-built.mjs)
#  8. PROD smoke at https://egpt-frqtl.descix.net/ (scripts/test/studio-smoke.mjs, with stills)
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
die() { echo "ship: $*" >&2; exit 1; }
CHECKOUT= PORT= SHOTS=
while [ $# -gt 0 ]; do
  case "$1" in
    --checkout) CHECKOUT=${2:?--checkout takes a directory}; shift 2 ;;
    --port) PORT=${2:?--port takes a number}; shift 2 ;;
    --shots) SHOTS=${2:?--shots takes a directory}; shift 2 ;;
    *) die "unknown argument $1 (usage: scripts/ship.sh --checkout <dir> --port <n> [--shots <dir>])" ;;
  esac
done
[ -n "$CHECKOUT" ] && [ -d "$CHECKOUT" ] || die "--checkout <app checkout> is required"
CHECKOUT=$(cd "$CHECKOUT" && pwd)
[[ "$PORT" =~ ^[0-9]+$ ]] || die "--port <n> is required"
for p in "$PORT" $((PORT + 1)); do
  ! lsof -nP -iTCP:"$p" -sTCP:LISTEN >/dev/null 2>&1 || die "port $p is taken — refusing to drift"
done
[ -z "${DESCIX_API_URL+x}" ] || die "DESCIX_API_URL is set; it overrides every workspace — unset it"

cd "$ROOT"
echo "== 1. clean tree, npm ci"
[ -z "$(git status --porcelain)" ] || die "this tree has uncommitted changes — the site uploaded is a commit"
HEAD=$(git rev-parse HEAD)
SHOTS=${SHOTS:-$ROOT/.scratch/ship-${HEAD:0:8}}
npm ci --no-audit --no-fund

echo "== 2. assemble"
npm run --silent assemble
[ -z "$(git status --porcelain -- site .descix/site-provenance.json)" ] \
  || die "the pins assemble a different site/ than the committed one — commit the assembly first: $(git status --porcelain -- site .descix/site-provenance.json | head -5)"

echo "== 3. static gates"
npm test
[ -f LICENSE.md ] || die "LICENSE.md is missing"
[ "$(node -p "require('./package.json').license")" = "SEE LICENSE IN LICENSE.md" ] || die "package.json license is not \"SEE LICENSE IN LICENSE.md\""

echo "== 4. the served roster"
SERVED_ROSTER=$(mktemp)
NEW_CHECKOUT_FILES=0
restore_checkout() {
  rm -f "$SERVED_ROSTER"
  if [ "$CHECKOUT" != "$ROOT" ] && [ "$NEW_CHECKOUT_FILES" = 1 ]; then
    git -C "$CHECKOUT" checkout -- site && git -C "$CHECKOUT" clean -fdq -- site
    [ -z "$(git -C "$CHECKOUT" status --porcelain -- site)" ] || echo "ship: WARNING $CHECKOUT/site/ is not back at its HEAD — restore it by hand" >&2
  fi
}
trap restore_checkout EXIT
node --input-type=module -e "
  import { writeFileSync } from 'node:fs';
  import { ROSTER_HREF, probeUrl } from './scripts/lib/scenes.mjs';
  const url = probeUrl(ROSTER_HREF);
  const r = await fetch(url);
  if (r.status !== 200) { console.error('the served roster ' + url + ' answered ' + r.status); process.exit(1); }
  writeFileSync(process.argv[1], Buffer.from(await r.arrayBuffer()));
  console.log('served roster: ' + url);
" "$SERVED_ROSTER" || die "the served roster cannot be read"
cmp -s "$SERVED_ROSTER" scenes/roster.json || die "the served roster is not scenes/roster.json — run node scripts/upload-scenes.mjs --checkout $CHECKOUT first"
node --no-warnings scripts/test/frontpage.mjs --roster "$SERVED_ROSTER" || die "the front page names a card the served roster lacks"

echo "== 5. local smoke"
node scripts/test/frontpage-tiles.mjs --port "$PORT"
node scripts/test/host-view.mjs --port $((PORT + 1))

echo "== 6. upload from $CHECKOUT"
if [ "$CHECKOUT" != "$ROOT" ]; then
  [ -z "$(git -C "$CHECKOUT" status --porcelain)" ] || die "$CHECKOUT has uncommitted changes — refusing to write its site/"
  cmp -s "$ROOT/.descix/manifests/site.json" "$CHECKOUT/.descix/manifests/site.json" || die "$CHECKOUT/.descix/manifests/site.json is not this tree's — the upload would take another file set"
  NEW_CHECKOUT_FILES=1
  rsync -a --delete "$ROOT/site/" "$CHECKOUT/site/"
fi
node scripts/site-upload.mjs --checkout "$CHECKOUT" --dry-run
node scripts/site-upload.mjs --checkout "$CHECKOUT"

echo "== 7. served == built"
node scripts/served-equals-built.mjs --site "$ROOT/site"

echo "== 8. PROD smoke"
node scripts/test/studio-smoke.mjs --root https://egpt-frqtl.descix.net/ --shots "$SHOTS"
echo "ship: $HEAD is served at https://egpt-frqtl.descix.net/ (stills: $SHOTS)"
