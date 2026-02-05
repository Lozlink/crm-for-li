import { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, useTheme, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@realestate-crm/hooks';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const signIn = useAuthStore(s => s.signIn);
  const enterDemoMode = useAuthStore(s => s.enterDemoMode);
  const isLoading = useAuthStore(s => s.isLoading);
  const authError = useAuthStore(s => s.authError);
  const setAuthError = useAuthStore(s => s.setAuthError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSignIn = async () => {
    if (!email.trim() || !password) {
      setAuthError('Please fill in all fields');
      return;
    }
    try {
      await signIn(email.trim(), password);
    } catch {}
  };

  const handleDemo = () => {
    enterDemoMode();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Icon name="home-city" size={64} color={theme.colors.primary} />
          <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.onBackground }]}>
            Real Estate CRM
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
            Sign in to your account
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            label="Email"
            value={email}
            onChangeText={(t) => { setEmail(t); setAuthError(null); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            mode="outlined"
            left={<TextInput.Icon icon="email" />}
            style={styles.input}
          />

          <TextInput
            label="Password"
            value={password}
            onChangeText={(t) => { setPassword(t); setAuthError(null); }}
            secureTextEntry={!showPassword}
            mode="outlined"
            left={<TextInput.Icon icon="lock" />}
            right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(!showPassword)} />}
            style={styles.input}
          />

          {authError && (
            <HelperText type="error" visible>
              {authError}
            </HelperText>
          )}

          <Button
            mode="contained"
            onPress={handleSignIn}
            loading={isLoading}
            disabled={isLoading}
            style={styles.button}
          >
            Sign In
          </Button>

          <Button
            mode="text"
            onPress={() => router.push('/(auth)/forgot-password')}
            style={styles.link}
          >
            Forgot password?
          </Button>

          <Button
            mode="outlined"
            onPress={() => router.push('/(auth)/signup')}
            style={styles.button}
          >
            Create Account
          </Button>
        </View>

        <View style={styles.demoSection}>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            Want to try it out first?
          </Text>
          <Button
            mode="text"
            onPress={handleDemo}
            icon="play-circle-outline"
            style={styles.link}
          >
            Try Demo Mode
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    marginTop: 12,
    marginBottom: 4,
    fontWeight: '700',
  },
  form: {
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
  link: {
    marginTop: 4,
  },
  demoSection: {
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
});
