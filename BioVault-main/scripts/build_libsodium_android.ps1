<#
.SYNOPSIS
    Cross-compile libsodium for Android NDK on Windows using CMake.

.DESCRIPTION
    Downloads libsodium 1.0.20 source, cross-compiles static libraries for
    arm64-v8a and x86_64 using CMake + Ninja + Android NDK toolchain, and
    copies the output to mobile-app/third-party/libsodium/.

.NOTES
    Prerequisites:
      - Android NDK installed (via Android Studio SDK Manager)
      - Android SDK CMake installed (provides Ninja)
    
    Usage:
      .\scripts\build_libsodium_android.ps1

    Output:
      mobile-app/third-party/libsodium/
        include/sodium.h  (+ sodium/ directory)
        lib/arm64-v8a/libsodium.a
        lib/x86_64/libsodium.a
#>

param(
    [string]$NdkVersion = "",
    [string]$LibsodiumVersion = "1.0.20",
    [int]$ApiLevel = 24
)

$ErrorActionPreference = "Stop"

# ============================================================================
# Resolve paths
# ============================================================================
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$OutputDir = Join-Path $ProjectRoot "mobile-app\third-party\libsodium"
$BuildBaseDir = Join-Path $ScriptDir "build_libsodium"
$CmakeListsDir = $BuildBaseDir  # Our custom CMakeLists.txt lives here

# Find Android SDK root
$SdkRoot = "$env:LOCALAPPDATA\Android\Sdk"
if (-not (Test-Path $SdkRoot)) {
    if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
        $SdkRoot = $env:ANDROID_HOME
    } else {
        Write-Error "Android SDK not found. Set ANDROID_HOME or install via Android Studio."
        exit 1
    }
}

# Find NDK
$SdkNdkBase = Join-Path $SdkRoot "ndk"
if ($NdkVersion) {
    $NdkRoot = Join-Path $SdkNdkBase $NdkVersion
} else {
    $NdkRoot = Get-ChildItem $SdkNdkBase -Directory | Sort-Object Name | Select-Object -Last 1 | ForEach-Object { $_.FullName }
}
if (-not (Test-Path $NdkRoot)) {
    Write-Error "Android NDK not found at $NdkRoot"
    exit 1
}

$NdkToolchain = Join-Path $NdkRoot "build\cmake\android.toolchain.cmake"
if (-not (Test-Path $NdkToolchain)) {
    Write-Error "NDK CMake toolchain not found: $NdkToolchain"
    exit 1
}

# Find SDK CMake + Ninja
$SdkCmakeVersions = Get-ChildItem (Join-Path $SdkRoot "cmake") -Directory | Sort-Object Name
$SdkCmakeDir = $null
foreach ($v in $SdkCmakeVersions) {
    $ninja = Join-Path $v.FullName "bin\ninja.exe"
    $cmake = Join-Path $v.FullName "bin\cmake.exe"
    if ((Test-Path $ninja) -and (Test-Path $cmake)) {
        $SdkCmakeDir = $v.FullName
    }
}
if (-not $SdkCmakeDir) {
    Write-Error "No SDK CMake with Ninja found. Install CMake via Android Studio SDK Manager."
    exit 1
}

$CMakeExe = Join-Path $SdkCmakeDir "bin\cmake.exe"
$NinjaExe = Join-Path $SdkCmakeDir "bin\ninja.exe"

Write-Host "=============================================="
Write-Host "  libsodium $LibsodiumVersion Android Cross-Compile"
Write-Host "=============================================="
Write-Host "NDK:       $NdkRoot"
Write-Host "Toolchain: $NdkToolchain"
Write-Host "CMake:     $CMakeExe"
Write-Host "Ninja:     $NinjaExe"
Write-Host "API Level: $ApiLevel"
Write-Host "Output:    $OutputDir"
Write-Host ""

# ============================================================================
# Download libsodium if not already present
# ============================================================================
$SodiumSrc = Join-Path $BuildBaseDir "libsodium-$LibsodiumVersion"

if (-not (Test-Path (Join-Path $SodiumSrc "src\libsodium\include\sodium.h"))) {
    $TarballUrl = "https://download.libsodium.org/libsodium/releases/libsodium-$LibsodiumVersion.tar.gz"
    $TarballPath = Join-Path $BuildBaseDir "libsodium.tar.gz"

    if (-not (Test-Path $BuildBaseDir)) {
        New-Item -ItemType Directory -Path $BuildBaseDir -Force | Out-Null
    }

    Write-Host "Downloading libsodium $LibsodiumVersion..."
    Invoke-WebRequest -Uri $TarballUrl -OutFile $TarballPath -UseBasicParsing
    
    Write-Host "Extracting..."
    tar xzf $TarballPath -C $BuildBaseDir

    if (-not (Test-Path (Join-Path $SodiumSrc "src\libsodium\include\sodium.h"))) {
        Write-Error "Failed to extract libsodium source."
        exit 1
    }
    Write-Host "Source ready." -ForegroundColor Green
} else {
    Write-Host "Source already present, skipping download." -ForegroundColor Yellow
}

# ============================================================================
# Ensure custom CMakeLists.txt exists
# ============================================================================
if (-not (Test-Path (Join-Path $CmakeListsDir "CMakeLists.txt"))) {
    Write-Error "CMakeLists.txt not found in $CmakeListsDir. It should have been created by the project."
    exit 1
}

# ============================================================================
# Create output directories
# ============================================================================
New-Item -ItemType Directory -Path (Join-Path $OutputDir "lib\arm64-v8a") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $OutputDir "lib\armeabi-v7a") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $OutputDir "lib\x86_64") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $OutputDir "include") -Force | Out-Null

# ============================================================================
# Build for each ABI
# ============================================================================
$ABIs = @(
    @{ Name = "arm64-v8a" },
    @{ Name = "armeabi-v7a" },
    @{ Name = "x86_64" }
)

foreach ($abi in $ABIs) {
    $abiName = $abi.Name

    Write-Host ""
    Write-Host "=============================================="
    Write-Host "  Building for $abiName"
    Write-Host "=============================================="

    $BuildDir = Join-Path $BuildBaseDir "cmake-build-$abiName"
    $InstallDir = Join-Path $BuildBaseDir "cmake-install-$abiName"

    # Clean previous build
    if (Test-Path $BuildDir) { Remove-Item -Recurse -Force $BuildDir }
    if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
    New-Item -ItemType Directory -Path $BuildDir -Force | Out-Null

    # CMake configure
    Write-Host "  Configuring..."
    $configArgs = @(
        "-S", $CmakeListsDir,
        "-B", $BuildDir,
        "-G", "Ninja",
        "-DCMAKE_MAKE_PROGRAM=$NinjaExe",
        "-DCMAKE_TOOLCHAIN_FILE=$NdkToolchain",
        "-DANDROID_ABI=$abiName",
        "-DANDROID_PLATFORM=android-$ApiLevel",
        "-DANDROID_STL=c++_static",
        "-DCMAKE_BUILD_TYPE=Release",
        "-DCMAKE_INSTALL_PREFIX=$InstallDir",
        "-DSODIUM_SRC_DIR=$SodiumSrc"
    )

    & $CMakeExe @configArgs 2>&1 | ForEach-Object {
        if ($_ -match "error|ERROR|fatal|FATAL") { Write-Host "  $_" -ForegroundColor Red }
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Error "CMake configure failed for $abiName"
        # Show full output on error
        & $CMakeExe @configArgs 2>&1
        exit 1
    }

    # CMake build
    Write-Host "  Compiling..."
    & $CMakeExe --build $BuildDir --config Release -- -j4 2>&1 | ForEach-Object {
        if ($_ -match "error:|Error:|FAILED") { Write-Host "  $_" -ForegroundColor Red }
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Build failed, retrying with verbose..." -ForegroundColor Yellow
        & $CMakeExe --build $BuildDir --config Release --verbose 2>&1 | Select-Object -Last 30
        exit 1
    }

    # CMake install
    Write-Host "  Installing..."
    & $CMakeExe --install $BuildDir 2>&1 | Out-Null

    # Copy output
    $LibFile = Join-Path $InstallDir "lib\libsodium.a"
    if (Test-Path $LibFile) {
        Copy-Item $LibFile (Join-Path $OutputDir "lib\$abiName\libsodium.a") -Force
        $size = [math]::Round((Get-Item $LibFile).Length / 1KB)
        Write-Host "  -> lib/$abiName/libsodium.a ($size KB)" -ForegroundColor Green
    } else {
        # Try alternative paths
        $altPaths = @(
            (Join-Path $BuildDir "libsodium.a"),
            (Join-Path $InstallDir "lib\libsodium.a")
        )
        $found = $false
        foreach ($alt in $altPaths) {
            if (Test-Path $alt) {
                Copy-Item $alt (Join-Path $OutputDir "lib\$abiName\libsodium.a") -Force
                $size = [math]::Round((Get-Item $alt).Length / 1KB)
                Write-Host "  -> lib/$abiName/libsodium.a ($size KB) [from $alt]" -ForegroundColor Green
                $found = $true
                break
            }
        }
        if (-not $found) {
            Write-Host "  Searching for .a files..." -ForegroundColor Yellow
            Get-ChildItem $BuildDir -Recurse -Filter "*.a" | ForEach-Object { Write-Host "    Found: $($_.FullName)" }
            Write-Error "libsodium.a not found for $abiName"
            exit 1
        }
    }
}

# ============================================================================
# Copy headers (from first ABI install, all identical)
# ============================================================================
Write-Host ""
Write-Host "Copying headers..."
$HeaderSrc = Join-Path $BuildBaseDir "cmake-install-arm64-v8a\include"
if (Test-Path $HeaderSrc) {
    Copy-Item -Path "$HeaderSrc\*" -Destination (Join-Path $OutputDir "include") -Recurse -Force
    $headerCount = (Get-ChildItem (Join-Path $OutputDir "include") -Recurse -File).Count
    Write-Host "  -> include/ ($headerCount header files)" -ForegroundColor Green
} else {
    # Fallback: copy from source directly
    Write-Host "  Copying from source tree..." -ForegroundColor Yellow
    $srcHeaders = Join-Path $SodiumSrc "src\libsodium\include"
    Copy-Item -Path "$srcHeaders\*" -Destination (Join-Path $OutputDir "include") -Recurse -Force
    $headerCount = (Get-ChildItem (Join-Path $OutputDir "include") -Recurse -File).Count
    Write-Host "  -> include/ ($headerCount files from source)" -ForegroundColor Green
}

# ============================================================================
# Verify output
# ============================================================================
Write-Host ""
Write-Host "=============================================="
Write-Host "  Build Complete!" -ForegroundColor Green
Write-Host "=============================================="
Write-Host ""

$arm64Lib = Join-Path $OutputDir "lib\arm64-v8a\libsodium.a"
$x64Lib = Join-Path $OutputDir "lib\x86_64\libsodium.a"
$sodiumH = Join-Path $OutputDir "include\sodium.h"

$allOk = $true
foreach ($f in @($arm64Lib, $x64Lib, $sodiumH)) {
    if (Test-Path $f) {
        $rel = $f.Replace($OutputDir + "\", "")
        $size = if ($f -like "*.a") { "$([math]::Round((Get-Item $f).Length / 1KB)) KB" } else { "OK" }
        Write-Host "  [OK] $rel ($size)" -ForegroundColor Green
    } else {
        $rel = $f.Replace($OutputDir + "\", "")
        Write-Host "  [MISSING] $rel" -ForegroundColor Red
        $allOk = $false
    }
}

if ($allOk) {
    Write-Host ""
    Write-Host "libsodium is ready for Android NDK builds." -ForegroundColor Green
    Write-Host "The Android CMakeLists.txt will auto-detect it at:"
    Write-Host "  $OutputDir"
    Write-Host ""
    Write-Host "Cleaning up build intermediates..."
    # Keep source for debugging, remove build dirs
    Get-ChildItem $BuildBaseDir -Directory | Where-Object { $_.Name -match "cmake-" } | ForEach-Object {
        Remove-Item -Recurse -Force $_.FullName -ErrorAction SilentlyContinue
    }
} else {
    Write-Error "Some files are missing. Check the build output above."
    exit 1
}
