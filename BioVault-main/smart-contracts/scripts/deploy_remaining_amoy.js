/**
 * Deploy ONLY AuthenticityToken + Groth16Verifier to Amoy
 * MediaAnchor is already deployed at 0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe
 *
 * Usage: npx hardhat run scripts/deploy_remaining_amoy.js --network amoy
 */
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const EXISTING_MEDIA_ANCHOR = '0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe';

async function main() {
  const network = hre.network.name;
  if (network !== 'amoy') {
    console.error('This script is for Amoy only. Use: --network amoy');
    process.exit(1);
  }

  console.log('🚀 Deploying remaining contracts to Polygon Amoy');
  console.log('   MediaAnchor already at:', EXISTING_MEDIA_ANCHOR);
  console.log('');

  const [deployer] = await hre.ethers.getSigners();
  console.log('📍 Deployer:', deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('💰 Balance:', hre.ethers.formatEther(balance), 'POL');
  console.log('');

  if (parseFloat(hre.ethers.formatEther(balance)) < 0.1) {
    console.error('❌ Insufficient balance. Need at least 0.1 POL.');
    process.exit(1);
  }

  // Deploy AuthenticityToken
  console.log('📜 Deploying AuthenticityToken...');
  const AuthenticityToken = await hre.ethers.getContractFactory('AuthenticityToken');
  const at = await AuthenticityToken.deploy();
  console.log('   ⏳ Waiting for confirmation...');
  await at.waitForDeployment();
  const atAddress = await at.getAddress();
  console.log('   ✅ AuthenticityToken:', atAddress);
  console.log('');

  // Deploy Groth16Verifier
  let verifierAddress = null;
  try {
    console.log('📜 Deploying Groth16Verifier...');
    let Verifier;
    try {
      Verifier = await hre.ethers.getContractFactory('Groth16Verifier');
    } catch {
      Verifier = await hre.ethers.getContractFactory('Verifier');
    }
    const verifier = await Verifier.deploy();
    console.log('   ⏳ Waiting for confirmation...');
    await verifier.waitForDeployment();
    verifierAddress = await verifier.getAddress();
    console.log('   ✅ Groth16Verifier:', verifierAddress);
  } catch (err) {
    console.log('   ⚠️  Verifier deploy failed:', err.message);
  }
  console.log('');

  // Check remaining balance
  const newBalance = await hre.ethers.provider.getBalance(deployer.address);
  const spent = parseFloat(hre.ethers.formatEther(balance)) - parseFloat(hre.ethers.formatEther(newBalance));
  console.log('💰 Remaining balance:', hre.ethers.formatEther(newBalance), 'POL');
  console.log('💸 Spent:', spent.toFixed(6), 'POL');
  console.log('');

  // Update deployments.json
  const deploymentsPath = path.join(__dirname, '../deployments.json');
  let existing = {};
  if (fs.existsSync(deploymentsPath)) {
    existing = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  }
  existing.amoy = {
    MediaAnchor: EXISTING_MEDIA_ANCHOR,
    AuthenticityToken: atAddress,
    Verifier: verifierAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
  };
  fs.writeFileSync(deploymentsPath, JSON.stringify(existing, null, 2));

  console.log('═══════════════════════════════════════════════');
  console.log('✨ Amoy Deployment Complete');
  console.log('═══════════════════════════════════════════════');
  console.log('MediaAnchor:       ', EXISTING_MEDIA_ANCHOR);
  console.log('AuthenticityToken: ', atAddress);
  console.log('Groth16Verifier:   ', verifierAddress || 'SKIPPED');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('🔍 Verify on PolygonScan:');
  console.log(`npx hardhat verify --network amoy ${atAddress}`);
  if (verifierAddress) {
    console.log(`npx hardhat verify --network amoy ${verifierAddress}`);
  }
  console.log('');
  console.log('📝 Update backend/.env.amoy:');
  console.log(`AUTHENTICITY_TOKEN_CONTRACT=${atAddress}`);
  console.log(`VERIFIER_CONTRACT=${verifierAddress || ''}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deploy failed:', error);
    process.exit(1);
  });
