package com.biovault.sdk;

/**
 * Callback interface for receiving biometric capture results from BioVault SDK.
 */
public interface BiometricCallback {
    
    /**
     * Called when biometric capture is successfully completed.
     * @param signature The captured biometric signature containing BPM, confidence, etc.
     */
    void onCaptureComplete(BioSignature signature);
    
    /**
     * Called periodically during capture to report progress.
     * @param progress Progress percentage (0-100)
     * @param currentBPM Current BPM reading (may be unstable)
     * @param confidence Current confidence level
     */
    void onProgress(int progress, int currentBPM, double confidence);
    
    /**
     * Called when face detection status changes.
     * @param facesDetected Number of faces detected (0 or 1)
     */
    void onFaceDetected(int facesDetected);
    
    /**
     * Called when an error occurs during capture.
     * @param error Error code (see BioVaultSDK.ERROR_* constants)
     * @param message Human-readable error message
     */
    void onError(int error, String message);
    
    /**
     * Called when capture is cancelled by user or system.
     */
    void onCancelled();
}
