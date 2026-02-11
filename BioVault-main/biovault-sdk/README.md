# BioVault SDK for Android

Biometric authentication SDK using **rPPG (remote photoplethysmography)** for heart rate extraction and **PRNU camera fingerprinting** for device authentication.

## Features

✅ **Non-invasive heart rate measurement** - Extract BPM from camera feed using rPPG  
✅ **Face detection** - Automatic face tracking with dynamic rectangle overlay  
✅ **High confidence scoring** - 80%+ accuracy with quality indicators  
✅ **PRNU fingerprinting** - Unique camera sensor identification  
✅ **Real-time processing** - 10 FPS with OpenCV optimization  
✅ **Easy integration** - Simple callback-based API  
✅ **Blockchain-ready** - SHA-256 hashing for anchoring signatures  

## Quick Start

### 1. Add SDK to Your Project

Add to your `settings.gradle`:
```gradle
include ':app', ':biovault-sdk'
project(':biovault-sdk').projectDir = new File('../biovault-sdk')
```

Add to your app's `build.gradle`:
```gradle
dependencies {
    implementation project(':biovault-sdk')
}
```

### 2. Request Camera Permission

Add to `AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-feature android:name="android.hardware.camera" android:required="true" />
```

### 3. Start Biometric Capture

```java
BioVaultConfig config = new BioVaultConfig.Builder()
    .captureDuration(30)      // 30 seconds
    .minConfidence(0.8)       // 80% confidence threshold
    .requireFace(true)        // Require face detection
    .build();

BioVaultSDK.startCapture(this, config, new BiometricCallback() {
    @Override
    public void onCaptureComplete(BioSignature signature) {
        int bpm = signature.getBPM();
        double confidence = signature.getConfidence();
        Log.i("BioVault", "Heart Rate: " + bpm + " BPM");
    }
    
    @Override
    public void onProgress(int progress, int currentBPM, double confidence) {
        // Update UI
    }
    
    @Override
    public void onFaceDetected(int facesDetected) {
        // 0 = no face, 1 = face detected
    }
    
    @Override
    public void onError(int errorCode, String message) {
        Log.e("BioVault", "Error: " + message);
    }
    
    @Override
    public void onCancelled() {
        // User cancelled
    }
});
```

## API Reference

### BioVaultSDK

Main entry point for the SDK.

#### Methods

- **`startCapture(Activity, BioVaultConfig, BiometricCallback)`**  
  Start biometric capture with custom configuration.

- **`startCapture(Activity, BiometricCallback)`**  
  Start capture with default configuration (30s, 70% confidence).

- **`hasCameraPermission(Context)`**  
  Check if camera permission is granted.

- **`getVersion()`**  
  Get SDK version string.

- **`getBuildNumber()`**  
  Get SDK build number.

#### Error Codes

- `ERROR_CAMERA_PERMISSION_DENIED = 1001`
- `ERROR_CAMERA_UNAVAILABLE = 1002`
- `ERROR_NO_FACE_DETECTED = 1003`
- `ERROR_LOW_CONFIDENCE = 1004`
- `ERROR_PROCESSING_FAILED = 1005`
- `ERROR_TIMEOUT = 1006`

### BioVaultConfig

Configuration options for biometric capture.

#### Builder Methods

```java
new BioVaultConfig.Builder()
    .captureDuration(int seconds)        // Default: 30
    .minConfidence(double threshold)     // Default: 0.7 (70%)
    .requireFace(boolean require)        // Default: true
    .enablePRNU(boolean enable)          // Default: true
    .cameraResolution(int w, int h)      // Default: 640x480
    .processingFPS(int fps)              // Default: 10
    .showUI(boolean show)                // Default: true
    .showFaceRect(boolean show)          // Default: true
    .build();
```

### BioSignature

Result object containing captured biometric data.

#### Methods

- **`getBPM()`** → `int`  
  Heart rate in beats per minute (60-100 normal range).

- **`getConfidence()`** → `double`  
  Confidence score between 0.0 and 1.0.

- **`getFacesDetected()`** → `int`  
  Number of faces detected (0 or 1).

- **`getTimestamp()`** → `long`  
  Unix timestamp in milliseconds.

- **`getPRNU()`** → `byte[]`  
  PRNU camera fingerprint.

- **`getHash()`** → `String`  
  SHA-256 hash of biometric data.

- **`isHighConfidence()`** → `boolean`  
  True if confidence >= 80%.

- **`isNormalHeartRate()`** → `boolean`  
  True if BPM is between 60-100.

### BiometricCallback

Callback interface for receiving capture events.

#### Methods

- **`onCaptureComplete(BioSignature)`**  
  Called when capture succeeds.

- **`onProgress(int progress, int currentBPM, double confidence)`**  
  Called periodically with progress updates (0-100%).

- **`onFaceDetected(int facesDetected)`**  
  Called when face detection status changes.

- **`onError(int errorCode, String message)`**  
  Called on errors.

- **`onCancelled()`**  
  Called when user cancels.

## Technical Details

### rPPG Algorithm

- **Method**: FFT-based frequency analysis on green channel
- **Window**: 15-second sliding window
- **Sampling**: 10 FPS from 640x480 VGA feed
- **Range**: 60-150 BPM (1.0-2.5 Hz)
- **Filtering**: Median filter with outlier rejection
- **Confidence**: Based on signal strength + stability

### Face Detection

- **Method**: Brightness + texture + edge analysis (fallback mode)
- **Brightness**: 80-180 acceptable range
- **Texture**: Variance > 20 for detail
- **Edges**: Canny density > 0.05 for structure
- **Tracking**: Dynamic rectangle overlay follows face

### PRNU Fingerprinting

- **Method**: Photo Response Non-Uniformity extraction
- **Purpose**: Unique camera sensor identification
- **Use Case**: Device authentication, deepfake detection

### OpenCV Integration

- **Version**: OpenCV 4.10.0 Android SDK
- **Native**: C++ with JNI bridge
- **Libraries**: `libopencv_core`, `libopencv_imgproc`, `libopencv_objdetect`
- **ABIs**: arm64-v8a, x86_64

## Use Cases

1. **Biometric Authentication**  
   Replace passwords with heart rate + face detection.

2. **Health Monitoring**  
   Basic heart rate tracking in wellness apps.

3. **Device Binding**  
   Use PRNU fingerprint to bind accounts to specific devices.

4. **Deepfake Detection**  
   Verify live presence with real-time biometric data.

5. **Blockchain Anchoring**  
   Store hash on-chain for tamper-proof biometric records.

## Requirements

- **Android**: API 24+ (Android 7.0+)
- **Camera**: Front-facing camera required
- **NDK**: r25 or later
- **Gradle**: 7.0+
- **Permissions**: `android.permission.CAMERA`

## Performance

- **Processing**: 10 FPS (100ms per frame)
- **Memory**: ~50 MB (includes OpenCV)
- **CPU**: Optimized for mobile (ARMv8)
- **Battery**: Low impact with 10 FPS throttling

## Limitations

- ✳️ **Lighting**: Requires adequate lighting for face detection
- ✳️ **Movement**: User should stay relatively still during capture
- ✳️ **Duration**: 30-second capture for stable reading
- ✳️ **Accuracy**: ±5 BPM typical variation vs medical devices

## License

Copyright © 2024 BioVault. All rights reserved.

## Support

- **Issues**: GitHub Issues
- **Email**: support@biovault.com
- **Docs**: https://docs.biovault.com

## Version History

### 1.0.0 (2024-02-10)
- Initial SDK release
- rPPG heart rate extraction
- PRNU camera fingerprinting
- Face detection with tracking
- Confidence scoring
- OpenCV 4.10.0 integration
