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

const AUTH_STORAGE_KEY = 'biovault_auth';

export default function LoginScreen({navigation}) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoChecking, setAutoChecking] = useState(true);

  // Auto-login if tokens exist
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_STORAGE_KEY);
        if (stored) {
          const {accessToken, refreshToken} = JSON.parse(stored);
          if (accessToken) {
            apiService.setAccessToken(accessToken);
            // Quick validate — try a lightweight endpoint
            try {
              await apiService.healthCheck();
              navigation.replace('Home');
              return;
            } catch (_) {
              // Token may be expired, try refresh
              if (refreshToken) {
                try {
                  const res = await apiService.refreshToken(refreshToken);
                  if (res.accessToken) {
                    await persistTokens(res.accessToken, res.refreshToken || refreshToken);
                    navigation.replace('Home');
                    return;
                  }
                } catch (_r) {
                  // Refresh also failed, show login form
                }
              }
            }
          }
        }
      } catch (_) {}
      setAutoChecking(false);
    })();
  }, []);

  const persistTokens = async (accessToken, refreshToken) => {
    apiService.setAccessToken(accessToken);
    await AsyncStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({accessToken, refreshToken}),
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
        navigation.replace('Home');
      } else {
        Alert.alert('Error', result.error || 'Unexpected response from server.');
      }
    } catch (error) {
      const msg =
        error?.message || (isRegister ? 'Registration failed' : 'Login failed');
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  const skipLogin = () => {
    // Allow using the app without auth (API key fallback in dev)
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
            <TouchableOpacity style={styles.skipRow} onPress={skipLogin}>
              <Text style={styles.skipText}>Skip (dev only)</Text>
            </TouchableOpacity>
          )}
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
});
