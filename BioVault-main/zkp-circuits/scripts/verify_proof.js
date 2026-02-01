const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * Verify a ZK proof
 */
async function verifyProof() {
    console.log("🔍 Verifying Zero-Knowledge Proof...\n");

    const proofPath = path.join(__dirname, "../build/proof.json");
    const publicPath = path.join(__dirname, "../build/public.json");
    const vkeyPath = path.join(__dirname, "../build/verification_key.json");

    if (!fs.existsSync(proofPath) || !fs.existsSync(publicPath)) {
        console.error("❌ Proof not found. Run: npm run generate-proof");
        process.exit(1);
    }

    // Export verification key if it doesn't exist
    if (!fs.existsSync(vkeyPath)) {
        console.log("📤 Exporting verification key...");
        const zkeyPath = path.join(__dirname, "../build/verify_final.zkey");
        const vkey = await snarkjs.zKey.exportVerificationKey(zkeyPath);
        fs.writeFileSync(vkeyPath, JSON.stringify(vkey, null, 2));
        console.log("✅ Verification key exported\n");
    }

    try {
        const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
        const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));

        console.log("📊 Public Signals:");
        console.log("   isValid:", publicSignals[0] === '1' ? '✅ AUTHENTIC' : '❌ FAKE');
        console.log("   Blockchain Hash:", publicSignals[1]);
        console.log("   Timestamp:", publicSignals[2]);
        console.log("");

        // Verify the proof
        console.log("⏳ Verifying proof cryptographically...");
        const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

        if (isValid) {
            console.log("\n✅ ✅ ✅ PROOF IS CRYPTOGRAPHICALLY VALID! ✅ ✅ ✅");
            console.log("\n✨ What this proves:");
            console.log("   • The prover possesses the original video");
            console.log("   • The biometric signature matches");
            console.log("   • The hardware fingerprint is correct");
            console.log("   • All WITHOUT revealing any private data!");
            console.log("\n🔐 This proof can be verified on-chain via Solidity verifier");
        } else {
            console.log("\n❌ PROOF IS INVALID!");
            console.log("\n⚠️  The cryptographic verification failed");
            console.log("   This should never happen if proof was generated correctly");
        }

        return isValid;
    } catch (error) {
        console.error("❌ Error verifying proof:", error.message);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    verifyProof()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { verifyProof };
