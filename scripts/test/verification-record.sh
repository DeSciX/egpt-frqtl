#!/usr/bin/env bash
# Controls for scripts/lib/verification.sh::check_verification, run against fabricated records in a
# scratch directory (never site/). Exit 0 only when every row gets its expected verdict.
#
#   scripts/test/verification-record.sh
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
SCRATCH=$(mktemp -d)
trap 'rm -rf "$SCRATCH"' EXIT
BUILD=0123456789abcdef0123456789abcdef01234567
FAIL=0
# The faithful `graph` member (scripts/test/lib/placed-fixture.sh::record_graph) and two of its digests to swap.
. "$ROOT/scripts/test/lib/placed-fixture.sh"
GRAPH=$(record_graph) || { echo "FAIL  graph: the placed releases' records do not read from $ROOT — run npm ci"; exit 1; }
DIGESTS=()
while IFS= read -r kv; do DIGESTS+=("$kv"); done < <(jq -r 'to_entries[] | "\(.key)=\(.value)"' <<< "$GRAPH")
[ "${#DIGESTS[@]}" -ge 2 ] || { echo "FAIL  graph: the controls need two placements to swap a digest between (got ${DIGESTS[*]-none})"; exit 1; }
P1=${DIGESTS[0]%%=*}; D1=${DIGESTS[0]#*=}; D2=${DIGESTS[1]#*=}
OTHER=$(jq -c --arg k "$P1" --arg v "$D2" '.[$k] = $v' <<< "$GRAPH")
NO_P1=$(jq -c --arg k "$P1" 'del(.[$k])' <<< "$GRAPH")
EXTRA=$(jq -c '. + {"@descix/not-placed": "00"}' <<< "$GRAPH")
INSTR='"graph":'"$GRAPH"',"verified_at":"2026-09-28T00:00:00Z","instrument":{"script":"scripts/verify-static-deploy.sh"}'
BASE='"verified_at":"2026-09-28T00:00:00Z","instrument":{"script":"scripts/verify-static-deploy.sh"}'
GREEN='"phases":{"root":"GREEN","prefix":"GREEN"}'

# row <name> <accept|refuse> <record body> [stderr substring a refusal must contain]
row() {
  local name=$1 want=$2 body=$3 must=${4:-} rec="$SCRATCH/$1.json" out rc got
  [ "$body" = "<no file>" ] || printf '%s' "$body" > "$rec"
  out=$( ( . "$ROOT/scripts/lib/tree.sh"; . "$ROOT/scripts/lib/verification.sh"; check_verification "$rec" "$BUILD" ) 2>&1 )
  rc=$?
  got=$([ "$rc" -eq 0 ] && echo accept || echo refuse)
  if [ "$got" = "$want" ] && { [ -z "$must" ] || printf '%s' "$out" | grep -qF -- "$must"; }; then
    echo "PASS  $name: $got"
  else
    echo "FAIL  $name: want $want${must:+ naming \"$must\"}, got $got — $out"
    FAIL=1
  fi
}

row new-shape-all-green     accept "{\"build\":\"$BUILD\",\"phases\":{\"root\":\"GREEN\",\"prefix\":\"GREEN\"},$INSTR}"
row phases-root-red         refuse "{\"build\":\"$BUILD\",\"phases\":{\"root\":\"RED\",\"prefix\":\"GREEN\"},$INSTR}" "root=RED"
row phases-missing          refuse "{\"build\":\"$BUILD\",$INSTR}" "must be re-verified"
row phases-empty            refuse "{\"build\":\"$BUILD\",\"phases\":{},$INSTR}"
row phases-not-object       refuse "{\"build\":\"$BUILD\",\"phases\":\"GREEN\",$INSTR}"
row old-top-level-shape     refuse "{\"build\":\"$BUILD\",\"root\":\"GREEN\",\"prefix\":\"GREEN\",$INSTR}" "must be re-verified"
row verdict-suffix-x-green  refuse "{\"build\":\"$BUILD\",\"phases\":{\"root\":\"x=GREEN\",\"prefix\":\"GREEN\"},$INSTR}" "root=x=GREEN"
row verdict-suffix-eq-green refuse "{\"build\":\"$BUILD\",\"phases\":{\"root\":\"=GREEN\",\"prefix\":\"GREEN\"},$INSTR}" "root==GREEN"
row verdict-lowercase       refuse "{\"build\":\"$BUILD\",\"phases\":{\"root\":\"green\",\"prefix\":\"GREEN\"},$INSTR}" "root=green"
row verdict-boolean         refuse "{\"build\":\"$BUILD\",\"phases\":{\"root\":true,\"prefix\":\"GREEN\"},$INSTR}" "root=true"
row build-mismatch          refuse "{\"build\":\"fedcba9\",\"phases\":{\"root\":\"GREEN\",\"prefix\":\"GREEN\"},$INSTR}" "STALE"
row extra-top-level-key     accept "{\"build\":\"$BUILD\",\"phases\":{\"root\":\"GREEN\",\"prefix\":\"GREEN\"},\"note\":\"RED\",$INSTR}"
row record-missing          refuse "<no file>" "is missing"
row invalid-json            refuse "{not json" "not valid JSON"
row graph-missing           refuse "{\"build\":\"$BUILD\",$GREEN,$BASE}" "carries no \`graph\` object"
row graph-not-object        refuse "{\"build\":\"$BUILD\",$GREEN,\"graph\":\"$D1\",$BASE}" "carries no \`graph\` object"
row graph-other-manifest    refuse "{\"build\":\"$BUILD\",$GREEN,\"graph\":$OTHER,$BASE}" "$P1: the record has $D2, the installed record is $D1"
row graph-package-absent    refuse "{\"build\":\"$BUILD\",$GREEN,\"graph\":$NO_P1,$BASE}" "$P1: absent from the record"
row graph-unplaced-package  refuse "{\"build\":\"$BUILD\",$GREEN,\"graph\":$EXTRA,$BASE}" "@descix/not-placed: not a placed package"

exit "$FAIL"
