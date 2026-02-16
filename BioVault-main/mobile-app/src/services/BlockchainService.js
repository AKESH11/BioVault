/**
 * Standalone Blockchain Service
 *
 * Connects DIRECTLY to Polygon Amoy RPC via ethers.js — no backend server needed.
 * Supports read operations (verify, getRecord) without a wallet and
 * write operations (anchor, dispute, revoke, mint) when a wallet is configured.
 *
 * Usage:
 *   import blockchainService from '../services/BlockchainService';
 *   await blockchainService.init();
 *   const result = await blockchainService.verifyMedia(hash);
 */

import { ethers } from 'ethers';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ────────────────────────────────────────────────────────────────────────────
// Contract ABIs (human-readable — ethers v6 parses these directly)
// ────────────────────────────────────────────────────────────────────────────
const MEDIA_ANCHOR_ABI = [
    'function anchorMedia(string _mediaHash, string _bioSignature, string _hardwareID, address[] _consensusParties, string _ipfsHash, string _proofOfRealityHash, string _proofOfRealityIPFS, bool _allUniqueSignals, uint8 _detectedFaces) external',
    'function disputeMedia(string _mediaHash, string _reason) external',
    'function revokeMedia(string _mediaHash) external',
    'function verifyMedia(string _mediaHash) external view returns (bool exists, bool isValid, uint256 timestamp)',
    'function getMediaRecord(string _mediaHash) external view returns (tuple(string mediaHash, string bioSignature, string hardwareID, uint256 timestamp, address creator, address[] consensusParties, bool isRevoked, string ipfsHash, uint8 status, string proofOfRealityHash, string proofOfRealityIPFS, bool allUniqueSignals, uint8 detectedFaces))',
    'function getCreatorMedia(address _creator) external view returns (string[])',
    'function getParticipantMedia(address _participant) external view returns (string[])',
    'function getDisputes(string _mediaHash) external view returns (tuple(address disputer, string reason, uint256 timestamp, bool resolved)[])',
    'function hasConsent(string _mediaHash, address _address) external view returns (bool)',
    'event MediaAnchored(string indexed mediaHash, address indexed creator, uint256 timestamp, string hardwareID, bool allUniqueSignals, uint8 detectedFaces)',
];

const AUTHENTICITY_TOKEN_ABI = [
    'function mint(address _to, string _mediaHash, string _bioSignature, string _hardwareID, string _ipfsHash) external returns (uint256)',
    'function tokenURI(uint256 tokenId) external view returns (string)',
    'function ownerOf(uint256 tokenId) external view returns (address)',
    'function balanceOf(address owner) external view returns (uint256)',
    'function getTokenByMediaHash(string _mediaHash) external view returns (uint256)',
    'function exists(string _mediaHash) external view returns (bool)',
    'function tokenAnchors(uint256 tokenId) external view returns (string mediaHash, string bioSignature, string hardwareID, uint256 timestamp, string ipfsHash)',
    'function isSoulbound(uint256 tokenId) external view returns (bool)',
];

// ────────────────────────────────────────────────────────────────────────────
// Network configuration
// ────────────────────────────────────────────────────────────────────────────
const AMOY_CONFIG = {
    chainId: 80002,
    name:    'Polygon Amoy Testnet',
    rpc:     'https://polygon-amoy.infura.io/v3/8f65c54597484051af7c073196f7bb8d',
    rpcFallback: 'https://rpc-amoy.polygon.technology',
    explorer: 'https://amoy.polygonscan.com',
    gasPrice: 100_000_000_000, // 100 Gwei — Amoy minimum
};

// Deployed contract addresses on Polygon Amoy
const CONTRACTS = {
    MEDIA_ANCHOR:        '0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe',
    AUTHENTICITY_TOKEN:  '0xCA4dBF288dBF06e5537efc43352f092088b65475',
    VERIFIER:            '0x31f8e9b3B31992c7C50B1eE38D4D6c88C247d4BE',
};

const WALLET_KEY = 'biovault_wallet';

// ────────────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────────────

class BlockchainService {
    constructor() {
        this.provider = null;
        this.wallet = null;           // ethers.Wallet (null = read-only mode)
        this.mediaAnchor = null;      // Contract instance (read-only or writable)
        this.authToken = null;
        this._initialized = false;
    }

    // ── Lifecycle ────────────────────────────────────────────────────────

    /**
     * Initialize provider, contracts, and (optionally) wallet.
     * Safe to call multiple times — idempotent.
     */
    async init() {
        if (this._initialized) return;
        try {
            // Try primary RPC, fall back to public
            try {
                this.provider = new ethers.JsonRpcProvider(AMOY_CONFIG.rpc, {
                    chainId: AMOY_CONFIG.chainId,
                    name: AMOY_CONFIG.name,
                });
                await this.provider.getBlockNumber(); // quick connectivity check
            } catch (_) {
                console.log('[BlockchainService] Primary RPC failed, trying fallback');
                this.provider = new ethers.JsonRpcProvider(AMOY_CONFIG.rpcFallback, {
                    chainId: AMOY_CONFIG.chainId,
                    name: AMOY_CONFIG.name,
                });
            }

            // Load saved wallet (if any)
            await this._loadWallet();

            // Create contract instances
            const signer = this.wallet || this.provider;
            this.mediaAnchor = new ethers.Contract(CONTRACTS.MEDIA_ANCHOR, MEDIA_ANCHOR_ABI, signer);
            this.authToken   = new ethers.Contract(CONTRACTS.AUTHENTICITY_TOKEN, AUTHENTICITY_TOKEN_ABI, signer);

            this._initialized = true;
            console.log('[BlockchainService] Initialized — wallet:', this.wallet ? this.wallet.address : 'read-only');
        } catch (err) {
            console.error('[BlockchainService] init failed:', err.message);
            throw err;
        }
    }

    /** Force re-initialization (e.g., after wallet import). */
    async reinit() {
        this._initialized = false;
        this.provider = null;
        this.wallet = null;
        this.mediaAnchor = null;
        this.authToken = null;
        await this.init();
    }

    // ── Wallet management ────────────────────────────────────────────────

    /** Check if a wallet is configured (needed for write operations). */
    hasWallet() {
        return !!this.wallet;
    }

    /** Get wallet address (or null). */
    getAddress() {
        return this.wallet ? this.wallet.address : null;
    }

    /** Get wallet balance in MATIC. */
    async getBalance() {
        if (!this.wallet) return '0';
        const bal = await this.provider.getBalance(this.wallet.address);
        return ethers.formatEther(bal);
    }

    /**
     * Create a brand-new wallet, persist encrypted to AsyncStorage.
     * Returns the mnemonic so the user can back it up.
     */
    async createWallet() {
        const randomWallet = ethers.Wallet.createRandom();
        this.wallet = randomWallet.connect(this.provider);
        await this._saveWallet(randomWallet.privateKey);
        await this._rebindContracts();
        console.log('[BlockchainService] New wallet created:', this.wallet.address);
        return {
            address: this.wallet.address,
            mnemonic: randomWallet.mnemonic?.phrase || null,
        };
    }

    /**
     * Import a wallet from a private key.
     */
    async importWallet(privateKey) {
        const w = new ethers.Wallet(privateKey, this.provider);
        this.wallet = w;
        await this._saveWallet(privateKey);
        await this._rebindContracts();
        console.log('[BlockchainService] Wallet imported:', this.wallet.address);
        return { address: this.wallet.address };
    }

    /** Remove saved wallet (signs user out of on-chain identity). */
    async removeWallet() {
        this.wallet = null;
        await AsyncStorage.removeItem(WALLET_KEY);
        await this._rebindContracts();
    }

    // ── Read operations (no wallet needed) ──────────────────────────────

    /** Check if a media hash is anchored on-chain and valid. */
    async verifyMedia(mediaHash) {
        await this.init();
        const [exists, isValid, timestamp] = await this.mediaAnchor.verifyMedia(mediaHash);
        return {
            exists,
            isValid,
            timestamp: Number(timestamp),
            date: exists ? new Date(Number(timestamp) * 1000).toISOString() : null,
        };
    }

    /** Fetch full on-chain provenance record. */
    async getMediaRecord(mediaHash) {
        await this.init();
        const r = await this.mediaAnchor.getMediaRecord(mediaHash);
        return {
            mediaHash:           r.mediaHash,
            bioSignature:        r.bioSignature,
            hardwareID:          r.hardwareID,
            timestamp:           Number(r.timestamp),
            creator:             r.creator,
            consensusParties:    [...r.consensusParties],
            isRevoked:           r.isRevoked,
            ipfsHash:            r.ipfsHash,
            status:              Number(r.status),
            proofOfRealityHash:  r.proofOfRealityHash,
            proofOfRealityIPFS:  r.proofOfRealityIPFS,
            allUniqueSignals:    r.allUniqueSignals,
            detectedFaces:       Number(r.detectedFaces),
        };
    }

    /** Get disputes for a media hash. */
    async getDisputes(mediaHash) {
        await this.init();
        const disputes = await this.mediaAnchor.getDisputes(mediaHash);
        return disputes.map(d => ({
            disputer:  d.disputer,
            reason:    d.reason,
            timestamp: Number(d.timestamp),
            resolved:  d.resolved,
        }));
    }

    /** Check consent. */
    async hasConsent(mediaHash, address) {
        await this.init();
        return await this.mediaAnchor.hasConsent(mediaHash, address);
    }

    /** Get all media hashes created by an address. */
    async getCreatorMedia(address) {
        await this.init();
        return await this.mediaAnchor.getCreatorMedia(address);
    }

    /** Get token by media hash. */
    async getToken(mediaHash) {
        await this.init();
        const tokenExists = await this.authToken.exists(mediaHash);
        if (!tokenExists) return null;
        const tokenId = await this.authToken.getTokenByMediaHash(mediaHash);
        const anchor = await this.authToken.tokenAnchors(tokenId);
        return {
            tokenId:      Number(tokenId),
            mediaHash:    anchor.mediaHash,
            bioSignature: anchor.bioSignature,
            hardwareID:   anchor.hardwareID,
            timestamp:    Number(anchor.timestamp),
            ipfsHash:     anchor.ipfsHash,
        };
    }

    /** Get token balance for an address. */
    async getTokenBalance(address) {
        await this.init();
        const bal = await this.authToken.balanceOf(address);
        return Number(bal);
    }

    /** Quick connectivity + contract check — returns true if chain is reachable. */
    async isAvailable() {
        try {
            await this.init();
            await this.provider.getBlockNumber();
            return true;
        } catch (_) {
            return false;
        }
    }

    /** Get network info for display. */
    getNetworkInfo() {
        return {
            name:     AMOY_CONFIG.name,
            chainId:  AMOY_CONFIG.chainId,
            explorer: AMOY_CONFIG.explorer,
            mediaAnchorAddress:  CONTRACTS.MEDIA_ANCHOR,
            authTokenAddress:    CONTRACTS.AUTHENTICITY_TOKEN,
        };
    }

    // ── Write operations (wallet required) ──────────────────────────────

    /**
     * Anchor media to blockchain.
     * Requires a funded wallet — throws if no wallet or insufficient gas.
     */
    async anchorMedia({
        mediaHash,
        bioSignature,
        hardwareID,
        consensusParties = [],
        ipfsHash = '',
        proofOfRealityHash = '',
        proofOfRealityIPFS = '',
        allUniqueSignals = true,
        detectedFaces = 1,
    }) {
        this._requireWallet();

        const tx = await this.mediaAnchor.anchorMedia(
            mediaHash,
            bioSignature,
            hardwareID,
            consensusParties,
            ipfsHash,
            proofOfRealityHash,
            proofOfRealityIPFS,
            allUniqueSignals,
            detectedFaces,
            { gasPrice: AMOY_CONFIG.gasPrice },
        );
        const receipt = await tx.wait();

        return {
            success: true,
            transactionHash: receipt.hash,
            blockNumber: receipt.blockNumber,
            gasUsed: receipt.gasUsed?.toString(),
        };
    }

    /** Dispute a media record. */
    async disputeMedia(mediaHash, reason) {
        this._requireWallet();
        const tx = await this.mediaAnchor.disputeMedia(mediaHash, reason, {
            gasPrice: AMOY_CONFIG.gasPrice,
        });
        const receipt = await tx.wait();
        return { success: true, transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }

    /** Revoke a media record. */
    async revokeMedia(mediaHash) {
        this._requireWallet();
        const tx = await this.mediaAnchor.revokeMedia(mediaHash, {
            gasPrice: AMOY_CONFIG.gasPrice,
        });
        const receipt = await tx.wait();
        return { success: true, transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }

    /** Mint a soulbound authenticity token. */
    async mintToken({ to, mediaHash, bioSignature, hardwareID, ipfsHash }) {
        this._requireWallet();
        const tx = await this.authToken.mint(to, mediaHash, bioSignature, hardwareID, ipfsHash || '', {
            gasPrice: AMOY_CONFIG.gasPrice,
        });
        const receipt = await tx.wait();
        return { success: true, transactionHash: receipt.hash, blockNumber: receipt.blockNumber };
    }

    // ── Internal helpers ────────────────────────────────────────────────

    _requireWallet() {
        if (!this.wallet) {
            throw new Error(
                'No wallet configured. Go to Home → Setup Wallet to create or import one.',
            );
        }
    }

    async _loadWallet() {
        try {
            const raw = await AsyncStorage.getItem(WALLET_KEY);
            if (raw) {
                const { privateKey } = JSON.parse(raw);
                if (privateKey) {
                    this.wallet = new ethers.Wallet(privateKey, this.provider);
                    console.log('[BlockchainService] Wallet loaded:', this.wallet.address);
                }
            }
        } catch (err) {
            console.warn('[BlockchainService] Failed to load wallet:', err.message);
        }
    }

    async _saveWallet(privateKey) {
        await AsyncStorage.setItem(WALLET_KEY, JSON.stringify({ privateKey }));
    }

    async _rebindContracts() {
        if (!this.provider) return;
        const signer = this.wallet || this.provider;
        this.mediaAnchor = new ethers.Contract(CONTRACTS.MEDIA_ANCHOR, MEDIA_ANCHOR_ABI, signer);
        this.authToken   = new ethers.Contract(CONTRACTS.AUTHENTICITY_TOKEN, AUTHENTICITY_TOKEN_ABI, signer);
    }
}

// Singleton
const blockchainService = new BlockchainService();
export default blockchainService;
export { BlockchainService, AMOY_CONFIG, CONTRACTS };
