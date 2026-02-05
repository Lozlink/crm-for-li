import { useEffect, useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Text, useTheme, FAB } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@realestate-crm/hooks';
import { usePermissions } from '@realestate-crm/hooks';
import { MemberCard } from '@realestate-crm/ui';
import { updateMemberRole as apiUpdateRole, removeMember as apiRemoveMember } from '@realestate-crm/api';
import type { TeamRole, Membership } from '@realestate-crm/types';

export default function MembersScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { teamId } = useLocalSearchParams<{ teamId: string }>();
  const teamMembers = useAuthStore(s => s.teamMembers);
  const fetchTeamMembers = useAuthStore(s => s.fetchTeamMembers);
  const user = useAuthStore(s => s.user);
  const { canManageMembers, canInvite } = usePermissions();

  useEffect(() => {
    if (teamId) fetchTeamMembers(teamId);
  }, [teamId]);

  const handleChangeRole = useCallback(async (membershipId: string, role: TeamRole) => {
    await apiUpdateRole(membershipId, role);
    if (teamId) fetchTeamMembers(teamId);
  }, [teamId]);

  const handleRemove = useCallback(async (membershipId: string) => {
    await apiRemoveMember(membershipId);
    if (teamId) fetchTeamMembers(teamId);
  }, [teamId]);

  const renderItem = ({ item }: { item: Membership }) => (
    <MemberCard
      membership={item}
      canManage={canManageMembers}
      currentUserId={user?.id}
      onChangeRole={handleChangeRole}
      onRemove={handleRemove}
    />
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={teamMembers}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No members yet
            </Text>
          </View>
        }
      />

      {canInvite && (
        <FAB
          icon="account-plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          color={theme.colors.onPrimary}
          onPress={() => router.push(`/team/${teamId}/invite`)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
