package com.biovault;

import android.content.Context;
import android.content.res.AssetManager;
import android.graphics.Bitmap;
import android.util.Log;

import org.pytorch.IValue;
import org.pytorch.LiteModuleLoader;
import org.pytorch.Module;
import org.pytorch.Tensor;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * PhysNet Neural Network Inference Wrapper
 * Uses PyTorch Mobile to run 3D-CNN rPPG heart rate extraction
 * Alternative to FFT-based approach for better accuracy
 */
public class PhysNetInference {
    private static final String TAG = "PhysNetInference";
    
    // Model configuration
    private static final int FRAME_COUNT = 128;  // PhysNet expects 128 frames
    private static final int FRAME_WIDTH = 128;   // Input resolution
    private static final int FRAME_HEIGHT = 128;
    private static final int CHANNELS = 3;        // RGB
    
    private Module module;
    private boolean isLoaded = false;
    private List<float[]> frameBuffer;
    private int frameSampleRate = 30;  // FPS
    
    public PhysNetInference(Context context) {
        frameBuffer = new ArrayList<>();
        try {
            // Load model from assets
            String modelPath = assetFilePath(context, "models/physnet.ptl");
            module = LiteModuleLoader.load(modelPath);
            isLoaded = true;
            Log.i(TAG, "✓ PhysNet model loaded successfully");
        } catch (Exception e) {
            Log.e(TAG, "✗ Failed to load PhysNet model", e);
            isLoaded = false;
        }
    }
    
    /**
     * Check if model is loaded and ready
     */
    public boolean isModelLoaded() {
        return isLoaded;
    }
    
    /**
     * Add a frame to the buffer for processing
     * Frames should be 128x128 RGB bitmaps
     */
    public void addFrame(Bitmap frame) {
        if (!isLoaded || frame == null) return;
        
        // Convert bitmap to normalized float array [-1, 1]
        int width = frame.getWidth();
        int height = frame.getHeight();
        int[] pixels = new int[width * height];
        frame.getPixels(pixels, 0, width, 0, 0, width, height);
        
        // Normalize and store as [R, G, B] channels
        float[] normalizedFrame = new float[CHANNELS * FRAME_HEIGHT * FRAME_WIDTH];
        
        for (int i = 0; i < pixels.length; i++) {
            int pixel = pixels[i];
            
            // Extract RGB (0-255)
            int r = (pixel >> 16) & 0xFF;
            int g = (pixel >> 8) & 0xFF;
            int b = pixel & 0xFF;
            
            // Normalize to [-1, 1]
            normalizedFrame[i] = (r / 127.5f) - 1.0f;                         // R channel
            normalizedFrame[FRAME_WIDTH * FRAME_HEIGHT + i] = (g / 127.5f) - 1.0f;  // G channel
            normalizedFrame[2 * FRAME_WIDTH * FRAME_HEIGHT + i] = (b / 127.5f) - 1.0f; // B channel
        }
        
        frameBuffer.add(normalizedFrame);
        
        // Keep only the most recent FRAME_COUNT frames
        if (frameBuffer.size() > FRAME_COUNT) {
            frameBuffer.remove(0);
        }
    }
    
    /**
     * Check if we have enough frames for inference
     */
    public boolean hasEnoughFrames() {
        return frameBuffer.size() >= FRAME_COUNT;
    }
    
    /**
     * Get current frame buffer count
     */
    public int getFrameCount() {
        return frameBuffer.size();
    }
    
    /**
     * Run PhysNet inference on buffered frames
     * Returns BVP (Blood Volume Pulse) waveform as float array
     */
    public PhysNetResult runInference() {
        if (!isLoaded || !hasEnoughFrames()) {
            return null;
        }
        
        try {
            // Prepare input tensor: [1, 3, 128, 128, 128]
            // Shape: [batch, channels, depth(time), height, width]
            float[] inputData = new float[1 * CHANNELS * FRAME_COUNT * FRAME_HEIGHT * FRAME_WIDTH];
            
            // Copy frames to tensor (CHW format)
            for (int t = 0; t < FRAME_COUNT; t++) {
                float[] frame = frameBuffer.get(frameBuffer.size() - FRAME_COUNT + t);
                
                for (int c = 0; c < CHANNELS; c++) {
                    for (int h = 0; h < FRAME_HEIGHT; h++) {
                        for (int w = 0; w < FRAME_WIDTH; w++) {
                            int srcIdx = c * FRAME_HEIGHT * FRAME_WIDTH + h * FRAME_WIDTH + w;
                            int dstIdx = c * FRAME_COUNT * FRAME_HEIGHT * FRAME_WIDTH +
                                        t * FRAME_HEIGHT * FRAME_WIDTH +
                                        h * FRAME_WIDTH + w;
                            inputData[dstIdx] = frame[srcIdx];
                        }
                    }
                }
            }
            
            // Create input tensor
            long[] shape = {1, CHANNELS, FRAME_COUNT, FRAME_HEIGHT, FRAME_WIDTH};
            Tensor inputTensor = Tensor.fromBlob(inputData, shape);
            
            // Run inference
            long startTime = System.currentTimeMillis();
            IValue[] outputs = module.forward(IValue.from(inputTensor)).toTuple();
            long inferenceTime = System.currentTimeMillis() - startTime;
            
            // Extract BVP signal (first output)
            Tensor outputTensor = outputs[0].toTensor();
            float[] bvpSignal = outputTensor.getDataAsFloatArray();
            
            Log.i(TAG, String.format("✓ PhysNet inference: %dms, signal length: %d", 
                                    inferenceTime, bvpSignal.length));
            
            // Calculate heart rate from BVP signal
            int heartRate = calculateHeartRate(bvpSignal, frameSampleRate);
            double signalQuality = calculateSignalQuality(bvpSignal);
            
            return new PhysNetResult(bvpSignal, heartRate, signalQuality, inferenceTime);
            
        } catch (Exception e) {
            Log.e(TAG, "✗ PhysNet inference failed", e);
            return null;
        }
    }
    
    /**
     * Calculate heart rate from BVP waveform using FFT
     */
    private int calculateHeartRate(float[] bvpSignal, int sampleRate) {
        // Simple peak detection or FFT-based HR calculation
        // For now, use FFT to find dominant frequency
        
        int n = bvpSignal.length;
        
        // Apply FFT (simplified - in production use proper FFT library)
        // For now, find peaks in time domain
        
        int peakCount = 0;
        float threshold = 0.0f; // Mean
        
        // Count peaks above mean
        float mean = 0;
        for (float v : bvpSignal) mean += v;
        mean /= n;
        
        boolean aboveThreshold = false;
        for (float v : bvpSignal) {
            if (v > mean && !aboveThreshold) {
                peakCount++;
                aboveThreshold = true;
            } else if (v <= mean) {
                aboveThreshold = false;
            }
        }
        
        // Calculate BPM (peaks per second * 60)
        float durationSeconds = (float) n / sampleRate;
        int bpm = (int) ((peakCount / durationSeconds) * 60);
        
        // Clamp to physiological range
        if (bpm < 40) bpm = 40;
        if (bpm > 180) bpm = 180;
        
        return bpm;
    }
    
    /**
     * Calculate signal quality (simple std dev / mean ratio)
     */
    private double calculateSignalQuality(float[] signal) {
        float mean = 0, std = 0;
        
        for (float v : signal) mean += v;
        mean /= signal.length;
        
        for (float v : signal) std += (v - mean) * (v - mean);
        std = (float) Math.sqrt(std / signal.length);
        
        return Math.min(1.0, std / (Math.abs(mean) + 1e-6));
    }
    
    /**
     * Clear frame buffer
     */
    public void reset() {
        frameBuffer.clear();
    }
    
    /**
     * Release model resources
     */
    public void release() {
        if (module != null) {
            module = null;
        }
        frameBuffer.clear();
        isLoaded = false;
    }
    
    /**
     * Copy asset file to cache directory and return path
     */
    private String assetFilePath(Context context, String assetName) throws IOException {
        File file = new File(context.getFilesDir(), assetName);
        
        // Create parent directories if needed
        file.getParentFile().mkdirs();
        
        // Copy asset if not exists
        if (!file.exists()) {
            try (InputStream is = context.getAssets().open(assetName);
                 FileOutputStream os = new FileOutputStream(file)) {
                byte[] buffer = new byte[4 * 1024];
                int read;
                while ((read = is.read(buffer)) != -1) {
                    os.write(buffer, 0, read);
                }
                os.flush();
            }
        }
        
        return file.getAbsolutePath();
    }
    
    /**
     * Result container for PhysNet inference
     */
    public static class PhysNetResult {
        public final float[] bvpWaveform;
        public final int heartRate;
        public final double signalQuality;
        public final long inferenceTimeMs;
        
        public PhysNetResult(float[] bvp, int hr, double quality, long time) {
            this.bvpWaveform = bvp;
            this.heartRate = hr;
            this.signalQuality = quality;
            this.inferenceTimeMs = time;
        }
        
        @Override
        public String toString() {
            return String.format("PhysNetResult{HR=%d BPM, Quality=%.2f, Time=%dms}",
                               heartRate, signalQuality, inferenceTimeMs);
        }
    }
}
