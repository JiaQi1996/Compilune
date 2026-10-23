#!/bin/bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_REPO_ROOT="$(cd "$TASK_ROOT/../.." && pwd)"
cd "$TASK_REPO_ROOT"
TASK_VERSION="$(cat VERSION)"
TASK_ARCH="$(uname -m)"
if [[ $# -eq 2 && "$1" == --arch && ( "$2" == arm64 || "$2" == x86_64 ) ]]; then
    TASK_ARCH="$2"
elif [[ $# -ne 0 ]]; then
    printf 'Usage: %s [--arch arm64|x86_64]\n' "$0" >&2
    exit 2
fi
"$TASK_ROOT/scripts/build-app.sh" --arch "$TASK_ARCH"
TASK_APP="$TASK_ROOT/.build-$TASK_ARCH/artifacts/Compilune-$TASK_ARCH.app"
TASK_NAME="Compilune-$TASK_VERSION-$TASK_ARCH"
TASK_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/folio-dmg.XXXXXX")"
trap 'rm -rf "$TASK_STAGE"' EXIT

mkdir -p dist
ditto "$TASK_APP" "$TASK_STAGE/Compilune.app"
ln -s /Applications "$TASK_STAGE/Applications"
hdiutil create -volname "Compilune" -srcfolder "$TASK_STAGE" -ov -format UDZO "dist/$TASK_NAME.dmg"
hdiutil verify "dist/$TASK_NAME.dmg"
(
    cd dist
    shasum -a 256 "$TASK_NAME.dmg" > "$TASK_NAME.sha256"
)
printf 'Packaged: dist/%s.dmg and dist/%s.sha256\n' "$TASK_NAME" "$TASK_NAME"
