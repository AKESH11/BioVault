#include "bio_vault_native.h"
#include "rppg_engine.h"
#include "prnu_extractor.h"
#include "crypto_utils.h"
#ifdef HAVE_OPENCV
#include <opencv2/opencv.hpp>
#endif
#include <sstream>
#include <vector>

#ifdef ANDROID
#include <android/log.h>
#define LOG_TAG "BioVaultNative"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#else
#define LOGI(...) printf(__VA_ARGS__)
#define LOGE(...) fprintf(stderr, __VA_ARGS__)
#endif

namespace biovault {

BioVaultNative::BioVaultNative()
    : m_isInitialized(false)
{
}

BioVaultNative::~BioVaultNative() {
}

std::string BioVaultNative::initialize() {
    try {
        m_rppgEngine = std::make_unique<RPPGEngine>(30, 150);
        m_prnuExtractor = std::make_unique<PRNUExtractor>();
        m_isInitialized = true;
        
        LOGI("Bio-Vault Native Engine initialized successfully");
        
        return R"({"success": true, "message": "Bio-Vault initialized"})";
    } catch (const std::exception& e) {
        LOGE("Initialization failed: %s", e.what());
        return R"({"success": false, "error": ")" + std::string(e.what()) + R"("})";
    }
}

std::string BioVaultNative::processFrame(
    const std::string& frameData,
    int width,
    int height,
    const std::string& faceBounds)
{
    if (!m_isInitialized) {
        return R"({"error": "Not initialized"})";
    }

    try {
#ifdef HAVE_OPENCV
        // Decode base64 frame data (simplified - use proper base64 decoder)
        std::vector<uint8_t> imageData(frameData.begin(), frameData.end());
        
        // Create Mat from data
        cv::Mat frame(height, width, CV_8UC3, imageData.data());
        
        // Parse face bounds: "x,y,width,height"
        cv::Rect faceBoundingBox;
        std::stringstream ss(faceBounds);
        char comma;
        ss >> faceBoundingBox.x >> comma 
           >> faceBoundingBox.y >> comma 
           >> faceBoundingBox.width >> comma 
           >> faceBoundingBox.height;
        
        // Process frame
        bool success = m_rppgEngine->processFrame(frame, faceBoundingBox);
        
        if (!success) {
            return R"({"error": "Frame processing failed"})";
        }
        
        int bpm = m_rppgEngine->getCurrentBPM();
        float confidence = m_rppgEngine->getConfidence();
        bool liveness = m_rppgEngine->isLivenessDetected();
#else
        // Mock data without OpenCV
        (void)frameData; (void)width; (void)height; (void)faceBounds;
        m_rppgEngine->processFrame(nullptr, nullptr);
        int bpm = m_rppgEngine->getCurrentBPM();
        float confidence = m_rppgEngine->getConfidence();
        bool liveness = m_rppgEngine->isLivenessDetected();
#endif
        
        // Build JSON response
        std::stringstream result;
        result << R"({"bpm": )" << bpm 
               << R"(, "confidence": )" << confidence
               << R"(, "liveness": )" << (liveness ? "true" : "false")
               << R"(, "success": true})";
        
        return result.str();
        
    } catch (const std::exception& e) {
        LOGE("Frame processing error: %s", e.what());
        return R"({"error": ")" + std::string(e.what()) + R"("})";
    }
}

std::string BioVaultNative::calibrateHardware(const std::string& calibrationFramesJson) {
    if (!m_isInitialized) {
        return R"({"error": "Not initialized"})";
    }

    try {
#ifdef HAVE_OPENCV
        // Parse JSON array of frames (simplified parser)
        // In production, use a proper JSON library like nlohmann/json
        
        std::vector<cv::Mat> frames;
        // TODO: Parse calibrationFramesJson and decode each frame
        
        if (frames.size() < 50) {
            return R"({"error": "Need at least 50 calibration frames"})";
        }
        
        bool success = m_prnuExtractor->extractPattern(frames);
#else
        // Mock implementation without OpenCV
        (void)calibrationFramesJson;
        std::vector<void*> frames(50, nullptr);
        bool success = m_prnuExtractor->extractPattern(frames);
#endif
        
        if (!success) {
            return R"({"error": "PRNU extraction failed"})";
        }
        
        m_hardwareFingerprint = m_prnuExtractor->getHardwareFingerprint();
        
        std::stringstream result;
        result << R"({"success": true, "hardwareFingerprint": ")" 
               << m_hardwareFingerprint << R"("})";
        
        return result.str();
        
    } catch (const std::exception& e) {
        LOGE("Hardware calibration error: %s", e.what());
        return R"({"error": ")" + std::string(e.what()) + R"("})";
    }
}

std::string BioVaultNative::generateAnchorHash(
    const std::string& frameData,
    int bpm,
    const std::string& hardwareID)
{
    try {
        std::vector<uint8_t> data(frameData.begin(), frameData.end());
        uint64_t timestamp = crypto::CryptoUtils::getCurrentTimestamp();
        
        std::string hash = crypto::CryptoUtils::generateBioVaultHash(
            data, bpm, hardwareID, timestamp
        );
        
        std::stringstream result;
        result << R"({"hash": ")" << hash 
               << R"(", "timestamp": )" << timestamp
               << R"(, "bpm": )" << bpm
               << R"(})";
        
        return result.str();
        
    } catch (const std::exception& e) {
        LOGE("Hash generation error: %s", e.what());
        return R"({"error": ")" + std::string(e.what()) + R"("})";
    }
}

void BioVaultNative::reset() {
    if (m_rppgEngine) {
        m_rppgEngine->reset();
    }
    m_hardwareFingerprint.clear();
    LOGI("Bio-Vault reset");
}

} // namespace biovault

// ============================================================================
// JNI Implementation for Android
// ============================================================================
#ifdef ANDROID

static biovault::BioVaultNative* g_nativeInstance = nullptr;

extern "C" {

JNIEXPORT jstring JNICALL
Java_com_biovault_BioVaultModule_initialize(JNIEnv* env, jobject /* thiz */) {
    if (!g_nativeInstance) {
        g_nativeInstance = new biovault::BioVaultNative();
    }
    
    std::string result = g_nativeInstance->initialize();
    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_biovault_BioVaultModule_processFrame(
    JNIEnv* env, jobject /* thiz */,
    jstring frameData, jint width, jint height, jstring faceBounds)
{
    if (!g_nativeInstance) {
        return env->NewStringUTF(R"({"error": "Not initialized"})");
    }
    
    const char* frameStr = env->GetStringUTFChars(frameData, nullptr);
    const char* boundsStr = env->GetStringUTFChars(faceBounds, nullptr);
    
    std::string result = g_nativeInstance->processFrame(
        frameStr, width, height, boundsStr
    );
    
    env->ReleaseStringUTFChars(frameData, frameStr);
    env->ReleaseStringUTFChars(faceBounds, boundsStr);
    
    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_biovault_BioVaultModule_calibrateHardware(
    JNIEnv* env, jobject /* thiz */, jstring calibrationFramesJson)
{
    if (!g_nativeInstance) {
        return env->NewStringUTF(R"({"error": "Not initialized"})");
    }
    
    const char* jsonStr = env->GetStringUTFChars(calibrationFramesJson, nullptr);
    std::string result = g_nativeInstance->calibrateHardware(jsonStr);
    env->ReleaseStringUTFChars(calibrationFramesJson, jsonStr);
    
    return env->NewStringUTF(result.c_str());
}

JNIEXPORT jstring JNICALL
Java_com_biovault_BioVaultModule_generateAnchorHash(
    JNIEnv* env, jobject /* thiz */,
    jstring frameData, jint bpm, jstring hardwareID)
{
    if (!g_nativeInstance) {
        return env->NewStringUTF(R"({"error": "Not initialized"})");
    }
    
    const char* frameStr = env->GetStringUTFChars(frameData, nullptr);
    const char* hwIDStr = env->GetStringUTFChars(hardwareID, nullptr);
    
    std::string result = g_nativeInstance->generateAnchorHash(
        frameStr, bpm, hwIDStr
    );
    
    env->ReleaseStringUTFChars(frameData, frameStr);
    env->ReleaseStringUTFChars(hardwareID, hwIDStr);
    
    return env->NewStringUTF(result.c_str());
}

JNIEXPORT void JNICALL
Java_com_biovault_BioVaultModule_reset(JNIEnv* /* env */, jobject /* thiz */) {
    if (g_nativeInstance) {
        g_nativeInstance->reset();
    }
}

} // extern "C"

#endif // ANDROID
