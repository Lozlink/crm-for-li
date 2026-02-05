import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput, Button, Text, useTheme, HelperText } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuthStore } from '@realestate-crm/hooks';

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const resetPassword = useAuthStore(s => s.resetPassword);
  const isLoading = useAuthStore(s => s.isLoading);
  const authError = useAuthStore(s => s.authError);
  const setAuthError = useAuthStore(s => s.setAuthError);

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      setAuthError('Please enter your email');
      return;
    }
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch {}
  };

  if (sent) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Icon name="email-check" size={64} color={theme.colors.primary} />
        <Text variant="titleLarge" style={[styles.successTitle, { color: theme.colors.onBackground }]}>
          Check your email
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          We've sent a password reset link to {email}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 24 }}>
        Enter your email address and we'll send you a link to reset your password.
      </Text>

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

      {authError && (
        <HelperText type="error" visible>
          {authError}
        </HelperText>
      )}

      <Button
        mode="contained"
        onPress={handleReset}
        loading={isLoading}
        disabled={isLoading}
        style={styles.button}
      >
        Send Reset Link
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  successTitle: {
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '700',
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 8,
  },
});
