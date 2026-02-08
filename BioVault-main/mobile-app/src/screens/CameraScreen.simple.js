/**
 * CameraScreen.js - Simplified Version
 * 
 * Camera UI ready for testing - full integration requires OpenCV SDK
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  BackHandler,
} from 'react-native';

const CameraScreen = ({navigation}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [faceCount, setFaceCount] = useState(0);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isRecording) {
        Alert.alert('Recording', 'Stop recording first');
        return true;
      }
      navigation.goBack();
      return true;
    });

    return () => backHandler.remove();
  }, [isRecording]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => prev + 1);
        // Simulate BPM reading
        setBpm(65 + Math.floor(Math.random() * 20));
        setConfidence(75 + Math.floor(Math.random() * 20));
        setFaceCount(1);
      }, 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = async () => {
    Alert.alert(
      'Camera Integration Ready',
      'Full camera functionality requires:\n\n' +
      '1. OpenCV Android SDK installed\n' +
      '2. Native C++ build enabled\n' +
      '3. Camera permissions granted\n\n' +
      'All code is ready - just needs SDK!\n\n' +
      'For now, this shows the UI and simulates BPM readings.',
      [
        {text: 'Got it', style: 'default'},
        {
          text: 'Start Simulation',
          onPress: () => {
            setIsRecording(true);
            setFaceCount(1);
          }
        }
      ]
    );
  };

  const stopRecording = async () => {
    setIsRecording(false);
    
    Alert.alert(
      'Recording Complete',
      `Duration: ${recordingTime}s\n` +
      `Average BPM: ${bpm}\n` +
      `Confidence: ${confidence}%\n\n` +
      `This would normally:\n` +
      `• Extract bio-signature from video\n` +
      `• Generate hardware fingerprint\n` +
      `• Upload to IPFS\n` +
      `• Anchor on blockchain`,
      [
        {text: 'Back to Home', onPress: () => navigation.goBack()},
        {
          text: 'View Results',
          onPress: () => {
            navigation.navigate('Results', {
              videoHash: 'QmX...' + Math.random().toString(36).substr(2, 9),
              bioSignature: '0x' + Math.random().toString(36).substr(2, 16),
              hardwareDNA: 'HW' + Math.random().toString(36).substr(2, 16),
              averageBPM: bpm,
              confidence: confidence,
              faceCount: 1,
              duration: recordingTime,
            });
          }
        }
      ]
    );
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {/* Camera Placeholder */}
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.placeholderIcon}>📷</Text>
        <Text style={styles.placeholderText}>Camera Preview</Text>
        <Text style={styles.placeholderNote}>
          Requires OpenCV SDK for full functionality{'\n'}
          Native integration code is ready!
        </Text>
      </View>

      {/* Top Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          disabled={isRecording}>
          <Text style={styles.backButtonText}>✕</Text>
        </TouchableOpacity>
        
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingTime}>{formatTime(recordingTime)}</Text>
          </View>
        )}
      </View>

      {/* Bio-Metrics Overlay */}
      <View style={styles.metricsOverlay}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Heart Rate</Text>
          <Text style={styles.metricValue}>
            {bpm > 0 ? `${bpm} BPM` : '--'}
          </Text>
          <Text style={styles.metricConfidence}>
            {confidence > 0 ? `${confidence}% confidence` : 'Waiting...'}
          </Text>
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Face Detection</Text>
          <Text style={styles.metricValue}>
            {faceCount > 0 ? `${faceCount} face` : 'No face'}
          </Text>
        </View>
      </View>

      {/* Bottom Controls */}
      <View style={styles.controls}>
        <View style={styles.controlRow}>
          {!isRecording ? (
            <TouchableOpacity
              style={styles.recordButton}
              onPress={startRecording}>
              <View style={styles.recordButtonInner} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.stopButton}
              onPress={stopRecording}>
              <View style={styles.stopButtonInner} />
            </TouchableOpacity>
          )}
        </View>

        <Text style={styles.instructionText}>
          {!isRecording
            ? 'Tap to start recording'
            : `Recording... (max 30s)`}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraPlaceholder: {
    flex: 1,
    backgroundColor: '#1a1a3e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  placeholderText: {
    fontSize: 24,
    color: '#ffffff',
    fontWeight: '600',
    marginBottom: 16,
  },
  placeholderNote: {
    fontSize: 14,
    color: '#8b8ba7',
    textAlign: 'center',
    paddingHorizontal: 40,
    lineHeight: 22,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 40,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '300',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239,68,68,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffffff',
    marginRight: 8,
  },
  recordingTime: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  metricsOverlay: {
    position: 'absolute',
    top: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCard: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 12,
    borderRadius: 12,
    minWidth: 140,
  },
  metricLabel: {
    color: '#8b8ba7',
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  metricConfidence: {
    color: '#10b981',
    fontSize: 11,
  },
  controls: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  controlRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239,68,68,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#ef4444',
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ef4444',
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(239,68,68,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#ef4444',
  },
  stopButtonInner: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 16,
    textAlign: 'center',
  },
});

export default CameraScreen;
