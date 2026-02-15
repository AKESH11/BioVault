/**
 * Deploy only AuthenticityToken to Polygon Amoy
 * MediaAnchor is already deployed at 0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe
 * 
 * Usage: npx hardhat run scripts/deploy_token.js --network amoy
 */

const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function main() {
    const network = hre.network.name;
    console.log('Deploying AuthenticityToken to:', network);
    console.log('');

    const [deployer] = await hre.ethers.getSigners();
    console.log('Deployer:', deployer.address);

    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log('Balance:', hre.ethers.formatEther(balance), 'POL');

    if (balance === 0n) {
        console.error('ERROR: Wallet has no funds. Get testnet POL from https://faucet.polygon.technology/');
        process.exit(1);
    }
    console.log('');

    // Deploy AuthenticityToken
    console.log('Deploying AuthenticityToken...');
    const AuthenticityToken = await hre.ethers.getContractFactory('AuthenticityToken');

    const gasEstimate = await hre.ethers.provider.estimateGas(
        await AuthenticityToken.getDeployTransaction()
    );
    console.log('Estimated gas:', gasEstimate.toString());

    const authenticityToken = await AuthenticityToken.deploy();
    console.log('TX submitted:', authenticityToken.deploymentTransaction().hash);

    await authenticityToken.waitForDeployment();
    const address = await authenticityToken.getAddress();
    console.log('AuthenticityToken deployed at:', address);
    console.log('');

    // Verify ownership
    const owner = await authenticityToken.owner();
    console.log('Contract owner:', owner);
    console.log('Matches deployer:', owner === deployer.address);

    // Remaining balance
    const remaining = await hre.ethers.provider.getBalance(deployer.address);
    console.log('Remaining balance:', hre.ethers.formatEther(remaining), 'POL');
    console.log('');

    // Save to deployments.json
    const deploymentsPath = path.join(__dirname, '../deployments.json');
    let deployments = {};

    if (fs.existsSync(deploymentsPath)) {
        deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'));
    }

    if (!deployments[network]) {
        deployments[network] = {};
    }

    deployments[network].AuthenticityToken = address;
    deployments[network].deployer = deployer.address;
    deployments[network].timestamp = new Date().toISOString();

    // Keep existing MediaAnchor if present
    if (!deployments[network].MediaAnchor) {
        deployments[network].MediaAnchor = '0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe';
    }

    fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
    console.log('Saved to:', deploymentsPath);
    console.log('');

    console.log('='.repeat(50));
    console.log('DEPLOYMENT COMPLETE');
    console.log('='.repeat(50));
    console.log('Network:             ', network);
    console.log('AuthenticityToken:   ', address);
    console.log('MediaAnchor:         ', deployments[network].MediaAnchor);
    console.log('='.repeat(50));
    console.log('');
    console.log('Next steps:');
    console.log('1. Update backend/.env:');
    console.log(`   AUTHENTICITY_TOKEN_CONTRACT=${address}`);
    console.log(`   DEPLOYER_PRIVATE_KEY=<your-key>`);
    console.log('');

    if (network !== 'hardhat' && network !== 'localhost') {
        console.log('2. Verify on PolygonScan:');
        console.log(`   npx hardhat verify --network ${network} ${address}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Deployment failed:', error);
        process.exit(1);
    });
