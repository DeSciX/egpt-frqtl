# Sourced by scripts/refresh-kb.sh and run by scripts/assemble-site.mjs. The one definition of a tree fingerprint.

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# find(1) arguments listing every file under the current directory except the named top-level
# entries (files or directories). With no names, exactly `find . -type f`.
_tree_find() {
  local prune=() name
  for name in "$@"; do
    [ ${#prune[@]} -eq 0 ] || prune+=(-o)
    prune+=(-path "./$name")
  done
  if [ ${#prune[@]} -eq 0 ]; then
    find . -type f -print0
  else
    find . \( "${prune[@]}" \) -prune -o -type f -print0
  fi
}

# tree_sha256 <dir> [excluded top-level entry...]
# sha256 over the sorted `sha256  ./path` listing of every file under <dir>, minus the excluded
# top-level entries. -print0 | sort -z | xargs -0 is load-bearing: pub/images carries a filename
# with spaces, and a whitespace-split pipeline silently drops it from the hash.
tree_sha256() {
  local dir=$1; shift
  (cd "$dir" && _tree_find "$@" | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
}

# tree_file_count <dir> [excluded top-level entry...]
tree_file_count() {
  local dir=$1; shift
  (cd "$dir" && _tree_find "$@" | tr -cd '\0' | wc -c | tr -d ' ')
}

# replace_tree <src> <dest> [kept top-level entry...]
# Replace directory <dest> with a copy of directory <src>, staged beside <dest> so a failed copy
# leaves <dest> untouched. Each kept entry is owned outside <src>: it is carried over from the old
# <dest> when present, stays absent when absent, and a <src> that ships it is refused.
replace_tree() {
  local src=$1 dest=$2 stage name; shift 2
  for name in "$@"; do
    [ ! -e "$src/$name" ] || die "$src/$name is present, but $name in $(basename "$dest")/ is owned outside this source — refusing to shadow it"
  done
  stage=$(mktemp -d "$(dirname "$dest")/.refresh-stage.XXXXXX")
  cp -R "$src/." "$stage/" || { rm -rf "$stage"; die "copy $src -> $stage failed"; }
  find "$stage" -name .DS_Store -delete
  for name in "$@"; do
    [ ! -e "$dest/$name" ] || cp -Rp "$dest/$name" "$stage/$name" || { rm -rf "$stage"; die "carry-over of $dest/$name failed"; }
  done
  rm -rf "$dest"
  mv "$stage" "$dest"
}
