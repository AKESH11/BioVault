# Bio-Vault IPFS Upload & Token Minting

Upload authenticated media to IPFS and mint soulbound authenticity tokens on Polygon.

## Setup

### 1. Install Dependencies

```bash
cd smart-contracts
npm install
```

### 2. Configure Pinata IPFS

Get API keys from [Pinata.cloud](https://pinata.cloud):

```bash
# In smart-contracts/.env
PINATA_API_KEY=your_api_key_here
PINATA_SECRET_KEY=your_secret_key_here
```

### 3. Deploy Contracts

**Local Hardhat Network:**
```bash
npx hardhat node              # Terminal 1: Start local node
npm run deploy:local          # Terminal 2: Deploy contracts
```

**Mumbai Testnet:**
```bash
npm run deploy:mumbai
```

**Polygon Mainnet:**
```bash
npm run deploy:polygon
```

Deployment creates `deployments.json` with contract addresses.

## Usage

### Upload Media to IPFS & Mint Token

```bash
node scripts/uploadToIPFS.js <filePath> <recipientAddress> <bioSignature> <hardwareID>
```

**Example:**
```bash
node scripts/uploadToIPFS.js \
  video.mp4 \
  0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb \
  "HR:72|FFT:0.92|ED25519:3045022100a1b2c3..." \
  "PRNU:d4e5f6g7h8..."
```

**Parameters:**
- `filePath`: Path to media file (video, image, audio)
- `recipientAddress`: Ethereum address to receive soulbound token
- `bioSignature`: Biometric signature from rPPG + Ed25519 proof
- `hardwareID`: PRNU hardware fingerprint from device

### What Happens

1. **Compute Hash:** BLAKE3 hash of media + biometrics (currently keccak256 placeholder)
2. **Upload to IPFS:** File uploaded via Pinata, returns CID
3. **Mint Token:** ERC-721 soulbound token minted with all authenticity data
4. **Permanent Record:** Token stores mediaHash, bioSignature, hardwareID, timestamp, ipfsHash

### Verify Token

```bash
npx hardhat console --network mumbai
```

```javascript
const token = await ethers.getContractAt('AuthenticityToken', '<address>');
const anchor = await token.tokenAnchors(1);  // Token ID 1
console.log(anchor);
// {
//   mediaHash: '0xabc...',
//   bioSignature: 'HR:72|FFT:0.92|ED25519:...',
//   hardwareID: 'PRNU:...',
//   timestamp: 1234567890,
//   ipfsHash: 'QmXyz...'
// }
```

## Soulbound Tokens

**Non-Transferable:** Tokens cannot be transferred after minting (except burn).

```javascript
// This will FAIL:
await token.transferFrom(owner, receiver, tokenId);
// Error: "ERC721: Soulbound tokens cannot be transferred"
```

**Use Case:** Permanent proof of authenticity bound to original creator.

## Environment Variables

```bash
# .env file
PRIVATE_KEY=your_deployer_private_key
POLYGON_MUMBAI_RPC=https://rpc-mumbai.maticvigil.com
POLYGONSCAN_API_KEY=your_polygonscan_api_key
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key
AUTHENTICITY_TOKEN_ADDRESS=0x...  # Optional: override deployment address
```

## Scripts

- `deploy.js`: Deploy MediaAnchor + AuthenticityToken contracts
- `uploadToIPFS.js`: Upload media → IPFS → mint token

## Testing

```bash
npm test
```

## Contract Verification

```bash
npx hardhat verify --network mumbai <address>
```

## Architecture

```
Media File (video.mp4)
    ↓
Biometric Extraction (rPPG heart rate + PRNU fingerprint)
    ↓
IPFS Upload via Pinata → CID (QmXyz...)
    ↓
Smart Contract Mint → Soulbound ERC-721 Token
    ↓
Blockchain Record (Polygon PoS)
    - mediaHash: BLAKE3(file + biometrics)
    - bioSignature: "HR:72|ED25519:..."
    - hardwareID: "PRNU:abc..."
    - timestamp: block.timestamp
    - ipfsHash: "QmXyz..."
```

## IPFS Gateway

Access uploaded media:
```
https://gateway.pinata.cloud/ipfs/<CID>
```

## Security Notes

- **Private Keys:** Never commit `.env` file with private keys
- **Soulbound:** Tokens permanently bound to recipient address
- **IPFS Persistence:** Pinned on Pinata for persistence (consider backup pinning)
- **Gas Costs:** Minting on Polygon mainnet requires MATIC for gas

## Next Steps

1. Integrate with mobile app (React Native → JNI → C++ biometric extraction)
2. Implement real BLAKE3 hashing (replace keccak256 placeholder)
3. Add P2P consent verification before minting
4. Implement ZK-SNARK proofs for privacy-preserving verification
5. Build revocation/dispute mechanism via MediaAnchor contract
