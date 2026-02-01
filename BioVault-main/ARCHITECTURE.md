# 🏛️ Bio-Vault Protocol - Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MOBILE APPLICATION                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  React Native UI Layer                        │  │
│  │  • Camera Interface  • Consent UI  • Blockchain Explorer     │  │
│  └────────────────────┬─────────────────────────────────────────┘  │
│                       │                                              │
│  ┌────────────────────▼─────────────────────────────────────────┐  │
│  │              Native Bridge (JNI/Turbo Modules)               │  │
│  └────────────────────┬─────────────────────────────────────────┘  │
│                       │                                              │
│  ┌────────────────────▼─────────────────────────────────────────┐  │
│  │                    C++ BIOMETRIC ENGINE                      │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │  │
│  │  │ rPPG Engine  │  │PRNU Extractor│  │ Crypto Utilities │  │  │
│  │  │ (Heart Rate) │  │  (Hardware   │  │  (Hashing, Ed25519)│ │  │
│  │  │   OpenCV +   │  │ Fingerprint) │  │                  │  │  │
│  │  │  MediaPipe   │  └──────────────┘  └──────────────────┘  │  │
│  │  └──────────────┘                                           │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              P2P CONSENSUS LAYER (BLE/NFC)                   │  │
│  │  • Device Discovery  • Handshake Protocol  • Multi-Sig      │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   │ HTTPS/WebSocket
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          BACKEND API SERVER                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                      Express.js REST API                      │  │
│  │  /api/web3 │ /api/ipfs │ /api/media │ /api/zkp              │  │
│  └──────┬────────────┬────────────┬────────────┬─────────────────┘  │
│         │            │            │            │                     │
│    ┌────▼────┐  ┌────▼─────┐ ┌───▼──────┐ ┌───▼──────────┐         │
│    │  Web3   │  │   IPFS   │ │  Media   │ │     ZKP      │         │
│    │ Bridge  │  │  Client  │ │Processor │ │  Generator   │         │
│    └────┬────┘  └────┬─────┘ └──────────┘ └──────────────┘         │
└─────────┼────────────┼──────────────────────────────────────────────┘
          │            │
          │            │
┌─────────▼────────┐   │   ┌──────────────────────────────────────────┐
│   POLYGON L2     │   │   │          IPFS/FILECOIN                   │
│   BLOCKCHAIN     │   │   │        (Decentralized Storage)           │
│                  │   │   │                                          │
│ ┌──────────────┐ │   │   │  ┌──────────────┐  ┌─────────────────┐ │
│ │ MediaAnchor  │ │   └───┼─▶│ Encrypted    │  │   Metadata      │ │
│ │  Contract    │ │       │  │ Media Files  │  │     (JSON)      │ │
│ │              │ │       │  └──────────────┘  └─────────────────┘ │
│ │ • Anchor     │ │       │                                          │
│ │ • Verify     │ │       └──────────────────────────────────────────┘
│ │ • Dispute    │ │
│ │ • Revoke     │ │
│ └──────────────┘ │
│                  │
│ ┌──────────────┐ │
│ │Authenticity  │ │
│ │   Token      │ │
│ │ (Soulbound   │ │
│ │    NFT)      │ │
│ └──────────────┘ │
└──────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    ZERO-KNOWLEDGE PROOF SYSTEM                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Circom Circuits                           │  │
│  │  ┌────────────────────┐    ┌──────────────────────────┐     │  │
│  │  │ verify.circom      │    │  bio_match.circom        │     │  │
│  │  │ (Media Verification)    │  (Biometric Range Check) │     │  │
│  │  └────────────────────┘    └──────────────────────────┘     │  │
│  │                                                               │  │
│  │  ┌────────────────────────────────────────────────────────┐ │  │
│  │  │        SnarkJS (Proof Generation & Verification)        │ │  │
│  │  └────────────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 **User Flow: Recording with Consent**

```
1. USER A opens Bio-Vault app
          │
          ▼
2. Starts camera recording
          │
          ├─→ C++ rPPG Engine extracts User A's heart rate (72 BPM)
          └─→ BLE starts scanning for nearby devices
          │
          ▼
3. USER B (subject) detected in frame
          │
          ├─→ App sends BLE handshake request to User B
          └─→ User A's pulse continues recording
          │
          ▼
4. USER B receives consent request on their device
          │
          ├─→ Shows User A's identity
          ├─→ Shows recording duration
          └─→ Requests biometric confirmation (Face ID/Fingerprint)
          │
          ▼
5. USER B confirms consent
          │
          ├─→ B's device extracts B's heart rate (68 BPM)
          ├─→ B's device signs consent with Ed25519 private key
          └─→ Sends signature back to User A via BLE
          │
          ▼
6. COMPOSITE HASH generated
          │
          ├─→ Hash(VideoFrame + BPM_A:72 + BPM_B:68 + Sig_A + Sig_B + Hardware_ID + Timestamp)
          └─→ Result: "0xabc123def456..."
          │
          ▼
7. VIDEO encrypted and uploaded to IPFS
          │
          └─→ IPFS returns CID: "QmXyz789..."
          │
          ▼
8. BLOCKCHAIN ANCHORING
          │
          ├─→ Smart contract MediaAnchor.anchorMedia() called
          ├─→ Stores: Hash, Bio-signatures, Hardware ID, IPFS CID, Consensus parties
          └─→ Transaction confirmed on Polygon
          │
          ▼
9. AUTHENTICITY TOKEN minted (optional)
          │
          └─→ Soulbound NFT issued to User A
          │
          ▼
10. ✅ VIDEO IS NOW VERIFIABLE
     • Can prove origin without showing content (ZKP)
     • Any copy without this hash = "Unauthorized"
     • Immutable record of consent
```

---

## 🛡️ **Security Architecture**

### **1. Physiological Binding**
```
Video Frame → rPPG Algorithm → Extract Heart Rate → Dynamic Salt
                                      ↓
                            Impossible to forge without
                            actual person's live biometric data
```

### **2. Hardware Fingerprinting**
```
Camera Sensor → 50+ Calibration Frames → PRNU Pattern Extraction
                                              ↓
                                    Unique device "DNA"
                                    (Cannot be spoofed)
```

### **3. Cryptographic Chain**
```
Raw Media + BPM + Hardware ID + Timestamp
           ↓
       BLAKE3 Hash (Fast, Secure)
           ↓
    Ed25519 Signatures (Each party)
           ↓
   Multi-Signature Composite Hash
           ↓
    Polygon Smart Contract (Immutable)
```

### **4. Zero-Knowledge Exoneration**
```
Victim has private video
Deepfake circulating online
           ↓
Generate ZK Proof: "My biometric signature ≠ Video's claimed signature"
           ↓
Submit proof to smart contract
           ↓
Contract verifies WITHOUT seeing private video
           ↓
Public verdict: "Video is fake"
```

---

## 📊 **Data Flow**

### **On-Device (Mobile)**
```
Camera Feed (30 FPS)
    ↓
MediaPipe Face Detection
    ↓
ROI (Region of Interest) extracted
    ↓
rPPG Algorithm (FFT on Green Channel)
    ↓
Heart Rate (BPM) calculated
    ↓
Liveness Check (temporal variation)
    ↓
PRNU Fingerprint (from hardware)
    ↓
Composite Hash Generation
```

### **Network Layer**
```
Mobile App → HTTPS → Backend API
                        ↓
            Web3 Provider (Alchemy)
                        ↓
            Polygon Smart Contract
                        ↓
            Event Emitted: MediaAnchored
```

### **Storage Layer**
```
Encrypted Video → IPFS Upload → Pin to Network
                                     ↓
                            Returns CID (Content ID)
                                     ↓
                     CID stored in smart contract
                                     ↓
                        Video retrievable by CID
                        (but encrypted, only owner has key)
```

---

## 🧩 **Component Dependencies**

```
mobile-app
├── Depends on: shared (constants, crypto utilities)
├── Links to: OpenCV, MediaPipe
└── Calls: backend API

backend
├── Depends on: shared (types, utilities)
├── Connects to: Polygon RPC (ethers.js)
├── Connects to: IPFS (ipfs-http-client)
└── Calls: zkp-circuits (snarkjs)

smart-contracts
├── Depends on: @openzeppelin/contracts
└── Deploys to: Polygon (via Hardhat)

zkp-circuits
├── Depends on: circomlib, snarkjs
└── Exports: Verifier.sol (to smart-contracts)

shared
└── Pure utilities (no dependencies on other modules)
```

---

## 🔐 **Trust Model**

1. **User trusts:**
   - Their own device (hardware enclave)
   - Polygon blockchain (decentralized)
   - IPFS (distributed storage)

2. **User does NOT need to trust:**
   - The app developer (code is open-source)
   - Centralized servers (backend is optional, can run locally)
   - Other users (cryptographic signatures prevent forgery)

3. **Verification is:**
   - Mathematically provable (ZK proofs)
   - Publicly auditable (blockchain explorer)
   - Privacy-preserving (no raw biometric data stored)

---

## 🎯 **Attack Resistance**

| Attack Vector | Defense Mechanism |
|--------------|-------------------|
| **Deepfake AI** | Biometric mismatch detected via ZKP |
| **Photo Replay** | Liveness detection (temporal variation) |
| **Device Spoofing** | PRNU fingerprint (unique sensor noise) |
| **Non-consensual Recording** | BLE handshake required, blockchain audit |
| **Hash Collision** | BLAKE3 (cryptographically secure) |
| **Signature Forgery** | Ed25519 (elliptic curve crypto) |
| **Blockchain Manipulation** | Polygon PoS consensus (decentralized) |
| **IPFS Tampering** | Content-addressed (CID changes if data changes) |

---

## 🚀 **Performance Targets**

- **rPPG Heart Rate Extraction**: < 100ms per frame (30 FPS)
- **PRNU Fingerprint**: < 5 seconds (50 frames)
- **Blockchain Anchoring**: < 10 seconds (Polygon L2)
- **IPFS Upload**: < 30 seconds (100MB video)
- **ZK Proof Generation**: < 2 minutes (Groth16)
- **ZK Proof Verification**: < 1 second (on-chain)

---

## 📈 **Scalability**

### **Current MVP Architecture**
- Supports: 1-10 users per recording
- Throughput: 100 anchors/day
- Storage: IPFS (unlimited, pay-as-you-go)

### **Production Scaling Strategy**
1. **Batch Anchoring**: Combine multiple media hashes in a Merkle tree
2. **Layer 2**: Use Polygon for cheap, fast transactions
3. **CDN for IPFS**: Pin content to Pinata/Fleek for fast retrieval
4. **WebRTC for P2P**: Direct device-to-device handshake (no backend)
5. **Proof Aggregation**: Combine multiple ZK proofs into one

---

## 🛠️ **Development Priorities**

### **Phase 1: MVP** (Current Status)
- ✅ Core architecture
- ✅ C++ biometric engine
- ✅ Smart contracts
- ✅ Backend API
- ⚠️ Mobile UI (basic)
- ⚠️ BLE handshake (stubbed)

### **Phase 2: Alpha**
- ⬜ Full rPPG implementation
- ⬜ Working BLE consensus protocol
- ⬜ PRNU calibration flow
- ⬜ IPFS encryption
- ⬜ ZK proof integration

### **Phase 3: Beta**
- ⬜ iOS support
- ⬜ Mainnet deployment
- ⬜ Web dashboard
- ⬜ Browser extension
- ⬜ Public API

---

## 📝 **Code Quality Metrics**

- **C++ Test Coverage**: Target 80%+
- **Smart Contract Audit**: Required before mainnet
- **ZK Circuit Verification**: Formal verification recommended
- **API Security**: Rate limiting, input validation, authentication
- **Mobile Performance**: 60 FPS UI, < 5% battery drain

---

**Built with ❤️ for privacy, consent, and truth in the digital age.**
