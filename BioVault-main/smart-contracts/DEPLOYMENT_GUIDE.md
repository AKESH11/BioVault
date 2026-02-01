# Smart Contracts Deployment Guide

## Prerequisites

1. **Node.js dependencies installed**
   ```bash
   cd smart-contracts
   npm install
   ```

2. **Environment variables configured**
   - Copy `.env.example` to `.env`
   - Fill in required values (see below)

## Environment Setup

Create a `.env` file in `smart-contracts/` directory:

```env
# Deployer Private Key (NEVER commit this!)
PRIVATE_KEY=your_private_key_here

# Polygon RPC URLs
POLYGON_RPC_URL=https://polygon-mumbai.g.alchemy.com/v2/YOUR_API_KEY
POLYGON_MAINNET_RPC_URL=https://polygon-rpc.com

# PolygonScan API Key (for contract verification)
POLYGONSCAN_API_KEY=your_polygonscan_api_key

# Optional: Alchemy/Infura keys
ALCHEMY_API_KEY=your_alchemy_key
INFURA_API_KEY=your_infura_key
```

### Getting Required Keys

#### 1. Private Key
- **MetaMask**: Settings → Security & Privacy → Reveal Private Key
- ⚠️ **NEVER share or commit this key!**
- ⚠️ **Use a test wallet for testnet deployments**

#### 2. Polygon RPC URL (Alchemy)
- Go to [Alchemy.com](https://alchemy.com)
- Create account → New App → Select "Polygon Mumbai" or "Polygon Mainnet"
- Copy HTTPS URL

#### 3. PolygonScan API Key
- Go to [PolygonScan](https://polygonscan.com/register)
- Register account → API Keys → Create New Key
- Copy API key

#### 4. Get Testnet MATIC
For Polygon Mumbai testnet:
- [Polygon Faucet](https://faucet.polygon.technology/)
- [Alchemy Faucet](https://mumbaifaucet.com/)
- Need 0.1-0.5 MATIC for deployment

## Deployment Commands

### 1. Compile Contracts
```bash
npm run compile
```

### 2. Run Tests
```bash
npm run test
```

### 3. Deploy to Mumbai Testnet
```bash
npm run deploy:mumbai
```

### 4. Verify on PolygonScan
```bash
# After deployment, verify contracts
npx hardhat verify --network mumbai <CONTRACT_ADDRESS>
```

### 5. Deploy to Polygon Mainnet (⚠️ Real Money!)
```bash
npm run deploy:polygon
```

## Post-Deployment

After successful deployment:

1. **Note the contract addresses** from console output
2. **Update `shared/constants.js`** with new addresses:
   ```javascript
   CONTRACTS: {
     MediaAnchor: '0x...', // New address from deployment
     AuthenticityToken: '0x...', // New address from deployment
   }
   ```

3. **Verify contracts on PolygonScan** for transparency

4. **Test integration** with backend API:
   ```bash
   cd ../backend
   npm start
   # Test anchoring endpoint
   curl -X POST http://localhost:3000/api/web3/anchor -H "Content-Type: application/json" -d '{
     "mediaHash": "0x1234...",
     "bioSignature": "0x5678...",
     "hardwareID": "device123",
     "consensusParties": [],
     "ipfsHash": "Qm...",
     "privateKey": "YOUR_TEST_PRIVATE_KEY"
   }'
   ```

## Troubleshooting

### Error: "insufficient funds"
- Get more test MATIC from faucet
- Check wallet balance: `npx hardhat balance --network mumbai <YOUR_ADDRESS>`

### Error: "nonce too high"
- Reset account in MetaMask: Settings → Advanced → Reset Account

### Error: "invalid API key"
- Verify POLYGONSCAN_API_KEY is correct
- Wait 5-10 minutes after creating key for activation

### Deployment Gas Costs (Estimated)
- **Mumbai Testnet**: Free (use faucet MATIC)
- **Polygon Mainnet**: ~0.1-0.5 MATIC (~$0.10-$0.50 USD)

## Security Checklist

Before mainnet deployment:

- [ ] Contracts audited by security firm
- [ ] All tests passing (100% coverage)
- [ ] Private keys stored in secure vault (not .env file)
- [ ] Emergency pause mechanism tested
- [ ] Upgrade path defined (if using proxy pattern)
- [ ] Multi-sig wallet setup for contract ownership
- [ ] Bug bounty program announced
