# Release Notes

## v1.0.0 — Initial Release (February 2026)

### Core Features
- Biometric media authentication (rPPG heartbeat + PRNU camera fingerprint)
- Blockchain anchoring on Polygon network
- IPFS decentralized media storage with Pinata redundancy
- Zero-knowledge proof generation (Groth16)
- ERC-721 Authenticity Token minting (soulbound NFTs)
- Multi-party BLE consent broadcasting

### Security
- On-device biometric processing (raw data never leaves phone)
- JWT authentication with secure token refresh
- End-to-end encryption (TLS 1.3)
- Libsodium cryptography (Ed25519, SHA-256)
- Release builds block mock crypto

### App Features
- 6-screen navigation (Login, Home, Camera, Results, Verify, Media Library)
- Offline anchor queue with automatic retry
- Real-time rPPG visualization with face detection
- Media library with on-chain status tracking
- Backend health monitoring on home screen

### Technical
- React Native 0.73.2
- C++17 native engine with JNI bridge
- 3 smart contracts deployed to Polygon Amoy testnet
- 171 automated tests (42 contract + 129 E2E)
- Docker production deployment with nginx + certbot
