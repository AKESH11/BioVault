const crypto = require('crypto');

/**
 * Shared cryptographic utilities for Bio-Vault Protocol.
 * Uses Node.js built-in crypto module for all operations.
 */
class CryptoUtils {
    /**
     * Generate SHA-256 hash
     */
    static sha256(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate SHA-256 based content hash.
     * C++ layer uses real BLAKE3 when available; JS layer uses SHA-256 everywhere
     * for cross-platform determinism. On-chain verification only compares hashes,
     * so consistency within a platform matters more than the specific algorithm.
     */
    static blake3(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Generate Bio-Vault composite hash
     */
    static generateBioVaultHash(mediaData, bpm, hardwareID, timestamp) {
        const combined = `${mediaData}:${bpm}:${hardwareID}:${timestamp}`;
        return this.sha256(combined);
    }

    /**
     * AES-256-GCM encryption (authenticated)
     * @param {string} plaintext - Data to encrypt
     * @param {string} key - 32-byte hex key (or derivation input)
     * @returns {string} base64-encoded ciphertext with IV and auth tag
     */
    static encrypt(plaintext, key) {
        const derivedKey = crypto.createHash('sha256').update(key).digest();
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
        let encrypted = cipher.update(plaintext, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        const authTag = cipher.getAuthTag();
        // Format: iv:authTag:ciphertext (all base64)
        return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    }

    /**
     * AES-256-GCM decryption (authenticated)
     * @param {string} encryptedData - Output from encrypt()
     * @param {string} key - Same key used for encryption
     * @returns {string} Decrypted plaintext
     */
    static decrypt(encryptedData, key) {
        const derivedKey = crypto.createHash('sha256').update(key).digest();
        const [ivB64, authTagB64, ciphertext] = encryptedData.split(':');
        const iv = Buffer.from(ivB64, 'base64');
        const authTag = Buffer.from(authTagB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
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
     * Generate Ed25519 key pair using Node.js built-in crypto.
     * @returns {{ privateKey: string, publicKey: string }} hex-encoded keys
     */
    static generateKeyPair() {
        const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
        return {
            privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex'),
            publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('hex')
        };
    }

    /**
     * Sign data with Ed25519 private key.
     * @param {string|Buffer} data - Data to sign
     * @param {string} privateKeyHex - Hex-encoded PKCS8 DER private key
     * @returns {string} Hex-encoded signature
     */
    static sign(data, privateKeyHex) {
        const privateKey = crypto.createPrivateKey({
            key: Buffer.from(privateKeyHex, 'hex'),
            format: 'der',
            type: 'pkcs8'
        });
        const signature = crypto.sign(null, Buffer.from(data), privateKey);
        return signature.toString('hex');
    }

    /**
     * Verify Ed25519 signature.
     * @param {string|Buffer} data - Original data
     * @param {string} signatureHex - Hex-encoded signature
     * @param {string} publicKeyHex - Hex-encoded SPKI DER public key
     * @returns {boolean} True if signature is valid
     */
    static verify(data, signatureHex, publicKeyHex) {
        const publicKey = crypto.createPublicKey({
            key: Buffer.from(publicKeyHex, 'hex'),
            format: 'der',
            type: 'spki'
        });
        return crypto.verify(null, Buffer.from(data), publicKey, Buffer.from(signatureHex, 'hex'));
    }

    /**
     * Generate HMAC-SHA256 for message authentication.
     * @param {string} data
     * @param {string} key
     * @returns {string} Hex-encoded HMAC
     */
    static hmac(data, key) {
        return crypto.createHmac('sha256', key).update(data).digest('hex');
    }
}

module.exports = CryptoUtils;
