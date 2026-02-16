/**
 * Transaction Queue Middleware
 * 
 * Serializes blockchain transactions through a FIFO queue to prevent
 * nonce conflicts when multiple requests hit the server concurrently.
 * 
 * Uses the WalletManager's acquireNonce()/sendTransaction() methods
 * which already have mutex-based nonce tracking and retry logic.
 * 
 * Usage in routes:
 *   const { enqueue } = require('../middleware/txQueue');
 *   const receipt = await enqueue(() => contract.anchorMedia(...args));
 */

const logger = require('../utils/logger');
const walletManager = require('../utils/wallet');

// ============================================================================
// Sequential Transaction Queue
// ============================================================================

class TransactionQueue {
    constructor() {
        this._queue = [];
        this._processing = false;
        this._stats = {
            total: 0,
            success: 0,
            failed: 0,
            retried: 0,
            avgWaitMs: 0,
            avgConfirmMs: 0,
        };
    }

    /**
     * Enqueue a blockchain transaction for sequential execution.
     * Returns a promise that resolves with the tx receipt or rejects on failure.
     * 
     * @param {Function} txFn - Async function that returns a transaction response (tx with .wait())
     * @param {object} [options]
     * @param {string} [options.label] - Human label for logging (e.g. 'anchor:0xabc...')
     * @param {number} [options.maxRetries=1] - Max retry attempts on nonce errors  
     * @param {number} [options.timeoutMs=120000] - Max wait time in queue + confirmation
     * @returns {Promise<import('ethers').TransactionReceipt>}
     */
    enqueue(txFn, options = {}) {
        const { label = 'tx', maxRetries = 1, timeoutMs = 120_000 } = options;

        return new Promise((resolve, reject) => {
            const enqueueTime = Date.now();

            this._queue.push({
                txFn,
                label,
                maxRetries,
                timeoutMs,
                enqueueTime,
                resolve,
                reject,
            });

            this._stats.total++;
            logger.info(`[TxQueue] Enqueued "${label}" (queue depth: ${this._queue.length})`);

            // Kick off processing if not already running
            this._processNext();
        });
    }

    /**
     * Process queue items one at a time (FIFO).
     */
    async _processNext() {
        if (this._processing || this._queue.length === 0) return;
        this._processing = true;

        const item = this._queue.shift();
        const { txFn, label, maxRetries, timeoutMs, enqueueTime, resolve, reject } = item;
        const waitMs = Date.now() - enqueueTime;

        logger.info(`[TxQueue] Processing "${label}" (waited ${waitMs}ms, remaining: ${this._queue.length})`);

        // Timeout guard
        if (waitMs > timeoutMs) {
            this._stats.failed++;
            reject(new Error(`Transaction "${label}" timed out in queue after ${waitMs}ms`));
            this._processing = false;
            this._processNext();
            return;
        }

        let attempts = 0;
        let lastError = null;

        while (attempts <= maxRetries) {
            try {
                const startTime = Date.now();

                // Execute the transaction function
                const tx = await txFn();
                
                // Wait for confirmation
                const receipt = await tx.wait();
                
                const confirmMs = Date.now() - startTime;

                // Update stats
                this._stats.success++;
                if (attempts > 0) this._stats.retried++;
                this._updateAvg('avgWaitMs', waitMs);
                this._updateAvg('avgConfirmMs', confirmMs);

                logger.info(`[TxQueue] Confirmed "${label}" tx=${receipt.hash} gas=${receipt.gasUsed} (${confirmMs}ms)`);

                resolve(receipt);
                break;

            } catch (err) {
                lastError = err;
                attempts++;

                const isNonceError = err.message?.includes('nonce') || 
                                     err.code === 'NONCE_EXPIRED' ||
                                     err.message?.includes('replacement transaction underpriced');

                if (isNonceError && attempts <= maxRetries) {
                    logger.warn(`[TxQueue] Nonce error on "${label}" — resetting nonce and retrying (attempt ${attempts}/${maxRetries})`);
                    await walletManager.resetNonce();
                    continue;
                }

                // Non-retryable error or max retries exceeded
                this._stats.failed++;
                logger.error(`[TxQueue] Failed "${label}" after ${attempts} attempt(s): ${err.message}`);
                reject(err);
                break;
            }
        }

        this._processing = false;
        this._processNext();
    }

    /**
     * Rolling average helper
     */
    _updateAvg(key, value) {
        const count = this._stats.success + this._stats.failed;
        this._stats[key] = Math.round(
            (this._stats[key] * (count - 1) + value) / count
        );
    }

    /**
     * Get queue statistics
     */
    getStats() {
        return {
            ...this._stats,
            pendingInQueue: this._queue.length,
            isProcessing: this._processing,
        };
    }

    /**
     * Clear the queue (reject all pending items)
     */
    flush() {
        const count = this._queue.length;
        for (const item of this._queue) {
            item.reject(new Error('Transaction queue flushed'));
        }
        this._queue = [];
        logger.warn(`[TxQueue] Flushed ${count} pending transactions`);
        return count;
    }
}

// Singleton instance
const txQueue = new TransactionQueue();

/**
 * Express middleware that attaches the txQueue to req for route handlers.
 * 
 * Usage:
 *   app.use('/api/web3', txQueueMiddleware);
 *   // In route handler:
 *   const receipt = await req.txQueue.enqueue(() => contract.method(...args));
 */
function txQueueMiddleware(req, res, next) {
    req.txQueue = txQueue;
    next();
}

/**
 * Convenience: direct enqueue without Express middleware.
 * 
 * Usage:
 *   const { enqueue } = require('../middleware/txQueue');
 *   const receipt = await enqueue(() => contract.anchorMedia(...args), { label: 'anchor' });
 */
function enqueue(txFn, options) {
    return txQueue.enqueue(txFn, options);
}

module.exports = { txQueue, txQueueMiddleware, enqueue };
