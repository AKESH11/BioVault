/**
 * CameraScreen.js
 * 
 * Main camera interface for BioVault video recording with real-time
 * rPPG bio-signature extraction and PRNU hardware fingerprinting.
 */

import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  ActivityIndicator,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {RNCamera} from 'react-native-camera';
import {NativeModules} from 'react-native';

const {BioVaultModule} = NativeModules;
const {width: screenWidth, height: screenHeight} = Dimensions.get('window');

const CameraScreen = ({navigation}) => {
  const cameraRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [bpm, setBpm] = useState(0);
  const [confidence, setConfidence] = useState(0);
  const [facesDetected, setFacesDetected] = useState(0);
  const [recordingTime, setRecordingTime] = useState(0);
  const [cameraReady, setCameraReady] = useState(false);
  
  const recordingInterval = useRef(null);
  const frameProcessingInterval = useRef(null);

  useEffect(() => {
    requestCameraPermissions();
    initializeBioVault();
    
    return () => {
      cleanup();
    };
  }, []);

  const requestCameraPermissions = async () => {
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);
        
        const cameraGranted = granted['android.permission.CAMERA'] === 'granted';
        const audioGranted = granted['android.permission.RECORD_AUDIO'] === 'granted';
        
        if (!cameraGranted || !audioGranted) {
          Alert.alert(
            'Permissions Required',
            'Camera and microphone permissions are required for BioVault.',
          );
        }
      } catch (err) {
        console.error('Permission error:', err);
      }
    }
  };

  const initializeBioVault = async () => {
    try {
      console.log('Initializing BioVault...');
      await BioVaultModule.init();
      await BioVaultModule.initializeCamera();
      console.log('BioVault initialized');
    } catch (error) {
      console.error('Failed to initialize BioVault:', error);
      Alert.alert('Initialization Error', 'Failed to initialize bio-extraction engine');
    }
  };

  const cleanup = () => {
    if (recordingInterval.current) {
      clearInterval(recordingInterval.current);
    }
    if (frameProcessingInterval.current) {
      clearInterval(frameProcessingInterval.current);
    }
    try {
      BioVaultModule.releaseCamera();
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  };

  const onCameraReady = () => {
    console.log('Camera ready');
    setCameraReady(true);
  };

  const startRecording = async () => {
    if (!cameraRef.current || !cameraReady) {
      Alert.alert('Camera Not Ready', 'Please wait for camera to initialize');
      return;
    }

    try {
      setIsRecording(true);
      setRecordingTime(0);
      
      // Start rPPG extraction session
      await BioVaultModule.startRPPGExtraction();
      
      // Start video recording
      const options = {
        quality: RNCamera.Constants.VideoQuality['720p'],
        maxDuration: 30, // 30 seconds max
        mute: false,
      };
      
      console.log('Starting video recording...');
      const promise = cameraRef.current.recordAsync(options);
      
      // Start recording timer
      recordingInterval.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      
      // Start frame processing for real-time feedback
      startFrameProcessing();
      
      // Wait for recording to complete
      const data = await promise;
      console.log('Recording completed:', data.uri);
      
      // Stop and process
      await stopRecording(data.uri);
      
    } catch (error) {
      console.error('Recording error:', error);
      Alert.alert('Recording Error', error.message);
      setIsRecording(false);
    }
  };

  const stopRecording = async (videoUri = null) => {
    try {
      if (recordingInterval.current) {
        clearInterval(recordingInterval.current);
      }
      if (frameProcessingInterval.current) {
        clearInterval(frameProcessingInterval.current);
      }
      
      setIsProcessing(true);
      
      // Stop video recording if still recording
      if (cameraRef.current && isRecording) {
        cameraRef.current.stopRecording();
      }
      
      // Stop rPPG extraction and get bio-signature
      console.log('Extracting bio-signature...');
      const bioSignature = await BioVaultModule.stopRPPGExtraction();
      console.log('Bio-signature:', bioSignature);
      
      const result = JSON.parse(bioSignature);
      
      setIsRecording(false);
      setIsProcessing(false);
      
      // Navigate to results screen
      navigation.navigate('Results', {
        videoUri: videoUri,
        bioSignature: result,
      });
      
    } catch (error) {
      console.error('Stop recording error:', error);
      Alert.alert('Processing Error', error.message);
      setIsRecording(false);
      setIsProcessing(false);
    }
  };

  const startFrameProcessing = () => {
    // Process frames every 500ms for real-time feedback
    frameProcessingInterval.current = setInterval(async () => {
      try {
        if (cameraRef.current) {
          const options = {
            quality: 0.5,
            base64: true,
            width: 640,
            height: 480,
          };
          
          const data = await cameraRef.current.takePictureAsync(options);
          
          // Send frame to native processing
          const result = await BioVaultModule.processCameraFrame(
            data.base64,
            640,
            480,
            1 // RGBA format
          );
          
          const parsed = JSON.parse(result);
          
          // Update UI with real-time metrics
          if (parsed.bioSignatures && parsed.bioSignatures.rppg) {
            setBpm(parsed.bioSignatures.rppg.bpm || 0);
            setConfidence(parsed.bioSignatures.rppg.confidence || 0);
          }
          
          setFacesDetected(parsed.facesDetected || 0);
        }
      } catch (error) {
        // Silent fail - don't interrupt recording
        console.warn('Frame processing warning:', error.message);
      }
    }, 500);
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      <RNCamera
        ref={cameraRef}
        style={styles.camera}
        type={RNCamera.Constants.Type.back}
        flashMode={RNCamera.Constants.FlashMode.off}
        captureAudio={true}
        onCameraReady={onCameraReady}
        androidCameraPermissionOptions={{
          title: 'Permission to use camera',
          message: 'We need your permission to use your camera',
          buttonPositive: 'Ok',
          buttonNegative: 'Cancel',
        }}
        androidRecordAudioPermissionOptions={{
          title: 'Permission to use audio',
          message: 'We need your permission to record audio',
          buttonPositive: 'Ok',
          buttonNegative: 'Cancel',
        }}>
        
        {/* Top status bar */}
        <View style={styles.topBar}>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, {backgroundColor: cameraReady ? '#4CAF50' : '#FF5722'}]} />
            <Text style={styles.statusText}>
              {cameraReady ? 'Ready' : 'Initializing...'}
            </Text>
          </View>
          
          {isRecording && (
            <View style={styles.recordingIndicator}>
              <View style={styles.recordingDot} />
              <Text style={styles.recordingText}>REC {formatTime(recordingTime)}</Text>
            </View>
          )}
        </View>

        {/* Bio-metrics overlay */}
        {isRecording && (
          <View style={styles.metricsOverlay}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Heart Rate</Text>
              <Text style={styles.metricValue}>{bpm > 0 ? `${bpm} BPM` : '---'}</Text>
              <Text style={styles.metricConfidence}>
                {confidence > 0 ? `${(confidence * 100).toFixed(0)}% confidence` : 'Detecting...'}
              </Text>
            </View>
            
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Faces</Text>
              <Text style={styles.metricValue}>{facesDetected}</Text>
            </View>
          </View>
        )}

        {/* Bottom controls */}
        <View style={styles.bottomBar}>
          {!isRecording && !isProcessing && (
            <TouchableOpacity
              style={styles.captureButton}
              onPress={startRecording}
              disabled={!cameraReady}>
              <View style={styles.captureButtonInner} />
            </TouchableOpacity>
          )}
          
          {isRecording && (
            <TouchableOpacity
              style={[styles.captureButton, styles.stopButton]}
              onPress={() => stopRecording()}>
              <View style={styles.stopButtonInner} />
            </TouchableOpacity>
          )}
          
          {isProcessing && (
            <View style={styles.processingContainer}>
              <ActivityIndicator size="large" color="#fff" />
              <Text style={styles.processingText}>Processing bio-signature...</Text>
            </View>
          )}
        </View>

        {/* Info text */}
        {!isRecording && !isProcessing && (
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>
              Tap to start recording with bio-authentication
            </Text>
            <Text style={styles.infoSubtext}>
              Max 30 seconds • rPPG extraction enabled
            </Text>
          </View>
        )}
      </RNCamera>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
    marginRight: 8,
  },
  recordingText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  metricsOverlay: {
    position: 'absolute',
    top: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metricCard: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 16,
    borderRadius: 12,
    minWidth: 150,
  },
  metricLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  metricValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
  },
  metricConfidence: {
    color: '#4CAF50',
    fontSize: 11,
    marginTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingTop: 20,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#FF5722',
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF5722',
  },
  stopButton: {
    borderColor: '#F44336',
  },
  stopButtonInner: {
    width: 40,
    height: 40,
    backgroundColor: '#F44336',
    borderRadius: 4,
  },
  processingContainer: {
    alignItems: 'center',
  },
  processingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 12,
  },
  infoContainer: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  infoText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  infoSubtext: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 4,
    textAlign: 'center',
  },
});

export default CameraScreen;
