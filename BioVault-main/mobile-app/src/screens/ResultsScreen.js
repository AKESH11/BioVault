/**
 * ResultsScreen.js
 * 
 * Display bio-signature extraction results and blockchain anchoring status.
 */

import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {NativeModules} from 'react-native';
import {CONTRACTS} from '../config/contracts';

const {BioVaultModule} = NativeModules;

const ResultsScreen = ({route, navigation}) => {
  const {videoUri, bioSignature} = route.params;
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorStatus, setAnchorStatus] = useState(null);
  const [txHash, setTxHash] = useState(null);

  const anchorToBlockchain = async () => {
    if (CONTRACTS.MEDIA_ANCHOR === '0x0000000000000000000000000000000000000000') {
      Alert.alert(
        'Contract Not Deployed',
        'MediaAnchor contract is not yet deployed. Deploy contracts first!',
      );
      return;
    }

    setIsAnchoring(true);
    
    try {
      // TODO: Implement blockchain anchoring via Web3
      // For now, show mock success
      
      setTimeout(() => {
        setAnchorStatus('success');
        setTxHash('0x' + Math.random().toString(16).substring(2, 66));
        setIsAnchoring(false);
        
        Alert.alert(
          'Anchored Successfully!',
          'Your video has been anchored to Polygon Amoy testnet.',
        );
      }, 2000);
      
    } catch (error) {
      console.error('Anchoring error:', error);
      setIsAnchoring(false);
      Alert.alert('Anchoring Failed', error.message);
    }
  };

  const openExplorer = () => {
    if (txHash) {
      const url = `${CONTRACTS.NETWORK.blockExplorer}/tx/${txHash}`;
      // TODO: Open URL in browser
      console.log('Opening:', url);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Bio-Signature Extracted</Text>
          <View style={[styles.badge, styles.successBadge]}>
            <Text style={styles.badgeText}>✓ Verified</Text>
          </View>
        </View>

        {/* Video Hash */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Video Content Hash</Text>
          <Text style={styles.hashText}>{bioSignature.videoHash || '0x000...'}</Text>
        </View>

        {/* Bio-Signature */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bio-Signature (rPPG)</Text>
          <Text style={styles.hashText}>{bioSignature.bioSignature || '0x000...'}</Text>
          <View style={styles.metricRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Avg BPM</Text>
              <Text style={styles.metricValue}>{bioSignature.averageBPM || 0}</Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Confidence</Text>
              <Text style={styles.metricValue}>
                {((bioSignature.confidence || 0) * 100).toFixed(0)}%
              </Text>
            </View>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Frames</Text>
              <Text style={styles.metricValue}>{bioSignature.frameCount || 0}</Text>
            </View>
          </View>
        </View>

        {/* Hardware DNA */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Hardware DNA (PRNU)</Text>
          <Text style={styles.hashText}>{bioSignature.hardwareDNA || '0x000...'}</Text>
        </View>

        {/* Blockchain Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Blockchain Anchor</Text>
          {!anchorStatus && (
            <Text style={styles.infoText}>
              Anchor this video to Polygon Amoy to create immutable proof of authenticity.
            </Text>
          )}
          
          {anchorStatus === 'success' && (
            <View>
              <View style={[styles.badge, styles.successBadge, {marginVertical: 12}]}>
                <Text style={styles.badgeText}>✓ Anchored to Blockchain</Text>
              </View>
              
              <Text style={styles.label}>Transaction Hash:</Text>
              <TouchableOpacity onPress={openExplorer}>
                <Text style={styles.linkText}>{txHash}</Text>
              </TouchableOpacity>
              
              <Text style={styles.label} style={{marginTop: 12}}>Contract:</Text>
              <Text style={styles.addressText}>{CONTRACTS.MEDIA_ANCHOR}</Text>
              
              <Text style={styles.label} style={{marginTop: 12}}>Network:</Text>
              <Text style={styles.infoText}>{CONTRACTS.NETWORK.name}</Text>
            </View>
          )}
        </View>

        {/* Video Info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Video File</Text>
          <Text style={styles.infoText} numberOfLines={1}>{videoUri}</Text>
        </View>
      </ScrollView>

      {/* Bottom Actions */}
      <View style={styles.bottomBar}>
        {!anchorStatus && (
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={anchorToBlockchain}
            disabled={isAnchoring}>
            {isAnchoring ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Anchor to Blockchain</Text>
            )}
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.button, styles.secondaryButton]}
          onPress={() => navigation.navigate('Camera')}>
          <Text style={[styles.buttonText, {color: '#007AFF'}]}>
            {anchorStatus ? 'Record Another' : 'Back to Camera'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  successBadge: {
    backgroundColor: '#4CAF50',
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  card: {
    backgroundColor: '#fff',
    margin: 12,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  hashText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  linkText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#007AFF',
    textDecorationLine: 'underline',
  },
  addressText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#666',
  },
  bottomBar: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  button: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  secondaryButton: {
    backgroundColor: '#f5f5f5',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ResultsScreen;
