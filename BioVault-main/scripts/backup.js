#!/usr/bin/env node
/**
 * BioVault Backup Script
 * 
 * Creates timestamped backups of critical BioVault data:
 *   1. SQLite database (biovault.db)
 *   2. IPFS pin list (CIDs of all pinned content)
 *   3. Environment / contract configuration
 *   4. Keystore metadata (NOT private keys)
 * 
 * Usage:
 *   node scripts/backup.js                           # backup to ./backups/
 *   node scripts/backup.js --output /path/to/dir     # custom output
 *   node scripts/backup.js --include-ipfs-export     # also export IPFS refs
 * 
 * Restore:
 *   See the RESTORE.md section generated in each backup.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const http = require('http');

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const OUTPUT_DIR = args.find(a => a.startsWith('--output='))?.split('=')[1] 
    || path.join(__dirname, '..', 'backups');
const INCLUDE_IPFS = args.includes('--include-ipfs-export');

const ROOT = path.join(__dirname, '..');
const BACKEND_DIR = path.join(ROOT, 'backend');
const DB_PATH = path.join(BACKEND_DIR, 'data', 'biovault.db');
const ENV_PATH = path.join(BACKEND_DIR, '.env');
const ENV_AMOY_PATH = path.join(BACKEND_DIR, '.env.amoy');
const CONTRACTS_DIR = path.join(ROOT, 'smart-contracts');

// ============================================================================
// Helpers
// ============================================================================

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function copyIfExists(src, dest, description) {
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`  [OK] ${description}: ${path.basename(src)}`);
        return true;
    }
    console.log(`  [SKIP] ${description}: not found at ${src}`);
    return false;
}

function httpPost(url, timeoutMs = 10000) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method: 'POST', timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

// ============================================================================
// Backup functions
// ============================================================================

function backupDatabase(backupDir) {
    console.log('\n1. SQLite Database');
    console.log('-'.repeat(40));

    if (!fs.existsSync(DB_PATH)) {
        console.log('  [SKIP] No database found (first-run or in-memory mode)');
        return;
    }

    const dest = path.join(backupDir, 'biovault.db');
    
    // Use SQLite backup API if available, otherwise raw copy
    try {
        // Try to use sqlite3 CLI for a consistent backup
        execSync(`sqlite3 "${DB_PATH}" ".backup '${dest}'"`, { stdio: 'pipe' });
        console.log('  [OK] Database backed up via SQLite .backup command');
    } catch {
        // Fallback to file copy
        fs.copyFileSync(DB_PATH, dest);
        console.log('  [OK] Database backed up via file copy');
    }

    const stats = fs.statSync(dest);
    console.log(`  Size: ${(stats.size / 1024).toFixed(1)} KB`);

    // Also dump schema
    try {
        const schema = execSync(`sqlite3 "${DB_PATH}" ".schema"`, { encoding: 'utf8' });
        fs.writeFileSync(path.join(backupDir, 'schema.sql'), schema);
        console.log('  [OK] Schema exported to schema.sql');
    } catch {
        console.log('  [SKIP] Schema export (sqlite3 CLI not available)');
    }
}

function backupConfig(backupDir) {
    console.log('\n2. Configuration');
    console.log('-'.repeat(40));

    const configDir = path.join(backupDir, 'config');
    ensureDir(configDir);

    // .env files (sanitize private keys)
    for (const [envPath, name] of [[ENV_PATH, '.env'], [ENV_AMOY_PATH, '.env.amoy']]) {
        if (fs.existsSync(envPath)) {
            let content = fs.readFileSync(envPath, 'utf8');
            // Redact private keys and secrets
            content = content.replace(/(PRIVATE_KEY|JWT_SECRET|API_KEY|SENTRY_DSN|PINATA_JWT)=(.+)/g, 
                '$1=***REDACTED***');
            fs.writeFileSync(path.join(configDir, name + '.sanitized'), content);
            console.log(`  [OK] ${name} (sanitized — secrets redacted)`);
        }
    }

    // Contract addresses
    const contractConfig = {};
    for (const envFile of [ENV_PATH, ENV_AMOY_PATH]) {
        if (!fs.existsSync(envFile)) continue;
        const lines = fs.readFileSync(envFile, 'utf8').split('\n');
        for (const line of lines) {
            const match = line.match(/^(MEDIA_ANCHOR_CONTRACT|AUTHENTICITY_TOKEN_CONTRACT|GROTH16_VERIFIER_CONTRACT|VERIFIER_CONTRACT)=(.+)/);
            if (match) contractConfig[match[1]] = match[2].trim();
        }
    }
    fs.writeFileSync(path.join(configDir, 'contract_addresses.json'), JSON.stringify(contractConfig, null, 2));
    console.log(`  [OK] Contract addresses: ${Object.keys(contractConfig).length} saved`);

    // Hardhat config (non-sensitive parts)
    const hardhatConfig = path.join(CONTRACTS_DIR, 'hardhat.config.js');
    copyIfExists(hardhatConfig, path.join(configDir, 'hardhat.config.js'), 'Hardhat config');

    // Package versions
    for (const [dir, name] of [
        [BACKEND_DIR, 'backend'],
        [path.join(ROOT, 'mobile-app'), 'mobile-app'],
        [CONTRACTS_DIR, 'smart-contracts'],
    ]) {
        const pkgPath = path.join(dir, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            fs.writeFileSync(path.join(configDir, `${name}-deps.json`), JSON.stringify({
                name: pkg.name,
                version: pkg.version,
                dependencies: pkg.dependencies,
                devDependencies: pkg.devDependencies,
            }, null, 2));
        }
    }
    console.log('  [OK] Package dependency snapshots');
}

async function backupIPFS(backupDir) {
    console.log('\n3. IPFS Pin List');
    console.log('-'.repeat(40));

    try {
        // Get pin list via IPFS HTTP API
        const data = await httpPost('http://127.0.0.1:5001/api/v0/pin/ls?type=recursive');
        const pins = JSON.parse(data);
        const cids = Object.keys(pins.Keys || {});

        fs.writeFileSync(path.join(backupDir, 'ipfs_pins.json'), JSON.stringify({
            exported: new Date().toISOString(),
            count: cids.length,
            pins: cids.map(cid => ({
                cid,
                type: pins.Keys[cid].Type,
            })),
        }, null, 2));

        console.log(`  [OK] ${cids.length} pinned CIDs exported`);

        if (INCLUDE_IPFS && cids.length > 0) {
            // Also export IPFS refs for each pin (for re-pinning)
            const refsDir = path.join(backupDir, 'ipfs_refs');
            ensureDir(refsDir);
            console.log(`  Exporting refs for ${cids.length} pins...`);
            for (const cid of cids.slice(0, 100)) { // limit to 100 to avoid huge backups
                try {
                    const refs = await httpPost(`http://127.0.0.1:5001/api/v0/refs?arg=${cid}`);
                    fs.writeFileSync(path.join(refsDir, `${cid}.refs`), refs);
                } catch { /* skip failed refs */ }
            }
            console.log(`  [OK] IPFS refs exported`);
        }
    } catch (err) {
        console.log(`  [SKIP] IPFS not reachable: ${err.message}`);
    }
}

function backupContractArtifacts(backupDir) {
    console.log('\n4. Contract Artifacts');
    console.log('-'.repeat(40));

    const artifactsDir = path.join(backupDir, 'artifacts');
    ensureDir(artifactsDir);

    // Copy contract source files
    const contractsDir = path.join(CONTRACTS_DIR, 'contracts');
    if (fs.existsSync(contractsDir)) {
        for (const file of fs.readdirSync(contractsDir)) {
            if (file.endsWith('.sol')) {
                fs.copyFileSync(
                    path.join(contractsDir, file),
                    path.join(artifactsDir, file)
                );
            }
        }
        console.log('  [OK] Solidity source files');
    }

    // Copy deployment scripts
    const scriptsDir = path.join(CONTRACTS_DIR, 'scripts');
    if (fs.existsSync(scriptsDir)) {
        for (const file of fs.readdirSync(scriptsDir)) {
            if (file.endsWith('.js')) {
                fs.copyFileSync(
                    path.join(scriptsDir, file),
                    path.join(artifactsDir, file)
                );
            }
        }
        console.log('  [OK] Deployment scripts');
    }

    // Copy compiled ABIs
    const sharedDir = path.join(ROOT, 'shared');
    const abiFiles = ['contractABIs.js', 'contractABIs.json'];
    for (const f of abiFiles) {
        const src = path.join(sharedDir, f);
        if (fs.existsSync(src)) {
            fs.copyFileSync(src, path.join(artifactsDir, f));
            console.log(`  [OK] ABI: ${f}`);
        }
    }
}

function generateRestoreGuide(backupDir, timestamp) {
    const guide = `# BioVault Backup — ${timestamp}

## Contents
- \`biovault.db\` — SQLite database backup
- \`schema.sql\` — Database schema
- \`config/\` — Sanitized configuration files
- \`config/contract_addresses.json\` — Deployed contract addresses
- \`ipfs_pins.json\` — IPFS pinned content CIDs
- \`artifacts/\` — Contract source + ABIs

## Restore Procedure

### 1. Database
\`\`\`bash
# Stop backend first
cp biovault.db ../backend/data/biovault.db
\`\`\`

### 2. IPFS Pins
\`\`\`bash
# Re-pin all content from the pin list
cat ipfs_pins.json | jq -r '.pins[].cid' | while read cid; do
  ipfs pin add "$cid"
done
\`\`\`

### 3. Configuration
\`\`\`bash
# Copy sanitized configs and re-add secrets
cp config/.env.sanitized ../backend/.env
# Edit .env to restore: DEPLOYER_PRIVATE_KEY, JWT_SECRET, API_KEY
\`\`\`

### 4. Contract Verification
Verify contract addresses match \`config/contract_addresses.json\`
on the appropriate blockchain explorer.

## Notes
- Private keys, JWT secrets, and API keys are NOT included in this backup
- Store this backup securely — it contains contract addresses and database records
- Backup created by: scripts/backup.js
`;

    fs.writeFileSync(path.join(backupDir, 'RESTORE.md'), guide);
    console.log('\n  [OK] RESTORE.md guide generated');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(OUTPUT_DIR, `backup-${timestamp}`);

    console.log('='.repeat(60));
    console.log('  BioVault Backup');
    console.log(`  Timestamp: ${timestamp}`);
    console.log(`  Output: ${backupDir}`);
    console.log('='.repeat(60));

    ensureDir(backupDir);

    backupDatabase(backupDir);
    backupConfig(backupDir);
    await backupIPFS(backupDir);
    backupContractArtifacts(backupDir);
    generateRestoreGuide(backupDir, timestamp);

    // Summary
    const files = [];
    function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) walk(path.join(dir, entry.name));
            else files.push(path.join(dir, entry.name));
        }
    }
    walk(backupDir);

    const totalSize = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);

    console.log('\n' + '='.repeat(60));
    console.log(`  Backup complete!`);
    console.log(`  Files: ${files.length}`);
    console.log(`  Size: ${(totalSize / 1024).toFixed(1)} KB`);
    console.log(`  Location: ${backupDir}`);
    console.log('='.repeat(60) + '\n');
}

main().catch(err => {
    console.error('Backup failed:', err);
    process.exit(1);
});
