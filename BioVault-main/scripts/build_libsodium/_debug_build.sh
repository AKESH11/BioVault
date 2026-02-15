export PATH="/C/Users/akesh/AppData/Local/Android/Sdk/ndk/29.0.14206865/prebuilt/windows-x86_64/bin:$PATH"
cd "/D/PROJECTS/BioVault/BioVault-main/scripts/build_libsodium/libsodium-1.0.20"
make distclean 2>/dev/null || true
export CC="/C/Users/akesh/AppData/Local/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android24-clang"
export CXX="/C/Users/akesh/AppData/Local/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/aarch64-linux-android24-clang++"
export AR="/C/Users/akesh/AppData/Local/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ar"
export RANLIB="/C/Users/akesh/AppData/Local/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-ranlib"
export STRIP="/C/Users/akesh/AppData/Local/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-strip"
export LD="/C/Users/akesh/AppData/Local/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/ld"
./configure --host=aarch64-linux-android --disable-shared --enable-static --with-pic --disable-asm CFLAGS="-Os -fPIC" 2>&1 | tail -5
echo "=== CONFIGURE DONE ==="
make -j4 V=1 2>&1 | tail -30