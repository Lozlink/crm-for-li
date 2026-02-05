export type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';
export type MembershipStatus = 'active' | 'invited' | 'suspended';
export type TeamPlan = 'free' | 'pro' | 'team';
export type TeamStatus = 'active' | 'suspended';

export interface UserProfile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  active_team_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Team {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  avatar_url: string | null;
  settings: Record<string, unknown>;
  plan: TeamPlan;
  status: TeamStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Membership {
  id: string;
  user_id: string;
  team_id: string;
  role: TeamRole;
  status: MembershipStatus;
  invited_by: string | null;
  joined_at: string | null;
  created_at?: string;
  updated_at?: string;
  // Joined relations
  team?: Team;
  profile?: UserProfile;
}

export interface Invitation {
  id: string;
  team_id: string;
  email: string | null;
  invite_code: string;
  role: TeamRole;
  invited_by: string;
  expires_at: string;
  accepted_at: string | null;
  created_at?: string;
}
