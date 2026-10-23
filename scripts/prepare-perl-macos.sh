#!/bin/bash
set -euo pipefail
TASK_REPO="$(cd "$(dirname "$0")/.." && pwd)"
TASK_ARCH="${1:-$(uname -m)}"
case "$TASK_ARCH" in arm64|x86_64) ;; *) printf 'Expected arm64 or x86_64\n' >&2; exit 2 ;; esac
TASK_LOCK="$TASK_REPO/scripts/perl-runtime.lock.json"
TASK_VERSION="$(/usr/bin/plutil -extract macos.version raw -o - "$TASK_LOCK")"
TASK_HASH="$(/usr/bin/plutil -extract macos.sha256 raw -o - "$TASK_LOCK")"
TASK_URL="$(/usr/bin/plutil -extract macos.url raw -o - "$TASK_LOCK")"
TASK_CACHE="$TASK_REPO/.build/perl-cache"
TASK_OUTPUT="$TASK_REPO/.build/runtimes/macos-$TASK_ARCH/perl"
if [[ -x "$TASK_OUTPUT/bin/perl" && -f "$TASK_OUTPUT/runtime.json" ]] && /usr/bin/grep -q "$TASK_HASH" "$TASK_OUTPUT/runtime.json"; then
    env -u PERL5LIB -u PERLLIB -u PERL5OPT "$TASK_OUTPUT/bin/perl" -MFile::Path -MFile::Temp -MCwd -MTime::HiRes -MDigest::MD5 -MUnicode::Normalize -MEncode -MFile::Glob -MList::Util -e 'exit 0'
    printf 'Private Perl ready: %s\n' "$TASK_OUTPUT"
    exit 0
fi
mkdir -p "$TASK_CACHE"
TASK_ARCHIVE="${COMPILUNE_PERL_ARCHIVE:-$TASK_CACHE/perl-$TASK_VERSION.tar.gz}"
if [[ ! -f "$TASK_ARCHIVE" ]]; then /usr/bin/curl --fail --location --retry 2 "$TASK_URL" -o "$TASK_ARCHIVE"; fi
printf '%s  %s\n' "$TASK_HASH" "$TASK_ARCHIVE" | /usr/bin/shasum -a 256 -c -
TASK_WORK="$(mktemp -d "${TMPDIR:-/tmp}/compilune-perl-$TASK_ARCH.XXXXXX")"
trap 'rm -rf "$TASK_WORK"' EXIT
/usr/bin/tar -xzf "$TASK_ARCHIVE" -C "$TASK_WORK"
TASK_SOURCE="$TASK_WORK/perl-$TASK_VERSION"
cd "$TASK_SOURCE"
# Configure can run the Intel probes under Rosetta on an Apple Silicon build host.
TASK_RUN=(/usr/bin/arch "-$TASK_ARCH")
TASK_TOOLCHAIN="$(dirname "$(/usr/bin/xcrun --find clang)")"
TASK_SDK="$(/usr/bin/xcrun --show-sdk-path)"
export PATH="$TASK_TOOLCHAIN:/usr/bin:/bin:/usr/sbin:/sbin"
export MAKE="$TASK_TOOLCHAIN/make"
export MACOSX_DEPLOYMENT_TARGET=14.0
export SDKROOT="$TASK_SDK"
unset PERL5LIB PERLLIB PERL5OPT DYLD_LIBRARY_PATH DYLD_FALLBACK_LIBRARY_PATH || true
"${TASK_RUN[@]}" /bin/sh Configure -des -Dprefix="$TASK_WORK/install" \
    -Duserelocatableinc -Uuseshrplib "-Dcc=$TASK_TOOLCHAIN/clang" \
    "-Dar=$TASK_TOOLCHAIN/ar" "-Dnm=$TASK_TOOLCHAIN/nm" "-Dranlib=$TASK_TOOLCHAIN/ranlib" \
    "-Dmake=$TASK_TOOLCHAIN/make" "-Dld=$TASK_TOOLCHAIN/clang" \
    "-Dcppstdin=$TASK_TOOLCHAIN/clang -E -arch $TASK_ARCH -isysroot $TASK_SDK" \
    -Doptimize=-O1 \
    "-Dccflags=-arch $TASK_ARCH -isysroot $TASK_SDK -mmacosx-version-min=14.0" \
    "-Dldflags=-arch $TASK_ARCH -isysroot $TASK_SDK -mmacosx-version-min=14.0" \
    "-Dlddlflags=-bundle -undefined dynamic_lookup -arch $TASK_ARCH -isysroot $TASK_SDK -mmacosx-version-min=14.0" \
    -Dman1dir=none -Dman3dir=none
"$TASK_TOOLCHAIN/make" -j "${COMPILUNE_BUILD_JOBS:-4}"
"$TASK_TOOLCHAIN/make" install
TASK_STAGE="$TASK_WORK/Relocated Runtime 中文/perl"
mkdir -p "$(dirname "$TASK_STAGE")"
mv "$TASK_WORK/install" "$TASK_STAGE"
mkdir -p "$TASK_STAGE/Licenses"
cp Artistic Copying README README.macosx "$TASK_STAGE/Licenses/"
cp AUTHORS "$TASK_STAGE/Licenses/Perl-AUTHORS.txt"
# Preserve the license/copyright files shipped with bundled core modules.
find cpan dist ext -type f \( -iname '*license*' -o -iname 'copying*' -o -iname 'artistic*' -o -iname 'copyright*' \) -print | while IFS= read -r TASK_NOTICE; do
    mkdir -p "$TASK_STAGE/Licenses/modules/$(dirname "$TASK_NOTICE")"
    cp "$TASK_NOTICE" "$TASK_STAGE/Licenses/modules/$TASK_NOTICE"
done
cat > "$TASK_STAGE/runtime.json" <<JSON
{"schema":1,"version":"$TASK_VERSION","platform":"darwin","architecture":"$TASK_ARCH","archiveSHA256":"$TASK_HASH","source":"$TASK_URL","license":"Artistic-1.0-Perl OR GPL-1.0-or-later","relocatable":true}
JSON
"$TASK_STAGE/bin/perl" -MFile::Path -MFile::Temp -MFile::Spec -MFile::Copy -MCwd -MTime::HiRes -MDigest::MD5 -MUnicode::Normalize -MEncode -MFile::Glob -MList::Util -e 'print "Relocated private Perl $^V ready\n"'
/usr/bin/lipo -verify_arch "$TASK_ARCH" "$TASK_STAGE/bin/perl"
mkdir -p "$(dirname "$TASK_OUTPUT")"
rm -rf "$TASK_OUTPUT"
mv "$TASK_STAGE" "$TASK_OUTPUT"
printf 'Prepared private Perl: %s\n' "$TASK_OUTPUT"
