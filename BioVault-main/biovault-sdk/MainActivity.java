// Integration Example: Using BioVault SDK in Your Android App
// ================================================================

// 1. Add SDK dependency to your app/build.gradle:
/*
dependencies {
    implementation project(':biovault-sdk')
    // OR if published to Maven:
    // implementation 'com.biovault:sdk:1.0.0'
}
*/

// 2. Add SDK module to settings.gradle:
/*
include ':biovault-sdk'
project(':biovault-sdk').projectDir = new File('../biovault-sdk')
*/

// 3. Example Integration in Your Activity:

package com.example.myapp;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;
import com.biovault.sdk.*;

public class MainActivity extends Activity {
    
    private TextView resultText;
    private Button captureButton;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        resultText = findViewById(R.id.resultText);
        captureButton = findViewById(R.id.captureButton);
        
        captureButton.setOnClickListener(v -> startBiometricCapture());
    }
    
    private void startBiometricCapture() {
        // Configure SDK
        BioVaultConfig config = new BioVaultConfig.Builder()
            .captureDuration(30)           // 30 seconds
            .minConfidence(0.8)            // 80% minimum confidence
            .requireFace(true)             // Require face detection
            .enablePRNU(true)              // Enable camera fingerprinting
            .cameraResolution(640, 480)    // VGA resolution
            .processingFPS(10)             // 10 FPS processing
            .showUI(true)                  // Show UI overlay
            .showFaceRect(true)            // Show face rectangle
            .build();
        
        // Start capture with callback
        BioVaultSDK.startCapture(this, config, new BiometricCallback() {
            
            @Override
            public void onCaptureComplete(BioSignature signature) {
                // SUCCESS! Got biometric signature
                int bpm = signature.getBPM();
                double confidence = signature.getConfidence();
                String hash = signature.getHash();
                
                runOnUiThread(() -> {
                    resultText.setText(String.format(
                        "✓ Capture Complete\n" +
                        "Heart Rate: %d BPM\n" +
                        "Confidence: %.1f%%\n" +
                        "In Normal Range: %s\n" +
                        "Hash: %s",
                        bpm,
                        confidence * 100,
                        signature.isNormalHeartRate() ? "Yes" : "No",
                        hash.substring(0, Math.min(16, hash.length())) + "..."
                    ));
                    
                    Toast.makeText(MainActivity.this, 
                                 "Biometric capture successful!", 
                                 Toast.LENGTH_SHORT).show();
                    
                    // Now you can:
                    // - Store signature in database
                    // - Anchor hash to blockchain
                    // - Send to backend for verification
                    // - Compare with previous signatures
                });
            }
            
            @Override
            public void onProgress(int progress, int currentBPM, double confidence) {
                // Update UI with progress
                runOnUiThread(() -> {
                    resultText.setText(String.format(
                        "Capturing... %d%%\n" +
                        "Current BPM: %d\n" +
                        "Confidence: %.1f%%",
                        progress,
                        currentBPM,
                        confidence * 100
                    ));
                });
            }
            
            @Override
            public void onFaceDetected(int facesDetected) {
                // Update UI based on face detection
                runOnUiThread(() -> {
                    if (facesDetected == 0) {
                        Toast.makeText(MainActivity.this, 
                                     "⚠ No face detected - please position yourself", 
                                     Toast.LENGTH_SHORT).show();
                    }
                });
            }
            
            @Override
            public void onError(int errorCode, String message) {
                // Handle errors
                runOnUiThread(() -> {
                    String errorMsg;
                    switch (errorCode) {
                        case BioVaultSDK.ERROR_CAMERA_PERMISSION_DENIED:
                            errorMsg = "Camera permission denied";
                            break;
                        case BioVaultSDK.ERROR_NO_FACE_DETECTED:
                            errorMsg = "No face detected during capture";
                            break;
                        case BioVaultSDK.ERROR_LOW_CONFIDENCE:
                            errorMsg = "Confidence too low - try better lighting";
                            break;
                        default:
                            errorMsg = message;
                    }
                    
                    resultText.setText("✗ Error: " + errorMsg);
                    Toast.makeText(MainActivity.this, errorMsg, Toast.LENGTH_LONG).show();
                });
            }
            
            @Override
            public void onCancelled() {
                // User cancelled
                runOnUiThread(() -> {
                    resultText.setText("Capture cancelled");
                    Toast.makeText(MainActivity.this, 
                                 "Capture cancelled", 
                                 Toast.LENGTH_SHORT).show();
                });
            }
        });
    }
}

// 4. Example XML Layout (res/layout/activity_main.xml):
/*
<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:padding="16dp"
    android:gravity="center">
    
    <TextView
        android:id="@+id/resultText"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="Press button to start biometric capture"
        android:textSize="16sp"
        android:gravity="center"
        android:padding="16dp" />
    
    <Button
        android:id="@+id/captureButton"
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="Start Biometric Capture"
        android:textSize="18sp"
        android:padding="16dp" />
    
</LinearLayout>
*/

// 5. Alternative: Quick Start with Default Config
/*
BioVaultSDK.startCapture(this, new BiometricCallback() {
    @Override
    public void onCaptureComplete(BioSignature signature) {
        // Got signature with default settings
        Log.i("BioVault", "BPM: " + signature.getBPM());
    }
    
    @Override
    public void onProgress(int progress, int currentBPM, double confidence) {}
    @Override
    public void onFaceDetected(int facesDetected) {}
    @Override
    public void onError(int errorCode, String message) {}
    @Override
    public void onCancelled() {}
});
*/

// 6. Checking SDK Version
/*
String version = BioVaultSDK.getVersion();  // "1.0.0"
int build = BioVaultSDK.getBuildNumber();   // 1
*/

// 7. Checking Camera Permission Before Capture
/*
if (!BioVaultSDK.hasCameraPermission(this)) {
    // Request permission first
    ActivityCompat.requestPermissions(this,
        new String[]{Manifest.permission.CAMERA}, 100);
} else {
    BioVaultSDK.startCapture(this, callback);
}
*/
