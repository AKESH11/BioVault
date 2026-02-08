/**
 * App.js - BioVault Mobile Application
 * Simple screen navigation without external libraries
 */

import React, {useState} from 'react';
import {SafeAreaView, StyleSheet} from 'react-native';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen.simple';
import ResultsScreen from './src/screens/ResultsScreen.simple';

function App() {
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [captureData, setCaptureData] = useState(null);

  const navigate = (screen, data) => {
    if (data) setCaptureData(data);
    setCurrentScreen(screen);
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Camera':
        return <CameraScreen navigation={{navigate, goBack: () => setCurrentScreen('Home')}} />;
      case 'Results':
        return <ResultsScreen navigation={{navigate, goBack: () => setCurrentScreen('Home')}} captureData={captureData} />;
      default:
        return <HomeScreen navigation={{navigate}} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {renderScreen()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
});

export default App;

export default App;
