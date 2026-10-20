#!/usr/bin/env bash
set -euo pipefail

USVA="${USVA_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/usva}"
REF="${1:-feat/virva}"
SRC="packages/usva/src/presence/virva"
DEST="$(cd "$(dirname "$0")/.." && pwd)/src/virva"

files=$(git -C "$USVA" ls-tree --name-only "$REF" "$SRC/" | grep -vE '\.test\.tsx?$|/(index|registry)\.ts$')
rm -rf "$DEST"
mkdir -p "$DEST"
for f in $files; do
  git -C "$USVA" show "$REF:$f" | sed 's#"\.\./\.\./cn\.js"#"@usva-ui/react/cn"#' > "$DEST/$(basename "$f")"
done
echo "virva synced from $USVA@$REF ($(git -C "$USVA" rev-parse --short "$REF"))"
