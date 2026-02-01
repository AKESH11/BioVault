import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  Alert
} from 'react-native';
import { NativeModules } from 'react-native';
import BleManager from 'react-native-ble-manager';

const { BioVaultModule } = NativeModules;

function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [bpm, setBpm] = useState(null);
  const [confidence, setConfidence] = useState(null);
  const [liveness, setLiveness] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    initializeBioVault();
    requestPermissions();
  }, []);

  const initializeBioVault = async () => {
    try {
      const result = await BioVaultModule.init();
      console.log('Bio-Vault initialized:', result);
      setIsInitialized(true);
    } catch (error) {
      console.error('Initialization error:', error);
      Alert.alert('Error', 'Failed to initialize Bio-Vault');
    }
  };

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);

        console.log('Permissions:', granted);
      } catch (err) {
        console.warn(err);
      }
    }
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      
      // Initialize BLE for consensus handshake
      await BleManager.start();
      await BleManager.scan([], 5, false);
      
      Alert.alert('Recording Started', 'Scanning for consensus parties...');
      
      // In production, this would:
      // 1. Start camera capture
      // 2. Extract rPPG from video frames
      // 3. Discover nearby Bio-Vault devices via BLE
      // 4. Request consent from detected subjects
      // 5. Generate multi-party signature
      // 6. Anchor to blockchain
      
    } catch (error) {
      console.error('Recording error:', error);
      Alert.alert('Error', 'Failed to start recording');
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      setIsRecording(false);
      await BleManager.stopScan();
      
      // Process and anchor the media
      Alert.alert('Processing', 'Anchoring media to blockchain...');
      
      // Placeholder for actual anchoring logic
      setTimeout(() => {
        Alert.alert('Success', 'Media anchored successfully!');
      }, 2000);
      
    } catch (error) {
      console.error('Stop recording error:', error);
    }
  };

  const calibrateDevice = async () => {
    Alert.alert(
      'Hardware Calibration',
      'This will capture 50+ frames to extract your camera\'s unique fingerprint.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start',
          onPress: async () => {
            try {
              // In production, capture calibration frames
              const mockFrames = JSON.stringify([]);
              const result = await BioVaultModule.calibrateDevice(mockFrames);
              Alert.alert('Calibrated', `Hardware ID: ${result.substring(0, 16)}...`);
            } catch (error) {
              Alert.alert('Error', 'Calibration failed');
            }
          }
        }
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Bio-Vault Protocol</Text>
        <Text style={styles.subtitle}>Proof of Reality</Text>
        {isInitialized && (
          <View style={styles.statusBadge}>
            <Text style={styles.statusText}>✓ Initialized</Text>
          </View>
        )}
      </View>

      <View style={styles.biometricsCard}>
        <Text style={styles.cardTitle}>Real-time Biometrics</Text>
        <View style={styles.biometricsRow}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Heart Rate</Text>
            <Text style={styles.metricValue}>
              {bpm || '--'} <Text style={styles.metricUnit}>BPM</Text>
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Confidence</Text>
            <Text style={styles.metricValue}>
              {confidence ? `${(confidence * 100).toFixed(0)}%` : '--'}
            </Text>
          </View>
        </View>
        <View style={styles.livenessIndicator}>
          <Text style={styles.livenessText}>
            Liveness: {liveness ? '✓ Detected' : '✗ Not Detected'}
          </Text>
        </View>
      </View>

      <View style={styles.actionsCard}>
        <TouchableOpacity
          style={[styles.button, styles.primaryButton, isRecording && styles.recordingButton]}
          onPress={isRecording ? stopRecording : startRecording}
          disabled={!isInitialized}>
          <Text style={styles.buttonText}>
            {isRecording ? '⏹ Stop Recording' : '🎥 Start Recording'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={calibrateDevice}
          disabled={!isInitialized}>
          <Text style={styles.buttonTextSecondary}>📱 Calibrate Device</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => Alert.alert('Feature', 'View your anchored media on blockchain')}
          disabled={!isInitialized}>
          <Text style={styles.buttonTextSecondary}>📚 My Media</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Decentralized • Consensual • Verifiable
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e3f',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8b8ba7',
  },
  statusBadge: {
    marginTop: 12,
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  biometricsCard: {
    margin: 16,
    padding: 20,
    backgroundColor: '#1a1a3e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d2d5f',
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  biometricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 14,
    color: '#8b8ba7',
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  metricUnit: {
    fontSize: 18,
    color: '#8b8ba7',
  },
  livenessIndicator: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5f',
    alignItems: 'center',
  },
  livenessText: {
    fontSize: 14,
    color: '#8b8ba7',
  },
  actionsCard: {
    margin: 16,
    gap: 12,
  },
  button: {
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  recordingButton: {
    backgroundColor: '#ef4444',
  },
  secondaryButton: {
    backgroundColor: '#1a1a3e',
    borderWidth: 1,
    borderColor: '#2d2d5f',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonTextSecondary: {
    color: '#8b8ba7',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#8b8ba7',
  },
});

export default App;
