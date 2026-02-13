pragma circom 2.1.6;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";

/**
 * Biometric Signature Matching Circuit
 * 
 * Proves that a biometric signature (heart rate) matches
 * the expected range without revealing the actual BPM.
 * 
 * Use case: Victim proves a video is fake because the
 * biometric signature doesn't match their actual heart rate pattern.
 */
template BioSignatureMatch() {
    // Public inputs
    signal input minBPM;  // Minimum expected BPM (e.g., 60)
    signal input maxBPM;  // Maximum expected BPM (e.g., 100)
    signal input commitmentHash;  // Commitment to the biometric data
    
    // Private inputs
    signal input actualBPM;
    signal input nonce;  // Random nonce for commitment
    
    // Output
    signal output isInRange;
    
    // Verify commitment: hash(actualBPM || nonce) == commitmentHash
    component hasher = Poseidon(2);
    hasher.inputs[0] <== actualBPM;
    hasher.inputs[1] <== nonce;
    
    component commitmentCheck = IsEqual();
    commitmentCheck.in[0] <== hasher.out;
    commitmentCheck.in[1] <== commitmentHash;
    
    commitmentCheck.out === 1;
    
    // Check if actualBPM is in range [minBPM, maxBPM]
    component gte = GreaterEqThan(32);
    gte.in[0] <== actualBPM;
    gte.in[1] <== minBPM;
    
    component lte = LessEqThan(32);
    lte.in[0] <== actualBPM;
    lte.in[1] <== maxBPM;
    
    // Both conditions must be true
    isInRange <== gte.out * lte.out;

    // Enforce that the BPM IS in range — proof fails if isInRange=0
    isInRange === 1;
}

component main {public [minBPM, maxBPM, commitmentHash]} = BioSignatureMatch();
