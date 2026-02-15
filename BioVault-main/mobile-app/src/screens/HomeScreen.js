import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, NativeModules, AppState} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/ApiService';
import anchorQueue from '../services/AnchorQueue';

const {BioVaultModule} = NativeModules;

const STATUS_CACHE_KEY = 'biovault_status_cache';
const STATUS_CACHE_TTL = 30000; // 30 seconds

export default function HomeScreen({navigation}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [hardwareSecurity, setHardwareSecurity] = useState('Checking...');
  const [realityKey, setRealityKey] = useState('Checking...');
  const [backendStatus, setBackendStatus] = useState('Checking...');
  const [calibrationStatus, setCalibrationStatus] = useState(null);
  const [contractAddress, setContractAddress] = useState(null);
  const [contractStatus, setContractStatus] = useState('Checking...');
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await anchorQueue.getPendingCount();
      setPendingCount(count);
    } catch (_) {}
  }, []);

  // Process offline queue when backend is reachable
  const drainQueue = useCallback(async () => {
    try {
      const count = await anchorQueue.getPendingCount();
      if (count === 0) return;
      const results = await anchorQueue.processQueue();
      if (results && results.length > 0) {
        const ok = results.filter(r => r.status === 'fulfilled').length;
        if (ok > 0) {
          Alert.alert('Queue Synced', `${ok} pending anchor(s) submitted successfully.`);
        }
      }
    } catch (_) {}
    refreshPendingCount();
  }, [refreshPendingCount]);

  useEffect(() => {
    loadCachedStatus();
    checkSystemStatus();
    refreshPendingCount();
    drainQueue();

    // Re-drain when app comes to foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshPendingCount();
        drainQueue();
      }
    });
    return () => sub.remove();
  }, []);

  const loadCachedStatus = async () => {
    try {
      const cached = await AsyncStorage.getItem(STATUS_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < STATUS_CACHE_TTL) {
          // Use cached values while fresh check happens
          if (data.backendStatus) setBackendStatus(data.backendStatus);
          if (data.contractAddress) setContractAddress(data.contractAddress);
          if (data.contractStatus) setContractStatus(data.contractStatus);
          if (data.hardwareSecurity) setHardwareSecurity(data.hardwareSecurity);
          if (data.realityKey) setRealityKey(data.realityKey);
        }
      }
    } catch (e) {
      // Cache miss is fine
    }
  };

  const saveStatusCache = async (data) => {
    try {
      await AsyncStorage.setItem(
        STATUS_CACHE_KEY,
        JSON.stringify({ data, timestamp: Date.now() }),
      );
    } catch (e) {
      // Non-critical
    }
  };

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
      setBackendStatus(health.server === 'healthy' ? 'Connected' : 'Degraded');
    } catch (e) {
      setBackendStatus('Offline');
    }

    // Get contract addresses from backend
    try {
      const contracts = await apiService.contractsStatus();
      if (contracts?.mediaAnchor?.address) {
        const addr = contracts.mediaAnchor.address;
        setContractAddress(addr.slice(0, 6) + '...' + addr.slice(-4));
        setContractStatus(contracts.mediaAnchor.connected ? 'Connected' : 'Not connected');
      } else {
        setContractStatus('Not configured');
      }
    } catch (e) {
      setContractStatus('Unknown');
    }

    setIsInitialized(true);

    // Cache status for offline resilience
    saveStatusCache({
      backendStatus: backendStatus !== 'Checking...' ? backendStatus : undefined,
      contractAddress,
      contractStatus: contractStatus !== 'Checking...' ? contractStatus : undefined,
      hardwareSecurity: hardwareSecurity !== 'Checking...' ? hardwareSecurity : undefined,
      realityKey: realityKey !== 'Checking...' ? realityKey : undefined,
    });
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
          <Text style={styles.valueSmall}>{contractAddress || '...'}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Status</Text>
          <Text style={contractStatus === 'Connected' ? styles.valueGreen : styles.valueYellow}>
            {contractStatus === 'Connected' ? '✓ Deployed' : contractStatus}
          </Text>
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

        {pendingCount > 0 && (
          <TouchableOpacity
            style={[styles.actionButton, styles.queueButton]}
            onPress={drainQueue}>
            <Text style={styles.actionIcon}>🔄</Text>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Retry Pending Anchors</Text>
              <Text style={styles.actionSubtitle}>
                {pendingCount} item{pendingCount > 1 ? 's' : ''} queued offline
              </Text>
            </View>
          </TouchableOpacity>
        )}

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

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={async () => {
          await AsyncStorage.removeItem('biovault_auth');
          apiService.setAccessToken(null);
          navigation.replace('Login');
        }}>
        <Text style={styles.logoutText}>Sign Out</Text>
      </TouchableOpacity>
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
  queueButton: {
    backgroundColor: '#f59e0b22',
    borderColor: '#f59e0b',
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
  logoutButton: {
    margin: 16,
    marginTop: 0,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ef4444',
    alignItems: 'center',
    marginBottom: 32,
  },
  logoutText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
});
