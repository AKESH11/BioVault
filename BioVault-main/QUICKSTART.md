# 🚀 Bio-Vault Protocol - Quick Start Card

## ⚡ Installation (5 Commands)

```powershell
cd D:\PROJECTS\BioVault
npm install
npm run install:all
cd mobile-app\cpp && cmake -B build && cmake --build build --config Release
cd ..\..\smart-contracts && npm run compile
```

## 🎯 Run Everything

```powershell
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Blockchain (local testing)
cd smart-contracts && npm run node

# Terminal 3: Deploy Contracts
cd smart-contracts && npm run deploy:local

# Terminal 4: Mobile App
cd mobile-app && npm run android
```

## 📋 File Locations Cheat Sheet

| Component | Main File | Purpose |
|-----------|-----------|---------|
| **C++ Engine** | `mobile-app/cpp/src/rppg_engine.cpp` | Heart rate extraction |
| **JNI Bridge** | `mobile-app/android/.../BioVaultModule.java` | C++ ↔ React Native |
| **React Native App** | `mobile-app/App.js` | Mobile UI |
| **Smart Contract** | `smart-contracts/contracts/MediaAnchor.sol` | Blockchain anchoring |
| **Backend API** | `backend/src/index.js` | REST server |
| **ZK Circuit** | `zkp-circuits/circuits/verify.circom` | Zero-knowledge proofs |

## 🔧 Common Tasks

### Build C++ Core
```powershell
cd mobile-app\cpp
cmake -B build
cmake --build build --config Release
```

### Compile Smart Contracts
```powershell
cd smart-contracts
npm run compile
```

### Test Smart Contracts
```powershell
cd smart-contracts
npm test
```

### Deploy to Polygon Mumbai
```powershell
cd smart-contracts
npm run deploy:mumbai
```

### Generate ZK Proof
```powershell
cd zkp-circuits
npm run generate-proof
```

## 🐛 Troubleshooting Quick Fixes

| Problem | Solution |
|---------|----------|
| OpenCV not found | Set `OpenCV_DIR=C:\opencv\build` |
| Port 3000 in use | Change `PORT=3001` in `backend/.env` |
| npm install fails | Delete `node_modules`, run `npm install` again |
| C++ build fails | Install Visual Studio 2022 C++ tools |
| Contract deploy fails | Check `.env` has correct `PRIVATE_KEY` |

## 📞 Key APIs

### Backend Server
```
http://localhost:3000

GET  /health                     - Health check
POST /api/web3/anchor            - Anchor media to blockchain
GET  /api/web3/verify/:hash      - Verify media
POST /api/ipfs/upload            - Upload to IPFS
POST /api/zkp/generate           - Generate ZK proof
```

### React Native Module
```javascript
import { NativeModules } from 'react-native';
const { BioVaultModule } = NativeModules;

await BioVaultModule.init();
await BioVaultModule.processVideoFrame(frameData, width, height, faceBounds);
await BioVaultModule.calibrateDevice(frames);
await BioVaultModule.createAnchorHash(frameData, bpm, hardwareID);
```

### Smart Contract Functions
```solidity
anchorMedia(mediaHash, bioSignature, hardwareID, consensusParties, ipfsHash)
verifyMedia(mediaHash) returns (exists, isValid, timestamp)
disputeMedia(mediaHash, reason)
revokeMedia(mediaHash)
```

## 📚 Documentation Files

- `README.md` - Project overview
- `SETUP_GUIDE.md` - Detailed installation
- `ARCHITECTURE.md` - System design
- `zkp-circuits/README.md` - ZK proof setup

## 🎓 Learning Path

1. Read `README.md` (5 min)
2. Follow `SETUP_GUIDE.md` (30 min)
3. Study `ARCHITECTURE.md` (15 min)
4. Explore C++ code in `mobile-app/cpp/` (30 min)
5. Read smart contracts in `smart-contracts/contracts/` (20 min)
6. Test the system (1 hour)

## 💡 Key Concepts

- **rPPG**: Remote photoplethysmography - extracting heart rate from video
- **PRNU**: Photo-Response Non-Uniformity - camera sensor fingerprint
- **ZK-SNARK**: Zero-Knowledge Succinct Non-Interactive Argument of Knowledge
- **Soulbound NFT**: Non-transferable token proving authenticity
- **BLE Handshake**: Bluetooth Low Energy consensus protocol

## 🎯 Project Status

✅ **Complete** - All core components built
🔨 **In Progress** - Integration & testing
📋 **Todo** - Production hardening, iOS support

## 📬 Support

- Check `SETUP_GUIDE.md` for detailed troubleshooting
- Review `ARCHITECTURE.md` for system design questions
- See contract tests in `smart-contracts/test/` for examples

---

**Last Updated**: January 31, 2026
**Version**: 1.0.0 MVP
