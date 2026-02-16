import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import apiService from '../services/ApiService';
import blockchainService from '../services/BlockchainService';

const AUTH_STORAGE_KEY = 'biovault_auth';
const USER_PROFILE_KEY = 'biovault_user_profile';

export default function LoginScreen({navigation}) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoChecking, setAutoChecking] = useState(true);

  // ── Auto-login: works OFFLINE — never blocks on backend ──
  useEffect(() => {
    (async () => {
      try {
        await apiService.init();

        // Check if user has signed in before (local profile saved)
        const profile = await AsyncStorage.getItem(USER_PROFILE_KEY);
        const stored  = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

        if (profile || stored) {
          // User has previously authenticated — go straight to Home.
          // We trust the local credential cache; the backend is optional.
          if (stored) {
            try {
              const { accessToken } = JSON.parse(stored);
              if (accessToken) apiService.setAccessToken(accessToken);
            } catch (_) {}
          }

          // Pre-initialize blockchain service in background (non-blocking)
          blockchainService.init().catch(() => {});

          // Attempt a background token refresh (non-blocking — don't wait)
          _backgroundRefresh(stored).catch(() => {});

          navigation.replace('Home');
          return;
        }
      } catch (_) {}
      setAutoChecking(false);
    })();
  }, []);

  /** Try to refresh JWT in background — never blocks navigation. */
  const _backgroundRefresh = async (storedRaw) => {
    try {
      if (!storedRaw) return;
      const { refreshToken } = JSON.parse(storedRaw);
      if (!refreshToken) return;
      const res = await apiService.refreshToken(refreshToken);
      if (res.accessToken) {
        await persistTokens(res.accessToken, res.refreshToken || refreshToken);
      }
    } catch (_) {
      // Backend unreachable — that's fine, standalone mode will handle it
    }
  };

  const persistTokens = async (accessToken, refreshToken) => {
    apiService.setAccessToken(accessToken);
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({accessToken, refreshToken}),
    );
  };

  /** Save local user profile so auto-login works even without backend. */
  const persistProfile = async (email) => {
    await AsyncStorage.setItem(
      USER_PROFILE_KEY,
      JSON.stringify({ email, lastLogin: Date.now() }),
    );
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing Fields', 'Please enter email and password.');
      return;
    }

    if (isRegister && password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      let result;
      if (isRegister) {
        result = await apiService.register(email.trim(), password);
      } else {
        result = await apiService.login(email.trim(), password);
      }

      if (result.accessToken) {
        await persistTokens(result.accessToken, result.refreshToken);
        await persistProfile(email.trim());
        navigation.replace('Home');
      } else {
        Alert.alert('Error', result.error || 'Unexpected response from server.');
      }
    } catch (error) {
      const msg =
        error?.message || (isRegister ? 'Registration failed' : 'Login failed');
      // Offer standalone mode if backend is unreachable
      if (msg.includes('Network request failed') || msg.includes('timeout') || msg.includes('Failed to fetch')) {
        Alert.alert(
          'Server Unreachable',
          'The backend server is not available. You can continue in standalone mode — verification and viewing will work directly on the blockchain.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Continue Standalone', onPress: () => enterStandaloneMode() },
          ],
        );
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  /** Enter app without backend — blockchain reads + cached data still work. */
  const enterStandaloneMode = async () => {
    await AsyncStorage.setItem(
      USER_PROFILE_KEY,
      JSON.stringify({ email: email.trim() || 'standalone', lastLogin: Date.now(), standalone: true }),
    );
    // Pre-init blockchain direct access
    blockchainService.init().catch(() => {});
    navigation.replace('Home');
  };

  if (autoChecking) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.checkingText}>Checking session...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.logo}>🔐</Text>
          <Text style={styles.title}>Bio-Vault</Text>
          <Text style={styles.subtitle}>
            {isRegister ? 'Create an Account' : 'Welcome Back'}
          </Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#555"
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />

          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#555"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />

          {isRegister && (
            <>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#555"
                secureTextEntry
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </>
          )}

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSubmit}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {isRegister ? 'Register' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={() => setIsRegister(!isRegister)}>
            <Text style={styles.toggleText}>
              {isRegister
                ? 'Already have an account? Sign In'
                : "Don't have an account? Register"}
            </Text>
          </TouchableOpacity>

          {__DEV__ && (
            <TouchableOpacity style={styles.skipRow} onPress={enterStandaloneMode}>
              <Text style={styles.skipText}>Skip (dev only)</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.standaloneRow} onPress={enterStandaloneMode}>
            <Text style={styles.standaloneText}>Continue without server →</Text>
            <Text style={styles.standaloneHint}>
              Verification & viewing work directly on blockchain
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkingText: {
    color: '#8b8ba7',
    marginTop: 16,
    fontSize: 14,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logo: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#8b8ba7',
  },
  form: {
    width: '100%',
  },
  inputLabel: {
    color: '#8b8ba7',
    fontSize: 13,
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    backgroundColor: '#1a1a3e',
    borderWidth: 1,
    borderColor: '#2d2d5f',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '600',
  },
  toggleRow: {
    alignItems: 'center',
    marginTop: 20,
  },
  toggleText: {
    color: '#6366f1',
    fontSize: 14,
  },
  skipRow: {
    alignItems: 'center',
    marginTop: 16,
  },
  skipText: {
    color: '#555',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  standaloneRow: {
    alignItems: 'center',
    marginTop: 24,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#2d2d5f',
  },
  standaloneText: {
    color: '#10b981',
    fontSize: 15,
    fontWeight: '600',
  },
  standaloneHint: {
    color: '#555',
    fontSize: 11,
    marginTop: 4,
  },
});
