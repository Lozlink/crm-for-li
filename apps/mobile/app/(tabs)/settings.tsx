import { StyleSheet, View, ScrollView, Alert, TextInput as RNTextInput } from 'react-native';
import { List, Divider, useTheme, Text, Surface, Button, Avatar, TextInput, Dialog, Portal, RadioButton } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useState, useEffect, useCallback } from 'react';
import { useCRMStore, useAuthStore, usePermissions, useOrganisationStore } from '@realestate-crm/hooks';
import { isDemoMode } from '@realestate-crm/api';
import { TagManager, RoleBadge } from '@realestate-crm/ui';
import type { OrgRole } from '@realestate-crm/types';

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

  const organisations = useOrganisationStore(s => s.organisations);
  const orgMemberships = useOrganisationStore(s => s.orgMemberships);
  const orgTeams = useOrganisationStore(s => s.orgTeams);
  const fetchUserOrgs = useOrganisationStore(s => s.fetchUserOrgs);
  const createOrg = useOrganisationStore(s => s.createOrg);
  const fetchOrgTeams = useOrganisationStore(s => s.fetchOrgTeams);

  const [showCreateOrg, setShowCreateOrg] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [showOrgTeams, setShowOrgTeams] = useState(false);

  useEffect(() => {
    if (!isDemo) {
      fetchUserOrgs();
    }
  }, [isDemo, fetchUserOrgs]);

  const displayName = profile?.display_name || user?.email || 'Demo User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
  };

  const handleCreateOrg = useCallback(async () => {
    if (!newOrgName.trim()) return;
    setCreatingOrg(true);
    try {
      const org = await createOrg(newOrgName.trim());
      if (org) {
        setNewOrgName('');
        setShowCreateOrg(false);
        await fetchUserOrgs();
      }
    } catch (err) {
      console.error('Create org error:', err);
    } finally {
      setCreatingOrg(false);
    }
  }, [newOrgName, createOrg, fetchUserOrgs]);

  const handleViewOrgTeams = useCallback((orgId: string) => {
    fetchOrgTeams(orgId);
    setShowOrgTeams(true);
  }, [fetchOrgTeams]);

  const activeOrg = organisations.length > 0 ? organisations[0] : null;
  const activeOrgMembership = activeOrg
    ? orgMemberships.find(m => m.organisation_id === activeOrg.id && m.user_id === user?.id)
    : null;
  const orgMemberCount = activeOrg
    ? orgMemberships.filter(m => m.organisation_id === activeOrg.id).length
    : 0;

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

      {/* Integrations */}
      <Surface style={styles.integrationsCard} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Integrations</Text>
        <List.Item
          title="Caller ID"
          description="Show contact names on incoming calls"
          left={props => <List.Icon {...props} icon="phone-check" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/settings/caller-id')}
          style={styles.listItem}
        />
        <List.Item
          title="Custom Fields"
          description="Define custom fields for contacts, properties, etc."
          left={props => <List.Icon {...props} icon="form-textbox" />}
          right={props => <List.Icon {...props} icon="chevron-right" />}
          onPress={() => router.push('/settings/custom-fields')}
          style={styles.listItem}
        />
      </Surface>

      {/* Organisation Section */}
      {!isDemo && (
        <>
          <Divider style={styles.divider} />
          <Surface style={styles.orgCard} elevation={1}>
            <View style={styles.orgHeader}>
              <Text variant="titleMedium" style={styles.sectionTitle}>Organisation</Text>
            </View>

            {!activeOrg ? (
              <View>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                  Organisations let you group multiple teams/offices under one admin umbrella.
                </Text>
                <Button
                  mode="contained"
                  onPress={() => setShowCreateOrg(true)}
                  icon="office-building-plus"
                >
                  Create Organisation
                </Button>
              </View>
            ) : (
              <View>
                <View style={styles.orgInfoRow}>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall">{activeOrg.name}</Text>
                    {activeOrgMembership && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {activeOrgMembership.role === 'org_admin' ? 'Admin' : 'Member'}
                      </Text>
                    )}
                  </View>
                  <View style={styles.orgBadge}>
                    <Text variant="labelSmall" style={{ color: theme.colors.primary }}>
                      {orgMemberCount} {orgMemberCount === 1 ? 'member' : 'members'}
                    </Text>
                  </View>
                </View>

                <List.Item
                  title="Manage Teams"
                  description={`${orgTeams.filter(t => t.organisation_id === activeOrg.id).length} teams`}
                  left={props => <List.Icon {...props} icon="office-building" />}
                  right={props => <List.Icon {...props} icon="chevron-right" />}
                  onPress={() => handleViewOrgTeams(activeOrg.id)}
                  style={styles.listItem}
                />
              </View>
            )}
          </Surface>
        </>
      )}

      {/* Create Organisation Dialog */}
      <Portal>
        <Dialog visible={showCreateOrg} onDismiss={() => setShowCreateOrg(false)}>
          <Dialog.Title>Create Organisation</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Organisation Name"
              value={newOrgName}
              onChangeText={setNewOrgName}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCreateOrg(false)}>Cancel</Button>
            <Button
              onPress={handleCreateOrg}
              disabled={creatingOrg || !newOrgName.trim()}
              loading={creatingOrg}
            >
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Org Teams Dialog */}
      <Portal>
        <Dialog visible={showOrgTeams} onDismiss={() => setShowOrgTeams(false)}>
          <Dialog.Title>{activeOrg?.name} - Teams</Dialog.Title>
          <Dialog.Content>
            {orgTeams.filter(t => activeOrg && t.organisation_id === activeOrg.id).length === 0 ? (
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                No teams in this organisation yet.
              </Text>
            ) : (
              orgTeams
                .filter(t => activeOrg && t.organisation_id === activeOrg.id)
                .map(team => (
                  <List.Item
                    key={team.id}
                    title={team.name}
                    left={props => <List.Icon {...props} icon="account-group" />}
                  />
                ))
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowOrgTeams(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

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
  integrationsCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
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
  orgCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  orgHeader: {
    marginBottom: 12,
  },
  orgInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  orgBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(98, 0, 238, 0.08)',
  },
});
