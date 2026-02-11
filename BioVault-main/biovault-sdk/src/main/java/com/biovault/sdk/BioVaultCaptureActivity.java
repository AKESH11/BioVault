package com.biovault.sdk;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

/**
 * Full-screen camera activity for capturing biometric signatures.
 * Internal SDK activity - not for direct use by integrators.
 */
public class BioVaultCaptureActivity extends AppCompatActivity {
    
    private static final int PERMISSION_REQUEST_CAMERA = 200;
    
    private BioVaultConfig config;
    private BiometricCallback callback;
    private BioVaultCameraProcessor cameraProcessor;
    private Handler handler;
    private int captureProgress = 0;
    private long captureStartTime = 0;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Get configuration
        config = BioVaultSDK.getCurrentConfig();
        callback = BioVaultSDK.getCurrentCallback();
        
        if (config == null || callback == null) {
            finishWithError(BioVaultSDK.ERROR_PROCESSING_FAILED, "SDK not properly initialized");
            return;
        }
        
        handler = new Handler(Looper.getMainLooper());
        
        // Check camera permission
        if (!checkCameraPermission()) {
            requestCameraPermission();
        } else {
            startCapture();
        }
    }
    
    private boolean checkCameraPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
               == PackageManager.PERMISSION_GRANTED;
    }
    
    private void requestCameraPermission() {
        ActivityCompat.requestPermissions(this,
            new String[]{Manifest.permission.CAMERA},
            PERMISSION_REQUEST_CAMERA);
    }
    
    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                          @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        
        if (requestCode == PERMISSION_REQUEST_CAMERA) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                startCapture();
            } else {
                finishWithError(BioVaultSDK.ERROR_CAMERA_PERMISSION_DENIED,
                              "Camera permission is required for biometric capture");
            }
        }
    }
    
    private void startCapture() {
        captureStartTime = System.currentTimeMillis();
        
        // Initialize camera processor
        cameraProcessor = new BioVaultCameraProcessor(this, config, new BioVaultCameraProcessor.Callback() {
            @Override
            public void onFrameProcessed(int bpm, double confidence, int facesDetected) {
                // Update progress
                long elapsed = System.currentTimeMillis() - captureStartTime;
                captureProgress = (int) ((elapsed / 1000.0) / config.getCaptureDurationSeconds() * 100);
                captureProgress = Math.min(captureProgress, 100);
                
                callback.onProgress(captureProgress, bpm, confidence);
                callback.onFaceDetected(facesDetected);
                
                // Check if capture is complete
                if (captureProgress >= 100 && confidence >= config.getMinConfidenceThreshold()) {
                    finishWithSuccess(bpm, confidence, facesDetected);
                } else if (captureProgress >= 100) {
                    finishWithError(BioVaultSDK.ERROR_LOW_CONFIDENCE,
                                  String.format("Confidence %.2f below threshold %.2f",
                                              confidence, config.getMinConfidenceThreshold()));
                }
            }
            
            @Override
            public void onError(String message) {
                finishWithError(BioVaultSDK.ERROR_PROCESSING_FAILED, message);
            }
        });
        
        cameraProcessor.start();
    }
    
    private void finishWithSuccess(int bpm, double confidence, int facesDetected) {
        // Create biometric signature
        BioSignature signature = new BioSignature(
            bpm,
            confidence,
            facesDetected,
            System.currentTimeMillis(),
            new byte[0],  // TODO: Add PRNU data
            ""            // TODO: Add hash
        );
        
        handler.post(() -> {
            callback.onCaptureComplete(signature);
            BioVaultSDK.clearCurrent();
            finish();
        });
    }
    
    private void finishWithError(int errorCode, String message) {
        handler.post(() -> {
            callback.onError(errorCode, message);
            BioVaultSDK.clearCurrent();
            finish();
        });
    }
    
    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (cameraProcessor != null) {
            cameraProcessor.stop();
        }
    }
    
    @Override
    public void onBackPressed() {
        super.onBackPressed();
        if (callback != null) {
            callback.onCancelled();
        }
        BioVaultSDK.clearCurrent();
    }
}
