const express = require('express');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

const router = express.Router();

// ============================================================================
// Contract ABIs — must match deployed Solidity signatures exactly
// ============================================================================
const MEDIA_ANCHOR_ABI = [
    "function anchorMedia(string mediaHash, string bioSignature, string hardwareID, address[] consensusParties, string ipfsHash, string proofOfRealityHash, string proofOfRealityIPFS, bool allUniqueSignals, uint8 detectedFaces) external",
    "function verifyMedia(string mediaHash) external view returns (bool exists, bool isValid, uint256 timestamp)",
    "function getMediaRecord(string mediaHash) external view returns (tuple(string mediaHash, string bioSignature, string hardwareID, uint256 timestamp, address creator, address[] consensusParties, bool isRevoked, string ipfsHash, uint8 status, string proofOfRealityHash, string proofOfRealityIPFS, bool allUniqueSignals, uint8 detectedFaces))",
    "function disputeMedia(string mediaHash, string reason) external",
    "function revokeMedia(string mediaHash) external",
    "event MediaAnchored(string indexed mediaHash, address indexed creator, uint256 timestamp, string hardwareID, bool allUniqueSignals, uint8 detectedFaces)"
];

const AUTHENTICITY_TOKEN_ABI = [
    "function mintToken(address to, string mediaHash, string bioSignature) external returns (uint256)",
    "function tokenURI(uint256 tokenId) external view returns (string)",
    "function ownerOf(uint256 tokenId) external view returns (address)",
    "function balanceOf(address owner) external view returns (uint256)"
];

// ============================================================================
// Provider + server-side wallet (key from .env, never from client)
// ============================================================================
let provider, serverWallet, mediaAnchorContract, authenticityTokenContract;

function initializeWeb3() {
    try {
        provider = new ethers.JsonRpcProvider(
            process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology'
        );

        // Server-side wallet — private key stays on the server
        const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
        if (privateKey) {
            serverWallet = new ethers.Wallet(privateKey, provider);
            logger.info(`Wallet initialized: ${serverWallet.address}`);
        } else {
            logger.warn('DEPLOYER_PRIVATE_KEY not set — write operations will fail');
        }

        // MediaAnchor contract
        const mediaAnchorAddress = process.env.MEDIA_ANCHOR_CONTRACT;
        if (mediaAnchorAddress) {
            mediaAnchorContract = new ethers.Contract(
                mediaAnchorAddress,
                MEDIA_ANCHOR_ABI,
                serverWallet || provider
            );
            logger.info(`MediaAnchor contract: ${mediaAnchorAddress}`);
        }

        // AuthenticityToken contract
        const authTokenAddress = process.env.AUTHENTICITY_TOKEN_CONTRACT;
        if (authTokenAddress) {
            authenticityTokenContract = new ethers.Contract(
                authTokenAddress,
                AUTHENTICITY_TOKEN_ABI,
                serverWallet || provider
            );
            logger.info(`AuthenticityToken contract: ${authTokenAddress}`);
        }

        logger.info('Web3 provider initialized');
    } catch (error) {
        logger.error('Web3 initialization failed:', error);
    }
}

initializeWeb3();

/**
 * POST /api/web3/anchor
 * Anchor media to blockchain with full Proof of Reality data
 * Body: { mediaHash, bioSignature, hardwareID, consensusParties, ipfsHash,
 *         proofOfRealityHash, proofOfRealityIPFS, allUniqueSignals, detectedFaces }
 */
router.post('/anchor', async (req, res) => {
    try {
        const {
            mediaHash, bioSignature, hardwareID, consensusParties, ipfsHash,
            proofOfRealityHash, proofOfRealityIPFS, allUniqueSignals, detectedFaces
        } = req.body;

        // Validate required fields
        if (!mediaHash || !bioSignature || !hardwareID || !consensusParties || !ipfsHash) {
            return res.status(400).json({ error: 'Missing required fields: mediaHash, bioSignature, hardwareID, consensusParties, ipfsHash' });
        }
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'MediaAnchor contract not initialized. Set MEDIA_ANCHOR_CONTRACT env var.' });
        }
        if (!serverWallet) {
            return res.status(503).json({ error: 'Server wallet not configured. Set DEPLOYER_PRIVATE_KEY env var.' });
        }

        // Send transaction using server-side wallet
        const tx = await mediaAnchorContract.anchorMedia(
            mediaHash,
            bioSignature,
            hardwareID,
            consensusParties,
            ipfsHash,
            proofOfRealityHash || '',
            proofOfRealityIPFS || '',
            allUniqueSignals ?? true,
            detectedFaces ?? 1
        );

        logger.info(`Anchoring media: ${mediaHash} | tx: ${tx.hash}`);
        const receipt = await tx.wait();

        res.json({
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            mediaHash,
            gasUsed: receipt.gasUsed.toString()
        });

    } catch (error) {
        logger.error('Anchor error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/verify/:mediaHash
 * Verify media on blockchain
 */
router.get('/verify/:mediaHash', async (req, res) => {
    try {
        const { mediaHash } = req.params;
        
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }
        
        const [exists, isValid, timestamp] = await mediaAnchorContract.verifyMedia(mediaHash);
        
        res.json({
            exists,
            isValid,
            timestamp: timestamp.toString(),
            date: new Date(Number(timestamp) * 1000).toISOString()
        });
        
    } catch (error) {
        logger.error('Verify error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/record/:mediaHash
 * Get full media record
 */
router.get('/record/:mediaHash', async (req, res) => {
    try {
        const { mediaHash } = req.params;
        
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }
        
        const record = await mediaAnchorContract.getMediaRecord(mediaHash);
        
        res.json({
            mediaHash: record.mediaHash,
            bioSignature: record.bioSignature,
            hardwareID: record.hardwareID,
            timestamp: record.timestamp.toString(),
            creator: record.creator,
            consensusParties: record.consensusParties,
            isRevoked: record.isRevoked,
            ipfsHash: record.ipfsHash,
            status: record.status,
            proofOfRealityHash: record.proofOfRealityHash,
            proofOfRealityIPFS: record.proofOfRealityIPFS,
            allUniqueSignals: record.allUniqueSignals,
            detectedFaces: record.detectedFaces
        });
        
    } catch (error) {
        logger.error('Get record error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/web3/dispute
 * Dispute a media record
 */
router.post('/dispute', async (req, res) => {
    try {
        const { mediaHash, reason } = req.body;
        
        if (!mediaHash || !reason) {
            return res.status(400).json({ error: 'Missing required fields: mediaHash, reason' });
        }
        if (!serverWallet) {
            return res.status(503).json({ error: 'Server wallet not configured' });
        }
        
        const tx = await mediaAnchorContract.disputeMedia(mediaHash, reason);
        const receipt = await tx.wait();
        
        res.json({
            success: true,
            transactionHash: receipt.hash
        });
        
    } catch (error) {
        logger.error('Dispute error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
