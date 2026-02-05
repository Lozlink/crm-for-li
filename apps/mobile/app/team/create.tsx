import { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { TextInput, Button, Text, useTheme, HelperText, Divider } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@realestate-crm/hooks';
import { acceptInvitation } from '@realestate-crm/api';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export default function CreateTeamScreen() {
  const theme = useTheme();
  const router = useRouter();
  const createTeam = useAuthStore(s => s.createTeam);
  const fetchMemberships = useAuthStore(s => s.fetchMemberships);
  const authError = useAuthStore(s => s.authError);
  const setAuthError = useAuthStore(s => s.setAuthError);

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleNameChange = (text: string) => {
    setName(text);
    setAuthError(null);
    if (!slugEdited) {
      setSlug(slugify(text));
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      setAuthError('Please enter a team name');
      return;
    }
    if (!slug.trim()) {
      setAuthError('Please enter a team slug');
      return;
    }
    setLoading(true);
    try {
      await createTeam(name.trim(), slug.trim());
      router.replace('/(tabs)');
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!inviteCode.trim()) {
      setJoinError('Please enter an invite code');
      return;
    }
    setLoading(true);
    setJoinError(null);
    try {
      await acceptInvitation(inviteCode.trim().toUpperCase());
      await fetchMemberships();
      router.replace('/(tabs)');
    } catch (e: any) {
      setJoinError(e.message || 'Invalid or expired invite code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.iconRow}>
          <Icon name={mode === 'create' ? 'office-building' : 'account-group'} size={48} color={theme.colors.primary} />
        </View>

        <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 4 }}>
          {mode === 'create' ? 'Create your agency' : 'Join a team'}
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24 }}>
          {mode === 'create'
            ? 'Set up a team for your real estate agency'
            : 'Enter the invite code you received'}
        </Text>

        {mode === 'create' ? (
          <>
            <TextInput
              label="Agency Name"
              value={name}
              onChangeText={handleNameChange}
              mode="outlined"
              left={<TextInput.Icon icon="office-building" />}
              style={styles.input}
            />

            <TextInput
              label="Slug (URL-friendly)"
              value={slug}
              onChangeText={(t) => { setSlug(slugify(t)); setSlugEdited(true); setAuthError(null); }}
              mode="outlined"
              autoCapitalize="none"
              left={<TextInput.Icon icon="link" />}
              style={styles.input}
            />

            {authError && (
              <HelperText type="error" visible>
                {authError}
              </HelperText>
            )}

            <Button
              mode="contained"
              onPress={handleCreate}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Create Team
            </Button>
          </>
        ) : (
          <>
            <TextInput
              label="Invite Code"
              value={inviteCode}
              onChangeText={(t) => { setInviteCode(t.toUpperCase()); setJoinError(null); }}
              autoCapitalize="characters"
              mode="outlined"
              left={<TextInput.Icon icon="key" />}
              style={styles.input}
              maxLength={8}
            />

            {joinError && (
              <HelperText type="error" visible>
                {joinError}
              </HelperText>
            )}

            <Button
              mode="contained"
              onPress={handleJoin}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Join Team
            </Button>
          </>
        )}

        <View style={styles.dividerRow}>
          <Divider style={styles.divider} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginHorizontal: 12 }}>
            or
          </Text>
          <Divider style={styles.divider} />
        </View>

        <Button
          mode="outlined"
          onPress={() => {
            setMode(mode === 'create' ? 'join' : 'create');
            setAuthError(null);
            setJoinError(null);
          }}
          icon={mode === 'create' ? 'key' : 'plus'}
        >
          {mode === 'create' ? 'I have an invite code' : 'Create a new team'}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  iconRow: {
    alignItems: 'center',
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  button: {
    marginTop: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  divider: {
    flex: 1,
  },
});
