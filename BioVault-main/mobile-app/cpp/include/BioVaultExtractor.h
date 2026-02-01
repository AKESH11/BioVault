#pragma once

#include <deque>
#include <future>
#include <map>
#include <optional>
#include <utility>
#include <vector>

#ifdef HAVE_OPENCV
#include <opencv2/opencv.hpp>
#endif

// BioVaultExtractor: OpenCV-based rPPG (remote heart rate) extractor.
// Collects green-channel means from a forehead ROI over time, then runs an FFT
// over a sliding window to estimate the dominant heart-rate frequency.
class BioVaultExtractor {
public:
    struct PersonBioData {
#ifdef HAVE_OPENCV
        int faceId{-1};
        std::optional<double> bpm;   // beats per minute if peak found
        double confidence{0.0};      // heuristic peak strength 0..1
        cv::Rect faceBox;            // detected face
        cv::Rect foreheadRoi;        // sampled forehead ROI
        std::vector<double> signal;  // detrended signal used for FFT
#else
        int faceId{-1};
        std::optional<double> bpm{std::nullopt};
        double confidence{0.0};
#endif
    };

    // MediaPipe Face Mesh detection metadata (faceId must be stable per track).
    struct FaceObservation {
#ifdef HAVE_OPENCV
        int faceId{-1};
        cv::Rect faceBox;
#else
        int faceId{-1};
#endif
    };

    // Rolling buffer of green means for one face.
    struct RollingBuffer {
        std::deque<std::pair<double, double>> samples; // (timestamp_sec, green_mean)
        double lastTimestamp{0.0};

        void push(double t, double v, double windowSeconds) {
            samples.push_back({t, v});
            lastTimestamp = t;
            trim(windowSeconds, t);
        }

        void trim(double windowSeconds, double now) {
            const double cutoff = now - windowSeconds;
            while (!samples.empty() && samples.front().first < cutoff) {
                samples.pop_front();
            }
        }

        struct Snapshot {
            std::vector<double> values;
            double t0{0.0};
            double t1{0.0};
        };

        Snapshot snapshot() const {
            Snapshot s;
            if (!samples.empty()) {
                s.t0 = samples.front().first;
                s.t1 = samples.back().first;
                s.values.reserve(samples.size());
                for (auto& p : samples) s.values.push_back(p.second);
            }
            return s;
        }
    };

    using Result = PersonBioData; // Backward compatibility alias

    // windowSeconds: sliding window length used for FFT (e.g., 10s)
    // fpsHint: expected FPS for buffer sizing (used as a heuristic)
    explicit BioVaultExtractor(double windowSeconds = 10.0, double fpsHint = 30.0);

#ifdef HAVE_OPENCV
    // Single-face helper (uses Haar cascade). Prefer processFrameMulti with Face Mesh IDs.
    Result processFrame(const cv::Mat& bgrFrame);

    // Multi-face rPPG using MediaPipe Face Mesh IDs.
    // Returns per-face BPM + raw signal without one face blocking another.
    std::vector<PersonBioData> processFrameMulti(
        const cv::Mat& bgrFrame,
        const std::vector<FaceObservation>& faces);

    // Proof of Reality: Cross-correlation analysis for replay attack detection
    struct PulseCorrelation {
        int faceId1;
        int faceId2;
        double correlation;  // Pearson correlation coefficient [-1, 1]
        bool replayAttack;   // True if correlation > 0.95 (likely spoofed)
    };

    // Calculate cross-correlations between all pulse pairs
    // Returns list of correlations + replay attack flags
    std::vector<PulseCorrelation> analyzePulseCorrelations(
        const std::vector<PersonBioData>& pulseData,
        double replayThreshold = 0.95);
#else
    Result processFrame(const void* /*frame*/) { return Result{}; }
    std::vector<PersonBioData> processFrameMulti(const void* /*frame*/, const void* /*faces*/) { return {}; }
    std::vector<PulseCorrelation> analyzePulseCorrelations(const std::vector<PersonBioData>& /*pulseData*/, double /*threshold*/) { return {}; }
#endif

private:
#ifdef HAVE_OPENCV
    static double calculatePearsonCorrelation(
        const std::vector<double>& signal1,
        const std::vector<double>& signal2);
    double windowSeconds_;
    double fpsHint_;
    int maxFaces_;
    cv::CascadeClassifier faceDetector_;
    bool cascadeLoaded_{false};

    // faceId -> rolling green samples
    std::map<int, RollingBuffer> buffers_;

    // (timestamp_sec, green_mean) for legacy single-face flow
    std::deque<std::pair<double, double>> samples_;

    std::optional<cv::Rect> detectFace(const cv::Mat& gray);
    cv::Rect foreheadRegion(const cv::Rect& face) const;
    double extractGreenMean(const cv::Mat& bgr, const cv::Rect& roi) const;
    Result computeBpmIfReady(const cv::Rect& faceBox, const cv::Rect& foreheadBox);
    PersonBioData computeFromSnapshot(int faceId, const cv::Rect& faceBox,
                                      const cv::Rect& foreheadBox,
                                      const RollingBuffer::Snapshot& snap) const;
    void trimStaleTracks(double nowSeconds);
#endif
};
