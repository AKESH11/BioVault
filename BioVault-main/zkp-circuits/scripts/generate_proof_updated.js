const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');

/**
 * Bio-Vault Protocol - ZK Proof Generator
 * 
 * This script generates a zero-knowledge proof that:
 * 1. You possess a video with specific biometric signatures
 * 2. The video matches the blockchain-anchored hash
 * 3. WITHOUT revealing the video, biometric data, or hardware ID
 * 
 * Usage:
 *   node generate_proof.js [input_file] [circuit_name]
 * 
 * Example:
 *   node generate_proof.js input.json verify
 */

async function generateProof() {
    console.log('🔐 Bio-Vault ZK Proof Generator\n');
    
    // Parse command line arguments
    const inputFile = process.argv[2] || 'input.json';
    const circuitName = process.argv[3] || 'verify';
    
    const buildDir = path.join(__dirname, '../build');
    const wasmFile = path.join(buildDir, `${circuitName}_js`, `${circuitName}.wasm`);
    const zkeyFile = path.join(buildDir, `${circuitName}_final.zkey`);
    const inputPath = path.join(__dirname, '..', inputFile);
    
    // Check if required files exist
    if (!fs.existsSync(wasmFile)) {
        console.error(`❌ WASM file not found: ${wasmFile}`);
        console.log('\n📘 Run these commands first:');
        console.log('   npm run compile:verify');
        console.log('   npm run setup');
        console.log('   npm run contribute');
        process.exit(1);
    }
    
    if (!fs.existsSync(zkeyFile)) {
        console.error(`❌ ZKey file not found: ${zkeyFile}`);
        console.log('\n📘 Run these commands first:');
        console.log('   npm run setup');
        console.log('   npm run contribute');
        process.exit(1);
    }
    
    if (!fs.existsSync(inputPath)) {
        console.error(`❌ Input file not found: ${inputPath}`);
        console.log('\n📘 Create an input.json file with:');
        console.log('   - videoPixelsHash (private)');
        console.log('   - userPulseSignature (private)');
        console.log('   - hardwarePRNU (private)');
        console.log('   - blockchainAnchoredHash (public)');
        console.log('   - timestamp (public)');
        process.exit(1);
    }
    
    console.log('📂 Loading input signals from:', inputFile);
    const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    
    // Display what we're proving (without revealing private data)
    console.log('\n🔍 Proving:');
    console.log('   ✓ Video authenticity (without revealing video)');
    console.log('   ✓ Biometric signature match (without revealing pulse)');
    console.log('   ✓ Hardware fingerprint match (without revealing device ID)');
    console.log('\n📊 Public inputs:');
    console.log('   Blockchain Hash:', input.blockchainAnchoredHash);
    console.log('   Timestamp:', input.timestamp, `(${new Date(parseInt(input.timestamp)).toISOString()})`);
    console.log('\n🔒 Private inputs: [HIDDEN]');
    
    try {
        console.log('\n⏳ Generating witness...');
        const startWitness = Date.now();
        
        // Calculate witness (this computes the circuit with your inputs)
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            wasmFile,
            zkeyFile
        );
        
        const witnessTime = Date.now() - startWitness;
        console.log(`✅ Witness generated in ${witnessTime}ms`);
        
        console.log('\n⏳ Generating zk-SNARK proof...');
        const startProof = Date.now();
        
        // Save proof to file
        const proofPath = path.join(buildDir, 'proof.json');
        fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
        
        // Save public signals
        const publicPath = path.join(buildDir, 'public.json');
        fs.writeFileSync(publicPath, JSON.stringify(publicSignals, null, 2));
        
        const proofTime = Date.now() - startProof;
        console.log(`✅ Proof generated in ${proofTime}ms`);
        
        // Display proof details
        console.log('\n📜 Proof generated successfully!');
        console.log('   Proof file:', proofPath);
        console.log('   Public signals:', publicPath);
        console.log('\n🎯 Proof Output:');
        console.log('   isValid:', publicSignals[0] === '1' ? '✅ AUTHENTIC' : '❌ FAKE');
        
        if (publicSignals[0] === '1') {
            console.log('\n✨ This proof cryptographically demonstrates:');
            console.log('   • You possess the original video');
            console.log('   • The biometric signature matches');
            console.log('   • The hardware fingerprint is correct');
            console.log('   • All WITHOUT revealing any private data!');
        } else {
            console.log('\n⚠️  Proof shows media does NOT match blockchain record');
            console.log('   Possible reasons:');
            console.log('   • Video has been tampered with');
            console.log('   • Biometric signature doesn\'t match');
            console.log('   • Hardware ID is different (not original device)');
        }
        
        console.log('\n📤 Next steps:');
        console.log('   1. Verify proof: npm run verify-proof');
        console.log('   2. Send proof to verifier (safe - reveals nothing private!)');
        console.log('   3. Verifier can confirm authenticity on-chain');
        
        return { proof, publicSignals };
        
    } catch (error) {
        console.error('\n❌ Error generating proof:', error.message);
        
        if (error.message.includes('witness')) {
            console.log('\n💡 Tip: Check your input values match the circuit constraints');
        }
        
        throw error;
    }
}

// Run if called directly
if (require.main === module) {
    generateProof()
        .then(() => {
            console.log('\n✅ Proof generation complete!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n💥 Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { generateProof };
