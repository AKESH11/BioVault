import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, Alert} from 'react-native';

export default function CameraScreen({navigation}) {
  const [isRecording, setIsRecording] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [faceCount, setFaceCount] = useState(0);
  const maxDuration = 30;

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= maxDuration) {
            stopRecording();
            return prev;
          }
          return prev + 1;
        });
        setBpm(65 + Math.floor(Math.random() * 20));
        setConfidence(75 + Math.floor(Math.random() * 20));
        setFaceCount(1);
      }, 1000);
    } else {
      setRecordingTime(0);
      setBpm(0);
      setConfidence(0);
      setFaceCount(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const startRecording = () => {
    Alert.alert(
      'Simulation Mode',
      'Camera integration ready! This simulation shows:\n\n' +
      '• Real-time BPM readings (simulated)\n' +
      '• Face detection counter\n' +
      '• Recording timer\n\n' +
      'Full camera requires OpenCV SDK.\n\n' +
      'Start simulation?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Start',
          onPress: () => {
            setIsRecording(true);
            setFaceCount(1);
          }
        }
      ]
    );
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    const avgBpm = bpm;
    const avgConfidence = confidence;
    
    Alert.alert(
      'Recording Complete',
      `Duration: ${recordingTime}s\n` +
      `Average BPM: ${avgBpm}\n` +
      `Confidence: ${avgConfidence}%`,
      [
        {text: 'Back', onPress: () => navigation.goBack()},
        {
          text: 'View Results',
          onPress: () => {
            navigation.navigate('Results', {
              videoHash: 'Qm' + Math.random().toString(36).substr(2, 44),
              bioSignature: '0x' + Math.random().toString(36).substr(2, 64),
              hardwareDNA: 'HW' + Math.random().toString(36).substr(2, 32),
              averageBPM: avgBpm,
              confidence: avgConfidence,
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
      <View style={styles.cameraPlaceholder}>
        <Text style={styles.placeholderIcon}>📷</Text>
        <Text style={styles.placeholderText}>Camera Preview</Text>
        <Text style={styles.placeholderNote}>
          Simulation mode active{'\n'}
          Real camera requires OpenCV SDK
        </Text>
      </View>

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
            <Text style={styles.recordingTime}>
              {formatTime(recordingTime)} / {maxDuration}s
            </Text>
          </View>
        )}
      </View>

      <View style={styles.metricsOverlay}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Heart Rate</Text>
          <Text style={styles.metricValue}>
            {bpm > 0 ? `${bpm} BPM` : '--'}
          </Text>
          {confidence > 0 && (
            <Text style={styles.metricConfidence}>
              {confidence}% confidence
            </Text>
          )}
        </View>

        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Face Detection</Text>
          <Text style={styles.metricValue}>
            {faceCount > 0 ? `${faceCount} face` : 'No face'}
          </Text>
        </View>
      </View>

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
            : `Recording... (${maxDuration - recordingTime}s remaining)`}
        </Text>
      </View>
    </View>
  );
}

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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
