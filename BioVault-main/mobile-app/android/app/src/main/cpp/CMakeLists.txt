# Android CMakeLists.txt for Bio-Vault JNI Bridge
cmake_minimum_required(VERSION 3.18.1)
project(BioVaultCore)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find JNI
find_package(JNI REQUIRED)

# Path to shared C++ core (relative to this CMakeLists.txt)
set(CPP_CORE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../cpp")

# Source files
set(CORE_SOURCES
    ${CPP_CORE_DIR}/src/rppg_engine.cpp
    ${CPP_CORE_DIR}/src/prnu_extractor.cpp
    ${CPP_CORE_DIR}/src/crypto_utils.cpp
    ${CPP_CORE_DIR}/src/bio_vault_native.cpp
)

# JNI bridge source
set(JNI_SOURCES
    ${CMAKE_CURRENT_SOURCE_DIR}/native-lib.cpp
)

# Optional: OpenCV (if available on Android)
# Uncomment if you have OpenCV for Android
# set(OpenCV_DIR "/path/to/OpenCV-android-sdk/sdk/native/jni")
# find_package(OpenCV REQUIRED)

# Create shared library for Android
add_library(${PROJECT_NAME} SHARED
    ${CORE_SOURCES}
    ${JNI_SOURCES}
)

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
    ${JNI_INCLUDE_DIRS}
    ${CPP_CORE_DIR}/include
)

# Link libraries
target_link_libraries(${PROJECT_NAME}
    ${JNI_LIBRARIES}
    android
    log
)

# Compile definitions
# Note: OpenSSL, libsodium, BLAKE3 may need to be built for Android separately
# For now, we use fallback implementations
target_compile_definitions(${PROJECT_NAME} PRIVATE
    # Uncomment when crypto libraries are available:
    # HAVE_OPENSSL
    # HAVE_LIBSODIUM
    # HAVE_BLAKE3
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
