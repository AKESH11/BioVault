# BioVault API Documentation

**Base URL**: `https://api.biovault.io` (production) | `http://127.0.0.1:3000` (development)

**Authentication**: Protected routes require either:
- `x-api-key` header with valid API key, OR
- `Authorization: Bearer <jwt_token>` header

---

## Health & Status

### `GET /health`
Server health and service connectivity.

**Auth**: None

```json
// Response 200
{
  "server": "healthy",
  "timestamp": "2026-02-16T14:30:00.000Z",
  "uptime": 3600,
  "memory": { "rss": "120 MB", "heap": "30 MB" },
  "websockets": 2,
  "ipfs": { "status": "connected", "version": "0.34.1" },
  "blockchain": { "status": "connected", "block": 33967100 }
}
```

### `GET /`
API root with available endpoints.

```json
// Response 200
{
  "name": "Bio-Vault Protocol API",
  "version": "1.0.0",
  "endpoints": { "web3": "/api/web3", "ipfs": "/api/ipfs", "zkp": "/api/zkp", "auth": "/api/auth" }
}
```

---

## Authentication

### `POST /api/auth/register`
Create a new user account.

**Auth**: None

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | string | Yes | Valid email address |
| password | string | Yes | Min 8 characters |

```json
// Request
{ "email": "user@example.com", "password": "securePass123!" }

// Response 201
{
  "success": true,
  "user": { "id": "usr_abc123", "email": "user@example.com", "role": "user" },
  "accessToken": "eyJhbG...",
  "refreshToken": "eyJhbG..."
}
```

### `POST /api/auth/login`
Authenticate and receive tokens.

```json
// Request
{ "email": "user@example.com", "password": "securePass123!" }

// Response 200 — same shape as register
```

### `POST /api/auth/refresh`
Refresh an expired access token.

```json
// Request
{ "refreshToken": "eyJhbG..." }

// Response 200
{ "success": true, "accessToken": "eyJhbG...", "refreshToken": "eyJhbG..." }
```

### `GET /api/auth/me`
Get current user profile.

**Auth**: Required (JWT)

```json
// Response 200
{ "success": true, "user": { "id": "usr_abc123", "email": "user@example.com", "role": "user" } }
```

---

## Blockchain (Web3)

### `GET /api/web3/wallet/status`
Wallet address and chain info.

```json
// Response 200
{ "address": "0xf39Fd6e5...", "chainId": 80002, "network": "amoy" }
```

### `GET /api/web3/wallet/balance`
Server wallet POL balance.

```json
// Response 200
{ "address": "0xf39Fd6e5...", "balance": "2.15", "symbol": "POL" }
```

### `GET /api/web3/wallet/nonce`
Current transaction nonce.

### `GET /api/web3/wallet/gas`
Current gas price tiers (slow/standard/fast).

### `GET /api/web3/contracts`
Deployed contract addresses and initialization status.

```json
// Response 200
{
  "mediaAnchor": { "address": "0x7bCD78...", "initialized": true },
  "authenticityToken": { "address": "0xCA4dBF...", "initialized": true },
  "verifier": { "address": "0x31f8e9...", "initialized": true }
}
```

### `POST /api/web3/anchor`
Anchor media hash to blockchain.

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mediaHash | string | Yes | SHA-256 hash of media content (hex, 64 chars) |
| bioSignature | string | Yes | Biometric signature string (e.g. `bpm:72:conf:85`) |
| hardwareID | string | Yes | Device PRNU fingerprint hash |
| ipfsHash | string | No | IPFS CID if media was uploaded |
| consensusParties | string[] | No | Addresses of consent parties |

```json
// Response 200
{ "success": true, "tx": "0x37cb6dd7...", "blockNumber": 6, "gasUsed": 579610 }

// Response 409 (duplicate)
{ "success": false, "error": "Media already anchored", "alreadyAnchored": true }
```

### `GET /api/web3/verify/:mediaHash`
Check if media is anchored and valid.

**Auth**: None

```json
// Response 200
{ "exists": true, "isValid": true, "timestamp": "2026-02-16T14:30:00.000Z" }
```

### `GET /api/web3/record/:mediaHash`
Get full anchor record.

```json
// Response 200
{
  "mediaHash": "a1b2c3d4...",
  "creator": "0xABC...",
  "bioSignature": "bpm:72:conf:85",
  "hardwareID": "device-prnu-hash",
  "ipfsHash": "QmX7b2J...",
  "timestamp": 1708100000,
  "isValid": true,
  "uniqueSignals": { "bpm": true, "prnu": true, "faces": 1 }
}
```

### `GET /api/web3/creator/:address`
Get all media anchored by a specific address.

### `GET /api/web3/consent/:mediaHash/:address`
Check if address consented to media capture.

### `POST /api/web3/dispute`
Dispute a media anchor.

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mediaHash | string | Yes | Hash of media to dispute |
| reason | string | Yes | Min 10 characters |

```json
// Response 200
{ "success": true, "tx": "0x4f7518...", "disputeId": 1 }
```

### `GET /api/web3/disputes/:mediaHash`
Get all disputes for a media hash.

### `POST /api/web3/revoke`
Revoke a media anchor (creator or consensus party only).

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| mediaHash | string | Yes | Hash of media to revoke |

### `POST /api/web3/mint`
Mint an ERC-721 AuthenticityToken (soulbound NFT).

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| to | string | Yes | Recipient Ethereum address |
| mediaHash | string | Yes | Hash of anchored media |
| bioSignature | string | Yes | Biometric signature |
| hardwareID | string | Yes | Device fingerprint |
| ipfsHash | string | No | IPFS CID |

```json
// Response 200
{ "success": true, "tokenId": 1, "tx": "0x5393f3..." }
```

### `GET /api/web3/token/:mediaHash`
Get token details by media hash.

### `GET /api/web3/balance/:address`
Get AuthenticityToken balance for an address.

### `POST /api/web3/verify-proof`
Verify a ZKP proof on-chain.

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| proof | object | Yes | Groth16 proof `{ a, b, c }` |
| publicSignals | array | Yes | Public input signals |

---

## IPFS

### `POST /api/ipfs/upload`
Upload content to IPFS (Kubo) with optional Pinata redundancy.

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| data | string | Yes | Base64-encoded content |
| filename | string | No | Optional filename |
| metadata | object | No | Optional metadata |

```json
// Response 200
{ "success": true, "cid": "QmX7b2J...", "size": 1024 }
```

### `GET /api/ipfs/:cid`
Retrieve content from IPFS by CID.

### `POST /api/ipfs/pin`
Pin content to prevent garbage collection.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| cid | string | Yes | IPFS CID to pin |

### `DELETE /api/ipfs/unpin/:cid`
Unpin content from IPFS.

---

## Zero-Knowledge Proofs

### `GET /api/zkp/status`
Get available circuits and their readiness.

```json
// Response 200
{
  "circuits": {
    "verify": { "ready": true, "constraints": 342 },
    "bio_match": { "ready": true, "constraints": 269 }
  }
}
```

### `POST /api/zkp/generate`
Generate a Groth16 ZKP proof.

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| circuitName | string | Yes | `verify` or `bio_match` |
| inputs | object | Yes | Circuit-specific inputs |

**bio_match inputs**: `{ bpm, confidence, threshold, publicHash }`
**verify inputs**: `{ videoPixelsHash, userPulseSignature, hardwarePRNU, blockchainAnchoredHash, timestamp }`

```json
// Response 200
{
  "success": true,
  "proof": { "pi_a": [...], "pi_b": [...], "pi_c": [...] },
  "publicSignals": ["1", "72", "200", "1157373..."],
  "generationTime": 420
}
```

### `POST /api/zkp/verify`
Verify a ZKP proof off-chain.

**Auth**: Required

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| proof | object | Yes | Proof from generate |
| publicSignals | array | Yes | Public signals from generate |
| circuitType | string | No | Circuit name (default: `verify`) |

```json
// Response 200
{ "success": true, "valid": true }
```

---

## WebSocket

### `ws://localhost:3000/ws`
Real-time event stream.

**Events sent by server**:
```json
// On connect
{ "type": "welcome", "message": "Bio-Vault WebSocket", "time": "2026-02-16T14:30:00.000Z" }

// On anchor
{ "type": "anchor", "mediaHash": "a1b2c3...", "tx": "0x37cb6d...", "block": 6 }

// On dispute
{ "type": "dispute", "mediaHash": "a1b2c3...", "reason": "Tampered" }
```

---

## Error Responses

All errors follow this format:
```json
{ "error": "Human-readable message", "details": ["field-level errors"] }
```

| Code | Meaning |
|------|---------|
| 400 | Validation error |
| 401 | Authentication required |
| 403 | Insufficient permissions |
| 404 | Not found |
| 409 | Conflict (duplicate anchor) |
| 429 | Rate limited (100 req/15min in prod) |
| 500 | Internal server error |

---

## Rate Limits

| Environment | Limit | Window |
|-------------|-------|--------|
| Development | 1000 requests | 15 minutes |
| Production | 100 requests | 15 minutes |

Rate limit headers:
- `X-RateLimit-Limit` — max requests
- `X-RateLimit-Remaining` — remaining
- `X-RateLimit-Reset` — reset timestamp
