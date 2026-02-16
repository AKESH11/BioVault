import React, {useState} from 'react';
import {View, Text, StyleSheet, TextInput, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Clipboard} from 'react-native';
import apiService from '../services/ApiService';

export default function VerifyScreen({navigation}) {
  const [mediaHash, setMediaHash] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isZkpVerifying, setIsZkpVerifying] = useState(false);
  const [result, setResult] = useState(null);
  const [record, setRecord] = useState(null);
  const [zkpResult, setZkpResult] = useState(null);

  const verify = async () => {
    const trimmed = mediaHash.trim();
    if (!trimmed) {
      Alert.alert('Input Required', 'Enter or paste a media hash to verify.');
      return;
    }

    // Basic input validation: hex hash should be 64 chars (SHA-256/BLAKE3)
    // or 66 chars with 0x prefix
    const cleaned = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
    if (!/^[a-fA-F0-9]+$/.test(cleaned)) {
      Alert.alert('Invalid Hash', 'The hash should be a hexadecimal string.');
      return;
    }

    setIsVerifying(true);
    setResult(null);
    setRecord(null);
    setZkpResult(null);

    try {
      // Step 1: Quick verification check — uses smart fallback (backend → direct RPC)
      const verifyResult = await apiService.smartVerifyMedia(trimmed);
      setResult(verifyResult);

      // Step 2: If exists, fetch full record
      if (verifyResult.exists) {
        try {
          const fullRecord = await apiService.smartGetMediaRecord(trimmed);
          setRecord(fullRecord);
        } catch (recordError) {
          console.warn('Could not fetch full record:', recordError.message);
        }
      }
    } catch (error) {
      Alert.alert('Verification Error', error.message, [{text: 'OK'}]);
    } finally {
      setIsVerifying(false);
    }
  };

  const verifyWithZKP = async () => {
    if (!record || !record.bioSignature) {
      Alert.alert('Not Available', 'No bio-signature found for ZKP verification.');
      return;
    }
    setIsZkpVerifying(true);
    setZkpResult(null);
    try {
      // Generate a ZK proof that the bio-signature matches without revealing it
      const proofResult = await apiService.generateProof(
        {
          bioSignature: record.bioSignature,
          mediaHash: mediaHash.trim(),
          hardwareID: record.hardwareID || '',
        },
        'bio_match',
      );

      if (proofResult.proof) {
        // Verify the generated proof
        const verifyResult = await apiService.verifyProof(
          proofResult.proof,
          proofResult.publicSignals,
          'verify',
        );
        setZkpResult({
          proofGenerated: true,
          verified: verifyResult.valid || verifyResult.verified,
          proof: proofResult.proof,
        });
      } else {
        setZkpResult({ proofGenerated: false, error: 'Proof generation failed' });
      }
    } catch (error) {
      setZkpResult({ proofGenerated: false, error: error.message });
    } finally {
      setIsZkpVerifying(false);
    }
  };

  const copyToClipboard = (text, label) => {
    if (Clipboard && Clipboard.setString) {
      Clipboard.setString(text);
      Alert.alert('Copied', `${label} copied to clipboard.`);
    }
  };

  const getStatusLabel = (status) => {
    const labels = ['Pending', 'Verified', 'Disputed', 'Revoked'];
    return labels[status] || `Unknown (${status})`;
  };

  const getStatusColor = (status) => {
    const colors = ['#f59e0b', '#10b981', '#ef4444', '#6b7280'];
    return colors[status] || '#8b8ba7';
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>&#x2190;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Media</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Enter Media Hash</Text>
          <Text style={styles.description}>
            Paste a media hash to check its authenticity on the Polygon blockchain.
          </Text>
          <TextInput
            style={styles.input}
            value={mediaHash}
            onChangeText={setMediaHash}
            placeholder="0x... or BLAKE3 hash"
            placeholderTextColor="#4a4a6a"
            autoCapitalize="none"
            autoCorrect={false}
            multiline={false}
          />
          <TouchableOpacity
            style={[styles.verifyButton, isVerifying && styles.verifyButtonDisabled]}
            onPress={verify}
            disabled={isVerifying}>
            {isVerifying ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.verifyButtonText}>Verify on Blockchain</Text>
            )}
          </TouchableOpacity>
        </View>

        {result && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Verification Result</Text>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Found on Chain</Text>
              <Text style={[styles.resultValue, {color: result.exists ? '#10b981' : '#ef4444'}]}>
                {result.exists ? 'Yes' : 'No'}
              </Text>
            </View>

            {result.exists && (
              <>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Valid</Text>
                  <Text style={[styles.resultValue, {color: result.isValid ? '#10b981' : '#ef4444'}]}>
                    {result.isValid ? 'Authentic' : 'Invalid'}
                  </Text>
                </View>

                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Anchored At</Text>
                  <Text style={styles.resultValue}>
                    {result.date ? new Date(result.date).toLocaleString() : 'N/A'}
                  </Text>
                </View>
              </>
            )}

            {!result.exists && (
              <Text style={styles.notFoundText}>
                This media hash was not found on the Polygon Amoy blockchain. 
                It may not have been anchored, or the hash may be incorrect.
              </Text>
            )}
          </View>
        )}

        {record && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Provenance Record</Text>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Status</Text>
              <Text style={[styles.resultValue, {color: getStatusColor(record.status)}]}>
                {getStatusLabel(record.status)}
              </Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Creator</Text>
              <Text style={styles.resultValueMono} numberOfLines={1}>{record.creator}</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Bio-Signature</Text>
              <Text style={styles.resultValueMono} numberOfLines={1}>{record.bioSignature}</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Hardware ID</Text>
              <Text style={styles.resultValueMono} numberOfLines={1}>{record.hardwareID}</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Faces Detected</Text>
              <Text style={styles.resultValue}>{record.detectedFaces || 'N/A'}</Text>
            </View>

            <View style={styles.resultRow}>
              <Text style={styles.resultLabel}>Unique Signals</Text>
              <Text style={[styles.resultValue, {color: record.allUniqueSignals ? '#10b981' : '#f59e0b'}]}>
                {record.allUniqueSignals ? 'Yes' : 'No'}
              </Text>
            </View>

            {record.ipfsHash ? (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>IPFS</Text>
                <Text style={styles.resultValueMono} numberOfLines={1}>{record.ipfsHash}</Text>
              </View>
            ) : null}

            {record.proofOfRealityHash ? (
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Reality Hash</Text>
                <Text style={styles.resultValueMono} numberOfLines={1}>{record.proofOfRealityHash}</Text>
              </View>
            ) : null}

            {record.consensusParties && record.consensusParties.length > 0 && (
              <View style={{marginTop: 12}}>
                <Text style={styles.resultLabel}>Consensus Parties ({record.consensusParties.length})</Text>
                {record.consensusParties.map((addr, i) => (
                  <Text key={i} style={[styles.resultValueMono, {marginTop: 4}]} numberOfLines={1}>
                    {addr}
                  </Text>
                ))}
              </View>
            )}

            {record.isRevoked && (
              <View style={styles.revokedBanner}>
                <Text style={styles.revokedText}>This media has been revoked by its creator</Text>
              </View>
            )}

            {/* Copy hash to clipboard */}
            <TouchableOpacity
              style={[styles.verifyButton, {marginTop: 16, backgroundColor: '#1e1e3f'}]}
              onPress={() => copyToClipboard(mediaHash.trim(), 'Media Hash')}>
              <Text style={[styles.verifyButtonText, {color: '#6366f1'}]}>Copy Hash</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ZKP Verification */}
        {record && record.bioSignature && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Zero-Knowledge Proof</Text>
            <Text style={styles.description}>
              Verify the bio-signature cryptographically without revealing sensitive biometric data.
            </Text>

            <TouchableOpacity
              style={[styles.verifyButton, isZkpVerifying && styles.verifyButtonDisabled, {backgroundColor: '#8b5cf6'}]}
              onPress={verifyWithZKP}
              disabled={isZkpVerifying}>
              {isZkpVerifying ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.verifyButtonText}>Verify with ZKP</Text>
              )}
            </TouchableOpacity>

            {zkpResult && (
              <View style={{marginTop: 16}}>
                <View style={styles.resultRow}>
                  <Text style={styles.resultLabel}>Proof Generated</Text>
                  <Text style={[styles.resultValue, {color: zkpResult.proofGenerated ? '#10b981' : '#ef4444'}]}>
                    {zkpResult.proofGenerated ? 'Yes' : 'No'}
                  </Text>
                </View>
                {zkpResult.proofGenerated && (
                  <View style={styles.resultRow}>
                    <Text style={styles.resultLabel}>ZKP Verified</Text>
                    <Text style={[styles.resultValue, {color: zkpResult.verified ? '#10b981' : '#ef4444'}]}>
                      {zkpResult.verified ? 'Valid' : 'Invalid'}
                    </Text>
                  </View>
                )}
                {zkpResult.error && (
                  <Text style={[styles.description, {color: '#ef4444', marginTop: 8}]}>
                    {zkpResult.error}
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23' },
  header: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e3f',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  backButtonText: { color: '#ffffff', fontSize: 28 },
  headerTitle: { flex: 1, color: '#ffffff', fontSize: 20, fontWeight: '600', marginLeft: 8 },
  content: { flex: 1 },
  card: {
    margin: 16, marginBottom: 0, padding: 20, backgroundColor: '#1a1a3e',
    borderRadius: 16, borderWidth: 1, borderColor: '#2d2d5f',
  },
  cardTitle: { fontSize: 18, fontWeight: '600', color: '#ffffff', marginBottom: 12 },
  description: { fontSize: 14, color: '#8b8ba7', marginBottom: 16, lineHeight: 20 },
  input: {
    backgroundColor: '#0f0f23', borderWidth: 1, borderColor: '#2d2d5f', borderRadius: 8,
    padding: 14, color: '#ffffff', fontFamily: 'monospace', fontSize: 13, marginBottom: 16,
  },
  verifyButton: {
    backgroundColor: '#6366f1', padding: 16, borderRadius: 12, alignItems: 'center',
  },
  verifyButtonDisabled: { opacity: 0.6 },
  verifyButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  resultRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#2d2d5f',
  },
  resultLabel: { fontSize: 13, color: '#8b8ba7' },
  resultValue: { fontSize: 14, fontWeight: '600', color: '#ffffff' },
  resultValueMono: {
    fontSize: 11, fontFamily: 'monospace', color: '#ffffff', flex: 1,
    textAlign: 'right', marginLeft: 12,
  },
  notFoundText: {
    fontSize: 14, color: '#8b8ba7', marginTop: 12, lineHeight: 20,
  },
  revokedBanner: {
    marginTop: 16, padding: 12, backgroundColor: '#ef444420', borderRadius: 8,
    borderWidth: 1, borderColor: '#ef4444',
  },
  revokedText: { color: '#ef4444', fontSize: 14, fontWeight: '600', textAlign: 'center' },
});
