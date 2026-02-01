/**
 * TypeScript-style type definitions (JSDoc for JavaScript)
 * Use these for type checking and IDE autocomplete
 */

/**
 * @typedef {Object} MediaRecord
 * @property {string} mediaHash - BLAKE3 hash of media + biometrics
 * @property {string} bioSignature - Composite biometric signature
 * @property {string} hardwareID - PRNU fingerprint
 * @property {number} timestamp - Unix timestamp
 * @property {string} creator - Ethereum address of creator
 * @property {string[]} consensusParties - Array of participant addresses
 * @property {boolean} isRevoked - Revocation status
 * @property {string} ipfsHash - IPFS CID
 * @property {number} status - Verification status (0-3)
 */

/**
 * @typedef {Object} BiometricData
 * @property {number} bpm - Beats per minute
 * @property {number} confidence - Confidence score (0-1)
 * @property {boolean} liveness - Liveness detection result
 * @property {number} timestamp - Capture timestamp
 */

/**
 * @typedef {Object} HardwareFingerprint
 * @property {string} prnuHash - PRNU pattern hash
 * @property {number} calibrationFrames - Number of frames used
 * @property {number} timestamp - Calibration timestamp
 * @property {string} deviceModel - Device model identifier
 */

/**
 * @typedef {Object} ConsensusHandshake
 * @property {string} sessionId - Unique session identifier
 * @property {string[]} participants - Array of participant IDs
 * @property {Object.<string, BiometricData>} biometrics - Biometric data per participant
 * @property {Object.<string, string>} signatures - Ed25519 signatures per participant
 * @property {number} timestamp - Handshake timestamp
 * @property {boolean} isComplete - Whether all parties signed
 */

/**
 * @typedef {Object} ZKProof
 * @property {Object} proof - The zero-knowledge proof
 * @property {string[]} publicSignals - Public inputs to the circuit
 * @property {string} circuitType - Type of circuit used
 * @property {number} timestamp - Proof generation timestamp
 */

/**
 * @typedef {Object} IPFSUploadResult
 * @property {boolean} success - Upload success status
 * @property {string} cid - IPFS content identifier
 * @property {string} url - Public IPFS gateway URL
 * @property {string} [metadataCID] - Optional metadata CID
 */

/**
 * @typedef {Object} BlockchainAnchor
 * @property {string} transactionHash - Ethereum transaction hash
 * @property {number} blockNumber - Block number
 * @property {string} mediaHash - Media hash that was anchored
 * @property {boolean} success - Transaction success status
 */

/**
 * Validation utilities
 */
class Validators {
    /**
     * @param {number} bpm
     * @returns {boolean}
     */
    static isValidBPM(bpm) {
        return bpm >= 40 && bpm <= 220;
    }

    /**
     * @param {string} hash
     * @returns {boolean}
     */
    static isValidHash(hash) {
        return /^[a-f0-9]{64}$/i.test(hash);
    }

    /**
     * @param {string} address
     * @returns {boolean}
     */
    static isValidEthereumAddress(address) {
        return /^0x[a-fA-F0-9]{40}$/.test(address);
    }

    /**
     * @param {string} cid
     * @returns {boolean}
     */
    static isValidIPFSCID(cid) {
        return /^Qm[a-zA-Z0-9]{44}$/.test(cid) || /^bafy[a-zA-Z0-9]+$/.test(cid);
    }
}

module.exports = { Validators };
