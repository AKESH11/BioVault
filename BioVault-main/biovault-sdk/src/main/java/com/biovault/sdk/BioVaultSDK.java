package com.biovault.sdk;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import androidx.annotation.NonNull;

/**
 * BioVault SDK - Biometric Authentication using rPPG and Camera Fingerprinting
 * 
 * Main entry point for capturing biometric signatures from live camera feed.
 * Uses remote photoplethysmography (rPPG) to extract heart rate and PRNU 
 * camera fingerprinting for device authentication.
 * 
 * Usage:
 * <pre>
 * BioVaultConfig config = new BioVaultConfig.Builder()
 *     .captureDuration(30)
 *     .minConfidence(0.8)
 *     .requireFace(true)
 *     .build();
 * 
 * BioVaultSDK.startCapture(activity, config, new BiometricCallback() {
 *     @Override
 *     public void onCaptureComplete(BioSignature signature) {
 *         int bpm = signature.getBPM();
 *         double confidence = signature.getConfidence();
 *         // Use the biometric signature...
 *     }
 *     
 *     @Override
 *     public void onProgress(int progress, int currentBPM, double confidence) {
 *         // Update UI with progress
 *     }
 *     
 *     @Override
 *     public void onFaceDetected(int facesDetected) {
 *         // Update UI based on face detection
 *     }
 *     
 *     @Override
 *     public void onError(int error, String message) {
 *         // Handle error
 *     }
 *     
 *     @Override
 *     public void onCancelled() {
 *         // Handle cancellation
 *     }
 * });
 * </pre>
 * 
 * @version 1.0.0
 */
public class BioVaultSDK {
    
    // Error codes
    public static final int ERROR_CAMERA_PERMISSION_DENIED = 1001;
    public static final int ERROR_CAMERA_UNAVAILABLE = 1002;
    public static final int ERROR_NO_FACE_DETECTED = 1003;
    public static final int ERROR_LOW_CONFIDENCE = 1004;
    public static final int ERROR_PROCESSING_FAILED = 1005;
    public static final int ERROR_TIMEOUT = 1006;
    
    // Request code for camera activity
    public static final int REQUEST_CODE_CAPTURE = 9001;
    
    private static BiometricCallback currentCallback = null;
    private static BioVaultConfig currentConfig = null;
    
    /**
     * Start biometric capture with custom configuration.
     * Opens a full-screen camera activity that captures biometric data.
     * 
     * @param activity The calling activity (needed for camera permissions and result)
     * @param config Configuration options for capture
     * @param callback Callback to receive results
     */
    public static void startCapture(@NonNull Activity activity,
                                   @NonNull BioVaultConfig config,
                                   @NonNull BiometricCallback callback) {
        currentCallback = callback;
        currentConfig = config;
        
        Intent intent = new Intent(activity, BioVaultCaptureActivity.class);
        intent.putExtra("CONFIG", config);
        activity.startActivityForResult(intent, REQUEST_CODE_CAPTURE);
    }
    
    /**
     * Start biometric capture with default configuration.
     * Uses 30-second capture duration, 70% minimum confidence, face detection required.
     * 
     * @param activity The calling activity
     * @param callback Callback to receive results
     */
    public static void startCapture(@NonNull Activity activity,
                                   @NonNull BiometricCallback callback) {
        BioVaultConfig defaultConfig = new BioVaultConfig.Builder()
            .captureDuration(30)
            .minConfidence(0.7)
            .requireFace(true)
            .enablePRNU(true)
            .build();
        startCapture(activity, defaultConfig, callback);
    }
    
    /**
     * Get the current active callback.
     * Internal use only - called by BioVaultCaptureActivity.
     */
    static BiometricCallback getCurrentCallback() {
        return currentCallback;
    }
    
    /**
     * Get the current configuration.
     * Internal use only - called by BioVaultCaptureActivity.
     */
    static BioVaultConfig getCurrentConfig() {
        return currentConfig;
    }
    
    /**
     * Clear the current callback and config.
     * Internal use only - called after capture completes.
     */
    static void clearCurrent() {
        currentCallback = null;
        currentConfig = null;
    }
    
    /**
     * Check if camera permission is granted.
     * 
     * @param context Application context
     * @return true if permission granted
     */
    public static boolean hasCameraPermission(@NonNull Context context) {
        return android.os.Build.VERSION.SDK_INT >= 23 &&
               context.checkSelfPermission(android.Manifest.permission.CAMERA)
               == android.content.pm.PackageManager.PERMISSION_GRANTED;
    }
    
    /**
     * Get SDK version string.
     * 
     * @return Version string (e.g., "1.0.0")
     */
    public static String getVersion() {
        return "1.0.0";
    }
    
    /**
     * Get SDK build number.
     * 
     * @return Build number
     */
    public static int getBuildNumber() {
        return 1;
    }
}
