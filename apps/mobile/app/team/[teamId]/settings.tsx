import { useState, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Text, Surface, useTheme, Divider } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@realestate-crm/hooks';
import { usePermissions } from '@realestate-crm/hooks';
import { updateTeam, deleteTeam } from '@realestate-crm/api';

export default function TeamSettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const activeTeam = useAuthStore(s => s.activeTeam);
  const fetchMemberships = useAuthStore(s => s.fetchMemberships);
  const signOut = useAuthStore(s => s.signOut);
  const { isOwner } = usePermissions();

  const [name, setName] = useState(activeTeam?.name || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeTeam) setName(activeTeam.name);
  }, [activeTeam]);

  const handleSave = async () => {
    if (!teamId || !name.trim()) return;
    setSaving(true);
    try {
      await updateTeam(teamId, { name: name.trim() });
      await fetchMemberships();
    } catch {}
    setSaving(false);
  };

  const handleLeave = () => {
    Alert.alert(
      'Leave Team',
      'Are you sure you want to leave this team? You will lose access to all team data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            // For now, sign out. In a full implementation, this would remove the membership
            // and switch to another team.
            await signOut();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Team',
      'This will permanently delete the team and all its data. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!teamId) return;
            try {
              await deleteTeam(teamId);
              await signOut();
              router.replace('/(auth)/login');
            } catch {}
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={styles.section} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Team Name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          mode="outlined"
          style={styles.input}
        />
        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving || name.trim() === activeTeam?.name}
        >
          Save
        </Button>
      </Surface>

      <Divider style={styles.divider} />

      <Surface style={[styles.section, styles.dangerSection]} elevation={1}>
        <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.error }]}>
          Danger Zone
        </Text>

        <Button
          mode="outlined"
          onPress={handleLeave}
          textColor={theme.colors.error}
          style={[styles.dangerButton, { borderColor: theme.colors.error }]}
          icon="exit-run"
        >
          Leave Team
        </Button>

        {isOwner && (
          <Button
            mode="contained"
            onPress={handleDelete}
            buttonColor={theme.colors.error}
            style={styles.dangerButton}
            icon="delete-forever"
          >
            Delete Team
          </Button>
        )}
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  section: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  input: {
    marginBottom: 12,
  },
  divider: {
    marginVertical: 4,
  },
  dangerSection: {
    marginBottom: 32,
  },
  dangerButton: {
    marginTop: 8,
  },
});
