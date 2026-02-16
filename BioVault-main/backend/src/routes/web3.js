const express = require('express');
const { ethers } = require('ethers');
const logger = require('../utils/logger');
const { validate, schemas } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');
const { MEDIA_ANCHOR_ABI, AUTHENTICITY_TOKEN_ABI, GROTH16_VERIFIER_ABI } = require('../../../shared/contractABIs');
const walletManager = require('../utils/wallet');

const router = express.Router();

// ============================================================================
// Provider + server-side wallet (key from .env, never from client)
// ============================================================================
let provider, serverWallet, mediaAnchorContract, authenticityTokenContract, groth16VerifierContract;
let _initPromise = null;

async function initializeWeb3() {
    try {
        // Initialize the wallet manager (handles provider + wallet)
        await walletManager.initialize();

        provider = walletManager.provider;
        serverWallet = walletManager.wallet;

        // MediaAnchor contract
        const mediaAnchorAddress = process.env.MEDIA_ANCHOR_CONTRACT;
        if (mediaAnchorAddress) {
            mediaAnchorContract = walletManager.getContract(mediaAnchorAddress, MEDIA_ANCHOR_ABI);
            logger.info(`MediaAnchor contract: ${mediaAnchorAddress}`);
        }

        // AuthenticityToken contract
        const authTokenAddress = process.env.AUTHENTICITY_TOKEN_CONTRACT;
        if (authTokenAddress) {
            authenticityTokenContract = walletManager.getContract(authTokenAddress, AUTHENTICITY_TOKEN_ABI);
            logger.info(`AuthenticityToken contract: ${authTokenAddress}`);
        }

        // Groth16Verifier contract
        const verifierAddress = process.env.GROTH16_VERIFIER_CONTRACT || process.env.VERIFIER_CONTRACT;
        if (verifierAddress && GROTH16_VERIFIER_ABI) {
            groth16VerifierContract = walletManager.getContract(verifierAddress, GROTH16_VERIFIER_ABI);
            logger.info(`Groth16Verifier contract: ${verifierAddress}`);
        }

        logger.info('Web3 provider initialized');
    } catch (error) {
        logger.error('Web3 initialization failed:', error);
    }
}

// Start initialization and store the promise so requests can await it
_initPromise = initializeWeb3();

/**
 * Middleware: ensure Web3 is initialized before handling requests
 */
router.use(async (req, res, next) => {
    if (_initPromise) {
        await _initPromise;
        _initPromise = null;          // only await once
    }
    next();
});

// ============================================================================
// Wallet management endpoints
// ============================================================================

/**
 * GET /api/web3/wallet/status
 * Get wallet status (address, balance, chain — never exposes private key)
 */
router.get('/wallet/status', async (req, res) => {
    try {
        const status = await walletManager.getStatus();
        res.json(status);
    } catch (error) {
        logger.error('Wallet status error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/wallet/balance
 * Get wallet POL balance
 */
router.get('/wallet/balance', async (req, res) => {
    try {
        if (!walletManager.isAvailable) {
            return res.status(503).json({ error: 'Wallet not configured' });
        }
        const balance = await walletManager.getBalance();
        res.json(balance);
    } catch (error) {
        logger.error('Wallet balance error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/wallet/nonce
 * Get current pending nonce
 */
router.get('/wallet/nonce', async (req, res) => {
    try {
        if (!walletManager.isAvailable) {
            return res.status(503).json({ error: 'Wallet not configured' });
        }
        const nonce = await walletManager.getNonce();
        res.json({ nonce, address: walletManager.address });
    } catch (error) {
        logger.error('Wallet nonce error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/wallet/gas
 * Get current gas price estimates
 */
router.get('/wallet/gas', async (req, res) => {
    try {
        const [slow, standard, fast] = await Promise.all([
            walletManager.getGasPrice('slow'),
            walletManager.getGasPrice('standard'),
            walletManager.getGasPrice('fast')
        ]);

        const format = (data) => {
            if (data.gasPrice) return { gasPrice: ethers.formatUnits(data.gasPrice, 'gwei') + ' gwei' };
            return {
                maxFeePerGas: ethers.formatUnits(data.maxFeePerGas, 'gwei') + ' gwei',
                maxPriorityFeePerGas: ethers.formatUnits(data.maxPriorityFeePerGas, 'gwei') + ' gwei'
            };
        };

        res.json({ slow: format(slow), standard: format(standard), fast: format(fast) });
    } catch (error) {
        logger.error('Gas price error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/contracts
 * Get deployed contract addresses and status
 */
router.get('/contracts', async (req, res) => {
    try {
        const contracts = {
            mediaAnchor: {
                address: process.env.MEDIA_ANCHOR_CONTRACT || null,
                initialized: !!mediaAnchorContract
            },
            authenticityToken: {
                address: process.env.AUTHENTICITY_TOKEN_CONTRACT || null,
                initialized: !!authenticityTokenContract
            },
            verifier: {
                address: process.env.GROTH16_VERIFIER_CONTRACT || process.env.VERIFIER_CONTRACT || null,
                initialized: !!groth16VerifierContract
            }
        };

        // Check on-chain connectivity for initialized contracts
        if (mediaAnchorContract) {
            try {
                // Use verifyMedia with a dummy hash — always returns a tuple
                await mediaAnchorContract.verifyMedia('__connectivity_check__');
                contracts.mediaAnchor.connected = true;
            } catch {
                contracts.mediaAnchor.connected = false;
            }
        }

        if (authenticityTokenContract) {
            try {
                // Use exists() — always returns a bool
                await authenticityTokenContract.exists('__connectivity_check__');
                contracts.authenticityToken.connected = true;
            } catch {
                contracts.authenticityToken.connected = false;
            }
        }

        res.json(contracts);
    } catch (error) {
        logger.error('Contracts status error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/web3/anchor
 * Anchor media to blockchain with full Proof of Reality data
 * Body: { mediaHash, bioSignature, hardwareID, consensusParties, ipfsHash,
 *         proofOfRealityHash, proofOfRealityIPFS, allUniqueSignals, detectedFaces }
 */
router.post('/anchor', requireAuth, validate(schemas.anchorMedia), async (req, res) => {
    try {
        const {
            mediaHash, bioSignature, hardwareID, consensusParties, ipfsHash,
            proofOfRealityHash, proofOfRealityIPFS, allUniqueSignals, detectedFaces
        } = req.body;

        // Fields already validated by Joi middleware
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'MediaAnchor contract not initialized. Set MEDIA_ANCHOR_CONTRACT env var.' });
        }
        if (!serverWallet) {
            return res.status(503).json({ error: 'Server wallet not configured. Set DEPLOYER_PRIVATE_KEY env var.' });
        }

        // Send transaction using server-side wallet
        const tx = await req.txQueue.enqueue(
            () => mediaAnchorContract.anchorMedia(
                mediaHash,
                bioSignature,
                hardwareID,
                consensusParties,
                ipfsHash,
                proofOfRealityHash || '',
                proofOfRealityIPFS || '',
                allUniqueSignals ?? true,
                detectedFaces ?? 1
            ),
            { label: `anchor:${mediaHash.slice(0, 10)}` }
        );

        logger.info(`Anchoring media: ${mediaHash} | tx: ${tx.hash}`);

        const result = {
            success: true,
            transactionHash: tx.hash,
            blockNumber: tx.blockNumber,
            mediaHash,
            gasUsed: tx.gasUsed.toString()
        };

        // Broadcast to WebSocket clients
        const broadcast = req.app.get('broadcast');
        if (broadcast) broadcast('media:anchored', result);

        res.json(result);

    } catch (error) {
        logger.error('Anchor error:', error);
        // Return 409 Conflict for "already anchored" so clients can distinguish
        if (error.message && error.message.includes('already anchored')) {
            return res.status(409).json({
                error: 'Media already anchored',
                mediaHash: req.body.mediaHash,
                alreadyAnchored: true,
            });
        }
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
            status: Number(record.status),
            proofOfRealityHash: record.proofOfRealityHash,
            proofOfRealityIPFS: record.proofOfRealityIPFS,
            allUniqueSignals: record.allUniqueSignals,
            detectedFaces: Number(record.detectedFaces)
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
router.post('/dispute', requireAuth, validate(schemas.dispute), async (req, res) => {
    try {
        const { mediaHash, reason } = req.body;
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }
        if (!serverWallet) {
            return res.status(503).json({ error: 'Server wallet not configured' });
        }
        
        const receipt = await req.txQueue.enqueue(
            () => mediaAnchorContract.disputeMedia(mediaHash, reason),
            { label: `dispute:${mediaHash.slice(0, 10)}` }
        );
        
        const result = {
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber
        };

        const broadcast = req.app.get('broadcast');
        if (broadcast) broadcast('media:disputed', { mediaHash, reason, ...result });

        res.json(result);
        
    } catch (error) {
        logger.error('Dispute error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/web3/revoke
 * Revoke a media record (only creator or consensus party)
 */
router.post('/revoke', requireAuth, async (req, res) => {
    try {
        const { mediaHash } = req.body;

        if (!mediaHash) {
            return res.status(400).json({ error: 'mediaHash is required' });
        }
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }
        if (!serverWallet) {
            return res.status(503).json({ error: 'Server wallet not configured' });
        }

        const receipt = await req.txQueue.enqueue(
            () => mediaAnchorContract.revokeMedia(mediaHash),
            { label: `revoke:${mediaHash.slice(0, 10)}` }
        );

        const result = {
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber
        };

        const broadcast = req.app.get('broadcast');
        if (broadcast) broadcast('media:revoked', { mediaHash, ...result });

        res.json(result);

    } catch (error) {
        logger.error('Revoke error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/creator/:address
 * Get all media created by an address
 */
router.get('/creator/:address', async (req, res) => {
    try {
        const { address } = req.params;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }

        const hashes = await mediaAnchorContract.getCreatorMedia(address);

        res.json({ address, mediaCount: hashes.length, mediaHashes: hashes });

    } catch (error) {
        logger.error('Get creator media error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/participant/:address
 * Get all media a user consented to
 */
router.get('/participant/:address', async (req, res) => {
    try {
        const { address } = req.params;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }

        const hashes = await mediaAnchorContract.getParticipantMedia(address);

        res.json({ address, mediaCount: hashes.length, mediaHashes: hashes });

    } catch (error) {
        logger.error('Get participant media error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/disputes/:mediaHash
 * Get all disputes for a media record
 */
router.get('/disputes/:mediaHash', async (req, res) => {
    try {
        const { mediaHash } = req.params;

        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }

        const disputes = await mediaAnchorContract.getDisputes(mediaHash);

        res.json({
            mediaHash,
            disputeCount: disputes.length,
            disputes: disputes.map(d => ({
                disputer: d.disputer,
                reason: d.reason,
                timestamp: d.timestamp.toString(),
                date: new Date(Number(d.timestamp) * 1000).toISOString(),
                resolved: d.resolved
            }))
        });

    } catch (error) {
        logger.error('Get disputes error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/consent/:mediaHash/:address
 * Check if an address consented to a specific media
 */
router.get('/consent/:mediaHash/:address', async (req, res) => {
    try {
        const { mediaHash, address } = req.params;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }
        if (!mediaAnchorContract) {
            return res.status(503).json({ error: 'Contract not initialized' });
        }

        const consented = await mediaAnchorContract.hasConsent(mediaHash, address);

        res.json({ mediaHash, address, consented });

    } catch (error) {
        logger.error('Check consent error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// AuthenticityToken endpoints
// ============================================================================

/**
 * POST /api/web3/mint
 * Mint a soulbound authenticity token
 * Body: { to, mediaHash, bioSignature, hardwareID, ipfsHash }
 */
router.post('/mint', requireAuth, async (req, res) => {
    try {
        const { to, mediaHash, bioSignature, hardwareID, ipfsHash } = req.body;

        if (!to || !mediaHash || !bioSignature || !hardwareID || !ipfsHash) {
            return res.status(400).json({
                error: 'Missing required fields: to, mediaHash, bioSignature, hardwareID, ipfsHash'
            });
        }
        if (!ethers.isAddress(to)) {
            return res.status(400).json({ error: 'Invalid recipient address' });
        }
        if (!authenticityTokenContract) {
            return res.status(503).json({ error: 'AuthenticityToken contract not initialized. Set AUTHENTICITY_TOKEN_CONTRACT env var.' });
        }
        if (!serverWallet) {
            return res.status(503).json({ error: 'Server wallet not configured' });
        }

        const receipt = await req.txQueue.enqueue(
            () => authenticityTokenContract.mint(
                to, mediaHash, bioSignature, hardwareID, ipfsHash
            ),
            { label: `mint:${mediaHash.slice(0, 10)}` }
        );
        logger.info(`Minting authenticity token for: ${mediaHash} | tx: ${receipt.hash}`);

        // Parse the AuthenticityMinted event to get tokenId
        let tokenId = null;
        for (const log of receipt.logs) {
            try {
                const parsed = authenticityTokenContract.interface.parseLog(log);
                if (parsed && parsed.name === 'AuthenticityMinted') {
                    tokenId = parsed.args.tokenId.toString();
                    break;
                }
            } catch { /* skip non-matching logs */ }
        }

        // Fallback: query contract if event parsing failed
        if (!tokenId) {
            try {
                tokenId = (await authenticityTokenContract.getTokenByMediaHash(mediaHash)).toString();
            } catch { /* ignore */ }
        }

        const result = {
            success: true,
            tokenId,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            mediaHash,
            recipient: to
        };

        const broadcast = req.app.get('broadcast');
        if (broadcast) broadcast('token:minted', result);

        res.json(result);

    } catch (error) {
        logger.error('Mint error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/token/:mediaHash
 * Get token info by media hash
 */
router.get('/token/:mediaHash', async (req, res) => {
    try {
        const { mediaHash } = req.params;

        if (!authenticityTokenContract) {
            return res.status(503).json({ error: 'AuthenticityToken contract not initialized' });
        }

        const tokenExists = await authenticityTokenContract.exists(mediaHash);
        if (!tokenExists) {
            return res.json({ exists: false, mediaHash });
        }

        const tokenId = await authenticityTokenContract.getTokenByMediaHash(mediaHash);
        const owner = await authenticityTokenContract.ownerOf(tokenId);
        const anchor = await authenticityTokenContract.tokenAnchors(tokenId);

        res.json({
            exists: true,
            tokenId: tokenId.toString(),
            owner,
            soulbound: true,
            anchor: {
                mediaHash: anchor.mediaHash,
                bioSignature: anchor.bioSignature,
                hardwareID: anchor.hardwareID,
                timestamp: anchor.timestamp.toString(),
                date: new Date(Number(anchor.timestamp) * 1000).toISOString(),
                ipfsHash: anchor.ipfsHash
            }
        });

    } catch (error) {
        logger.error('Get token error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/web3/balance/:address
 * Get authenticity token balance for an address
 */
router.get('/balance/:address', async (req, res) => {
    try {
        const { address } = req.params;

        if (!ethers.isAddress(address)) {
            return res.status(400).json({ error: 'Invalid Ethereum address' });
        }
        if (!authenticityTokenContract) {
            return res.status(503).json({ error: 'AuthenticityToken contract not initialized' });
        }

        const balance = await authenticityTokenContract.balanceOf(address);

        res.json({ address, balance: balance.toString() });

    } catch (error) {
        logger.error('Get balance error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// On-chain ZKP Verification
// ============================================================================

/**
 * POST /api/web3/verify-proof
 * Verify a Groth16 ZKP proof on-chain via the deployed Groth16Verifier contract.
 * Body: { proof: { pi_a, pi_b, pi_c }, publicSignals: string[] }
 */
router.post('/verify-proof', async (req, res) => {
    try {
        const { proof, publicSignals } = req.body;

        if (!proof || !publicSignals) {
            return res.status(400).json({ error: 'proof and publicSignals are required' });
        }

        if (!groth16VerifierContract) {
            // Fallback: verify off-chain using snarkjs if no on-chain verifier
            try {
                const snarkjs = require('snarkjs');
                const path = require('path');
                const fs = require('fs');
                const vkeyPath = path.join(__dirname, '../../../zkp-circuits/build/bio_match_verification_key.json');
                if (fs.existsSync(vkeyPath)) {
                    const vkey = JSON.parse(fs.readFileSync(vkeyPath, 'utf8'));
                    const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);
                    return res.json({
                        success: true,
                        isValid,
                        method: 'off-chain-snarkjs',
                        message: isValid ? 'Proof verified off-chain' : 'Proof invalid',
                    });
                }
            } catch (offChainErr) {
                logger.warn('Off-chain verification failed:', offChainErr.message);
            }
            return res.status(503).json({
                error: 'Groth16Verifier contract not initialized. Set GROTH16_VERIFIER_CONTRACT env var.',
            });
        }

        // Convert snarkjs proof format to Solidity verifier format
        const a = [proof.pi_a[0], proof.pi_a[1]];
        const b = [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]];
        const c = [proof.pi_c[0], proof.pi_c[1]];
        const input = publicSignals.map(s => s.toString());

        const isValid = await groth16VerifierContract.verifyProof(a, b, c, input);

        res.json({
            success: true,
            isValid,
            method: 'on-chain',
            message: isValid ? 'Proof verified on-chain' : 'Proof invalid on-chain',
        });

    } catch (error) {
        logger.error('Verify-proof error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
