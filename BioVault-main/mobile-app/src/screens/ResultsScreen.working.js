import React, {useState} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/ApiService';

// Utility: convert a string to base64 (for IPFS upload)
function stringToBase64(str) {
  const { Buffer } = require('buffer');
  return Buffer.from(str, 'utf-8').toString('base64');
}

export default function ResultsScreen({navigation, route}) {
  const [isAnchoring, setIsAnchoring] = useState(false);
  const [anchorStatus, setAnchorStatus] = useState(null);
  const [anchorResult, setAnchorResult] = useState(null);
  const [ipfsResult, setIpfsResult] = useState(null);

  const data = route?.params || {};
  const {
    bpm = 72,
    confidence = 85,
    duration = 30,
    facesDetected = 1,
    framesProcessed = 0,
    statistics = {},
    videoHash = '',
    bioSignature = '',
    hardwareDNA = '',
    proofOfRealityHash = '',
    mediaFilePath = null,
  } = data;

  // Use the real parameters or fallback to defaults
  const averageBPM = bpm || data.averageBPM || 72;
  const confidenceScore = confidence || 85;
  const recordingDuration = duration || 30;
  const faceCount = facesDetected || data.faceCount || 1;

  const anchorToBlockchain = async () => {
    setIsAnchoring(true);
    try {
      // Step 1: Upload Proof of Reality metadata to IPFS
      const proofOfRealityJSON = {
        bpm: averageBPM,
        confidence: confidenceScore,
        duration: recordingDuration,
        facesDetected: faceCount,
        framesProcessed,
        statistics,
        hardwareDNA,
        timestamp: Date.now(),
      };
      const proofData = stringToBase64(JSON.stringify(proofOfRealityJSON));

      let proofIPFSCID = '';
      let mediaIPFSCID = '';
      try {
        const ipfsUpload = await apiService.uploadToIPFS({
          data: proofData,
          filename: 'proof_of_reality.json',
          metadata: proofOfRealityJSON,
        });
        proofIPFSCID = ipfsUpload.cid || '';
        mediaIPFSCID = ipfsUpload.metadataCID || proofIPFSCID;
        setIpfsResult(ipfsUpload);
      } catch (ipfsError) {
        console.warn('IPFS upload failed, continuing without:', ipfsError.message);
        // Continue anchoring even if IPFS is down — hash is still on-chain
      }

      // Step 2: Anchor to blockchain via backend
      const result = await apiService.anchorMedia({
        mediaHash: videoHash || proofOfRealityHash || 'no-hash',
        bioSignature: bioSignature || `bpm:${averageBPM}:conf:${confidenceScore}`,
        hardwareID: hardwareDNA || 'unknown',
        consensusParties: [], // Solo recording — no multi-party consent
        ipfsHash: mediaIPFSCID || proofIPFSCID || '',
        proofOfRealityHash: proofOfRealityHash || '',
        proofOfRealityIPFS: proofIPFSCID || '',
        allUniqueSignals: true,
        detectedFaces: faceCount,
      });

      setAnchorResult(result);
      setAnchorStatus('success');

      // Step 3: Save to local storage for "My Media" screen
      try {
        const existing = await AsyncStorage.getItem('biovault_anchored_media');
        const mediaList = existing ? JSON.parse(existing) : [];
        mediaList.unshift({
          mediaHash: videoHash || proofOfRealityHash,
          txHash: result.transactionHash,
          blockNumber: result.blockNumber,
          ipfsCID: mediaIPFSCID || proofIPFSCID,
          bpm: averageBPM,
          confidence: confidenceScore,
          timestamp: Date.now(),
          facesDetected: faceCount,
        });
        await AsyncStorage.setItem('biovault_anchored_media', JSON.stringify(mediaList));
      } catch (storageError) {
        console.warn('Failed to save to storage:', storageError.message);
      }

      Alert.alert(
        'Blockchain Anchored',
        `Transaction confirmed on Polygon Amoy!\n\n` +
        `Tx: ${result.transactionHash.slice(0, 18)}...\n` +
        `Block: ${result.blockNumber}\n` +
        `Gas: ${result.gasUsed}\n` +
        (proofIPFSCID ? `\nIPFS: ${proofIPFSCID}` : ''),
        [{text: 'OK'}]
      );

    } catch (error) {
      setAnchorStatus('error');
      Alert.alert(
        'Anchoring Failed',
        `Could not anchor to blockchain:\n\n${error.message}\n\nMake sure the backend server is running.`,
        [{text: 'OK'}]
      );
    } finally {
      setIsAnchoring(false);
    }
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
              {confidenceScore}%
            </Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Recording Duration</Text>
            <Text style={styles.metricValue}>{recordingDuration}s</Text>
          </View>

          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Faces Detected</Text>
            <Text style={styles.metricValue}>{faceCount}</Text>
          </View>
          
          {framesProcessed > 0 && (
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Frames Processed</Text>
              <Text style={styles.metricValue}>{framesProcessed}</Text>
            </View>
          )}
          
          {statistics && statistics.stdDev && (
            <View style={styles.metricRow}>
              <Text style={styles.metricLabel}>Variability (σ)</Text>
              <Text style={styles.metricValue}>{statistics.stdDev}</Text>
            </View>
          )}
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
                  {isAnchoring ? 'Uploading to IPFS & anchoring...' : 'Anchor to Blockchain'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : anchorStatus === 'success' ? (
            <View>
              <View style={styles.anchorSuccess}>
                <Text style={styles.anchorSuccessIcon}>&#x2713;</Text>
                <Text style={styles.anchorSuccessText}>
                  Anchored on Polygon Amoy
                </Text>
              </View>
              {anchorResult && (
                <View style={{marginTop: 12}}>
                  <Text style={styles.signatureLabel}>Transaction Hash</Text>
                  <Text style={styles.signatureValue} numberOfLines={1}>
                    {anchorResult.transactionHash}
                  </Text>
                  <Text style={[styles.signatureLabel, {marginTop: 8}]}>Block Number</Text>
                  <Text style={styles.signatureValue}>
                    {anchorResult.blockNumber}
                  </Text>
                  {ipfsResult && ipfsResult.cid && (
                    <View style={{marginTop: 8}}>
                      <Text style={styles.signatureLabel}>IPFS CID</Text>
                      <Text style={styles.signatureValue} numberOfLines={1}>
                        {ipfsResult.cid}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          ) : (
            <View>
              <Text style={[styles.infoText, {color: '#ef4444'}]}>
                Anchoring failed. Check that the backend server is running.
              </Text>
              <TouchableOpacity
                style={styles.anchorButton}
                onPress={() => { setAnchorStatus(null); }}>
                <Text style={styles.anchorButtonText}>Retry</Text>
              </TouchableOpacity>
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
