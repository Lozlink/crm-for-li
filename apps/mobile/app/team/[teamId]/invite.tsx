import { useState, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { TextInput, Button, Text, useTheme, SegmentedButtons } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import { createInvitation, fetchTeamInvitations } from '@realestate-crm/api';
import { InviteCodeCard } from '@realestate-crm/ui';
import type { Invitation, TeamRole } from '@realestate-crm/types';

export default function InviteScreen() {
  const theme = useTheme();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('member');
  const [loading, setLoading] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  const loadInvitations = async () => {
    if (!teamId) return;
    try {
      const data = await fetchTeamInvitations(teamId);
      setInvitations(data);
    } catch {}
  };

  useEffect(() => {
    loadInvitations();
  }, [teamId]);

  const handleCreate = async () => {
    if (!teamId) return;
    setLoading(true);
    try {
      await createInvitation(teamId, role, email.trim() || undefined);
      setEmail('');
      await loadInvitations();
    } catch {}
    setLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.form}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Create Invitation</Text>

        <TextInput
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          mode="outlined"
          left={<TextInput.Icon icon="email" />}
          style={styles.input}
        />

        <Text variant="bodyMedium" style={{ marginBottom: 8 }}>Role</Text>
        <SegmentedButtons
          value={role}
          onValueChange={(v) => setRole(v as TeamRole)}
          buttons={[
            { value: 'admin', label: 'Admin' },
            { value: 'member', label: 'Member' },
            { value: 'viewer', label: 'Viewer' },
          ]}
          style={styles.segmented}
        />

        <Button
          mode="contained"
          onPress={handleCreate}
          loading={loading}
          disabled={loading}
          icon="send"
          style={styles.button}
        >
          Generate Invite Code
        </Button>
      </View>

      {invitations.length > 0 && (
        <View style={styles.listSection}>
          <Text variant="titleMedium" style={styles.sectionTitle}>Active Invitations</Text>
          <FlatList
            data={invitations}
            renderItem={({ item }) => <InviteCodeCard invitation={item} />}
            keyExtractor={item => item.id}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    padding: 16,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  input: {
    marginBottom: 16,
  },
  segmented: {
    marginBottom: 16,
  },
  button: {
    marginTop: 4,
  },
  listSection: {
    flex: 1,
    padding: 16,
    paddingTop: 0,
  },
});
