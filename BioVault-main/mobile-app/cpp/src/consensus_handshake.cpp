#include "consensus_handshake.h"
#include "crypto_utils.h"
#include <algorithm>
#include <cstring>
#include <sstream>

namespace biovault {
namespace consensus {

ConsensusHandshake::ConsensusHandshake(
    const std::vector<int>& expectedFaceIds,
    const std::vector<uint8_t>& videoFrameHash,
    const std::string& hardwareDNA,
    double timeoutSeconds)
    : expectedFaceIds_(expectedFaceIds)
    , videoFrameHash_(videoFrameHash)
    , hardwareDNA_(hardwareDNA)
    , timeoutSeconds_(timeoutSeconds)
    , startTime_(std::chrono::steady_clock::now())
{
    // Validate inputs
    if (expectedFaceIds_.empty()) {
        status_ = ConsensusStatus::STATUS_UNVERIFIED;
    }
}

ConsensusHandshake::~ConsensusHandshake() {
}

bool ConsensusHandshake::appendSignature(const BLESignature& sig) {
    std::lock_guard<std::mutex> lock(mutex_);

    // Already finalized?
    if (finalized_) {
        return false;
    }

    // Check timeout
    if (hasTimedOut()) {
        status_ = ConsensusStatus::TIMEOUT;
        return false;
    }

    // Validate faceId is expected
    auto it = std::find(expectedFaceIds_.begin(), expectedFaceIds_.end(), sig.faceId);
    if (it == expectedFaceIds_.end()) {
        return false; // Unknown face ID
    }

    // Prevent duplicates
    if (signatures_.count(sig.faceId) > 0) {
        return false; // Already have signature for this face
    }

    // Store signature
    signatures_[sig.faceId] = sig;

    updateStatus();
    return true;
}

void ConsensusHandshake::updateStatus() {
    // Check if all signatures received
    if (signatures_.size() == expectedFaceIds_.size()) {
        status_ = ConsensusStatus::COMPLETE;
    } else if (hasTimedOut()) {
        status_ = ConsensusStatus::TIMEOUT;
    } else {
        status_ = ConsensusStatus::PENDING;
    }
}

bool ConsensusHandshake::hasTimedOut() const {
    auto now = std::chrono::steady_clock::now();
    double elapsed = std::chrono::duration<double>(now - startTime_).count();
    return elapsed >= timeoutSeconds_;
}

double ConsensusHandshake::getElapsedSeconds() const {
    auto now = std::chrono::steady_clock::now();
    return std::chrono::duration<double>(now - startTime_).count();
}

ConsensusResult ConsensusHandshake::getResult() {
    std::lock_guard<std::mutex> lock(mutex_);

    ConsensusResult result;
    result.status = status_;
    result.expectedSignatures = static_cast<int>(expectedFaceIds_.size());
    result.receivedSignatures = static_cast<int>(signatures_.size());
    result.elapsedSeconds = getElapsedSeconds();

    // Find missing face IDs
    for (int faceId : expectedFaceIds_) {
        if (signatures_.count(faceId) == 0) {
            result.missingFaceIds.push_back(faceId);
        }
    }

    // Auto-finalize on timeout
    if (hasTimedOut() && !finalized_) {
        result.status = (result.missingFaceIds.empty()) 
            ? ConsensusStatus::COMPLETE 
            : ConsensusStatus::STATUS_UNVERIFIED;
        status_ = result.status;
    }

    result.consensusHash = consensusHash_;
    return result;
}

std::vector<uint8_t> ConsensusHandshake::buildConsensusBuffer() const {
    // Build consensus buffer:
    // VideoFrames + HardwareDNA + Pulse_1 + Sig_1 + Pulse_2 + Sig_2 ... Pulse_N + Sig_N
    
    std::vector<uint8_t> buffer;
    buffer.reserve(
        videoFrameHash_.size() + 
        hardwareDNA_.size() + 
        expectedFaceIds_.size() * (sizeof(uint32_t) + 64) // BPM + signature
    );

    // 1. Video frame hash
    buffer.insert(buffer.end(), videoFrameHash_.begin(), videoFrameHash_.end());

    // 2. Hardware DNA (PRNU fingerprint)
    buffer.insert(buffer.end(), hardwareDNA_.begin(), hardwareDNA_.end());

    // 3. Append each signature in faceId order (deterministic ordering)
    std::vector<int> sortedIds = expectedFaceIds_;
    std::sort(sortedIds.begin(), sortedIds.end());

    for (int faceId : sortedIds) {
        auto it = signatures_.find(faceId);
        if (it != signatures_.end()) {
            const BLESignature& sig = it->second;

            // Append BPM (pulse) as little-endian 32-bit
            uint32_t bpm32 = static_cast<uint32_t>(sig.bpm);
            const uint8_t* bpmBytes = reinterpret_cast<const uint8_t*>(&bpm32);
            buffer.insert(buffer.end(), bpmBytes, bpmBytes + sizeof(bpm32));

            // Append signature bytes (Ed25519 = 64 bytes)
            buffer.insert(buffer.end(), sig.signature.begin(), sig.signature.end());
        } else {
            // Missing signature: append zeros as placeholder
            // This ensures deterministic hash even with missing sigs
            std::vector<uint8_t> placeholder(sizeof(uint32_t) + 64, 0x00);
            buffer.insert(buffer.end(), placeholder.begin(), placeholder.end());
        }
    }

    return buffer;
}

std::string ConsensusHandshake::finalizeConsensusHash() {
    std::lock_guard<std::mutex> lock(mutex_);

    if (finalized_) {
        return consensusHash_;
    }

    // Build consensus buffer
    std::vector<uint8_t> buffer = buildConsensusBuffer();

    // Compute BLAKE3 hash
    consensusHash_ = crypto::CryptoUtils::blake3(buffer);

    // Update final status
    updateStatus();
    if (status_ == ConsensusStatus::TIMEOUT || !signatures_.empty()) {
        finalized_ = true;
    }

    // If missing signatures after timeout, mark as unverified
    if (hasTimedOut() && signatures_.size() < expectedFaceIds_.size()) {
        status_ = ConsensusStatus::STATUS_UNVERIFIED;
    }

    return consensusHash_;
}

void ConsensusHandshake::cancel() {
    std::lock_guard<std::mutex> lock(mutex_);
    status_ = ConsensusStatus::STATUS_UNVERIFIED;
    finalized_ = true;
}

} // namespace consensus
} // namespace biovault
