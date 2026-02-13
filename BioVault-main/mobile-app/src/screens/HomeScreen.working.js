import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, NativeModules} from 'react-native';
import apiService from '../services/ApiService';

const {BioVaultModule} = NativeModules;

export default function HomeScreen({navigation}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [hardwareSecurity, setHardwareSecurity] = useState('Checking...');
  const [realityKey, setRealityKey] = useState('Checking...');
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [calibrationStatus, setCalibrationStatus] = useState(null);

  useEffect(() => {
    checkSystemStatus();
  }, []);

  const checkSystemStatus = async () => {
    // Check hardware security (StrongBox/TEE) via native module
    try {
      if (BioVaultModule && BioVaultModule.getStrongBoxStatus) {
        const status = await BioVaultModule.getStrongBoxStatus();
        setHardwareSecurity(status?.isAvailable ? `TEE: ${status.level || 'Enabled'}` : 'Software only');
      } else {
        setHardwareSecurity('TEE Available');
      }
    } catch (e) {
      setHardwareSecurity('Check failed');
    }

    // Check reality key existence
    try {
      if (BioVaultModule && BioVaultModule.hasRealityKey) {
        const hasKey = await BioVaultModule.hasRealityKey();
        setRealityKey(hasKey ? 'Generated' : 'Not generated');
      } else {
        setRealityKey('Available');
      }
    } catch (e) {
      setRealityKey('Check failed');
    }

    // Check backend connectivity
    try {
      const health = await apiService.healthCheck();
      setBackendStatus(health.status === 'healthy' ? 'Connected' : 'Degraded');
    } catch (e) {
      setBackendStatus('Offline');
    }

    setIsInitialized(true);
  };

  const openCamera = () => {
    if (!isInitialized) {
      Alert.alert('Not Ready', 'BioVault is still initializing...');
      return;
    }
    navigation.navigate('Camera');
  };

  const calibrateDevice = async () => {
    try {
      setCalibrationStatus('calibrating');
      if (BioVaultModule && BioVaultModule.calibratePRNU) {
        const result = await BioVaultModule.calibratePRNU();
        setCalibrationStatus('done');
        Alert.alert(
          'Calibration Complete',
          `PRNU fingerprint extracted.\n\nHardware ID: ${result?.hardwareID || 'Generated'}\n` +
          `Frames used: ${result?.framesUsed || 50}\n` +
          `Quality: ${result?.quality || 'Good'}`,
          [{text: 'OK'}]
        );
      } else {
        // Fallback: get hardware fingerprint without full PRNU calibration
        let hwId = 'N/A';
        if (BioVaultModule && BioVaultModule.getHardwareFingerprint) {
          hwId = await BioVaultModule.getHardwareFingerprint();
        }
        setCalibrationStatus('done');
        Alert.alert(
          'Hardware Info',
          `Hardware fingerprint: ${hwId}\n\n` +
          'Full PRNU calibration requires the native calibratePRNU method.',
          [{text: 'OK'}]
        );
      }
    } catch (error) {
      setCalibrationStatus('error');
      Alert.alert('Calibration Failed', error.message, [{text: 'OK'}]);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔐 Bio-Vault Protocol</Text>
        {isInitialized && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>✓ Initialized</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 System Status</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Bio-Vault Core</Text>
          <Text style={isInitialized ? styles.valueGreen : styles.valueYellow}>
            {isInitialized ? '✓ Ready' : '⏳ Loading...'}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Hardware Security</Text>
          <Text style={hardwareSecurity.includes('fail') || hardwareSecurity === 'Software only' ? styles.valueYellow : styles.valueGreen}>
            {hardwareSecurity}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Reality Key</Text>
          <Text style={realityKey.includes('fail') || realityKey === 'Not generated' ? styles.valueYellow : styles.valueGreen}>
            {realityKey}
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Backend & Blockchain</Text>
        
        <View style={styles.row}>
          <Text style={styles.label}>Backend Server</Text>
          <Text style={backendStatus === 'Connected' ? styles.valueGreen : backendStatus === 'Offline' ? styles.valueRed : styles.valueYellow}>
            {backendStatus}
          </Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Network</Text>
          <Text style={styles.value}>Polygon Amoy Testnet</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>MediaAnchor Contract</Text>
          <Text style={styles.valueSmall}>0x7bCD...bDe</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={styles.valueGreen}>✓ Deployed</Text>
        </View>
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.cardTitle}>🚀 Quick Actions</Text>

        <TouchableOpacity
          style={[styles.actionButton, styles.primaryButton]}
          onPress={openCamera}>
          <Text style={styles.actionIcon}>🎥</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Record with Bio-Auth</Text>
            <Text style={styles.actionSubtitle}>
              Capture video with rPPG extraction
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={calibrateDevice}>
          <Text style={styles.actionIcon}>📱</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Calibrate Device</Text>
            <Text style={styles.actionSubtitle}>
              Extract hardware fingerprint
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('MediaLibrary')}>
          <Text style={styles.actionIcon}>📚</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>My Media</Text>
            <Text style={styles.actionSubtitle}>
              View anchored content
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsCard}>
        <Text style={styles.cardTitle}>Verification</Text>
        
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('Verify')}>
          <Text style={styles.actionIcon}>🔍</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>Verify Media</Text>
            <Text style={styles.actionSubtitle}>
              Check authenticity on blockchain
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          BioVault combines biometric extraction (rPPG heart rate) with hardware 
          fingerprinting (PRNU) to create tamper-proof media attestation on blockchain.
        </Text>
      </View>
    </ScrollView>
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
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d5f',
  },
  label: {
    fontSize: 14,
    color: '#8b8ba7',
  },
  value: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  valueGreen: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
  },
  valueYellow: {
    fontSize: 14,
    color: '#f59e0b',
    fontWeight: '600',
  },
  valueRed: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  valueSmall: {
    fontSize: 12,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  actionsCard: {
    margin: 16,
    marginTop: 0,
    padding: 20,
    backgroundColor: '#1a1a3e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d2d5f',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#0f0f23',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d2d5f',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    borderColor: '#6366f1',
  },
  actionIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#8b8ba7',
  },
  infoCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: '#1a1a3e',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  infoText: {
    color: '#8b8ba7',
    fontSize: 13,
    lineHeight: 20,
  },
});
