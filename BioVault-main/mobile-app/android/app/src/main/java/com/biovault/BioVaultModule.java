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

    public BioVaultModule(ReactApplicationContext context) {
        super(context);
        this.reactContext = context;
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
    public void resetEngine() {
        reset();
    }
}
