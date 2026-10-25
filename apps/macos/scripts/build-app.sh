#!/bin/bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TASK_REPO_ROOT="$(cd "$TASK_ROOT/../.." && pwd)"
cd "$TASK_ROOT"
TASK_VERSION="$(cat "$TASK_REPO_ROOT/VERSION")"
TASK_BUILD_NUMBER="${COMPILUNE_BUILD_NUMBER:-${FOLIO_BUILD_NUMBER:-14}}"
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
TASK_APP_NAME="Compilune-$TASK_ARCH"
TASK_SCRATCH="$TASK_ROOT/.build-$TASK_ARCH"
bash "$TASK_REPO_ROOT/scripts/prepare-perl-macos.sh" "$TASK_ARCH"

export CLANG_MODULE_CACHE_PATH="${TMPDIR:-/tmp}/folio-clang-cache"
export SWIFTPM_MODULECACHE_OVERRIDE="${TMPDIR:-/tmp}/folio-swift-cache"
TASK_BUILD_ARGS=(--build-system native --disable-sandbox --disable-build-manifest-caching
    --scratch-path "$TASK_SCRATCH" --cache-path "${TMPDIR:-/tmp}/folio-spm-cache"
    -c "$TASK_CONFIGURATION" --arch "$TASK_ARCH" --product Compilune)
mkdir -p "$TASK_SCRATCH/artifacts"
swift build "${TASK_BUILD_ARGS[@]}"
TASK_BIN="$(swift build "${TASK_BUILD_ARGS[@]}" --show-bin-path)"

# Assemble a fresh bundle so deleted resources do not survive rebuilds.
TASK_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/folio-app.XXXXXX")"
trap 'rm -rf "$TASK_STAGE"' EXIT
TASK_APP="$TASK_STAGE/$TASK_APP_NAME.app"
mkdir -p "$TASK_APP/Contents/MacOS" "$TASK_APP/Contents/Resources"
cp "$TASK_BIN/Compilune" "$TASK_APP/Contents/MacOS/Compilune"
cp -R "$TASK_ROOT/Sources/Compilune/Resources/." "$TASK_APP/Contents/Resources/"
cp "$TASK_REPO_ROOT/LICENSE" "$TASK_APP/Contents/Resources/Licenses/Compilune-MIT.txt"
ditto "$TASK_REPO_ROOT/.build/runtimes/macos-$TASK_ARCH/perl" "$TASK_APP/Contents/Resources/Perl"
# Only the interpreter is launched by the app. Exclude unrelated developer scripts
# from the private runtime (CPAN/pod tools are not part of this runtime).
find "$TASK_APP/Contents/Resources/Perl/bin" -type f ! -name perl -delete
cat >> "$TASK_APP/Contents/Resources/Licenses/NOTICE.md" <<'NOTICE'

Private Perl 5.42.3 retains its original license terms. Its license texts, module notices and source/provenance are in ../Perl/Licenses and ../Perl/runtime.json.
NOTICE
lipo -verify_arch "$TASK_ARCH" "$TASK_APP/Contents/MacOS/Compilune"
cat > "$TASK_APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>CFBundleIconFile</key><string>AppIcon</string>
    <key>CFBundleExecutable</key><string>Compilune</string>
    <key>CFBundleIdentifier</key><string>$TASK_BUNDLE_ID</string>
    <key>CFBundleName</key><string>Compilune</string>
    <key>CFBundleDisplayName</key><string>Compilune</string>
    <key>CFBundleVersion</key><string>$TASK_BUILD_NUMBER</string>
    <key>CFBundleShortVersionString</key><string>$TASK_VERSION</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>NSHighResolutionCapable</key><true/>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
</dict></plist>
PLIST
plutil -lint "$TASK_APP/Contents/Info.plist"
TASK_SIGN_IDENTITY="${COMPILUNE_SIGN_IDENTITY:--}"
sign_code() {
    if [[ "$TASK_SIGN_IDENTITY" == - ]]; then
        codesign --force --sign - "$1"
    else
        codesign --force --sign "$TASK_SIGN_IDENTITY" --options runtime --timestamp "$1"
    fi
}
# Sign every interpreter/XS module first, then seal the outer application bundle.
while IFS= read -r -d '' TASK_CODE; do
    if /usr/bin/file -b "$TASK_CODE" | /usr/bin/grep -q 'Mach-O'; then
        sign_code "$TASK_CODE"
    fi
done < <(find "$TASK_APP/Contents/Resources/Perl" -type f -print0)
sign_code "$TASK_APP"
codesign --verify --deep --strict "$TASK_APP"
rm -rf "$TASK_SCRATCH/artifacts/$TASK_APP_NAME.app"
ditto "$TASK_APP" "$TASK_SCRATCH/artifacts/$TASK_APP_NAME.app"
printf 'Built: %s\n' "$TASK_SCRATCH/artifacts/$TASK_APP_NAME.app"
