import { useAuthStore } from './useAuthStore';
import type { Permission, TeamRole } from '@realestate-crm/types';

export function usePermissions() {
  const hasPermission = useAuthStore(s => s.hasPermission);
  const hasRole = useAuthStore(s => s.hasRole);
  const activeRole = useAuthStore(s => s.activeRole);
  const isDemoMode = useAuthStore(s => s.isDemoMode);

  return {
    hasPermission: (p: Permission) => hasPermission(p),
    hasRole: (r: TeamRole) => hasRole(r),
    activeRole,
    isDemoMode,
    isOwner: activeRole === 'owner' || isDemoMode,
    isAdmin: hasRole('admin'),
    canEdit: hasPermission('contacts.edit'),
    canDelete: hasPermission('contacts.delete'),
    canManageMembers: hasPermission('team.members.manage'),
    canInvite: hasPermission('team.members.invite'),
  };
}
