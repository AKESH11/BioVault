const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const network = hre.network.name;
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('🚀 BioVault Protocol Deployment');
  console.log('═══════════════════════════════════════════════');
  console.log('Network:', network);
  console.log('');
  
  const [deployer] = await hre.ethers.getSigners();
  console.log('📍 Deploying with account:', deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('💰 Account balance:', hre.ethers.formatEther(balance), network === 'amoy' ? 'POL' : 'MATIC');
  console.log('');
  
  // Check minimum balance
  const minRequired = hre.ethers.parseEther('0.1');
  if (balance < minRequired) {
    console.log('❌ ERROR: Insufficient balance!');
    console.log('   Minimum required: 0.1 POL');
    console.log('   Get test tokens from: https://faucet.polygon.technology/');
    console.log('');
    process.exit(1);
  }
  
  console.log('───────────────────────────────────────────────');
  console.log('📜 Deploying Contracts...');
  console.log('───────────────────────────────────────────────');
  console.log('');
  
  // Deploy MediaAnchor
  console.log('1️⃣  Deploying MediaAnchor...');
  const MediaAnchor = await hre.ethers.getContractFactory('MediaAnchor');
  const mediaAnchor = await MediaAnchor.deploy();
  await mediaAnchor.waitForDeployment();
  const mediaAnchorAddress = await mediaAnchor.getAddress();
  console.log('   ✅ MediaAnchor:', mediaAnchorAddress);
  console.log('');
  
  // Deploy Verifier (ZK Proof Verifier)
  console.log('2️⃣  Deploying Verifier (ZK Proof)...');
  const Verifier = await hre.ethers.getContractFactory('Groth16Verifier');
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log('   ✅ Verifier:', verifierAddress);
  console.log('');
  
  // Deploy AuthenticityToken
  console.log('3️⃣  Deploying AuthenticityToken...');
  const AuthenticityToken = await hre.ethers.getContractFactory('AuthenticityToken');
  const authenticityToken = await AuthenticityToken.deploy();
  await authenticityToken.waitForDeployment();
  const authenticityTokenAddress = await authenticityToken.getAddress();
  console.log('   ✅ AuthenticityToken:', authenticityTokenAddress);
  console.log('');
  
  // Save deployments
  const deployments = {
    [network]: {
      MediaAnchor: mediaAnchorAddress,
      Verifier: verifierAddress,
      AuthenticityToken: authenticityTokenAddress,
      deployer: deployer.address,
      timestamp: new Date().toISOString(),
      chainId: network === 'amoy' ? 80002 : (network === 'polygon' ? 137 : 31337)
    }
  };
  
  const deploymentsPath = path.join(__dirname, '../deployments.json');
  let existingDeployments = {};
  
  if (fs.existsSync(deploymentsPath)) {
    existingDeployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
  }
  
  const updatedDeployments = { ...existingDeployments, ...deployments };
  fs.writeFileSync(deploymentsPath, JSON.stringify(updatedDeployments, null, 2));
  
  console.log('═══════════════════════════════════════════════');
  console.log('✨ Deployment Complete!');
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('📋 Contract Addresses:');
  console.log('   MediaAnchor:        ', mediaAnchorAddress);
  console.log('   Verifier:           ', verifierAddress);
  console.log('   AuthenticityToken:  ', authenticityTokenAddress);
  console.log('');
  console.log('🌐 Network:', network === 'amoy' ? 'Polygon Amoy Testnet' : network);
  console.log('🔗 Explorer:', network === 'amoy' ? 'https://amoy.polygonscan.com' : 'https://polygonscan.com');
  console.log('');
  console.log('💾 Deployment saved to:', deploymentsPath);
  console.log('');
  
  if (network !== 'hardhat' && network !== 'localhost') {
    console.log('───────────────────────────────────────────────');
    console.log('🔍 Verify Contracts (Run these commands):');
    console.log('───────────────────────────────────────────────');
    console.log('');
    console.log(`npx hardhat verify --network ${network} ${mediaAnchorAddress}`);
    console.log(`npx hardhat verify --network ${network} ${verifierAddress}`);
    console.log(`npx hardhat verify --network ${network} ${authenticityTokenAddress}`);
    console.log('');
  }
  
  // Generate mobile app config
  console.log('───────────────────────────────────────────────');
  console.log('📱 Mobile App Configuration:');
  console.log('───────────────────────────────────────────────');
  console.log('');
  console.log('Copy this to mobile-app/src/config/contracts.js:');
  console.log('');
  console.log('export const CONTRACTS = {');
  console.log(`  MEDIA_ANCHOR: '${mediaAnchorAddress}',`);
  console.log(`  VERIFIER: '${verifierAddress}',`);
  console.log(`  AUTHENTICITY_TOKEN: '${authenticityTokenAddress}',`);
  console.log('  NETWORK: {');
  console.log(`    name: '${network === 'amoy' ? 'Polygon Amoy Testnet' : 'Polygon Mainnet'}',`);
  console.log(`    chainId: ${network === 'amoy' ? 80002 : 137},`);
  console.log(`    rpcUrl: '${process.env.AMOY_RPC_URL || process.env.POLYGON_RPC_URL}',`);
  console.log(`    blockExplorer: '${network === 'amoy' ? 'https://amoy.polygonscan.com' : 'https://polygonscan.com'}'`);
  console.log('  }');
  console.log('};');
  console.log('');
  console.log('═══════════════════════════════════════════════');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('');
    console.error('❌ Deployment failed:', error);
    console.error('');
    process.exit(1);
  });
