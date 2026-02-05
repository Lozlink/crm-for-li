import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, Surface, Avatar, IconButton, Menu, useTheme } from 'react-native-paper';
import { useState } from 'react';
import type { Membership, TeamRole } from '@realestate-crm/types';
import RoleBadge from './RoleBadge';

interface MemberCardProps {
  membership: Membership;
  canManage: boolean;
  currentUserId?: string;
  onChangeRole?: (membershipId: string, role: TeamRole) => void;
  onRemove?: (membershipId: string) => void;
}

function MemberCard({ membership, canManage, currentUserId, onChangeRole, onRemove }: MemberCardProps) {
  const theme = useTheme();
  const [menuVisible, setMenuVisible] = useState(false);
  const displayName = membership.profile?.display_name || 'Unknown';
  const initials = displayName.slice(0, 2).toUpperCase();
  const isSelf = membership.user_id === currentUserId;

  return (
    <Surface style={styles.card} elevation={1}>
      <Avatar.Text size={40} label={initials} style={styles.avatar} />

      <View style={styles.content}>
        <Text variant="titleSmall" numberOfLines={1}>
          {displayName}{isSelf ? ' (You)' : ''}
        </Text>
        <View style={styles.roleRow}>
          <RoleBadge role={membership.role} compact />
          {membership.joined_at && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
              Joined {new Date(membership.joined_at).toLocaleDateString()}
            </Text>
          )}
        </View>
      </View>

      {canManage && !isSelf && membership.role !== 'owner' && (
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <IconButton icon="dots-vertical" onPress={() => setMenuVisible(true)} />
          }
        >
          {membership.role !== 'admin' && (
            <Menu.Item
              title="Make Admin"
              leadingIcon="shield-account"
              onPress={() => { onChangeRole?.(membership.id, 'admin'); setMenuVisible(false); }}
            />
          )}
          {membership.role !== 'member' && (
            <Menu.Item
              title="Make Member"
              leadingIcon="account"
              onPress={() => { onChangeRole?.(membership.id, 'member'); setMenuVisible(false); }}
            />
          )}
          {membership.role !== 'viewer' && (
            <Menu.Item
              title="Make Viewer"
              leadingIcon="eye"
              onPress={() => { onChangeRole?.(membership.id, 'viewer'); setMenuVisible(false); }}
            />
          )}
          <Menu.Item
            title="Remove"
            leadingIcon="account-remove"
            onPress={() => { onRemove?.(membership.id); setMenuVisible(false); }}
          />
        </Menu>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  avatar: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
});

export default memo(MemberCard);
