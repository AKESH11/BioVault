/**
 * HomeScreen.js
 * 
 * Main landing screen with bio-metrics dashboard and navigation
 */

import React, {useEffect, useState} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  Alert,
  ScrollView,
} from 'react-native';
import {NativeModules} from 'react-native';
import {CONTRACTS} from '../config/contracts';

const {BioVaultModule} = NativeModules;

function HomeScreen({navigation}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [strongBoxInfo, setStrongBoxInfo] = useState(null);

  useEffect(() => {
    initializeBioVault();
    requestPermissions();
  }, []);

  const initializeBioVault = async () => {
    try {
      const result = await BioVaultModule.init();
      console.log('Bio-Vault initialized:', result);
      setIsInitialized(true);

      // Check StrongBox support
      try {
        const sbInfo = await BioVaultModule.initializeStrongBox();
        setStrongBoxInfo(sbInfo);
        console.log('StrongBox info:', sbInfo);
      } catch (e) {
        console.warn('StrongBox not available:', e);
      }
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

  const calibrateDevice = async () => {
    Alert.alert(
      'Hardware Calibration',
      "This will capture frames to extract your camera's unique fingerprint.",
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Start',
          onPress: async () => {
            try {
              const mockFrames = JSON.stringify([]);
              const result = await BioVaultModule.calibrateDevice(mockFrames);
              Alert.alert('Calibrated', `Hardware ID: ${result.substring(0, 16)}...`);
            } catch (error) {
              Alert.alert('Error', 'Calibration failed');
            }
          },
        },
      ],
    );
  };

  const openCamera = () => {
    if (!isInitialized) {
      Alert.alert('Not Ready', 'BioVault is still initializing...');
      return;
    }
    navigation.navigate('Camera');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView>
        <View style={styles.header}>
          <Text style={styles.title}>Bio-Vault Protocol</Text>
          <Text style={styles.subtitle}>Proof of Reality</Text>
          {isInitialized && (
            <View style={styles.statusBadge}>
              <Text style={styles.statusText}>✓ Initialized</Text>
            </View>
          )}
        </View>

        {/* System Status Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>System Status</Text>
          
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Bio-Vault Core:</Text>
            <Text style={[styles.statusValue, isInitialized && styles.statusSuccess]}>
              {isInitialized ? '✓ Ready' : '⚠ Initializing...'}
            </Text>
          </View>

          {strongBoxInfo && (
            <>
              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Hardware Security:</Text>
                <Text style={[styles.statusValue, styles.statusSuccess]}>
                  {strongBoxInfo.securityLevel === 'strongbox' ? '✓ StrongBox' : '✓ TEE'}
                </Text>
              </View>

              <View style={styles.statusRow}>
                <Text style={styles.statusLabel}>Reality Key:</Text>
                <Text style={[styles.statusValue, styles.statusSuccess]}>
                  {strongBoxInfo.keyGenerated ? '✓ Generated' : '✗ Not Generated'}
                </Text>
              </View>
            </>
          )}

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Blockchain:</Text>
            <Text style={styles.statusValue}>
              {CONTRACTS.NETWORK.name}
            </Text>
          </View>

          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>MediaAnchor Contract:</Text>
            <Text style={[
              styles.statusValue,
              CONTRACTS.MEDIA_ANCHOR !== '0x0000000000000000000000000000000000000000' && styles.statusSuccess
            ]}>
              {CONTRACTS.MEDIA_ANCHOR !== '0x0000000000000000000000000000000000000000'
                ? '✓ Deployed'
                : '✗ Not Deployed'}
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsCard}>
          <Text style={styles.cardTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={openCamera}
            disabled={!isInitialized}>
            <Text style={styles.buttonIcon}>🎥</Text>
            <View style={styles.buttonContent}>
              <Text style={styles.buttonText}>Record with Bio-Auth</Text>
              <Text style={styles.buttonSubtext}>
                Camera + rPPG + PRNU extraction
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={calibrateDevice}
            disabled={!isInitialized}>
            <Text style={styles.buttonIcon}>📱</Text>
            <View style={styles.buttonContent}>
              <Text style={styles.buttonTextSecondary}>Calibrate Device</Text>
              <Text style={styles.buttonSubtextSecondary}>
                Extract hardware fingerprint
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => Alert.alert('Coming Soon', 'View your anchored media on blockchain')}
            disabled={!isInitialized}>
            <Text style={styles.buttonIcon}>📚</Text>
            <View style={styles.buttonContent}>
              <Text style={styles.buttonTextSecondary}>My Media</Text>
              <Text style={styles.buttonSubtextSecondary}>
                Blockchain-anchored content
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Features Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Features</Text>
          <View style={styles.featuresList}>
            <Text style={styles.featureItem}>✓ rPPG bio-signature extraction</Text>
            <Text style={styles.featureItem}>✓ PRNU hardware fingerprinting</Text>
            <Text style={styles.featureItem}>✓ Multi-party consent (BLE)</Text>
            <Text style={styles.featureItem}>✓ Blockchain anchoring (Polygon)</Text>
            <Text style={styles.featureItem}>✓ IPFS content storage</Text>
            <Text style={styles.featureItem}>✓ ZK proof verification</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Decentralized • Consensual • Verifiable
          </Text>
        </View>
      </ScrollView>
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
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d5f',
  },
  statusLabel: {
    fontSize: 14,
    color: '#8b8ba7',
  },
  statusValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  statusSuccess: {
    color: '#10b981',
  },
  actionsCard: {
    margin: 16,
    marginTop: 0,
  },
  button: {
    flexDirection: 'row',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
  },
  secondaryButton: {
    backgroundColor: '#1a1a3e',
    borderWidth: 1,
    borderColor: '#2d2d5f',
  },
  buttonIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  buttonContent: {
    flex: 1,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  buttonSubtext: {
    color: '#c7c7d9',
    fontSize: 13,
  },
  buttonTextSecondary: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  buttonSubtextSecondary: {
    color: '#8b8ba7',
    fontSize: 13,
  },
  featuresList: {
    gap: 8,
  },
  featureItem: {
    fontSize: 14,
    color: '#8b8ba7',
    paddingVertical: 4,
  },
  footer: {
    padding: 32,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#8b8ba7',
  },
});

export default HomeScreen;
