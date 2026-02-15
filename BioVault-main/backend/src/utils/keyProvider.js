/**
 * Key Management Service (KMS) Abstraction
 *
 * Provides a pluggable interface for private key management.
 * Supported providers:
 *
 *   1. env       — Raw key from environment variable (dev only)
 *   2. encrypted — AES-256-GCM encrypted key file on disk
 *   3. aws-kms   — AWS KMS envelope encryption (production)
 *
 * Selection:  KEY_PROVIDER=env|encrypted|aws-kms   in .env
 *
 * SECURITY: Private keys are NEVER logged or exposed via API.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// ============================================================================
// Base Provider Interface
// ============================================================================

class KeyProvider {
    /** @returns {Promise<string>} hex-encoded private key */
    async getPrivateKey() { throw new Error('Not implemented'); }

    /** @returns {Promise<string>} human-readable status (never the key!) */
    async getStatus() { return 'unknown'; }
}

// ============================================================================
// 1. Environment Variable Provider (development only)
// ============================================================================

class EnvKeyProvider extends KeyProvider {
    constructor(envVar = 'DEPLOYER_PRIVATE_KEY') {
        super();
        this.envVar = envVar;
    }

    async getPrivateKey() {
        const key = process.env[this.envVar];
        if (!key) throw new Error(`${this.envVar} not set in environment`);
        return key;
    }

    async getStatus() {
        return process.env[this.envVar] ? 'env-var loaded' : 'env-var missing';
    }
}

// ============================================================================
// 2. Encrypted File Provider (AES-256-GCM)
// ============================================================================

const ENCRYPTED_KEY_DIR = path.join(__dirname, '../../data');
const ENCRYPTED_KEY_FILE = path.join(ENCRYPTED_KEY_DIR, 'wallet.key.enc');
const KEY_DERIVATION_ROUNDS = 100000;

class EncryptedFileKeyProvider extends KeyProvider {
    /**
     * @param {string} passphrase - From WALLET_PASSPHRASE env var
     */
    constructor(passphrase) {
        super();
        if (!passphrase) throw new Error('WALLET_PASSPHRASE env var required for encrypted provider');
        this.passphrase = passphrase;
    }

    /**
     * Encrypt and save a private key to disk
     * @param {string} privateKey - hex-encoded key
     */
    async saveKey(privateKey) {
        if (!fs.existsSync(ENCRYPTED_KEY_DIR)) {
            fs.mkdirSync(ENCRYPTED_KEY_DIR, { recursive: true });
        }

        const salt = crypto.randomBytes(32);
        const iv = crypto.randomBytes(16);
        const derivedKey = crypto.pbkdf2Sync(this.passphrase, salt, KEY_DERIVATION_ROUNDS, 32, 'sha512');

        const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
        let encrypted = cipher.update(privateKey, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        const payload = {
            version: 1,
            kdf: 'pbkdf2-sha512',
            rounds: KEY_DERIVATION_ROUNDS,
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            ciphertext: encrypted,
        };

        fs.writeFileSync(ENCRYPTED_KEY_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
        logger.info('Wallet key encrypted and saved to disk');
    }

    async getPrivateKey() {
        if (!fs.existsSync(ENCRYPTED_KEY_FILE)) {
            throw new Error(`Encrypted key file not found: ${ENCRYPTED_KEY_FILE}`);
        }

        const raw = JSON.parse(fs.readFileSync(ENCRYPTED_KEY_FILE, 'utf-8'));

        if (raw.version !== 1) throw new Error('Unsupported encrypted key version');

        const salt = Buffer.from(raw.salt, 'hex');
        const iv = Buffer.from(raw.iv, 'hex');
        const authTag = Buffer.from(raw.authTag, 'hex');
        const derivedKey = crypto.pbkdf2Sync(this.passphrase, salt, raw.rounds, 32, 'sha512');

        const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(raw.ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }

    async getStatus() {
        if (!fs.existsSync(ENCRYPTED_KEY_FILE)) return 'encrypted-file missing';
        return 'encrypted-file loaded';
    }
}

// ============================================================================
// 3. AWS KMS Provider (stub — ready for production wiring)
// ============================================================================

class AwsKmsKeyProvider extends KeyProvider {
    /**
     * @param {string} keyId - AWS KMS key ID or ARN
     * @param {string} region - AWS region
     */
    constructor(keyId, region = 'us-east-1') {
        super();
        this.keyId = keyId;
        this.region = region;
        // In production: instantiate AWS SDK KMS client here
        // const { KMSClient } = require('@aws-sdk/client-kms');
        // this.kmsClient = new KMSClient({ region });
    }

    async getPrivateKey() {
        // Production: decrypt the envelope-encrypted key via KMS
        //
        // const { DecryptCommand } = require('@aws-sdk/client-kms');
        // const encryptedBlob = fs.readFileSync(path.join(ENCRYPTED_KEY_DIR, 'wallet.key.kms'));
        // const result = await this.kmsClient.send(new DecryptCommand({
        //     CiphertextBlob: encryptedBlob,
        //     KeyId: this.keyId,
        // }));
        // return Buffer.from(result.Plaintext).toString('utf8');
        //
        throw new Error('AWS KMS provider not yet configured — install @aws-sdk/client-kms and configure KMS_KEY_ID');
    }

    async getStatus() {
        return `aws-kms (key: ${this.keyId?.substring(0, 8)}…)`;
    }
}

// ============================================================================
// Factory — select provider from environment
// ============================================================================

/**
 * Create the appropriate KeyProvider based on KEY_PROVIDER env var.
 *
 * KEY_PROVIDER=env          → EnvKeyProvider (default, dev)
 * KEY_PROVIDER=encrypted    → EncryptedFileKeyProvider (requires WALLET_PASSPHRASE)
 * KEY_PROVIDER=aws-kms      → AwsKmsKeyProvider (requires KMS_KEY_ID, AWS_REGION)
 */
function createKeyProvider() {
    const provider = (process.env.KEY_PROVIDER || 'env').toLowerCase();

    switch (provider) {
        case 'env':
            logger.info('Key provider: environment variable');
            return new EnvKeyProvider();

        case 'encrypted': {
            const passphrase = process.env.WALLET_PASSPHRASE;
            if (!passphrase) {
                logger.error('KEY_PROVIDER=encrypted but WALLET_PASSPHRASE not set');
                throw new Error('WALLET_PASSPHRASE required for encrypted key provider');
            }
            logger.info('Key provider: encrypted file');
            return new EncryptedFileKeyProvider(passphrase);
        }

        case 'aws-kms': {
            const keyId = process.env.KMS_KEY_ID;
            const region = process.env.AWS_REGION || 'us-east-1';
            if (!keyId) {
                logger.error('KEY_PROVIDER=aws-kms but KMS_KEY_ID not set');
                throw new Error('KMS_KEY_ID required for AWS KMS key provider');
            }
            logger.info(`Key provider: AWS KMS (${region})`);
            return new AwsKmsKeyProvider(keyId, region);
        }

        default:
            throw new Error(`Unknown KEY_PROVIDER: ${provider}. Use: env, encrypted, or aws-kms`);
    }
}

// Singleton
const keyProvider = createKeyProvider();

module.exports = {
    keyProvider,
    createKeyProvider,
    EnvKeyProvider,
    EncryptedFileKeyProvider,
    AwsKmsKeyProvider,
};
