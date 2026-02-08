const hre = require('hardhat');

async function main() {
  const network = hre.network.name;
  console.log('🔍 Checking balance on:', network);
  console.log('');
  
  const [deployer] = await hre.ethers.getSigners();
  
  console.log('📍 Account:', deployer.address);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balanceInEth = hre.ethers.formatEther(balance);
  
  console.log('💰 Balance:', balanceInEth, network === 'amoy' ? 'POL' : 'ETH');
  console.log('');
  
  const minRequired = hre.ethers.parseEther('0.1');
  
  if (balance < minRequired) {
    console.log('⚠️  WARNING: Balance is low!');
    console.log('   Recommended minimum: 0.1 POL');
    console.log('');
    console.log('🚰 Get test POL from faucet:');
    console.log('   https://faucet.polygon.technology/');
    console.log('   https://faucet.quicknode.com/polygon/amoy');
    console.log('');
    return false;
  } else {
    console.log('✅ Balance sufficient for deployment!');
    console.log('');
    return true;
  }
}

main()
  .then((sufficient) => {
    process.exit(sufficient ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Error checking balance:', error);
    process.exit(1);
  });
