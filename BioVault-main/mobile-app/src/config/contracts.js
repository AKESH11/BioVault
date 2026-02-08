/**
 * BioVault Smart Contract Configuration
 * 
 * ⚠️ UPDATE THESE ADDRESSES AFTER DEPLOYMENT!
 * 
 * Deploy contracts:
 *   cd smart-contracts
 *   npx hardhat run scripts/deployWithVerifier.js --network amoy
 * 
 * Then copy the addresses below.
 */

export const CONTRACTS = {
  // Contract addresses (✅ MediaAnchor deployed!)
  MEDIA_ANCHOR: '0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe',
  VERIFIER: '0x0000000000000000000000000000000000000000', // Deploy after getting more POL
  AUTHENTICITY_TOKEN: '0x0000000000000000000000000000000000000000', // Deploy after getting more POL
  
  // Network configuration
  NETWORK: {
    name: 'Polygon Amoy Testnet',
    chainId: 80002,
    rpcUrl: 'https://polygon-amoy.infura.io/v3/8f65c54597484051af7c073196f7bb8d',
    blockExplorer: 'https://amoy.polygonscan.com',
    symbol: 'POL',
    
    // Faucets for test tokens
    faucets: [
      'https://faucet.polygon.technology/',
      'https://faucet.quicknode.com/polygon/amoy'
    ]
  }
};

// Wallet address for testing
export const TEST_WALLET = '0xa160d83cb71Bb583Ec6e9375a43F520691f3bB12';

// ABI fragments for common operations
export const MEDIA_ANCHOR_ABI = [
  "function anchorHash(bytes32 contentHash, bytes32 bioSignature, bytes32 hardwareDNA, uint8 status) external returns (uint256)",
  "function verifyAnchor(uint256 anchorId) external view returns (bool)",
  "function getAnchor(uint256 anchorId) external view returns (tuple(bytes32 contentHash, bytes32 bioSignature, bytes32 hardwareDNA, address creator, uint256 timestamp, uint8 status, bool hasConsent))",
  "event MediaAnchored(uint256 indexed anchorId, address indexed creator, bytes32 contentHash, uint256 timestamp)"
];

export const VERIFIER_ABI = [
  "function verifyProof(uint256[2] memory a, uint256[2][2] memory b, uint256[2] memory c, uint256[1] memory input) external view returns (bool)",
  "function verifyBioVaultProof(uint256[8] memory proof, uint256[1] memory publicSignals) external view returns (bool)"
];

export const TOKEN_ABI = [
  "function mint(address to, uint256 anchorId, string memory metadataURI) external returns (uint256)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function balanceOf(address owner) external view returns (uint256)"
];
