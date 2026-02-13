/**
 * Shared constants for Bio-Vault Protocol
 */

module.exports = {
    // Biometric thresholds
    BPM: {
        MIN: 40,
        MAX: 220,
        NORMAL_MIN: 60,
        NORMAL_MAX: 100,
        CONFIDENCE_THRESHOLD: 0.8
    },

    // Hardware fingerprinting
    PRNU: {
        MIN_CALIBRATION_FRAMES: 50,
        CORRELATION_THRESHOLD: 0.7
    },

    // Blockchain
    NETWORKS: {
        HARDHAT: {
            chainId: 31337,
            name: 'Hardhat Local',
            rpc: 'http://127.0.0.1:8545'
        },
        AMOY: {
            chainId: 80002,
            name: 'Polygon Amoy Testnet',
            rpc: 'https://rpc-amoy.polygon.technology'
        },
        POLYGON: {
            chainId: 137,
            name: 'Polygon Mainnet',
            rpc: 'https://polygon-rpc.com'
        }
    },

    // Deployed contract addresses
    CONTRACTS: {
        MEDIA_ANCHOR: '0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe',
        AUTHENTICITY_TOKEN: null, // Deploy with: npx hardhat run scripts/deploy.js --network amoy
        VERIFIER: null            // Generated from ZKP circuit trusted setup
    },

    // Media processing
    MEDIA: {
        MAX_FILE_SIZE: 500 * 1024 * 1024, // 500MB
        SUPPORTED_VIDEO_FORMATS: ['mp4', 'mov', 'avi', 'webm'],
        SUPPORTED_IMAGE_FORMATS: ['jpg', 'jpeg', 'png', 'webp'],
        FRAME_RATE: 30,
        HASH_ALGORITHM: 'BLAKE3'
    },

    // P2P Consensus
    CONSENSUS: {
        BLE_DISCOVERY_TIMEOUT: 30000, // 30 seconds
        HANDSHAKE_TIMEOUT: 60000, // 60 seconds
        MAX_CONSENSUS_PARTIES: 10
    },

    // Zero-Knowledge Proofs
    ZKP: {
        CIRCUIT_TYPES: {
            MEDIA_VERIFICATION: 'verify',
            BIO_MATCH: 'bio_match'
        },
        PROOF_GENERATION_TIMEOUT: 120000 // 2 minutes
    },

    // API
    API: {
        VERSION: 'v1',
        RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
        RATE_LIMIT_MAX_REQUESTS: 100
    },

    // Status codes
    VERIFICATION_STATUS: {
        PENDING: 0,
        VERIFIED: 1,
        DISPUTED: 2,
        REVOKED: 3
    }
};
