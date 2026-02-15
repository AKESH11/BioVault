/**
 * Request validation middleware using Joi schemas.
 * Usage: router.post('/route', validate(schema), handler)
 */
const Joi = require('joi');

// ============================================================================
// Validation middleware factory
// ============================================================================

function validate(schema, source = 'body') {
    return (req, res, next) => {
        const data = source === 'params' ? req.params : source === 'query' ? req.query : req.body;
        const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });

        if (error) {
            const details = error.details.map(d => d.message);
            return res.status(400).json({ error: 'Validation failed', details });
        }

        // Replace with validated & sanitized data
        if (source === 'body') req.body = value;
        else if (source === 'params') req.params = value;
        else req.query = value;

        next();
    };
}

// ============================================================================
// Schemas
// ============================================================================

const schemas = {
    // POST /api/web3/anchor
    anchorMedia: Joi.object({
        mediaHash: Joi.string().min(1).max(128).required(),
        bioSignature: Joi.string().required(),
        hardwareID: Joi.string().required(),
        consensusParties: Joi.array().items(Joi.string().pattern(/^0x[a-fA-F0-9]{40}$/)).min(0).default([]).required(),
        ipfsHash: Joi.string().allow('').required(),
        proofOfRealityHash: Joi.string().allow('').default(''),
        proofOfRealityIPFS: Joi.string().allow('').default(''),
        allUniqueSignals: Joi.boolean().default(true),
        detectedFaces: Joi.number().integer().min(0).max(255).default(1)
    }),

    // POST /api/web3/dispute
    dispute: Joi.object({
        mediaHash: Joi.string().hex().length(64).required(),
        reason: Joi.string().min(10).max(1000).required()
    }),

    // GET /api/web3/verify/:mediaHash
    mediaHashParam: Joi.object({
        mediaHash: Joi.string().hex().length(64).required()
    }),

    // POST /api/ipfs/upload
    ipfsUpload: Joi.object({
        data: Joi.string().required(),
        filename: Joi.string().max(255).default('media'),
        metadata: Joi.object().optional()
    }),

    // POST /api/ipfs/pin
    ipfsPin: Joi.object({
        cid: Joi.string().required()
    }),

    // POST /api/media/process — validated in route (multipart), but body fields:
    mediaProcess: Joi.object({
        bpm: Joi.number().integer().min(30).max(250).required(),
        hardwareID: Joi.string().required(),
        timestamp: Joi.number().integer().optional()
    }),

    // POST /api/media/verify
    mediaVerify: Joi.object({
        expectedHash: Joi.string().hex().length(64).required(),
        bpm: Joi.number().integer().min(30).max(250).optional(),
        hardwareID: Joi.string().optional(),
        timestamp: Joi.number().integer().optional()
    }),

    // POST /api/media/generate-signature
    generateSignature: Joi.object({
        mediaHash: Joi.string().hex().length(64).required(),
        parties: Joi.array().items(Joi.string()).min(1).required(),
        biometrics: Joi.array().items(Joi.object({ bpm: Joi.number() })).optional()
    }),

    // POST /api/zkp/generate — supports both 'verify' and 'bio_match' circuits
    zkpGenerate: Joi.object({
        circuitType: Joi.string().valid('verify', 'bio_match').default('verify'),
        // verify circuit inputs
        publicHash: Joi.string().when('circuitType', { is: 'verify', then: Joi.required() }),
        timestamp: Joi.number().when('circuitType', { is: 'verify', then: Joi.required() }),
        videoPixels: Joi.alternatives().try(Joi.string(), Joi.array()).when('circuitType', { is: 'verify', then: Joi.required() }),
        bioSignature: Joi.string().when('circuitType', { is: 'verify', then: Joi.required() }),
        hardwareID: Joi.string().when('circuitType', { is: 'verify', then: Joi.required() }),
        // bio_match circuit inputs
        minBPM: Joi.number().integer().when('circuitType', { is: 'bio_match', then: Joi.required() }),
        maxBPM: Joi.number().integer().when('circuitType', { is: 'bio_match', then: Joi.required() }),
        commitmentHash: Joi.string().when('circuitType', { is: 'bio_match', then: Joi.required() }),
        actualBPM: Joi.number().integer().when('circuitType', { is: 'bio_match', then: Joi.required() }),
        nonce: Joi.string().when('circuitType', { is: 'bio_match', then: Joi.required() }),
    }),

    // POST /api/zkp/verify
    zkpVerify: Joi.object({
        proof: Joi.object().required(),
        publicSignals: Joi.alternatives().try(Joi.object(), Joi.array()).required(),
        circuitType: Joi.string().valid('verify', 'bio_match').default('verify')
    }),

    // POST /api/zkp/exonerate
    zkpExonerate: Joi.object({
        claimedHash: Joi.string().required(),
        actualBioSignature: Joi.string().required(),
        privateMedia: Joi.any().optional()
    })
};

module.exports = { validate, schemas };
