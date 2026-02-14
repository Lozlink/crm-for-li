import { useState } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, Alert } from 'react-native';
import { Text, Surface, useTheme, Button, Avatar, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuthStore, useCRMStore } from '@realestate-crm/hooks';
import { RoleBadge } from '@realestate-crm/ui';
import type { Membership } from '@realestate-crm/types';

export default function TeamSwitcherScreen() {
  const theme = useTheme();
  const router = useRouter();
  const memberships = useAuthStore(s => s.memberships);
  const activeTeam = useAuthStore(s => s.activeTeam);
  const switchTeam = useAuthStore(s => s.switchTeam);
  const resetData = useCRMStore(s => s.resetData);
  const [switchingTeamId, setSwitchingTeamId] = useState<string | null>(null);

  const handleSwitch = async (teamId: string) => {
    if (teamId === activeTeam?.id) {
      router.back();
      return;
    }
    setSwitchingTeamId(teamId);
    try {
      await switchTeam(teamId);
      await resetData();
      router.back();
    } catch (error: any) {
      Alert.alert('Switch Failed', error?.message || 'Failed to switch team. Please try again.');
    } finally {
      setSwitchingTeamId(null);
    }
  };

  const renderItem = ({ item }: { item: Membership }) => {
    const team = item.team;
    if (!team) return null;
    const isActive = team.id === activeTeam?.id;

    const isSwitching = switchingTeamId === team.id;

    return (
      <TouchableOpacity
        onPress={() => handleSwitch(team.id)}
        activeOpacity={0.7}
        disabled={!!switchingTeamId}
      >
        <Surface
          style={[
            styles.teamCard,
            isActive && { borderColor: theme.colors.primary, borderWidth: 2 },
            !!switchingTeamId && !isSwitching && { opacity: 0.5 },
          ]}
          elevation={1}
        >
          <Avatar.Text
            size={40}
            label={team.name.slice(0, 2).toUpperCase()}
            style={{ backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceVariant }}
          />
          <View style={styles.teamInfo}>
            <Text variant="titleSmall">{team.name}</Text>
            <View style={styles.metaRow}>
              <RoleBadge role={item.role} compact />
              {isActive && !isSwitching && (
                <Text variant="bodySmall" style={{ color: theme.colors.primary, marginLeft: 8 }}>
                  Active
                </Text>
              )}
              {isSwitching && (
                <Text variant="bodySmall" style={{ color: theme.colors.primary, marginLeft: 8 }}>
                  Switching...
                </Text>
              )}
            </View>
          </View>
          {isSwitching ? (
            <ActivityIndicator size={24} color={theme.colors.primary} />
          ) : isActive ? (
            <Icon name="check-circle" size={24} color={theme.colors.primary} />
          ) : null}
        </Surface>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <FlatList
        data={memberships}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No teams yet
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Button
          mode="outlined"
          onPress={() => router.push('/team/create')}
          icon="plus"
        >
          Create New Team
        </Button>
      </View>
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
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  teamInfo: {
    flex: 1,
    marginLeft: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  empty: {
    alignItems: 'center',
    padding: 32,
  },
  footer: {
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
});
