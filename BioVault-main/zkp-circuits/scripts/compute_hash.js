const { buildPoseidon } = require("circomlibjs");

async function computeHash() {
    console.log("🔐 Computing Poseidon Hash for Test Inputs\n");
    
    // Test inputs (must be BigInt)
    const videoPixelsHash = BigInt("98765432109876543210987654321098");
    const userPulseSignature = BigInt("72000000000000000000000000000000");
    const hardwarePRNU = BigInt("11111111222222223333333344444444");
    
    console.log("📊 Input Values:");
    console.log("   videoPixelsHash:", videoPixelsHash.toString());
    console.log("   userPulseSignature:", userPulseSignature.toString());
    console.log("   hardwarePRNU:", hardwarePRNU.toString());
    console.log("");
    
    // Build Poseidon hash function
    const poseidon = await buildPoseidon();
    
    // Hash the 3 inputs (same as circuit)
    const hash = poseidon.F.toString(poseidon([videoPixelsHash, userPulseSignature, hardwarePRNU]));
    
    console.log("🎯 Computed Poseidon Hash:");
    console.log("   ", hash);
    console.log("");
    console.log("✅ Use this hash as blockchainAnchoredHash in input.json to get isValid=1");
}

computeHash().catch(console.error);
