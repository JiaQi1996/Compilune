#!/bin/bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_REPO_ROOT="$(cd "$TASK_ROOT/../.." && pwd)"
cd "$TASK_ROOT"
TASK_VERSION="$(cat "$TASK_REPO_ROOT/VERSION")"
TASK_BUILD_NUMBER="${FOLIO_BUILD_NUMBER:-10}"
TASK_CONFIGURATION=release
TASK_BUNDLE_ID=local.folio.tex
TASK_ARCH="$(uname -m)"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --arch)
            TASK_ARCH="${2:-}"
            if [[ "$TASK_ARCH" != arm64 && "$TASK_ARCH" != x86_64 ]]; then
                printf 'Architecture must be arm64 or x86_64.\n' >&2
                exit 2
            fi
            shift 2 ;;
        *) printf 'Usage: %s [--arch arm64|x86_64]\n' "$0" >&2; exit 2 ;;
    esac
done
TASK_APP_NAME="Folio TeX-$TASK_ARCH"
TASK_SCRATCH="$TASK_ROOT/.build-$TASK_ARCH"

export CLANG_MODULE_CACHE_PATH="${TMPDIR:-/tmp}/folio-clang-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="${TMPDIR:-/tmp}/folio-swift-cache"
TASK_BUILD_ARGS=(--build-system native --disable-sandbox --disable-build-manifest-caching
    --scratch-path "$TASK_SCRATCH" --cache-path "${TMPDIR:-/tmp}/folio-spm-cache"
    -c "$TASK_CONFIGURATION" --arch "$TASK_ARCH" --product FolioTeX)
mkdir -p "$TASK_SCRATCH/artifacts"
swift build "${TASK_BUILD_ARGS[@]}"
TASK_BIN="$(swift build "${TASK_BUILD_ARGS[@]}" --show-bin-path)"

# Assemble a fresh bundle so deleted resources do not survive rebuilds.
TASK_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/folio-app.XXXXXX")"
trap 'rm -rf "$TASK_STAGE"' EXIT
TASK_APP="$TASK_STAGE/$TASK_APP_NAME.app"
mkdir -p "$TASK_APP/Contents/MacOS" "$TASK_APP/Contents/Resources"
cp "$TASK_BIN/FolioTeX" "$TASK_APP/Contents/MacOS/FolioTeX"
cp -R "$TASK_ROOT/Sources/FolioTeX/Resources/." "$TASK_APP/Contents/Resources/"
cp "$TASK_REPO_ROOT/LICENSE" "$TASK_APP/Contents/Resources/Licenses/FolioTeX-MIT.txt"
lipo -verify_arch "$TASK_ARCH" "$TASK_APP/Contents/MacOS/FolioTeX"
cat > "$TASK_APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundleExecutable</key><string>FolioTeX</string>
    <key>CFBundleIdentifier</key><string>$TASK_BUNDLE_ID</string>
    <key>CFBundleName</key><string>$TASK_APP_NAME</string>
    <key>CFBundleVersion</key><string>$TASK_BUILD_NUMBER</string>
    <key>CFBundleShortVersionString</key><string>$TASK_VERSION</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
</dict></plist>
PLIST
plutil -lint "$TASK_APP/Contents/Info.plist"
codesign --force --deep --sign - "$TASK_APP"
codesign --verify --deep --strict "$TASK_APP"
rm -rf "$TASK_SCRATCH/artifacts/$TASK_APP_NAME.app"
ditto "$TASK_APP" "$TASK_SCRATCH/artifacts/$TASK_APP_NAME.app"
printf 'Built: %s\n' "$TASK_SCRATCH/artifacts/$TASK_APP_NAME.app"
