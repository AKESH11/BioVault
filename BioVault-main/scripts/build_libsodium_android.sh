#!/bin/bash
# ============================================================================
# Cross-compile libsodium for Android NDK
# ============================================================================
#
# Prerequisites:
#   - Android NDK installed (via Android Studio SDK Manager or standalone)
#   - Set ANDROID_NDK_HOME or NDK_HOME environment variable
#
# Usage:
#   chmod +x build_libsodium_android.sh
#   ./build_libsodium_android.sh
#
# Output:
#   mobile-app/third-party/libsodium/
#     include/sodium.h (+ sodium/ directory)
#     lib/arm64-v8a/libsodium.a
#     lib/x86_64/libsodium.a
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
OUTPUT_DIR="$PROJECT_ROOT/mobile-app/third-party/libsodium"
BUILD_DIR="$SCRIPT_DIR/build_libsodium"
LIBSODIUM_VERSION="1.0.20"
LIBSODIUM_URL="https://download.libsodium.org/libsodium/releases/libsodium-${LIBSODIUM_VERSION}.tar.gz"

# Find Android NDK
if [ -n "${ANDROID_NDK_HOME:-}" ]; then
    NDK="$ANDROID_NDK_HOME"
elif [ -n "${NDK_HOME:-}" ]; then
    NDK="$NDK_HOME"
elif [ -d "$HOME/Android/Sdk/ndk" ]; then
    NDK=$(ls -d "$HOME/Android/Sdk/ndk"/*/ 2>/dev/null | sort -V | tail -1 | sed 's:/$::')
else
    echo "ERROR: Cannot find Android NDK. Set ANDROID_NDK_HOME."
    exit 1
fi

echo "Using NDK: $NDK"
echo "Output: $OUTPUT_DIR"
echo ""

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Download libsodium
echo "Downloading libsodium ${LIBSODIUM_VERSION}..."
curl -sL "$LIBSODIUM_URL" -o "$BUILD_DIR/libsodium.tar.gz"
tar xzf "$BUILD_DIR/libsodium.tar.gz" -C "$BUILD_DIR"
SODIUM_SRC="$BUILD_DIR/libsodium-${LIBSODIUM_VERSION}"

# API level (matches React Native 0.73 minimum)
API_LEVEL=24
TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/linux-x86_64"

# Check for macOS toolchain if Linux doesn't exist
if [ ! -d "$TOOLCHAIN" ]; then
    TOOLCHAIN="$NDK/toolchains/llvm/prebuilt/darwin-x86_64"
fi
if [ ! -d "$TOOLCHAIN" ]; then
    echo "ERROR: Cannot find NDK toolchain at $TOOLCHAIN"
    exit 1
fi

build_abi() {
    local ABI=$1
    local HOST=$2
    local CC_PREFIX=$3

    echo "Building libsodium for $ABI..."

    cd "$SODIUM_SRC"
    make distclean 2>/dev/null || true

    export CC="${TOOLCHAIN}/bin/${CC_PREFIX}${API_LEVEL}-clang"
    export CXX="${TOOLCHAIN}/bin/${CC_PREFIX}${API_LEVEL}-clang++"
    export AR="${TOOLCHAIN}/bin/llvm-ar"
    export AS="${TOOLCHAIN}/bin/llvm-as"
    export LD="${TOOLCHAIN}/bin/ld"
    export RANLIB="${TOOLCHAIN}/bin/llvm-ranlib"
    export STRIP="${TOOLCHAIN}/bin/llvm-strip"

    local PREFIX="$BUILD_DIR/install-$ABI"
    mkdir -p "$PREFIX"

    ./configure \
        --host="$HOST" \
        --prefix="$PREFIX" \
        --disable-shared \
        --enable-static \
        --with-pic \
        --disable-asm \
        CFLAGS="-Os -fPIC" \
        2>&1 | tail -1

    make -j$(nproc 2>/dev/null || echo 4) install 2>&1 | tail -1

    # Copy to output
    mkdir -p "$OUTPUT_DIR/lib/$ABI"
    cp "$PREFIX/lib/libsodium.a" "$OUTPUT_DIR/lib/$ABI/"

    echo "  -> $OUTPUT_DIR/lib/$ABI/libsodium.a"
}

# Build for each ABI
build_abi "arm64-v8a" "aarch64-linux-android" "aarch64-linux-android"
build_abi "x86_64" "x86_64-linux-android" "x86_64-linux-android"

# Copy headers (same for all ABIs)
echo "Copying headers..."
mkdir -p "$OUTPUT_DIR/include"
cp -r "$BUILD_DIR/install-arm64-v8a/include/"* "$OUTPUT_DIR/include/"

# Cleanup
rm -rf "$BUILD_DIR"

echo ""
echo "============================================"
echo "libsodium ${LIBSODIUM_VERSION} built for Android NDK"
echo "============================================"
echo "Headers: $OUTPUT_DIR/include/sodium.h"
echo "arm64:   $OUTPUT_DIR/lib/arm64-v8a/libsodium.a"
echo "x86_64:  $OUTPUT_DIR/lib/x86_64/libsodium.a"
echo ""
echo "Next: rebuild the Android app (cd mobile-app/android && ./gradlew assembleDebug)"
