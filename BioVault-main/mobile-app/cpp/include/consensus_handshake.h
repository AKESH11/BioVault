#ifndef CONSENSUS_HANDSHAKE_H
#define CONSENSUS_HANDSHAKE_H

#include <chrono>
#include <cstdint>
#include <map>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

#ifdef HAVE_BLAKE3
#include <blake3.h>
#endif

namespace biovault {
namespace consensus {

/**
 * @brief Status of the consensus handshake
 */
enum class ConsensusStatus {
    PENDING,          // Waiting for signatures
    COMPLETE,         // All N signatures received
    TIMEOUT,          // 5-second timeout exceeded
    STATUS_UNVERIFIED // Missing signatures after timeout
};

/**
 * @brief Signature received from a BLE peer
 */
struct BLESignature {
    int faceId{-1};               // Corresponds to MediaPipe FaceID
    int bpm{0};                   // Heart rate of the signatory
    std::vector<uint8_t> signature; // Ed25519 signature (64 bytes)
    std::vector<uint8_t> publicKey; // Ed25519 public key (32 bytes)
    uint64_t receivedAt{0};       // Timestamp when signature arrived
};

/**
 * @brief Result of consensus handshake
 */
struct ConsensusResult {
    ConsensusStatus status{ConsensusStatus::PENDING};
    std::string consensusHash;    // BLAKE3 hash if complete
    int expectedSignatures{0};
    int receivedSignatures{0};
    std::vector<int> missingFaceIds; // Face IDs that never signed
    double elapsedSeconds{0.0};
};

/**
 * @brief Multi-party consensual handshake manager
 * 
 * Coordinates N-party consent by:
 * 1. Detecting N faces → waiting for N BLE signatures
 * 2. Building Consensus Hash: BLAKE3(VideoFrames + HardwareDNA + Pulse_1 + Sig_1 + ... Pulse_N + Sig_N)
 * 3. Timeout: Mark STATUS_UNVERIFIED if signatures missing after 5s
 */
class ConsensusHandshake {
public:
    /**
     * @brief Initialize a new consensus session
     * @param expectedFaceIds FaceIDs detected in the frame (from MediaPipe)
     * @param videoFrameHash Hash of the video frame(s)
     * @param hardwareDNA Hardware fingerprint (PRNU-derived)
     * @param timeoutSeconds Signature timeout (default 5.0s)
     */
    ConsensusHandshake(
        const std::vector<int>& expectedFaceIds,
        const std::vector<uint8_t>& videoFrameHash,
        const std::string& hardwareDNA,
        double timeoutSeconds = 5.0
    );

    ~ConsensusHandshake();

    /**
     * @brief Append a BLE signature as it arrives
     * @param sig Signature data from BLE peer
     * @return True if signature accepted and appended to consensus buffer
     */
    bool appendSignature(const BLESignature& sig);

    /**
     * @brief Check if consensus is complete or timed out
     * @return Current consensus result
     */
    ConsensusResult getResult();

    /**
     * @brief Finalize and compute the consensus hash
     * Called when all signatures received or timeout occurs
     * @return Consensus hash (empty if incomplete)
     */
    std::string finalizeConsensusHash();

    /**
     * @brief Check if session has timed out
     */
    bool hasTimedOut() const;

    /**
     * @brief Get elapsed time since session start
     */
    double getElapsedSeconds() const;

    /**
     * @brief Cancel the session
     */
    void cancel();

private:
    std::mutex mutex_;
    std::vector<int> expectedFaceIds_;
    std::map<int, BLESignature> signatures_; // faceId -> signature
    std::vector<uint8_t> videoFrameHash_;
    std::string hardwareDNA_;
    double timeoutSeconds_;
    std::chrono::steady_clock::time_point startTime_;
    bool finalized_{false};
    std::string consensusHash_;
    ConsensusStatus status_{ConsensusStatus::PENDING};

    void updateStatus();
    std::vector<uint8_t> buildConsensusBuffer() const;
};

} // namespace consensus
} // namespace biovault

#endif // CONSENSUS_HANDSHAKE_H
