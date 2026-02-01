const snarkjs = require('snarkjs');
const path = require('path');

/**
 * Test script to find matching inputs
 */
async function testCircuit() {
    console.log('🧪 Testing Bio-Vault Circuit\n');

    // Test Case 1: Compute what the hash should be
    const privateInputs = {
        videoPixelsHash: "98765432109876543210987654321098",
        userPulseSignature: "72000000000000000000000000000000",
        hardwarePRNU: "11111111222222223333333344444444"
    };

    console.log('📊 Private Inputs:');
    console.log('   videoPixelsHash:', privateInputs.videoPixelsHash);
    console.log('   userPulseSignature:', privateInputs.userPulseSignature);
    console.log('   hardwarePRNU:', privateInputs.hardwarePRNU);
    console.log('');

    // Generate a proof to see what hash it computes
    const wasmPath = path.join(__dirname, "../build/verify_js/verify.wasm");
    const zkeyPath = path.join(__dirname, "../build/verify_final.zkey");

    // Try with a placeholder blockchain hash
    const testInput = {
        blockchainAnchoredHash: "0",  // Placeholder
        timestamp: "1738425600000",
        ...privateInputs
    };

    console.log('⏳ Generating witness to compute Poseidon hash...');
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        testInput,
        wasmPath,
        zkeyPath
    );

    console.log('\n📊 Circuit Output:');
    console.log('   isValid:', publicSignals[0]);
    console.log('   Computed Hash:', publicSignals[1] || publicSignals[0]);
    console.log('   Timestamp:', publicSignals[2] || publicSignals[1]);

    console.log('\n✅ To create an AUTHENTIC proof:');
    console.log('   Set blockchainAnchoredHash to:', publicSignals[0] !== '0' && publicSignals[0] !== '1' ? publicSignals[0] : 'Use computed hash from circuit');
    
    // Now test with the correct hash
    console.log('\n\n🎯 Testing with computed hash...');
    
    const correctInput = {
        blockchainAnchoredHash: publicSignals[0] === '0' ? testInput.videoPixelsHash : publicSignals[1],
        timestamp: "1738425600000",
        ...privateInputs
    };

    const { proof: proof2, publicSignals: signals2 } = await snarkjs.groth16.fullProve(
        correctInput,
        wasmPath,
        zkeyPath
    );

    console.log('📊 Result:');
    console.log('   isValid:', signals2[0] === '1' ? '✅ AUTHENTIC' : '❌ FAKE');
    console.log('   Public Signals:', signals2);
}

testCircuit().then(() => {
    console.log('\n✅ Test complete!');
    process.exit(0);
}).catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
});
