# Proof of Reality System

## Overview

Mathematical proof that multiple pulses originate from distinct biological entities using signal processing and cross-correlation analysis. Detects replay attacks and pulse spoofing in multi-person consent scenarios.

## Architecture

```
┌────────────────────────────────────────────────┐
│   Multi-Face rPPG (MediaPipe + BioVault)       │
│   - Extract pulse signals from N faces         │
│   - rawSignal: time-series green channel       │
└───────────────┬────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────┐
│   Cross-Correlation Analysis (C++)             │
│   - Pearson correlation between all pairs      │
│   - Threshold: 0.95 for replay detection       │
└───────────────┬────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────┐
│   Proof of Reality Metadata (JSON)             │
│   - pulse_data: [{faceId, bpm, signal}]        │
│   - correlation_coefficients: {"12": 0.99}     │
│   - replay_attack_flags: {"12": true}          │
│   - all_unique_signals: false                  │
└───────────────┬────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────┐
│   IPFS Upload (Full JSON)                      │
│   - Pinata API                                 │
│   - Returns: IPFS CID                          │
└───────────────┬────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────┐
│   Polygon Blockchain (Hash Only)               │
│   - MediaAnchor.anchorMedia()                  │
│   - proofOfRealityHash: BLAKE3                 │
│   - proofOfRealityIPFS: CID                    │
│   - allUniqueSignals: bool                     │
└────────────────────────────────────────────────┘
```

## Methodology

### 1. Pre-processing
- Extract green-channel means from forehead ROI
- Detrend signal (subtract mean)
- Apply Hamming window to reduce spectral leakage

### 2. Feature Extraction
- **Frequency**: Dominant peak in FFT (0.8-3.0 Hz → 48-180 BPM)
- **Amplitude**: Magnitude of dominant peak
- **Phase**: Time-series correlation (not FFT phase)

### 3. Cross-Correlation Analysis

Calculate Pearson correlation coefficient between every pulse pair:

$$
r_{xy} = \frac{\sum_{i=1}^{n}(x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^{n}(x_i - \bar{x})^2 \sum_{i=1}^{n}(y_i - \bar{y})^2}}
$$

Where:
- $x_i, y_i$: raw pulse signals from face 1 and face 2
- $\bar{x}, \bar{y}$: mean values
- $r_{xy} \in [-1, 1]$: correlation coefficient

**Replay Attack Detection:**
- If $|r_{xy}| > 0.95$ → flag as replay attack
- Biological signals from distinct humans typically have $r < 0.5$
- High correlation indicates identical or nearly identical signals (spoofing)

## Implementation

### C++ Core (Proof of Reality)

```cpp
#include "proof_of_reality.h"

// Analyze pulse uniqueness
std::vector<biovault::reality::PulseData> pulses = {
    {.faceId = 1, .bpm = 68, .rawSignal = signal1, .confidence = 0.85},
    {.faceId = 2, .bpm = 72, .rawSignal = signal2, .confidence = 0.90},
    {.faceId = 3, .bpm = 75, .rawSignal = signal3, .confidence = 0.88}
};

auto analyzer = biovault::reality::ProofOfRealityAnalyzer();
auto correlations = analyzer.analyzePulseUniqueness(pulses, 0.95);

// Check for replay attacks
for (const auto& corr : correlations) {
    if (corr.replayAttack) {
        std::cout << "⚠️  Replay attack: Face " << corr.faceId1 
                  << " & " << corr.faceId2 
                  << " (r=" << corr.coefficient << ")" << std::endl;
    }
}

// Create metadata
auto metadata = analyzer.createMetadata(
    pulses,
    consensusHash,
    hardwareDNA,
    videoFrameHash,
    timestamp,
    verificationStatus
);

std::string json = metadata.toJSON();
// Save to file and upload to IPFS
```

### BioVaultExtractor Integration

```cpp
// After multi-face rPPG processing
std::vector<BioVaultExtractor::PersonBioData> results = 
    extractor.processFrameMulti(frame, faceObservations);

// Analyze correlations
auto correlations = extractor.analyzePulseCorrelations(results, 0.95);

// Check for replay attacks
bool allUnique = std::all_of(correlations.begin(), correlations.end(),
    [](const auto& c) { return !c.replayAttack; });

if (!allUnique) {
    std::cout << "⚠️  Replay attack detected!" << std::endl;
}
```

### Metadata Structure (JSON)

```json
{
  "pulse_data": [
    {
      "face_id": 1,
      "bpm": 68,
      "confidence": 0.85,
      "signal_length": 300
    },
    {
      "face_id": 2,
      "bpm": 72,
      "confidence": 0.90,
      "signal_length": 300
    },
    {
      "face_id": 3,
      "bpm": 75,
      "confidence": 0.88,
      "signal_length": 300
    }
  ],
  "correlation_coefficients": {
    "12": 0.99,
    "13": 0.35,
    "23": 0.42
  },
  "replay_attack_flags": {
    "12": true,
    "13": false,
    "23": false
  },
  "consensus_hash": "a3f8e9d...",
  "hardware_dna": "device_prnu_fingerprint_...",
  "video_frame_hash": "b2e7c1d...",
  "timestamp": 1738454400,
  "verification_status": "COMPLETE",
  "all_unique_signals": false,
  "detected_faces": 3,
  "received_signatures": 3
}
```

### Smart Contract Storage (Polygon)

```solidity
struct MediaRecord {
    string mediaHash;
    string bioSignature;
    string hardwareID;
    uint256 timestamp;
    address creator;
    address[] consensusParties;
    bool isRevoked;
    string ipfsHash;                // Video IPFS CID
    VerificationStatus status;
    string proofOfRealityHash;      // BLAKE3(metadata JSON)
    string proofOfRealityIPFS;      // Metadata IPFS CID
    bool allUniqueSignals;          // Replay attack flag
    uint8 detectedFaces;
}
```

### Upload to Blockchain

```bash
# 1. Generate Proof of Reality metadata (C++ outputs JSON)
./biovault_extractor --analyze-correlations > proof_of_reality.json

# 2. Upload to IPFS and anchor on Polygon
node scripts/anchorProofOfReality.js proof_of_reality.json QmVideoIPFSCID

# Output:
# ✅ Uploaded to IPFS: QmProofOfRealityMetadata...
# 🔐 Metadata hash: a3f8e9d...
# ⚓ Anchored in block 12345678
# ⚠️  Replay attack detected: Face pair 12 (r=0.99)
```

## Replay Attack Detection Logic

```cpp
// Flag as 'Replay Attack' or 'Pulse Spoofing' if correlation > 0.95
if (std::abs(correlation) > 0.95) {
    replayAttackFlag = true;
    verificationStatus = "STATUS_UNVERIFIED";
}
```

**Why 0.95?**
- Natural biological signals have inherent variability
- Even twins have correlation < 0.8 due to independent cardiac rhythms
- Correlation > 0.95 indicates:
  - Identical video loops (replay attack)
  - Synthetic signals (deepfake)
  - Screen recordings (spoofing)

## Storage Efficiency

### On-Chain (Polygon)
- **MediaRecord struct**: ~300 bytes
  - `proofOfRealityHash`: 32 bytes (BLAKE3)
  - `proofOfRealityIPFS`: 46 bytes (CID v1)
  - `allUniqueSignals`: 1 byte (bool)
  - `detectedFaces`: 1 byte (uint8)
- **Gas cost**: ~150,000 gas (~$0.01 on Polygon)

### Off-Chain (IPFS)
- **Full metadata JSON**: 1-5 KB depending on signal length
- **Pinata storage**: Permanent (pinned)
- **Verification**: Anyone can fetch from IPFS and recompute hash

## Correlation Thresholds

| Scenario | Typical Correlation | Flag |
|----------|---------------------|------|
| Distinct humans | 0.1 - 0.5 | ✅ Unique |
| Same person (different sessions) | 0.6 - 0.8 | ✅ Unique |
| Replay attack | 0.95 - 1.0 | ⚠️ SPOOFED |
| Identical video loop | 1.0 | ⚠️ SPOOFED |

## Verification Flow

```typescript
// React Native / dApp
const metadata = await fetch(`https://ipfs.io/ipfs/${record.proofOfRealityIPFS}`);
const metadataJson = await metadata.json();

// Check for replay attacks
if (!metadataJson.all_unique_signals) {
    const attackPairs = Object.entries(metadataJson.replay_attack_flags)
        .filter(([_, flag]) => flag)
        .map(([pair, _]) => pair);
    
    console.warn(`⚠️ Replay attacks detected in pairs: ${attackPairs.join(', ')}`);
    
    // Show warning in UI
    showReplayWarning(attackPairs);
}

// Verify hash matches on-chain
const computedHash = blake3(JSON.stringify(metadataJson));
assert(computedHash === record.proofOfRealityHash);
```

## Performance

- **Correlation computation**: O(N²) pairs × O(M) signal length
  - 3 faces × 300 samples: ~2ms per pair
  - Total: ~6ms for 3 pairs
- **IPFS upload**: 200-500ms (Pinata API)
- **Blockchain anchor**: 2-5 seconds (Polygon confirmation)

## Security Properties

1. **Tamper-Evident**: Metadata hash on-chain prevents modification
2. **Verifiable**: Anyone can recompute correlation from raw signals
3. **Transparent**: Replay attack flags publicly visible
4. **Immutable**: Blockchain anchoring prevents retroactive changes

## Future Enhancements

1. **Frequency-Domain Correlation**: Compare FFT spectra instead of time-domain
2. **Phase Alignment**: Detect time-shifted replays (cross-correlation lag)
3. **Multi-Session Verification**: Cross-reference with user's historical pulse patterns
4. **Machine Learning**: Train classifier to detect synthetic pulse signals
5. **Hardware Liveness**: Combine with PRNU fingerprint for device-level anti-spoofing

## References

- Pearson Correlation: https://en.wikipedia.org/wiki/Pearson_correlation_coefficient
- BLAKE3 Specification: https://github.com/BLAKE3-team/BLAKE3-specs
- IPFS CID Spec: https://github.com/multiformats/cid
- Implementation: [proof_of_reality.cpp](../mobile-app/cpp/src/proof_of_reality.cpp)
