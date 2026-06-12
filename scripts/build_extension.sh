#!/usr/bin/env bash
set -euo pipefail

CONFIGURATION="${1:-debug}"
PACKAGE_NAME="moneyforward-asset-graph"

case "$CONFIGURATION" in
  debug|release) ;;
  *)
    echo "Usage: $0 [debug|release]" >&2
    exit 1
    ;;
esac

OUT_DIR="$CONFIGURATION/$PACKAGE_NAME"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

cp manifest.json "$OUT_DIR/"
cp loader.js "$OUT_DIR/"
cp style.css "$OUT_DIR/"
cp PRIVACY_POLICY.md "$OUT_DIR/"
cp -R src "$OUT_DIR/"

if [[ "$CONFIGURATION" == "release" ]]; then
  rm -f "release/$PACKAGE_NAME.zip"
  (cd "$OUT_DIR" && COPYFILE_DISABLE=1 /usr/bin/zip -rq "../$PACKAGE_NAME.zip" . \
    -x "*.DS_Store" \
    -x "__MACOSX/*")
fi

echo "Built $OUT_DIR"
