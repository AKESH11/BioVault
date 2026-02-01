const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * Generate a ZK proof for media verification
 */
async function generateProof() {
    console.log("🔐 Generating Zero-Knowledge Proof...\n");

    // Example private inputs (would come from the actual media)
    const input = {
        // Public inputs (visible on blockchain)
        publicHash: "12345678901234567890",  // The hash stored on-chain
        timestamp: "1706745600",              // Unix timestamp
        
        // Private inputs (kept secret)
        videoPixels: "9876543210987654",      // Hash of video sample
        bioSignature: "72",                   // Heart rate (BPM)
        hardwareID: "1122334455"              // Device fingerprint
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
        console.log("📋 Proof:");
        console.log(JSON.stringify(proof, null, 2));
        
        console.log("\n📋 Public Signals:");
        console.log(JSON.stringify(publicSignals, null, 2));

        // Save proof and public signals
        const outputDir = path.join(__dirname, "../proofs");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir);
        }

        fs.writeFileSync(
            path.join(outputDir, "proof.json"),
            JSON.stringify(proof, null, 2)
        );

        fs.writeFileSync(
            path.join(outputDir, "public.json"),
            JSON.stringify(publicSignals, null, 2)
        );

        console.log("\n💾 Proof saved to: proofs/proof.json");
        console.log("💾 Public signals saved to: proofs/public.json");

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
