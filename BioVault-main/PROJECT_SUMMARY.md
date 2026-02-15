# BioVault Protocol — Production Summary

## Current State (Production-Ready MVP)

### Architecture
- **Mobile**: React Native 0.73 → C++ via JNI → StrongBox/TEE hardware security
- **Backend**: Express + ethers.js v6 server-side wallet → Polygon Amoy (chainId 80002)
- **Storage**: Self-hosted Kubo IPFS → pinned media + metadata
- **Crypto**: libsodium-only (SHA-256, Ed25519, BLAKE3 via C++)
- **ZKP**: Circom 2.1.6 (bio_match + verify circuits with enforced constraints)

### Screens
| Screen | File | Status |
|--------|------|--------|
| Home | `HomeScreen.working.js` | Real StrongBox/backend status checks |
| Camera | `CameraScreen.native.js` | TS-CAN rPPG + proof-of-reality + RNFS save |
| Results | `ResultsScreen.working.js` | IPFS upload + blockchain anchor + AsyncStorage |
| Media Library | `MediaLibraryScreen.js` | On-chain verify + full provenance |
| Verify | `VerifyScreen.js` | Hash-based media verification |

### Smart Contracts (Polygon Amoy)
- **MediaAnchor**: 9-param `anchorMedia` (mediaHash, bioSig, hwID, consensus, ipfs, porHash, porIPFS, uniqueSignals, faces)
- **AuthenticityToken**: Soulbound NFT for verified creators
- **Verifier**: ZKP on-chain verification (deployment script ready)

### Native Module Methods (BioVaultModule.java)
- `generateProofOfReality(bpm)` → BLAKE3 hash + StrongBox sign
- `getHardwareFingerprint()` → Build.FINGERPRINT
- `getStrongBoxStatus()` → { isAvailable, level: StrongBox|TEE }
- `hasRealityKey()` → boolean
- `getBioSignature(bpm)` → SHA-256 → StrongBox signHash
- `startConsensusSession(id, faces, bpm)` → BLE advertise + scan
- `stopConsensusSession()` → cleanup

### JNI Consensus Pipeline
```
ConsentBroadcaster.kt
  → BioVaultModule.computeConsensusHashStatic()
    → initConsensusSession()        [JNI → C++]
    → appendConsensusSignature()×N  [JNI → C++]
    → finalizeConsensus()           [JNI → C++ BLAKE3 multi-sig hash]
```

### Backend Routes
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/web3/anchor` | POST | Server-side wallet anchor (9 params) |
| `/api/web3/verify/:hash` | GET | On-chain verification |
| `/api/web3/media/:hash` | GET | Full media record |
| `/api/web3/dispute` | POST | Dispute media |
| `/api/ipfs/upload` | POST | Base64 → Kubo IPFS add + pin |
| `/api/ipfs/get/:cid` | GET | IPFS gateway fetch |

### ZKP Circuits
- **bio_match.circom**: Poseidon commitment + range proof (enforced `isInRange === 1`)
- **verify.circom**: Media hash verification (enforced `isValid === 1`)
- **generate_bio_match_proof.js**: CLI proof generator with circomlibjs Poseidon

### Pre-Deployment Checklist
- [ ] Run `scripts/build_libsodium_android.sh` for NDK cross-compilation
- [ ] Set `backend/.env` from `.env.example` (DEPLOYER_PRIVATE_KEY, IPFS_API_URL)
- [ ] Deploy contracts: `npx hardhat run scripts/deploy.js --network amoy`
- [ ] Start Kubo IPFS daemon: `ipfs daemon`
- [ ] Start backend: `cd backend && npm run dev`
- [ ] Build mobile: `cd mobile-app && npm run android`
