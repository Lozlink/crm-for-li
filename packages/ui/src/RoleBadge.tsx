import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import type { TeamRole } from '@realestate-crm/types';

const ROLE_COLORS: Record<TeamRole, string> = {
  owner: '#7C3AED',
  admin: '#2563EB',
  member: '#16A34A',
  viewer: '#6B7280',
};

const ROLE_LABELS: Record<TeamRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

interface RoleBadgeProps {
  role: TeamRole;
  compact?: boolean;
}

/**
 * Plain View+Text pill — mirrors LeadScoreBadge/ComplianceRiskBadge. Paper's
 * Chip clipped small labels (10px) inside its line-height at `compact`,
 * rendering as a near-blank coloured pill; the centred View+Text avoids that.
 */
function RoleBadge({ role, compact }: RoleBadgeProps) {
  return (
    <View style={[styles.badge, compact ? styles.badgeCompact : styles.badgeRegular, { backgroundColor: ROLE_COLORS[role] }]}>
      <Text
        numberOfLines={1}
        style={[styles.text, { fontSize: compact ? 10 : 12 }]}
      >
        {ROLE_LABELS[role]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeRegular: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default memo(RoleBadge);
