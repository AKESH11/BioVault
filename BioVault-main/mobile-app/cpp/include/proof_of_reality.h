#ifndef PROOF_OF_REALITY_H
#define PROOF_OF_REALITY_H

#include <string>
#include <vector>
#include <map>

namespace biovault {
namespace reality {

/**
 * @brief Pulse data for one person
 */
struct PulseData {
    int faceId;
    int bpm;
    std::vector<double> rawSignal;  // Time-series pulse signal
    double confidence;
};

/**
 * @brief Correlation between two pulses
 */
struct CorrelationPair {
    std::string pairId;     // e.g., "12" for faceId 1 and 2
    int faceId1;
    int faceId2;
    double coefficient;     // Pearson correlation [-1, 1]
    bool replayAttack;      // True if correlation > threshold
};

/**
 * @brief Proof of Reality metadata structure
 * 
 * This structure is serialized to JSON and stored:
 * - Hash on-chain (Polygon MediaAnchor contract)
 * - Full JSON on IPFS
 */
struct ProofOfRealityMetadata {
    // Pulse data from all detected faces
    std::vector<PulseData> pulseData;
    
    // Pairwise correlation analysis
    std::map<std::string, double> correlationCoefficients;  // "12" -> 0.99
    std::map<std::string, bool> replayAttackFlags;         // "12" -> true
    
    // Consensus information
    std::string consensusHash;      // BLAKE3 consensus hash
    std::string hardwareDNA;        // PRNU fingerprint
    std::string videoFrameHash;     // Hash of video frames
    uint64_t timestamp;             // Capture timestamp
    
    // Verification status
    bool allUniqueSignals;          // True if no replay attacks detected
    int detectedFaces;
    int receivedSignatures;
    std::string verificationStatus; // "COMPLETE" / "STATUS_UNVERIFIED"
    
    /**
     * @brief Serialize to JSON string
     */
    std::string toJSON() const;
    
    /**
     * @brief Create from correlation analysis results
     */
    static ProofOfRealityMetadata fromAnalysis(
        const std::vector<PulseData>& pulses,
        const std::vector<CorrelationPair>& correlations,
        const std::string& consensusHash,
        const std::string& hardwareDNA,
        const std::string& videoFrameHash,
        uint64_t timestamp,
        const std::string& verificationStatus
    );
};

/**
 * @brief Proof of Reality analyzer
 */
class ProofOfRealityAnalyzer {
public:
    /**
     * @brief Analyze pulse signals for uniqueness
     * @param pulseData Pulse signals from all detected faces
     * @param threshold Correlation threshold for replay detection (default 0.95)
     * @return List of correlation pairs with replay flags
     */
    static std::vector<CorrelationPair> analyzePulseUniqueness(
        const std::vector<PulseData>& pulseData,
        double threshold = 0.95
    );
    
    /**
     * @brief Create complete Proof of Reality metadata
     */
    static ProofOfRealityMetadata createMetadata(
        const std::vector<PulseData>& pulseData,
        const std::string& consensusHash,
        const std::string& hardwareDNA,
        const std::string& videoFrameHash,
        uint64_t timestamp,
        const std::string& verificationStatus
    );
    
private:
    static double calculatePearsonCorrelation(
        const std::vector<double>& signal1,
        const std::vector<double>& signal2
    );
};

} // namespace reality
} // namespace biovault

#endif // PROOF_OF_REALITY_H
