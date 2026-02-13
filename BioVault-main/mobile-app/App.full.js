import React, {useState} from 'react';
import {View, StyleSheet} from 'react-native';
import HomeScreen from './src/screens/HomeScreen.working';
import CameraScreen from './src/screens/CameraScreen.native';
import ResultsScreen from './src/screens/ResultsScreen.working';
import MediaLibraryScreen from './src/screens/MediaLibraryScreen';
import VerifyScreen from './src/screens/VerifyScreen';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState('Home');
  const [screenParams, setScreenParams] = useState(null);

  const navigation = {
    navigate: (screen, params) => {
      setScreenParams(params);
      setCurrentScreen(screen);
    },
    goBack: () => {
      setCurrentScreen('Home');
      setScreenParams(null);
    },
  };

  const renderScreen = () => {
    switch (currentScreen) {
      case 'Camera':
        return <CameraScreen navigation={navigation} />;
      case 'Results':
        return <ResultsScreen navigation={navigation} route={{params: screenParams}} />;
      case 'MediaLibrary':
        return <MediaLibraryScreen navigation={navigation} />;
      case 'Verify':
        return <VerifyScreen navigation={navigation} />;
      default:
        return <HomeScreen navigation={navigation} />;
    }
  };

  return (
    <View style={styles.container}>
      {renderScreen()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
});
