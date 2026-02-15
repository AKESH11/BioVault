/**
 * BioVault Smart Contract Configuration
 * 
 * The mobile app does NOT interact with contracts directly.
 * All blockchain operations go through the backend server wallet.
 * These addresses are for display / block-explorer links only.
 * 
 * The canonical source of truth is the backend's /api/web3/contracts endpoint.
 */

// Network configuration
export const NETWORK = {
  name: 'Polygon Amoy Testnet',
  chainId: 80002,
  rpcUrl: 'https://rpc-amoy.polygon.technology',
  blockExplorer: 'https://amoy.polygonscan.com',
  symbol: 'POL',
  faucets: [
    'https://faucet.polygon.technology/',
    'https://faucet.quicknode.com/polygon/amoy',
  ],
};

// Contract addresses — updated after deployment.
// These are DISPLAY ONLY; the backend handles all contract calls.
export const CONTRACTS = {
  MEDIA_ANCHOR: '0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe',
  AUTHENTICITY_TOKEN: null,   // Set after deployment
  VERIFIER: null,             // Set after ZKP Verifier deployment
};

// Server wallet used for anchoring (not the user's wallet)
export const SERVER_WALLET = '0xa160d83cb71Bb583Ec6e9375a43F520691f3bB12';

/**
 * Get a block explorer URL for a transaction hash.
 */
export function txUrl(txHash) {
  return `${NETWORK.blockExplorer}/tx/${txHash}`;
}

/**
 * Get a block explorer URL for an address.
 */
export function addressUrl(address) {
  return `${NETWORK.blockExplorer}/address/${address}`;
}
