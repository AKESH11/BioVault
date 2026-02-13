package com.biovault;

import android.os.Build;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.content.Context;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.WritableArray;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.module.annotations.ReactModule;

import java.io.ByteArrayOutputStream;

/**
 * React Native module bridge to C++ Bio-Vault core
 * Supports hybrid rPPG: PhysNet (neural network) + FFT (classical)
 */
@ReactModule(name = "BioVaultModule")
public class BioVaultModule extends ReactContextBaseJavaModule {
    
    static {
        // Load native library
        System.loadLibrary("BioVaultCore");
    }

    private final ReactApplicationContext reactContext;
    private StrongBoxManager strongBoxManager;
    private TSCANInference tscanInference;
    private boolean tscanAvailable = false;
    private int frameProcessCounter = 0;
    
    // Face tracking stabilization (exponential moving average)
    private float[] smoothedFaceBounds = null;  // [x, y, width, height]
    private static final float FACE_SMOOTHING_ALPHA = 0.7f;  // Higher = more smoothing

    public BioVaultModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.strongBoxManager = new StrongBoxManager(context);
        
        // Initialize TS-CAN rPPG (NO FFT FALLBACK)
        try {
            tscanInference = new TSCANInference(context);
            tscanAvailable = tscanInference.isReady();
            
            if (tscanAvailable) {
                android.util.Log.i("BioVault", "✓ TS-CAN MODE ENABLED");
                android.util.Log.i("BioVault", "✓ FFT disabled - pure TS-CAN neural inference");
                android.util.Log.i("BioVault", "✓ 10 frames, 72x72, dual-branch (motion+appearance)");
                android.util.Log.i("BioVault", "✓ 31x faster than PhysNet!");
            } else {
                android.util.Log.e("BioVault", "✗ TS-CAN model failed to load - rPPG unavailable");
            }
        } catch (Exception e) {
            android.util.Log.e("BioVault", "TS-CAN initialization failed", e);
            tscanAvailable = false;
        }
    }

    @Override
    public String getName() {
        return "BioVaultModule";
    }

    /**
     * Detects if device is high-end enough for PhysNet inference.
     * Checks CPU architecture and device model/hardware.
     */
    private boolean isHighEndDevice() {
        String model = Build.MODEL.toLowerCase();
        String hardware = Build.HARDWARE.toLowerCase();
        String[] supportedAbis = Build.SUPPORTED_ABIS;
        
        // Check for 64-bit ARM architecture (arm64-v8a)
        boolean is64Bit = false;
        for (String abi : supportedAbis) {
            if (abi.contains("arm64-v8a") || abi.contains("x86_64")) {
                is64Bit = true;
                break;
            }
        }
        
        if (!is64Bit) {
            return false; // 32-bit devices too slow for PhysNet
        }
        
        // Check for flagship chipsets (Snapdragon 8-series, Tensor, Dimensity 9000+)
        boolean hasFlagshipCpu = hardware.contains("qcom") || hardware.contains("exynos") ||
                                  hardware.contains("tensor") || hardware.contains("dimensity");
        
        // Check for flagship device models
        boolean isFlagshipDevice = model.contains("pixel") ||
                                    model.contains("galaxy s") ||
                                    model.contains("oneplus") ||
                                    model.contains("xiaomi 13") || model.contains("xiaomi 14") ||
                                    model.contains("oppo find") ||
                                    model.contains("vivo x") ||
                                    model.contains("iqoo");
        
        // Require at least 6GB RAM (check available memory)
        android.app.ActivityManager activityManager = (android.app.ActivityManager) 
            reactContext.getSystemService(Context.ACTIVITY_SERVICE);
        android.app.ActivityManager.MemoryInfo memInfo = new android.app.ActivityManager.MemoryInfo();
        activityManager.getMemoryInfo(memInfo);
        long totalMemoryMB = memInfo.totalMem / (1024 * 1024);
        boolean hasEnoughRAM = totalMemoryMB >= 6000; // 6 GB minimum
        
        android.util.Log.i("BioVault", String.format(
            "Device detection: model=%s, hardware=%s, 64bit=%b, flagship_cpu=%b, flagship_device=%b, ram=%dMB",
            model, hardware, is64Bit, hasFlagshipCpu, isFlagshipDevice, totalMemoryMB));
        
        // Enable PhysNet if: 64-bit + (flagship CPU OR flagship device) + enough RAM
        return is64Bit && (hasFlagshipCpu || isFlagshipDevice) && hasEnoughRAM;
    }

    /**
     * Converts YUV_420_888 frame data to RGB Bitmap for TS-CAN input.
     * Returns full-resolution frame (cropping happens later).
     */
    private Bitmap yuvToBitmap(byte[] yuvData, int width, int height, int rotation) {
        try {
            // Create YuvImage from NV21 data
            android.graphics.YuvImage yuvImage = new android.graphics.YuvImage(
                yuvData, 
                android.graphics.ImageFormat.NV21, 
                width, 
                height, 
                null
            );
            
            // Convert to JPEG (intermediate format)
            java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
            yuvImage.compressToJpeg(new android.graphics.Rect(0, 0, width, height), 90, out);
            byte[] imageBytes = out.toByteArray();
            
            // Decode JPEG to Bitmap
            Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
            
            if (bitmap == null) {
                android.util.Log.e("BioVault", "Failed to decode YUV frame to Bitmap");
                return null;
            }
            
            // Apply rotation if needed
            if (rotation != 0) {
                Matrix matrix = new Matrix();
                matrix.postRotate(rotation);
                bitmap = Bitmap.createBitmap(bitmap, 0, 0, bitmap.getWidth(), bitmap.getHeight(), matrix, true);
            }
            
            return bitmap;
            
        } catch (Exception e) {
            android.util.Log.e("BioVault", "Error converting YUV to Bitmap: " + e.getMessage(), e);
            return null;
        }
    }
    
    /**
     * Smooth face bounding box using exponential moving average
     * Reduces jitter from Haar Cascade face detection
     * @param rawBounds Current frame's detected face bounds [x, y, width, height]
     * @return Stabilized face bounds
     */
    private float[] smoothFaceBoundingBox(float[] rawBounds) {
        if (rawBounds == null || rawBounds.length != 4) {
            return rawBounds;
        }
        
        // Initialize on first frame
        if (smoothedFaceBounds == null) {
            smoothedFaceBounds = new float[4];
            System.arraycopy(rawBounds, 0, smoothedFaceBounds, 0, 4);
            return smoothedFaceBounds;
        }
        
        // Apply exponential moving average: smoothed = alpha * smoothed + (1-alpha) * raw
        // Higher alpha = more smoothing (less jitter, slower response)
        for (int i = 0; i < 4; i++) {
            smoothedFaceBounds[i] = FACE_SMOOTHING_ALPHA * smoothedFaceBounds[i] + 
                                   (1.0f - FACE_SMOOTHING_ALPHA) * rawBounds[i];
        }
        
        return smoothedFaceBounds;
    }

    // Native method declarations (implemented in C++)
    private native String nativeInitialize();
    private native String processFrame(String frameData, int width, int height, String faceBounds);
    private native String calibrateHardware(String calibrationFramesJson);
    private native String generateAnchorHash(String frameData, int bpm, String hardwareID);
    private native byte[] generateBioVaultProof(byte[] frameData, int bpm, String hardwareID);
    private native boolean testStrongBoxSignature();
    private native boolean initConsensusSession(String sessionId, int[] expectedFaceIds, 
                                                 byte[] videoFrameHash, String hardwareDNA);
    private native boolean appendConsensusSignature(String sessionId, int faceId, int bpm,
                                                     byte[] signature, byte[] publicKey);
    private native String finalizeConsensus(String sessionId);
    private native void reset();
    
    // Camera bridge native methods (implemented in camera_bridge.cpp)
    private native boolean nativeInitializeCamera(String cascadePath);
    private native String nativeProcessCameraFrame(byte[] frameData, int width, int height, int format);
    private native String nativeProcessMultiFace(byte[] frameData, int width, int height);
    private native boolean nativeStartRPPGSession();
    private native String nativeStopRPPGSession();
    private native void nativeReleaseCamera();

    @ReactMethod
    public void init(Promise promise) {
        try {
            String result = nativeInitialize();
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("INIT_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void processVideoFrame(String frameData, int width, int height, 
                                   String faceBounds, Promise promise) {
        try {
            String result = processFrame(frameData, width, height, faceBounds);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("PROCESS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void calibrateDevice(String calibrationFramesJson, Promise promise) {
        try {
            String result = calibrateHardware(calibrationFramesJson);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("CALIBRATE_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void createAnchorHash(String frameData, int bpm, String hardwareID, Promise promise) {
        try {
            String result = generateAnchorHash(frameData, bpm, hardwareID);
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("HASH_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void createBioVaultProof(String frameDataBase64, int bpm, String hardwareID, Promise promise) {
        try {
            // Decode base64 frame data
            byte[] frameData = android.util.Base64.decode(frameDataBase64, android.util.Base64.DEFAULT);
            
            // Generate proof with StrongBox signature
            byte[] proof = generateBioVaultProof(frameData, bpm, hardwareID);
            
            if (proof == null || proof.length == 0) {
                promise.reject("PROOF_ERROR", "Failed to generate proof. Check biometric authentication.");
                return;
            }
            
            // Encode proof as base64 for React Native
            String proofBase64 = android.util.Base64.encodeToString(proof, android.util.Base64.NO_WRAP);
            promise.resolve(proofBase64);
        } catch (Exception e) {
            promise.reject("PROOF_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void testStrongBox(Promise promise) {
        try {
            boolean success = testStrongBoxSignature();
            promise.resolve(success);
        } catch (Exception e) {
            promise.reject("TEST_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void initializeStrongBox(Promise promise) {
        try {
            boolean isSupported = strongBoxManager.isStrongBoxSupported();
            boolean keyGenerated = strongBoxManager.generateRealityKey();
            
            if (!keyGenerated) {
                promise.reject("STRONGBOX_ERROR", "Failed to generate reality key");
                return;
            }
            
            Boolean isInStrongBox = strongBoxManager.isKeyInStrongBox();
            String securityLevel = isInStrongBox == null ? "unknown" : 
                                  (isInStrongBox ? "strongbox" : "tee");
            
            com.facebook.react.bridge.WritableMap result = com.facebook.react.bridge.Arguments.createMap();
            result.putBoolean("strongBoxSupported", isSupported);
            result.putBoolean("keyGenerated", true);
            result.putString("securityLevel", securityLevel);
            
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("STRONGBOX_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void getSecurityInfo(Promise promise) {
        try {
            boolean hasKey = strongBoxManager.hasRealityKey();
            Boolean isInStrongBox = strongBoxManager.isKeyInStrongBox();
            
            com.facebook.react.bridge.WritableMap result = com.facebook.react.bridge.Arguments.createMap();
            result.putBoolean("hasRealityKey", hasKey);
            
            if (hasKey && isInStrongBox != null) {
                result.putString("securityLevel", isInStrongBox ? "strongbox" : "tee");
            } else {
                result.putString("securityLevel", "unknown");
            }
            
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("INFO_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void startConsensusSession(String sessionId, com.facebook.react.bridge.ReadableArray faceIds,
                                      String videoFrameHashBase64, String hardwareDNA, Promise promise) {
        try {
            // Convert faceIds array
            int[] faceIdArray = new int[faceIds.size()];
            for (int i = 0; i < faceIds.size(); i++) {
                faceIdArray[i] = faceIds.getInt(i);
            }
            
            // Decode video frame hash
            byte[] frameHash = android.util.Base64.decode(videoFrameHashBase64, android.util.Base64.DEFAULT);
            
            // Initialize consensus session in C++
            boolean success = initConsensusSession(sessionId, faceIdArray, frameHash, hardwareDNA);
            
            if (!success) {
                promise.reject("CONSENSUS_ERROR", "Failed to initialize consensus session");
                return;
            }
            
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("CONSENSUS_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void addConsensusSignature(String sessionId, int faceId, int bpm,
                                      String signatureBase64, String publicKeyBase64, Promise promise) {
        try {
            // Decode signature and public key
            byte[] signature = android.util.Base64.decode(signatureBase64, android.util.Base64.DEFAULT);
            byte[] publicKey = android.util.Base64.decode(publicKeyBase64, android.util.Base64.DEFAULT);
            
            // Append signature to consensus session in C++
            boolean success = appendConsensusSignature(sessionId, faceId, bpm, signature, publicKey);
            
            promise.resolve(success);
        } catch (Exception e) {
            promise.reject("CONSENSUS_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void finalizeConsensusSession(String sessionId, Promise promise) {
        try {
            // Finalize and get result from C++
            String resultJson = finalizeConsensus(sessionId);
            
            if (resultJson == null) {
                promise.reject("CONSENSUS_ERROR", "Session not found");
                return;
            }
            
            // Parse JSON and return as map
            // For simplicity, return raw JSON string
            promise.resolve(resultJson);
        } catch (Exception e) {
            promise.reject("CONSENSUS_ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void resetEngine() {
        reset();
    }
    
    // ============================================
    // Camera Integration Methods
    // ============================================
    
    @ReactMethod
    public void initializeCamera(Promise promise) {
        try {
            // Get path to OpenCV cascade files (bundled with OpenCV SDK)
            String cascadePath = "/data/local/tmp/haarcascade_frontalface_default.xml";
            boolean success = nativeInitializeCamera(cascadePath);
            
            if (success) {
                promise.resolve(true);
            } else {
                promise.reject("CAMERA_INIT_ERROR", "Failed to initialize camera bridge");
            }
        } catch (Exception e) {
            promise.reject("CAMERA_INIT_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void processCameraFrame(String frameDataBase64, int width, int height, 
                                   int format, Promise promise) {
        try {
            // Decode base64 frame data
            byte[] frameData = android.util.Base64.decode(frameDataBase64, android.util.Base64.DEFAULT);
            
            // Process through native camera bridge
            String result = nativeProcessCameraFrame(frameData, width, height, format);
            
            if (result != null) {
                promise.resolve(result);
            } else {
                promise.reject("PROCESS_ERROR", "Failed to process camera frame");
            }
        } catch (Exception e) {
            promise.reject("PROCESS_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void processMultiFaceFrame(String frameDataBase64, int width, int height, Promise promise) {
        try {
            byte[] frameData = android.util.Base64.decode(frameDataBase64, android.util.Base64.DEFAULT);
            String result = nativeProcessMultiFace(frameData, width, height);
            
            if (result != null) {
                promise.resolve(result);
            } else {
                promise.reject("PROCESS_ERROR", "Failed to process multi-face frame");
            }
        } catch (Exception e) {
            promise.reject("PROCESS_ERROR", e.getMessage());
        }
    }
    
    // Synchronous method for direct calls from camera view
    public WritableMap processVideoFrameSync(byte[] frameData, int width, int height, int rotation) {
        try {
            frameProcessCounter++;
            
            // TS-CAN MODE: Use C++ for face detection, TS-CAN for rPPG
            if (!tscanAvailable || tscanInference == null) {
                // TS-CAN not available - return error
                WritableMap errorMap = Arguments.createMap();
                errorMap.putBoolean("error", true);
                errorMap.putString("message", "TS-CAN model not loaded");
                errorMap.putInt("facesDetected", 0);
                return errorMap;
            }
            
            // Call C++ for face detection (but not FFT)
            String cppResult = nativeProcessCameraFrame(frameData, width, height, rotation);
            
            if (cppResult != null) {
                // Parse face detection from C++ result
                org.json.JSONObject json = new org.json.JSONObject(cppResult);
                int facesDetected = json.has("facesDetected") ? json.getInt("facesDetected") : 0;
                
                // Only add frames when face is detected
                if (facesDetected > 0) {
                    Bitmap frameBitmap = yuvToBitmap(frameData, width, height, rotation);
                    if (frameBitmap != null) {
                        Bitmap roiBitmap = null;
                        try {
                            if (json.has("faceBox")) {
                                org.json.JSONObject faceBox = json.getJSONObject("faceBox");
                                float[] rawBounds = new float[] {
                                    (float) faceBox.optDouble("x", 0.0),
                                    (float) faceBox.optDouble("y", 0.0),
                                    (float) faceBox.optDouble("width", frameBitmap.getWidth()),
                                    (float) faceBox.optDouble("height", frameBitmap.getHeight())
                                };

                                float[] smoothBounds = smoothFaceBoundingBox(rawBounds);

                                int left = Math.max(0, Math.min((int) Math.round(smoothBounds[0]), frameBitmap.getWidth() - 1));
                                int top = Math.max(0, Math.min((int) Math.round(smoothBounds[1]), frameBitmap.getHeight() - 1));
                                int boxWidth = Math.max(1, Math.min((int) Math.round(smoothBounds[2]), frameBitmap.getWidth() - left));
                                int boxHeight = Math.max(1, Math.min((int) Math.round(smoothBounds[3]), frameBitmap.getHeight() - top));

                                roiBitmap = Bitmap.createBitmap(frameBitmap, left, top, boxWidth, boxHeight);
                            }
                        } catch (Exception e) {
                            android.util.Log.w("BioVault", "Failed to crop face ROI, using full frame", e);
                        }

                        Bitmap inputBitmap = (roiBitmap != null) ? roiBitmap : frameBitmap;
                        tscanInference.addFrame(inputBitmap);

                        if (roiBitmap != null && roiBitmap != frameBitmap) {
                            roiBitmap.recycle();
                        }
                        frameBitmap.recycle();
                    }
                    
                    // Get current BPM from TS-CAN inference
                    TSCANInference.InferenceResult result = tscanInference.getCurrentBPM();
                    
                    // Create result map
                    WritableMap map = Arguments.createMap();
                    map.putInt("bpm", (int) Math.round(result.bpm));
                    map.putDouble("confidence", result.confidence);
                    map.putString("method", "TS-CAN");
                    map.putBoolean("isValid", result.isValid);
                    map.putInt("facesDetected", facesDetected);
                    map.putInt("width", width);
                    map.putInt("height", height);
                    
                    if (result.isValid) {
                        map.putInt("inferenceTime", (int) result.inferenceTimeMs);
                    }
                    
                    return map;
                } else {
                    // No face detected - return early
                    WritableMap map = Arguments.createMap();
                    map.putInt("facesDetected", 0);
                    map.putInt("bpm", 0);
                    map.putDouble("confidence", 0.0);
                    map.putBoolean("isValid", false);
                    map.putInt("width", width);
                    map.putInt("height", height);
                    return map;
                }
            }
            
            // C++ call failed
            WritableMap errorMap = Arguments.createMap();
            errorMap.putBoolean("error", true);
            errorMap.putString("message", "Face detection failed");
            errorMap.putInt("facesDetected", 0);
            return errorMap;
            
        } catch (Exception e) {
            android.util.Log.e("BioVault", "Error in TS-CAN processing: " + e.getMessage());
            WritableMap errorMap = Arguments.createMap();
            errorMap.putBoolean("error", true);
            errorMap.putString("message", e.getMessage());
            return errorMap;
        }
    }
    
    @ReactMethod
    public void startRPPGExtraction(Promise promise) {
        try {
            boolean success = nativeStartRPPGSession();
            promise.resolve(success);
        } catch (Exception e) {
            promise.reject("RPPG_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void setPhysNetEnabled(boolean enabled, Promise promise) {
        try {
            // TS-CAN mode - always returns TS-CAN status
            WritableMap result = Arguments.createMap();
            result.putBoolean("enabled", tscanAvailable);
            result.putBoolean("available", tscanAvailable);
            result.putString("mode", "ts-can");
            
            android.util.Log.i("BioVault", "rPPG mode: TS-CAN (no FFT)");
            promise.resolve(result);
        } catch (Exception e) {
            promise.reject("MODE_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void getPhysNetStatus(Promise promise) {
        WritableMap status = Arguments.createMap();
        status.putBoolean("available", tscanAvailable);
        status.putBoolean("enabled", tscanAvailable);
        status.putBoolean("highEndDevice", isHighEndDevice());
        status.putString("currentMode", tscanAvailable ? "TS-CAN" : "Unavailable");
        status.putString("deviceModel", Build.MODEL);
        status.putString("cpuAbi", Build.SUPPORTED_ABIS[0]);
        promise.resolve(status);
    }
    
    @ReactMethod
    public void stopRPPGExtraction(Promise promise) {
        try {
            String result = nativeStopRPPGSession();
            
            if (result != null) {
                promise.resolve(result);
            } else {
                promise.reject("RPPG_ERROR", "Failed to stop rPPG session");
            }
        } catch (Exception e) {
            promise.reject("RPPG_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void initializeCamera(String cascadePath, Promise promise) {
        try {
            boolean success = nativeInitializeCamera(cascadePath);
            promise.resolve(success);
        } catch (Exception e) {
            promise.reject("CAMERA_INIT_ERROR", e.getMessage());
        }
    }
    
    @ReactMethod
    public void releaseCamera() {
        try {
            nativeReleaseCamera();
        } catch (Exception e) {
            // Silent fail on cleanup
        }
    }
}
