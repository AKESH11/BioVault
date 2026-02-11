#include <jni.h>
#include <android/log.h>
#include <string>
#include <sstream>
#include "BioVaultExtractor.h"

#define LOG_TAG "BioVaultSDK"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_biovault_sdk_BioVaultCameraProcessor_nativeInit(
    JNIEnv* env, jobject thiz, jint width, jint height, jint fps) {
    
    LOGI("Initializing BioVault processor: %dx%d @ %d fps", width, height, fps);
    
    try {
        // Create new BioVaultExtractor instance
        auto* extractor = new BioVaultExtractor(15.0, fps);  // 15s window
        return reinterpret_cast<jlong>(extractor);
    } catch (const std::exception& e) {
        LOGE("Failed to initialize: %s", e.what());
        return 0;
    }
}

JNIEXPORT void JNICALL
Java_com_biovault_sdk_BioVaultCameraProcessor_nativeRelease(
    JNIEnv* env, jobject thiz, jlong handle) {
    
    if (handle == 0) return;
    
    auto* extractor = reinterpret_cast<BioVaultExtractor*>(handle);
    delete extractor;
    
    LOGI("Released BioVault processor");
}

JNIEXPORT jstring JNICALL
Java_com_biovault_sdk_BioVaultCameraProcessor_nativeProcessFrame(
    JNIEnv* env, jobject thiz, jlong handle, jbyteArray yuvData, jint width, jint height) {
    
    if (handle == 0) {
        return env->NewStringUTF("{\"error\":\"Invalid handle\"}");
    }
    
    auto* extractor = reinterpret_cast<BioVaultExtractor*>(handle);
    
    // Get YUV data
    jbyte* yuvBytes = env->GetByteArrayElements(yuvData, nullptr);
    jsize dataLen = env->GetArrayLength(yuvData);
    
    // Convert YUV420 to BGR for OpenCV
    cv::Mat yuvMat(height + height / 2, width, CV_8UC1, yuvBytes);
    cv::Mat bgrMat;
    cv::cvtColor(yuvMat, bgrMat, cv::COLOR_YUV2BGR_NV21);
    
    // Process frame
    BioVaultExtractor::Result result = extractor->processFrame(bgrMat);
    
    // Release YUV data
    env->ReleaseByteArrayElements(yuvData, yuvBytes, JNI_ABORT);
    
    // Build JSON result
    std::ostringstream json;
    json << "{";
    json << "\"facesDetected\":" << result.facesDetected << ",";
    
    if (result.bpm.has_value()) {
        json << "\"bioSignatures\":{";
        json << "\"rppg\":{";
        json << "\"bpm\":" << result.bpm.value() << ",";
        json << "\"confidence\":" << result.confidence;
        json << "}";
        json << "}";
    }
    
    if (result.facesDetected > 0 && !result.faceBox.empty()) {
        json << ",\"faceBox\":{";
        json << "\"x\":" << result.faceBox.x << ",";
        json << "\"y\":" << result.faceBox.y << ",";
        json << "\"width\":" << result.faceBox.width << ",";
        json << "\"height\":" << result.faceBox.height;
        json << "}";
    }
    
    json << "}";
    
    return env->NewStringUTF(json.str().c_str());
}

} // extern "C"
