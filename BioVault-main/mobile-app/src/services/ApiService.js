/**
 * Bio-Vault API Service
 *
 * Mobile client for the backend server. Handles all network calls:
 * - Blockchain anchoring (via backend-mediated wallet)
 * - IPFS uploads (via backend Kubo proxy)
 * - Media verification
 * - Health checks
 */

const API_BASE_URL = __DEV__
    ? 'http://10.0.2.2:3000'   // Android emulator → host machine
    : 'http://192.168.1.100:3000'; // TODO: Set to your server IP for physical device

const TIMEOUT_MS = 30000;

class ApiService {
    constructor(baseUrl = API_BASE_URL) {
        this.baseUrl = baseUrl;
    }

    // ========================================================================
    // Internal
    // ========================================================================

    async _request(method, path, body = null) {
        const url = `${this.baseUrl}${path}`;
        const options = {
            method,
            headers: { 'Content-Type': 'application/json' },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        options.signal = controller.signal;

        try {
            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error(`Request timeout after ${TIMEOUT_MS / 1000}s: ${path}`);
            }
            throw error;
        }
    }

    // ========================================================================
    // Health
    // ========================================================================

    /**
     * Check if the backend server is reachable and healthy.
     * @returns {Promise<{status: string, timestamp: string}>}
     */
    async healthCheck() {
        return this._request('GET', '/health');
    }

    // ========================================================================
    // Blockchain (via backend-mediated server wallet)
    // ========================================================================

    /**
     * Anchor media to Polygon blockchain via the backend server wallet.
     *
     * @param {Object} params
     * @param {string} params.mediaHash           - BLAKE3/SHA-256 hash of the media file
     * @param {string} params.bioSignature         - Composite bio-signature (BPM + StrongBox)
     * @param {string} params.hardwareID           - PRNU hardware fingerprint
     * @param {string[]} params.consensusParties   - Ethereum addresses of consenting parties
     * @param {string} params.ipfsHash             - IPFS CID of the uploaded media
     * @param {string} params.proofOfRealityHash   - BLAKE3 hash of Proof of Reality metadata
     * @param {string} params.proofOfRealityIPFS   - IPFS CID of Proof of Reality JSON
     * @param {boolean} params.allUniqueSignals    - True if no replay attacks detected
     * @param {number} params.detectedFaces        - Number of faces detected in frame
     * @returns {Promise<{success, transactionHash, blockNumber, mediaHash, gasUsed}>}
     */
    async anchorMedia(params) {
        return this._request('POST', '/api/web3/anchor', params);
    }

    /**
     * Verify if a media hash exists on-chain and check its status.
     * @param {string} mediaHash
     * @returns {Promise<{exists, isValid, timestamp, date}>}
     */
    async verifyMedia(mediaHash) {
        return this._request('GET', `/api/web3/verify/${encodeURIComponent(mediaHash)}`);
    }

    /**
     * Get the full on-chain record for an anchored media hash.
     * @param {string} mediaHash
     * @returns {Promise<Object>} Full MediaRecord struct
     */
    async getMediaRecord(mediaHash) {
        return this._request('GET', `/api/web3/record/${encodeURIComponent(mediaHash)}`);
    }

    /**
     * Dispute a media record on-chain.
     * @param {string} mediaHash
     * @param {string} reason
     * @returns {Promise<{success, transactionHash}>}
     */
    async disputeMedia(mediaHash, reason) {
        return this._request('POST', '/api/web3/dispute', { mediaHash, reason });
    }

    // ========================================================================
    // IPFS (via backend Kubo proxy)
    // ========================================================================

    /**
     * Upload data to IPFS via the backend Kubo node.
     *
     * @param {Object} params
     * @param {string} params.data      - Base64-encoded file content
     * @param {string} [params.filename] - Filename (default: "media")
     * @param {Object} [params.metadata] - Optional metadata JSON (uploaded separately, pinned)
     * @returns {Promise<{success, cid, url, size, metadataCID?}>}
     */
    async uploadToIPFS(params) {
        return this._request('POST', '/api/ipfs/upload', params);
    }

    // ========================================================================
    // Media
    // ========================================================================

    /**
     * Upload and hash a media file on the backend.
     * @param {string} base64Data - Base64-encoded file
     * @param {string} filename
     * @returns {Promise<{hash, size}>}
     */
    async hashMedia(base64Data, filename) {
        return this._request('POST', '/api/media/hash', { data: base64Data, filename });
    }

    // ========================================================================
    // ZKP
    // ========================================================================

    /**
     * Generate a ZK proof on the backend.
     * @param {Object} inputs - Circuit inputs
     * @param {string} circuitType - 'verify' or 'bio_match'
     * @returns {Promise<{proof, publicSignals}>}
     */
    async generateProof(inputs, circuitType = 'bio_match') {
        return this._request('POST', '/api/zkp/generate', { inputs, circuitType });
    }

    /**
     * Verify a ZK proof on the backend.
     * @param {Object} proof
     * @param {string[]} publicSignals
     * @returns {Promise<{valid: boolean}>}
     */
    async verifyProof(proof, publicSignals) {
        return this._request('POST', '/api/zkp/verify', { proof, publicSignals });
    }
}

// Singleton instance
const apiService = new ApiService();

export default apiService;
export { ApiService };
