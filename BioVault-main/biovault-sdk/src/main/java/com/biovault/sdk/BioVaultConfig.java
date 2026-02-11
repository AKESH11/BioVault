package com.biovault.sdk;

/**
 * Configuration options for BioVault SDK biometric capture.
 */
public class BioVaultConfig {
    
    // Capture duration (default 30 seconds for stable BPM reading)
    private int captureDurationSeconds = 30;
    
    // Minimum confidence threshold (0.0 - 1.0)
    private double minConfidenceThreshold = 0.7;
    
    // Require face detection
    private boolean requireFaceDetection = true;
    
    // Enable PRNU fingerprinting
    private boolean enablePRNU = true;
    
    // Camera resolution
    private int cameraWidth = 640;
    private int cameraHeight = 480;
    
    // Processing frame rate (FPS)
    private int processingFPS = 10;
    
    // Enable UI overlay with realtime feedback
    private boolean enableUIOverlay = true;
    
    // Show dynamic face rectangle
    private boolean showFaceRectangle = true;

    public BioVaultConfig() {
        // Default configuration
    }

    // Builder pattern for easy configuration
    public static class Builder {
        private final BioVaultConfig config = new BioVaultConfig();

        public Builder captureDuration(int seconds) {
            config.captureDurationSeconds = seconds;
            return this;
        }

        public Builder minConfidence(double threshold) {
            config.minConfidenceThreshold = threshold;
            return this;
        }

        public Builder requireFace(boolean require) {
            config.requireFaceDetection = require;
            return this;
        }

        public Builder enablePRNU(boolean enable) {
            config.enablePRNU = enable;
            return this;
        }

        public Builder cameraResolution(int width, int height) {
            config.cameraWidth = width;
            config.cameraHeight = height;
            return this;
        }

        public Builder processingFPS(int fps) {
            config.processingFPS = fps;
            return this;
        }

        public Builder showUI(boolean show) {
            config.enableUIOverlay = show;
            return this;
        }

        public Builder showFaceRect(boolean show) {
            config.showFaceRectangle = show;
            return this;
        }

        public BioVaultConfig build() {
            return config;
        }
    }

    // Getters
    public int getCaptureDurationSeconds() { return captureDurationSeconds; }
    public double getMinConfidenceThreshold() { return minConfidenceThreshold; }
    public boolean isRequireFaceDetection() { return requireFaceDetection; }
    public boolean isEnablePRNU() { return enablePRNU; }
    public int getCameraWidth() { return cameraWidth; }
    public int getCameraHeight() { return cameraHeight; }
    public int getProcessingFPS() { return processingFPS; }
    public boolean isEnableUIOverlay() { return enableUIOverlay; }
    public boolean isShowFaceRectangle() { return showFaceRectangle; }

    @Override
    public String toString() {
        return String.format("BioVaultConfig{duration=%ds, minConfidence=%.2f, requireFace=%b, width=%d, height=%d, fps=%d}",
                           captureDurationSeconds, minConfidenceThreshold, requireFaceDetection, 
                           cameraWidth, cameraHeight, processingFPS);
    }
}
