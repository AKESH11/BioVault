# Android CMakeLists.txt for Bio-Vault JNI Bridge
cmake_minimum_required(VERSION 3.18.1)
project(BioVaultCore)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Path to shared C++ core (relative to this CMakeLists.txt)
set(CPP_CORE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../../../cpp")

# Source files
set(CORE_SOURCES
    ${CPP_CORE_DIR}/src/rppg_engine.cpp
    ${CPP_CORE_DIR}/src/prnu_extractor.cpp
    ${CPP_CORE_DIR}/src/crypto_utils.cpp
    ${CPP_CORE_DIR}/src/bio_vault_native.cpp
    ${CPP_CORE_DIR}/src/BioVaultExtractor.cpp
    ${CPP_CORE_DIR}/src/consensus_handshake.cpp
    ${CPP_CORE_DIR}/src/proof_of_reality.cpp
)

# JNI bridge source
set(JNI_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/native-lib.cpp
)

# ============================================================================
# OpenCV Android SDK (4.10+) - direct path via OPENCV_ANDROID_SDK
# ============================================================================
# Expect OPENCV_ANDROID_SDK to point to the unpacked OpenCV-android-sdk root
# Example: export OPENCV_ANDROID_SDK=$HOME/OpenCV-android-sdk

if(NOT DEFINED ENV{OPENCV_ANDROID_SDK})
    message(FATAL_ERROR "OPENCV_ANDROID_SDK env var not set. Set it to OpenCV-android-sdk (4.10+) root.")
endif()

set(OpenCV_ANDROID_SDK $ENV{OPENCV_ANDROID_SDK})
set(OpenCV_ANDROID_INCLUDE "${OpenCV_ANDROID_SDK}/sdk/native/jni/include")
set(OpenCV_ANDROID_LIB "${OpenCV_ANDROID_SDK}/sdk/native/libs/${ANDROID_ABI}/libopencv_java4.so")

if(NOT EXISTS "${OpenCV_ANDROID_LIB}")
    message(FATAL_ERROR "OpenCV lib not found for ABI ${ANDROID_ABI} at ${OpenCV_ANDROID_LIB}")
endif()

add_library(opencv_java4 SHARED IMPORTED)
set_target_properties(opencv_java4 PROPERTIES IMPORTED_LOCATION ${OpenCV_ANDROID_LIB})

set(HAVE_OPENCV ON)

# ============================================================================
# BLAKE3 via FetchContent (C implementation)
# ============================================================================
include(FetchContent)

FetchContent_Declare(blake3
    GIT_REPOSITORY https://github.com/BLAKE3-team/BLAKE3.git
    GIT_TAG 1.5.0
    SOURCE_SUBDIR c
)
FetchContent_MakeAvailable(blake3)
set(HAVE_BLAKE3 ON)

# Create shared library for Android
add_library(${PROJECT_NAME} SHARED
    ${CORE_SOURCES}
    ${JNI_SOURCES}
)

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
    ${CPP_CORE_DIR}/include
    ${OpenCV_ANDROID_INCLUDE}
    ${blake3_SOURCE_DIR}/c
)

# Link libraries
target_link_libraries(${PROJECT_NAME}
    android
    log
    opencv_java4
    blake3
)

# Compile definitions
# Note: OpenSSL, libsodium, BLAKE3 may need to be built for Android separately
target_compile_definitions(${PROJECT_NAME} PRIVATE
    HAVE_OPENCV
    HAVE_BLAKE3
)

# If OpenCV is available for Android:
# if(OpenCV_FOUND)
#     target_compile_definitions(${PROJECT_NAME} PRIVATE HAVE_OPENCV)
#     target_link_libraries(${PROJECT_NAME} ${OpenCV_LIBS})
# endif()

# Compiler flags
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    target_compile_options(${PROJECT_NAME} PRIVATE
        -O3
        -fvisibility=hidden
    )
else()
    target_compile_options(${PROJECT_NAME} PRIVATE
        -g
        -Wall
        -Wextra
    )
endif()

# Strip debug symbols in release builds
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
        COMMAND ${CMAKE_STRIP} --strip-debug --strip-unneeded 
        $<TARGET_FILE:${PROJECT_NAME}>
    )
endif()
