const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('../utils/logger');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';

// Configure multer for file uploads (temp disk storage for IPFS streaming)
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 } // 500MB limit
});

/**
 * Upload a buffer or file to IPFS via the local Kubo node and pin it.
 * @param {Buffer|string} content - Content to upload
 * @param {string} filename - Filename hint for IPFS
 * @returns {{ cid: string, size: number }}
 */
async function uploadAndPinToIPFS(content, filename = 'media') {
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', Buffer.isBuffer(content) ? content : Buffer.from(content), { filename });

    // Add to IPFS
    const addResp = await axios.post(`${IPFS_API_URL}/api/v0/add?pin=true`, form, {
        headers: form.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 120000,
    });
    const cid = addResp.data.Hash;
    const size = parseInt(addResp.data.Size, 10) || 0;
    logger.info(`IPFS: uploaded ${filename} → ${cid} (${size} bytes)`);
    return { cid, size };
}

/**
 * Remove a temp file (best-effort, non-blocking).
 */
function cleanupFile(filePath) {
    if (!filePath) return;
    fs.unlink(filePath, (err) => {
        if (err && err.code !== 'ENOENT') logger.warn(`Cleanup failed: ${filePath}`, err.message);
    });
}

/**
 * POST /api/media/process
 * Process and hash media with biometric data, upload to IPFS, pin, and clean up.
 */
router.post('/process', upload.single('media'), async (req, res) => {
    const tempPath = req.file?.path;
    try {
        // Validate body fields via Joi
        const { error, value } = schemas.mediaProcess.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            cleanupFile(tempPath);
            return res.status(400).json({ error: 'Validation failed', details: error.details.map(d => d.message) });
        }

        const { bpm, hardwareID, timestamp } = value;
        const mediaFile = req.file;
        
        if (!mediaFile) {
            return res.status(400).json({ error: 'Media file is required' });
        }

        // Read file into buffer for hashing
        const fileBuffer = fs.readFileSync(tempPath);

        // Generate Bio-Vault hash
        const bioVaultHash = generateBioVaultHash(fileBuffer, bpm, hardwareID, timestamp || Date.now());
        
        // Generate standard media hash
        const mediaHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        
        // Upload to IPFS and pin
        let ipfsResult = null;
        try {
            ipfsResult = await uploadAndPinToIPFS(fileBuffer, mediaFile.originalname || 'media');
        } catch (ipfsErr) {
            logger.warn('IPFS upload failed (continuing without):', ipfsErr.message);
        }

        // Clean up temp file
        cleanupFile(tempPath);

        res.json({
            success: true,
            bioVaultHash,
            mediaHash,
            size: mediaFile.size,
            mimetype: mediaFile.mimetype,
            ipfs: ipfsResult || null,
        });
        
    } catch (error) {
        cleanupFile(tempPath);
        logger.error('Media processing error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/media/verify
 * Verify media authenticity
 */
router.post('/verify', upload.single('media'), async (req, res) => {
    const tempPath = req.file?.path;
    try {
        const { error, value } = schemas.mediaVerify.validate(req.body, { abortEarly: false, stripUnknown: true });
        if (error) {
            cleanupFile(tempPath);
            return res.status(400).json({ error: 'Validation failed', details: error.details.map(d => d.message) });
        }

        const { expectedHash, bpm, hardwareID, timestamp } = value;
        const mediaFile = req.file;
        
        if (!mediaFile) {
            cleanupFile(tempPath);
            return res.status(400).json({ error: 'Media file is required' });
        }
        
        const fileBuffer = fs.readFileSync(tempPath);
        
        // Recalculate Bio-Vault hash
        const calculatedHash = generateBioVaultHash(fileBuffer, parseInt(bpm), hardwareID, timestamp);
        const isValid = calculatedHash === expectedHash;

        cleanupFile(tempPath);
        
        res.json({
            success: true,
            isValid,
            expectedHash,
            calculatedHash,
            match: isValid
        });
        
    } catch (error) {
        cleanupFile(tempPath);
        logger.error('Media verification error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/media/generate-signature
 * Generate multi-party signature for consensual recording
 */
router.post('/generate-signature', validate(schemas.generateSignature), async (req, res) => {
    try {
        const { mediaHash, parties, biometrics } = req.body;
        
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
