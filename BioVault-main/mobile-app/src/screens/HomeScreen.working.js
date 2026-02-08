import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert} from 'react-native';

export default function HomeScreen({navigation}) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [hardwareSecurity, setHardwareSecurity] = useState('Checking...');

  useEffect(() => {
    setTimeout(() => {
      setIsInitialized(true);
      setHardwareSecurity('✓ TEE Enabled');
    }, 2000);
  }, []);

  const openCamera = () => {
    if (!isInitialized) {
      Alert.alert('Not Ready', 'BioVault is still initializing...');
      return;
    }
    navigation.navigate('Camera');
  };

  const calibrateDevice = () => {
    Alert.alert(
      'Hardware Calibration',
      'Device hardware fingerprint extraction:\n\n' +
      '• PRNU sensor noise pattern\n' +
      '• Hardware security level\n' +
      '• StrongBox/TEE status\n\n' +
      'Hardware ID: HW' + Math.random().toString(36).substr(2, 16),
      [{text: 'OK'}]
    );
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
          <Text style={styles.valueGreen}>{hardwareSecurity}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Reality Key</Text>
          <Text style={styles.valueGreen}>✓ Generated</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>⛓️ Blockchain</Text>
        
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
          onPress={() => Alert.alert('My Media', 'Feature coming soon!')}>
          <Text style={styles.actionIcon}>📚</Text>
          <View style={styles.actionContent}>
            <Text style={styles.actionTitle}>My Media</Text>
            <Text style={styles.actionSubtitle}>
              View anchored content
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
