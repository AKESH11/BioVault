const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");

// Poseidon hash computation for commitment (matches circom's Poseidon(2))
let poseidon;

async function loadPoseidon() {
    const { buildPoseidon } = await import("circomlibjs");
    poseidon = await buildPoseidon();
}

/**
 * Compute Poseidon hash of (actualBPM, nonce) to produce the commitment.
 * This matches the circuit: hasher.inputs[0] = actualBPM, hasher.inputs[1] = nonce
 */
function computeCommitment(actualBPM, nonce) {
    const hash = poseidon([BigInt(actualBPM), BigInt(nonce)]);
    return poseidon.F.toString(hash);
}

/**
 * Generate a ZK proof for bio-signature matching.
 *
 * Proves that actualBPM is in [minBPM, maxBPM] without revealing it.
 * The verifier only sees: minBPM, maxBPM, commitmentHash.
 *
 * @param {Object} opts
 * @param {number} opts.actualBPM    - The real measured BPM (PRIVATE)
 * @param {number} opts.minBPM       - Lower bound of acceptable range (PUBLIC)
 * @param {number} opts.maxBPM       - Upper bound of acceptable range (PUBLIC)
 * @param {string} [opts.nonce]      - Random nonce for commitment (auto-generated if omitted)
 */
async function generateBioMatchProof({ actualBPM, minBPM = 40, maxBPM = 220, nonce } = {}) {
    await loadPoseidon();

    console.log("Generating Bio-Match Zero-Knowledge Proof...\n");

    // Auto-generate a random nonce if not provided
    if (!nonce) {
        const randomBytes = require("crypto").randomBytes(16);
        nonce = BigInt("0x" + randomBytes.toString("hex")).toString();
    }

    // Compute the commitment hash (this is the PUBLIC value the verifier checks against)
    const commitmentHash = computeCommitment(actualBPM, nonce);

    console.log("  Circuit inputs:");
    console.log(`    minBPM (public):        ${minBPM}`);
    console.log(`    maxBPM (public):        ${maxBPM}`);
    console.log(`    commitmentHash (public): ${commitmentHash}`);
    console.log(`    actualBPM (PRIVATE):     ${actualBPM}`);
    console.log(`    nonce (PRIVATE):         ${nonce}\n`);

    const input = {
        minBPM: minBPM.toString(),
        maxBPM: maxBPM.toString(),
        commitmentHash: commitmentHash,
        actualBPM: actualBPM.toString(),
        nonce: nonce.toString(),
    };

    const wasmPath = path.join(__dirname, "../build/bio_match_js/bio_match.wasm");
    const zkeyPath = path.join(__dirname, "../build/bio_match_final.zkey");

    if (!fs.existsSync(wasmPath)) {
        console.error("Circuit not compiled. Run:");
        console.error("  cd zkp-circuits && circom circuits/bio_match.circom --r1cs --wasm --sym -o build");
        process.exit(1);
    }
    if (!fs.existsSync(zkeyPath)) {
        console.error("Proving key not generated. Run trusted setup first.");
        process.exit(1);
    }

    try {
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            wasmPath,
            zkeyPath
        );

        // publicSignals[0] = isInRange (must be 1 for proof to pass)
        const isInRange = publicSignals[0] === "1";
        console.log("Proof generated successfully!\n");
        console.log(`  isInRange: ${isInRange ? "YES - BPM is in valid range" : "NO - BPM out of range (proof will fail verification)"}`);
        console.log(`  Public signals: [isInRange=${publicSignals[0]}, minBPM=${publicSignals[1]}, maxBPM=${publicSignals[2]}, commitmentHash=${publicSignals[3]}]`);

        // Save outputs
        const outputDir = path.join(__dirname, "../build");
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        fs.writeFileSync(
            path.join(outputDir, "bio_match_proof.json"),
            JSON.stringify(proof, null, 2)
        );
        fs.writeFileSync(
            path.join(outputDir, "bio_match_public.json"),
            JSON.stringify(publicSignals, null, 2)
        );
        fs.writeFileSync(
            path.join(outputDir, "bio_match_commitment.json"),
            JSON.stringify({ commitmentHash, nonce, actualBPM }, null, 2)
        );

        console.log("\n  Saved: build/bio_match_proof.json");
        console.log("  Saved: build/bio_match_public.json");
        console.log("  Saved: build/bio_match_commitment.json (KEEP SECRET - contains nonce + BPM)");

        return { proof, publicSignals, commitmentHash, nonce };
    } catch (error) {
        console.error("Error generating proof:", error.message);
        if (error.message.includes("Assert Failed")) {
            console.error("\n  The proof failed because actualBPM is outside [minBPM, maxBPM].");
            console.error(`  actualBPM=${actualBPM}, range=[${minBPM}, ${maxBPM}]`);
        }
        process.exit(1);
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const actualBPM = parseInt(args[0]) || 72;
    const minBPM = parseInt(args[1]) || 40;
    const maxBPM = parseInt(args[2]) || 220;

    console.log(`Usage: node generate_bio_match_proof.js [actualBPM] [minBPM] [maxBPM]\n`);

    generateBioMatchProof({ actualBPM, minBPM, maxBPM })
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = { generateBioMatchProof, computeCommitment };
