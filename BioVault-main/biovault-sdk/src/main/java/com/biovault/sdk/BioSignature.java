package com.biovault.sdk;

/**
 * Represents a captured biometric signature from the BioVault SDK.
 * Contains heart rate (BPM), confidence score, and raw biometric data.
 */
public class BioSignature {
    private final int bpm;
    private final double confidence;
    private final int facesDetected;
    private final long timestamp;
    private final byte[] prnu;  // PRNU fingerprint
    private final String hash;  // SHA-256 hash of biometric data

    public BioSignature(int bpm, double confidence, int facesDetected, 
                        long timestamp, byte[] prnu, String hash) {
        this.bpm = bpm;
        this.confidence = confidence;
        this.facesDetected = facesDetected;
        this.timestamp = timestamp;
        this.prnu = prnu;
        this.hash = hash;
    }

    /**
     * Get the detected heart rate in beats per minute.
     * Range: 60-100 BPM for normal resting heart rate.
     * @return Heart rate in BPM
     */
    public int getBPM() {
        return bpm;
    }

    /**
     * Get the confidence score of the measurement.
     * @return Confidence value between 0.0 and 1.0
     */
    public double getConfidence() {
        return confidence;
    }

    /**
     * Get the number of faces detected in the frame.
     * @return 0 if no face, 1 if face detected
     */
    public int getFacesDetected() {
        return facesDetected;
    }

    /**
     * Get the Unix timestamp (milliseconds) when this signature was captured.
     * @return Timestamp in milliseconds
     */
    public long getTimestamp() {
        return timestamp;
    }

    /**
     * Get the PRNU (Photo Response Non-Uniformity) fingerprint.
     * This is a unique camera sensor signature.
     * @return PRNU fingerprint as byte array
     */
    public byte[] getPRNU() {
        return prnu;
    }

    /**
     * Get the cryptographic hash of the biometric data.
     * @return SHA-256 hash as hex string
     */
    public String getHash() {
        return hash;
    }

    /**
     * Check if this signature has high confidence (>= 80%).
     * @return true if confidence >= 0.8
     */
    public boolean isHighConfidence() {
        return confidence >= 0.8;
    }

    /**
     * Check if the BPM reading is in normal resting range (60-100 BPM).
     * @return true if BPM is between 60 and 100
     */
    public boolean isNormalHeartRate() {
        return bpm >= 60 && bpm <= 100;
    }

    @Override
    public String toString() {
        return String.format("BioSignature{bpm=%d, confidence=%.2f, faces=%d, timestamp=%d}",
                           bpm, confidence, facesDetected, timestamp);
    }
}
