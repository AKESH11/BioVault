#pragma once

#include <deque>
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
    struct Result {
#ifdef HAVE_OPENCV
        std::optional<double> bpm;   // beats per minute if peak found
        double confidence{0.0};      // heuristic peak strength 0..1
        cv::Rect faceBox;            // detected face
        cv::Rect foreheadRoi;        // sampled forehead ROI
        std::vector<double> signal;  // detrended signal used for FFT
#else
        std::optional<double> bpm{std::nullopt};
        double confidence{0.0};
#endif
    };

    // windowSeconds: sliding window length used for FFT (e.g., 10s)
    // fpsHint: expected FPS for buffer sizing (used as a heuristic)
    explicit BioVaultExtractor(double windowSeconds = 10.0, double fpsHint = 30.0);

#ifdef HAVE_OPENCV
    // Process one BGR frame. Returns latest estimation (bpm may be empty
    // until enough samples accumulate).
    Result processFrame(const cv::Mat& bgrFrame);
#else
    Result processFrame(const void* /*frame*/) { return Result{}; }
#endif

private:
#ifdef HAVE_OPENCV
    double windowSeconds_;
    double fpsHint_;
    cv::CascadeClassifier faceDetector_;
    bool cascadeLoaded_{false};

    // (timestamp_sec, green_mean)
    std::deque<std::pair<double, double>> samples_;

    std::optional<cv::Rect> detectFace(const cv::Mat& gray);
    cv::Rect foreheadRegion(const cv::Rect& face) const;
    double extractGreenMean(const cv::Mat& bgr, const cv::Rect& roi) const;
    Result computeBpmIfReady(const cv::Rect& faceBox, const cv::Rect& foreheadBox);
#endif
};
