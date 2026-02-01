# Cryptography Libraries Setup Guide

To enable production-grade cryptography in the C++ core, you need to install and link the following libraries:

## Required Libraries

### 1. OpenSSL (for SHA-256)

#### Windows
Download pre-built binaries from:
```
https://slproweb.com/products/Win32OpenSSL.html
```
- Download "Win64 OpenSSL v3.x.x" (full version, not Light)
- Install to `C:\Program Files\OpenSSL-Win64\`
- Set environment variable: `OPENSSL_ROOT_DIR=C:\Program Files\OpenSSL-Win64`

#### macOS
```bash
brew install openssl@3
```

#### Linux
```bash
sudo apt-get install libssl-dev
```

### 2. libsodium (for Ed25519 signatures)

#### Windows
Download pre-built binaries:
```
https://download.libsodium.org/libsodium/releases/
```
- Download `libsodium-x.y.z-stable-msvc.zip`
- Extract to `C:\libsodium\`
- Set environment variable: `LIBSODIUM_ROOT_DIR=C:\libsodium`

#### macOS
```bash
brew install libsodium
```

#### Linux
```bash
sudo apt-get install libsodium-dev
```

### 3. BLAKE3 (for fast cryptographic hashing)

#### All Platforms - Build from Source
```bash
git clone https://github.com/BLAKE3-team/BLAKE3.git
cd BLAKE3/c
cmake -B build
cmake --build build
cmake --install build --prefix /usr/local  # or your preferred location
```

## CMake Configuration

After installing the libraries, update your CMake build:

### Set Environment Variables (Windows PowerShell)
```powershell
$env:OPENSSL_ROOT_DIR = "C:\Program Files\OpenSSL-Win64"
$env:LIBSODIUM_ROOT_DIR = "C:\libsodium"
$env:BLAKE3_ROOT_DIR = "C:\blake3"
```

### Build with CMake
```bash
cd mobile-app/cpp
mkdir build
cd build
cmake ..
cmake --build .
```

## Verification

After successful build, the following symbols should be available:
- `SHA256()` from OpenSSL
- `crypto_sign_detached()` and `crypto_sign_verify_detached()` from libsodium
- `blake3_hasher_init()` from BLAKE3

## Alternative: Use Without Native Libraries (Development Only)

For development/testing without installing native libraries, the code will fall back to mock implementations with a warning. **DO NOT use mock crypto in production!**

## Security Notes

⚠️ **CRITICAL**: Mock implementations are NOT secure and should NEVER be used in production.
- Mock SHA-256 uses a simple hash algorithm
- Mock Ed25519 uses XOR operations
- Mock verification always returns true

Real implementations provide:
- SHA-256: Collision-resistant cryptographic hash (NIST standard)
- Ed25519: Public-key signature system (IETF RFC 8032)
- BLAKE3: High-performance cryptographic hash (faster than SHA-256)
