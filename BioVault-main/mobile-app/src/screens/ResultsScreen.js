import React, {useState, useRef} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Share, Clipboard} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/ApiService';
import anchorQueue from '../services/AnchorQueue';
import RNFS from 'react-native-fs';

// Utility: convert a string to base64 (for IPFS upload)
function stringToBase64(str) {
  const { Buffer } = require('buffer');
  return Buffer.from(str, 'utf-8').toString('base64');
}

/**
 * Retry a function up to maxRetries times with exponential backoff.
 */
async function withRetry(fn, maxRetries = 3, baseDelayMs = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
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
    console.log('[BioVault] Anchor button tapped — starting anchor flow');
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
        // Upload proof-of-reality metadata to IPFS (with retry)
        const ipfsUpload = await withRetry(
          () => apiService.uploadToIPFS({
            data: proofData,
            filename: 'proof_of_reality.json',
            metadata: proofOfRealityJSON,
          }),
          2, // 2 retries (3 total attempts)
          1500,
        );
        proofIPFSCID = ipfsUpload.cid || '';
        mediaIPFSCID = ipfsUpload.metadataCID || proofIPFSCID;

        // If we have a saved media file on disk, also upload it
        if (mediaFilePath) {
          try {
            const fileExists = await RNFS.exists(mediaFilePath);
            if (fileExists) {
              const fileContent = await RNFS.readFile(mediaFilePath, 'utf8');
              const fileBase64 = stringToBase64(fileContent);
              const mediaUpload = await apiService.uploadToIPFS({
                data: fileBase64,
                filename: 'recording_data.json',
                metadata: { type: 'biovault_recording', proof: proofIPFSCID },
              });
              if (mediaUpload.cid) {
                mediaIPFSCID = mediaUpload.cid;
              }
            }
          } catch (fileErr) {
            console.warn('Media file IPFS upload failed:', fileErr.message);
          }
        }

        setIpfsResult(ipfsUpload);
      } catch (ipfsError) {
        console.warn('IPFS upload failed, continuing without:', ipfsError.message);
        // Continue anchoring even if IPFS is down — hash is still on-chain
      }

      // Step 2: Compute a deterministic media hash if none was provided
      // The hash must be unique per recording for the on-chain anchor
      // Reject: empty, all-zeros, or non-hex strings (e.g. native module error messages)
      const isInvalidHash = (h) => !h || /^(0x)?0+$/.test(h) || !/^(0x)?[0-9a-fA-F]{8,}$/.test(h);
      let effectiveHash = (!isInvalidHash(videoHash) && videoHash) || (!isInvalidHash(proofOfRealityHash) && proofOfRealityHash);
      console.log('[BioVault] Hash check: videoHash invalid?', isInvalidHash(videoHash), 'proofHash invalid?', isInvalidHash(proofOfRealityHash), 'effectiveHash:', effectiveHash ? effectiveHash.slice(0, 20) + '...' : 'NONE (will SHA-256)');
      if (!effectiveHash) {
        // Deterministic fallback: SHA-256 of proof-of-reality data
        // Uses crypto-js (React Native compatible) — NOT Node.js crypto
        const CryptoJS = require('crypto-js');
        const hashInput = JSON.stringify(proofOfRealityJSON);
        effectiveHash = CryptoJS.SHA256(hashInput).toString(CryptoJS.enc.Hex);
        console.log('[BioVault] Generated SHA-256 fallback hash:', effectiveHash.slice(0, 20) + '...');
      }

      // Step 3: Anchor to blockchain via backend (with retry)
      let result;
      try {
        result = await withRetry(
          () => apiService.anchorMedia({
            mediaHash: effectiveHash,
            bioSignature: bioSignature || `bpm:${averageBPM}:conf:${confidenceScore}`,
            hardwareID: hardwareDNA || 'unknown-device',
            consensusParties: [], // Solo recording — no multi-party consent
            ipfsHash: mediaIPFSCID || proofIPFSCID || '',
            proofOfRealityHash: proofOfRealityHash || '',
            proofOfRealityIPFS: proofIPFSCID || '',
            allUniqueSignals: true,
            detectedFaces: faceCount,
          }),
          2, // 2 retries
          2000,
        );
      } catch (anchorErr) {
        console.log('[BioVault] Anchor call error:', anchorErr.message);
        // 409 = already anchored — treat as success (media IS on-chain)
        if (anchorErr.message && anchorErr.message.includes('already anchored')) {
          result = { success: true, alreadyAnchored: true, mediaHash: effectiveHash };
        } else {
          throw anchorErr; // re-throw for the outer catch to handle
        }
      }

      console.log('[BioVault] Anchor result:', JSON.stringify({ success: result?.success, alreadyAnchored: result?.alreadyAnchored, tx: result?.transactionHash?.slice(0, 18) }));
      setAnchorResult(result);
      setAnchorStatus('success');

      // Step 4: Save to local storage for "My Media" screen
      try {
        const existing = await AsyncStorage.getItem('biovault_anchored_media');
        const mediaList = existing ? JSON.parse(existing) : [];
        mediaList.unshift({
          mediaHash: effectiveHash,
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
        result.alreadyAnchored ? 'Already On-Chain' : 'Blockchain Anchored',
        result.alreadyAnchored
          ? `This media is already anchored on-chain.\n\nHash: ${effectiveHash.slice(0, 20)}...`
          : `Transaction confirmed on Polygon Amoy!\n\n` +
            `Tx: ${result.transactionHash.slice(0, 18)}...\n` +
            `Block: ${result.blockNumber}\n` +
            `Gas: ${result.gasUsed}\n` +
            (proofIPFSCID ? `\nIPFS: ${proofIPFSCID}` : ''),
        [{text: 'OK'}]
      );

    } catch (error) {
      setAnchorStatus('error');

      // Enqueue for offline retry
      const isInvalidHash = (h) => !h || /^(0x)?0+$/.test(h) || !/^(0x)?[0-9a-fA-F]{8,}$/.test(h);
      const CryptoJS = require('crypto-js');
      const fallbackHash = CryptoJS.SHA256(JSON.stringify({
        bpm: averageBPM, confidence: confidenceScore, duration: recordingDuration,
        facesDetected: faceCount, timestamp: Date.now(),
      })).toString(CryptoJS.enc.Hex);
      const anchorPayload = {
        mediaHash: (!isInvalidHash(videoHash) && videoHash) || (!isInvalidHash(proofOfRealityHash) && proofOfRealityHash) || fallbackHash,
        bioSignature: bioSignature || `bpm:${averageBPM}:conf:${confidenceScore}`,
        hardwareID: hardwareDNA || 'unknown-device',
        consensusParties: [],
        ipfsHash: '',
        proofOfRealityHash: proofOfRealityHash || '',
        proofOfRealityIPFS: '',
        allUniqueSignals: true,
        detectedFaces: faceCount,
      };
      try {
        const queueCount = await anchorQueue.enqueue(anchorPayload, {
          bpm: averageBPM,
          confidence: confidenceScore,
        });
        Alert.alert(
          'Saved to Offline Queue',
          `Could not anchor now:\n${error.message}\n\nYour recording has been queued and will anchor automatically when the server is reachable.\n\n${queueCount} item(s) in queue.`,
          [{text: 'OK'}]
        );
      } catch (queueError) {
        Alert.alert(
          'Anchoring Failed',
          `Could not anchor to blockchain:\n\n${error.message}\n\nMake sure the backend server is running.`,
          [{text: 'OK'}]
        );
      }
    } finally {
      setIsAnchoring(false);
    }
  };

  const shareResults = async () => {
    const shareText =
      `BioVault Proof of Reality\n\n` +
      `Video Hash: ${videoHash || 'N/A'}\n` +
      `Bio-Signature: ${bioSignature || 'N/A'}\n` +
      `Hardware DNA: ${hardwareDNA || 'N/A'}\n` +
      `BPM: ${averageBPM} (${confidenceScore}% confidence)\n` +
      (anchorResult
        ? `\nBlockchain Tx: ${anchorResult.transactionHash}\nBlock: ${anchorResult.blockNumber}\n`
        : '') +
      (ipfsResult?.cid ? `IPFS CID: ${ipfsResult.cid}\n` : '') +
      `\nVerify at: https://amoy.polygonscan.com/`;

    try {
      await Share.share({
        message: shareText,
        title: 'BioVault Proof of Reality',
      });
    } catch (error) {
      // Fallback: copy to clipboard
      if (Clipboard && Clipboard.setString) {
        Clipboard.setString(shareText);
        Alert.alert('Copied', 'Results copied to clipboard.');
      }
    }
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
