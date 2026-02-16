import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Linking } from 'react-native';
import ErrorBoundary from './src/components/ErrorBoundary';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import CameraScreen from './src/screens/CameraScreen';
import ResultsScreen from './src/screens/ResultsScreen';
import MediaLibraryScreen from './src/screens/MediaLibraryScreen';
import VerifyScreen from './src/screens/VerifyScreen';

// Note: react-native-gesture-handler is imported in index.js (must be first import)

const Stack = createStackNavigator();

/**
 * Deep linking configuration
 * Supports:
 *   biovault://verify/0xMediaHash      → VerifyScreen
 *   biovault://home                     → HomeScreen
 *   biovault://camera                   → CameraScreen
 *   biovault://library                  → MediaLibraryScreen
 *   https://biovault.io/verify/0xHash   → VerifyScreen (Universal Link)
 */
const linking = {
  prefixes: ['biovault://', 'https://biovault.io'],
  config: {
    screens: {
      Home: 'home',
      Camera: 'camera',
      Verify: {
        path: 'verify/:mediaHash?',
      },
      MediaLibrary: 'library',
      Results: 'results',
    },
  },
  // Handle links that arrive before NavigationContainer is ready
  async getInitialURL() {
    const url = await Linking.getInitialURL();
    return url;
  },
  subscribe(listener) {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      listener(url);
    });
    return () => subscription.remove();
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <NavigationContainer linking={linking}>
          <Stack.Navigator
            initialRouteName="Login"
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: '#0f0f23' },
              // Enable iOS-style swipe-back gesture
              gestureEnabled: true,
            }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Camera" component={CameraScreen} />
            <Stack.Screen name="Results" component={ResultsScreen} />
            <Stack.Screen name="MediaLibrary" component={MediaLibraryScreen} />
            <Stack.Screen name="Verify" component={VerifyScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
