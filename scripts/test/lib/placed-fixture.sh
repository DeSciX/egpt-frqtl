# Sourced by scripts/test/verification-record.sh and scripts/test/refresh-site.sh, with ROOT set to the repo root.
# The fixtures' view of the placed releases, read off the pinned ./site-graph export (scripts/test/lib/served-roster.mjs
# siteGraph, the one place the package is named) and the installed records; nothing typed.
#
#   placed_rows       one line per SITE_PLACEMENTS row: "<package><TAB><dir>"
#   record_graph      the faithful VERIFICATION.json `graph` member: { <package>: sha256 of the installed
#                     node_modules/<package>/dist/dist-manifest.json }, computed with shasum (not by the reader)
#   place_releases <dir> <build>
#                     write the placed releases' dists as a site graph under <dir>: each package's dist at
#                     <dir>/<SITE_GRAPH_DIR>/<build>/<row dir>/, then every entry (isSiteEntry) moved out of the graph
#                     to <dir>/<SITE_GRAPH_DIR>/<entry>

placed_rows() {
  node --input-type=module -e "const { siteGraph } = await import(process.argv[1]); const g = await siteGraph(); process.stdout.write(g.SITE_PLACEMENTS.map((r) => r.package + '\t' + r.dir).join('\n') + '\n');" "$ROOT/scripts/test/lib/served-roster.mjs"
}

record_graph() {
  local rows pkg dir d graph='{}'
  rows=$(placed_rows) || return 1
  while IFS="$(printf '\t')" read -r pkg dir; do
    [ -n "$pkg" ] || continue
    d=$(shasum -a 256 "$ROOT/node_modules/$pkg/dist/dist-manifest.json" | cut -d' ' -f1)
    [ -n "$d" ] || return 1
    graph=$(jq -c --arg k "$pkg" --arg v "$d" '. + {($k): $v}' <<< "$graph")
  done <<< "$rows"
  printf '%s' "$graph"
}

place_releases() {
  (cd "$ROOT" && node --input-type=module -e "
    const { cpSync, mkdirSync, renameSync } = await import('node:fs');
    const { dirname, join } = await import('node:path');
    const { placedReleases, siteGraph } = await import('./scripts/test/lib/served-roster.mjs');
    const g = await siteGraph();
    const [out, build] = process.argv.slice(1);
    const graph = join(out, g.SITE_GRAPH_DIR, build);
    const rs = await placedReleases();
    for (const r of rs) cpSync(dirname(r.path), join(graph, r.dir), { recursive: true });
    for (const r of rs) for (const key of Object.keys(r.files)) {
      const rel = r.dir ? r.dir + '/' + key : key;
      if (!g.isSiteEntry(rel)) continue;
      mkdirSync(dirname(join(out, g.SITE_GRAPH_DIR, rel)), { recursive: true });
      renameSync(join(graph, rel), join(out, g.SITE_GRAPH_DIR, rel));
    }" "$1" "$2")
}
