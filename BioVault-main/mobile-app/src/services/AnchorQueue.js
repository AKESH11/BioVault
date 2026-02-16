/**
 * Offline Anchor Queue
 *
 * Persists failed blockchain anchor requests to AsyncStorage and retries
 * them automatically when the backend becomes reachable again.
 *
 * Usage:
 *   import anchorQueue from '../services/AnchorQueue';
 *
 *   // Enqueue a failed anchor
 *   await anchorQueue.enqueue(anchorPayload);
 *
 *   // Process pending anchors (call on app foreground / connectivity change)
 *   await anchorQueue.processQueue();
 *
 *   // Get count of pending items
 *   const count = await anchorQueue.getPendingCount();
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from './ApiService';
import blockchainService from './BlockchainService';

const QUEUE_KEY = 'biovault_pending_anchors';
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

class AnchorQueue {
  constructor() {
    this._processing = false;
  }

  /**
   * Add a failed anchor request to the persistent queue.
   * @param {object} payload - The anchorMedia payload
   * @param {object} [meta] - Optional metadata (bpm, confidence, etc.) for UI display
   */
  async enqueue(payload, meta = {}) {
    const queue = await this._load();
    queue.push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      payload,
      meta: {
        ...meta,
        enqueuedAt: Date.now(),
      },
      retries: 0,
      lastAttempt: null,
      status: 'pending', // pending | processing | failed
    });
    await this._save(queue);
    console.log(`[AnchorQueue] Enqueued anchor (${queue.length} in queue)`);
    return queue.length;
  }

  /**
   * Get all pending items (for UI display).
   */
  async getPending() {
    const queue = await this._load();
    return queue.filter(item => item.status !== 'failed');
  }

  /**
   * Get count of pending items.
   */
  async getPendingCount() {
    const queue = await this._load();
    return queue.filter(item => item.status !== 'failed').length;
  }

  /**
   * Process all queued anchors sequentially.
   * Call this on app foreground, connectivity change, or after a successful anchor.
   * @returns {{ succeeded: number, failed: number, remaining: number }}
   */
  async processQueue() {
    if (this._processing) {
      console.log('[AnchorQueue] Already processing, skipping');
      return { succeeded: 0, failed: 0, remaining: await this.getPendingCount() };
    }

    this._processing = true;
    let succeeded = 0;
    let failed = 0;

    try {
      // Check if backend OR direct blockchain is available
      const backendOk = await this._checkBackend();
      const chainOk = !backendOk ? await blockchainService.isAvailable() : false;
      if (!backendOk && !chainOk) {
        console.log('[AnchorQueue] Both backend and blockchain offline, skipping');
        return { succeeded: 0, failed: 0, remaining: await this.getPendingCount() };
      }

      const queue = await this._load();
      const remaining = [];

      for (const item of queue) {
        if (item.status === 'failed') {
          // Keep permanently failed items for user review
          remaining.push(item);
          continue;
        }

        item.status = 'processing';
        item.lastAttempt = Date.now();
        item.retries += 1;

        try {
          console.log(`[AnchorQueue] Retrying anchor ${item.id} (attempt ${item.retries})`);
          // Smart: tries backend first, falls back to in-app wallet
          const result = await apiService.smartAnchorMedia(item.payload);

          // Success — save to "my media" list
          await this._saveAnchorResult(item, result);
          succeeded++;
          console.log(`[AnchorQueue] Anchor ${item.id} succeeded: tx=${result.transactionHash}`);
          // Don't add to remaining — it's done

        } catch (err) {
          // "Media already anchored" means it succeeded in a prior attempt — treat as success
          if (err.message && err.message.includes('already anchored')) {
            console.log(`[AnchorQueue] Anchor ${item.id} already on-chain, removing from queue`);
            succeeded++;
            // Don't add to remaining — it's done
            continue;
          }

          console.warn(`[AnchorQueue] Anchor ${item.id} failed: ${err.message}`);

          if (item.retries >= MAX_RETRIES) {
            item.status = 'failed';
            remaining.push(item);
            failed++;
          } else {
            item.status = 'pending';
            remaining.push(item);
            // Wait before next attempt
            await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
          }
        }
      }

      await this._save(remaining);
      console.log(`[AnchorQueue] Done: ${succeeded} succeeded, ${failed} permanently failed, ${remaining.length} remaining`);

    } finally {
      this._processing = false;
    }

    return { succeeded, failed, remaining: await this.getPendingCount() };
  }

  /**
   * Remove a specific item from the queue (user dismissed it).
   */
  async remove(id) {
    const queue = await this._load();
    const filtered = queue.filter(item => item.id !== id);
    await this._save(filtered);
    return filtered.length;
  }

  /**
   * Clear entire queue.
   */
  async clear() {
    await AsyncStorage.removeItem(QUEUE_KEY);
  }

  // ── Internal ──────────────────────────────────────────────

  async _load() {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async _save(queue) {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  }

  async _checkBackend() {
    try {
      await apiService.healthCheck();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * After a successful queued anchor, save to "my media" list.
   */
  async _saveAnchorResult(item, result) {
    try {
      const existing = await AsyncStorage.getItem('biovault_anchored_media');
      const mediaList = existing ? JSON.parse(existing) : [];
      mediaList.unshift({
        mediaHash: item.payload.mediaHash,
        txHash: result.transactionHash,
        blockNumber: result.blockNumber,
        ipfsCID: item.payload.ipfsHash || '',
        bpm: item.meta.bpm || 0,
        confidence: item.meta.confidence || 0,
        timestamp: Date.now(),
        facesDetected: item.payload.detectedFaces || 0,
        fromQueue: true, // Flag that this was retried from offline queue
      });
      await AsyncStorage.setItem('biovault_anchored_media', JSON.stringify(mediaList));
    } catch (err) {
      console.warn('[AnchorQueue] Failed to save result to media list:', err.message);
    }
  }
}

export default new AnchorQueue();
