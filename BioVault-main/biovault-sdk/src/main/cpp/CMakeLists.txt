cmake_minimum_required(VERSION 3.22.1)
project(BioVaultSDK)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# OpenCV SDK path
set(OPENCV_DIR "${CMAKE_SOURCE_DIR}/../../../mobile-app/third_party/OpenCV-android-sdk/sdk/native/jni")

# Find OpenCV
find_package(OpenCV REQUIRED PATHS ${OPENCV_DIR} NO_DEFAULT_PATH)

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/../../../mobile-app/cpp/include
    ${OpenCV_INCLUDE_DIRS}
)

# Source files - use existing C++ code from mobile-app
set(SOURCES
    ${CMAKE_SOURCE_DIR}/../../../mobile-app/cpp/src/BioVaultExtractor.cpp
    ${CMAKE_SOURCE_DIR}/../../../mobile-app/cpp/src/prnu_extractor.cpp
    ${CMAKE_SOURCE_DIR}/../../../mobile-app/cpp/src/rppg_engine.cpp
    ${CMAKE_SOURCE_DIR}/../../../mobile-app/cpp/src/crypto_utils.cpp
    sdk_jni_bridge.cpp
)

# Create shared library
add_library(BioVaultCore SHARED ${SOURCES})

# Link OpenCV and Android libraries
target_link_libraries(BioVaultCore
    ${OpenCV_LIBS}
    android
    log
    jnigraphics
)

# Export symbols
set_target_properties(BioVaultCore PROPERTIES
    LINK_FLAGS "-Wl,--export-dynamic"
)
