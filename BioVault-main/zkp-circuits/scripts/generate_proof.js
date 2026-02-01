const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * Generate a ZK proof for media verification
 */
async function generateProof() {
    console.log("🔐 Generating Zero-Knowledge Proof...\n");

    // Example private inputs (would come from the actual media)
    // NOTE: Signal names MUST match the circuit definition in verify.circom
    const input = {
        // Public inputs (visible on blockchain)
        blockchainAnchoredHash: "12345678901234567890123456789012",  // 32-char hash
        timestamp: "1706745600000",                                   // Unix milliseconds
        
        // Private inputs (kept secret - never revealed!)
        videoPixelsHash: "98765432109876543210987654321098",         // Video hash
        userPulseSignature: "72000000000000000000000000000000",      // BPM signature
        hardwarePRNU: "11111111222222223333333344444444"             // Device fingerprint
    };

    const wasmPath = path.join(__dirname, "../build/verify_js/verify.wasm");
    const zkeyPath = path.join(__dirname, "../build/verify_final.zkey");

    if (!fs.existsSync(wasmPath)) {
        console.error("❌ Circuit not compiled. Run: npm run compile");
        process.exit(1);
    }

    if (!fs.existsSync(zkeyPath)) {
        console.error("❌ Proving key not generated. Run: npm run setup && npm run contribute");
        process.exit(1);
    }

    try {
        // Generate witness
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            wasmPath,
            zkeyPath
        );

        console.log("✅ Proof generated successfully!\n");
        
        console.log("🎯 Proof Output:");
        console.log("   isValid:", publicSignals[0] === '1' ? '✅ AUTHENTIC' : '❌ FAKE');
        
        if (publicSignals[0] === '1') {
            console.log("\n✨ This proof cryptographically demonstrates:");
            console.log("   • You possess the original video");
            console.log("   • The biometric signature matches");
            console.log("   • The hardware fingerprint is correct");
            console.log("   • All WITHOUT revealing any private data!");
        } else {
            console.log("\n⚠️  Proof shows media does NOT match blockchain record");
        }
        
        console.log("\n📋 Full Proof:");
        console.log(JSON.stringify(proof, null, 2));
        
        console.log("\n📋 Public Signals:");
        console.log(JSON.stringify(publicSignals, null, 2));

        // Save proof and public signals
        const outputDir = path.join(__dirname, "../build");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(outputDir, "proof.json"),
            JSON.stringify(proof, null, 2)
        );

        fs.writeFileSync(
            path.join(outputDir, "public.json"),
            JSON.stringify(publicSignals, null, 2)
        );

        console.log("\n💾 Proof saved to: build/proof.json");
        console.log("💾 Public signals saved to: build/public.json");

        return { proof, publicSignals };
    } catch (error) {
        console.error("❌ Error generating proof:", error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    generateProof()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { generateProof };
