# Sourced by scripts/refresh-*.sh. The one definition of a tree fingerprint.

die() {
  echo "ERROR: $*" >&2
  exit 1
}

# sha256 over the sorted `sha256  ./path` listing of every file under $1.
# -print0 | sort -z | xargs -0 is load-bearing: pub/images carries a filename with
# spaces, and a whitespace-split pipeline silently drops it from the hash.
tree_sha256() {
  (cd "$1" && find . -type f -print0 | LC_ALL=C sort -z | xargs -0 shasum -a 256 | shasum -a 256 | cut -d' ' -f1)
}

tree_file_count() {
  find "$1" -type f | wc -l | tr -d ' '
}

# Replace directory $2 with a copy of directory $1, staged beside $2 so a failed copy
# leaves $2 untouched.
replace_tree() {
  local src=$1 dest=$2 stage
  stage=$(mktemp -d "$(dirname "$dest")/.refresh-stage.XXXXXX")
  cp -R "$src/." "$stage/" || { rm -rf "$stage"; die "copy $src -> $stage failed"; }
  find "$stage" -name .DS_Store -delete
  rm -rf "$dest"
  mv "$stage" "$dest"
}
