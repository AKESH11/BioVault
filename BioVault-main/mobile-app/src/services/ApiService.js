/**
 * Bio-Vault API Service
 *
 * Mobile client for the backend server. Handles all network calls:
 * - Blockchain anchoring (via backend-mediated wallet)
 * - IPFS uploads (via backend Kubo proxy)
 * - Media verification
 * - ZKP proof generation & verification
 * - Health & wallet status checks
 *
 * STANDALONE MODE: When the backend is unreachable, automatically falls back
 * to BlockchainService (direct RPC) and IPFSService (Pinata/gateways) so the
 * app keeps working without a laptop running.
 */

import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import blockchainService from './BlockchainService';
import ipfsService from './IPFSService';

// Default: local backend via adb reverse (both debug and release testing).
// In a real production deployment, change PRODUCTION_URL to your server.
// Users can also override at runtime via AsyncStorage 'biovault_server_url'.
const LOCAL_URL = 'http://127.0.0.1:3000';
const PRODUCTION_URL = 'https://api.biovault.io';
const DEFAULT_BASE_URL = LOCAL_URL; // Use local until production server is live

const SERVER_URL_KEY = 'biovault_server_url';
const TIMEOUT_MS = 30000;

class ApiService {
    constructor(baseUrl = DEFAULT_BASE_URL) {
        this.baseUrl = baseUrl;
        this.apiKey = 'bv-dev-key-2024-change-in-production';
        this.accessToken = null; // JWT access token (set via setAccessToken)
        this._initialized = false;
        this._backendReachable = null;  // null = unknown, true/false = cached
        this._lastBackendCheck = 0;
    }

    /**
     * Load saved server URL from AsyncStorage (call once at app startup).
     */
    async init() {
        if (this._initialized) return;
        try {
            const savedUrl = await AsyncStorage.getItem(SERVER_URL_KEY);
            if (savedUrl) {
                this.baseUrl = savedUrl.replace(/\/+$/, '');
                console.log('[ApiService] Using saved URL:', this.baseUrl);
            }
        } catch (_) { /* ignore storage errors */ }
        this._initialized = true;
    }

    /**
     * Override the base URL at runtime (e.g., from settings screen).
     * Persists to AsyncStorage so the next launch uses it automatically.
     */
    async setBaseUrl(url) {
        this.baseUrl = url.replace(/\/+$/, '');
        try { await AsyncStorage.setItem(SERVER_URL_KEY, this.baseUrl); } catch (_) {}
    }

    /**
     * Set API key for authenticated endpoints (anchor, mint, dispute, revoke, IPFS upload).
     */
    setApiKey(key) {
        this.apiKey = key;
    }

    /**
     * Set JWT access token for per-user authentication.
     */
    setAccessToken(token) {
        this.accessToken = token;
    }

    // ========================================================================
    // Internal
    // ========================================================================

    async _request(method, path, body = null) {
        const url = `${this.baseUrl}${path}`;
        const headers = { 'Content-Type': 'application/json' };
        // Prefer JWT if available, fallback to API key
        if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
        } else if (this.apiKey) {
            headers['x-api-key'] = this.apiKey;
        }
        const options = {
            method,
            headers,
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
    // Authentication
    // ========================================================================

    /**
     * Register a new user and store the JWT token.
     */
    async register(email, password) {
        const result = await this._request('POST', '/api/auth/register', { email, password });
        if (result.accessToken) {
            this.setAccessToken(result.accessToken);
        }
        return result;
    }

    /**
     * Login and store the JWT token.
     */
    async login(email, password) {
        const result = await this._request('POST', '/api/auth/login', { email, password });
        if (result.accessToken) {
            this.setAccessToken(result.accessToken);
        }
        return result;
    }

    /**
     * Refresh the access token using a refresh token.
     */
    async refreshToken(refreshToken) {
        const result = await this._request('POST', '/api/auth/refresh', { refreshToken });
        if (result.accessToken) {
            this.setAccessToken(result.accessToken);
        }
        return result;
    }

    // ========================================================================
    // Health & Status
    // ========================================================================

    async healthCheck() {
        return this._request('GET', '/health');
    }

    /**
     * Get formatted system status for HomeScreen.
     * Calls /health and transforms the response into component statuses.
     */
    async getSystemStatus() {
        const health = await this._request('GET', '/health');
        return {
            bioExtractor: {
                name: 'Bio-Extractor',
                status: health.server === 'healthy' ? 'ready' : 'error',
                detail: `Uptime: ${health.uptime || 0}s`,
            },
            blockchain: {
                name: 'Blockchain',
                status: health.blockchain?.status === 'connected' ? 'ready' : 'error',
                detail: health.blockchain?.block ? `Block #${health.blockchain.block}` : 'Unavailable',
            },
            ipfsNode: {
                name: 'IPFS Node',
                status: typeof health.ipfs === 'object' && health.ipfs.status === 'connected' ? 'ready' : 'error',
                detail: health.ipfs?.version ? `Kubo ${health.ipfs.version}` : 'Unavailable',
            },
            zkpEngine: {
                name: 'ZKP Engine',
                status: health.server === 'healthy' ? 'ready' : 'error',
                detail: 'Groth16/snarkjs',
            },
        };
    }

    /** Get wallet status (address, balance, chain — never returns private key). */
    async walletStatus() {
        return this._request('GET', '/api/web3/wallet/status');
    }

    /** Get deployed contract addresses and connection status. */
    async contractsStatus() {
        return this._request('GET', '/api/web3/contracts');
    }

    // ========================================================================
    // Blockchain (via backend-mediated server wallet)
    // ========================================================================

    /**
     * Anchor media to Polygon blockchain via the backend server wallet.
     */
    async anchorMedia(params) {
        return this._request('POST', '/api/web3/anchor', params);
    }

    /**
     * Verify if a media hash exists on-chain and check its status.
     */
    async verifyMedia(mediaHash) {
        return this._request('GET', `/api/web3/verify/${encodeURIComponent(mediaHash)}`);
    }

    /**
     * Get the full on-chain record for an anchored media hash.
     */
    async getMediaRecord(mediaHash) {
        return this._request('GET', `/api/web3/record/${encodeURIComponent(mediaHash)}`);
    }

    /**
     * Dispute a media record on-chain.
     */
    async disputeMedia(mediaHash, reason) {
        return this._request('POST', '/api/web3/dispute', { mediaHash, reason });
    }

    /**
     * Mint a soulbound authenticity token.
     */
    async mintToken({ to, mediaHash, bioSignature, hardwareID, ipfsHash }) {
        return this._request('POST', '/api/web3/mint', {
            to, mediaHash, bioSignature, hardwareID, ipfsHash,
        });
    }

    /**
     * Get token info by media hash.
     */
    async getToken(mediaHash) {
        return this._request('GET', `/api/web3/token/${encodeURIComponent(mediaHash)}`);
    }

    /**
     * Get authenticity token balance for an address.
     */
    async getTokenBalance(address) {
        return this._request('GET', `/api/web3/balance/${encodeURIComponent(address)}`);
    }

    /**
     * Get disputes for a media hash.
     */
    async getDisputes(mediaHash) {
        return this._request('GET', `/api/web3/disputes/${encodeURIComponent(mediaHash)}`);
    }

    // ========================================================================
    // IPFS (via backend Kubo proxy)
    // ========================================================================

    /**
     * Upload data to IPFS via the backend Kubo node.
     */
    async uploadToIPFS(params) {
        return this._request('POST', '/api/ipfs/upload', params);
    }

    /**
     * Retrieve content from IPFS by CID.
     */
    async getFromIPFS(cid) {
        return this._request('GET', `/api/ipfs/${encodeURIComponent(cid)}`);
    }

    // ========================================================================
    // Media
    // ========================================================================

    /**
     * Process and hash a media file with biometric data.
     */
    async processMedia(formData) {
        // Uses multipart — cannot use _request helper
        const url = `${this.baseUrl}/api/media/process`;
        const headers = {};
        if (this.apiKey) {
            headers['x-api-key'] = this.apiKey;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS * 2);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            return data;
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') throw new Error('Media processing timeout');
            throw error;
        }
    }

    /**
     * Verify a media file's biometric hash.
     */
    async verifyMediaFile(params) {
        return this._request('POST', '/api/media/verify', params);
    }

    /**
     * Generate a multi-party composite signature.
     */
    async generateSignature(params) {
        return this._request('POST', '/api/media/generate-signature', params);
    }

    // ========================================================================
    // Blockchain — Additional Endpoints
    // ========================================================================

    /**
     * Revoke a media record (creator only).
     */
    async revokeMedia(mediaHash) {
        return this._request('POST', '/api/web3/revoke', { mediaHash });
    }

    /**
     * Get all media records created by an address.
     */
    async getCreatorRecords(address) {
        return this._request('GET', `/api/web3/creator/${encodeURIComponent(address)}`);
    }

    /**
     * Get all media records an address participated in (consensus).
     */
    async getParticipantRecords(address) {
        return this._request('GET', `/api/web3/participant/${encodeURIComponent(address)}`);
    }

    /**
     * Check if an address gave consent for a specific media hash.
     */
    async getConsent(mediaHash, address) {
        return this._request('GET', `/api/web3/consent/${encodeURIComponent(mediaHash)}/${encodeURIComponent(address)}`);
    }

    // ========================================================================
    // IPFS — Additional Endpoints
    // ========================================================================

    /**
     * Pin an existing CID on the local IPFS node.
     */
    async pinOnIPFS(cid) {
        return this._request('POST', '/api/ipfs/pin', { cid });
    }

    // ========================================================================
    // ZKP
    // ========================================================================

    /**
     * Generate a ZK proof for bio-signature mismatch (exoneration).
     */
    async exonerateProof(params) {
        return this._request('POST', '/api/zkp/exonerate', params);
    }

    /**
     * Get ZKP circuit compilation status.
     */
    async zkpStatus() {
        return this._request('GET', '/api/zkp/status');
    }

    /**
     * Generate a ZK proof on the backend.
     * @param {Object} inputs - Circuit-specific inputs
     * @param {string} circuitType - 'verify' or 'bio_match'
     */
    async generateProof(inputs, circuitType = 'bio_match') {
        return this._request('POST', '/api/zkp/generate', { ...inputs, circuitType });
    }

    /**
     * Verify a ZK proof on the backend.
     */
    async verifyProof(proof, publicSignals, circuitType = 'verify') {
        return this._request('POST', '/api/zkp/verify', { proof, publicSignals, circuitType });
    }

    // ========================================================================
    // Standalone Fallback Helpers
    // ========================================================================

    /**
     * Check if backend server is reachable (cached for 30s).
     */
    async isBackendReachable() {
        const now = Date.now();
        if (this._backendReachable !== null && now - this._lastBackendCheck < 30000) {
            return this._backendReachable;
        }
        try {
            await this.healthCheck();
            this._backendReachable = true;
        } catch (_) {
            this._backendReachable = false;
        }
        this._lastBackendCheck = now;
        return this._backendReachable;
    }

    /** Reset backend reachability cache (call after network change). */
    resetBackendCache() {
        this._backendReachable = null;
        this._lastBackendCheck = 0;
    }

    /**
     * Smart verify: tries backend first, falls back to direct blockchain.
     */
    async smartVerifyMedia(mediaHash) {
        try {
            if (await this.isBackendReachable()) {
                return await this.verifyMedia(mediaHash);
            }
        } catch (_) {}
        // Fallback: direct on-chain
        console.log('[ApiService] Standalone fallback: verifyMedia via direct RPC');
        return await blockchainService.verifyMedia(mediaHash);
    }

    /**
     * Smart getMediaRecord: tries backend first, falls back to direct blockchain.
     */
    async smartGetMediaRecord(mediaHash) {
        try {
            if (await this.isBackendReachable()) {
                return await this.getMediaRecord(mediaHash);
            }
        } catch (_) {}
        console.log('[ApiService] Standalone fallback: getMediaRecord via direct RPC');
        return await blockchainService.getMediaRecord(mediaHash);
    }

    /**
     * Smart anchor: tries backend first, falls back to in-app wallet.
     */
    async smartAnchorMedia(params) {
        try {
            if (await this.isBackendReachable()) {
                return await this.anchorMedia(params);
            }
        } catch (_) {}
        console.log('[ApiService] Standalone fallback: anchorMedia via in-app wallet');
        return await blockchainService.anchorMedia(params);
    }

    /**
     * Smart IPFS upload: tries backend first, falls back to Pinata.
     */
    async smartUploadToIPFS(params) {
        try {
            if (await this.isBackendReachable()) {
                return await this.uploadToIPFS(params);
            }
        } catch (_) {}
        console.log('[ApiService] Standalone fallback: IPFS upload via Pinata');
        // Convert params to IPFSService format
        const jsonData = params.metadata || params.data || params;
        return await ipfsService.uploadJSON(jsonData, params.filename || 'biovault-data');
    }

    /**
     * Smart IPFS retrieve: tries backend first, falls back to public gateways.
     */
    async smartGetFromIPFS(cid) {
        try {
            if (await this.isBackendReachable()) {
                return await this.getFromIPFS(cid);
            }
        } catch (_) {}
        console.log('[ApiService] Standalone fallback: IPFS retrieve via gateways');
        return await ipfsService.retrieveJSON(cid);
    }

    /**
     * Smart health check: returns backend status or standalone status.
     */
    async smartHealthCheck() {
        try {
            const health = await this.healthCheck();
            return { ...health, mode: 'server' };
        } catch (_) {
            // Check if blockchain is reachable directly
            const chainOk = await blockchainService.isAvailable();
            return {
                server: chainOk ? 'standalone' : 'offline',
                mode: 'standalone',
                blockchain: { status: chainOk ? 'connected' : 'disconnected' },
            };
        }
    }

    /**
     * Smart contracts status: backend or direct chain info.
     */
    async smartContractsStatus() {
        try {
            if (await this.isBackendReachable()) {
                return await this.contractsStatus();
            }
        } catch (_) {}
        // Direct blockchain info
        const info = blockchainService.getNetworkInfo();
        const chainOk = await blockchainService.isAvailable();
        return {
            mediaAnchor: {
                address: info.mediaAnchorAddress,
                connected: chainOk,
            },
            authenticityToken: {
                address: info.authTokenAddress,
                connected: chainOk,
            },
            network: info.name,
            mode: 'standalone',
        };
    }

    /**
     * Smart wallet status: backend server wallet or in-app wallet.
     */
    async smartWalletStatus() {
        try {
            if (await this.isBackendReachable()) {
                return await this.walletStatus();
            }
        } catch (_) {}
        // In-app wallet
        const addr = blockchainService.getAddress();
        if (!addr) return { address: null, balance: '0', mode: 'standalone', hasWallet: false };
        const balance = await blockchainService.getBalance();
        return {
            address: addr,
            balance,
            chain: 'Polygon Amoy',
            mode: 'standalone',
            hasWallet: true,
        };
    }
}

// Singleton instance
const apiService = new ApiService();

export default apiService;
export { ApiService };
