#ifndef RPPG_ENGINE_H
#define RPPG_ENGINE_H

#ifdef HAVE_OPENCV
#include <opencv2/opencv.hpp>
#endif
#include <vector>
#include <queue>
#include <string>
#include <cstdint>

namespace biovault {

/**
 * @brief Remote Photoplethysmography (rPPG) Engine
 * 
 * Extracts heart rate (BPM) from video frames by analyzing
 * sub-perceptual skin color changes caused by blood flow.
 */
class RPPGEngine {
public:
    RPPGEngine(int sampleRate = 30, int windowSize = 150);
    ~RPPGEngine();

    /**
     * @brief Process a single frame and update heart rate calculation
     * @param frame Input BGR frame from camera
     * @param faceBoundingBox Region of interest (face detected by MediaPipe)
     * @return True if frame was processed successfully
     */
#ifdef HAVE_OPENCV
    bool processFrame(const cv::Mat& frame, const cv::Rect& faceBoundingBox);
#else
    bool processFrame(const void* frame, const void* faceBoundingBox);
#endif

    /**
     * @brief Get current calculated heart rate
     * @return BPM (Beats Per Minute), returns -1 if not enough data
     */
    int getCurrentBPM() const;

    /**
     * @brief Get confidence score of the current BPM reading
     * @return Confidence value between 0.0 and 1.0
     */
    float getConfidence() const;

    /**
     * @brief Reset the engine state
     */
    void reset();

    /**
     * @brief Check if liveness is detected (real human, not photo)
     * @return True if live subject detected
     */
    bool isLivenessDetected() const;

private:
    struct FrameData {
        double redMean;
        double greenMean;
        double blueMean;
        uint64_t timestamp;
    };

    int m_sampleRate;           // Camera FPS
    int m_windowSize;           // Number of frames for FFT analysis
    std::queue<FrameData> m_frameBuffer;
    
    int m_currentBPM;
    float m_confidence;
    bool m_livenessDetected;

#ifdef HAVE_OPENCV
    // Extract average RGB from skin region
    cv::Vec3d extractRGB(const cv::Mat& frame, const cv::Rect& roi);

    // Apply FFT to detect dominant frequency (heart rate)
    int calculateBPM();

    // Check for temporal changes indicating liveness
    void updateLivenessDetection();

    // Bandpass filter for heart rate range (0.7 Hz - 4 Hz = 42-240 BPM)
    std::vector<double> applyBandpassFilter(const std::vector<double>& signal);
#endif
};

} // namespace biovault

#endif // RPPG_ENGINE_H
