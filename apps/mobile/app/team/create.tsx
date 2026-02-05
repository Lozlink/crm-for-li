import { useState } from 'react';
import { StyleSheet, View, KeyboardAvoidingView, Platform } from 'react-native';
import { TextInput, Button, Text, useTheme, HelperText } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@realestate-crm/hooks';
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
  const authError = useAuthStore(s => s.authError);
  const setAuthError = useAuthStore(s => s.setAuthError);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.container}>
        <View style={styles.iconRow}>
          <Icon name="office-building" size={48} color={theme.colors.primary} />
        </View>

        <Text variant="titleMedium" style={{ textAlign: 'center', marginBottom: 4 }}>
          Create your agency
        </Text>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginBottom: 24 }}>
          Set up a team for your real estate agency
        </Text>

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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});
