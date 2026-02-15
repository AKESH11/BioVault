import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  PermissionsAndroid,
  Platform,
  NativeModules,
  NativeEventEmitter,
} from 'react-native';
import {BioVaultCameraView} from '../components/BioVaultCameraView';
import RNFS from 'react-native-fs';

const {BioVaultModule} = NativeModules;

// Directory for BioVault media files
const MEDIA_DIR = RNFS.DocumentDirectoryPath + '/biovault/media';

export default function CameraScreen({navigation}) {
  const [isRecording, setIsRecording] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [facesDetected, setFacesDetected] = useState(0);
  const [duration, setDuration] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [faceBox, setFaceBox] = useState(null);
  
  const cameraRef = useRef(null);
  const startTimeRef = useRef(null);
  const recordingDataRef = useRef({
    frames: [],
    bpmReadings: [],
    startTime: null
  });

  // BLE multi-party consent
  const [consentEnabled, setConsentEnabled] = useState(false);
  const [consentResult, setConsentResult] = useState(null);
  const consentResultRef = useRef(null);

  useEffect(() => {
    let sub;
    try {
      if (BioVaultModule) {
        const emitter = new NativeEventEmitter(NativeModules.BioVaultModule);
        sub = emitter.addListener('onConsensusUpdate', (event) => {
          setConsentResult(event);
          consentResultRef.current = event;
          if (event.complete) {
            Alert.alert('Consent', `Multi-party consent received (${event.signaturesReceived} sigs).`);
          } else if (event.timeout) {
            Alert.alert('Consent Timeout', `Received ${event.receivedCount}/${event.expectedCount} consent signatures.`);
          }
        });
      }
    } catch (_) {}
    return () => { if (sub) sub.remove(); };
  }, []);

  useEffect(() => {
    requestCameraPermission();
    initializeNativeModule();
  }, []);

  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
        
        if (elapsed >= 30) {
          stopRecording();
        }
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  const requestCameraPermission = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'BioVault needs camera access for bio-authentication',
            buttonPositive: 'OK',
          }
        );
        setHasPermission(granted === PermissionsAndroid.RESULTS.GRANTED);
      } catch (err) {
        console.warn(err);
        setHasPermission(false);
      }
    } else {
      setHasPermission(true);
    }
  };

  const initializeNativeModule = async () => {
    try {
      if (BioVaultModule && BioVaultModule.initializeCamera) {
        await BioVaultModule.initializeCamera('');
        console.log('Native camera initialized');
      }
      // Start PRNU capture as soon as camera is ready
      if (BioVaultModule && BioVaultModule.startPRNUCapture) {
        await BioVaultModule.startPRNUCapture();
        console.log('[BioVault] PRNU capture started');
      }
    } catch (error) {
      console.error('Failed to initialize camera:', error);
    }
  };

  const onFrameProcessed = (event) => {
    if (!isRecording) return;
    
    const {bpm: newBpm, confidence: newConf, faces} = event.nativeEvent;
    
    if (newBpm > 0 && newBpm < 200) {
      setBpm(Math.round(newBpm));
      recordingDataRef.current.bpmReadings.push(newBpm);
    }
    
    if (newConf !== undefined) {
      setConfidence(Math.round(newConf * 100));
    }
    
    if (faces !== undefined) {
      setFacesDetected(faces);
    }
    
    recordingDataRef.current.frames.push({
      timestamp: Date.now(),
      bpm: newBpm,
      confidence: newConf,
    });
  };

  const startRecording = async () => {
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Camera permission is required.');
      return;
    }
    
    try {
      setIsRecording(true);
      startTimeRef.current = Date.now();
      recordingDataRef.current = {
        frames: [],
        bpmReadings: [],
        startTime: Date.now()
      };
      
      // Start rPPG session in native code
      try {
        if (BioVaultModule && BioVaultModule.startRPPGExtraction) {
          const success = await BioVaultModule.startRPPGExtraction();
          console.log('[BioVault] rPPG extraction started:', success);
        }
      } catch (error) {
        console.error('[BioVault] Failed to start rPPG:', error);
      }
      
      // Fallback: if no real rPPG data arrives within 15 seconds, warn user.
      // We do NOT simulate BPM — the recording continues and will simply have
      // fewer BPM samples.  The "Recording Failed" alert fires on stop if
      // bpmReadings is still empty.
      const fallbackTimerId = setTimeout(() => {
        if (recordingDataRef.current.bpmReadings.length === 0) {
          console.warn('[BioVault] 15s elapsed with no native rPPG data — rPPG may not be working');
        }
      }, 15000);
      
      recordingDataRef.current.fallbackTimerId = fallbackTimerId;

      // If BLE consent is enabled, start a consensus session
      if (consentEnabled && facesDetected > 1) {
        try {
          const sessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          await BioVaultModule.startConsensusSession(sessionId, facesDetected, bpm || 0);
          console.log('[BioVault] BLE consensus session started:', sessionId);
        } catch (bleErr) {
          console.warn('[BioVault] BLE consent start failed:', bleErr.message);
        }
      }
      
    } catch (error) {
      console.error('[BioVault] Error starting recording:', error);
      Alert.alert('Recording Error', 'Failed to start recording: ' + error.message);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false);
    
    // Clear fallback timer if it exists
    if (recordingDataRef.current.fallbackTimerId) {
      clearTimeout(recordingDataRef.current.fallbackTimerId);
    }
    
    // Clear simulation interval
    if (recordingDataRef.current.intervalId) {
      clearInterval(recordingDataRef.current.intervalId);
    }
    
    // Stop rPPG session
    try {
      if (BioVaultModule && BioVaultModule.stopRPPGExtraction) {
        const result = await BioVaultModule.stopRPPGExtraction();
        console.log('[BioVault] rPPG extraction stopped:', result);
      }
    } catch (error) {
      console.error('[BioVault] Failed to stop rPPG:', error);
      // Continue anyway
    }

    // Stop BLE consensus session
    try {
      if (BioVaultModule && BioVaultModule.stopConsensusSession) {
        await BioVaultModule.stopConsensusSession();
      }
    } catch (_bleErr) {}
    
    const {bpmReadings, frames} = recordingDataRef.current;
    
    if (bpmReadings.length === 0) {
      Alert.alert(
        'Recording Failed',
        'No valid heart rate data detected. Please ensure good lighting and remain still.',
        [{text: 'OK'}]
      );
      return;
    }
    
    const avgBpm = bpmReadings.reduce((a, b) => a + b, 0) / bpmReadings.length;
    const minBpm = Math.min(...bpmReadings);
    const maxBpm = Math.max(...bpmReadings);
    const variance = bpmReadings.reduce((sum, val) => sum + Math.pow(val - avgBpm, 2), 0) / bpmReadings.length;
    const stdDev = Math.sqrt(variance);
    const finalConfidence = Math.max(0, Math.min(100, 100 - (stdDev * 2)));
    
    Alert.alert(
      'Bio-Signature Extracted',
      `Recording complete!\n\nAverage BPM: ${Math.round(avgBpm)}\nConfidence: ${Math.round(finalConfidence)}%`,
      [
        {
          text: 'View Results',
          onPress: async () => {
            // Gather proof-of-reality data from native module
            let videoHash = '';
            let bioSignature = '';
            let hardwareDNA = '';
            let proofOfRealityHash = '';

            try {
              if (BioVaultModule) {
                // Get bio-vault hash (BLAKE3 of frame data + BPM + hardware ID + timestamp)
                if (BioVaultModule.generateProofOfReality) {
                  const proofResult = await BioVaultModule.generateProofOfReality(Math.round(avgBpm));
                  videoHash = proofResult?.videoHash || '';
                  bioSignature = proofResult?.bioSignature || '';
                  hardwareDNA = proofResult?.hardwareID || '';
                  proofOfRealityHash = proofResult?.proofOfRealityHash || '';
                } else {
                  // Fallback: use individual methods if available
                  if (BioVaultModule.getHardwareFingerprint) {
                    hardwareDNA = await BioVaultModule.getHardwareFingerprint();
                  }
                  if (BioVaultModule.getBioSignature) {
                    bioSignature = await BioVaultModule.getBioSignature(Math.round(avgBpm));
                  }
                }
              }
            } catch (nativeError) {
              console.warn('Native proof-of-reality failed:', nativeError.message);
              // Continue with whatever data we have
            }

            // Extract PRNU hardware fingerprint before navigating to Results
            let hardwareFingerprint = '';
            try {
              if (BioVaultModule && BioVaultModule.extractPRNU) {
                const prnuResult = await BioVaultModule.extractPRNU();
                hardwareFingerprint = prnuResult?.fingerprint || prnuResult || '';
                console.log('[BioVault] PRNU fingerprint extracted:', hardwareFingerprint ? 'success' : 'empty');
              }
            } catch (prnuError) {
              console.warn('[BioVault] PRNU extraction failed:', prnuError.message);
            }
            // Use PRNU fingerprint as hardwareDNA if we didn't get one from generateProofOfReality
            if (hardwareFingerprint && !hardwareDNA) {
              hardwareDNA = hardwareFingerprint;
            }

            // Save recording data to disk via RNFS
            let mediaFilePath = '';
            try {
              await RNFS.mkdir(MEDIA_DIR);
              const recordingId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
              const recordingData = {
                id: recordingId,
                timestamp: Date.now(),
                bpm: Math.round(avgBpm),
                confidence: Math.round(finalConfidence),
                duration,
                facesDetected,
                framesProcessed: frames.length,
                statistics: {
                  min: Math.round(minBpm),
                  max: Math.round(maxBpm),
                  stdDev: parseFloat(stdDev.toFixed(2)),
                  readings: bpmReadings.length,
                },
                proofOfReality: {
                  videoHash,
                  bioSignature,
                  hardwareDNA,
                  proofOfRealityHash,
                },
              };
              mediaFilePath = MEDIA_DIR + '/' + recordingId + '.json';
              await RNFS.writeFile(mediaFilePath, JSON.stringify(recordingData, null, 2), 'utf8');
              console.log('[BioVault] Recording saved to:', mediaFilePath);
            } catch (fsError) {
              console.warn('[BioVault] Failed to save recording file:', fsError.message);
              // Non-fatal — continue to Results without file path
            }

            navigation.navigate('Results', {
              bpm: Math.round(avgBpm),
              confidence: Math.round(finalConfidence),
              duration,
              facesDetected,
              framesProcessed: frames.length,
              statistics: {
                min: Math.round(minBpm),
                max: Math.round(maxBpm),
                stdDev: stdDev.toFixed(2),
              },
              videoHash,
              bioSignature,
              hardwareDNA,
              hardwareFingerprint,
              proofOfRealityHash,
              mediaFilePath,
              consentParties: consentResultRef.current
                ? {
                    consensusHash: consentResultRef.current.consensusHash || '',
                    signaturesReceived: consentResultRef.current.signaturesReceived || 0,
                  }
                : null,
            });
          },
        },
      ]
    );
  };

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>📷</Text>
          <Text style={styles.errorTitle}>Camera Permission Required</Text>
          <Text style={styles.errorText}>
            BioVault needs camera access to extract bio-signatures using rPPG.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestCameraPermission}>
            <Text style={styles.permissionButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleCameraReady = () => {
    console.log('[BioVault] Camera is ready!');
    Alert.alert('Camera Ready', 'Native camera initialized successfully!');
  };
  
  const handleCameraError = (event) => {
    console.error('[BioVault] Camera error:', event.nativeEvent.message);
    Alert.alert('Camera Error', event.nativeEvent.message);
  };
  
  const handleFrameAvailable = (event) => {
    if (!isRecording) return;
    
    const {width, height, timestamp, bpm: frameBpm, confidence: frameConfidence, facesDetected: frameFaces} = event.nativeEvent;
    
    // Update UI with native OpenCV results
    if (frameBpm !== undefined && frameBpm > 0 && frameBpm < 200) {
      setBpm(frameBpm);
      recordingDataRef.current.bpmReadings.push(frameBpm);
    }
    
    if (frameConfidence !== undefined) {
      setConfidence(Math.round(frameConfidence * 100));
    }
    
    if (frameFaces !== undefined) {
      setFacesDetected(frameFaces);
    }
    
    // Update face bounding box for overlay
    if (event.nativeEvent.faceBox) {
      setFaceBox(event.nativeEvent.faceBox);
    } else {
      setFaceBox(null);
    }
    
    recordingDataRef.current.frames.push({
      timestamp: timestamp || Date.now(),
      bpm: frameBpm,
      confidence: frameConfidence,
    });
  };
  
  // NOTE: Simulated heart rate fallback was removed for production.
  // All BPM data must come from the real TS-CAN neural rPPG engine
  // to maintain the "Proof of Reality" guarantee.

  console.log('[BioVault] Rendering CameraScreen, hasPermission:', hasPermission);

  return (
    <View style={styles.container}>
      {/* Real Native Camera View */}
      <View style={styles.cameraContainer}>
        {hasPermission ? (
          <BioVaultCameraView
            style={styles.camera}
            active={true}
            onCameraReady={handleCameraReady}
            onCameraError={handleCameraError}
            onFrameAvailable={handleFrameAvailable}
          />
        ) : (
          <View style={styles.mockCamera}>
            <Text style={styles.cameraTitle}>🎥 BioVault Camera</Text>
            <Text style={styles.setupInstructions}>
              Camera permission required{'\n\n'}
              Please grant camera access to continue
            </Text>
          </View>
        )}
      </View>

      {/* Overlay with controls */}
      <View style={styles.overlay}>
        {/* Dynamic Face Rectangle Overlay */}
        {faceBox && (
          <View
            style={[
              styles.faceRectangle,
              {
                left: (faceBox.x / 640) * 100 + '%',
                top: (faceBox.y / 480) * 100 + '%',
                width: (faceBox.width / 640) * 100 + '%',
                height: (faceBox.height / 480) * 100 + '%',
              },
            ]}>
            <View style={styles.faceCornerTL} />
            <View style={styles.faceCornerTR} />
            <View style={styles.faceCornerBL} />
            <View style={styles.faceCornerBR} />
          </View>
        )}
        
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              if (isRecording) {
                Alert.alert('Recording in Progress', 'Please stop recording first.');
              } else {
                navigation.goBack();
              }
            }}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          
          <View style={styles.statusIndicator}>
            <View style={[styles.statusDot, isRecording && styles.statusDotActive]} />
            <Text style={styles.statusText}>
              {isRecording ? 'RECORDING' : 'READY'}
            </Text>
          </View>
          
          {/* Compact BPM Indicator - Top Right */}
          {isRecording && bpm > 0 && (
            <View style={styles.compactBpmContainer}>
              <Text style={styles.compactBpmIcon}>💚</Text>
              <View style={styles.compactBpmInfo}>
                <Text style={styles.compactBpmValue}>{bpm}</Text>
                <Text style={styles.compactBpmUnit}>BPM</Text>
              </View>
              <View style={[
                styles.compactConfidenceIndicator,
                confidence >= 80 ? styles.confidenceHigh : 
                confidence >= 60 ? styles.confidenceMedium : 
                styles.confidenceLow
              ]}>
                <Text style={styles.compactConfidenceText}>{confidence}%</Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.centerArea}>
          {/* Minimal center guidance - no fixed frame */}
          {!isRecording && facesDetected === 0 && (
            <View style={styles.guidanceContainer}>
              <Text style={styles.guidanceIcon}>📸</Text>
              <Text style={styles.guidanceText}>Show your face to camera</Text>
              <Text style={styles.guidanceSubtext}>Rectangle will appear when detected</Text>
            </View>
          )}
          
          {/* Status messages */}
          {facesDetected > 0 && !isRecording && (
            <View style={styles.readyContainer}>
              <Text style={styles.readyIcon}>✓</Text>
              <Text style={styles.readyText}>Ready to record</Text>
            </View>
          )}
          
          {/* Quality indicators during recording */}
          {isRecording && facesDetected === 0 && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningIcon}>⚠️</Text>
              <Text style={styles.warningText}>No face detected - move closer</Text>
            </View>
          )}
          
          {isRecording && confidence < 50 && facesDetected > 0 && (
            <View style={styles.warningContainer}>
              <Text style={styles.warningIcon}>💡</Text>
              <Text style={styles.warningText}>Stay still - improving signal quality...</Text>
            </View>
          )}

          {/* Removed large center BPM - now in top-right corner */}

          {/* Timer */}
          {isRecording && (
            <View style={styles.timerContainer}>
              <Text style={styles.timerIcon}>⏱️</Text>
              <Text style={styles.timerText}>{duration}s / 30s</Text>
            </View>
          )}
        </View>

        <View style={styles.bottomBar}>
          {/* BLE Consent Toggle */}
          {!isRecording && (
            <TouchableOpacity
              style={[styles.consentToggle, consentEnabled && styles.consentToggleActive]}
              onPress={() => setConsentEnabled(!consentEnabled)}>
              <Text style={styles.consentToggleText}>
                {consentEnabled ? '🤝 Multi-Party Consent ON' : '👤 Single-Party Mode'}
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.controlsContainer}>
            {!isRecording ? (
              <TouchableOpacity
                style={styles.recordButton}
                onPress={startRecording}>
                <View style={styles.recordButtonInner} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.stopButton}
                onPress={stopRecording}>
                <View style={styles.stopButtonInner} />
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.hint}>
            {isRecording
              ? `⚡ ${duration}/30s • OpenCV + rPPG Active`
              : '👆 Tap to start 30-second recording'}
          </Text>
          
          {isRecording && (
            <View style={styles.progressBarContainer}>
              <View style={[styles.progressBar, {width: `${(duration / 30) * 100}%`}]} />
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  mockCamera: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  cameraTitle: {
    fontSize: 22,
    color: '#00ff88',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  setupInstructions: {
    fontSize: 14,
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    backgroundColor: 'rgba(0,255,136,0.1)',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.3)',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    backgroundColor: 'rgba(255,0,0,0.2)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ff4444',
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ff4444',
    marginRight: 8,
  },
  recordingText: {
    fontSize: 14,
    color: '#fff',
    fontWeight: 'bold',
  },
  cameraText: {
    color: '#00ff88',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  cameraHint: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    paddingTop: 40,
  },
  faceRectangle: {
    position: 'absolute',
    borderWidth: 0,
    borderColor: '#00ff88',
  },
  faceCornerTL: {
    position: 'absolute',
    top: -2,
    left: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#00ff88',
    borderTopLeftRadius: 8,
  },
  faceCornerTR: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 30,
    height: 30,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderColor: '#00ff88',
    borderTopRightRadius: 8,
  },
  faceCornerBL: {
    position: 'absolute',
    bottom: -2,
    left: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderColor: '#00ff88',
    borderBottomLeftRadius: 8,
  },
  faceCornerBR: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 30,
    height: 30,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderColor: '#00ff88',
    borderBottomRightRadius: 8,
  },
  compactBpmContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.85)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.3)',
    marginLeft: 12,
  },
  compactBpmIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  compactBpmInfo: {
    alignItems: 'center',
    marginRight: 8,
  },
  compactBpmValue: {
    color: '#00ff88',
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 22,
  },
  compactBpmUnit: {
    color: '#888',
    fontSize: 10,
  },
  compactConfidenceIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  compactConfidenceText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  backButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
    marginRight: 8,
  },
  statusDotActive: {
    backgroundColor: '#ff4444',
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  centerArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  guidanceContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 24,
    borderRadius: 16,
  },
  guidanceIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  guidanceText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  guidanceSubtext: {
    color: '#888',
    fontSize: 14,
  },
  readyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,255,136,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#00ff88',
  },
  readyIcon: {
    color: '#00ff88',
    fontSize: 24,
    marginRight: 10,
  },
  readyText: {
    color: '#00ff88',
    fontSize: 18,
    fontWeight: 'bold',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,152,0,0.9)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 16,
  },
  warningIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  warningText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  confidenceBar: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 3,
  },
  confidenceHigh: {
    backgroundColor: '#00ff88',
  },
  confidenceMedium: {
    backgroundColor: '#ffc107',
  },
  confidenceLow: {
    backgroundColor: '#ff9800',
  },

  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
  },
  timerIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  timerText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  consentToggle: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  consentToggleActive: {
    backgroundColor: 'rgba(99,102,241,0.25)',
    borderColor: '#6366f1',
  },
  consentToggleText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  controlsContainer: {
    marginBottom: 16,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,68,68,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#ff4444',
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff4444',
  },
  stopButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopButtonInner: {
    width: 32,
    height: 32,
    backgroundColor: '#ff4444',
    borderRadius: 4,
  },
  hint: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  progressBarContainer: {
    width: '80%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#00ff88',
    borderRadius: 2,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#0f0f23',
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 20,
  },
  errorTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  errorText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  permissionButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
