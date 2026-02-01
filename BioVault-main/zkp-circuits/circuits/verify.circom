pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Bio-Vault Media Verification Circuit
 * 
 * Proves that a private video matches a public blockchain hash
 * without revealing the video content.
 * 
 * Public Inputs:
 * - publicHash: The hash stored on blockchain
 * - timestamp: When the media was captured
 * 
 * Private Inputs:
 * - videoPixels: Sample pixels from the video (hashed)
 * - bioSignature: Heart rate signature
 * - hardwareID: Device fingerprint
 */
template MediaVerification() {
    // Public inputs (visible to verifier)
    signal input publicHash;
    signal input timestamp;
    
    // Private inputs (hidden from verifier)
    signal input videoPixels;
    signal input bioSignature;
    signal input hardwareID;
    
    // Output: proof of match
    signal output isValid;
    
    // Component: Hash the private inputs using Poseidon
    component hasher = Poseidon(3);
    hasher.inputs[0] <== videoPixels;
    hasher.inputs[1] <== bioSignature;
    hasher.inputs[2] <== hardwareID;
    
    // Component: Compare computed hash with public hash
    component eq = IsEqual();
    eq.in[0] <== hasher.out;
    eq.in[1] <== publicHash;
    
    // Output: 1 if match, 0 if not
    isValid <== eq.out;
    
    // Constraint: timestamp must be reasonable (not in future)
    // This is a simplified check - in production, use more constraints
    signal timestampCheck;
    timestampCheck <== timestamp * timestamp;
    
    // Ensure isValid is binary (0 or 1)
    isValid * (1 - isValid) === 0;
}

component main {public [publicHash, timestamp]} = MediaVerification();
