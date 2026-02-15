/**
 * Server-side Wallet Manager
 * 
 * Manages the backend's Ethereum wallet for signing transactions.
 * Handles nonce management, gas estimation, balance monitoring, and
 * automatic retry with nonce recovery.
 * 
 * SECURITY: Private key is loaded via the Key Provider abstraction
 *           (env, encrypted-file, or AWS KMS) and NEVER exposed via API.
 */

const { ethers, NonceManager } = require('ethers');
const logger = require('./logger');
const { keyProvider } = require('./keyProvider');

class WalletManager {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this._address = null;         // cached address for sync access
        this.chainId = null;
        this._pendingNonce = null;     // optimistic nonce tracking
        this._nonceLock = false;       // simple mutex for nonce
        this._initialized = false;
    }

    /**
     * Initialize provider + wallet from environment variables
     */
    async initialize() {
        const rpcUrl = process.env.POLYGON_RPC_URL || 'https://rpc-amoy.polygon.technology';

        this.provider = new ethers.JsonRpcProvider(rpcUrl);

        // Verify provider connectivity
        try {
            const network = await this.provider.getNetwork();
            this.chainId = Number(network.chainId);
            logger.info(`Connected to chain ${this.chainId} via ${rpcUrl}`);
        } catch (err) {
            logger.error('Failed to connect to RPC provider:', err.message);
            throw err;
        }

        // Load wallet via Key Provider abstraction
        let privateKey;
        try {
            privateKey = await keyProvider.getPrivateKey();
        } catch (err) {
            logger.warn(`Key provider error: ${err.message} — wallet disabled (read-only mode)`);
            this._initialized = true;
            return this;
        }

        if (!privateKey) {
            logger.warn('No private key available — wallet disabled (read-only mode)');
            this._initialized = true;
            return this;
        }

        try {
            const rawWallet = new ethers.Wallet(privateKey, this.provider);
            // Wrap with NonceManager to prevent nonce collisions on rapid sequential txs
            this.wallet = new NonceManager(rawWallet);
            this._address = rawWallet.address;  // cache for sync access
            const balance = await this.provider.getBalance(this._address);
            logger.info(`Wallet loaded: ${this._address}`);
            logger.info(`Balance: ${ethers.formatEther(balance)} POL`);

            if (balance === 0n) {
                logger.warn('Wallet balance is 0 — fund via https://faucet.polygon.technology/');
            }

            this._pendingNonce = await this.provider.getTransactionCount(this._address, 'pending');
            this._initialized = true;
        } catch (err) {
            logger.error('Wallet initialization failed:', err.message);
            throw err;
        }

        return this;
    }

    /**
     * Check if a wallet is configured and available
     */
    get isAvailable() {
        return this._initialized && this.wallet !== null;
    }

    /**
     * Get the wallet address (safe to expose)
     */
    get address() {
        return this._address || null;
    }

    /**
     * Get current wallet balance in ETH/POL
     */
    async getBalance() {
        if (!this.wallet) return { balance: '0', formatted: '0 POL' };

        const balance = await this.provider.getBalance(this._address);
        return {
            balance: balance.toString(),
            formatted: `${ethers.formatEther(balance)} POL`,
            sufficient: balance > ethers.parseEther('0.01')      // min ~0.01 for a few txs
        };
    }

    /**
     * Get current nonce (pending) with optimistic tracking
     */
    async getNonce() {
        const chainNonce = await this.provider.getTransactionCount(this._address, 'pending');
        // Use the higher of tracked vs chain nonce
        if (this._pendingNonce !== null && this._pendingNonce > chainNonce) {
            return this._pendingNonce;
        }
        this._pendingNonce = chainNonce;
        return chainNonce;
    }

    /**
     * Acquire a nonce for a new transaction (simple mutex)
     */
    async acquireNonce() {
        // Spin-wait for lock (max 5 seconds)
        const start = Date.now();
        while (this._nonceLock) {
            if (Date.now() - start > 5000) throw new Error('Nonce lock timeout');
            await new Promise(r => setTimeout(r, 50));
        }
        this._nonceLock = true;

        try {
            const nonce = await this.getNonce();
            this._pendingNonce = nonce + 1;
            return nonce;
        } finally {
            this._nonceLock = false;
        }
    }

    /**
     * Reset nonce tracking (call after a failed transaction)
     */
    async resetNonce() {
        this._pendingNonce = await this.provider.getTransactionCount(
            this._address, 'pending'
        );
        logger.info(`Nonce reset to ${this._pendingNonce}`);
    }

    /**
     * Estimate gas for a transaction with a safety margin
     * @param {object} txRequest - ethers TransactionRequest
     * @param {number} marginPercent - extra gas margin (default 20%)
     */
    async estimateGas(txRequest, marginPercent = 20) {
        const estimate = await this.provider.estimateGas(txRequest);
        const withMargin = estimate * BigInt(100 + marginPercent) / 100n;
        return withMargin;
    }

    /**
     * Get current gas price with configurable strategy
     * @param {'slow'|'standard'|'fast'} speed
     */
    async getGasPrice(speed = 'standard') {
        const feeData = await this.provider.getFeeData();

        const multipliers = { slow: 80n, standard: 100n, fast: 150n };
        const mult = multipliers[speed] || 100n;

        if (feeData.maxFeePerGas) {
            // EIP-1559
            return {
                maxFeePerGas: feeData.maxFeePerGas * mult / 100n,
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas * mult / 100n
            };
        }

        // Legacy
        return {
            gasPrice: (feeData.gasPrice || ethers.parseUnits('35', 'gwei')) * mult / 100n
        };
    }

    /**
     * Send a transaction with automatic nonce management and retry
     * @param {ethers.Contract} contract - The contract instance
     * @param {string} method - The method name
     * @param {Array} args - Arguments for the method
     * @param {object} [overrides] - Optional tx overrides
     * @returns {Promise<ethers.TransactionReceipt>}
     */
    async sendTransaction(contract, method, args = [], overrides = {}) {
        if (!this.isAvailable) {
            throw new Error('Wallet not available — set DEPLOYER_PRIVATE_KEY');
        }

        const nonce = await this.acquireNonce();
        const gasData = await this.getGasPrice('standard');

        const txOverrides = {
            nonce,
            ...gasData,
            ...overrides
        };

        logger.info(`Sending ${method}() nonce=${nonce}`);

        try {
            const tx = await contract[method](...args, txOverrides);
            logger.info(`TX submitted: ${tx.hash}`);

            const receipt = await tx.wait();
            logger.info(`TX confirmed: ${receipt.hash} block=${receipt.blockNumber} gas=${receipt.gasUsed}`);

            return receipt;
        } catch (err) {
            // If nonce error, reset and retry once
            if (err.message?.includes('nonce') || err.code === 'NONCE_EXPIRED') {
                logger.warn('Nonce collision — resetting and retrying…');
                await this.resetNonce();

                const retryNonce = await this.acquireNonce();
                const tx = await contract[method](...args, { ...txOverrides, nonce: retryNonce });
                const receipt = await tx.wait();
                logger.info(`TX confirmed (retry): ${receipt.hash}`);
                return receipt;
            }

            logger.error(`TX failed (${method}):`, err.message);
            throw err;
        }
    }

    /**
     * Create a contract instance connected to the server wallet
     * @param {string} address - Contract address
     * @param {Array} abi - Contract ABI
     * @returns {ethers.Contract}
     */
    getContract(address, abi) {
        const signer = this.wallet || this.provider;
        return new ethers.Contract(address, abi, signer);
    }

    /**
     * Get wallet status (safe info only — never exposes private key)
     */
    async getStatus() {
        if (!this._initialized) {
            return { status: 'not_initialized' };
        }

        if (!this.wallet) {
            return { status: 'read_only', message: 'No private key configured' };
        }

        const balance = await this.getBalance();
        const nonce = await this.getNonce();

        return {
            status: 'active',
            address: this._address,
            chainId: this.chainId,
            balance: balance.formatted,
            balanceSufficient: balance.sufficient,
            pendingNonce: nonce,
            network: this.chainId === 80002 ? 'Polygon Amoy' :
                     this.chainId === 137 ? 'Polygon Mainnet' :
                     this.chainId === 31337 ? 'Hardhat Local' :
                     `Chain ${this.chainId}`
        };
    }
}

// Singleton instance
const walletManager = new WalletManager();

module.exports = walletManager;
