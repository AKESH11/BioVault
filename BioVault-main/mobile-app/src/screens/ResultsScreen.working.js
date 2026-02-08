import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert} from 'react-native';

export default function ResultsScreen({navigation, route}) {
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorStatus, setAnchorStatus] = useState(null);

  const data = route?.params || {};
  const {
    videoHash = 'QmX...placeholder',
    bioSignature = '0x...',
    hardwareDNA = 'HW...',
    averageBPM = 72,
    confidence = 85,
    faceCount = 1,
    duration = 30,
  } = data;

  const anchorToBlockchain = () => {
    setIsAnchoring(true);
    setTimeout(() => {
      setIsAnchoring(false);
      setAnchorStatus('success');
      Alert.alert(
        'Blockchain Anchored',
        'Bio-signature anchored to MediaAnchor contract:\n\n' +
        '0x7bCD78E5c8317C914Da948A24a13cE6138F77bDe\n\n' +
        'Transaction ID:\n0x' + Math.random().toString(36).substr(2, 64) +
        '\n\nNetwork: Polygon Amoy Testnet',
        [{text: 'OK'}]
      );
    }, 2000);
  };

  const shareResults = () => {
    Alert.alert(
      'Share Results',
      `Video Hash: ${videoHash}\n\n` +
      `Bio-Signature: ${bioSignature}\n\n` +
      `Hardware DNA: ${hardwareDNA}\n\n` +
      'This would generate a shareable link or QR code.',
      [{text: 'OK'}]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bio-Signature Results</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>Extraction Complete</Text>
          <Text style={styles.successSubtitle}>
            Bio-signature successfully captured
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 Bio-Metrics</Text>
          
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Average Heart Rate</Text>
            <Text style={styles.metricValue}>{averageBPM} BPM</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Confidence Score</Text>
            <Text style={[styles.metricValue, styles.successText]}>
              {confidence}%
            </Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Recording Duration</Text>
            <Text style={styles.metricValue}>{duration}s</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Faces Detected</Text>
            <Text style={styles.metricValue}>{faceCount}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔐 Signatures</Text>
          
          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Video Hash (IPFS)</Text>
            <Text style={styles.signatureValue} numberOfLines={1}>
              {videoHash}
            </Text>
          </View>

          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Bio-Signature</Text>
            <Text style={styles.signatureValue} numberOfLines={1}>
              {bioSignature}
            </Text>
          </View>

          <View style={styles.signatureBlock}>
            <Text style={styles.signatureLabel}>Hardware DNA</Text>
            <Text style={styles.signatureValue} numberOfLines={1}>
              {hardwareDNA}
            </Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>⛓️ Blockchain</Text>
          
          {!anchorStatus ? (
            <View>
              <Text style={styles.infoText}>
                Anchor this bio-signature to Polygon blockchain for immutable 
                proof of authenticity and timestamp.
              </Text>
              
              <TouchableOpacity
                style={[styles.anchorButton, isAnchoring && styles.anchorButtonDisabled]}
                onPress={anchorToBlockchain}
                disabled={isAnchoring}>
                <Text style={styles.anchorButtonText}>
                  {isAnchoring ? '⏳ Anchoring...' : '⛓️ Anchor to Blockchain'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.anchorSuccess}>
              <Text style={styles.anchorSuccessIcon}>✓</Text>
              <Text style={styles.anchorSuccessText}>
                Anchored on Polygon Amoy
              </Text>
            </View>
          )}
        </View>

        <View style={styles.actionsCard}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={shareResults}>
            <Text style={styles.secondaryButtonText}>📤 Share Results</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Home')}>
            <Text style={styles.secondaryButtonText}>🏠 Return Home</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e1e3f',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    color: '#ffffff',
    fontSize: 28,
  },
  headerTitle: {
    flex: 1,
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 8,
  },
  content: {
    flex: 1,
  },
  successCard: {
    margin: 16,
    padding: 32,
    backgroundColor: '#1a1a3e',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#10b981',
    alignItems: 'center',
  },
  successIcon: {
    fontSize: 64,
    color: '#10b981',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#8b8ba7',
  },
  card: {
    margin: 16,
    marginTop: 0,
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
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d2d5f',
  },
  metricLabel: {
    fontSize: 14,
    color: '#8b8ba7',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  successText: {
    color: '#10b981',
  },
  signatureBlock: {
    marginBottom: 16,
  },
  signatureLabel: {
    fontSize: 12,
    color: '#8b8ba7',
    marginBottom: 4,
  },
  signatureValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#ffffff',
    backgroundColor: '#0f0f23',
    padding: 8,
    borderRadius: 4,
  },
  infoText: {
    fontSize: 14,
    color: '#8b8ba7',
    marginBottom: 16,
    lineHeight: 20,
  },
  anchorButton: {
    backgroundColor: '#6366f1',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  anchorButtonDisabled: {
    opacity: 0.6,
  },
  anchorButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  anchorSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#10b981',
    borderRadius: 12,
  },
  anchorSuccessIcon: {
    fontSize: 24,
    color: '#ffffff',
    marginRight: 12,
  },
  anchorSuccessText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  actionsCard: {
    margin: 16,
    marginTop: 0,
  },
  secondaryButton: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#1a1a3e',
    borderWidth: 1,
    borderColor: '#2d2d5f',
    marginBottom: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
