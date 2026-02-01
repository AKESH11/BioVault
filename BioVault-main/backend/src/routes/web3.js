const express = require('express');
const { ethers } = require('ethers');
const logger = require('../utils/logger');

const router = express.Router();

// Contract ABIs (simplified - import full ABIs in production)
const MEDIA_ANCHOR_ABI = [
    "function anchorMedia(string mediaHash, string bioSignature, string hardwareID, address[] consensusParties, string ipfsHash) external",
    "function verifyMedia(string mediaHash) external view returns (bool exists, bool isValid, uint256 timestamp)",
    "function getMediaRecord(string mediaHash) external view returns (tuple(string mediaHash, string bioSignature, string hardwareID, uint256 timestamp, address creator, address[] consensusParties, bool isRevoked, string ipfsHash, uint8 status))",
    "function disputeMedia(string mediaHash, string reason) external",
    "function revokeMedia(string mediaHash) external"
];

// Provider setup
let provider, mediaAnchorContract;

function initializeWeb3() {
    try {
        provider = new ethers.JsonRpcProvider(
            process.env.POLYGON_RPC_URL || 'http://127.0.0.1:8545'
        );
        
        const contractAddress = process.env.MEDIA_ANCHOR_CONTRACT;
        if (contractAddress) {
            mediaAnchorContract = new ethers.Contract(
                contractAddress,
                MEDIA_ANCHOR_ABI,
                provider
            );
        }
        
        logger.info('✅ Web3 provider initialized');
    } catch (error) {
        logger.error('❌ Web3 initialization failed:', error);
    }
}

initializeWeb3();

/**
 * POST /api/web3/anchor
 * Anchor media to blockchain
 */
router.post('/anchor', async (req, res) => {
    try {
        const { mediaHash, bioSignature, hardwareID, consensusParties, ipfsHash, privateKey } = req.body;
        
        if (!mediaHash || !bioSignature || !hardwareID || !consensusParties || !ipfsHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }
        
        // Create wallet from private key
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = mediaAnchorContract.connect(wallet);
        
        // Send transaction
        const tx = await contract.anchorMedia(
            mediaHash,
            bioSignature,
            hardwareID,
            consensusParties,
            ipfsHash
        );
        
        logger.info(`📝 Anchoring media: ${mediaHash}`);
        const receipt = await tx.wait();
        
        res.json({
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            mediaHash
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
            status: record.status
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
        const { mediaHash, reason, privateKey } = req.body;
        
        if (!mediaHash || !reason) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = mediaAnchorContract.connect(wallet);
        
        const tx = await contract.disputeMedia(mediaHash, reason);
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
