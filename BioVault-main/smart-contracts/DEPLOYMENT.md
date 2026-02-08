# BioVault Smart Contract Deployment Guide

## Quick Start

### 1. Setup Environment

```powershell
cd D:\PROJECTS\BioVault\BioVault-main\smart-contracts

# Run setup script
.\setup.ps1
```

### 2. Configure Private Key

Edit `.env` file and add your MetaMask private key:

```bash
PRIVATE_KEY=0x...your_actual_private_key_here...
```

**⚠️ Get your private key:**
1. Open MetaMask extension
2. Click account icon → Account Details
3. Click "Show Private Key"
4. Enter password and copy

### 3. Get Test POL

Your wallet: `0xa160d83cb71Bb583Ec6e9375a43F520691f3bB12`

**Faucets:**
- https://faucet.polygon.technology/ (Official)
- https://faucet.quicknode.com/polygon/amoy
- https://faucet.chainstack.com/polygon-amoy-faucet

### 4. Check Balance

```powershell
npx hardhat run scripts/checkBalance.js --network amoy
```

### 5. Deploy Contracts

```powershell
npx hardhat run scripts/deployWithVerifier.js --network amoy
```

This will deploy:
- ✅ MediaAnchor (content hash anchoring)
- ✅ Verifier (ZK proof verification)
- ✅ AuthenticityToken (soulbound NFTs)

### 6. Save Contract Addresses

After deployment, copy the 3 contract addresses and update:

**File:** `mobile-app/src/config/contracts.js`

```javascript
export const CONTRACTS = {
  MEDIA_ANCHOR: '0x...address_from_deployment...',
  VERIFIER: '0x...address_from_deployment...',
  AUTHENTICITY_TOKEN: '0x...address_from_deployment...',
  // ...
};
```

## Verify Contracts on PolygonScan

```powershell
npx hardhat verify --network amoy <CONTRACT_ADDRESS>
```

## Run Tests

```powershell
# Run all tests
npx hardhat test

# Run specific test
npx hardhat test test/MediaAnchor.test.js

# With gas reporting
REPORT_GAS=true npx hardhat test
```

## Network Configuration

### Polygon Amoy Testnet
- **Chain ID:** 80002
- **RPC URL:** https://polygon-amoy.infura.io/v3/8f65c54597484051af7c073196f7bb8d
- **Explorer:** https://amoy.polygonscan.com
- **Symbol:** POL

### Add to MetaMask

```
Network Name: Polygon Amoy Testnet
RPC URL: https://polygon-amoy.infura.io/v3/8f65c54597484051af7c073196f7bb8d
Chain ID: 80002
Currency Symbol: POL
Block Explorer: https://amoy.polygonscan.com/
```

## Troubleshooting

### "Insufficient funds"
Get test POL from faucets above. Need minimum 0.1 POL.

### "Invalid private key"
Ensure private key in `.env` starts with `0x` and is 64 characters long (after 0x).

### "Network mismatch"
Make sure MetaMask is connected to Polygon Amoy (Chain ID: 80002).

### "Transaction underpriced"
Increase gas price in `hardhat.config.js`:
```javascript
gasPrice: 50000000000, // 50 Gwei
```

## Deployment Output Example

```
═══════════════════════════════════════════════
🚀 BioVault Protocol Deployment
═══════════════════════════════════════════════
Network: amoy

📍 Deploying with account: 0xa160d83cb71Bb583Ec6e9375a43F520691f3bB12
💰 Account balance: 0.5 POL

───────────────────────────────────────────────
📜 Deploying Contracts...
───────────────────────────────────────────────

1️⃣  Deploying MediaAnchor...
   ✅ MediaAnchor: 0x1234...

2️⃣  Deploying Verifier (ZK Proof)...
   ✅ Verifier: 0x5678...

3️⃣  Deploying AuthenticityToken...
   ✅ AuthenticityToken: 0x9abc...

═══════════════════════════════════════════════
✨ Deployment Complete!
═══════════════════════════════════════════════
```

## Next Steps After Deployment

1. ✅ Copy contract addresses to `mobile-app/src/config/contracts.js`
2. ✅ Verify contracts on PolygonScan
3. ✅ Update backend with contract addresses (if using)
4. ✅ Test contract interactions from mobile app
