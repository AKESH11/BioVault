// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title AuthenticityToken
 * @dev Soulbound ERC-721 NFT (non-transferable) representing verified authentic media
 * 
 * Key Features:
 * - ERC-721 compliant but non-transferable (soulbound)
 * - Stores MediaAnchor struct: mediaHash, bioSignature, hardwareID, timestamp
 * - Acts as permanent Authenticity Certificate for Bio-Vault media
 *
 * Security:
 * - ReentrancyGuard on mint
 * - Pausable for emergency stops
 * - Soulbound: transfers blocked except mint/burn
 */
contract AuthenticityToken is ERC721, Ownable, ReentrancyGuard, Pausable {
    
    uint256 private _tokenIdCounter;
    
    // MediaAnchor struct storing core authenticity data
    struct MediaAnchor {
        string mediaHash;      // BLAKE3 hash of media + biometrics
        string bioSignature;   // Heart rate signature + Ed25519 proof
        string hardwareID;     // PRNU hardware fingerprint
        uint256 timestamp;     // Anchoring timestamp
        string ipfsHash;       // IPFS CID of encrypted media
    }
    
    // Token data
    mapping(uint256 => MediaAnchor) public tokenAnchors;
    mapping(string => uint256) public mediaHashToToken;
    mapping(uint256 => bool) public isSoulbound;
    
    event AuthenticityMinted(
        uint256 indexed tokenId,
        string indexed mediaHash,
        address indexed recipient,
        string bioSignature,
        string hardwareID,
        uint256 timestamp
    );
    
    constructor() ERC721("Bio-Vault Authenticity", "BVAUTH") Ownable(msg.sender) {
        _tokenIdCounter = 1;
    }
    
    /**
     * @dev Mint a new soulbound authenticity token with full MediaAnchor data
     * @param _to Recipient (usually the media creator)
     * @param _mediaHash BLAKE3 hash of media + biometrics
     * @param _bioSignature Composite biometric signature
     * @param _hardwareID PRNU hardware fingerprint
     * @param _ipfsHash IPFS CID for encrypted media
     */
    function mint(
        address _to,
        string memory _mediaHash,
        string memory _bioSignature,
        string memory _hardwareID,
        string memory _ipfsHash
    ) external onlyOwner nonReentrant whenNotPaused returns (uint256) {
        require(bytes(_mediaHash).length > 0, "Media hash cannot be empty");
        require(bytes(_mediaHash).length <= 256, "Media hash too long");
        require(bytes(_bioSignature).length <= 512, "Bio signature too long");
        require(bytes(_hardwareID).length <= 256, "Hardware ID too long");
        require(bytes(_ipfsHash).length <= 256, "IPFS hash too long");
        require(mediaHashToToken[_mediaHash] == 0, "Token already exists for this media");
        
        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;
        
        _safeMint(_to, tokenId);
        
        tokenAnchors[tokenId] = MediaAnchor({
            mediaHash: _mediaHash,
            bioSignature: _bioSignature,
            hardwareID: _hardwareID,
            timestamp: block.timestamp,
            ipfsHash: _ipfsHash
        });
        
        mediaHashToToken[_mediaHash] = tokenId;
        isSoulbound[tokenId] = true;
        
        emit AuthenticityMinted(tokenId, _mediaHash, _to, _bioSignature, _hardwareID, block.timestamp);
        
        return tokenId;
    }
    
    /**
     * @dev Override transfer functions to make tokens soulbound
     */
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address)
    {
        address from = _ownerOf(tokenId);
        
        // Allow minting (from == address(0))
        // Allow burning (to == address(0))
        // Block all other transfers if soulbound
        if (from != address(0) && to != address(0) && isSoulbound[tokenId]) {
            revert("Soulbound: Transfer not allowed");
        }
        
        return super._update(to, tokenId, auth);
    }
    
    /**
     * @dev Get token ID for a media hash
     */
    function getTokenByMediaHash(string memory _mediaHash) external view returns (uint256) {
        return mediaHashToToken[_mediaHash];
    }
    
    /**
     * @dev Check if a token exists for a media hash
     */
    function exists(string memory _mediaHash) external view returns (bool) {
        return mediaHashToToken[_mediaHash] != 0;
    }

    // ========================================================================
    // Pausable controls (owner only)
    // ========================================================================

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ========================================================================
    // Burn (owner only — for revoking a fraudulent certificate)
    // ========================================================================

    /**
     * @dev Burn a soulbound token (emergency revocation by owner)
     * @param tokenId The token to burn
     */
    function burn(uint256 tokenId) external onlyOwner {
        // Clear associated data
        string memory mediaHash = tokenAnchors[tokenId].mediaHash;
        if (bytes(mediaHash).length > 0) {
            delete mediaHashToToken[mediaHash];
        }
        delete tokenAnchors[tokenId];
        delete isSoulbound[tokenId];

        // ERC-721 _update to address(0) = burn
        // Pass auth=address(0) to skip approval check (admin burn)
        _update(address(0), tokenId, address(0));
    }
}
