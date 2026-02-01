const crypto = require('crypto');
const CryptoJS = require('crypto-js');

/**
 * Shared cryptographic utilities
 */
class CryptoUtils {
    /**
     * Generate SHA-256 hash
     */
    static sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate BLAKE3 hash (using SHA-256 as fallback for now)
     * In production, use official BLAKE3 library
     */
    static blake3(data) {
        // TODO: Integrate official BLAKE3
        return this.sha256(data);
    }

    /**
     * Generate Bio-Vault composite hash
     */
    static generateBioVaultHash(mediaData, bpm, hardwareID, timestamp) {
        const combined = `${mediaData}:${bpm}:${hardwareID}:${timestamp}`;
        return this.blake3(combined);
    }

    /**
     * AES-256 encryption
     */
    static encrypt(data, key) {
        return CryptoJS.AES.encrypt(data, key).toString();
    }

    /**
     * AES-256 decryption
     */
    static decrypt(encryptedData, key) {
        const bytes = CryptoJS.AES.decrypt(encryptedData, key);
        return bytes.toString(CryptoJS.enc.Utf8);
    }

    /**
     * Generate random salt
     */
    static generateSalt(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    /**
     * Convert to hex string
     */
    static toHex(buffer) {
        return buffer.toString('hex');
    }

    /**
     * Convert from hex string
     */
    static fromHex(hex) {
        return Buffer.from(hex, 'hex');
    }

    /**
     * Generate Ed25519 key pair (placeholder)
     */
    static generateKeyPair() {
        // In production, use libsodium or similar
        const privateKey = crypto.randomBytes(32);
        const publicKey = crypto.randomBytes(32);
        
        return {
            privateKey: privateKey.toString('hex'),
            publicKey: publicKey.toString('hex')
        };
    }
}

module.exports = CryptoUtils;
