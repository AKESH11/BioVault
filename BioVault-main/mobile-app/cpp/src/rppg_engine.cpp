#include "rppg_engine.h"
#include <cmath>
#include <numeric>
#include <algorithm>
#include <chrono>

// Define PI explicitly to avoid relying on non-standard M_PI
constexpr double BIO_PI = 3.14159265358979323846;

namespace biovault {

RPPGEngine::RPPGEngine(int sampleRate, int windowSize)
    : m_sampleRate(sampleRate)
    , m_windowSize(windowSize)
    , m_currentBPM(-1)
    , m_confidence(0.0f)
    , m_livenessDetected(false)
{
}

RPPGEngine::~RPPGEngine() {
}

#ifdef HAVE_OPENCV
bool RPPGEngine::processFrame(const cv::Mat& frame, const cv::Rect& faceBoundingBox) {
    if (frame.empty() || faceBoundingBox.area() == 0) {
        return false;
    }

    // Extract average RGB from skin region
    cv::Vec3d rgb = extractRGB(frame, faceBoundingBox);
    
    // Store frame data
    FrameData data;
    data.redMean = rgb[2];
    data.greenMean = rgb[1];
    data.blueMean = rgb[0];
    data.timestamp = std::chrono::duration_cast<std::chrono::milliseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();

    m_frameBuffer.push(data);

    // Maintain window size
    if (m_frameBuffer.size() > static_cast<size_t>(m_windowSize)) {
        m_frameBuffer.pop();
    }

    // Calculate BPM when we have enough data
    if (m_frameBuffer.size() >= static_cast<size_t>(m_windowSize)) {
        m_currentBPM = calculateBPM();
        updateLivenessDetection();
    }

    return true;
}

#endif // HAVE_OPENCV

int RPPGEngine::getCurrentBPM() const {
    return m_currentBPM;
}

float RPPGEngine::getConfidence() const {
    return m_confidence;
}

void RPPGEngine::reset() {
    while (!m_frameBuffer.empty()) {
        m_frameBuffer.pop();
    }
    m_currentBPM = -1;
    m_confidence = 0.0f;
    m_livenessDetected = false;
}

bool RPPGEngine::isLivenessDetected() const {
    return m_livenessDetected;
}

#ifdef HAVE_OPENCV

cv::Vec3d RPPGEngine::extractRGB(const cv::Mat& frame, const cv::Rect& roi) {
    // Ensure ROI is within frame bounds
    cv::Rect safeROI = roi & cv::Rect(0, 0, frame.cols, frame.rows);
    
    if (safeROI.area() == 0) {
        return cv::Vec3d(0, 0, 0);
    }

    cv::Mat faceRegion = frame(safeROI);
    cv::Scalar mean = cv::mean(faceRegion);
    
    return cv::Vec3d(mean[0], mean[1], mean[2]);
}

int RPPGEngine::calculateBPM() {
    if (m_frameBuffer.size() < static_cast<size_t>(m_windowSize)) {
        return -1;
    }

    // Extract green channel (most sensitive to blood volume changes)
    std::vector<double> greenSignal;
    greenSignal.reserve(m_frameBuffer.size());
    
    std::queue<FrameData> tempQueue = m_frameBuffer;
    while (!tempQueue.empty()) {
        greenSignal.push_back(tempQueue.front().greenMean);
        tempQueue.pop();
    }

    // Apply bandpass filter (heart rate range: 42-240 BPM = 0.7-4 Hz)
    std::vector<double> filteredSignal = applyBandpassFilter(greenSignal);

    // FFT to find dominant frequency
    int N = filteredSignal.size();
    if (N < 32) return -1;

    // Simple DFT for frequency analysis
    double maxMagnitude = 0.0;
    int maxFreqIndex = 0;
    
    double minFreq = 0.7;  // 42 BPM
    double maxFreq = 4.0;  // 240 BPM
    int minIndex = static_cast<int>(minFreq * N / m_sampleRate);
    int maxIndex = static_cast<int>(maxFreq * N / m_sampleRate);

    for (int k = minIndex; k < maxIndex && k < N/2; ++k) {
        double real = 0.0, imag = 0.0;
        
        for (int n = 0; n < N; ++n) {
            double angle = 2.0 * BIO_PI * k * n / N;
            real += filteredSignal[n] * cos(angle);
            imag += filteredSignal[n] * sin(angle);
        }
        
        double magnitude = sqrt(real * real + imag * imag);
        
        if (magnitude > maxMagnitude) {
            maxMagnitude = magnitude;
            maxFreqIndex = k;
        }
    }

    // Convert frequency to BPM
    double frequency = static_cast<double>(maxFreqIndex) * m_sampleRate / N;
    int bpm = static_cast<int>(frequency * 60.0);

    // Calculate confidence based on peak strength
    double avgMagnitude = maxMagnitude / N;
    m_confidence = std::min(1.0f, static_cast<float>(avgMagnitude * 10.0));

    return bpm;
}

std::vector<double> RPPGEngine::applyBandpassFilter(const std::vector<double>& signal) {
    // Simple moving average filter for demonstration
    // In production, use a proper Butterworth or Chebyshev filter
    std::vector<double> filtered;
    filtered.reserve(signal.size());
    
    int kernelSize = 5;
    for (size_t i = 0; i < signal.size(); ++i) {
        double sum = 0.0;
        int count = 0;
        
        for (int j = -kernelSize/2; j <= kernelSize/2; ++j) {
            int index = static_cast<int>(i) + j;
            if (index >= 0 && index < static_cast<int>(signal.size())) {
                sum += signal[index];
                count++;
            }
        }
        
        filtered.push_back(sum / count);
    }
    
    return filtered;
}

void RPPGEngine::updateLivenessDetection() {
    // Check for temporal variation (live humans show continuous variation)
    if (m_frameBuffer.size() < 30) {
        m_livenessDetected = false;
        return;
    }

    std::vector<double> variations;
    std::queue<FrameData> tempQueue = m_frameBuffer;
    
    FrameData prev = tempQueue.front();
    tempQueue.pop();
    
    while (!tempQueue.empty()) {
        FrameData curr = tempQueue.front();
        double variation = fabs(curr.greenMean - prev.greenMean);
        variations.push_back(variation);
        prev = curr;
        tempQueue.pop();
    }

    double avgVariation = std::accumulate(variations.begin(), variations.end(), 0.0) / variations.size();
    
    // If average variation is above threshold, likely live subject
    m_livenessDetected = (avgVariation > 0.5);
}

#else
// Stub implementations when OpenCV is not available
bool RPPGEngine::processFrame(const void* /*frame*/, const void* /*faceBoundingBox*/) {
    m_currentBPM = 72; // Mock value
    m_confidence = 0.85f;
    m_livenessDetected = true;
    return true;
}
#endif

} // namespace biovault
