/**
 * Upload Proof of Reality metadata to IPFS and anchor on Polygon
 * 
 * This script:
 * 1. Accepts Proof of Reality JSON (pulse data, correlations, replay flags)
 * 2. Uploads full JSON to IPFS
 * 3. Computes BLAKE3 hash of the metadata
 * 4. Anchors on Polygon MediaAnchor contract with metadata hash + IPFS CID
 * 
 * Usage:
 *   node scripts/anchorProofOfReality.js <metadataJsonPath> <videoIPFSCID>
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');

// Pinata configuration
const PINATA_API_KEY = process.env.PINATA_API_KEY || '';
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || '';

/**
 * Upload JSON metadata to IPFS via Pinata
 */
async function uploadJSONToPinata(jsonData, name) {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
        throw new Error('PINATA_API_KEY and PINATA_SECRET_KEY required');
    }
    
    const url = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
    
    const data = {
        pinataContent: jsonData,
        pinataMetadata: {
            name: name,
            keyvalues: {
                project: 'BioVault',
                type: 'proof-of-reality'
            }
        },
        pinataOptions: {
            cidVersion: 1
        }
    };
    
    const response = await axios.post(url, data, {
        headers: {
            'Content-Type': 'application/json',
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY
        }
    });
    
    return response.data.IpfsHash;
}

/**
 * Compute BLAKE3 hash (using SHA-256 as fallback for Node.js)
 */
function computeMetadataHash(jsonString) {
    // In production, use official BLAKE3 library
    // For now, using SHA-256 as it's available in Node.js
    const hash = crypto.createHash('sha256');
    hash.update(jsonString);
    return hash.digest('hex');
}

/**
 * Validate Proof of Reality metadata structure
 */
function validateMetadata(metadata) {
    const required = [
        'pulse_data',
        'correlation_coefficients',
        'replay_attack_flags',
        'consensus_hash',
        'hardware_dna',
        'video_frame_hash',
        'timestamp',
        'verification_status',
        'all_unique_signals',
        'detected_faces'
    ];
    
    for (const field of required) {
        if (!(field in metadata)) {
            throw new Error(`Missing required field: ${field}`);
        }
    }
    
    // Validate pulse data structure
    if (!Array.isArray(metadata.pulse_data)) {
        throw new Error('pulse_data must be an array');
    }
    
    for (const pulse of metadata.pulse_data) {
        if (!('face_id' in pulse) || !('bpm' in pulse)) {
            throw new Error('Invalid pulse data structure');
        }
    }
    
    // Check for replay attacks
    const replayAttacks = Object.values(metadata.replay_attack_flags).filter(flag => flag === true);
    if (replayAttacks.length > 0 && metadata.all_unique_signals) {
        console.warn('⚠️  Warning: Replay attacks detected but all_unique_signals is true');
    }
    
    return true;
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 2) {
        console.error('Usage: node anchorProofOfReality.js <metadataJsonPath> <videoIPFSCID>');
        console.error('Example: node anchorProofOfReality.js metadata.json QmXYZ...');
        process.exit(1);
    }
    
    const metadataPath = args[0];
    const videoIPFSCID = args[1];
    
    console.log('🔐 BioVault Proof of Reality Anchoring\n');
    
    // 1. Load and validate metadata
    console.log('📄 Loading metadata...');
    if (!fs.existsSync(metadataPath)) {
        throw new Error(`Metadata file not found: ${metadataPath}`);
    }
    
    const metadataJson = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    validateMetadata(metadataJson);
    console.log('✅ Metadata validated');
    
    // 2. Upload metadata to IPFS
    console.log('\n📤 Uploading Proof of Reality metadata to IPFS...');
    const metadataIPFS = await uploadJSONToPinata(
        metadataJson,
        `proof-of-reality-${Date.now()}.json`
    );
    console.log(`✅ Uploaded to IPFS: ${metadataIPFS}`);
    console.log(`   View at: https://gateway.pinata.cloud/ipfs/${metadataIPFS}`);
    
    // 3. Compute metadata hash
    const metadataString = JSON.stringify(metadataJson);
    const metadataHash = computeMetadataHash(metadataString);
    console.log(`\n🔐 Metadata hash: ${metadataHash}`);
    
    // 4. Deploy/get MediaAnchor contract
    console.log('\n📜 Connecting to MediaAnchor contract...');
    const MediaAnchor = await ethers.getContractFactory('MediaAnchor');
    
    // Try to get deployed address from environment or use last deployment
    let mediaAnchor;
    const deployedAddress = process.env.MEDIA_ANCHOR_ADDRESS;
    
    if (deployedAddress) {
        mediaAnchor = await MediaAnchor.attach(deployedAddress);
        console.log(`✅ Connected to MediaAnchor at: ${deployedAddress}`);
    } else {
        console.log('⚠️  No MEDIA_ANCHOR_ADDRESS set, deploying new contract...');
        mediaAnchor = await MediaAnchor.deploy();
        await mediaAnchor.waitForDeployment();
        const address = await mediaAnchor.getAddress();
        console.log(`✅ MediaAnchor deployed at: ${address}`);
        console.log('   💡 Set MEDIA_ANCHOR_ADDRESS env var to reuse this contract');
    }
    
    // 5. Prepare consensus parties (extract from metadata or use deployer)
    const [deployer] = await ethers.getSigners();
    const consensusParties = [deployer.address];  // TODO: Extract from metadata if available
    
    // 6. Anchor on blockchain
    console.log('\n⚓ Anchoring Proof of Reality on blockchain...');
    
    const tx = await mediaAnchor.anchorMedia(
        metadataJson.consensus_hash,           // _mediaHash
        metadataJson.pulse_data.map(p => p.bpm).join(','),  // _bioSignature (simplified)
        metadataJson.hardware_dna,             // _hardwareID
        consensusParties,                      // _consensusParties
        videoIPFSCID,                          // _ipfsHash (video)
        metadataHash,                          // _proofOfRealityHash
        metadataIPFS,                          // _proofOfRealityIPFS
        metadataJson.all_unique_signals,       // _allUniqueSignals
        metadataJson.detected_faces            // _detectedFaces
    );
    
    console.log(`   Transaction hash: ${tx.hash}`);
    console.log('   Waiting for confirmation...');
    
    const receipt = await tx.wait();
    console.log(`✅ Anchored in block ${receipt.blockNumber}`);
    
    // 7. Summary
    console.log('\n📊 Proof of Reality Summary:');
    console.log(`   Detected Faces: ${metadataJson.detected_faces}`);
    console.log(`   Unique Signals: ${metadataJson.all_unique_signals ? '✅ Yes' : '⚠️  No (replay attack detected)'}`);
    console.log(`   Verification: ${metadataJson.verification_status}`);
    
    // List any replay attacks
    const replayPairs = Object.entries(metadataJson.replay_attack_flags)
        .filter(([_, flag]) => flag)
        .map(([pair, _]) => pair);
    
    if (replayPairs.length > 0) {
        console.log('\n⚠️  Replay Attacks Detected:');
        for (const pair of replayPairs) {
            const corr = metadataJson.correlation_coefficients[pair];
            console.log(`   Face pair ${pair}: correlation = ${corr.toFixed(4)} (> 0.95)`);
        }
        console.log('   ⚠️  This media may contain spoofed pulse signals');
    }
    
    console.log('\n✨ Proof of Reality anchored successfully!');
    console.log(`   Consensus Hash: ${metadataJson.consensus_hash}`);
    console.log(`   Metadata IPFS: ipfs://${metadataIPFS}`);
    console.log(`   Video IPFS: ipfs://${videoIPFSCID}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Error:', error.message);
        process.exit(1);
    });
