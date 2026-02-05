import { StyleSheet, View, ScrollView } from 'react-native';
import { List, Divider, useTheme, Text, Surface, Button, Avatar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useCRMStore, useAuthStore, usePermissions } from '@realestate-crm/hooks';
import { isDemoMode } from '@realestate-crm/api';
import { TagManager, RoleBadge } from '@realestate-crm/ui';

export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const contacts = useCRMStore(state => state.contacts);
  const tags = useCRMStore(state => state.tags);

  const profile = useAuthStore(s => s.profile);
  const user = useAuthStore(s => s.user);
  const activeTeam = useAuthStore(s => s.activeTeam);
  const activeRole = useAuthStore(s => s.activeRole);
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isDemo = useAuthStore(s => s.isDemoMode);
  const signOut = useAuthStore(s => s.signOut);
  const { canManageMembers } = usePermissions();

  const displayName = profile?.display_name || user?.email || 'Demo User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Profile Section */}
      <Surface style={styles.profileCard} elevation={1}>
        <View style={styles.profileRow}>
          <Avatar.Text size={56} label={initials} />
          <View style={styles.profileInfo}>
            <Text variant="titleMedium">{displayName}</Text>
            {user?.email && (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {user.email}
              </Text>
            )}
            {isDemo && (
              <Text variant="bodySmall" style={{ color: theme.colors.tertiary }}>
                Demo Mode
              </Text>
            )}
          </View>
        </View>
        <Button
          mode="outlined"
          onPress={handleSignOut}
          icon="logout"
          style={styles.signOutButton}
          textColor={theme.colors.error}
        >
          {isDemo ? 'Exit Demo' : 'Sign Out'}
        </Button>
      </Surface>

      {/* Team Section - hidden in demo mode */}
      {activeTeam && !isDemo && (
        <>
          <Divider style={styles.divider} />
          <Surface style={styles.teamCard} elevation={1}>
            <Text variant="titleMedium" style={styles.sectionTitle}>Team</Text>
            <View style={styles.teamRow}>
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall">{activeTeam.name}</Text>
              </View>
              {activeRole && <RoleBadge role={activeRole} compact />}
            </View>

            <List.Item
              title="Switch Team"
              left={props => <List.Icon {...props} icon="swap-horizontal" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/team/switcher')}
              style={styles.listItem}
            />
            <List.Item
              title="Team Settings"
              left={props => <List.Icon {...props} icon="cog" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push(`/team/${activeTeam.id}/settings`)}
              style={styles.listItem}
            />
            {canManageMembers && (
              <List.Item
                title="Members"
                left={props => <List.Icon {...props} icon="account-group" />}
                right={props => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => router.push(`/team/${activeTeam.id}/members`)}
                style={styles.listItem}
              />
            )}
          </Surface>
        </>
      )}

      <Divider style={styles.divider} />

      {/* Statistics */}
      <Surface style={styles.statsCard} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Statistics</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text variant="headlineMedium" style={{ color: theme.colors.primary }}>
              {contacts.length}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Contacts
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="headlineMedium" style={{ color: theme.colors.primary }}>
              {tags.length}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Tags
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="headlineMedium" style={{ color: theme.colors.primary }}>
              {contacts.filter(c => c.latitude && c.longitude).length}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Mapped
            </Text>
          </View>
        </View>
      </Surface>

      <Divider style={styles.divider} />

      <TagManager />

      <Divider style={styles.divider} />

      <Surface style={styles.infoCard} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>About</Text>
        <List.Item
          title="Mode"
          description={isDemo ? 'Demo (Local Storage)' : isDemoMode ? 'Demo (Local Storage)' : 'Connected to Supabase'}
          left={props => <List.Icon {...props} icon="database" />}
        />
        <List.Item
          title="Version"
          description="1.0.0"
          left={props => <List.Icon {...props} icon="information" />}
        />
        {(isDemo || isDemoMode) && (
          <View style={styles.demoNote}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Running in demo mode. Configure Supabase environment variables for full functionality.
            </Text>
          </View>
        )}
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  profileCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  profileInfo: {
    marginLeft: 16,
    flex: 1,
  },
  signOutButton: {
    marginTop: 4,
  },
  teamCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listItem: {
    paddingVertical: 2,
  },
  statsCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  divider: {
    marginVertical: 4,
  },
  infoCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    marginBottom: 32,
  },
  demoNote: {
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
});
