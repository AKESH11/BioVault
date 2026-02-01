#include "prnu_extractor.h"
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

    std::vector<cv::Mat> noiseResiduals;
    noiseResiduals.reserve(frames.size());

    // Extract noise residual from each frame
    for (const auto& frame : frames) {
        if (frame.empty()) continue;
        
        cv::Mat residual = calculateNoiseResidual(frame);
        noiseResiduals.push_back(residual);
    }

    if (noiseResiduals.empty()) {
        return false;
    }

    // Average all noise residuals to get PRNU pattern
    m_prnuPattern = cv::Mat::zeros(noiseResiduals[0].size(), CV_32F);
    
    for (const auto& residual : noiseResiduals) {
        cv::Mat temp;
        residual.convertTo(temp, CV_32F);
        m_prnuPattern += temp;
    }
    
    m_prnuPattern /= static_cast<float>(noiseResiduals.size());

    // Normalize
    cv::normalize(m_prnuPattern, m_prnuPattern, 0, 1, cv::NORM_MINMAX);

    // Compute fingerprint hash
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
    // Simple hash for demonstration - in production use SHA-256
    std::vector<unsigned char> data;
    if (pattern.isContinuous()) {
        data.assign(pattern.data, pattern.data + pattern.total() * pattern.elemSize());
    }

    // Create hex string from first 32 bytes
    std::stringstream ss;
    size_t hashSize = std::min(size_t(32), data.size());
    
    for (size_t i = 0; i < hashSize; ++i) {
        ss << std::hex << std::setw(2) << std::setfill('0') 
           << static_cast<int>(data[i]);
    }

    return ss.str();
}
#endif

} // namespace biovault
