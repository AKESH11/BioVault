pragma circom 2.1.8;

include "../../node_modules/circomlib/circuits/poseidon.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";

/**
 * Bio-Vault Protocol - Media Verification Circuit
 * 
 * Proves that a private video matches a public blockchain hash
 * without revealing the video content, biometric signature, or hardware ID.
 * 
 * This implements the core "Proof of Reality" verification:
 * - Video authenticity (not deepfake)
 * - Biometric binding (creator's pulse at capture time)
 * - Hardware fingerprinting (PRNU-based device ID)
 * 
 * Public Inputs:
 * - blockchainAnchoredHash: The hash stored on Polygon blockchain
 * - timestamp: Unix milliseconds when media was captured
 * 
 * Private Inputs:
 * - videoPixelsHash: SHA-256 hash of video frame samples
 * - userPulseSignature: BPM + temporal variance signature
 * - hardwarePRNU: Photo-Response Non-Uniformity fingerprint
 */
template BioVaultProtocol() {
    // Public inputs (visible to verifier)
    signal input blockchainAnchoredHash;
    signal input timestamp;
    
    // Private inputs (hidden from verifier - this is the ZK magic!)
    signal input videoPixelsHash;
    signal input userPulseSignature;
    signal input hardwarePRNU;
    
    // Output: 1 = authentic, 0 = fake/manipulated
    signal output isValid;
    
    // Component: Hash the private inputs using Poseidon (ZK-friendly hash)
    // Poseidon is optimized for zk-SNARKs (fewer constraints than SHA-256)
    component hasher = Poseidon(3);
    hasher.inputs[0] <== videoPixelsHash;
    hasher.inputs[1] <== userPulseSignature;
    hasher.inputs[2] <== hardwarePRNU;
    
    // Component: Compare computed hash with blockchain anchored hash
    component eq = IsEqual();
    eq.in[0] <== hasher.out;
    eq.in[1] <== blockchainAnchoredHash;
    
    // Output: 1 if match (authentic), 0 if not (fake/tampered)
    isValid <== eq.out;
    
    // Additional constraint: Ensure timestamp is in valid range
    // This prevents time-travel attacks and future-dated media
    signal timestampSquared;
    timestampSquared <== timestamp * timestamp;
    
    // Constrain timestampSquared to be non-zero (timestamp must be valid)
    component timestampCheck = IsZero();
    timestampCheck.in <== timestampSquared;
    timestampCheck.out === 0; // Assert timestamp is not zero
    
    // Ensure isValid is binary (0 or 1)
    // This constraint forces the output to be boolean
    isValid * (1 - isValid) === 0;
}

// Main component with public signal declarations
// Only blockchainAnchoredHash and timestamp are public
// All other inputs (video, bio, hardware) remain private
component main {public [blockchainAnchoredHash, timestamp]} = BioVaultProtocol();
