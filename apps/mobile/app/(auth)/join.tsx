import { useState, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { TextInput, Button, Text, useTheme, HelperText } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { acceptInvitation } from '@realestate-crm/api';
import { useAuthStore } from '@realestate-crm/hooks';

export default function JoinScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string }>();
  const fetchMemberships = useAuthStore(s => s.fetchMemberships);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);

  const [code, setCode] = useState(params.code || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (params.code) setCode(params.code);
  }, [params.code]);

  const handleJoin = async () => {
    if (!code.trim()) {
      setError('Please enter an invite code');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await acceptInvitation(code.trim().toUpperCase());
      await fetchMemberships();
      setSuccess(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Icon name="check-circle" size={64} color={theme.colors.primary} />
        <Text variant="titleLarge" style={[styles.successTitle, { color: theme.colors.onBackground }]}>
          You're in!
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24 }}>
          You've successfully joined the team.
        </Text>
        <Button mode="contained" onPress={() => router.replace('/(tabs)')}>
          Get Started
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.iconRow}>
        <Icon name="account-group" size={48} color={theme.colors.primary} />
      </View>

      <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 8 }}>
        Join a Team
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24 }}>
        Enter the invite code you received
      </Text>

      <TextInput
        label="Invite Code"
        value={code}
        onChangeText={(t) => { setCode(t.toUpperCase()); setError(null); }}
        autoCapitalize="characters"
        mode="outlined"
        left={<TextInput.Icon icon="key" />}
        style={styles.input}
        maxLength={8}
      />

      {error && (
        <HelperText type="error" visible>
          {error}
        </HelperText>
      )}

      <Button
        mode="contained"
        onPress={handleJoin}
        loading={loading}
        disabled={loading || !isAuthenticated}
        style={styles.button}
      >
        Join Team
      </Button>

      {!isAuthenticated && (
        <Text variant="bodySmall" style={{ color: theme.colors.error, textAlign: 'center', marginTop: 12 }}>
          You need to sign in before joining a team
        </Text>
      )}
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
  iconRow: {
    alignItems: 'center',
    marginBottom: 16,
    marginTop: 32,
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
