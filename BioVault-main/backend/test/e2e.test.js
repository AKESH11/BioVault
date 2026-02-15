#!/usr/bin/env node
/**
 * Bio-Vault End-to-End Integration Tests
 *
 * Prerequisites:
 *   1. IPFS daemon running (ipfs daemon)
 *   2. Hardhat node running (npx hardhat node)
 *   3. Contracts deployed (npx hardhat run scripts/deploy.js --network localhost)
 *   4. Backend server running (cd backend && node src/index.js)
 *
 * Run:  node test/e2e.test.js
 */

const http = require('http');
const crypto = require('crypto');
const WebSocket = require('ws');

const BASE = 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'bv-dev-key-2024-change-in-production';
let passed = 0;
let failed = 0;
const errors = [];

// ── Utils ────────────────────────────────────────────────────────────────────

function request(method, path, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
            },
            timeout: 30000,
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function assert(condition, name, detail) {
    if (condition) {
        passed++;
        console.log(`  ✅ ${name}`);
    } else {
        failed++;
        const msg = `${name}${detail ? ': ' + detail : ''}`;
        errors.push(msg);
        console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
    }
}

/** Log the server error response for debugging */
function logIfError(label, res) {
    if (res.status >= 400) {
        const errMsg = typeof res.body === 'object' ? JSON.stringify(res.body).substring(0, 200) : String(res.body).substring(0, 200);
        console.log(`     ⚠ ${label} [${res.status}]: ${errMsg}`);
    }
}

// ── Test Data ────────────────────────────────────────────────────────────────

const MEDIA_HASH = crypto.randomBytes(32).toString('hex'); // 64 hex chars
const BIO_SIGNATURE = `rppg-bpm-72-ts-${Date.now()}`;
const HARDWARE_ID = 'pixel8-prnu-' + crypto.randomBytes(8).toString('hex');
const WALLET_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // Hardhat #0

// ── Tests ────────────────────────────────────────────────────────────────────

async function testHealth() {
    console.log('\n🩺 Health Check');
    const { status, body } = await request('GET', '/health');
    assert(status === 200, 'Health returns 200');
    assert(body.server === 'healthy', 'Server healthy');
    assert(body.ipfs?.status === 'connected', `IPFS connected (v${body.ipfs?.version})`);
    assert(body.blockchain?.status === 'connected', `Blockchain connected (block ${body.blockchain?.block})`);
}

async function testRootInfo() {
    console.log('\n📋 Root Info');
    const { status, body } = await request('GET', '/');
    assert(status === 200, 'Root returns 200');
    assert(body.name === 'Bio-Vault Protocol API', 'API name correct');
    assert(body.version === '1.0.0', 'API version 1.0.0');
    assert(body.endpoints?.web3, 'Web3 endpoints listed');
}

async function testWalletStatus() {
    console.log('\n👛 Wallet');
    const { status, body } = await request('GET', '/api/web3/wallet/status');
    assert(status === 200, 'Wallet status returns 200');
    assert(body.address === WALLET_ADDRESS, `Address: ${body.address}`);
    assert(body.chainId === 31337 || body.chainId === 80002, `Chain ID: ${body.chainId}`);
}

async function testWalletBalance() {
    const { status, body } = await request('GET', '/api/web3/wallet/balance');
    assert(status === 200, 'Balance returns 200');
    assert(body.formatted?.includes('POL'), `Balance: ${body.formatted}`);
}

async function testWalletNonce() {
    const { status, body } = await request('GET', '/api/web3/wallet/nonce');
    assert(status === 200, 'Nonce returns 200');
    assert(typeof body.nonce === 'number', `Nonce: ${body.nonce}`);
}

async function testWalletGas() {
    const { status, body } = await request('GET', '/api/web3/wallet/gas');
    assert(status === 200, 'Gas returns 200');
    assert(body.slow && body.standard && body.fast, 'Gas tiers present');
}

async function testContracts() {
    console.log('\n📜 Contracts');
    const { status, body } = await request('GET', '/api/web3/contracts');
    assert(status === 200, 'Contracts returns 200');
    assert(body.mediaAnchor?.initialized === true, 'MediaAnchor initialized');
    assert(body.authenticityToken?.initialized === true, 'AuthenticityToken initialized');
    assert(body.mediaAnchor?.connected === true, 'MediaAnchor on-chain check passed');
    assert(body.authenticityToken?.connected === true, 'AuthenticityToken on-chain check passed');
}

async function testZKPStatus() {
    console.log('\n🔐 ZKP Circuits');
    const { status, body } = await request('GET', '/api/zkp/status');
    assert(status === 200, 'ZKP status returns 200');
    assert(body.circuits?.verify?.ready === true, 'verify circuit ready');
    assert(body.circuits?.bio_match?.ready === true, 'bio_match circuit ready');
}

let IPFS_CID = null;

async function testIPFSUpload() {
    console.log('\n📦 IPFS Upload');
    const testPayload = Buffer.from(JSON.stringify({
        test: true,
        mediaHash: MEDIA_HASH,
        timestamp: Date.now(),
    })).toString('base64');

    const { status, body } = await request('POST', '/api/ipfs/upload', {
        data: testPayload,
        filename: 'test-media.json',
        metadata: { type: 'test', hash: MEDIA_HASH },
    });
    assert(status === 200, 'Upload returns 200');
    assert(body.success === true, 'Upload succeeded');
    assert(body.cid && body.cid.length > 10, `CID: ${body.cid}`);
    IPFS_CID = body.metadataCID || body.cid;  // prefer metadata CID if returned
    return body.cid;
}

async function testIPFSRetrieve(cid) {
    console.log('\n📥 IPFS Retrieve');
    const _cid = cid || IPFS_CID;
    if (!_cid) { assert(false, 'Skipped — no CID from upload'); return; }

    const { status, body } = await request('GET', `/api/ipfs/${_cid}`);
    assert(status === 200, 'Retrieve returns 200');
    assert(body.success === true, 'Retrieve succeeded');
    assert(body.data && body.data.length > 0, `Data length: ${body.size} bytes`);
}

async function testIPFSPin(cid) {
    const _cid = cid || IPFS_CID;
    if (!_cid) return;
    const { status, body } = await request('POST', '/api/ipfs/pin', { cid: _cid });
    assert(status === 200, 'Pin returns 200');
    assert(body.success === true, 'Pin succeeded');
}

async function testAnchorMedia(ipfsCid) {
    console.log('\n⚓ Anchor Media');
    const { status, body } = await request('POST', '/api/web3/anchor', {
        mediaHash: MEDIA_HASH,
        bioSignature: BIO_SIGNATURE,
        hardwareID: HARDWARE_ID,
        consensusParties: [],
        ipfsHash: ipfsCid || 'QmTestHash',
        proofOfRealityHash: crypto.randomBytes(32).toString('hex'),
        proofOfRealityIPFS: ipfsCid || 'QmTestProofHash',
        allUniqueSignals: true,
        detectedFaces: 1,
    });
    assert(status === 200, 'Anchor returns 200');
    assert(body.success === true, 'Anchor succeeded');
    assert(body.transactionHash, `Tx: ${body.transactionHash}`);
    assert(body.blockNumber > 0, `Block: ${body.blockNumber}`);
    assert(body.gasUsed, `Gas: ${body.gasUsed}`);
}

async function testVerifyMedia() {
    console.log('\n🔍 Verify Media');
    const { status, body } = await request('GET', `/api/web3/verify/${MEDIA_HASH}`);
    assert(status === 200, 'Verify returns 200');
    assert(body.exists === true, 'Media exists on-chain');
    assert(body.isValid === true, 'Media is valid');
    assert(Number(body.timestamp) > 0, `Timestamp: ${body.date}`);
}

async function testGetRecord() {
    console.log('\n📄 Get Record');
    const { status, body } = await request('GET', `/api/web3/record/${MEDIA_HASH}`);
    assert(status === 200, 'Record returns 200');
    assert(body.mediaHash === MEDIA_HASH, 'Hash matches');
    assert(body.bioSignature === BIO_SIGNATURE, 'Bio-signature matches');
    assert(body.hardwareID === HARDWARE_ID, 'Hardware ID matches');
    assert(body.creator === WALLET_ADDRESS, `Creator: ${body.creator}`);
    assert(body.allUniqueSignals === true, 'All unique signals = true');
    assert(body.detectedFaces === 1, 'Detected faces = 1');
}

async function testCreatorMedia() {
    console.log('\n👤 Creator Media');
    const { status, body } = await request('GET', `/api/web3/creator/${WALLET_ADDRESS}`);
    assert(status === 200, 'Creator media returns 200');
    assert(body.mediaCount > 0, `Media count: ${body.mediaCount}`);
    assert(body.mediaHashes.includes(MEDIA_HASH), 'Our hash found');
}

async function testConsent() {
    const { status, body } = await request('GET', `/api/web3/consent/${MEDIA_HASH}/${WALLET_ADDRESS}`);
    assert(status === 200, 'Consent check returns 200');
    // Creator always has consent
    assert(typeof body.consented === 'boolean', `Consented: ${body.consented}`);
}

async function testDisputeMedia() {
    console.log('\n⚖️  Dispute Media');
    const { status, body } = await request('POST', '/api/web3/dispute', {
        mediaHash: MEDIA_HASH,
        reason: 'Automated E2E test: checking dispute functionality works end-to-end',
    });
    assert(status === 200, 'Dispute returns 200');
    assert(body.success === true, 'Dispute succeeded');
    assert(body.transactionHash, `Tx: ${body.transactionHash}`);
}

async function testGetDisputes() {
    const { status, body } = await request('GET', `/api/web3/disputes/${MEDIA_HASH}`);
    logIfError('getDisputes', { status, body });
    assert(status === 200, 'Get disputes returns 200');
    assert(body.disputeCount >= 1, `Disputes: ${body.disputeCount}`);
    assert(body.disputes && body.disputes[0]?.reason?.includes('E2E test'), 'Dispute reason recorded');
}

async function testMintToken(ipfsCid) {
    console.log('\n🪙 Mint Token');
    const { status, body } = await request('POST', '/api/web3/mint', {
        to: WALLET_ADDRESS,
        mediaHash: MEDIA_HASH,
        bioSignature: BIO_SIGNATURE,
        hardwareID: HARDWARE_ID,
        ipfsHash: ipfsCid || 'QmTestHash',
    });
    logIfError('mint', { status, body });
    assert(status === 200, 'Mint returns 200');
    assert(body.success === true, 'Mint succeeded');
    assert(body.tokenId, `Token ID: ${body.tokenId}`);
    assert(body.transactionHash, `Tx: ${body.transactionHash}`);
    return body.tokenId;
}

async function testGetToken() {
    console.log('\n🎫 Get Token');
    const { status, body } = await request('GET', `/api/web3/token/${MEDIA_HASH}`);
    assert(status === 200, 'Get token returns 200');
    assert(body.exists === true, 'Token exists');
    assert(body.tokenId, `Token ID: ${body.tokenId}`);
    assert(body.owner === WALLET_ADDRESS, `Owner: ${body.owner}`);
    assert(body.soulbound === true, 'Token is soulbound');
    assert(body.anchor?.mediaHash === MEDIA_HASH, 'Anchor data matches');
}

async function testGetTokenBalance() {
    const { status, body } = await request('GET', `/api/web3/balance/${WALLET_ADDRESS}`);
    assert(status === 200, 'Token balance returns 200');
    assert(Number(body.balance) >= 1, `Balance: ${body.balance}`);
}

async function testZKPBioMatch() {
    console.log('\n🧬 ZKP bio_match (generate + verify)');

    // Compute the Poseidon commitment hash for actualBPM=72, nonce=12345
    // The circuit computes: commitmentHash == Poseidon([actualBPM, nonce])
    // We need to compute this matching value.
    // Use snarkjs to compute the witness and extract the public signal.
    // For testing, let's generate the proof and verify it — the circuit computes
    // commitmentHash itself from actualBPM and nonce.

    // First, we need the correct commitmentHash. The bio_match circuit checks:
    //   commitmentHash == Poseidon([actualBPM, nonce])
    // We can pre-compute this OR just try — if it fails, we'll get an error.
    // Let's use the snarkjs wasm to compute it first via a workaround.

    // Actually — let's just call the generate endpoint directly.
    // The circuit has commitmentHash as a public input that must match Poseidon(actualBPM, nonce).
    // We need to pre-compute this. Let's use a Node.js approach:

    let commitmentHash;
    try {
        // Try to compute Poseidon hash offline
        const buildPoseidon = require('circomlibjs').buildPoseidon;
        const poseidon = await buildPoseidon();
        const hash = poseidon([72, 12345]);
        commitmentHash = poseidon.F.toString(hash, 10);
    } catch (e) {
        // Fallback — use a pre-known value from the previous test run
        console.log('  ⚠️  Cannot compute Poseidon hash locally, skipping bio_match test');
        assert(false, 'bio_match — circomlibjs not available');
        return;
    }

    const genRes = await request('POST', '/api/zkp/generate', {
        circuitType: 'bio_match',
        minBPM: 40,
        maxBPM: 200,
        commitmentHash: commitmentHash,
        actualBPM: 72,
        nonce: '12345',
    });
    assert(genRes.status === 200, 'Generate returns 200');
    assert(genRes.body.success === true, 'Proof generated');
    assert(genRes.body.proof, 'Proof object present');
    assert(genRes.body.publicSignals, `Public signals: ${JSON.stringify(genRes.body.publicSignals)}`);
    assert(genRes.body.generationTimeMs > 0, `Time: ${genRes.body.generationTimeMs}ms`);

    // Verify the generated proof
    const verRes = await request('POST', '/api/zkp/verify', {
        proof: genRes.body.proof,
        publicSignals: genRes.body.publicSignals,
        circuitType: 'bio_match',
    });
    assert(verRes.status === 200, 'Verify returns 200');
    assert(verRes.body.isValid === true, 'Proof is VALID ✓');
}

async function testZKPVerifyCircuit() {
    console.log('\n🔏 ZKP verify circuit (generate + verify)');

    const genRes = await request('POST', '/api/zkp/generate', {
        circuitType: 'verify',
        publicHash: '123456789',
        timestamp: Math.floor(Date.now() / 1000),
        videoPixels: '987654321',
        bioSignature: '72',
        hardwareID: '42',
    });
    assert(genRes.status === 200, 'Generate returns 200');
    assert(genRes.body.success === true, 'Proof generated');

    const verRes = await request('POST', '/api/zkp/verify', {
        proof: genRes.body.proof,
        publicSignals: genRes.body.publicSignals,
        circuitType: 'verify',
    });
    assert(verRes.status === 200, 'Verify returns 200');
    assert(verRes.body.isValid === true, 'Proof is VALID ✓');
}

async function testWebSocket() {
    console.log('\n🔌 WebSocket');
    return new Promise((resolve) => {
        const ws = new WebSocket('ws://localhost:3000/ws');
        let connected = false;
        
        const timer = setTimeout(() => {
            ws.close();
            assert(connected, 'WebSocket connected');
            resolve();
        }, 5000);

        ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'connected') {
                    connected = true;
                    assert(true, 'Received welcome message');
                    assert(msg.timestamp, `Server time: ${msg.timestamp}`);
                    clearTimeout(timer);
                    ws.close();
                    resolve();
                }
            } catch { /* ignore */ }
        });

        ws.on('error', () => {
            assert(false, 'WebSocket connection failed');
            clearTimeout(timer);
            resolve();
        });
    });
}

async function testValidationErrors() {
    console.log('\n🚫 Validation (negative tests)');

    // Missing required fields
    const r1 = await request('POST', '/api/web3/anchor', {});
    assert(r1.status === 400, 'Anchor without body → 400');

    // Invalid address in consensusParties
    const r2 = await request('POST', '/api/web3/anchor', {
        mediaHash: 'abc123',
        bioSignature: 'test',
        hardwareID: 'test',
        consensusParties: ['not-an-address'],
        ipfsHash: 'QmTest',
    });
    assert(r2.status === 400, 'Invalid address → 400');

    // Short dispute reason
    const r3 = await request('POST', '/api/web3/dispute', {
        mediaHash: MEDIA_HASH,
        reason: 'short',
    });
    assert(r3.status === 400, 'Short dispute reason → 400');

    // Unknown circuit type
    const r4 = await request('POST', '/api/zkp/generate', {
        circuitType: 'nonexistent',
    });
    assert(r4.status === 400, 'Unknown circuit → 400');

    // 404 route
    const r5 = await request('GET', '/api/nonexistent');
    assert(r5.status === 404, 'Unknown route → 404');
}

async function testRevokeMedia() {
    console.log('\n🔒 Revoke Media');
    // Anchor a new media just for revocation
    const revokeHash = crypto.randomBytes(32).toString('hex');
    const anchorRes = await request('POST', '/api/web3/anchor', {
        mediaHash: revokeHash,
        bioSignature: 'test-bio',
        hardwareID: 'test-hw',
        consensusParties: [],
        ipfsHash: 'QmRevokeTest',
    });
    assert(anchorRes.status === 200, 'Anchored media for revoke test');
    logIfError('revoke-anchor', anchorRes);

    const { status, body } = await request('POST', '/api/web3/revoke', { mediaHash: revokeHash });
    logIfError('revoke', { status, body });
    assert(status === 200, 'Revoke returns 200');
    assert(body.success === true, 'Revoke succeeded');

    // Verify it shows as not valid
    const verifyRes = await request('GET', `/api/web3/verify/${revokeHash}`);
    assert(verifyRes.body.exists === true, 'Revoked media still exists');
    assert(verifyRes.body.isValid === false, 'Revoked media is NOT valid');
}

// ── Full Pipeline E2E ────────────────────────────────────────────────────────

async function testFullPipeline() {
    console.log('\n🔗 Full Pipeline (register → login → IPFS → anchor → verify → ZKP)');

    // 1. Register a fresh user
    const email = `pipeline-${Date.now()}@test.bio`;
    const password = 'Pipeline!Test123';

    const regRes = await request('POST', '/api/auth/register', { email, password });
    assert(regRes.status === 201, 'Pipeline: register → 201');
    assert(regRes.body.accessToken, 'Pipeline: register returns accessToken');
    assert(regRes.body.refreshToken, 'Pipeline: register returns refreshToken');
    assert(regRes.body.user && regRes.body.user.email === email, 'Pipeline: register returns user');

    const accessToken = regRes.body.accessToken;
    const refreshToken = regRes.body.refreshToken;

    // 2. Login with same credentials
    const loginRes = await request('POST', '/api/auth/login', { email, password });
    assert(loginRes.status === 200, 'Pipeline: login → 200');
    assert(loginRes.body.accessToken, 'Pipeline: login returns accessToken');
    assert(loginRes.body.user.email === email, 'Pipeline: login returns correct user');

    // 3. Refresh token
    const refreshRes = await request('POST', '/api/auth/refresh', { refreshToken });
    assert(refreshRes.status === 200, 'Pipeline: refresh → 200');
    assert(refreshRes.body.accessToken, 'Pipeline: refresh returns new accessToken');

    // 4. Get profile with Bearer token
    const meRes = await new Promise((resolve, reject) => {
        const url = new URL('/api/auth/me', BASE);
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
                'Authorization': `Bearer ${refreshRes.body.accessToken}`,
            },
            timeout: 30000,
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
                catch { resolve({ status: res.statusCode, body: data }); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
    });
    assert(meRes.status === 200, 'Pipeline: /me → 200');
    assert(meRes.body.user && meRes.body.user.email === email, 'Pipeline: /me returns correct user');

    // 5. Upload media metadata to IPFS
    const pipelineHash = crypto.randomBytes(32).toString('hex');
    const bioSig = `rppg-bpm-68-pipeline-${Date.now()}`;
    const hwId = 'pipeline-hw-' + crypto.randomBytes(4).toString('hex');

    const metadata = {
        mediaHash: pipelineHash,
        bioSignature: bioSig,
        hardwareID: hwId,
        timestamp: new Date().toISOString(),
        captureDevice: 'pipeline-test',
        bpm: 68,
        confidence: 0.91,
    };

    const ipfsRes = await request('POST', '/api/ipfs/upload', {
        data: Buffer.from(JSON.stringify(metadata)).toString('base64'),
        filename: `pipeline_${Date.now()}.json`,
        metadata: { type: 'pipeline-test', hash: pipelineHash },
    });
    assert(ipfsRes.status === 200, 'Pipeline: IPFS upload → 200');
    assert(ipfsRes.body.cid, `Pipeline: IPFS CID = ${ipfsRes.body.cid}`);
    const ipfsCid = ipfsRes.body.cid;

    // 6. Retrieve from IPFS
    const ipfsGetRes = await request('GET', `/api/ipfs/${ipfsCid}`);
    assert(ipfsGetRes.status === 200, 'Pipeline: IPFS retrieve → 200');

    // 7. Anchor on blockchain
    const anchorRes = await request('POST', '/api/web3/anchor', {
        mediaHash: pipelineHash,
        bioSignature: bioSig,
        hardwareID: hwId,
        consensusParties: [],
        ipfsHash: ipfsCid,
    });
    assert(anchorRes.status === 200, 'Pipeline: anchor → 200');
    logIfError('pipeline-anchor', anchorRes);
    assert(anchorRes.body.success === true, 'Pipeline: anchor succeeded');
    assert(anchorRes.body.transactionHash, `Pipeline: txHash = ${anchorRes.body.transactionHash}`);

    // 8. Verify on-chain
    const verifyRes = await request('GET', `/api/web3/verify/${pipelineHash}`);
    assert(verifyRes.status === 200, 'Pipeline: verify → 200');
    assert(verifyRes.body.exists === true, 'Pipeline: media exists on-chain');
    assert(verifyRes.body.isValid === true, 'Pipeline: media is valid');

    // 9. Get full record
    const recordRes = await request('GET', `/api/web3/record/${pipelineHash}`);
    assert(recordRes.status === 200, 'Pipeline: record → 200');
    assert(recordRes.body.bioSignature === bioSig, 'Pipeline: bioSignature matches');
    assert(recordRes.body.ipfsHash === ipfsCid, 'Pipeline: IPFS hash matches');

    // 10. Mint authenticity token
    const mintRes = await request('POST', '/api/web3/mint', {
        to: WALLET_ADDRESS,
        mediaHash: pipelineHash,
        bioSignature: bioSig,
        hardwareID: hwId,
        ipfsHash: ipfsCid,
    });
    assert(mintRes.status === 200, 'Pipeline: mint → 200');
    assert(mintRes.body.success === true, 'Pipeline: token minted');
    assert(mintRes.body.tokenId, `Pipeline: tokenId = ${mintRes.body.tokenId}`);

    // 11. ZKP proof generation and verification (verify circuit — simpler)
    const zkpGenRes = await request('POST', '/api/zkp/generate', {
        circuitType: 'verify',
        publicHash: '123456789',
        timestamp: Math.floor(Date.now() / 1000),
        videoPixels: '987654321',
        bioSignature: '68',
        hardwareID: '42',
    });
    logIfError('pipeline-zkp-gen', zkpGenRes);
    assert(zkpGenRes.status === 200, 'Pipeline: ZKP generate → 200');
    assert(zkpGenRes.body.proof, 'Pipeline: ZKP proof present');

    const zkpVerRes = await request('POST', '/api/zkp/verify', {
        proof: zkpGenRes.body.proof,
        publicSignals: zkpGenRes.body.publicSignals,
        circuitType: 'verify',
    });
    assert(zkpVerRes.status === 200, 'Pipeline: ZKP verify → 200');
    assert(zkpVerRes.body.isValid === true, 'Pipeline: ZKP proof valid ✓');

    // 12. Dispute the media
    const disputeRes = await request('POST', '/api/web3/dispute', {
        mediaHash: pipelineHash,
        reason: 'Pipeline test dispute — automated E2E verification of full lifecycle',
    });
    assert(disputeRes.status === 200, 'Pipeline: dispute → 200');
    assert(disputeRes.body.success === true, 'Pipeline: dispute filed');

    // 13. Verify dispute shows up
    const disputeListRes = await request('GET', `/api/web3/disputes/${pipelineHash}`);
    assert(disputeListRes.status === 200, 'Pipeline: disputes list → 200');
    assert(disputeListRes.body.disputeCount >= 1, `Pipeline: dispute count = ${disputeListRes.body.disputeCount}`);

    console.log('  🎉 Full pipeline complete: register → login → refresh → IPFS → anchor → verify → record → mint → ZKP → dispute');
}

// ── Runner ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('═══════════════════════════════════════════════════════');
    console.log('  Bio-Vault Protocol — End-to-End Integration Tests  ');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`Target: ${BASE}`);
    console.log(`Media Hash: ${MEDIA_HASH}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);

    const start = Date.now();

    try {
        // Infrastructure checks
        await testHealth();
        await testRootInfo();

        // Wallet
        await testWalletStatus();
        await testWalletBalance();
        await testWalletNonce();
        await testWalletGas();

        // Contracts
        await testContracts();

        // ZKP circuits
        await testZKPStatus();

        // IPFS
        const cid = await testIPFSUpload();
        await testIPFSRetrieve(cid);
        await testIPFSPin(cid);

        // Blockchain — full lifecycle
        await testAnchorMedia(cid);
        await testVerifyMedia();
        await testGetRecord();
        await testCreatorMedia();
        await testConsent();
        await testDisputeMedia();
        await testGetDisputes();
        await testMintToken(cid);
        await testGetToken();
        await testGetTokenBalance();
        await testRevokeMedia();

        // ZKP proof generation + verification
        await testZKPBioMatch();
        await testZKPVerifyCircuit();

        // WebSocket
        await testWebSocket();

        // Negative tests
        await testValidationErrors();

        // Full pipeline: register → login → IPFS → anchor → verify → ZKP
        await testFullPipeline();

    } catch (err) {
        console.error('\n💥 Fatal test error:', err.message);
        failed++;
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log('\n═══════════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed (${elapsed}s)`);
    console.log('═══════════════════════════════════════════════════════');

    if (errors.length > 0) {
        console.log('\nFailures:');
        errors.forEach((e, i) => console.log(`  ${i + 1}. ${e}`));
    }

    process.exit(failed > 0 ? 1 : 0);
}

main();
