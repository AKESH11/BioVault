import React, {useState, useEffect, useCallback} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/ApiService';

export default function MediaLibraryScreen({navigation}) {
  const [mediaList, setMediaList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadMedia();
  }, []);

  const loadMedia = async () => {
    try {
      const stored = await AsyncStorage.getItem('biovault_anchored_media');
      if (stored) {
        setMediaList(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load media:', error);
    } finally {
      setLoading(false);
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMedia();
    setRefreshing(false);
  }, []);

  const verifyOnChain = async (item) => {
    try {
      const result = await apiService.verifyMedia(item.mediaHash);
      Alert.alert(
        'On-Chain Verification',
        `Media Hash: ${item.mediaHash.slice(0, 20)}...\n\n` +
        `Exists: ${result.exists ? 'Yes' : 'No'}\n` +
        `Valid: ${result.isValid ? 'Yes' : 'No'}\n` +
        `Anchored: ${result.date || 'N/A'}`,
        [{text: 'OK'}]
      );
    } catch (error) {
      Alert.alert('Verification Failed', error.message, [{text: 'OK'}]);
    }
  };

  const viewDetails = async (item) => {
    try {
      const record = await apiService.getMediaRecord(item.mediaHash);
      Alert.alert(
        'Media Record',
        `Creator: ${record.creator}\n\n` +
        `Bio-Signature: ${record.bioSignature?.slice(0, 30)}...\n` +
        `Hardware ID: ${record.hardwareID?.slice(0, 20)}...\n` +
        `IPFS: ${record.ipfsHash || 'N/A'}\n` +
        `Status: ${['Pending', 'Verified', 'Disputed', 'Revoked'][record.status] || record.status}\n` +
        `Faces: ${record.detectedFaces || 'N/A'}\n` +
        `Unique Signals: ${record.allUniqueSignals ? 'Yes' : 'No'}`,
        [{text: 'OK'}]
      );
    } catch (error) {
      Alert.alert('Error', `Could not fetch record: ${error.message}`, [{text: 'OK'}]);
    }
  };

  const formatDate = (timestamp) => {
    const d = new Date(timestamp);
    return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}`;
  };

  const clearHistory = () => {
    Alert.alert(
      'Clear History',
      'Remove all locally stored media records? On-chain data is permanent.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('biovault_anchored_media');
            setMediaList([]);
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>&#x2190;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Media</Text>
        {mediaList.length > 0 && (
          <TouchableOpacity onPress={clearHistory}>
            <Text style={styles.clearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {loading ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Loading...</Text>
          </View>
        ) : mediaList.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Anchored Media</Text>
            <Text style={styles.emptyText}>
              Record video with bio-authentication and anchor it to the blockchain to see it here.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('Camera')}>
              <Text style={styles.primaryButtonText}>Record Now</Text>
            </TouchableOpacity>
          </View>
        ) : (
          mediaList.map((item, index) => (
            <View key={index} style={styles.mediaCard}>
              <View style={styles.mediaHeader}>
                <Text style={styles.mediaDate}>{formatDate(item.timestamp)}</Text>
                <View style={styles.verifiedBadge}>
                  <Text style={styles.verifiedText}>On-Chain</Text>
                </View>
              </View>

              <View style={styles.mediaRow}>
                <Text style={styles.mediaLabel}>BPM</Text>
                <Text style={styles.mediaValue}>{item.bpm} BPM ({item.confidence}%)</Text>
              </View>

              <View style={styles.mediaRow}>
                <Text style={styles.mediaLabel}>Tx Hash</Text>
                <Text style={styles.mediaValueMono} numberOfLines={1}>
                  {item.txHash}
                </Text>
              </View>

              <View style={styles.mediaRow}>
                <Text style={styles.mediaLabel}>Block</Text>
                <Text style={styles.mediaValue}>{item.blockNumber}</Text>
              </View>

              {item.ipfsCID ? (
                <View style={styles.mediaRow}>
                  <Text style={styles.mediaLabel}>IPFS</Text>
                  <Text style={styles.mediaValueMono} numberOfLines={1}>{item.ipfsCID}</Text>
                </View>
              ) : null}

              <View style={styles.mediaActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => verifyOnChain(item)}>
                  <Text style={styles.actionBtnText}>Verify</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => viewDetails(item)}>
                  <Text style={styles.actionBtnText}>Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
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
  clearText: { color: '#ef4444', fontSize: 14, fontWeight: '600' },
  content: { flex: 1 },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '600', color: '#ffffff', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#8b8ba7', textAlign: 'center', marginBottom: 24 },
  primaryButton: {
    backgroundColor: '#6366f1', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8,
  },
  primaryButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  mediaCard: {
    margin: 16, marginBottom: 0, padding: 16, backgroundColor: '#1a1a3e',
    borderRadius: 12, borderWidth: 1, borderColor: '#2d2d5f',
  },
  mediaHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  mediaDate: { color: '#8b8ba7', fontSize: 13 },
  verifiedBadge: {
    backgroundColor: '#10b98120', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4,
  },
  verifiedText: { color: '#10b981', fontSize: 11, fontWeight: '600' },
  mediaRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: '#2d2d5f',
  },
  mediaLabel: { color: '#8b8ba7', fontSize: 13 },
  mediaValue: { color: '#ffffff', fontSize: 13, fontWeight: '500' },
  mediaValueMono: { color: '#ffffff', fontSize: 11, fontFamily: 'monospace', flex: 1, textAlign: 'right', marginLeft: 12 },
  mediaActions: {
    flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#0f0f23',
    borderRadius: 6, borderWidth: 1, borderColor: '#6366f1',
  },
  actionBtnText: { color: '#6366f1', fontSize: 13, fontWeight: '600' },
});
