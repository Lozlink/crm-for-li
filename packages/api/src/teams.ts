import { supabase } from './supabase';
import type { Team, Membership, Invitation, TeamRole } from '@realestate-crm/types';

export async function createTeam(name: string, slug: string): Promise<Team> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Create team
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .insert({ name, slug, owner_id: user.id })
    .select()
    .single();

  if (teamError) throw teamError;

  // Create owner membership
  const { error: memberError } = await supabase
    .from('memberships')
    .insert({
      user_id: user.id,
      team_id: team.id,
      role: 'owner',
      status: 'active',
      joined_at: new Date().toISOString(),
    });

  if (memberError) throw memberError;

  // Set as active team
  await supabase
    .from('user_profiles')
    .update({ active_team_id: team.id })
    .eq('id', user.id);

  return team as Team;
}

export async function fetchUserTeams(): Promise<Membership[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('memberships')
    .select('*, team:teams(*)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at');

  if (error) throw error;
  return (data || []) as Membership[];
}

export async function fetchTeamMembers(teamId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from('memberships')
    .select('*, profile:user_profiles(*)')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('joined_at');

  if (error) throw error;
  return (data || []) as Membership[];
}

export async function updateMemberRole(membershipId: string, role: TeamRole) {
  const { error } = await supabase
    .from('memberships')
    .update({ role })
    .eq('id', membershipId);

  if (error) throw error;
}

export async function removeMember(membershipId: string) {
  const { error } = await supabase
    .from('memberships')
    .delete()
    .eq('id', membershipId);

  if (error) throw error;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createInvitation(
  teamId: string,
  role: TeamRole = 'member',
  email?: string
): Promise<Invitation> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('invitations')
    .insert({
      team_id: teamId,
      role,
      email: email || null,
      invite_code: generateInviteCode(),
      invited_by: user.id,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Invitation;
}

export async function acceptInvitation(inviteCode: string) {
  const { data, error } = await supabase.rpc('accept_invitation', {
    p_invite_code: inviteCode,
  });

  if (error) throw error;

  const result = data as { success: boolean; error?: string; team_id?: string; membership_id?: string };
  if (!result.success) {
    throw new Error(result.error || 'Failed to accept invitation');
  }

  return result;
}

export async function switchActiveTeam(teamId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('user_profiles')
    .update({ active_team_id: teamId })
    .eq('id', user.id);

  if (error) throw error;
}

export async function updateTeam(teamId: string, updates: Partial<Pick<Team, 'name' | 'slug' | 'avatar_url' | 'settings'>>) {
  const { data, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', teamId)
    .select()
    .single();

  if (error) throw error;
  return data as Team;
}

export async function deleteTeam(teamId: string) {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId);

  if (error) throw error;
}

export async function fetchTeamInvitations(teamId: string): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*')
    .eq('team_id', teamId)
    .is('accepted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []) as Invitation[];
}
