/**
 * Standalone IPFS Service
 *
 * Uploads to IPFS via Pinata HTTP API and retrieves via public gateways.
 * No local Kubo node or backend server needed.
 *
 * Usage:
 *   import ipfsService from '../services/IPFSService';
 *   const { cid } = await ipfsService.upload(jsonData, 'proof.json');
 *   const content  = await ipfsService.retrieve(cid);
 */

const PINATA_API     = 'https://api.pinata.cloud';
const PINATA_JWT     = ''; // Set at runtime via configure() — never hardcode in production

// Public IPFS gateways (tried in order)
const GATEWAYS = [
    'https://gateway.pinata.cloud/ipfs/',
    'https://ipfs.io/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/',
];

const TIMEOUT_MS = 30000;

import AsyncStorage from '@react-native-async-storage/async-storage';

const PINATA_KEY_STORE = 'biovault_pinata_jwt';

class IPFSService {
    constructor() {
        this.pinataJwt = PINATA_JWT;
        this._initialized = false;
    }

    /** Load saved Pinata JWT from storage. */
    async init() {
        if (this._initialized) return;
        try {
            const saved = await AsyncStorage.getItem(PINATA_KEY_STORE);
            if (saved) this.pinataJwt = saved;
        } catch (_) {}
        this._initialized = true;
    }

    /** Set (and persist) Pinata JWT for uploads. */
    async configure(jwt) {
        this.pinataJwt = jwt;
        try {
            await AsyncStorage.setItem(PINATA_KEY_STORE, jwt);
        } catch (_) {}
    }

    /** True if Pinata JWT is configured (uploads will work). */
    canUpload() {
        return !!this.pinataJwt;
    }

    // ── Upload ──────────────────────────────────────────────────────────

    /**
     * Pin JSON data to IPFS via Pinata.
     * @param {object} jsonData - The data to pin.
     * @param {string} [name]   - Human-readable pin name.
     * @returns {{ cid: string, size: number }}
     */
    async uploadJSON(jsonData, name = 'biovault-data') {
        await this.init();
        if (!this.pinataJwt) {
            throw new Error('Pinata JWT not configured — cannot upload to IPFS. Configure in Settings.');
        }

        const body = {
            pinataContent: jsonData,
            pinataMetadata: { name },
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
            const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${this.pinataJwt}`,
                },
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Pinata upload failed (${res.status}): ${err}`);
            }

            const data = await res.json();
            return {
                cid: data.IpfsHash,
                size: data.PinSize || 0,
            };
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') throw new Error('IPFS upload timeout');
            throw err;
        }
    }

    /**
     * Upload raw base64 data to Pinata (file upload).
     * @param {string} base64Data - Base64-encoded content.
     * @param {string} filename   - Filename hint.
     * @returns {{ cid: string }}
     */
    async uploadFile(base64Data, filename = 'biovault-file') {
        await this.init();
        if (!this.pinataJwt) {
            throw new Error('Pinata JWT not configured — cannot upload to IPFS.');
        }

        // FormData with raw binary
        const boundary = '----BioVaultUpload' + Date.now();
        const binaryStr = atob(base64Data);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

        // Build multipart body manually (React Native fetch supports this)
        const formData = new FormData();
        formData.append('file', {
            uri: 'data:application/octet-stream;base64,' + base64Data,
            type: 'application/octet-stream',
            name: filename,
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);

        try {
            const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.pinataJwt}`,
                    // Content-Type is set automatically with FormData
                },
                body: formData,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const err = await res.text();
                throw new Error(`Pinata file upload failed (${res.status}): ${err}`);
            }

            const data = await res.json();
            return { cid: data.IpfsHash };
        } catch (err) {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') throw new Error('IPFS file upload timeout');
            throw err;
        }
    }

    // ── Retrieve ────────────────────────────────────────────────────────

    /**
     * Retrieve content from IPFS by CID using public gateways.
     * Tries multiple gateways in parallel, returns the fastest.
     * @param {string} cid
     * @returns {string} Content as text
     */
    async retrieve(cid) {
        if (!cid) throw new Error('CID is required');

        // Race all gateways — first success wins
        const promises = GATEWAYS.map(gw =>
            this._fetchGateway(gw + cid).catch(() => null),
        );

        const results = await Promise.all(promises);
        const first = results.find(r => r !== null);
        if (!first) {
            throw new Error(`Failed to retrieve CID ${cid} from any IPFS gateway`);
        }
        return first;
    }

    /**
     * Retrieve and parse JSON from IPFS.
     */
    async retrieveJSON(cid) {
        const text = await this.retrieve(cid);
        return JSON.parse(text);
    }

    /** Quick check: can we reach at least one IPFS gateway? */
    async isAvailable() {
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(GATEWAYS[0] + 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG', {
                method: 'HEAD',
                signal: controller.signal,
            });
            clearTimeout(id);
            return res.ok;
        } catch (_) {
            return false;
        }
    }

    // ── Internal ────────────────────────────────────────────────────────

    async _fetchGateway(url) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.text();
        } catch (err) {
            clearTimeout(timeoutId);
            throw err;
        }
    }
}

const ipfsService = new IPFSService();
export default ipfsService;
export { IPFSService };
