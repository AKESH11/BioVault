set -e

cd "/d/projects/biovault/biovault-main/scripts/build_libsodium/libsodium-1.0.20"

# Clean previous build
make distclean 2>/dev/null || true

export CC="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android24-clang"
export CXX="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android24-clang++"
export AR="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ar"
export AS="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-as"
export LD="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/ld"
export RANLIB="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ranlib"
export STRIP="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-strip"
export MAKE="/c/users/akesh/appdata/local/android/sdk/ndk/29.0.14206865/prebuilt/windows-x86_64/bin/make.exe"

echo "CC=$CC"
$CC --version 2>&1 | head -1

./configure \
    --host="aarch64-linux-android" \
    --prefix="/d/projects/biovault/biovault-main/scripts/build_libsodium/install-arm64-v8a" \
    --disable-shared \
    --enable-static \
    --with-pic \
    --disable-asm \
    CFLAGS="-Os -fPIC" \
    2>&1 | tail -3

echo "Running make..."
$MAKE -j4 2>&1 | tail -3
$MAKE install 2>&1 | tail -3

echo "Done: arm64-v8a"