const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
  const network = hre.network.name;
  console.log('🚀 Deploying Bio-Vault Protocol to:', network);
  console.log('');
  
  const [deployer] = await hre.ethers.getSigners();
  console.log('📍 Deploying with account:', deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log('💰 Account balance:', hre.ethers.formatEther(balance), 'ETH');
  console.log('');
  
  // Deploy MediaAnchor
  console.log('📜 Deploying MediaAnchor...');
  const MediaAnchor = await hre.ethers.getContractFactory('MediaAnchor');
  const mediaAnchor = await MediaAnchor.deploy();
  await mediaAnchor.waitForDeployment();
  const mediaAnchorAddress = await mediaAnchor.getAddress();
  console.log('   ✅ MediaAnchor:', mediaAnchorAddress);
  console.log('');
  
  // Deploy AuthenticityToken
  console.log('📜 Deploying AuthenticityToken...');
  const AuthenticityToken = await hre.ethers.getContractFactory('AuthenticityToken');
  const authenticityToken = await AuthenticityToken.deploy();
  await authenticityToken.waitForDeployment();
  const authenticityTokenAddress = await authenticityToken.getAddress();
  console.log('   ✅ AuthenticityToken:', authenticityTokenAddress);
  console.log('');
  
  // Deploy Verifier (generated from ZKP circuit trusted setup)
  let verifierAddress = null;
  try {
    console.log('📜 Deploying Verifier (ZKP)...');
    const Verifier = await hre.ethers.getContractFactory('Verifier');
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    verifierAddress = await verifier.getAddress();
    console.log('   ✅ Verifier:', verifierAddress);
  } catch (verifierError) {
    console.log('   ⚠️  Verifier contract not found — skipping.');
    console.log('   Generate with: cd zkp-circuits && snarkjs zkey export solidityverifier build/bio_match_final.zkey ../smart-contracts/contracts/Verifier.sol');
  }
  console.log('');
  
  // Save deployments
  const deployments = {
    [network]: {
      MediaAnchor: mediaAnchorAddress,
      AuthenticityToken: authenticityTokenAddress,
      Verifier: verifierAddress,
      deployer: deployer.address,
      timestamp: new Date().toISOString()
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
  console.log('✨ Deployment Complete');
  console.log('═══════════════════════════════════════════════');
  console.log('Network:', network);
  console.log('MediaAnchor:', mediaAnchorAddress);
  console.log('AuthenticityToken:', authenticityTokenAddress);
  if (verifierAddress) console.log('Verifier:', verifierAddress);
  console.log('═══════════════════════════════════════════════');
  console.log('');
  console.log('💾 Saved to:', deploymentsPath);
  console.log('');
  
  if (network !== 'hardhat' && network !== 'localhost') {
    console.log('🔍 Verify on block explorer:');
    console.log('npx hardhat verify --network', network, mediaAnchorAddress);
    console.log('npx hardhat verify --network', network, authenticityTokenAddress);
    if (verifierAddress) console.log('npx hardhat verify --network', network, verifierAddress);
    console.log('');
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('❌ Deployment failed:', error);
    process.exit(1);
  });
