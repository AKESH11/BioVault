/**
 * Pinata IPFS Pinning Service — Redundant backup for local Kubo node.
 *
 * Pinata provides:
 *   1. Cloud-hosted IPFS pinning (content survives local node restart)
 *   2. Dedicated gateway (faster retrieval)
 *   3. Pin-by-CID (no re-upload needed)
 *
 * Configure via environment:
 *   PINATA_JWT=<your pinata JWT>
 *   PINATA_GATEWAY=<your-gateway>.mypinata.cloud   (optional)
 *
 * Obtain a free JWT at https://app.pinata.cloud/developers/api-keys
 *
 * This module is OPTIONAL — if PINATA_JWT is not set, all methods are
 * silent no-ops so the rest of the system keeps working with Kubo only.
 */

const axios = require('axios');
const FormData = require('form-data');
const logger = require('./logger');

const PINATA_API = 'https://api.pinata.cloud';
const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'gateway.pinata.cloud';

const enabled = !!PINATA_JWT;

// Pre-configured client
const pinata = enabled
  ? axios.create({
      baseURL: PINATA_API,
      headers: { Authorization: `Bearer ${PINATA_JWT}` },
      timeout: 120000,
    })
  : null;

/**
 * Test Pinata connectivity on startup.
 */
async function testConnection() {
  if (!enabled) {
    logger.info('Pinata not configured (PINATA_JWT missing) — using Kubo only');
    return false;
  }
  try {
    const res = await pinata.get('/data/testAuthentication');
    logger.info(`Pinata connected — ${res.data.message}`);
    return true;
  } catch (err) {
    logger.warn(`Pinata auth failed: ${err.message}`);
    return false;
  }
}

/**
 * Pin an existing CID on Pinata (no re-upload; Pinata fetches from IPFS network).
 * @param {string} cid  - IPFS CID
 * @param {string} name - Human-readable pin name (optional)
 */
async function pinByCid(cid, name) {
  if (!enabled) return null;
  try {
    const res = await pinata.post('/pinning/pinByHash', {
      hashToPin: cid,
      pinataMetadata: { name: name || `biovault-${cid.slice(0, 8)}` },
    });
    logger.info(`Pinata pinByCid: ${cid} → ${res.data.status || 'queued'}`);
    return res.data;
  } catch (err) {
    // 'DUPLICATE_OBJECT' means already pinned — not an error
    if (err.response?.data?.error?.reason === 'DUPLICATE_OBJECT') {
      logger.info(`Pinata: ${cid} already pinned`);
      return { status: 'already_pinned', cid };
    }
    logger.warn(`Pinata pinByCid failed for ${cid}: ${err.message}`);
    return null;
  }
}

/**
 * Upload a buffer directly to Pinata (for when Kubo is down).
 * @param {Buffer} buffer   - File content
 * @param {string} filename - Original filename
 * @param {object} metadata - Optional key/value metadata
 */
async function upload(buffer, filename, metadata) {
  if (!enabled) return null;
  try {
    const form = new FormData();
    form.append('file', buffer, { filename: filename || 'media' });
    form.append(
      'pinataMetadata',
      JSON.stringify({
        name: filename || `biovault-${Date.now()}`,
        keyvalues: metadata || {},
      })
    );
    form.append(
      'pinataOptions',
      JSON.stringify({ cidVersion: 0 })
    );

    const res = await pinata.post('/pinning/pinFileToIPFS', form, {
      headers: form.getHeaders(),
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    logger.info(`Pinata upload: ${res.data.IpfsHash} (${res.data.PinSize} bytes)`);
    return {
      cid: res.data.IpfsHash,
      size: res.data.PinSize,
      url: `https://${PINATA_GATEWAY}/ipfs/${res.data.IpfsHash}`,
    };
  } catch (err) {
    logger.warn(`Pinata upload failed: ${err.message}`);
    return null;
  }
}

/**
 * Unpin a CID from Pinata.
 */
async function unpin(cid) {
  if (!enabled) return null;
  try {
    await pinata.delete(`/pinning/unpin/${cid}`);
    logger.info(`Pinata unpinned: ${cid}`);
    return true;
  } catch (err) {
    logger.warn(`Pinata unpin failed for ${cid}: ${err.message}`);
    return false;
  }
}

/**
 * Get Pinata gateway URL for a CID.
 */
function gatewayUrl(cid) {
  return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
}

module.exports = {
  enabled,
  testConnection,
  pinByCid,
  upload,
  unpin,
  gatewayUrl,
};
