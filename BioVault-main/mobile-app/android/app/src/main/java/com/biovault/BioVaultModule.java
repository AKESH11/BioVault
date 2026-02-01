package com.biovault;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.Promise;

/**
 * React Native module bridge to C++ Bio-Vault core
 */
public class BioVaultModule extends ReactContextBaseJavaModule {
    
    static {
        // Load native library
        System.loadLibrary("BioVaultCore");
    }

    private final ReactApplicationContext reactContext;
    private StrongBoxManager strongBoxManager;

    public BioVaultModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
        this.strongBoxManager = new StrongBoxManager(context);
    }

    @Override
    public String getName() {
        return "BioVaultModule";
    }

    // Native method declarations (implemented in C++)
    private native String initialize();
    private native String processFrame(String frameData, int width, int height, String faceBounds);
    private native String calibrateHardware(String calibrationFramesJson);
    private native String generateAnchorHash(String frameData, int bpm, String hardwareID);
    private native byte[] generateBioVaultProof(byte[] frameData, int bpm, String hardwareID);
    private native boolean testStrongBoxSignature();
    private native void reset();

    @ReactMethod
    public void init(Promise promise) {
        try {
            String result = initialize();
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
    public void resetEngine() {
        reset();
    }
}
