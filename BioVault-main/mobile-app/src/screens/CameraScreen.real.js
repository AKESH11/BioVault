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
  Dimensions,
} from 'react-native';
import {RNCamera} from 'react-native-camera';

const {BioVaultModule} = NativeModules;
const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

export default function CameraScreen({navigation}) {
  const [isRecording, setIsRecording] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [facesDetected, setFacesDetected] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  
  const cameraRef = useRef(null);
  const frameProcessorRef = useRef(null);
  const startTimeRef = useRef(null);
  const recordingDataRef = useRef({
    frames: [],
    bpmReadings: [],
    startTime: null
  });

  useEffect(() => {
    requestCameraPermission();
    initializeNativeModule();
    
    return () => {
      if (frameProcessorRef.current) {
        clearInterval(frameProcessorRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let timer;
    if (isRecording) {
      timer = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
        
        // Auto-stop after 30 seconds
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
      if (BioVaultModule) {
        // Initialize the native camera module
        const cascadePath = ''; // Will use default OpenCV cascade
        await BioVaultModule.initializeCamera?.(cascadePath);
        console.log('Native camera module initialized');
      }
    } catch (error) {
      console.error('Failed to initialize native module:', error);
    }
  };

  const onFacesDetected = ({faces}) => {
    if (!isRecording || !faces || faces.length === 0) {
      setFacesDetected(0);
      return;
    }
    
    setFacesDetected(faces.length);
    
    // For multi-face detection, we'll track the primary face (largest bounding box)
    const primaryFace = faces.reduce((largest, face) => {
      const area = face.bounds.size.width * face.bounds.size.height;
      const largestArea = largest.bounds.size.width * largest.bounds.size.height;
      return area > largestArea ? face : largest;
    }, faces[0]);
    
    console.log(`Detected ${faces.length} face(s), processing primary face`);
  };

  const processFrame = async (cameraData) => {
    if (!isRecording || isProcessing || !BioVaultModule) {
      return;
    }
    
    setIsProcessing(true);
    
    try {
      const {uri, width, height, base64} = cameraData;
      
      // Process frame through native C++ module
      // The native module will extract rPPG signal and compute BPM
      const result = await BioVaultModule.processVideoFrame?.(
        base64 || '',
        width,
        height,
        JSON.stringify({})
      );
      
      if (result) {
        const data = JSON.parse(result);
        
        // Update BPM from rPPG analysis
        if (data.bpm && data.bpm > 0 && data.bpm < 200) {
          setBpm(Math.round(data.bpm));
          recordingDataRef.current.bpmReadings.push(data.bpm);
        }
        
        // Update confidence
        if (data.confidence !== undefined) {
          setConfidence(Math.round(data.confidence * 100));
        }
        
        // Store frame data for final processing
        recordingDataRef.current.frames.push({
          timestamp: Date.now(),
          bpm: data.bpm,
          confidence: data.confidence,
        });
      }
    } catch (error) {
      console.error('Frame processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    if (!hasPermission) {
      Alert.alert('Permission Required', 'Camera permission is required for bio-authentication.');
      return;
    }
    
    Alert.alert(
      'Ready to Record',
      'Position your face in the frame. The system will extract your bio-signature using rPPG analysis.\n\nThis will take 10-30 seconds.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Start',
          onPress: async () => {
            setIsRecording(true);
            startTimeRef.current = Date.now();
            recordingDataRef.current = {
              frames: [],
              bpmReadings: [],
              startTime: Date.now()
            };
            
            // Start periodic frame capture (every 100ms for real-time rPPG)
            frameProcessorRef.current = setInterval(async () => {
              if (cameraRef.current) {
                try {
                  const options = {
                    quality: 0.5,
                    base64: true,
                    width: 640,
                    height: 480,
                    doNotSave: true,
                  };
                  const data = await cameraRef.current.takePictureAsync(options);
                  processFrame(data);
                } catch (error) {
                  console.error('Frame capture error:', error);
                }
              }
            }, 100); // 10 FPS for rPPG processing
          },
        },
      ]
    );
  };

  const stopRecording = async () => {
    setIsRecording(false);
    
    if (frameProcessorRef.current) {
      clearInterval(frameProcessorRef.current);
      frameProcessorRef.current = null;
    }
    
    // Calculate average BPM
    const {bpmReadings, frames} = recordingDataRef.current;
    
    if (bpmReadings.length === 0) {
      Alert.alert(
        'Recording Failed',
        'No valid heart rate data detected. Please ensure:\n\n' +
        '• Your face is clearly visible\n' +
        '• Lighting is good\n' +
        '• You remain still during recording',
        [{text: 'OK'}]
      );
      return;
    }
    
    // Calculate statistics
    const avgBpm = bpmReadings.reduce((a, b) => a + b, 0) / bpmReadings.length;
    const minBpm = Math.min(...bpmReadings);
    const maxBpm = Math.max(...bpmReadings);
    const variance = bpmReadings.reduce((sum, val) => sum + Math.pow(val - avgBpm, 2), 0) / bpmReadings.length;
    const stdDev = Math.sqrt(variance);
    
    // Calculate confidence based on variance (lower variance = higher confidence)
    const finalConfidence = Math.max(0, Math.min(100, 100 - (stdDev * 2)));
    
    Alert.alert(
      'Bio-Signature Extracted',
      `Recording complete!\n\n` +
      `Average BPM: ${Math.round(avgBpm)}\n` +
      `Range: ${Math.round(minBpm)}-${Math.round(maxBpm)}\n` +
      `Confidence: ${Math.round(finalConfidence)}%\n` +
      `Frames processed: ${frames.length}`,
      [
        {
          text: 'View Results',
          onPress: () => {
            navigation.navigate('Results', {
              bpm: Math.round(avgBpm),
              confidence: Math.round(finalConfidence),
              duration: duration,
              facesDetected: facesDetected,
              framesProcessed: frames.length,
              statistics: {
                min: Math.round(minBpm),
                max: Math.round(maxBpm),
                stdDev: stdDev.toFixed(2),
              }
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
            BioVault needs camera access to extract bio-signatures using rPPG analysis.
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

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <RNCamera
        ref={cameraRef}
        style={styles.camera}
        type={RNCamera.Constants.Type.front}
        flashMode={RNCamera.Constants.FlashMode.off}
        androidCameraPermissionOptions={{
          title: 'Camera Permission',
          message: 'BioVault needs camera access',
          buttonPositive: 'OK',
          buttonNegative: 'Cancel',
        }}
        faceDetectionMode={RNCamera.Constants.FaceDetection.Mode.accurate}
        faceDetectionLandmarks={RNCamera.Constants.FaceDetection.Landmarks.all}
        faceDetectionClassifications={RNCamera.Constants.FaceDetection.Classifications.all}
        onFacesDetected={onFacesDetected}>
        
        {/* Overlay with real-time data */}
        <View style={styles.overlay}>
          {/* Top bar with status */}
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
          </View>

          {/* Center area with metrics */}
          <View style={styles.centerArea}>
            {/* Face detection indicator */}
            <View style={styles.faceFrame}>
              <Text style={styles.faceFrameText}>
                {facesDetected > 0 ? `✓ ${facesDetected} Face${facesDetected > 1 ? 's' : ''} Detected` : 'Position your face'}
              </Text>
            </View>

            {/* Real-time BPM display */}
            {isRecording && bpm > 0 && (
              <View style={styles.bpmContainer}>
                <Text style={styles.bpmLabel}>Heart Rate</Text>
                <Text style={styles.bpmValue}>{bpm}</Text>
                <Text style={styles.bpmUnit}>BPM</Text>
                <View style={styles.confidenceBar}>
                  <View style={[styles.confidenceFill, {width: `${confidence}%`}]} />
                </View>
                <Text style={styles.confidenceText}>Confidence: {confidence}%</Text>
              </View>
            )}

            {/* Timer */}
            {isRecording && (
              <View style={styles.timerContainer}>
                <Text style={styles.timerIcon}>⏱️</Text>
                <Text style={styles.timerText}>{duration}s / 30s</Text>
              </View>
            )}
          </View>

          {/* Bottom controls */}
          <View style={styles.bottomBar}>
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
                ? '⚡ Extracting bio-signature...'
                : '👆 Tap to start recording'}
            </Text>
          </View>
        </View>
      </RNCamera>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 40,
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
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
  faceFrame: {
    width: screenWidth * 0.7,
    height: screenWidth * 0.9,
    borderWidth: 2,
    borderColor: '#00ff88',
    borderRadius: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  faceFrameText: {
    color: '#00ff88',
    fontSize: 14,
    fontWeight: '600',
    position: 'absolute',
    bottom: -40,
  },
  bpmContainer: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 20,
    minWidth: 200,
  },
  bpmLabel: {
    color: '#888',
    fontSize: 14,
    marginBottom: 8,
  },
  bpmValue: {
    color: '#00ff88',
    fontSize: 64,
    fontWeight: 'bold',
    lineHeight: 70,
  },
  bpmUnit: {
    color: '#888',
    fontSize: 16,
    marginTop: 4,
  },
  confidenceBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 12,
    marginBottom: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#00ff88',
  },
  confidenceText: {
    color: '#888',
    fontSize: 12,
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
  controlsContainer: {
    marginBottom: 16,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordButtonInner: {
    width: 64,
    height: 64,
    borderRadius: 32,
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
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
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
