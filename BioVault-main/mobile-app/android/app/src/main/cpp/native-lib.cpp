/**
 * native-lib.cpp
 * JNI bridge between C++ Bio-Vault logic and Kotlin StrongBoxManager
 */

#include <jni.h>
#include <string>
#include <vector>
#include "BioVaultExtractor.h"
#include "crypto_utils.h"

// Global reference to Kotlin StrongBoxManager instance
static JavaVM* g_jvm = nullptr;
static jobject g_strongBoxManager = nullptr;

extern "C" {

/**
 * Initialize JNI bridge with StrongBoxManager instance
 * Called from Kotlin: initializeNativeBridge(strongBoxManager)
 */
JNIEXPORT void JNICALL
Java_com_biovault_StrongBoxManager_initializeNativeBridge(
    JNIEnv* env,
    jobject strongBoxManagerInstance) {
    
    // Store JavaVM pointer for later JNI calls from C++
    if (g_jvm == nullptr) {
        env->GetJavaVM(&g_jvm);
    }
    
    // Store global reference to StrongBoxManager
    if (g_strongBoxManager != nullptr) {
        env->DeleteGlobalRef(g_strongBoxManager);
    }
    g_strongBoxManager = env->NewGlobalRef(strongBoxManagerInstance);
}

/**
 * Get hardware-backed signature from StrongBox
 * Called from C++ code when bio-hash is ready
 */
std::vector<uint8_t> getHardwareSignature(const std::vector<uint8_t>& hash) {
    if (g_jvm == nullptr || g_strongBoxManager == nullptr) {
        // JNI not initialized
        return std::vector<uint8_t>();
    }
    
    JNIEnv* env = nullptr;
    bool needDetach = false;
    
    // Attach current thread to JVM if needed
    int status = g_jvm->GetEnv((void**)&env, JNI_VERSION_1_6);
    if (status == JNI_EDETACHED) {
        if (g_jvm->AttachCurrentThread(&env, nullptr) != 0) {
            return std::vector<uint8_t>();
        }
        needDetach = true;
    }
    
    // Convert C++ vector to Java byte array
    jbyteArray jHash = env->NewByteArray(hash.size());
    env->SetByteArrayRegion(jHash, 0, hash.size(), 
                           reinterpret_cast<const jbyte*>(hash.data()));
    
    // Get StrongBoxManager class and method
    jclass clazz = env->GetObjectClass(g_strongBoxManager);
    jmethodID signMethod = env->GetMethodID(clazz, "signHash", "([B)[B");
    
    if (signMethod == nullptr) {
        env->DeleteLocalRef(jHash);
        if (needDetach) g_jvm->DetachCurrentThread();
        return std::vector<uint8_t>();
    }
    
    // Call Kotlin: StrongBoxManager.signHash(hash)
    jbyteArray jSignature = (jbyteArray)env->CallObjectMethod(
        g_strongBoxManager, signMethod, jHash);
    
    // Check for exceptions (e.g., key not found, biometric not authenticated)
    if (env->ExceptionCheck()) {
        env->ExceptionDescribe();
        env->ExceptionClear();
        env->DeleteLocalRef(jHash);
        if (needDetach) g_jvm->DetachCurrentThread();
        return std::vector<uint8_t>();
    }
    
    // Convert Java byte array back to C++ vector
    std::vector<uint8_t> signature;
    if (jSignature != nullptr) {
        jsize length = env->GetArrayLength(jSignature);
        signature.resize(length);
        env->GetByteArrayRegion(jSignature, 0, length, 
                               reinterpret_cast<jbyte*>(signature.data()));
        env->DeleteLocalRef(jSignature);
    }
    
    env->DeleteLocalRef(jHash);
    env->DeleteLocalRef(clazz);
    
    if (needDetach) {
        g_jvm->DetachCurrentThread();
    }
    
    return signature;
}

/**
 * Generate Bio-Vault hash and sign with StrongBox
 * Called from React Native: generateBioVaultProof(frameData, bpm, hardwareID)
 */
JNIEXPORT jbyteArray JNICALL
Java_com_biovault_BioVaultModule_generateBioVaultProof(
    JNIEnv* env,
    jobject /* this */,
    jbyteArray frameData,
    jint bpm,
    jstring hardwareID) {
    
    // Convert Java inputs to C++ types
    jsize frameDataLength = env->GetArrayLength(frameData);
    std::vector<uint8_t> frameBytes(frameDataLength);
    env->GetByteArrayRegion(frameData, 0, frameDataLength, 
                           reinterpret_cast<jbyte*>(frameBytes.data()));
    
    const char* hwIDChars = env->GetStringUTFChars(hardwareID, nullptr);
    std::string hwID(hwIDChars);
    env->ReleaseStringUTFChars(hardwareID, hwIDChars);
    
    // Generate Bio-Vault hash (video + pulse + hardware)
    uint64_t timestamp = biovault::crypto::CryptoUtils::getCurrentTimestamp();
    std::string bioHashStr = biovault::crypto::CryptoUtils::generateBioVaultHash(
        frameBytes, bpm, hwID, timestamp);
    
    // Convert hex string to bytes (32 bytes for BLAKE3)
    std::vector<uint8_t> bioHash = biovault::crypto::CryptoUtils::fromHex(bioHashStr);
    
    // Get hardware signature from StrongBox via JNI callback
    std::vector<uint8_t> signature = getHardwareSignature(bioHash);
    
    if (signature.empty()) {
        // Biometric auth failed or StrongBox not available
        return nullptr;
    }
    
    // Combine bio-hash + signature for blockchain anchoring
    std::vector<uint8_t> proof;
    proof.insert(proof.end(), bioHash.begin(), bioHash.end());
    proof.insert(proof.end(), signature.begin(), signature.end());
    
    // Convert back to Java byte array
    jbyteArray result = env->NewByteArray(proof.size());
    env->SetByteArrayRegion(result, 0, proof.size(), 
                           reinterpret_cast<const jbyte*>(proof.data()));
    
    return result;
}

/**
 * Test hardware signature functionality
 * Called from React Native: testStrongBoxSignature()
 */
JNIEXPORT jboolean JNICALL
Java_com_biovault_BioVaultModule_testStrongBoxSignature(
    JNIEnv* env,
    jobject /* this */) {
    
    // Create test hash (32 bytes)
    std::vector<uint8_t> testHash(32, 0x42);
    
    // Try to get signature
    std::vector<uint8_t> signature = getHardwareSignature(testHash);
    
    return signature.empty() ? JNI_FALSE : JNI_TRUE;
}

/**
 * Cleanup JNI bridge
 */
JNIEXPORT void JNICALL
Java_com_biovault_StrongBoxManager_cleanupNativeBridge(
    JNIEnv* env,
    jobject /* this */) {
    
    if (g_strongBoxManager != nullptr) {
        env->DeleteGlobalRef(g_strongBoxManager);
        g_strongBoxManager = nullptr;
    }
}

} // extern "C"
