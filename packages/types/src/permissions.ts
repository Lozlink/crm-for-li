import type { TeamRole } from './auth';

export const ROLE_HIERARCHY: Record<TeamRole, number> = {
  owner: 4,
  admin: 3,
  member: 2,
  viewer: 1,
};

export type Permission =
  | 'contacts.view'
  | 'contacts.create'
  | 'contacts.edit'
  | 'contacts.delete'
  | 'tags.manage'
  | 'activities.view'
  | 'activities.create'
  | 'team.settings'
  | 'team.members.view'
  | 'team.members.manage'
  | 'team.members.invite'
  | 'team.delete';

export const ROLE_PERMISSIONS: Record<TeamRole, Permission[]> = {
  viewer: [
    'contacts.view',
    'activities.view',
    'team.members.view',
  ],
  member: [
    'contacts.view',
    'contacts.create',
    'contacts.edit',
    'activities.view',
    'activities.create',
    'tags.manage',
    'team.members.view',
  ],
  admin: [
    'contacts.view',
    'contacts.create',
    'contacts.edit',
    'contacts.delete',
    'activities.view',
    'activities.create',
    'tags.manage',
    'team.settings',
    'team.members.view',
    'team.members.manage',
    'team.members.invite',
  ],
  owner: [
    'contacts.view',
    'contacts.create',
    'contacts.edit',
    'contacts.delete',
    'activities.view',
    'activities.create',
    'tags.manage',
    'team.settings',
    'team.members.view',
    'team.members.manage',
    'team.members.invite',
    'team.delete',
  ],
};

export function hasRole(currentRole: TeamRole, requiredRole: TeamRole): boolean {
  return ROLE_HIERARCHY[currentRole] >= ROLE_HIERARCHY[requiredRole];
}

export function hasPermission(role: TeamRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
