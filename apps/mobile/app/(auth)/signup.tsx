import { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, useTheme, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@realestate-crm/hooks';

export default function SignupScreen() {
  const theme = useTheme();
  const router = useRouter();
  const signUp = useAuthStore(s => s.signUp);
  const isLoading = useAuthStore(s => s.isLoading);
  const authError = useAuthStore(s => s.authError);
  const setAuthError = useAuthStore(s => s.setAuthError);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSignUp = async () => {
    if (!displayName.trim() || !email.trim() || !password || !confirmPassword) {
      setAuthError('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setAuthError('Password must be at least 6 characters');
      return;
    }
    try {
      await signUp(email.trim(), password, displayName.trim());
      // After signup, they'll be redirected via auth gate
    } catch {}
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
        <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onBackground }]}>
          Create your account
        </Text>

        <TextInput
          label="Display Name"
          value={displayName}
          onChangeText={(t) => { setDisplayName(t); setAuthError(null); }}
          autoCapitalize="words"
          mode="outlined"
          left={<TextInput.Icon icon="account" />}
          style={styles.input}
        />

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

        <TextInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={(t) => { setConfirmPassword(t); setAuthError(null); }}
          secureTextEntry={!showPassword}
          mode="outlined"
          left={<TextInput.Icon icon="lock-check" />}
          style={styles.input}
        />

        {authError && (
          <HelperText type="error" visible>
            {authError}
          </HelperText>
        )}

        <Button
          mode="contained"
          onPress={handleSignUp}
          loading={isLoading}
          disabled={isLoading}
          style={styles.button}
        >
          Create Account
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
  },
  title: {
    marginBottom: 24,
    fontWeight: '700',
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 12,
  },
});
