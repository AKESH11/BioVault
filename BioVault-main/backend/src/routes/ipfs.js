const express = require('express');
const logger = require('../utils/logger');
const axios = require('axios');
const { validate, schemas } = require('../middleware/validation');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// IPFS client using Kubo RPC API (HTTP endpoint)
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001';
const IPFS_GATEWAY_URL = process.env.IPFS_GATEWAY_URL || 'https://ipfs.io';

// Kubo 0.34+ requires Origin header for CORS — create a pre-configured axios instance
const ipfsClient = axios.create({
    baseURL: IPFS_API_URL,
    headers: { 'Origin': 'http://localhost:3000' },
    timeout: 60000
});

// Test IPFS connection on startup
async function testIPFSConnection() {
    try {
        const response = await ipfsClient.post('/api/v0/version');
        logger.info(`IPFS connected - Kubo ${response.data.Version}`);
        return true;
    } catch (error) {
        logger.warn(`IPFS not available at ${IPFS_API_URL} - Using fallback mode`);
        return false;
    }
}

let ipfsAvailable = false;
testIPFSConnection().then(available => { ipfsAvailable = available; });

/**
 * POST /api/ipfs/upload
 * Upload encrypted media to IPFS via Kubo RPC API
 */
router.post('/upload', requireAuth, validate(schemas.ipfsUpload), async (req, res) => {
    try {
        const { data, filename, metadata } = req.body;
        
        // Validated by Joi middleware
        
        if (!ipfsAvailable) {
            return res.status(503).json({ 
                error: 'IPFS not available',
                message: 'Please start IPFS daemon or configure IPFS_API_URL'
            });
        }
        
        // Convert base64 to buffer if needed
        const buffer = Buffer.from(data, 'base64');
        
        // Create form data for IPFS add
        const FormData = require('form-data');
        const form = new FormData();
        form.append('file', buffer, { filename: filename || 'media' });
        
        // Upload to IPFS via HTTP API
        const response = await ipfsClient.post('/api/v0/add', form, {
            headers: form.getHeaders(),
            params: {
                pin: 'true',
                'wrap-with-directory': 'false'
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });
        
        const cid = response.data.Hash;
        logger.info(`📦 Uploaded to IPFS: ${cid} (${response.data.Size} bytes)`);
        
        // Optionally store metadata
        if (metadata) {
            const metadataObj = {
                ...metadata,
                filename,
                timestamp: new Date().toISOString(),
                contentCID: cid
            };
            
            const metadataForm = new FormData();
            metadataForm.append('file', JSON.stringify(metadataObj), { filename: 'metadata.json' });
            
            const metadataResponse = await ipfsClient.post('/api/v0/add', metadataForm, {
                headers: metadataForm.getHeaders(),
                params: { pin: 'true' }
            });
            
            return res.json({
                success: true,
                cid,
                metadataCID: metadataResponse.data.Hash,
                url: `${IPFS_GATEWAY_URL}/ipfs/${cid}`,
                size: parseInt(response.data.Size)
            });
        }
        
        res.json({
            success: true,
            cid,
            url: `${IPFS_GATEWAY_URL}/ipfs/${cid}`,
            size: parseInt(response.data.Size)
        });
        
    } catch (error) {
        logger.error('IPFS upload error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/ipfs/:cid
 * Retrieve content from IPFS via Kubo RPC API
 */
router.get('/:cid', async (req, res) => {
    try {
        const { cid } = req.params;
        
        if (!ipfsAvailable) {
            // Fallback to public gateway
            return res.redirect(`${IPFS_GATEWAY_URL}/ipfs/${cid}`);
        }
        
        // Fetch from local IPFS node
        const response = await ipfsClient.post('/api/v0/cat', null, {
            params: { arg: cid },
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        const data = Buffer.from(response.data);
        
        res.json({
            success: true,
            data: data.toString('base64'),
            size: data.length
        });
        
    } catch (error) {
        logger.error('IPFS retrieval error:', error.message);
        
        // Fallback to gateway on error
        if (error.code === 'ECONNREFUSED') {
            return res.redirect(`${IPFS_GATEWAY_URL}/ipfs/${req.params.cid}`);
        }
        
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/ipfs/pin
 * Pin content to ensure it stays on IPFS
 */
router.post('/pin', requireAuth, validate(schemas.ipfsPin), async (req, res) => {
    try {
        const { cid } = req.body;
        
        if (!ipfsAvailable) {
            return res.status(503).json({ 
                error: 'IPFS not available',
                message: 'Cannot pin without local IPFS node'
            });
        }
        
        // Pin via HTTP API
        await ipfsClient.post('/api/v0/pin/add', null, {
            params: { arg: cid },
            timeout: 60000
        });
        
        res.json({
            success: true,
            message: 'Content pinned successfully',
            cid
        });
        
    } catch (error) {
        logger.error('IPFS pin error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
