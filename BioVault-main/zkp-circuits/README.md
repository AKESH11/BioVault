# Zero-Knowledge Proof Circuits

This directory contains Circom circuits for Bio-Vault Protocol's zero-knowledge proof system.

## Overview

The ZK circuits allow victims to prove a video is fake (mismatched biometric signature) without revealing the raw private media.

## Circuits

1. **verify.circom**: Main media verification circuit
   - Proves video matches blockchain hash without revealing content
   - Uses Poseidon hash for efficiency

2. **bio_match.circom**: Biometric signature matching
   - Proves heart rate is in expected range
   - Enables exoneration without disclosure

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Download Powers of Tau

Download the trusted setup file (only needed once):

```bash
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_14.ptau
```

Or use a smaller one for testing:

```bash
wget https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_10.ptau
```

### 3. Compile Circuits

```bash
npm run compile
```

This generates:
- `build/verify.r1cs` - Constraint system
- `build/verify_js/verify.wasm` - WASM witness generator
- `build/verify.sym` - Symbol file

### 4. Generate Proving Key

```bash
npm run setup
npm run contribute
```

### 5. Generate Solidity Verifier

```bash
npm run export-verifier
```

This creates a Solidity contract in `../smart-contracts/contracts/Verifier.sol`

## Usage

### Generate a Proof

```bash
npm run generate-proof
```

### Verify a Proof

```bash
npm run verify-proof
```

### Test Circuits

```bash
npm test
```

## Integration with Smart Contracts

The generated verifier can be deployed to verify proofs on-chain:

```solidity
import "./Verifier.sol";

contract BioVaultVerification is Verifier {
    function verifyAuthenticity(
        uint[2] memory a,
        uint[2][2] memory b,
        uint[2] memory c,
        uint[2] memory input
    ) public view returns (bool) {
        return verifyProof(a, b, c, input);
    }
}
```

## Security Notes

- **Production**: Use a proper trusted setup ceremony
- **Powers of Tau**: Ensure you use the correct parameter size
- **Key Management**: Keep proving keys secure
- **Circuit Auditing**: Have circuits audited before mainnet deployment
