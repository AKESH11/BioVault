/**
 * Upload media to IPFS and mint Bio-Vault Authenticity Token
 * Usage: node scripts/uploadToIPFS.js <filePath> <recipientAddress> <bioSignature> <hardwareID>
 */

const fs = require('fs');
const path = require('path');
const { ethers } = require('hardhat');
const FormData = require('form-data');
const axios = require('axios');

// Pinata API credentials (set in environment variables)
const PINATA_API_KEY = process.env.PINATA_API_KEY || '';
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY || '';

/**
 * Upload file to IPFS via Pinata
 */
async function uploadToPinata(filePath) {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
        throw new Error('PINATA_API_KEY and PINATA_SECRET_KEY must be set in environment');
    }
    
    const url = 'https://api.pinata.cloud/pinning/pinFileToIPFS';
    
    const data = new FormData();
    data.append('file', fs.createReadStream(filePath));
    
    const metadata = JSON.stringify({
        name: path.basename(filePath),
        keyvalues: {
            project: 'BioVault',
            type: 'authenticated-media'
        }
    });
    data.append('pinataMetadata', metadata);
    
    const options = JSON.stringify({
        cidVersion: 1
    });
    data.append('pinataOptions', options);
    
    const response = await axios.post(url, data, {
        maxBodyLength: Infinity,
        headers: {
            'Content-Type': `multipart/form-data; boundary=${data._boundary}`,
            'pinata_api_key': PINATA_API_KEY,
            'pinata_secret_api_key': PINATA_SECRET_KEY
        }
    });
    
    return response.data.IpfsHash;
}

/**
 * Compute BLAKE3-based media hash (placeholder using keccak256)
 */
function computeMediaHash(filePath) {
    const fileBuffer = fs.readFileSync(filePath);
    const hash = ethers.keccak256(fileBuffer);
    return hash;
}

/**
 * Main execution
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length < 4) {
        console.error('Usage: node uploadToIPFS.js <filePath> <recipientAddress> <bioSignature> <hardwareID>');
        console.error('Example: node uploadToIPFS.js video.mp4 0x123... "HR:72|ED25519:abc..." "PRNU:xyz..."');
        process.exit(1);
    }
    
    const [filePath, recipient, bioSignature, hardwareID] = args;
    
    // Validate file exists
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }
    
    // Validate recipient address
    if (!ethers.isAddress(recipient)) {
        throw new Error(`Invalid Ethereum address: ${recipient}`);
    }
    
    console.log('📁 File:', path.basename(filePath));
    console.log('📍 Recipient:', recipient);
    console.log('💓 Bio Signature:', bioSignature.substring(0, 50) + '...');
    console.log('🔧 Hardware ID:', hardwareID.substring(0, 50) + '...');
    console.log('');
    
    // Step 1: Compute media hash
    console.log('🔐 Computing media hash...');
    const mediaHash = computeMediaHash(filePath);
    console.log('   Hash:', mediaHash);
    console.log('');
    
    // Step 2: Upload to IPFS
    console.log('📤 Uploading to IPFS via Pinata...');
    const ipfsHash = await uploadToPinata(filePath);
    console.log('   IPFS CID:', ipfsHash);
    console.log('   Gateway URL: https://gateway.pinata.cloud/ipfs/' + ipfsHash);
    console.log('');
    
    // Step 3: Get deployed contract
    console.log('📜 Connecting to AuthenticityToken contract...');
    const AuthenticityToken = await ethers.getContractFactory('AuthenticityToken');
    
    // Load deployment address from deployments.json or use environment variable
    const deploymentPath = path.join(__dirname, '../deployments.json');
    let contractAddress;
    
    if (fs.existsSync(deploymentPath)) {
        const deployments = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
        const network = await ethers.provider.getNetwork();
        contractAddress = deployments[network.name]?.AuthenticityToken;
    }
    
    if (!contractAddress) {
        contractAddress = process.env.AUTHENTICITY_TOKEN_ADDRESS;
    }
    
    if (!contractAddress) {
        throw new Error('Contract address not found. Set AUTHENTICITY_TOKEN_ADDRESS or deploy first.');
    }
    
    const contract = AuthenticityToken.attach(contractAddress);
    console.log('   Contract:', contractAddress);
    console.log('');
    
    // Step 4: Mint soulbound token
    console.log('🎨 Minting soulbound authenticity token...');
    const tx = await contract.mint(recipient, mediaHash, bioSignature, hardwareID, ipfsHash);
    console.log('   Transaction hash:', tx.hash);
    
    const receipt = await tx.wait();
    console.log('   ✅ Confirmed in block:', receipt.blockNumber);
    
    // Extract token ID from event
    const mintEvent = receipt.logs
        .map(log => {
            try {
                return contract.interface.parseLog(log);
            } catch {
                return null;
            }
        })
        .find(event => event && event.name === 'AuthenticityMinted');
    
    const tokenId = mintEvent ? mintEvent.args.tokenId.toString() : 'N/A';
    
    console.log('   🎫 Token ID:', tokenId);
    console.log('');
    
    // Summary
    console.log('═══════════════════════════════════════════════');
    console.log('✨ Bio-Vault Authenticity Token Minted Successfully');
    console.log('═══════════════════════════════════════════════');
    console.log('Token ID:', tokenId);
    console.log('Media Hash:', mediaHash);
    console.log('IPFS CID:', ipfsHash);
    console.log('IPFS URL: https://gateway.pinata.cloud/ipfs/' + ipfsHash);
    console.log('Recipient:', recipient);
    console.log('Contract:', contractAddress);
    console.log('Transaction:', tx.hash);
    console.log('═══════════════════════════════════════════════');
    console.log('');
    console.log('⚠️  NOTE: This token is SOULBOUND (non-transferable)');
    console.log('It serves as permanent proof of authenticity.');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('❌ Error:', error.message);
        process.exit(1);
    });
