const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

/**
 * Verify a ZK proof
 */
async function verifyProof() {
    console.log("🔍 Verifying Zero-Knowledge Proof...\n");

    const proofPath = path.join(__dirname, "../proofs/proof.json");
    const publicPath = path.join(__dirname, "../proofs/public.json");
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
    }

    try {
        const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));
        const publicSignals = JSON.parse(fs.readFileSync(publicPath, "utf8"));
        const vkey = JSON.parse(fs.readFileSync(vkeyPath, "utf8"));

        // Verify the proof
        const isValid = await snarkjs.groth16.verify(vkey, publicSignals, proof);

        if (isValid) {
            console.log("✅ Proof is VALID!");
            console.log("\n✨ The media authenticity has been verified without revealing the content.");
        } else {
            console.log("❌ Proof is INVALID!");
            console.log("\n⚠️  The media does not match the claimed biometric signature.");
        }

        return isValid;
    } catch (error) {
        console.error("❌ Error verifying proof:", error);
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
