# ZKP Circuits Installation Guide

## Prerequisites

The ZKP circuits require the **Circom 2.x compiler** (written in Rust), which must be installed separately.

### Installing Circom 2.x

#### Option 1: Download Pre-built Binary (Windows)

1. Download from the official releases:
   ```
   https://github.com/iden3/circom/releases
   ```

2. Download `circom-windows-amd64.exe` from the latest release

3. Rename it to `circom.exe` and add to your PATH, or place in this directory

#### Option 2: Build from Source (Requires Rust)

```bash
# Install Rust first (from https://rustup.rs)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Clone and build Circom
git clone https://github.com/iden3/circom.git
cd circom
cargo build --release
cargo install --path circom

# Verify installation
circom --version
```

#### Option 3: Use Cargo (If Rust is installed)

```bash
cargo install circom
```

## Verification

Once installed, verify Circom is available:

```bash
circom --version
```

You should see output like: `circom compiler 2.1.6`

## Next Steps

After installing Circom, run:

```bash
npm install
npm run compile:verify
npm run compile:bio
npm run setup
npm run contribute
npm run export-verifier
```

## Manual Installation (Quick Test)

For quick testing without full Circom installation, you can use the JavaScript witness calculator with pre-compiled R1CS files. However, **you must install Circom to compile the circuits initially**.
