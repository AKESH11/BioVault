# Bio-Vault Protocol 🔐

## Decentralized Proof of Reality Infrastructure

A revolutionary system that binds human biological signals and hardware fingerprints to digital media, preventing non-consensual recordings and enabling deepfake detection.

---

## 🏗️ Project Structure

```
BioVault/
├── mobile-app/          # React Native + C++ biometric engine
│   ├── cpp/            # C++ core (rPPG, PRNU fingerprinting)
│   ├── android/        # Android native modules
│   ├── ios/            # iOS native modules
│   └── src/            # React Native UI
├── smart-contracts/     # Solidity contracts for Polygon
├── zkp-circuits/        # Circom circuits for ZK proofs
├── backend/            # Node.js API server
└── shared/             # Common utilities & types
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 18.0.0
- **CMake** >= 3.20
- **OpenCV** >= 4.5
- **Android Studio** (for Android builds)
- **Xcode** (for iOS builds, macOS only)
- **Metamask** or Web3 wallet

### Installation

```bash
# Clone the repository
git clone <your-repo-url>
cd BioVault

# Install all dependencies
npm run install:all

# Build C++ core
npm run build:cpp

# Build smart contracts
npm run build:contracts
```

### Running the Application

```bash
# Start backend server
npm run dev:backend

# Run on Android
npm run mobile:android

# Run on iOS (macOS only)
npm run mobile:ios
```

---

## 🧬 Core Features

1. **Physiological Binding**: rPPG extracts heart rate as cryptographic salt
2. **Consensual Handshake**: P2P BLE protocol for multi-party consent
3. **Hardware Fingerprinting**: PRNU sensor noise identification
4. **Zero-Knowledge Proofs**: Verify authenticity without revealing content
5. **Blockchain Anchoring**: Immutable proof on Polygon

---

## 📋 Development Workflow

### Testing Smart Contracts
```bash
cd smart-contracts
npx hardhat test
```

### Deploying to Polygon Mumbai
```bash
npm run deploy:testnet
```

### Building ZK Circuits
```bash
npm run build:zkp
```

---

## 🔧 Technology Stack

- **Mobile**: React Native, C++, OpenCV, MediaPipe
- **Blockchain**: Solidity, Hardhat, Polygon, IPFS
- **Cryptography**: Ed25519, SHA-256, BLAKE3, zk-SNARKs
- **Backend**: Node.js, Express, ethers.js

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🤝 Contributing

Contributions welcome! Please read CONTRIBUTING.md first.
