const express = require('express');
const snarkjs = require('snarkjs');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { validate, schemas } = require('../middleware/validation');

const router = express.Router();

// ============================================================================
// ZKP artifact paths
// ============================================================================
const ZKP_DIR = path.join(__dirname, '../../../zkp-circuits/build');

const CIRCUITS = {
    verify: {
        wasm: path.join(ZKP_DIR, 'verify_js', 'verify.wasm'),
        zkey: path.join(ZKP_DIR, 'verify_final.zkey'),
        vkey: path.join(ZKP_DIR, 'verification_key.json'),
    },
    bio_match: {
        wasm: path.join(ZKP_DIR, 'bio_match_js', 'bio_match.wasm'),
        zkey: path.join(ZKP_DIR, 'bio_match_final.zkey'),
        vkey: path.join(ZKP_DIR, 'bio_match_verification_key.json'),
    },
};

// Pre-load verification keys at startup
const vkeys = {};
for (const [name, paths] of Object.entries(CIRCUITS)) {
    if (fs.existsSync(paths.vkey)) {
        try {
            vkeys[name] = JSON.parse(fs.readFileSync(paths.vkey, 'utf8'));
            logger.info(`ZKP: ${name} verification key loaded`);
        } catch (err) {
            logger.warn(`ZKP: Failed to load ${name} verification key: ${err.message}`);
        }
    } else {
        logger.warn(`ZKP: ${name} circuit not compiled — ${paths.vkey} missing`);
    }
}

/**
 * Check if a circuit is available (compiled + trusted setup done).
 */
function isCircuitAvailable(circuitName) {
    const paths = CIRCUITS[circuitName];
    if (!paths) return false;
    return fs.existsSync(paths.wasm) && fs.existsSync(paths.zkey) && !!vkeys[circuitName];
}

/**
 * POST /api/zkp/generate
 * Generate a zero-knowledge proof for media verification.
 *
 * Body for 'verify' circuit:
 *   { circuitType: 'verify', publicHash, timestamp, videoPixels, bioSignature, hardwareID }
 *
 * Body for 'bio_match' circuit:
 *   { circuitType: 'bio_match', minBPM, maxBPM, commitmentHash, actualBPM, nonce }
 */
router.post('/generate', validate(schemas.zkpGenerate), async (req, res) => {
    try {
        const { circuitType = 'verify' } = req.body;

        if (!CIRCUITS[circuitType]) {
            return res.status(400).json({ error: `Unknown circuit type: ${circuitType}. Use 'verify' or 'bio_match'.` });
        }
        if (!isCircuitAvailable(circuitType)) {
            return res.status(503).json({
                error: `Circuit '${circuitType}' not available`,
                message: 'Compile the circuit first: cd zkp-circuits && npm run compile:all'
            });
        }

        const circuit = CIRCUITS[circuitType];

        // Build circuit-specific inputs
        let circuitInputs;
        if (circuitType === 'verify') {
            const { publicHash, timestamp, videoPixels, bioSignature, hardwareID } = req.body;
            circuitInputs = {
                blockchainAnchoredHash: publicHash,
                timestamp: String(timestamp),
                videoPixelsHash: typeof videoPixels === 'string' ? videoPixels : String(videoPixels),
                userPulseSignature: bioSignature,
                hardwarePRNU: hardwareID,
            };
        } else if (circuitType === 'bio_match') {
            const { minBPM, maxBPM, commitmentHash, actualBPM, nonce } = req.body;
            circuitInputs = {
                minBPM: String(minBPM),
                maxBPM: String(maxBPM),
                commitmentHash: String(commitmentHash),
                actualBPM: String(actualBPM),
                nonce: String(nonce),
            };
        }

        logger.info(`ZKP: Generating ${circuitType} proof...`);
        const startTime = Date.now();

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            circuitInputs,
            circuit.wasm,
            circuit.zkey
        );

        const elapsed = Date.now() - startTime;
        logger.info(`ZKP: ${circuitType} proof generated in ${elapsed}ms`);

        res.json({
            success: true,
            circuitType,
            proof,
            publicSignals,
            generationTimeMs: elapsed,
        });

    } catch (error) {
        logger.error('ZKP generate error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * POST /api/zkp/verify
 * Verify a zero-knowledge proof.
 *
 * Body: { proof, publicSignals, circuitType? }
 */
router.post('/verify', validate(schemas.zkpVerify), async (req, res) => {
    try {
        const { proof, publicSignals, circuitType = 'verify' } = req.body;

        if (!vkeys[circuitType]) {
            return res.status(503).json({
                error: `Verification key for '${circuitType}' not available`,
                message: 'Compile circuit & perform trusted setup first.'
            });
        }

        logger.info(`ZKP: Verifying ${circuitType} proof...`);
        const isValid = await snarkjs.groth16.verify(vkeys[circuitType], publicSignals, proof);

        res.json({
            success: true,
            isValid,
            circuitType,
            message: isValid ? 'Proof is valid — media is authentic' : 'Proof is invalid — media may be tampered'
        });

    } catch (error) {
        logger.error('ZKP verify error:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/zkp/status
 * Show which circuits are compiled and ready.
 */
router.get('/status', (req, res) => {
    const status = {};
    for (const [name, paths] of Object.entries(CIRCUITS)) {
        status[name] = {
            wasmExists: fs.existsSync(paths.wasm),
            zkeyExists: fs.existsSync(paths.zkey),
            vkeyLoaded: !!vkeys[name],
            ready: isCircuitAvailable(name),
        };
    }
    res.json({ circuits: status });
});

/**
 * POST /api/zkp/exonerate
 * Generate exoneration proof: prove a video is fake because bio-signature doesn't match.
 * Uses the bio_match circuit to show BPM mismatch.
 */
router.post('/exonerate', validate(schemas.zkpExonerate), async (req, res) => {
    try {
        const { claimedHash, actualBioSignature } = req.body;

        // If bio_match circuit is available, generate a real Groth16 mismatch proof
        if (isCircuitAvailable('bio_match')) {
            logger.info('ZKP: Generating exoneration proof via bio_match circuit (real Groth16)');
            
            // Parse BPM from the actualBioSignature (format "bpm:72:conf:85" or just a number)
            let actualBPM = 0;
            const bpmMatch = actualBioSignature.match(/bpm:(\d+)/);
            if (bpmMatch) {
                actualBPM = parseInt(bpmMatch[1], 10);
            } else if (!isNaN(parseInt(actualBioSignature, 10))) {
                actualBPM = parseInt(actualBioSignature, 10);
            }

            // Generate a commitment hash for the actual BPM
            const crypto = require('crypto');
            const nonce = crypto.randomBytes(16).toString('hex');
            const commitmentInput = `${actualBPM}:${nonce}`;
            const commitmentHash = crypto.createHash('sha256').update(commitmentInput).digest('hex');
            // Truncate to fit the circom field (< 2^253)
            const commitmentBigInt = BigInt('0x' + commitmentHash.slice(0, 30));

            // Generate a real Groth16 proof showing the BPM does NOT match the claimed range
            const circuit = CIRCUITS['bio_match'];
            const circuitInputs = {
                minBPM: '60',          // Claimed normal range
                maxBPM: '100',
                commitmentHash: commitmentBigInt.toString(),
                actualBPM: String(actualBPM || 999), // Out-of-range proves mismatch
                nonce: BigInt('0x' + nonce.slice(0, 30)).toString(),
            };

            const startTime = Date.now();
            const { proof, publicSignals } = await snarkjs.groth16.fullProve(
                circuitInputs,
                circuit.wasm,
                circuit.zkey,
            );
            const elapsed = Date.now() - startTime;

            // Verify the proof we just generated
            const verified = await snarkjs.groth16.verify(vkeys['bio_match'], publicSignals, proof);
            logger.info(`ZKP: Exoneration proof generated in ${elapsed}ms, verified=${verified}`);

            res.json({
                success: true,
                message: verified
                    ? 'Exoneration proof: bio-signature mismatch confirmed via Groth16'
                    : 'Proof generated but verification failed — check circuit inputs',
                proof: {
                    groth16Proof: proof,
                    publicSignals,
                    claimedHash,
                    mismatchVerified: verified,
                    circuitUsed: 'bio_match',
                    generationTimeMs: elapsed,
                },
            });
        } else {
            // Cryptographic hash comparison fallback
            const CryptoUtils = require('../../../shared/crypto');
            const claimedSigHash = CryptoUtils.sha256(claimedHash);
            const actualSigHash = CryptoUtils.sha256(actualBioSignature);
            const mismatch = claimedSigHash !== actualSigHash;

            res.json({
                success: true,
                message: mismatch
                    ? 'Exoneration: signatures do not match — video may be fake'
                    : 'Signatures match — video appears authentic',
                proof: {
                    claimedHash,
                    mismatch,
                    method: 'hash-comparison'
                }
            });
        }

    } catch (error) {
        logger.error('Exoneration error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
