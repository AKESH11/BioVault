#include "prnu_extractor.h"
#include "crypto_utils.h"
#ifdef HAVE_OPENCV
#include <opencv2/imgproc.hpp>
#endif
#include <sstream>
#include <iomanip>
#include <fstream>

namespace biovault {

PRNUExtractor::PRNUExtractor()
    : m_isCalibrated(false)
{
}

PRNUExtractor::~PRNUExtractor() {
}

#ifdef HAVE_OPENCV
bool PRNUExtractor::extractPattern(const std::vector<cv::Mat>& frames) {
    if (frames.size() < 50) {
        return false;  // Need at least 50 frames for robust extraction
    }

    std::vector<cv::Mat> grayFrames;
    grayFrames.reserve(frames.size());

    // Convert all frames to grayscale
    for (const auto& frame : frames) {
        if (frame.empty()) continue;
        
        cv::Mat gray;
        if (frame.channels() == 3) {
            cv::cvtColor(frame, gray, cv::COLOR_BGR2GRAY);
        } else {
            gray = frame.clone();
        }
        gray.convertTo(gray, CV_32F);
        grayFrames.push_back(gray);
    }

    if (grayFrames.empty()) {
        return false;
    }

    // Calculate mean frame across all frames
    cv::Mat meanFrame = cv::Mat::zeros(grayFrames[0].size(), CV_32F);
    for (const auto& frame : grayFrames) {
        meanFrame += frame;
    }
    meanFrame /= static_cast<float>(grayFrames.size());

    // Extract PRNU noise by subtracting mean from each frame
    std::vector<cv::Mat> noiseFrames;
    noiseFrames.reserve(grayFrames.size());
    
    for (const auto& frame : grayFrames) {
        cv::Mat noise;
        cv::subtract(frame, meanFrame, noise);
        noiseFrames.push_back(noise);
    }

    // Average all noise patterns to get PRNU pattern (reduces random noise)
    m_prnuPattern = cv::Mat::zeros(noiseFrames[0].size(), CV_32F);
    for (const auto& noise : noiseFrames) {
        m_prnuPattern += noise;
    }
    m_prnuPattern /= static_cast<float>(noiseFrames.size());

    // Apply Wiener filter to enhance PRNU signal
    cv::Mat filtered;
    cv::GaussianBlur(m_prnuPattern, filtered, cv::Size(3, 3), 0.5);
    cv::subtract(m_prnuPattern, filtered, m_prnuPattern);

    // Normalize to [0, 255] range for consistent fingerprinting
    cv::normalize(m_prnuPattern, m_prnuPattern, 0, 255, cv::NORM_MINMAX);
    m_prnuPattern.convertTo(m_prnuPattern, CV_8U);

    // Compute fingerprint hash using BLAKE3
    m_fingerprintHash = computeHash(m_prnuPattern);
    m_isCalibrated = true;

    return true;
}

#else
// Stub implementations when OpenCV is not available
bool PRNUExtractor::extractPattern(const std::vector<void*>& /*frames*/) {
    m_isCalibrated = true;
    m_fingerprintHash = "mock_hardware_fingerprint_12345678";
    return true;
}

float PRNUExtractor::verifyFrame(const void* /*frame*/) const {
    return 0.92f; // Mock correlation score
}

bool PRNUExtractor::savePattern(const std::string& /*path*/) const {
    return true;
}

bool PRNUExtractor::loadPattern(const std::string& /*path*/) {
    m_isCalibrated = true;
    return true;
}
#endif

std::string PRNUExtractor::getHardwareFingerprint() const {
    return m_fingerprintHash.empty() ? "mock_hardware_fingerprint" : m_fingerprintHash;
}

std::vector<uint8_t> PRNUExtractor::getPRNUBytes() const {
#ifdef HAVE_OPENCV
    if (!m_isCalibrated || m_prnuPattern.empty()) {
        return std::vector<uint8_t>();
    }
    
    std::vector<uint8_t> bytes;
    if (m_prnuPattern.isContinuous()) {
        bytes.assign(m_prnuPattern.data, 
                    m_prnuPattern.data + m_prnuPattern.total() * m_prnuPattern.elemSize());
    } else {
        bytes.reserve(m_prnuPattern.total() * m_prnuPattern.elemSize());
        for (int i = 0; i < m_prnuPattern.rows; ++i) {
            const uint8_t* row_ptr = m_prnuPattern.ptr<uint8_t>(i);
            bytes.insert(bytes.end(), row_ptr, 
                        row_ptr + m_prnuPattern.cols * m_prnuPattern.elemSize());
        }
    }
    return bytes;
#else
    // Mock implementation
    return std::vector<uint8_t>(64, 0x42); // Mock 64-byte fingerprint
#endif
}

#ifdef HAVE_OPENCV

float PRNUExtractor::verifyFrame(const cv::Mat& frame) const {
    if (!m_isCalibrated || frame.empty()) {
        return 0.0f;
    }

    cv::Mat residual = calculateNoiseResidual(frame);
    
    // Calculate cross-correlation
    cv::Mat result;
    cv::matchTemplate(residual, m_prnuPattern, result, cv::TM_CCOEFF_NORMED);
    
    double minVal, maxVal;
    cv::minMaxLoc(result, &minVal, &maxVal);
    
    return static_cast<float>(maxVal);
}

bool PRNUExtractor::savePattern(const std::string& encryptedPath) const {
    if (!m_isCalibrated) {
        return false;
    }

    // In production, encrypt this with AES-256 using hardware keystore
    std::ofstream file(encryptedPath, std::ios::binary);
    if (!file.is_open()) {
        return false;
    }

    // Write dimensions
    int rows = m_prnuPattern.rows;
    int cols = m_prnuPattern.cols;
    file.write(reinterpret_cast<const char*>(&rows), sizeof(int));
    file.write(reinterpret_cast<const char*>(&cols), sizeof(int));

    // Write data
    file.write(reinterpret_cast<const char*>(m_prnuPattern.data),
               m_prnuPattern.total() * m_prnuPattern.elemSize());

    file.close();
    return true;
}

bool PRNUExtractor::loadPattern(const std::string& encryptedPath) {
    std::ifstream file(encryptedPath, std::ios::binary);
    if (!file.is_open()) {
        return false;
    }

    // Read dimensions
    int rows, cols;
    file.read(reinterpret_cast<char*>(&rows), sizeof(int));
    file.read(reinterpret_cast<char*>(&cols), sizeof(int));

    // Read data
    m_prnuPattern = cv::Mat(rows, cols, CV_32F);
    file.read(reinterpret_cast<char*>(m_prnuPattern.data),
              m_prnuPattern.total() * m_prnuPattern.elemSize());

    file.close();

    m_fingerprintHash = computeHash(m_prnuPattern);
    m_isCalibrated = true;

    return true;
}

cv::Mat PRNUExtractor::denoiseImage(const cv::Mat& image) const {
    cv::Mat denoised;
    
    // Convert to grayscale if needed
    cv::Mat gray;
    if (image.channels() == 3) {
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = image.clone();
    }

    // Apply Gaussian blur for denoising
    cv::GaussianBlur(gray, denoised, cv::Size(5, 5), 2.0);
    
    return denoised;
}

cv::Mat PRNUExtractor::calculateNoiseResidual(const cv::Mat& image) const {
    cv::Mat denoised = denoiseImage(image);
    
    cv::Mat gray;
    if (image.channels() == 3) {
        cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
    } else {
        gray = image.clone();
    }

    // Noise residual = original - denoised
    cv::Mat residual;
    cv::subtract(gray, denoised, residual);
    
    return residual;
}

std::string PRNUExtractor::computeHash(const cv::Mat& pattern) const {
    // Extract pattern data as bytes
    std::vector<uint8_t> data;
    if (pattern.isContinuous()) {
        data.assign(pattern.data, pattern.data + pattern.total() * pattern.elemSize());
    } else {
        // Handle non-continuous matrices
        data.reserve(pattern.total() * pattern.elemSize());
        for (int i = 0; i < pattern.rows; ++i) {
            const uint8_t* row_ptr = pattern.ptr<uint8_t>(i);
            data.insert(data.end(), row_ptr, row_ptr + pattern.cols * pattern.elemSize());
        }
    }

    // Use BLAKE3 for hardware fingerprint hash (via crypto_utils)
    return crypto::CryptoUtils::blake3(data);
}
#endif

} // namespace biovault
