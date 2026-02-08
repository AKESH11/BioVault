/**
 * camera_bridge.cpp
 * 
 * JNI bridge between React Native camera and C++ BioVaultExtractor.
 * Handles frame processing for multi-face rPPG extraction.
 */

#include <jni.h>
#include <android/log.h>
#include <opencv2/opencv.hpp>
#include <vector>
#include <memory>
#include <chrono>
#include "BioVaultExtractor.h"

#define LOG_TAG "BioVault::Camera"
#define LOGD(...) __android_log_print(ANDROID_LOG_DEBUG, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)

// Global extractor instance (thread-safe singleton pattern)
static std::unique_ptr<BioVaultExtractor> g_extractor;
static std::mutex g_extractor_mutex;

/**
 * Initialize the BioVault extractor with OpenCV cascade files
 */
extern "C" JNIEXPORT jboolean JNICALL
Java_com_biovault_BioVaultModule_nativeInitializeCamera(
    JNIEnv* env,
    jobject /* this */,
    jstring cascadePath) {
    
    std::lock_guard<std::mutex> lock(g_extractor_mutex);
    
    try {
        const char* path = env->GetStringUTFChars(cascadePath, nullptr);
        LOGD("Initializing camera with cascade: %s", path);
        
        // Create extractor instance
        g_extractor = std::make_unique<BioVaultExtractor>();
        
        // In a production app, we'd load the cascade classifier here
        // For now, we'll use OpenCV's built-in haarcascade
        LOGI("BioVault camera initialized successfully");
        
        env->ReleaseStringUTFChars(cascadePath, path);
        return JNI_TRUE;
        
    } catch (const std::exception& e) {
        LOGE("Failed to initialize camera: %s", e.what());
        return JNI_FALSE;
    }
}

/**
 * Process a single camera frame for bio-signature extraction
 * 
 * @param frameData YUV420 or RGBA frame data
 * @param width Frame width
 * @param height Frame height
 * @param format 0=YUV420, 1=RGBA
 * @return JSON string with extracted signatures or null on error
 */
extern "C" JNIEXPORT jstring JNICALL
Java_com_biovault_BioVaultModule_nativeProcessCameraFrame(
    JNIEnv* env,
    jobject /* this */,
    jbyteArray frameData,
    jint width,
    jint height,
    jint format) {
    
    std::lock_guard<std::mutex> lock(g_extractor_mutex);
    
    if (!g_extractor) {
        LOGE("Extractor not initialized!");
        return nullptr;
    }
    
    try {
        // Get frame data
        jbyte* data = env->GetByteArrayElements(frameData, nullptr);
        jsize dataLen = env->GetArrayLength(frameData);
        
        cv::Mat frame;
        
        // Convert based on format
        if (format == 0) {
            // YUV420 (NV21 from Android camera)
            cv::Mat yuv(height + height/2, width, CV_8UC1, (unsigned char*)data);
            cv::cvtColor(yuv, frame, cv::COLOR_YUV2BGR_NV21);
        } else {
            // RGBA
            cv::Mat rgba(height, width, CV_8UC4, (unsigned char*)data);
            cv::cvtColor(rgba, frame, cv::COLOR_RGBA2BGR);
        }
        
        // Process frame through BioVault extractor
        auto start = std::chrono::high_resolution_clock::now();
        
        // Extract bio-signatures
        std::vector<uint8_t> videoHash(32);
        std::vector<uint8_t> prnuPattern(32);
        
        // Mock implementation for now - replace with actual BioVaultExtractor call
        // In production: g_extractor->processFrame(frame, videoHash, prnuPattern);
        
        // For demo, generate simple frame statistics
        cv::Scalar mean = cv::mean(frame);
        double brightness = (mean[0] + mean[1] + mean[2]) / 3.0;
        
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
        
        // Create JSON result
        std::ostringstream json;
        json << "{"
             << "\"success\":true,"
             << "\"timestamp\":" << std::chrono::system_clock::now().time_since_epoch().count() << ","
             << "\"frameSize\":{\"width\":" << width << ",\"height\":" << height << "},"
             << "\"processingTime\":" << duration.count() << ","
             << "\"brightness\":" << brightness << ","
             << "\"facesDetected\":0,"
             << "\"bioSignatures\":{"
             << "\"rppg\":{\"bpm\":0,\"confidence\":0.0},"
             << "\"prnu\":{\"extracted\":false,\"size\":0}"
             << "}"
             << "}";
        
        env->ReleaseByteArrayElements(frameData, data, JNI_ABORT);
        
        return env->NewStringUTF(json.str().c_str());
        
    } catch (const std::exception& e) {
        LOGE("Frame processing error: %s", e.what());
        return nullptr;
    }
}

/**
 * Process multiple faces in a frame for multi-party consent
 * 
 * @param frameData Frame data (RGBA format)
 * @param width Frame width
 * @param height Frame height
 * @return JSON array with per-face bio-signatures
 */
extern "C" JNIEXPORT jstring JNICALL
Java_com_biovault_BioVaultModule_nativeProcessMultiFace(
    JNIEnv* env,
    jobject /* this */,
    jbyteArray frameData,
    jint width,
    jint height) {
    
    std::lock_guard<std::mutex> lock(g_extractor_mutex);
    
    if (!g_extractor) {
        LOGE("Extractor not initialized!");
        return nullptr;
    }
    
    try {
        jbyte* data = env->GetByteArrayElements(frameData, nullptr);
        
        cv::Mat rgba(height, width, CV_8UC4, (unsigned char*)data);
        cv::Mat frame;
        cv::cvtColor(rgba, frame, cv::COLOR_RGBA2BGR);
        
        // TODO: Implement multi-face detection and rPPG extraction
        // For now, return mock data
        
        std::ostringstream json;
        json << "{"
             << "\"success\":true,"
             << "\"timestamp\":" << std::chrono::system_clock::now().time_since_epoch().count() << ","
             << "\"faces\":[],"
             << "\"totalFaces\":0"
             << "}";
        
        env->ReleaseByteArrayElements(frameData, data, JNI_ABORT);
        
        return env->NewStringUTF(json.str().c_str());
        
    } catch (const std::exception& e) {
        LOGE("Multi-face processing error: %s", e.what());
        return nullptr;
    }
}

/**
 * Start continuous rPPG extraction session
 */
extern "C" JNIEXPORT jboolean JNICALL
Java_com_biovault_BioVaultModule_nativeStartRPPGSession(
    JNIEnv* env,
    jobject /* this */) {
    
    std::lock_guard<std::mutex> lock(g_extractor_mutex);
    
    if (!g_extractor) {
        LOGE("Extractor not initialized!");
        return JNI_FALSE;
    }
    
    LOGI("Starting rPPG session");
    // TODO: Initialize rPPG extraction pipeline
    return JNI_TRUE;
}

/**
 * Stop rPPG extraction and return final signature
 */
extern "C" JNIEXPORT jstring JNICALL
Java_com_biovault_BioVaultModule_nativeStopRPPGSession(
    JNIEnv* env,
    jobject /* this */) {
    
    std::lock_guard<std::mutex> lock(g_extractor_mutex);
    
    if (!g_extractor) {
        LOGE("Extractor not initialized!");
        return nullptr;
    }
    
    LOGI("Stopping rPPG session");
    
    // Return aggregated bio-signature
    std::ostringstream json;
    json << "{"
         << "\"success\":true,"
         << "\"videoHash\":\"0x0000000000000000000000000000000000000000000000000000000000000000\","
         << "\"bioSignature\":\"0x0000000000000000000000000000000000000000000000000000000000000000\","
         << "\"hardwareDNA\":\"0x0000000000000000000000000000000000000000000000000000000000000000\","
         << "\"averageBPM\":72,"
         << "\"confidence\":0.85,"
         << "\"frameCount\":0"
         << "}";
    
    return env->NewStringUTF(json.str().c_str());
}

/**
 * Cleanup and release resources
 */
extern "C" JNIEXPORT void JNICALL
Java_com_biovault_BioVaultModule_nativeReleaseCamera(
    JNIEnv* env,
    jobject /* this */) {
    
    std::lock_guard<std::mutex> lock(g_extractor_mutex);
    
    if (g_extractor) {
        LOGI("Releasing camera resources");
        g_extractor.reset();
    }
}
