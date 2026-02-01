// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title MediaAnchor
 * @dev Core contract for Bio-Vault Protocol - anchors media with biometric signatures
 * 
 * This contract creates an immutable record of media capture with:
 * - Cryptographic hash of the media
 * - Biometric signature (heart rate-based proof)
 * - Hardware fingerprint (PRNU)
 * - Multi-party consensus signatures
 * - Timestamp of capture
 */
contract MediaAnchor is Ownable, ReentrancyGuard {
    
    // Struct to represent an anchored media record
    struct MediaRecord {
        string mediaHash;           // BLAKE3 hash of the media + biometrics
        string bioSignature;        // Composite: BPM + Subject signatures
        string hardwareID;          // PRNU fingerprint of capturing device
        uint256 timestamp;          // Block timestamp of anchoring
        address creator;            // Address that created the anchor
        address[] consensusParties; // All parties that consented to recording
        bool isRevoked;             // Can be revoked if consent withdrawn
        string ipfsHash;            // IPFS CID for encrypted media storage
        VerificationStatus status;  // Current verification status
    }
    
    enum VerificationStatus {
        Pending,
        Verified,
        Disputed,
        Revoked
    }
    
    // Mapping: mediaHash => MediaRecord
    mapping(string => MediaRecord) public mediaRecords;
    
    // Mapping: address => array of media hashes they created
    mapping(address => string[]) public creatorMedia;
    
    // Mapping: address => array of media hashes they consented to
    mapping(address => string[]) public participantMedia;
    
    // Dispute tracking
    struct Dispute {
        address disputer;
        string reason;
        uint256 timestamp;
        bool resolved;
    }
    
    mapping(string => Dispute[]) public disputes;
    
    // Events
    event MediaAnchored(
        string indexed mediaHash,
        address indexed creator,
        uint256 timestamp,
        string hardwareID
    );
    
    event ConsentAdded(
        string indexed mediaHash,
        address indexed participant,
        uint256 timestamp
    );
    
    event MediaDisputed(
        string indexed mediaHash,
        address indexed disputer,
        string reason,
        uint256 timestamp
    );
    
    event MediaRevoked(
        string indexed mediaHash,
        address indexed revoker,
        uint256 timestamp
    );
    
    constructor() Ownable(msg.sender) {}
    
    /**
     * @dev Anchor a new media record to the blockchain
     * @param _mediaHash Unique hash combining media + biometrics + hardware
     * @param _bioSignature Composite biometric signature
     * @param _hardwareID Hardware fingerprint (PRNU)
     * @param _consensusParties Addresses of all consenting parties
     * @param _ipfsHash IPFS CID where encrypted media is stored
     */
    function anchorMedia(
        string memory _mediaHash,
        string memory _bioSignature,
        string memory _hardwareID,
        address[] memory _consensusParties,
        string memory _ipfsHash
    ) external nonReentrant {
        require(bytes(_mediaHash).length > 0, "Media hash cannot be empty");
        require(bytes(mediaRecords[_mediaHash].mediaHash).length == 0, "Media already anchored");
        require(_consensusParties.length > 0, "At least one consensus party required");
        
        MediaRecord storage record = mediaRecords[_mediaHash];
        record.mediaHash = _mediaHash;
        record.bioSignature = _bioSignature;
        record.hardwareID = _hardwareID;
        record.timestamp = block.timestamp;
        record.creator = msg.sender;
        record.consensusParties = _consensusParties;
        record.isRevoked = false;
        record.ipfsHash = _ipfsHash;
        record.status = VerificationStatus.Verified;
        
        // Track media for creator
        creatorMedia[msg.sender].push(_mediaHash);
        
        // Track media for all participants
        for (uint i = 0; i < _consensusParties.length; i++) {
            participantMedia[_consensusParties[i]].push(_mediaHash);
        }
        
        emit MediaAnchored(_mediaHash, msg.sender, block.timestamp, _hardwareID);
        
        // Emit consent events
        for (uint i = 0; i < _consensusParties.length; i++) {
            emit ConsentAdded(_mediaHash, _consensusParties[i], block.timestamp);
        }
    }
    
    /**
     * @dev Verify if a media hash exists and is valid
     * @param _mediaHash Hash to verify
     * @return exists Whether the record exists
     * @return isValid Whether the record is not revoked/disputed
     * @return timestamp When it was anchored
     */
    function verifyMedia(string memory _mediaHash) 
        external 
        view 
        returns (bool exists, bool isValid, uint256 timestamp) 
    {
        MediaRecord memory record = mediaRecords[_mediaHash];
        exists = bytes(record.mediaHash).length > 0;
        isValid = exists && !record.isRevoked && record.status == VerificationStatus.Verified;
        timestamp = record.timestamp;
    }
    
    /**
     * @dev File a dispute against a media record
     * @param _mediaHash Hash of the disputed media
     * @param _reason Reason for the dispute
     */
    function disputeMedia(string memory _mediaHash, string memory _reason) external {
        require(bytes(mediaRecords[_mediaHash].mediaHash).length > 0, "Media not found");
        require(!mediaRecords[_mediaHash].isRevoked, "Media already revoked");
        
        disputes[_mediaHash].push(Dispute({
            disputer: msg.sender,
            reason: _reason,
            timestamp: block.timestamp,
            resolved: false
        }));
        
        mediaRecords[_mediaHash].status = VerificationStatus.Disputed;
        
        emit MediaDisputed(_mediaHash, msg.sender, _reason, block.timestamp);
    }
    
    /**
     * @dev Revoke a media record (only creator or consensus party can revoke)
     * @param _mediaHash Hash of the media to revoke
     */
    function revokeMedia(string memory _mediaHash) external {
        MediaRecord storage record = mediaRecords[_mediaHash];
        require(bytes(record.mediaHash).length > 0, "Media not found");
        require(!record.isRevoked, "Already revoked");
        
        // Check if caller is creator or a consensus party
        bool authorized = (msg.sender == record.creator);
        if (!authorized) {
            for (uint i = 0; i < record.consensusParties.length; i++) {
                if (record.consensusParties[i] == msg.sender) {
                    authorized = true;
                    break;
                }
            }
        }
        
        require(authorized, "Not authorized to revoke");
        
        record.isRevoked = true;
        record.status = VerificationStatus.Revoked;
        
        emit MediaRevoked(_mediaHash, msg.sender, block.timestamp);
    }
    
    /**
     * @dev Get full media record details
     * @param _mediaHash Hash of the media
     */
    function getMediaRecord(string memory _mediaHash) 
        external 
        view 
        returns (MediaRecord memory) 
    {
        require(bytes(mediaRecords[_mediaHash].mediaHash).length > 0, "Media not found");
        return mediaRecords[_mediaHash];
    }
    
    /**
     * @dev Get all media created by an address
     * @param _creator Creator address
     */
    function getCreatorMedia(address _creator) external view returns (string[] memory) {
        return creatorMedia[_creator];
    }
    
    /**
     * @dev Get all media a user participated in (consented to)
     * @param _participant Participant address
     */
    function getParticipantMedia(address _participant) external view returns (string[] memory) {
        return participantMedia[_participant];
    }
    
    /**
     * @dev Get all disputes for a media record
     * @param _mediaHash Hash of the media
     */
    function getDisputes(string memory _mediaHash) external view returns (Dispute[] memory) {
        return disputes[_mediaHash];
    }
    
    /**
     * @dev Check if an address consented to a specific media
     * @param _mediaHash Hash of the media
     * @param _address Address to check
     */
    function hasConsent(string memory _mediaHash, address _address) 
        external 
        view 
        returns (bool) 
    {
        MediaRecord memory record = mediaRecords[_mediaHash];
        
        for (uint i = 0; i < record.consensusParties.length; i++) {
            if (record.consensusParties[i] == _address) {
                return true;
            }
        }
        
        return false;
    }
}
