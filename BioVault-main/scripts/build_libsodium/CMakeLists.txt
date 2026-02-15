# CMakeLists.txt for cross-compiling libsodium via Android NDK
# This file compiles libsodium's C sources directly, bypassing autotools.
# Usage: see build_libsodium_android.ps1

cmake_minimum_required(VERSION 3.18)
project(sodium C)

# We need to generate the version header from the template
set(VERSION "1.0.20")
set(SODIUM_LIBRARY_VERSION_MAJOR 26)
set(SODIUM_LIBRARY_VERSION_MINOR 2)
set(SODIUM_LIBRARY_MINIMAL_DEF "")

# libsodium source root (set by parent script via -DSODIUM_SRC_DIR)
if(NOT DEFINED SODIUM_SRC_DIR)
    message(FATAL_ERROR "SODIUM_SRC_DIR must be set")
endif()

# Normalize Windows paths to forward slashes
file(TO_CMAKE_PATH "${SODIUM_SRC_DIR}" SODIUM_SRC_DIR)

set(SODIUM_SRC "${SODIUM_SRC_DIR}/src/libsodium")
set(SODIUM_INCLUDE "${SODIUM_SRC}/include")

# Configure version.h if template exists
if(EXISTS "${SODIUM_INCLUDE}/sodium/version.h.in")
    configure_file(
        "${SODIUM_INCLUDE}/sodium/version.h.in"
        "${CMAKE_CURRENT_BINARY_DIR}/sodium/version.h"
        @ONLY
    )
endif()

# Collect all C source files
file(GLOB_RECURSE SODIUM_SOURCES "${SODIUM_SRC}/*.c")

# Remove test/benchmark files if any snuck in
list(FILTER SODIUM_SOURCES EXCLUDE REGEX "test")

# Platform definitions — mirrors what autotools ./configure produces on Android
add_definitions(
    -DPACKAGE_NAME="libsodium"
    -DPACKAGE_TARNAME="libsodium"
    -DPACKAGE_VERSION="${VERSION}"
    -DPACKAGE_STRING="libsodium ${VERSION}"
    -DPACKAGE_URL="https://github.com/jedisct1/libsodium"
    -DPACKAGE_BUGREPORT="https://github.com/jedisct1/libsodium/issues"
    -DHAVE_PTHREAD=1
    -DSTDC_HEADERS=1
    -DHAVE_SYS_TYPES_H=1
    -DHAVE_SYS_STAT_H=1
    -DHAVE_SYS_MMAN_H=1
    -DHAVE_SYS_PARAM_H=1
    -DHAVE_SYS_RANDOM_H=1
    -DHAVE_STDLIB_H=1
    -DHAVE_STRING_H=1
    -DHAVE_MEMORY_H=1
    -DHAVE_STRINGS_H=1
    -DHAVE_INTTYPES_H=1
    -DHAVE_STDINT_H=1
    -DHAVE_UNISTD_H=1
    -DHAVE_DLFCN_H=1
    -D__STDC_LIMIT_MACROS
    -D__STDC_CONSTANT_MACROS
    -DNATIVE_LITTLE_ENDIAN=1
    -DHAVE_INLINE_ASM=1
    -DHAVE_TI_MODE=1
    -DHAVE_ATOMIC_OPS=1
    -DHAVE_C_VARARRAYS=1
    -DHAVE_WEAK_SYMBOLS=1
    -DHAVE_GETPID=1
    -DHAVE_POSIX_MEMALIGN=1
    -DHAVE_MMAP=1
    -DHAVE_MLOCK=1
    -DHAVE_MADVISE=1
    -DHAVE_MPROTECT=1
    -DCONFIGURED=1
)

# Android-specific
if(ANDROID)
    add_definitions(
        -DHAVE_ARC4RANDOM=1
        -DHAVE_ARC4RANDOM_BUF=1
        -DHAVE_SAFE_ARC4RANDOM=1
    )
    if(ANDROID_ABI STREQUAL "arm64-v8a")
        add_definitions(
            -DHAVE_ARMCRYPTO=1
        )
    endif()
endif()

# Build as static library
add_library(sodium STATIC ${SODIUM_SOURCES})

target_include_directories(sodium
    PUBLIC
        "${SODIUM_INCLUDE}"
        "${SODIUM_INCLUDE}/sodium"
        "${CMAKE_CURRENT_BINARY_DIR}"
    PRIVATE
        "${SODIUM_SRC}"
        "${SODIUM_SRC}/include/sodium"
)

# Compiler flags
target_compile_options(sodium PRIVATE
    -Os
    -fPIC
    -fvisibility=hidden
    -fno-strict-aliasing
    -Wall
    -Wno-unknown-pragmas
    -Wno-unused-function
    -Wno-unused-variable
)

# Install
install(TARGETS sodium
    ARCHIVE DESTINATION lib
)

install(DIRECTORY "${SODIUM_INCLUDE}/"
    DESTINATION include
    FILES_MATCHING PATTERN "*.h"
)

# Install generated version.h if it exists
if(EXISTS "${CMAKE_CURRENT_BINARY_DIR}/sodium/version.h")
    install(FILES "${CMAKE_CURRENT_BINARY_DIR}/sodium/version.h"
        DESTINATION include/sodium
    )
endif()
