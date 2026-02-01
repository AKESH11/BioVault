#include "proof_of_reality.h"
#include <algorithm>
#include <cmath>
#include <numeric>
#include <sstream>
#include <iomanip>

namespace biovault {
namespace reality {

double ProofOfRealityAnalyzer::calculatePearsonCorrelation(
    const std::vector<double>& signal1,
    const std::vector<double>& signal2) {
    
    if (signal1.size() != signal2.size() || signal1.empty()) {
        return 0.0;
    }

    const size_t n = signal1.size();
    
    // Calculate means
    double mean1 = std::accumulate(signal1.begin(), signal1.end(), 0.0) / n;
    double mean2 = std::accumulate(signal2.begin(), signal2.end(), 0.0) / n;
    
    // Calculate covariance and standard deviations
    double covariance = 0.0;
    double variance1 = 0.0;
    double variance2 = 0.0;
    
    for (size_t i = 0; i < n; ++i) {
        double diff1 = signal1[i] - mean1;
        double diff2 = signal2[i] - mean2;
        covariance += diff1 * diff2;
        variance1 += diff1 * diff1;
        variance2 += diff2 * diff2;
    }
    
    // Calculate Pearson correlation coefficient
    double denominator = std::sqrt(variance1 * variance2);
    if (denominator < 1e-10) {
        return 0.0;
    }
    
    return covariance / denominator;
}

std::vector<CorrelationPair> ProofOfRealityAnalyzer::analyzePulseUniqueness(
    const std::vector<PulseData>& pulseData,
    double threshold) {
    
    std::vector<CorrelationPair> results;
    
    // Calculate pairwise correlations
    for (size_t i = 0; i < pulseData.size(); ++i) {
        for (size_t j = i + 1; j < pulseData.size(); ++j) {
            const auto& pulse1 = pulseData[i];
            const auto& pulse2 = pulseData[j];
            
            if (pulse1.rawSignal.empty() || pulse2.rawSignal.empty()) {
                continue;
            }
            
            // Align signals to same length
            size_t minLen = std::min(pulse1.rawSignal.size(), pulse2.rawSignal.size());
            std::vector<double> sig1(pulse1.rawSignal.begin(), pulse1.rawSignal.begin() + minLen);
            std::vector<double> sig2(pulse2.rawSignal.begin(), pulse2.rawSignal.begin() + minLen);
            
            // Calculate correlation
            double corr = calculatePearsonCorrelation(sig1, sig2);
            
            CorrelationPair cp;
            cp.faceId1 = pulse1.faceId;
            cp.faceId2 = pulse2.faceId;
            cp.pairId = std::to_string(pulse1.faceId) + std::to_string(pulse2.faceId);
            cp.coefficient = corr;
            cp.replayAttack = (std::abs(corr) > threshold);
            
            results.push_back(cp);
        }
    }
    
    return results;
}

ProofOfRealityMetadata ProofOfRealityAnalyzer::createMetadata(
    const std::vector<PulseData>& pulseData,
    const std::string& consensusHash,
    const std::string& hardwareDNA,
    const std::string& videoFrameHash,
    uint64_t timestamp,
    const std::string& verificationStatus) {
    
    // Analyze pulse uniqueness
    auto correlations = analyzePulseUniqueness(pulseData, 0.95);
    
    return ProofOfRealityMetadata::fromAnalysis(
        pulseData,
        correlations,
        consensusHash,
        hardwareDNA,
        videoFrameHash,
        timestamp,
        verificationStatus
    );
}

ProofOfRealityMetadata ProofOfRealityMetadata::fromAnalysis(
    const std::vector<PulseData>& pulses,
    const std::vector<CorrelationPair>& correlations,
    const std::string& consensusHash_,
    const std::string& hardwareDNA_,
    const std::string& videoFrameHash_,
    uint64_t timestamp_,
    const std::string& verificationStatus_) {
    
    ProofOfRealityMetadata meta;
    meta.pulseData = pulses;
    meta.consensusHash = consensusHash_;
    meta.hardwareDNA = hardwareDNA_;
    meta.videoFrameHash = videoFrameHash_;
    meta.timestamp = timestamp_;
    meta.verificationStatus = verificationStatus_;
    meta.detectedFaces = static_cast<int>(pulses.size());
    meta.receivedSignatures = static_cast<int>(pulses.size());
    
    // Build correlation maps
    bool anyReplayAttack = false;
    for (const auto& corr : correlations) {
        meta.correlationCoefficients[corr.pairId] = corr.coefficient;
        meta.replayAttackFlags[corr.pairId] = corr.replayAttack;
        if (corr.replayAttack) {
            anyReplayAttack = true;
        }
    }
    
    meta.allUniqueSignals = !anyReplayAttack;
    
    return meta;
}

std::string ProofOfRealityMetadata::toJSON() const {
    std::ostringstream json;
    json << std::fixed << std::setprecision(4);
    
    json << "{\n";
    
    // Pulse data array
    json << "  \"pulse_data\": [\n";
    for (size_t i = 0; i < pulseData.size(); ++i) {
        const auto& pulse = pulseData[i];
        json << "    {\n";
        json << "      \"face_id\": " << pulse.faceId << ",\n";
        json << "      \"bpm\": " << pulse.bpm << ",\n";
        json << "      \"confidence\": " << pulse.confidence << ",\n";
        json << "      \"signal_length\": " << pulse.rawSignal.size() << "\n";
        json << "    }";
        if (i < pulseData.size() - 1) json << ",";
        json << "\n";
    }
    json << "  ],\n";
    
    // Correlation coefficients
    json << "  \"correlation_coefficients\": {\n";
    size_t idx = 0;
    for (const auto& pair : correlationCoefficients) {
        json << "    \"" << pair.first << "\": " << pair.second;
        if (++idx < correlationCoefficients.size()) json << ",";
        json << "\n";
    }
    json << "  },\n";
    
    // Replay attack flags
    json << "  \"replay_attack_flags\": {\n";
    idx = 0;
    for (const auto& pair : replayAttackFlags) {
        json << "    \"" << pair.first << "\": " << (pair.second ? "true" : "false");
        if (++idx < replayAttackFlags.size()) json << ",";
        json << "\n";
    }
    json << "  },\n";
    
    // Consensus data
    json << "  \"consensus_hash\": \"" << consensusHash << "\",\n";
    json << "  \"hardware_dna\": \"" << hardwareDNA << "\",\n";
    json << "  \"video_frame_hash\": \"" << videoFrameHash << "\",\n";
    json << "  \"timestamp\": " << timestamp << ",\n";
    json << "  \"verification_status\": \"" << verificationStatus << "\",\n";
    json << "  \"all_unique_signals\": " << (allUniqueSignals ? "true" : "false") << ",\n";
    json << "  \"detected_faces\": " << detectedFaces << ",\n";
    json << "  \"received_signatures\": " << receivedSignatures << "\n";
    
    json << "}";
    
    return json.str();
}

} // namespace reality
} // namespace biovault
