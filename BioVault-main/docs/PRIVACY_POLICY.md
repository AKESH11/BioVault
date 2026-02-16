# BioVault Privacy Policy

**Last Updated: February 16, 2026**
**Effective Date: February 16, 2026**

## 1. Introduction

BioVault ("we," "our," "us") is a blockchain-based media authentication protocol that uses biometric signals to verify the authenticity of digital media. This Privacy Policy explains how we collect, use, store, and protect your personal information, including biometric data.

**This policy complies with:**
- General Data Protection Regulation (GDPR) — EU
- Biometric Information Privacy Act (BIPA) — Illinois, USA
- California Consumer Privacy Act (CCPA) — California, USA
- Lei Geral de Proteção de Dados (LGPD) — Brazil

---

## 2. Data We Collect

### 2.1 Biometric Data

| Data Type | What It Is | How It's Used | Stored Where |
|-----------|-----------|---------------|-------------|
| **rPPG Signal** | Heart rate pattern extracted from facial video via remote photoplethysmography | Generates a unique biometric signature proving a living person was present during media capture | On-device only (never uploaded raw) |
| **PRNU Fingerprint** | Photo Response Non-Uniformity — unique sensor noise pattern of your camera | Proves which specific device captured the media | On-device only (never uploaded raw) |
| **Biometric Hash** | One-way cryptographic hash (SHA-256) of your biometric signals | Anchored to blockchain as proof-of-reality; **cannot be reversed to reconstruct biometric data** | Blockchain (permanent, pseudonymous) |

### 2.2 Account Data

| Data Type | Purpose | Stored Where |
|-----------|---------|-------------|
| Email address | Account identification, password recovery | Encrypted server database |
| Password | Authentication | Salted + hashed (bcrypt, cost factor 12); **plaintext never stored** |
| JWT tokens | Session management | Device-side (AsyncStorage), server-side (SQLite) |

### 2.3 Media Metadata

| Data Type | Purpose | Stored Where |
|-----------|---------|-------------|
| Media hash (SHA-256) | Unique identifier for captured media | Blockchain (permanent) |
| Timestamp | When media was captured | Blockchain (permanent) |
| IPFS Content ID (CID) | Decentralized storage reference | IPFS network + Pinata pinning service |
| Device hardware ID | Links media to a specific device | Blockchain (pseudonymous) |
| GPS coordinates | **NOT collected** | N/A |

### 2.4 Technical Data

- Device model and OS version (for compatibility)
- App version
- Crash reports (via Sentry, anonymized)
- API usage logs (IP address, request timestamps — retained 30 days)

---

## 3. How We Use Your Data

| Purpose | Legal Basis (GDPR) |
|---------|-------------------|
| Authenticate media captures with biometric proof | Explicit consent (Article 9(2)(a)) |
| Anchor media hashes to blockchain | Legitimate interest (Article 6(1)(f)) |
| Store media on IPFS for decentralized access | Contract performance (Article 6(1)(b)) |
| Generate zero-knowledge proofs for privacy-preserving verification | Legitimate interest |
| Detect and prevent fraudulent media claims | Legitimate interest |
| Improve app performance and fix bugs | Legitimate interest |

---

## 4. Biometric Data — Special Protections

### 4.1 BIPA Compliance (Illinois)

In accordance with the Illinois Biometric Information Privacy Act (740 ILCS 14):

1. **Written Notice**: This policy serves as written notice that we collect biometric identifiers (rPPG heart rate patterns, PRNU camera fingerprints).

2. **Informed Consent**: We obtain your **explicit, opt-in consent** before collecting any biometric data. The app displays a consent prompt before the first biometric capture.

3. **Purpose Limitation**: Biometric data is collected **solely** for media authentication and proof-of-reality verification.

4. **Retention Schedule**:
   - Raw biometric signals: **Deleted immediately after hash generation** (never leaves device)
   - Biometric hashes on blockchain: **Permanent** (inherent to blockchain technology; hashes cannot be reversed to obtain biometric data)
   - Local biometric cache: **Deleted after 24 hours** or upon app data clearance

5. **No Sale or Profit**: We do **not** sell, lease, trade, or otherwise profit from your biometric data.

6. **No Disclosure**: We do **not** disclose biometric data to third parties except:
   - With your explicit consent
   - As required by law (court order, subpoena)
   - To blockchain networks (only irreversible hashes, not raw data)

7. **Destruction**: Raw biometric data is destroyed immediately after hash computation. To request deletion of your account data, see Section 8.

### 4.2 GDPR Compliance (EU)

- **Data Controller**: BioVault Protocol Team
- **Legal Basis for Biometric Processing**: Explicit consent per Article 9(2)(a)
- **Data Protection Officer**: privacy@biovault.io
- **Data Processing Records**: Maintained per Article 30

### 4.3 On-Device Processing

**Critical design principle**: All biometric signal extraction (rPPG, PRNU) occurs **on your device** using the C++ native engine. Raw biometric signals are **never transmitted** to our servers. Only cryptographic hashes (irreversible, one-way) are sent for blockchain anchoring.

```
[Camera Frames] → [On-Device C++ Engine] → [Biometric Signals]
                                                    ↓
                                            [SHA-256 Hash] ← Only this leaves device
                                                    ↓
                                            [Blockchain Anchor]
```

---

## 5. Blockchain & IPFS — Immutability Notice

### 5.1 Blockchain Data is Permanent

Data anchored to the Polygon blockchain **cannot be deleted**. This includes:
- Media content hashes
- Biometric signature hashes
- Timestamps
- Device hardware ID hashes
- Transaction metadata

**By using BioVault, you acknowledge and consent that blockchain-anchored data is permanent and immutable.**

### 5.2 IPFS Data

Media stored on IPFS can be unpinned (removed from our pinning services), but may persist on other IPFS nodes that have cached it. We will make reasonable efforts to remove unpinned content upon request.

---

## 6. Data Security

| Measure | Implementation |
|---------|---------------|
| Encryption in transit | TLS 1.3 (HTTPS) for all API communication |
| Encryption at rest | AES-256-GCM for sensitive server-side data |
| Password hashing | bcrypt with cost factor 12 |
| API authentication | JWT tokens + API key (constant-time comparison) |
| Smart contract security | Pausable, ReentrancyGuard, owner-only admin functions |
| Key management | Hardware Security Module (HSM) / AWS KMS for production keys |
| Biometric isolation | All biometric processing on-device; raw data never transmitted |
| Rate limiting | 100 requests per 15 minutes per IP (production) |
| Error tracking | Sentry with PII scrubbing enabled |

---

## 7. Data Retention

| Data Type | Retention Period | Deletion Method |
|-----------|-----------------|-----------------|
| Raw biometric signals | Immediately after hashing | Secure memory wipe on device |
| Account data (email, password hash) | Until account deletion request | Database deletion + backup purge within 30 days |
| JWT tokens | 24 hours (access) / 7 days (refresh) | Automatic expiry |
| API access logs | 30 days | Automatic rotation |
| Crash reports (Sentry) | 90 days | Automatic purge |
| Blockchain anchors | **Permanent** | Cannot be deleted (blockchain immutability) |
| IPFS media | Until unpin request + 90 days | Unpin from Pinata + Kubo; residual copies may persist on IPFS network |

---

## 8. Your Rights

### 8.1 All Users

| Right | How to Exercise |
|-------|----------------|
| **Access** | Request a copy of all data we hold about you |
| **Rectification** | Correct inaccurate account data |
| **Deletion** | Request deletion of account and off-chain data |
| **Portability** | Export your data in machine-readable format (JSON) |
| **Objection** | Object to processing based on legitimate interest |
| **Withdraw Consent** | Withdraw biometric consent at any time (stop using capture features) |

### 8.2 GDPR-Specific Rights (EU Residents)

- Right to lodge a complaint with your local Data Protection Authority
- Right to restrict processing
- Right not to be subject to automated decision-making

### 8.3 CCPA-Specific Rights (California Residents)

- Right to know what personal information is collected
- Right to delete personal information
- Right to opt-out of the sale of personal information (**We do not sell your data**)
- Right to non-discrimination for exercising your rights

### 8.4 BIPA-Specific Rights (Illinois Residents)

- Right to sue for violations ($1,000 per negligent violation, $5,000 per intentional violation)
- Right to have biometric data destroyed per our retention schedule

### 8.5 How to Submit Requests

Email: **privacy@biovault.io**

We will respond within:
- 30 days (GDPR)
- 45 days (CCPA)
- 30 days (BIPA)

### 8.6 Blockchain Limitation

**Important**: We cannot delete data that has been anchored to the blockchain. This is a fundamental property of blockchain technology. However:
- Blockchain data contains only **hashes** (not raw biometric data or media)
- Hashes cannot be reversed to obtain your personal information
- We can revoke/dispute blockchain records to mark them as invalid

---

## 9. Third-Party Services

| Service | Purpose | Data Shared | Privacy Policy |
|---------|---------|-------------|---------------|
| Polygon Network | Blockchain anchoring | Media hashes, biometric hashes, device IDs (all hashed) | [polygon.technology/privacy-policy](https://polygon.technology/privacy-policy) |
| IPFS / Kubo | Decentralized media storage | Encrypted media files | [ipfs.tech/privacy](https://docs.ipfs.tech/concepts/privacy/) |
| Pinata | IPFS pinning redundancy | IPFS CIDs (content identifiers) | [pinata.cloud/privacy](https://www.pinata.cloud/privacy-policy) |
| Sentry | Error tracking | Anonymized crash reports (PII scrubbed) | [sentry.io/privacy](https://sentry.io/privacy/) |

---

## 10. Children's Privacy

BioVault is not intended for use by individuals under the age of 16 (or 13 in jurisdictions where permitted). We do not knowingly collect biometric data from children. If you believe a child has provided us with data, contact privacy@biovault.io.

---

## 11. International Data Transfers

If you are located outside the jurisdiction where our servers are hosted, your data may be transferred internationally. We ensure appropriate safeguards:
- Standard Contractual Clauses (SCCs) for EU transfers
- Encryption in transit and at rest
- Data minimization principles

---

## 12. Changes to This Policy

We will notify you of material changes via:
- In-app notification
- Email (if provided)
- Updated "Last Updated" date above

Continued use after notification constitutes acceptance.

---

## 13. Contact

**BioVault Protocol Team**
- Privacy inquiries: privacy@biovault.io
- General support: support@biovault.io
- Security vulnerabilities: security@biovault.io

---

## 14. Consent

By creating a BioVault account and using the biometric capture features, you:

1. Acknowledge that you have read and understood this Privacy Policy
2. Provide **explicit, informed consent** to the collection and processing of your biometric data as described herein
3. Understand that blockchain-anchored data is **permanent and cannot be deleted**
4. Agree to the retention schedule outlined in Section 7

**You may withdraw your consent at any time** by discontinuing use of biometric capture features and contacting privacy@biovault.io.
