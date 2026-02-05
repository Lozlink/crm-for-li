import { memo } from 'react';
import { Chip } from 'react-native-paper';
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

function RoleBadge({ role, compact }: RoleBadgeProps) {
  return (
    <Chip
      compact={compact}
      textStyle={{ color: '#fff', fontSize: compact ? 10 : 12 }}
      style={{ backgroundColor: ROLE_COLORS[role] }}
    >
      {ROLE_LABELS[role]}
    </Chip>
  );
}

export default memo(RoleBadge);
