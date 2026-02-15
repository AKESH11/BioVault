// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

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
 *
 * Security features:
 * - ReentrancyGuard on all state-changing functions
 * - Pausable for emergency stops
 * - Dispute resolution with owner arbitration
 * - String length limits to prevent gas griefing
 */
contract MediaAnchor is Ownable, ReentrancyGuard, Pausable {
    
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
        string proofOfRealityHash;  // BLAKE3 hash of Proof of Reality metadata
        string proofOfRealityIPFS;  // IPFS CID of full Proof of Reality JSON
        bool allUniqueSignals;      // True if no replay attacks detected
        uint8 detectedFaces;        // Number of faces detected
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
        string hardwareID,
        bool allUniqueSignals,
        uint8 detectedFaces
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
     * @dev Anchor a new media record to the blockchain with Proof of Reality
     * @param _mediaHash Unique hash combining media + biometrics + hardware
     * @param _bioSignature Composite biometric signature
     * @param _hardwareID Hardware fingerprint (PRNU)
     * @param _consensusParties Addresses of all consenting parties
     * @param _ipfsHash IPFS CID where encrypted media is stored
     * @param _proofOfRealityHash BLAKE3 hash of Proof of Reality metadata
     * @param _proofOfRealityIPFS IPFS CID of full Proof of Reality JSON
     * @param _allUniqueSignals True if no replay attacks detected
     * @param _detectedFaces Number of faces detected
     */
    function anchorMedia(
        string memory _mediaHash,
        string memory _bioSignature,
        string memory _hardwareID,
        address[] memory _consensusParties,
        string memory _ipfsHash,
        string memory _proofOfRealityHash,
        string memory _proofOfRealityIPFS,
        bool _allUniqueSignals,
        uint8 _detectedFaces
    ) external nonReentrant whenNotPaused {
        require(bytes(_mediaHash).length > 0, "Media hash cannot be empty");
        require(bytes(_mediaHash).length <= 256, "Media hash too long");
        require(bytes(_bioSignature).length <= 512, "Bio signature too long");
        require(bytes(_hardwareID).length <= 256, "Hardware ID too long");
        require(bytes(_ipfsHash).length <= 256, "IPFS hash too long");
        require(bytes(_proofOfRealityHash).length <= 256, "Proof of reality hash too long");
        require(bytes(_proofOfRealityIPFS).length <= 256, "Proof of reality IPFS too long");
        require(bytes(mediaRecords[_mediaHash].mediaHash).length == 0, "Media already anchored");

        // For solo recordings, auto-include the creator as the sole consensus party
        address[] memory parties = _consensusParties;
        if (parties.length == 0) {
            parties = new address[](1);
            parties[0] = msg.sender;
        }
        
        MediaRecord storage record = mediaRecords[_mediaHash];
        record.mediaHash = _mediaHash;
        record.bioSignature = _bioSignature;
        record.hardwareID = _hardwareID;
        record.timestamp = block.timestamp;
        record.creator = msg.sender;
        record.consensusParties = parties;
        record.isRevoked = false;
        record.ipfsHash = _ipfsHash;
        record.status = VerificationStatus.Verified;
        record.proofOfRealityHash = _proofOfRealityHash;
        record.proofOfRealityIPFS = _proofOfRealityIPFS;
        record.allUniqueSignals = _allUniqueSignals;
        record.detectedFaces = _detectedFaces;
        
        // Track media for creator
        creatorMedia[msg.sender].push(_mediaHash);
        
        // Track media for all participants
        for (uint i = 0; i < parties.length; i++) {
            participantMedia[parties[i]].push(_mediaHash);
        }
        
        emit MediaAnchored(_mediaHash, msg.sender, block.timestamp, _hardwareID, _allUniqueSignals, _detectedFaces);
        
        // Emit consent events
        for (uint i = 0; i < parties.length; i++) {
            emit ConsentAdded(_mediaHash, parties[i], block.timestamp);
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
    function disputeMedia(string memory _mediaHash, string memory _reason) external whenNotPaused {
        require(bytes(mediaRecords[_mediaHash].mediaHash).length > 0, "Media not found");
        require(!mediaRecords[_mediaHash].isRevoked, "Media already revoked");
        require(bytes(_reason).length <= 2048, "Reason too long");
        
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
    function revokeMedia(string memory _mediaHash) external nonReentrant whenNotPaused {
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

    // ========================================================================
    // Dispute Resolution (owner only)
    // ========================================================================

    event DisputeResolved(
        string indexed mediaHash,
        uint256 disputeIndex,
        bool upheld,
        address indexed resolver,
        uint256 timestamp
    );

    /**
     * @dev Resolve a pending dispute (owner only).
     *      If upheld=true, the media stays Disputed/Revoked.
     *      If upheld=false, the media is restored to Verified.
     * @param _mediaHash Hash of the disputed media
     * @param _disputeIndex Index of the dispute in the disputes array
     * @param _upheld True if the dispute is upheld (media invalid)
     */
    function resolveDispute(
        string memory _mediaHash,
        uint256 _disputeIndex,
        bool _upheld
    ) external onlyOwner nonReentrant {
        require(bytes(mediaRecords[_mediaHash].mediaHash).length > 0, "Media not found");
        
        Dispute[] storage mediaDisputes = disputes[_mediaHash];
        require(_disputeIndex < mediaDisputes.length, "Invalid dispute index");
        require(!mediaDisputes[_disputeIndex].resolved, "Dispute already resolved");

        mediaDisputes[_disputeIndex].resolved = true;

        if (_upheld) {
            // Dispute upheld — keep status as Disputed (or Revoke if needed)
            mediaRecords[_mediaHash].status = VerificationStatus.Disputed;
        } else {
            // Dispute rejected — check if any other unresolved disputes remain
            bool hasUnresolved = false;
            for (uint256 i = 0; i < mediaDisputes.length; i++) {
                if (!mediaDisputes[i].resolved) {
                    hasUnresolved = true;
                    break;
                }
            }
            // If no unresolved disputes, restore to Verified
            if (!hasUnresolved && !mediaRecords[_mediaHash].isRevoked) {
                mediaRecords[_mediaHash].status = VerificationStatus.Verified;
            }
        }

        emit DisputeResolved(_mediaHash, _disputeIndex, _upheld, msg.sender, block.timestamp);
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
}
