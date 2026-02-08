import React from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert} from 'react-native';

export default function App() {
  const handleTestButton = () => {
    Alert.alert('Success!', 'BioVault is working! This proves the app can run properly.');
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔐 Bio-Vault</Text>
        <Text style={styles.subtitle}>Decentralized Bio-Authentication</Text>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>✓ WORKING</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>📊 System Status</Text>
        <View style={styles.row}>
          <Text style={styles.label}>App Status</Text>
          <Text style={styles.valueGreen}>✓ Running</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>JavaScript</Text>
          <Text style={styles.valueGreen}>✓ Loaded</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>React Native</Text>
          <Text style={styles.valueGreen}>✓ Active</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>⛓️ Blockchain</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Network</Text>
          <Text style={styles.value}>Polygon Amoy</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>MediaAnchor</Text>
          <Text style={styles.valueSmall}>0x7bCD78E...bDe</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleTestButton}>
        <Text style={styles.buttonText}>🎉 Test Alert</Text>
      </TouchableOpacity>

      <View style={styles.infoCard}>
        <Text style={styles.infoText}>
          This is a minimal working version to prove the app functions correctly.{'\n\n'}
          Full features (camera, rPPG) require OpenCV SDK installation.
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
    padding: 32,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e3f',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8b8ba7',
    marginBottom: 16,
  },
  badge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  badgeText: {
    color: '#ffffff',
    fontSize: 14,
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
    fontSize: 20,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
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
  valueSmall: {
    fontSize: 12,
    color: '#ffffff',
    fontFamily: 'monospace',
  },
  button: {
    margin: 16,
    padding: 20,
    backgroundColor: '#6366f1',
    borderRadius: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  infoCard: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a1a3e',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#6366f1',
  },
  infoText: {
    color: '#8b8ba7',
    fontSize: 14,
    lineHeight: 20,
  },
});
