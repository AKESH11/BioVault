#!/usr/bin/env node
/**
 * BioVault ZKP Trusted Setup Ceremony
 * 
 * Performs the Groth16 trusted setup for BioVault's ZKP circuits.
 * This generates the proving key (zkey) and verification key needed
 * for proof generation and on-chain verification.
 * 
 * Steps:
 *   1. Download Powers of Tau (universal reference string)
 *   2. Compile Circom circuits to R1CS + WASM
 *   3. Phase 2 setup (circuit-specific)
 *   4. Contribute randomness (entropy)
 *   5. Export verification key
 *   6. Generate Solidity verifier contract
 * 
 * Usage:
 *   node scripts/ceremony.js                 # full ceremony
 *   node scripts/ceremony.js --skip-ptau     # skip Powers of Tau download
 *   node scripts/ceremony.js --circuit bio_match  # single circuit only
 *   node scripts/ceremony.js --verify-only   # verify existing setup
 * 
 * Prerequisites:
 *   - circom 2.2.3+ (cargo install --git https://github.com/iden3/circom.git)
 *   - snarkjs (npm install -g snarkjs)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const SKIP_PTAU = args.includes('--skip-ptau');
const VERIFY_ONLY = args.includes('--verify-only');
const SINGLE_CIRCUIT = args.find(a => a.startsWith('--circuit='))?.split('=')[1];

const ZKP_DIR = path.join(__dirname, '..', 'zkp-circuits');
const CIRCUITS_DIR = path.join(ZKP_DIR, 'circuits');
const BUILD_DIR = path.join(ZKP_DIR, 'build');
const PTAU_FILE = path.join(BUILD_DIR, 'pot14_final.ptau');

// Powers of Tau URL (Hermez trusted ceremony, 2^14 constraints)
const PTAU_URL = 'https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau';

const CIRCUITS = ['verify', 'bio_match'].filter(c => !SINGLE_CIRCUIT || c === SINGLE_CIRCUIT);

// ============================================================================
// Helpers
// ============================================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function run(cmd, cwd = ZKP_DIR) {
    console.log(`  $ ${cmd}`);
    try {
        execSync(cmd, { cwd, stdio: 'inherit', timeout: 300_000 });
    } catch (err) {
        console.error(`  [FAIL] Command failed: ${cmd}`);
        throw err;
    }
}

function fileExists(p) {
    return fs.existsSync(p);
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        console.log(`  Downloading: ${url}`);
        console.log(`  Destination: ${dest}`);

        const file = fs.createWriteStream(dest);
        let totalBytes = 0;

        https.get(url, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                // Follow redirect
                file.close();
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }

            const total = parseInt(response.headers['content-length'] || '0');

            response.on('data', (chunk) => {
                totalBytes += chunk.length;
                if (total > 0) {
                    const pct = ((totalBytes / total) * 100).toFixed(1);
                    process.stdout.write(`\r  Progress: ${pct}% (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`);
                }
            });

            response.pipe(file);
            file.on('finish', () => {
                file.close();
                console.log(`\n  [OK] Downloaded ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
                resolve();
            });
        }).on('error', (err) => {
            fs.unlinkSync(dest);
            reject(err);
        });
    });
}

// ============================================================================
// Ceremony Steps
// ============================================================================

async function step1_downloadPtau() {
    console.log('\n' + '='.repeat(60));
    console.log('Step 1: Powers of Tau (Universal Reference String)');
    console.log('='.repeat(60));

    ensureDir(BUILD_DIR);

    if (fileExists(PTAU_FILE)) {
        const size = fs.statSync(PTAU_FILE).size;
        console.log(`  [SKIP] Already exists: ${(size / 1024 / 1024).toFixed(1)} MB`);
        return;
    }

    if (SKIP_PTAU) {
        console.log('  [SKIP] --skip-ptau flag set');
        if (!fileExists(PTAU_FILE)) {
            console.error('  [ERROR] PTAU file required but not found!');
            process.exit(1);
        }
        return;
    }

    await downloadFile(PTAU_URL, PTAU_FILE);
}

function step2_compileCircuits() {
    console.log('\n' + '='.repeat(60));
    console.log('Step 2: Compile Circom Circuits');
    console.log('='.repeat(60));

    // Check circom is installed
    try {
        const version = execSync('circom --version', { encoding: 'utf8' }).trim();
        console.log(`  Circom version: ${version}`);
    } catch {
        console.error('  [ERROR] circom not found. Install with:');
        console.error('  cargo install --git https://github.com/iden3/circom.git --tag v2.2.3');
        process.exit(1);
    }

    for (const circuit of CIRCUITS) {
        const circomFile = path.join(CIRCUITS_DIR, `${circuit}.circom`);
        if (!fileExists(circomFile)) {
            console.error(`  [ERROR] Circuit not found: ${circomFile}`);
            continue;
        }

        console.log(`\n  Compiling ${circuit}.circom...`);
        const circuitBuild = path.join(BUILD_DIR, circuit);
        ensureDir(circuitBuild);

        run(`circom "${circomFile}" --r1cs --wasm --sym --output "${circuitBuild}"`, ZKP_DIR);

        // Verify output files
        const r1cs = path.join(circuitBuild, `${circuit}.r1cs`);
        const wasm = path.join(circuitBuild, `${circuit}_js`, `${circuit}.wasm`);

        if (fileExists(r1cs)) {
            console.log(`  [OK] R1CS: ${path.basename(r1cs)}`);
            // Print circuit info
            try {
                run(`npx snarkjs r1cs info "${r1cs}"`, ZKP_DIR);
            } catch { /* informational only */ }
        }

        if (fileExists(wasm)) {
            console.log(`  [OK] WASM: ${circuit}.wasm`);
        }
    }
}

function step3_phase2Setup() {
    console.log('\n' + '='.repeat(60));
    console.log('Step 3: Phase 2 Setup (Circuit-Specific)');
    console.log('='.repeat(60));

    for (const circuit of CIRCUITS) {
        const r1cs = path.join(BUILD_DIR, circuit, `${circuit}.r1cs`);
        const zkey0 = path.join(BUILD_DIR, circuit, `${circuit}_0000.zkey`);

        if (!fileExists(r1cs)) {
            console.log(`  [SKIP] ${circuit}: no R1CS file`);
            continue;
        }

        console.log(`\n  Phase 2 setup for ${circuit}...`);
        run(`npx snarkjs groth16 setup "${r1cs}" "${PTAU_FILE}" "${zkey0}"`, ZKP_DIR);
        console.log(`  [OK] Initial zkey: ${circuit}_0000.zkey`);
    }
}

function step4_contribute() {
    console.log('\n' + '='.repeat(60));
    console.log('Step 4: Contribute Randomness');
    console.log('='.repeat(60));

    for (const circuit of CIRCUITS) {
        const zkey0 = path.join(BUILD_DIR, circuit, `${circuit}_0000.zkey`);
        const zkey1 = path.join(BUILD_DIR, circuit, `${circuit}_0001.zkey`);
        const zkeyFinal = path.join(BUILD_DIR, circuit, `${circuit}_final.zkey`);

        if (!fileExists(zkey0)) {
            console.log(`  [SKIP] ${circuit}: no initial zkey`);
            continue;
        }

        // Contribution 1: Random entropy
        const entropy1 = crypto.randomBytes(64).toString('hex');
        console.log(`\n  Contributing entropy to ${circuit} (contribution 1)...`);
        run(`npx snarkjs zkey contribute "${zkey0}" "${zkey1}" --name="BioVault Ceremony Contribution 1" -e="${entropy1}"`, ZKP_DIR);

        // Contribution 2: Additional entropy (simulates multi-party)
        const entropy2 = crypto.randomBytes(64).toString('hex');
        console.log(`  Contributing entropy (contribution 2)...`);
        run(`npx snarkjs zkey contribute "${zkey1}" "${zkeyFinal}" --name="BioVault Ceremony Contribution 2" -e="${entropy2}"`, ZKP_DIR);

        console.log(`  [OK] Final zkey: ${circuit}_final.zkey`);

        // Verify the final zkey
        console.log(`  Verifying final zkey...`);
        try {
            run(`npx snarkjs zkey verify "${path.join(BUILD_DIR, circuit, circuit + '.r1cs')}" "${PTAU_FILE}" "${zkeyFinal}"`, ZKP_DIR);
            console.log(`  [OK] Verification passed`);
        } catch {
            console.warn(`  [WARN] Verification failed — zkey may be corrupted`);
        }
    }
}

function step5_exportKeys() {
    console.log('\n' + '='.repeat(60));
    console.log('Step 5: Export Verification Keys');
    console.log('='.repeat(60));

    for (const circuit of CIRCUITS) {
        const zkeyFinal = path.join(BUILD_DIR, circuit, `${circuit}_final.zkey`);
        const vkeyPath = path.join(BUILD_DIR, `${circuit}_verification_key.json`);

        if (!fileExists(zkeyFinal)) {
            console.log(`  [SKIP] ${circuit}: no final zkey`);
            continue;
        }

        console.log(`\n  Exporting verification key for ${circuit}...`);
        run(`npx snarkjs zkey export verificationkey "${zkeyFinal}" "${vkeyPath}"`, ZKP_DIR);
        console.log(`  [OK] ${circuit}_verification_key.json`);
    }
}

function step6_exportVerifier() {
    console.log('\n' + '='.repeat(60));
    console.log('Step 6: Generate Solidity Verifier');
    console.log('='.repeat(60));

    for (const circuit of CIRCUITS) {
        const zkeyFinal = path.join(BUILD_DIR, circuit, `${circuit}_final.zkey`);
        const verifierPath = path.join(BUILD_DIR, `${circuit}_Verifier.sol`);

        if (!fileExists(zkeyFinal)) {
            console.log(`  [SKIP] ${circuit}: no final zkey`);
            continue;
        }

        console.log(`\n  Generating Solidity verifier for ${circuit}...`);
        run(`npx snarkjs zkey export solidityverifier "${zkeyFinal}" "${verifierPath}"`, ZKP_DIR);
        console.log(`  [OK] ${circuit}_Verifier.sol`);

        // Also copy to smart-contracts/contracts/ for deployment
        const destPath = path.join(__dirname, '..', 'smart-contracts', 'contracts', `${circuit}_Verifier.sol`);
        fs.copyFileSync(verifierPath, destPath);
        console.log(`  [OK] Copied to smart-contracts/contracts/`);
    }
}

function verifyExisting() {
    console.log('\n' + '='.repeat(60));
    console.log('Verification of Existing Setup');
    console.log('='.repeat(60));

    for (const circuit of CIRCUITS) {
        const circuitBuild = path.join(BUILD_DIR, circuit);
        const zkeyFinal = path.join(circuitBuild, `${circuit}_final.zkey`);
        const vkey = path.join(BUILD_DIR, `${circuit}_verification_key.json`);
        const r1cs = path.join(circuitBuild, `${circuit}.r1cs`);
        const wasm = path.join(circuitBuild, `${circuit}_js`, `${circuit}.wasm`);

        console.log(`\n  Circuit: ${circuit}`);
        console.log(`    R1CS:          ${fileExists(r1cs) ? 'OK' : 'MISSING'}`);
        console.log(`    WASM:          ${fileExists(wasm) ? 'OK' : 'MISSING'}`);
        console.log(`    Final zkey:    ${fileExists(zkeyFinal) ? 'OK' : 'MISSING'}`);
        console.log(`    Verification:  ${fileExists(vkey) ? 'OK' : 'MISSING'}`);

        if (fileExists(zkeyFinal) && fileExists(r1cs) && fileExists(PTAU_FILE)) {
            console.log(`    Running zkey verification...`);
            try {
                run(`npx snarkjs zkey verify "${r1cs}" "${PTAU_FILE}" "${zkeyFinal}"`, ZKP_DIR);
                console.log(`    [OK] zkey is valid`);
            } catch {
                console.log(`    [FAIL] zkey verification failed`);
            }
        }
    }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    console.log('='.repeat(60));
    console.log('  BioVault ZKP Trusted Setup Ceremony');
    console.log(`  Circuits: ${CIRCUITS.join(', ')}`);
    console.log(`  Build dir: ${BUILD_DIR}`);
    console.log('='.repeat(60));

    if (VERIFY_ONLY) {
        verifyExisting();
        return;
    }

    await step1_downloadPtau();
    step2_compileCircuits();
    step3_phase2Setup();
    step4_contribute();
    step5_exportKeys();
    step6_exportVerifier();

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('  Ceremony Complete!');
    console.log('='.repeat(60));
    console.log('\n  Generated files:');

    for (const circuit of CIRCUITS) {
        const circuitBuild = path.join(BUILD_DIR, circuit);
        console.log(`\n  ${circuit}:`);
        console.log(`    R1CS:            build/${circuit}/${circuit}.r1cs`);
        console.log(`    WASM:            build/${circuit}/${circuit}_js/${circuit}.wasm`);
        console.log(`    Proving key:     build/${circuit}/${circuit}_final.zkey`);
        console.log(`    Verification key: build/${circuit}_verification_key.json`);
        console.log(`    Solidity:        build/${circuit}_Verifier.sol`);
    }

    console.log('\n  Next steps:');
    console.log('  1. Deploy the generated Verifier.sol contracts');
    console.log('  2. Update .env with the new verifier contract addresses');
    console.log('  3. Test proof generation: node zkp-circuits/scripts/generate_proof.js');
    console.log('  4. Test proof verification: node zkp-circuits/scripts/verify_proof.js');
    console.log('');
}

main().catch(err => {
    console.error('\nCeremony failed:', err.message);
    process.exit(1);
});
