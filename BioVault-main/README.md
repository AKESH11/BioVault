# BioVault Protocol

**Blockchain-based media authentication with biometric proof-of-reality.**

BioVault proves that digital media was captured by a real person, on a real device, at a specific time — anchored permanently to the Polygon blockchain.

[![Tests](https://img.shields.io/badge/tests-171%20passing-brightgreen)]()
[![Platform](https://img.shields.io/badge/platform-Android-green)]()
[![Blockchain](https://img.shields.io/badge/blockchain-Polygon%20Amoy-purple)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()

---

## Core Innovation: The Anti-Deepfake Triad

1. **Physiological Binding**: rPPG extracts live pulse from camera feed — proves a living person was present
2. **Hardware Fingerprinting**: PRNU (Photo-Response Non-Uniformity) links media to specific device sensor
3. **Consensual Handshake**: BLE protocol requires all subjects to consent via biometric signature
4. **Zero-Knowledge Exoneration**: zk-SNARKs prove authenticity without revealing private media

---

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Mobile App    │───>│   Backend API    │───>│   Blockchain    │
│                 │    │                  │    │                 │
│ Camera capture  │    │ JWT Auth         │    │ MediaAnchor     │
│ rPPG heartbeat  │    │ IPFS upload      │    │ AuthToken NFT   │
│ PRNU fingerpt   │    │ ZKP generation   │    │ ZKP Verifier    │
│ BLE consent     │    │ Anchor to chain  │    │ Dispute system  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Core Logic** | C++17, OpenCV, libsodium |
| **Cryptography** | libsodium (Ed25519, SHA-256), BLAKE3 |
| **Zero-Knowledge** | Circom 2.2.3, SnarkJS, Groth16 |
| **Blockchain** | Solidity 0.8.20, Hardhat, Polygon Amoy |
| **Storage** | IPFS (Kubo 0.34.1) + Pinata redundancy |
| **Mobile** | React Native 0.73.2, Android NDK r25 |
| **Backend** | Express.js, ethers v6, SQLite, Winston |
| **P2P** | Bluetooth Low Energy (BLE) |

---

## Project Structure

```
BioVault-main/
├── mobile-app/                 # React Native + C++ Android app
│   ├── cpp/                    # C++17 native engine
│   │   ├── src/
│   │   │   ├── rppg_engine.cpp         # FFT-based heart rate extraction
│   │   │   ├── prnu_extractor.cpp      # Camera sensor fingerprinting
│   │   │   ├── crypto_utils.cpp        # libsodium crypto (Ed25519, SHA-256)
│   │   │   ├── consensus_handshake.cpp # BLE multi-party consent
│   │   │   ├── proof_of_reality.cpp    # Combined proof generation
│   │   │   ├── bio_vault_native.cpp    # JNI bridge
│   │   │   └── BioVaultExtractor.cpp   # OpenCV feature extraction
│   │   ├── include/                    # Headers
│   │   ├── test/                       # C++ unit tests (Google Test)
│   │   └── CMakeLists.txt
│   ├── src/
│   │   ├── screens/
│   │   │   ├── LoginScreen.js          # JWT authentication
│   │   │   ├── HomeScreen.js           # Dashboard + system status
│   │   │   ├── CameraScreen.js         # Capture + rPPG + consent
│   │   │   ├── ResultsScreen.js        # IPFS upload + blockchain anchor
│   │   │   ├── VerifyScreen.js         # Media verification + ZKP
│   │   │   └── MediaLibraryScreen.js   # Anchored media browser
│   │   └── services/
│   │       ├── ApiService.js           # Backend communication
│   │       └── AnchorQueue.js          # Offline anchor retry queue
│   └── android/                        # Android native (Kotlin + Java)
│       └── app/src/main/java/com/biovault/
│           ├── BioVaultModule.java      # JNI bridge to C++
│           └── ConsentBroadcaster.kt   # BLE consent broadcasting
│
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── index.js                    # HTTP/HTTPS + WebSocket server
│   │   ├── routes/
│   │   │   ├── auth.js                 # JWT register/login/refresh
│   │   │   ├── web3.js                 # Blockchain anchoring + tokens
│   │   │   ├── media.js                # Media processing
│   │   │   ├── ipfs.js                 # IPFS upload/retrieve + Pinata
│   │   │   └── zkp.js                  # Groth16 proof gen/verify
│   │   ├── middleware/
│   │   │   ├── auth.js                 # JWT + API key middleware
│   │   │   ├── validation.js           # Joi validation schemas
│   │   │   └── txQueue.js              # Blockchain nonce management
│   │   ├── models/
│   │   │   └── userStore.js            # SQLite user + anchor storage
│   │   └── utils/
│   │       ├── wallet.js               # Ethers.js wallet management
│   │       ├── keyProvider.js          # KMS abstraction
│   │       ├── pinata.js               # IPFS pinning redundancy
│   │       ├── sentry.js               # Error tracking
│   │       └── logger.js               # Winston log rotation
│   └── test/
│       ├── e2e.test.js                 # 129 E2E integration tests
│       └── load.test.js                # Load/stress testing
│
├── smart-contracts/            # Solidity + Hardhat
│   ├── contracts/
│   │   ├── MediaAnchor.sol             # Hash anchoring + disputes
│   │   ├── AuthenticityToken.sol       # ERC-721 soulbound NFTs
│   │   └── Groth16Verifier.sol         # On-chain ZKP verification
│   ├── test/                           # 42 contract tests
│   └── scripts/
│       ├── deploy.js                   # Local/testnet deploy
│       └── deploy_remaining_amoy.js    # Amoy-specific deploy
│
├── zkp-circuits/               # Zero-Knowledge Proofs
│   ├── circuits/
│   │   ├── verify.circom               # Media verification circuit
│   │   └── bio_match.circom            # Biometric matching circuit
│   └── scripts/
│       ├── generate_proof.js           # Groth16 proof generation
│       └── verify_proof.js             # Proof verification
│
├── shared/                     # Shared constants + ABIs
├── docs/                       # Documentation
│   ├── PRIVACY_POLICY.md              # GDPR/BIPA compliance
│   ├── API.md                         # Full API documentation
│   └── play-store/                    # Play Store metadata
├── scripts/                    # Build & utility scripts
├── docker-compose.yml          # Dev: Backend + IPFS + Hardhat
├── docker-compose.prod.yml     # Prod: nginx + certbot + resource limits
└── nginx/nginx.conf            # Reverse proxy + TLS + rate limiting
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- Java 17 (Eclipse Adoptium)
- Android SDK (compileSdk 36) + NDK r25+
- IPFS Kubo daemon
- CMake 3.20+

### 1. Clone & Install
```bash
git clone https://github.com/YOUR_USERNAME/BioVault.git
cd BioVault/BioVault-main

cd backend && npm install
cd ../smart-contracts && npm install
cd ../mobile-app && npm install
```

### 2. Start Local Services
```bash
# Terminal 1: Hardhat local blockchain
cd smart-contracts && npx hardhat node

# Terminal 2: Deploy contracts
cd smart-contracts && npx hardhat run scripts/deploy.js --network localhost

# Terminal 3: IPFS daemon
ipfs daemon

# Terminal 4: Backend server
cd backend && cp .env.example .env && node src/index.js
```

### 3. Build & Run Android App
```bash
cd mobile-app

# Build JS bundle
npx react-native bundle --platform android --dev false \
  --entry-file index.js \
  --bundle-output android/app/src/main/assets/index.android.bundle \
  --assets-dest android/app/src/main/res --reset-cache

# Build release APK
cd android && ./gradlew assembleRelease

# Install on device (USB connected)
adb install -r app/build/outputs/apk/release/app-release.apk
adb reverse tcp:3000 tcp:3000
```

---

## Testing

```bash
# Smart contract tests (42 tests)
cd smart-contracts && npx hardhat test

# E2E integration tests (129 tests) — requires Hardhat + IPFS + Backend running
cd backend && node test/e2e.test.js

# Load test (50 concurrent connections, 30s)
cd backend && node test/load.test.js --connections=50 --duration=30

# Total automated: 171 tests, all passing
```

---

## Deployed Contracts (Polygon Amoy Testnet)

| Contract | Address |
|----------|---------|
| **MediaAnchor** | `0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe` |
| **AuthenticityToken** | `0xCA4dBF288dBF06e5537efc43352f092088b65475` |
| **Groth16Verifier** | `0x31f8e9b3B31992c7C50B1eE38D4D6c88C247d4BE` |

---

## Security

| Layer | Protection |
|-------|-----------|
| **Transport** | TLS 1.3, HTTPS in production |
| **Auth** | JWT + API key, bcrypt passwords, token refresh |
| **Contracts** | Pausable, ReentrancyGuard, string length limits, owner-only |
| **Crypto** | libsodium (Ed25519, X25519, SHA-256), release blocks mock crypto |
| **Biometric** | On-device C++ processing only, raw signals never leave device |
| **Keys** | KMS abstraction (env / encrypted file / AWS KMS) |
| **Privacy** | Zero-knowledge proofs, GDPR/BIPA compliant |
| **Infra** | Non-root Docker, nginx rate limiting, Sentry error tracking |

---

## Documentation

- [API Documentation](docs/API.md) — Full REST API reference
- [Privacy Policy](docs/PRIVACY_POLICY.md) — GDPR/BIPA/CCPA compliance
- [Architecture](ARCHITECTURE.md) — System design
- [Quick Start](QUICKSTART.md) — Getting started guide
- [Setup Guide](SETUP_GUIDE.md) — Detailed setup instructions

---

## Roadmap

- [x] Core C++ rPPG + PRNU implementation
- [x] Zero-knowledge circuit design (Circom 2.2.3)
- [x] Smart contract suite (MediaAnchor, AuthToken, Verifier)
- [x] JWT + API key authentication
- [x] IPFS upload + Pinata redundancy
- [x] BLE multi-party consent protocol
- [x] Offline anchor queue with retry
- [x] 171 automated tests (42 contract + 129 E2E)
- [x] Polygon Amoy testnet deployment
- [x] Release APK signed + device-tested
- [x] Production Docker + nginx + CI
- [x] GDPR/BIPA privacy compliance
- [ ] Formal contract security audit
- [ ] VPS + domain + TLS deployment
- [ ] Google Play Store submission
- [ ] iOS Secure Enclave support
- [ ] Polygon mainnet deployment

---

## License

MIT License — See LICENSE file for details.

---

## Disclaimer

This is experimental technology. The smart contracts have not undergone a formal security audit. Use at your own risk in production environments.
