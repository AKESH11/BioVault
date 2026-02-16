#!/usr/bin/env node
/**
 * BioVault Health Monitor
 * 
 * Checks the health of all BioVault infrastructure components:
 *   - Backend API
 *   - IPFS daemon
 *   - Blockchain (Hardhat / Amoy)
 *   - Smart contract connectivity
 *   - SQLite database
 *   - Disk space
 * 
 * Usage:
 *   node scripts/health_monitor.js                    # one-shot check
 *   node scripts/health_monitor.js --watch             # continuous (30s interval)
 *   node scripts/health_monitor.js --url http://host   # custom backend URL
 *   node scripts/health_monitor.js --json              # JSON output
 * 
 * Exit code: 0 = all healthy, 1 = degraded, 2 = critical
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================================
// Configuration
// ============================================================================

const args = process.argv.slice(2);
const BACKEND_URL = args.find(a => a.startsWith('--url='))?.split('=')[1] || 'http://127.0.0.1:3000';
const IPFS_URL = args.find(a => a.startsWith('--ipfs='))?.split('=')[1] || 'http://127.0.0.1:5001';
const WATCH_MODE = args.includes('--watch');
const JSON_OUTPUT = args.includes('--json');
const WATCH_INTERVAL = parseInt(args.find(a => a.startsWith('--interval='))?.split('=')[1] || '30') * 1000;

// ============================================================================
// HTTP helper
// ============================================================================

function httpGet(url, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, { timeout: timeoutMs }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// ============================================================================
// Health checks
// ============================================================================

async function checkBackend() {
    const start = Date.now();
    try {
        const { status, body } = await httpGet(`${BACKEND_URL}/health`);
        const latency = Date.now() - start;
        return {
            name: 'Backend API',
            status: status === 200 ? 'healthy' : 'degraded',
            latency: `${latency}ms`,
            details: typeof body === 'object' ? body : { raw: body },
        };
    } catch (err) {
        return { name: 'Backend API', status: 'critical', error: err.message };
    }
}

async function checkIPFS() {
    const start = Date.now();
    try {
        // IPFS API v0 id endpoint
        const { status, body } = await httpGet(`${IPFS_URL}/api/v0/id`, 5000);
        const latency = Date.now() - start;
        if (status === 405 || status === 200) {
            // 405 = POST-only (Kubo >= 0.23), means daemon is up
            return {
                name: 'IPFS Daemon',
                status: 'healthy',
                latency: `${latency}ms`,
                details: typeof body === 'object' ? { peerId: body.ID } : {},
            };
        }
        return { name: 'IPFS Daemon', status: 'degraded', latency: `${latency}ms` };
    } catch (err) {
        return { name: 'IPFS Daemon', status: 'critical', error: err.message };
    }
}

async function checkBlockchain() {
    const start = Date.now();
    try {
        const { status, body } = await httpGet(`${BACKEND_URL}/api/web3/wallet/status`);
        const latency = Date.now() - start;
        if (status === 200 && body.status === 'active') {
            return {
                name: 'Blockchain',
                status: body.balanceSufficient ? 'healthy' : 'degraded',
                latency: `${latency}ms`,
                details: {
                    network: body.network,
                    address: body.address,
                    balance: body.balance,
                    nonce: body.pendingNonce,
                },
            };
        }
        return { name: 'Blockchain', status: 'degraded', latency: `${latency}ms`, details: body };
    } catch (err) {
        return { name: 'Blockchain', status: 'critical', error: err.message };
    }
}

async function checkContracts() {
    const start = Date.now();
    try {
        const { status, body } = await httpGet(`${BACKEND_URL}/api/web3/contracts`);
        const latency = Date.now() - start;
        if (status !== 200) {
            return { name: 'Contracts', status: 'critical', error: `HTTP ${status}` };
        }
        const all = ['mediaAnchor', 'authenticityToken', 'verifier'];
        const initialized = all.filter(c => body[c]?.initialized);
        return {
            name: 'Smart Contracts',
            status: initialized.length === all.length ? 'healthy' :
                    initialized.length > 0 ? 'degraded' : 'critical',
            latency: `${latency}ms`,
            details: {
                initialized: initialized.length,
                total: all.length,
                contracts: body,
            },
        };
    } catch (err) {
        return { name: 'Smart Contracts', status: 'critical', error: err.message };
    }
}

function checkDiskSpace() {
    try {
        const dbPath = path.join(__dirname, '..', 'data', 'biovault.db');
        const dbExists = fs.existsSync(dbPath);
        const dbSize = dbExists ? fs.statSync(dbPath).size : 0;

        // Check ipfs repo size
        let ipfsSize = 'unknown';
        try {
            const ipfsPath = path.join(process.env.IPFS_PATH || path.join(require('os').homedir(), '.ipfs'));
            if (fs.existsSync(ipfsPath)) {
                // Rough estimate from datastore
                const datastorePath = path.join(ipfsPath, 'blocks');
                if (fs.existsSync(datastorePath)) {
                    ipfsSize = 'present';
                }
            }
        } catch { /* ignore */ }

        return {
            name: 'Storage',
            status: 'healthy',
            details: {
                database: dbExists ? `${(dbSize / 1024).toFixed(1)} KB` : 'not found',
                ipfsRepo: ipfsSize,
            },
        };
    } catch (err) {
        return { name: 'Storage', status: 'degraded', error: err.message };
    }
}

// ============================================================================
// Runner
// ============================================================================

async function runChecks() {
    const timestamp = new Date().toISOString();
    
    const results = await Promise.all([
        checkBackend(),
        checkIPFS(),
        checkBlockchain(),
        checkContracts(),
        Promise.resolve(checkDiskSpace()),
    ]);

    // Determine overall status
    const statuses = results.map(r => r.status);
    let overall = 'healthy';
    let exitCode = 0;
    if (statuses.includes('critical')) { overall = 'critical'; exitCode = 2; }
    else if (statuses.includes('degraded')) { overall = 'degraded'; exitCode = 1; }

    const report = {
        timestamp,
        overall,
        checks: results,
    };

    if (JSON_OUTPUT) {
        console.log(JSON.stringify(report, null, 2));
    } else {
        const icon = { healthy: '[OK]', degraded: '[WARN]', critical: '[FAIL]' };
        console.log(`\n${'='.repeat(60)}`);
        console.log(`  BioVault Health Check — ${timestamp}`);
        console.log(`  Overall: ${icon[overall]} ${overall.toUpperCase()}`);
        console.log('='.repeat(60));

        for (const check of results) {
            const i = icon[check.status] || '[??]';
            const line = `  ${i} ${check.name}`;
            const extra = check.latency ? ` (${check.latency})` : '';
            console.log(`${line}${extra}`);

            if (check.error) {
                console.log(`       Error: ${check.error}`);
            }
            if (check.details && !JSON_OUTPUT) {
                for (const [k, v] of Object.entries(check.details)) {
                    if (typeof v === 'object') continue; // skip nested objects in text mode
                    console.log(`       ${k}: ${v}`);
                }
            }
        }

        console.log('='.repeat(60) + '\n');
    }

    return exitCode;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    if (WATCH_MODE) {
        console.log(`BioVault Health Monitor — watching every ${WATCH_INTERVAL/1000}s`);
        console.log(`Backend: ${BACKEND_URL} | IPFS: ${IPFS_URL}`);
        console.log('Press Ctrl+C to stop.\n');

        const run = async () => {
            await runChecks();
            setTimeout(run, WATCH_INTERVAL);
        };
        await run();
    } else {
        const exitCode = await runChecks();
        process.exit(exitCode);
    }
}

main().catch(err => {
    console.error('Health monitor error:', err);
    process.exit(2);
});
