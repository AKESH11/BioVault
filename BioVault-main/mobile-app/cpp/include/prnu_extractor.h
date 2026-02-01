#ifndef PRNU_EXTRACTOR_H
#define PRNU_EXTRACTOR_H

#ifdef HAVE_OPENCV
#include <opencv2/opencv.hpp>
#endif
#include <string>
#include <vector>

namespace biovault {

/**
 * @brief Photo-Response Non-Uniformity (PRNU) Extractor
 * 
 * Extracts the unique noise pattern from a camera sensor,
 * creating a "DNA fingerprint" for hardware identification.
 */
class PRNUExtractor {
public:
    PRNUExtractor();
    ~PRNUExtractor();

    /**
     * @brief Extract PRNU pattern from calibration frames
     * @param frames Vector of at least 50 frames from the same camera
     * @return Success status
     */
#ifdef HAVE_OPENCV
    bool extractPattern(const std::vector<cv::Mat>& frames);
#else
    bool extractPattern(const std::vector<void*>& frames);
#endif

    /**
     * @brief Get the hardware fingerprint as a hash string
     * @return BLAKE3 hash of the PRNU pattern
     */
    std::string getHardwareFingerprint() const;

    /**
     * @brief Get raw PRNU pattern bytes for binding with image data
     * @return Vector of bytes representing the PRNU pattern
     */
    std::vector<uint8_t> getPRNUBytes() const;

    /**
     * @brief Verify if a frame came from the same camera
     * @param frame Frame to verify
     * @return Correlation score (0.0 to 1.0)
     */
#ifdef HAVE_OPENCV
    float verifyFrame(const cv::Mat& frame) const;
#else
    float verifyFrame(const void* frame) const;
#endif

    /**
     * @brief Save PRNU pattern to secure storage
     * @param encryptedPath Path to save encrypted pattern
     * @return Success status
     */
    bool savePattern(const std::string& encryptedPath) const;

    /**
     * @brief Load PRNU pattern from secure storage
     * @param encryptedPath Path to load encrypted pattern
     * @return Success status
     */
    bool loadPattern(const std::string& encryptedPath);

private:
#ifdef HAVE_OPENCV
    cv::Mat m_prnuPattern;
#endif
    std::string m_fingerprintHash;
    bool m_isCalibrated;

#ifdef HAVE_OPENCV
    // Wavelet denoising to separate PRNU from image content
    cv::Mat denoiseImage(const cv::Mat& image) const;

    // Calculate noise residual
    cv::Mat calculateNoiseResidual(const cv::Mat& image) const;

    // Compute SHA-256 hash of pattern
    std::string computeHash(const cv::Mat& pattern) const;
#endif
};

} // namespace biovault

#endif // PRNU_EXTRACTOR_H
