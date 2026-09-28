# Sourced by scripts/refresh-site.sh and scripts/test/verification-record.sh (after tree.sh,
# which defines die). The one reader of a FRAQTL bundle's VERIFICATION.json.

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
  echo "verification record OK: build $VERIFIED_BUILD, $(printf '%s' "$PHASES" | tr '\n' ' ')"
}
