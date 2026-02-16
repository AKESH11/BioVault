/**
 * BioVault Load Test Suite
 *
 * Tests backend performance under concurrent load.
 * Run: node test/load.test.js [--connections=50] [--duration=30] [--url=http://127.0.0.1:3000]
 *
 * Requirements: Backend + Hardhat + IPFS must be running
 */

const http = require('http');
const crypto = require('crypto');

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
    const [key, val] = arg.replace(/^--/, '').split('=');
    acc[key] = parseInt(val) || val;
    return acc;
}, {});

const BASE_URL = args.url || 'http://127.0.0.1:3000';
const CONNECTIONS = args.connections || 50;
const DURATION_SEC = args.duration || 30;
const API_KEY = args.apikey || 'bv-dev-key-2024-change-in-production';

// Stats
const stats = {
    total: 0, success: 0, failed: 0,
    errors: {},
    latencies: [],
    startTime: null,
    endpoints: {}
};

function request(method, path, body = null) {
    return new Promise((resolve) => {
        const start = Date.now();
        const url = new URL(path, BASE_URL);

        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY
            },
            timeout: 15000
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const latency = Date.now() - start;
                stats.total++;
                stats.latencies.push(latency);

                if (!stats.endpoints[path]) {
                    stats.endpoints[path] = { total: 0, success: 0, failed: 0, latencies: [] };
                }
                stats.endpoints[path].total++;
                stats.endpoints[path].latencies.push(latency);

                if (res.statusCode >= 200 && res.statusCode < 500) {
                    stats.success++;
                    stats.endpoints[path].success++;
                } else {
                    stats.failed++;
                    stats.endpoints[path].failed++;
                    stats.errors[res.statusCode] = (stats.errors[res.statusCode] || 0) + 1;
                }
                resolve({ status: res.statusCode, latency, data });
            });
        });

        req.on('error', (err) => {
            const latency = Date.now() - start;
            stats.total++;
            stats.failed++;
            stats.latencies.push(latency);
            stats.errors[err.code] = (stats.errors[err.code] || 0) + 1;
            resolve({ status: 0, latency, error: err.code });
        });

        req.on('timeout', () => {
            stats.total++;
            stats.failed++;
            stats.errors['TIMEOUT'] = (stats.errors['TIMEOUT'] || 0) + 1;
            req.destroy();
            resolve({ status: 0, latency: 15000, error: 'TIMEOUT' });
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Test scenarios with weighted distribution
const scenarios = [
    {
        name: 'Health Check',
        weight: 25,
        fn: () => request('GET', '/health')
    },
    {
        name: 'Root Info',
        weight: 10,
        fn: () => request('GET', '/')
    },
    {
        name: 'Wallet Status',
        weight: 10,
        fn: () => request('GET', '/api/web3/wallet/status')
    },
    {
        name: 'Wallet Balance',
        weight: 5,
        fn: () => request('GET', '/api/web3/wallet/balance')
    },
    {
        name: 'Gas Prices',
        weight: 5,
        fn: () => request('GET', '/api/web3/wallet/gas')
    },
    {
        name: 'Contracts Status',
        weight: 5,
        fn: () => request('GET', '/api/web3/contracts')
    },
    {
        name: 'ZKP Status',
        weight: 5,
        fn: () => request('GET', '/api/zkp/status')
    },
    {
        name: 'Verify Media (miss)',
        weight: 10,
        fn: () => request('GET', `/api/web3/verify/${crypto.randomBytes(32).toString('hex')}`)
    },
    {
        name: 'Anchor Media',
        weight: 10,
        fn: () => request('POST', '/api/web3/anchor', {
            mediaHash: crypto.randomBytes(32).toString('hex'),
            bioSignature: `bpm:${60 + Math.floor(Math.random() * 40)}:conf:${70 + Math.floor(Math.random() * 30)}`,
            hardwareID: `load-test-device-${Math.floor(Math.random() * 100)}`,
            ipfsHash: ''
        })
    },
    {
        name: 'ZKP Generate',
        weight: 5,
        fn: () => request('POST', '/api/zkp/generate', {
            circuitName: 'bio_match',
            inputs: {
                bpm: 72,
                confidence: 85,
                threshold: 60,
                publicHash: String(Math.floor(Math.random() * 1e9))
            }
        })
    },
    {
        name: 'Auth Register',
        weight: 5,
        fn: () => request('POST', '/api/auth/register', {
            email: `load_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.io`,
            password: 'LoadTest123!'
        })
    },
    {
        name: 'Validation (bad)',
        weight: 5,
        fn: () => request('POST', '/api/web3/anchor', {})
    }
];

function pickScenario() {
    const totalWeight = scenarios.reduce((sum, s) => sum + s.weight, 0);
    let r = Math.random() * totalWeight;
    for (const s of scenarios) {
        r -= s.weight;
        if (r <= 0) return s;
    }
    return scenarios[0];
}

function percentile(arr, p) {
    if (!arr.length) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(p / 100 * sorted.length) - 1)];
}

async function worker(endTime) {
    while (Date.now() < endTime) {
        const scenario = pickScenario();
        await scenario.fn();
        await new Promise(r => setTimeout(r, 10 + Math.random() * 90));
    }
}

function printResults() {
    const duration = (Date.now() - stats.startTime) / 1000;
    const rps = (stats.total / duration).toFixed(1);
    const avg = stats.latencies.length
        ? (stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length).toFixed(0)
        : 0;

    console.log('\n' + '='.repeat(70));
    console.log('  BioVault Load Test Results');
    console.log('='.repeat(70));
    console.log(`  Duration:      ${duration.toFixed(1)}s`);
    console.log(`  Connections:   ${CONNECTIONS}`);
    console.log(`  Total Reqs:    ${stats.total}`);
    console.log(`  Throughput:    ${rps} req/s`);
    console.log(`  Success:       ${stats.success} (${(stats.success / stats.total * 100).toFixed(1)}%)`);
    console.log(`  Failed:        ${stats.failed} (${(stats.failed / stats.total * 100).toFixed(1)}%)`);
    console.log('');
    console.log('  Latency:');
    console.log(`    Min:         ${Math.min(...stats.latencies)}ms`);
    console.log(`    Avg:         ${avg}ms`);
    console.log(`    P50:         ${percentile(stats.latencies, 50)}ms`);
    console.log(`    P95:         ${percentile(stats.latencies, 95)}ms`);
    console.log(`    P99:         ${percentile(stats.latencies, 99)}ms`);
    console.log(`    Max:         ${Math.max(...stats.latencies)}ms`);

    if (Object.keys(stats.errors).length) {
        console.log('');
        console.log('  Errors:');
        for (const [code, count] of Object.entries(stats.errors)) {
            console.log(`    ${code}: ${count}`);
        }
    }

    console.log('');
    console.log('  Per-Endpoint Breakdown:');
    console.log('  ' + '-'.repeat(68));
    for (const [path, d] of Object.entries(stats.endpoints).sort((a, b) => b[1].total - a[1].total)) {
        const eavg = (d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length).toFixed(0);
        const ep95 = percentile(d.latencies, 95);
        const rate = (d.success / d.total * 100).toFixed(0);
        console.log(`  ${path}`);
        console.log(`    Reqs: ${d.total} | OK: ${rate}% | Avg: ${eavg}ms | P95: ${ep95}ms`);
    }

    console.log('='.repeat(70));

    const successRate = stats.success / stats.total * 100;
    console.log('');
    if (successRate >= 95 && parseInt(avg) < 2000) {
        console.log('  PASS — Success rate >=95% and avg latency <2s');
    } else {
        console.log('  FAIL —');
        if (successRate < 95) console.log(`     Success rate ${successRate.toFixed(1)}% < 95%`);
        if (parseInt(avg) >= 2000) console.log(`     Avg latency ${avg}ms >= 2000ms`);
    }
    console.log('');

    process.exit(successRate >= 95 ? 0 : 1);
}

async function main() {
    console.log(`\n  BioVault Load Test`);
    console.log(`  Target:      ${BASE_URL}`);
    console.log(`  Connections:  ${CONNECTIONS}`);
    console.log(`  Duration:     ${DURATION_SEC}s\n`);

    try {
        const h = await request('GET', '/health');
        if (h.status !== 200) {
            console.error('  Server not healthy. Start backend first.');
            process.exit(1);
        }
        console.log('  Server:       Healthy\n');
    } catch {
        console.error('  Cannot reach server at', BASE_URL);
        process.exit(1);
    }

    stats.startTime = Date.now();
    const endTime = stats.startTime + (DURATION_SEC * 1000);

    const progress = setInterval(() => {
        const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
        const rps = (stats.total / ((Date.now() - stats.startTime) / 1000)).toFixed(1);
        process.stdout.write(`\r  Running... ${elapsed}s | ${stats.total} reqs | ${rps} req/s | ${stats.failed} errors`);
    }, 1000);

    const workers = Array.from({ length: CONNECTIONS }, () => worker(endTime));
    await Promise.all(workers);

    clearInterval(progress);
    process.stdout.write('\r' + ' '.repeat(80) + '\r');

    printResults();
}

main().catch(e => { console.error(e); process.exit(1); });
