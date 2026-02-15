#ifndef BIO_VAULT_NATIVE_H
#define BIO_VAULT_NATIVE_H

#include <string>
#include <memory>

#ifdef ANDROID
#include <jni.h>
#endif

namespace biovault {

// Forward declarations
class RPPGEngine;
class PRNUExtractor;

/**
 * @brief Main interface for React Native integration
 * 
 * This class provides a simplified API that can be called
 * from React Native via JNI (Android) or Turbo Modules (iOS).
 */
class BioVaultNative {
public:
    BioVaultNative();
    ~BioVaultNative();

    /**
     * @brief Initialize the Bio-Vault engine
     * @return Success status as JSON string
     */
    std::string initialize();

    /**
     * @brief Process camera frame for biometric extraction
     * @param frameData Base64-encoded image data
     * @param width Frame width
     * @param height Frame height
     * @param faceBounds Face bounding box as "x,y,width,height"
     * @return JSON: {"bpm": 72, "confidence": 0.95, "liveness": true}
     */
    std::string processFrame(
        const std::string& frameData,
        int width,
        int height,
        const std::string& faceBounds
    );

    /**
     * @brief Generate hardware fingerprint from calibration frames
     * @param calibrationFrames Array of base64-encoded frames (min 50)
     * @return Hardware fingerprint hash
     */
    std::string calibrateHardware(const std::string& calibrationFramesJson);

    /**
     * @brief Generate Bio-Vault hash for blockchain anchoring
     * @param frameData Base64-encoded frame
     * @param bpm Heart rate
     * @param hardwareID Hardware fingerprint
     * @return Bio-Vault hash
     */
    std::string generateAnchorHash(
        const std::string& frameData,
        int bpm,
        const std::string& hardwareID
    );

    /**
     * @brief Reset all engines
     */
    void reset();

private:
    std::unique_ptr<RPPGEngine> m_rppgEngine;
    std::unique_ptr<PRNUExtractor> m_prnuExtractor;
    std::string m_hardwareFingerprint;
    bool m_isInitialized;
};

} // namespace biovault

// ============================================================================
// JNI Bridge for Android (Export Functions)
// ============================================================================
#ifdef ANDROID
extern "C" {
    JNIEXPORT jstring JNICALL
    Java_com_biovault_BioVaultModule_initialize(JNIEnv* env, jobject thiz);

    JNIEXPORT jstring JNICALL
    Java_com_biovault_BioVaultModule_processFrame(
        JNIEnv* env, jobject thiz,
        jstring frameData, jint width, jint height, jstring faceBounds);

    JNIEXPORT jstring JNICALL
    Java_com_biovault_BioVaultModule_calibrateHardware(
        JNIEnv* env, jobject thiz, jstring calibrationFramesJson);

    JNIEXPORT jstring JNICALL
    Java_com_biovault_BioVaultModule_generateAnchorHash(
        JNIEnv* env, jobject thiz,
        jstring frameData, jint bpm, jstring hardwareID);

    JNIEXPORT void JNICALL
    Java_com_biovault_BioVaultModule_reset(JNIEnv* env, jobject thiz);

    JNIEXPORT jboolean JNICALL
    Java_com_biovault_BioVaultModule_initConsensusSession(
        JNIEnv* env, jobject thiz,
        jstring sessionId, jintArray expectedFaceIds,
        jbyteArray videoFrameHash, jstring hardwareDNA);

    JNIEXPORT jboolean JNICALL
    Java_com_biovault_BioVaultModule_appendConsensusSignature(
        JNIEnv* env, jobject thiz,
        jstring sessionId, jint faceId, jint bpm,
        jbyteArray signature, jbyteArray publicKey);

    JNIEXPORT jstring JNICALL
    Java_com_biovault_BioVaultModule_finalizeConsensus(
        JNIEnv* env, jobject thiz, jstring sessionId);
}
#endif

#endif // BIO_VAULT_NATIVE_H
