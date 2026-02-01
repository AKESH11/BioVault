const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

/**
 * POST /api/media/process
 * Process and hash media with biometric data
 */
router.post('/process', upload.single('media'), async (req, res) => {
    try {
        const { bpm, hardwareID, timestamp } = req.body;
        const mediaFile = req.file;
        
        if (!mediaFile || !bpm || !hardwareID) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Generate Bio-Vault hash
        const bioVaultHash = generateBioVaultHash(
            mediaFile.buffer,
            parseInt(bpm),
            hardwareID,
            timestamp || Date.now()
        );
        
        // Generate standard media hash
        const mediaHash = crypto
            .createHash('sha256')
            .update(mediaFile.buffer)
            .digest('hex');
        
        res.json({
            success: true,
            bioVaultHash,
            mediaHash,
            size: mediaFile.size,
            mimetype: mediaFile.mimetype
        });
        
    } catch (error) {
        logger.error('Media processing error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/media/verify
 * Verify media authenticity
 */
router.post('/verify', upload.single('media'), async (req, res) => {
    try {
        const { expectedHash, bpm, hardwareID, timestamp } = req.body;
        const mediaFile = req.file;
        
        if (!mediaFile || !expectedHash) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        // Recalculate Bio-Vault hash
        const calculatedHash = generateBioVaultHash(
            mediaFile.buffer,
            parseInt(bpm),
            hardwareID,
            timestamp
        );
        
        const isValid = calculatedHash === expectedHash;
        
        res.json({
            success: true,
            isValid,
            expectedHash,
            calculatedHash,
            match: isValid
        });
        
    } catch (error) {
        logger.error('Media verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/media/generate-signature
 * Generate multi-party signature for consensual recording
 */
router.post('/generate-signature', async (req, res) => {
    try {
        const { mediaHash, parties, biometrics } = req.body;
        
        if (!mediaHash || !parties || !Array.isArray(parties)) {
            return res.status(400).json({ error: 'Invalid request format' });
        }
        
        // Combine all party signatures
        const compositeSignature = parties.map((party, index) => {
            const bpm = biometrics?.[index]?.bpm || 0;
            return `${party}:${bpm}`;
        }).join('|');
        
        // Generate composite hash
        const signatureHash = crypto
            .createHash('sha256')
            .update(mediaHash + compositeSignature)
            .digest('hex');
        
        res.json({
            success: true,
            compositeSignature,
            signatureHash,
            parties: parties.length
        });
        
    } catch (error) {
        logger.error('Signature generation error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Helper function: Generate Bio-Vault hash
 */
function generateBioVaultHash(mediaBuffer, bpm, hardwareID, timestamp) {
    const combined = Buffer.concat([
        mediaBuffer,
        Buffer.from(String(bpm)),
        Buffer.from(hardwareID),
        Buffer.from(String(timestamp))
    ]);
    
    return crypto.createHash('sha256').update(combined).digest('hex');
}

module.exports = router;
