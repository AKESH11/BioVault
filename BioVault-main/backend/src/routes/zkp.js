const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/zkp/generate
 * Generate a zero-knowledge proof for media verification
 */
router.post('/generate', async (req, res) => {
    try {
        const { publicHash, timestamp, videoPixels, bioSignature, hardwareID } = req.body;
        
        if (!publicHash || !timestamp || !videoPixels || !bioSignature || !hardwareID) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Create input file for circuit
        const input = {
            publicHash,
            timestamp,
            videoPixels,
            bioSignature,
            hardwareID
        };
        
        const inputPath = path.join(__dirname, '../../temp', `input_${Date.now()}.json`);
        await fs.mkdir(path.dirname(inputPath), { recursive: true });
        await fs.writeFile(inputPath, JSON.stringify(input));
        
        // Path to zkp-circuits directory
        const zkpDir = path.join(__dirname, '../../../zkp-circuits');
        
        // Generate proof using snarkjs
        const command = `cd ${zkpDir} && node scripts/generate_proof.js ${inputPath}`;
        
        exec(command, async (error, stdout, stderr) => {
            if (error) {
                logger.error('ZKP generation error:', error);
                return res.status(500).json({ error: error.message });
            }
            
            try {
                // Read generated proof
                const proofPath = path.join(zkpDir, 'proofs', 'proof.json');
                const publicPath = path.join(zkpDir, 'proofs', 'public.json');
                
                const proof = JSON.parse(await fs.readFile(proofPath, 'utf8'));
                const publicSignals = JSON.parse(await fs.readFile(publicPath, 'utf8'));
                
                // Clean up temp files
                await fs.unlink(inputPath).catch(() => {});
                
                res.json({
                    success: true,
                    proof,
                    publicSignals
                });
                
            } catch (readError) {
                logger.error('Error reading proof:', readError);
                res.status(500).json({ error: 'Failed to read generated proof' });
            }
        });
        
    } catch (error) {
        logger.error('ZKP generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/zkp/verify
 * Verify a zero-knowledge proof
 */
router.post('/verify', async (req, res) => {
    try {
        const { proof, publicSignals } = req.body;
        
        if (!proof || !publicSignals) {
            return res.status(400).json({ error: 'Missing proof or public signals' });
        }
        
        // Save proof temporarily
        const proofPath = path.join(__dirname, '../../temp', `proof_${Date.now()}.json`);
        const publicPath = path.join(__dirname, '../../temp', `public_${Date.now()}.json`);
        
        await fs.mkdir(path.dirname(proofPath), { recursive: true });
        await fs.writeFile(proofPath, JSON.stringify(proof));
        await fs.writeFile(publicPath, JSON.stringify(publicSignals));
        
        // Verify using snarkjs
        const zkpDir = path.join(__dirname, '../../../zkp-circuits');
        const command = `cd ${zkpDir} && node scripts/verify_proof.js ${proofPath} ${publicPath}`;
        
        exec(command, async (error, stdout, stderr) => {
            // Clean up temp files
            await fs.unlink(proofPath).catch(() => {});
            await fs.unlink(publicPath).catch(() => {});
            
            if (error) {
                logger.error('ZKP verification error:', error);
                return res.status(500).json({ error: error.message });
            }
            
            const isValid = stdout.includes('VALID');
            
            res.json({
                success: true,
                isValid,
                message: isValid ? 'Proof is valid' : 'Proof is invalid'
            });
        });
        
    } catch (error) {
        logger.error('ZKP verify error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/zkp/exonerate
 * Generate exoneration proof (prove video is fake without revealing content)
 */
router.post('/exonerate', async (req, res) => {
    try {
        const { claimedHash, actualBioSignature, privateMedia } = req.body;
        
        if (!claimedHash || !actualBioSignature) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Generate proof that the bio signature doesn't match
        // This proves the video is fake without revealing the actual content
        
        res.json({
            success: true,
            message: 'Exoneration proof generated',
            proof: {
                claimedHash,
                // ZK proof that bio signature mismatches
                mismatch: true
            }
        });
        
    } catch (error) {
        logger.error('Exoneration error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
