# Sourced by scripts/refresh-site.sh and scripts/test/verification-record.sh (after tree.sh,
# which defines die). The one reader of a FRAQTL bundle's VERIFICATION.json.
#
# Read: `build` (the stamp), `phases` (every verdict exactly "GREEN") and `graph` (the identity of what was judged:
# { <package>: <sha256 of its dist-manifest.json in the graph> }). The `graph` key set must be the pinned
# @descix/frqtl-web ./site-graph SITE_PLACEMENTS packages, and each digest the sha256 of that package's installed
# record <package>/dist-manifest.json (scripts/test/lib/served-roster.mjs::placedReleases): a record judged on any
# other graph, or written without `graph`, is refused.
VERIFICATION_LIB_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# check_verification <VERIFICATION.json> <build sha stamped in the bundle>
check_verification() {
  local VERIFICATION=$1 UPSTREAM_SHA=$2 VERIFIED_BUILD PHASES NOT_GREEN
  [ -f "$VERIFICATION" ] || die "$VERIFICATION is missing — this bundle was never browser-verified; run FRAQTL \`make static-deploy\` (step 5 writes the record)"
  jq -e . "$VERIFICATION" >/dev/null 2>&1 || die "$VERIFICATION is not valid JSON"
  VERIFIED_BUILD=$(jq -r '.build // empty' "$VERIFICATION")
  [ -n "$VERIFIED_BUILD" ] || die "$VERIFICATION names no build — cannot tell which bundle was verified"
  [ "$VERIFIED_BUILD" = "$UPSTREAM_SHA" ] || die "$VERIFICATION records build $VERIFIED_BUILD but this bundle is stamped $UPSTREAM_SHA — the record is STALE; re-verify this bundle"
  # The verdicts are the members of .phases and nothing else; no other key is read as a verdict.
  jq -e '.phases | type == "object"' "$VERIFICATION" >/dev/null || die "$VERIFICATION carries no \`phases\` object — a record written before the verdicts moved under \`phases\` must be re-verified: re-run FRAQTL \`make static-deploy\` on this bundle"
  PHASES=$(jq -r '.phases | to_entries[] | "\(.key)=\(.value)"' "$VERIFICATION")
  [ -n "$PHASES" ] || die "$VERIFICATION records no phase verdicts (\`phases\` is empty)"
  # Exact: a verdict is GREEN only when it IS the string "GREEN".
  NOT_GREEN=$(jq -r '.phases | to_entries[] | select(.value != "GREEN") | "\(.key)=\(.value)"' "$VERIFICATION")
  [ -z "$NOT_GREEN" ] || die "$VERIFICATION is not all-GREEN ($(printf '%s' "$NOT_GREEN" | tr '\n' ' ')) — the bundle failed browser verification; land the fixes in FRAQTL and re-verify"
  # The graph the verdicts were judged on must be the graph of the pinned releases.
  jq -e '.graph | type == "object"' "$VERIFICATION" >/dev/null || die "$VERIFICATION carries no \`graph\` object — the record does not name the graph it judged; re-verify the bundle with FRAQTL \`make static-deploy GRAPH=release\` at the pinned release's tag"
  local WANT GRAPH_FAULTS
  WANT=$(node --input-type=module -e "const { placedReleases } = await import(process.argv[1]); process.stdout.write(JSON.stringify(Object.fromEntries((await placedReleases()).map((r) => [r.package, r.manifest.sha256]))));" "$VERIFICATION_LIB_DIR/../test/lib/served-roster.mjs" 2>&1) \
    || die "the placed releases' records do not load (run npm ci): $WANT"
  # jq's own exit status is read: a comparison that did not run is a refusal, never an empty fault list.
  GRAPH_FAULTS=$(jq -r --argjson want "$WANT" '
      .graph as $g
      | ([$want | keys[] | . as $k | select($g | has($k) | not) | "\($k): absent from the record"]
         + [$g | keys[] | . as $k | select($want | has($k) | not) | "\($k): not a placed package"]
         + [$want | to_entries[] | . as $e | select(($g | has($e.key)) and $g[$e.key] != $e.value) | "\($e.key): the record has \($g[$e.key]), the installed record is \($e.value)"])
      | .[]' "$VERIFICATION" 2>&1) || die "$VERIFICATION \`graph\` could not be compared to the placed releases: $GRAPH_FAULTS"
  [ -z "$GRAPH_FAULTS" ] || die "$VERIFICATION \`graph\` is not the graph of the pinned releases ($(printf '%s' "$GRAPH_FAULTS" | tr '\n' ';' | sed 's/;$//')) — the verdicts were judged on another graph; refresh from a bundle verified at the pinned releases"
  echo "verification record OK: build $VERIFIED_BUILD, $(printf '%s' "$PHASES" | tr '\n' ' '), graph $(jq -r '.graph | keys | join(" ")' "$VERIFICATION")"
}
