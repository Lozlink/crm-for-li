'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useCRMStore, useAuthStore, useOrganisationStore } from '@realestate-crm/hooks';
import { TAG_COLORS } from '@realestate-crm/config';
import {
  updateProfile,
  updateTeam,
  deleteTeam,
  updateMemberRole,
  removeMember,
  createInvitation,
  fetchTeamInvitations,
} from '@realestate-crm/api';
import type { Tag, TeamRole, Membership, Invitation, Organisation, OrgRole, OrganisationMembership } from '@realestate-crm/types';

// --- Role badge colors ---
const ROLE_COLORS: Record<string, string> = {
  owner: 'text-purple-700 bg-purple-100',
  admin: 'text-blue-700 bg-blue-100',
  member: 'text-green-700 bg-green-100',
  viewer: 'text-gray-700 bg-gray-100',
};

const ASSIGNABLE_ROLES: { value: TeamRole; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

// --- Main component ---

export default function SettingsView() {
  const tags = useCRMStore((s) => s.tags);
  const addTag = useCRMStore((s) => s.addTag);
  const updateTagAction = useCRMStore((s) => s.updateTag);
  const deleteTagAction = useCRMStore((s) => s.deleteTag);
  const contacts = useCRMStore((s) => s.contacts);

  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const profile = useAuthStore((s) => s.profile);
  const user = useAuthStore((s) => s.user);
  const activeTeam = useAuthStore((s) => s.activeTeam);
  const activeRole = useAuthStore((s) => s.activeRole);
  const teamMembers = useAuthStore((s) => s.teamMembers);
  const fetchTeamMembers = useAuthStore((s) => s.fetchTeamMembers);
  const signOut = useAuthStore((s) => s.signOut);
  const hasPermission = useAuthStore((s) => s.hasPermission);

  const organisations = useOrganisationStore((s) => s.organisations);
  const orgMemberships = useOrganisationStore((s) => s.orgMemberships);
  const orgTeams = useOrganisationStore((s) => s.orgTeams);
  const fetchUserOrgs = useOrganisationStore((s) => s.fetchUserOrgs);
  const createOrg = useOrganisationStore((s) => s.createOrg);
  const updateOrgAction = useOrganisationStore((s) => s.updateOrg);
  const addTeamToOrg = useOrganisationStore((s) => s.addTeamToOrg);
  const fetchOrgTeams = useOrganisationStore((s) => s.fetchOrgTeams);
  const inviteToOrg = useOrganisationStore((s) => s.inviteToOrg);
  const removeFromOrg = useOrganisationStore((s) => s.removeFromOrg);
  const memberships = useAuthStore((s) => s.memberships);

  const canManageTeam = hasPermission('team.settings');
  const canManageMembers = hasPermission('team.members.manage');
  const canInvite = hasPermission('team.members.invite');
  const canDeleteTeam = hasPermission('team.delete');

  // Load team members on mount
  useEffect(() => {
    if (activeTeam && !isDemoMode) {
      fetchTeamMembers(activeTeam.id);
    }
  }, [activeTeam, isDemoMode, fetchTeamMembers]);

  // Load organisations on mount
  useEffect(() => {
    if (!isDemoMode) {
      fetchUserOrgs();
    }
  }, [isDemoMode, fetchUserOrgs]);

  // Stats
  const totalContacts = contacts.length;
  const mappedContacts = contacts.filter((c) => c.latitude && c.longitude).length;
  const totalTags = tags.length;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      {/* Profile section */}
      <ProfileSection profile={profile} isDemoMode={isDemoMode} />

      {/* Team section */}
      {!isDemoMode && activeTeam && (
        <TeamSection
          team={activeTeam}
          role={activeRole}
          canManage={canManageTeam}
        />
      )}

      {/* Members section */}
      {!isDemoMode && activeTeam && (
        <MembersSection
          teamId={activeTeam.id}
          members={teamMembers}
          currentUserId={user?.id}
          canManage={canManageMembers}
          canInvite={canInvite}
          onRefresh={() => fetchTeamMembers(activeTeam.id)}
        />
      )}

      {/* Invitations section */}
      {!isDemoMode && activeTeam && canInvite && (
        <InvitationsSection teamId={activeTeam.id} />
      )}

      {/* Organisation section */}
      {!isDemoMode && (
        <OrganisationSection
          organisations={organisations}
          orgMemberships={orgMemberships}
          orgTeams={orgTeams}
          userMemberships={memberships}
          currentUserId={user?.id}
          onCreateOrg={createOrg}
          onUpdateOrg={updateOrgAction}
          onAddTeamToOrg={addTeamToOrg}
          onFetchOrgTeams={fetchOrgTeams}
          onInviteToOrg={inviteToOrg}
          onRemoveFromOrg={removeFromOrg}
          onRefresh={fetchUserOrgs}
        />
      )}

      {/* Statistics */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Statistics
        </h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalContacts}</p>
            <p className="text-xs text-gray-500">Contacts</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{mappedContacts}</p>
            <p className="text-xs text-gray-500">Mapped</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-gray-900">{totalTags}</p>
            <p className="text-xs text-gray-500">Tags</p>
          </div>
        </div>
      </section>

      {/* Tags */}
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Tags
        </h2>
        <TagForm onAdd={addTag} />
        <div className="mt-4 divide-y divide-gray-100">
          {tags.length === 0 ? (
            <p className="py-4 text-sm text-gray-400">
              No tags yet. Create your first tag above.
            </p>
          ) : (
            tags.map((tag) => (
              <TagRow
                key={tag.id}
                tag={tag}
                onUpdate={updateTagAction}
                onDelete={deleteTagAction}
              />
            ))
          )}
        </div>
      </section>

      {/* Danger Zone */}
      {!isDemoMode && activeTeam && (
        <DangerZone
          teamId={activeTeam.id}
          teamName={activeTeam.name}
          canDelete={canDeleteTeam}
          onSignOut={() => signOut()}
        />
      )}

      {/* About */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          About
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Mode</span>
            <span className="text-gray-900">
              {isDemoMode ? 'Demo (Local Storage)' : 'Connected to Supabase'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Version</span>
            <span className="text-gray-900">1.0.0</span>
          </div>
        </div>
      </section>
    </div>
  );
}

// --- Profile Section ---

function ProfileSection({
  profile,
  isDemoMode,
}: {
  profile: any;
  isDemoMode: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      await updateProfile({ display_name: displayName.trim() });
      setEditing(false);
      // Note: profile in store won't auto-update since we call API directly
      // A page refresh will pick it up
    } catch (err) {
      console.error('Update profile error:', err);
    } finally {
      setSaving(false);
    }
  }, [displayName]);

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
        Profile
      </h2>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700">
          {isDemoMode
            ? 'D'
            : (profile?.display_name?.[0] || 'U').toUpperCase()}
        </div>
        <div className="flex-1">
          {isDemoMode ? (
            <p className="text-sm font-medium text-gray-900">Demo User</p>
          ) : editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? '...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setDisplayName(profile?.display_name || '');
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">
                {profile?.display_name || 'No name set'}
              </p>
              <button
                onClick={() => setEditing(true)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Edit
              </button>
            </div>
          )}
          <p className="mt-0.5 text-xs text-gray-500">
            {isDemoMode ? 'Local data only' : profile?.id ? `ID: ${profile.id.slice(0, 8)}...` : ''}
          </p>
        </div>
      </div>
    </section>
  );
}

// --- Team Section ---

function TeamSection({
  team,
  role,
  canManage,
}: {
  team: { id: string; name: string; slug: string };
  role: TeamRole | null;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(team.name);
  const [saving, setSaving] = useState(false);
  const fetchMemberships = useAuthStore((s) => s.fetchMemberships);

  const handleSave = useCallback(async () => {
    if (!name.trim() || name.trim() === team.name) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await updateTeam(team.id, { name: name.trim() });
      await fetchMemberships(); // refresh team data in store
      setEditing(false);
    } catch (err) {
      console.error('Update team error:', err);
    } finally {
      setSaving(false);
    }
  }, [name, team.id, team.name, fetchMemberships]);

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
        Team
      </h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Team Name</span>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? '...' : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setName(team.name); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900">{team.name}</span>
              {canManage && (
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Edit
                </button>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Slug</span>
          <span className="text-sm text-gray-500 font-mono">{team.slug}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Your Role</span>
          {role && (
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[role]}`}>
              {role}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

// --- Members Section ---

function MembersSection({
  teamId,
  members,
  currentUserId,
  canManage,
  canInvite,
  onRefresh,
}: {
  teamId: string;
  members: Membership[];
  currentUserId?: string;
  canManage: boolean;
  canInvite: boolean;
  onRefresh: () => void;
}) {
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const handleRoleChange = useCallback(
    async (membershipId: string, role: TeamRole) => {
      try {
        await updateMemberRole(membershipId, role);
        onRefresh();
      } catch (err) {
        console.error('Update role error:', err);
      }
      setMenuOpenId(null);
    },
    [onRefresh]
  );

  const handleRemove = useCallback(
    async (membershipId: string, memberName: string) => {
      if (!window.confirm(`Remove ${memberName} from the team?`)) return;
      try {
        await removeMember(membershipId);
        onRefresh();
      } catch (err) {
        console.error('Remove member error:', err);
      }
    },
    [onRefresh]
  );

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase text-gray-500">
          Members ({members.length})
        </h2>
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-gray-400">Loading members...</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {members.map((m) => {
            const name = m.profile?.display_name || 'Unknown';
            const isCurrentUser = m.user_id === currentUserId;
            const isOwner = m.role === 'owner';
            const showMenu = canManage && !isCurrentUser && !isOwner;

            return (
              <div key={m.id} className="flex items-center gap-3 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                  {(name[0] || '?').toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {name}
                    {isCurrentUser && (
                      <span className="ml-1 text-xs text-gray-400">(You)</span>
                    )}
                  </p>
                  {m.joined_at && (
                    <p className="text-xs text-gray-400">
                      Joined {new Date(m.joined_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[m.role]}`}>
                  {m.role}
                </span>
                {showMenu && (
                  <div className="relative">
                    <button
                      onClick={() => setMenuOpenId(menuOpenId === m.id ? null : m.id)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                      </svg>
                    </button>
                    {menuOpenId === m.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
                        <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                          {ASSIGNABLE_ROLES.map((r) => (
                            <button
                              key={r.value}
                              onClick={() => handleRoleChange(m.id, r.value)}
                              disabled={m.role === r.value}
                              className="flex w-full items-center px-3 py-1.5 text-left text-sm hover:bg-gray-50 disabled:text-gray-300"
                            >
                              Make {r.label}
                            </button>
                          ))}
                          <hr className="my-1" />
                          <button
                            onClick={() => handleRemove(m.id, name)}
                            className="flex w-full items-center px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// --- Invitations Section ---

function InvitationsSection({ teamId }: { teamId: string }) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [role, setRole] = useState<TeamRole>('member');
  const [email, setEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    loadInvitations();
  }, [teamId]);

  const loadInvitations = async () => {
    try {
      const data = await fetchTeamInvitations(teamId);
      setInvitations(data);
    } catch (err) {
      console.error('Fetch invitations error:', err);
    }
  };

  const handleCreate = useCallback(async () => {
    setCreating(true);
    setNewCode('');
    try {
      const invite = await createInvitation(
        teamId,
        role,
        email.trim() || undefined
      );
      setNewCode(invite.invite_code);
      setEmail('');
      await loadInvitations();
    } catch (err) {
      console.error('Create invitation error:', err);
    } finally {
      setCreating(false);
    }
  }, [teamId, role, email]);

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
  };

  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
        Invitations
      </h2>

      {/* Create invitation */}
      <div className="mb-4 space-y-3 rounded-lg bg-gray-50 p-4">
        <p className="text-sm font-medium text-gray-700">Generate Invite Code</p>
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <div className="flex rounded-lg border border-gray-300 bg-white">
            {ASSIGNABLE_ROLES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRole(r.value)}
                className={`px-3 py-2 text-xs font-medium transition-colors ${
                  role === r.value
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-600 hover:bg-gray-50'
                } ${r.value === 'admin' ? 'rounded-l-lg' : ''} ${r.value === 'viewer' ? 'rounded-r-lg' : ''}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {creating ? '...' : 'Generate'}
          </button>
        </div>

        {newCode && (
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-3">
            <span className="font-mono text-lg font-bold tracking-widest text-green-800">
              {newCode}
            </span>
            <button
              onClick={() => copyCode(newCode)}
              className="rounded px-2 py-1 text-xs font-medium text-green-700 hover:bg-green-100"
            >
              Copy
            </button>
          </div>
        )}
      </div>

      {/* Active invitations */}
      {invitations.length > 0 ? (
        <div className="divide-y divide-gray-100">
          {invitations.map((inv) => (
            <div key={inv.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium tracking-wider text-gray-900">
                    {inv.invite_code}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[inv.role]}`}>
                    {inv.role}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {inv.email && <span>{inv.email} &middot; </span>}
                  Expires {new Date(inv.expires_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => copyCode(inv.invite_code)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="Copy code"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400">No pending invitations.</p>
      )}
    </section>
  );
}

// --- Danger Zone ---

function DangerZone({
  teamId,
  teamName,
  canDelete,
  onSignOut,
}: {
  teamId: string;
  teamName: string;
  canDelete: boolean;
  onSignOut: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleLeaveTeam = useCallback(async () => {
    if (!window.confirm('Are you sure you want to leave this team?')) return;
    // For now, sign out (same as mobile behavior)
    onSignOut();
  }, [onSignOut]);

  const handleDeleteTeam = useCallback(async () => {
    if (!window.confirm(`Delete "${teamName}" permanently? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deleteTeam(teamId);
      onSignOut();
    } catch (err) {
      console.error('Delete team error:', err);
      setDeleting(false);
    }
  }, [teamId, teamName, onSignOut]);

  return (
    <section className="mb-6 rounded-xl border border-red-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase text-red-500">
        Danger Zone
      </h2>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-900">Leave Team</p>
            <p className="text-xs text-gray-500">
              You will lose access to this team&apos;s data.
            </p>
          </div>
          <button
            onClick={handleLeaveTeam}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
          >
            Leave Team
          </button>
        </div>
        {canDelete && (
          <div className="flex items-center justify-between border-t border-red-100 pt-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Delete Team</p>
              <p className="text-xs text-gray-500">
                Permanently delete this team and all its data.
              </p>
            </div>
            <button
              onClick={handleDeleteTeam}
              disabled={deleting}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Team'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// --- Organisation Section ---

const ORG_ROLE_COLORS: Record<string, string> = {
  org_admin: 'text-purple-700 bg-purple-100',
  member: 'text-green-700 bg-green-100',
};

function OrganisationSection({
  organisations,
  orgMemberships,
  orgTeams,
  userMemberships,
  currentUserId,
  onCreateOrg,
  onUpdateOrg,
  onAddTeamToOrg,
  onFetchOrgTeams,
  onInviteToOrg,
  onRemoveFromOrg,
  onRefresh,
}: {
  organisations: Organisation[];
  orgMemberships: OrganisationMembership[];
  orgTeams: import('@realestate-crm/types').Team[];
  userMemberships: Membership[];
  currentUserId?: string;
  onCreateOrg: (name: string) => Promise<Organisation | null>;
  onUpdateOrg: (id: string, updates: Partial<Organisation>) => Promise<void>;
  onAddTeamToOrg: (orgId: string, teamId: string) => Promise<void>;
  onFetchOrgTeams: (orgId: string) => Promise<void>;
  onInviteToOrg: (orgId: string, userId: string, role: OrgRole) => Promise<void>;
  onRemoveFromOrg: (orgId: string, userId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [addTeamOrgId, setAddTeamOrgId] = useState<string | null>(null);
  const [inviteOrgId, setInviteOrgId] = useState<string | null>(null);
  const [inviteUserId, setInviteUserId] = useState('');
  const [inviteRole, setInviteRole] = useState<OrgRole>('member');
  const [inviting, setInviting] = useState(false);
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  // Determine user's role in each org
  const getUserOrgRole = useCallback(
    (orgId: string): OrgRole | null => {
      const membership = orgMemberships.find(
        (m) => m.organisation_id === orgId && m.user_id === currentUserId
      );
      return membership?.role || null;
    },
    [orgMemberships, currentUserId]
  );

  // Teams not yet assigned to a given org
  const getAvailableTeams = useCallback(
    (orgId: string) => {
      const orgTeamIds = new Set(orgTeams.filter((t) => t.organisation_id === orgId).map((t) => t.id));
      return userMemberships
        .filter((m) => m.team && !m.team.organisation_id)
        .map((m) => m.team!)
        .filter((t) => !orgTeamIds.has(t.id));
    },
    [orgTeams, userMemberships]
  );

  // Members of a given org
  const getOrgMembers = useCallback(
    (orgId: string) => {
      return orgMemberships.filter((m) => m.organisation_id === orgId);
    },
    [orgMemberships]
  );

  const handleCreateOrg = useCallback(async () => {
    if (!newOrgName.trim()) return;
    setCreating(true);
    try {
      await onCreateOrg(newOrgName.trim());
      setNewOrgName('');
      await onRefresh();
    } catch (err) {
      console.error('Create org error:', err);
    } finally {
      setCreating(false);
    }
  }, [newOrgName, onCreateOrg, onRefresh]);

  const handleSaveName = useCallback(
    async (orgId: string) => {
      if (!editName.trim()) return;
      setSavingName(true);
      try {
        await onUpdateOrg(orgId, { name: editName.trim() });
        setEditingOrgId(null);
        await onRefresh();
      } catch (err) {
        console.error('Update org error:', err);
      } finally {
        setSavingName(false);
      }
    },
    [editName, onUpdateOrg, onRefresh]
  );

  const handleAddTeam = useCallback(
    async (orgId: string, teamId: string) => {
      try {
        await onAddTeamToOrg(orgId, teamId);
        setAddTeamOrgId(null);
        await onRefresh();
      } catch (err) {
        console.error('Add team to org error:', err);
      }
    },
    [onAddTeamToOrg, onRefresh]
  );

  const handleInvite = useCallback(async () => {
    if (!inviteOrgId || !inviteUserId.trim()) return;
    setInviting(true);
    try {
      await onInviteToOrg(inviteOrgId, inviteUserId.trim(), inviteRole);
      setInviteUserId('');
      setInviteOrgId(null);
      await onRefresh();
    } catch (err) {
      console.error('Invite to org error:', err);
    } finally {
      setInviting(false);
    }
  }, [inviteOrgId, inviteUserId, inviteRole, onInviteToOrg, onRefresh]);

  const handleRemoveMember = useCallback(
    async (orgId: string, userId: string) => {
      if (!window.confirm('Remove this member from the organisation?')) return;
      try {
        await onRemoveFromOrg(orgId, userId);
        await onRefresh();
      } catch (err) {
        console.error('Remove from org error:', err);
      }
    },
    [onRemoveFromOrg, onRefresh]
  );

  const handleExpandOrg = useCallback(
    (orgId: string) => {
      if (expandedOrgId === orgId) {
        setExpandedOrgId(null);
      } else {
        setExpandedOrgId(orgId);
        onFetchOrgTeams(orgId);
      }
    },
    [expandedOrgId, onFetchOrgTeams]
  );

  // No organisations — show create prompt
  if (organisations.length === 0) {
    return (
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Organisation
        </h2>
        <p className="mb-4 text-sm text-gray-500">
          Organisations let you group multiple teams/offices under one admin umbrella.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={newOrgName}
            onChange={(e) => setNewOrgName(e.target.value)}
            placeholder="Organisation name"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            onClick={handleCreateOrg}
            disabled={creating || !newOrgName.trim()}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Organisation'}
          </button>
        </div>
      </section>
    );
  }

  // Has organisations — show management UI
  return (
    <section className="mb-6 rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
        Organisation
      </h2>

      <div className="space-y-4">
        {organisations.map((org) => {
          const role = getUserOrgRole(org.id);
          const isAdmin = role === 'org_admin';
          const isExpanded = expandedOrgId === org.id;
          const members = getOrgMembers(org.id);
          const availableTeams = getAvailableTeams(org.id);
          const teamsInOrg = orgTeams.filter((t) => t.organisation_id === org.id);

          return (
            <div key={org.id} className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              {/* Org name & role */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                  </svg>
                  {editingOrgId === org.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        autoFocus
                      />
                      <button
                        onClick={() => handleSaveName(org.id)}
                        disabled={savingName}
                        className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                      >
                        {savingName ? '...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditingOrgId(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{org.name}</span>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setEditingOrgId(org.id);
                            setEditName(org.name);
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {role && (
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${ORG_ROLE_COLORS[role] || ''}`}>
                      {role === 'org_admin' ? 'Admin' : 'Member'}
                    </span>
                  )}
                  <button
                    onClick={() => handleExpandOrg(org.id)}
                    className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                  >
                    <svg className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="mt-4 space-y-4">
                  {/* Teams in this org */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase text-gray-500">
                        Teams ({teamsInOrg.length})
                      </h4>
                      {isAdmin && availableTeams.length > 0 && (
                        <button
                          onClick={() => setAddTeamOrgId(addTeamOrgId === org.id ? null : org.id)}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                          + Add Team
                        </button>
                      )}
                    </div>

                    {addTeamOrgId === org.id && (
                      <div className="mb-2 rounded-lg border border-gray-200 bg-white p-3">
                        <p className="mb-2 text-xs text-gray-500">Select a team to add:</p>
                        <div className="space-y-1">
                          {availableTeams.map((team) => (
                            <button
                              key={team.id}
                              onClick={() => handleAddTeam(org.id, team.id)}
                              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-gray-50"
                            >
                              <span className="text-gray-900">{team.name}</span>
                            </button>
                          ))}
                          {availableTeams.length === 0 && (
                            <p className="text-xs text-gray-400">No unassigned teams available.</p>
                          )}
                        </div>
                      </div>
                    )}

                    {teamsInOrg.length === 0 ? (
                      <p className="text-xs text-gray-400">No teams in this organisation yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {teamsInOrg.map((team) => (
                          <div key={team.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
                            <span className="text-sm text-gray-900">{team.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Members */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-xs font-semibold uppercase text-gray-500">
                        Members ({members.length})
                      </h4>
                      {isAdmin && (
                        <button
                          onClick={() => setInviteOrgId(inviteOrgId === org.id ? null : org.id)}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700"
                        >
                          + Invite
                        </button>
                      )}
                    </div>

                    {inviteOrgId === org.id && (
                      <div className="mb-2 rounded-lg border border-gray-200 bg-white p-3">
                        <p className="mb-2 text-xs text-gray-500">Invite a user by their ID:</p>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={inviteUserId}
                            onChange={(e) => setInviteUserId(e.target.value)}
                            placeholder="User ID"
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                          <div className="flex rounded-lg border border-gray-300 bg-white">
                            <button
                              onClick={() => setInviteRole('org_admin')}
                              className={`px-3 py-1.5 text-xs font-medium rounded-l-lg transition-colors ${
                                inviteRole === 'org_admin' ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Admin
                            </button>
                            <button
                              onClick={() => setInviteRole('member')}
                              className={`px-3 py-1.5 text-xs font-medium rounded-r-lg transition-colors ${
                                inviteRole === 'member' ? 'bg-primary-500 text-white' : 'text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Member
                            </button>
                          </div>
                          <button
                            onClick={handleInvite}
                            disabled={inviting || !inviteUserId.trim()}
                            className="rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                          >
                            {inviting ? '...' : 'Invite'}
                          </button>
                        </div>
                      </div>
                    )}

                    {members.length === 0 ? (
                      <p className="text-xs text-gray-400">No members found.</p>
                    ) : (
                      <div className="space-y-1">
                        {members.map((m) => (
                          <div key={m.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
                              {m.user_id === currentUserId ? 'Y' : '?'}
                            </div>
                            <span className="flex-1 text-sm text-gray-900">
                              {m.user_id === currentUserId ? 'You' : m.user_id.slice(0, 8) + '...'}
                            </span>
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${ORG_ROLE_COLORS[m.role] || ''}`}>
                              {m.role === 'org_admin' ? 'Admin' : 'Member'}
                            </span>
                            {isAdmin && m.user_id !== currentUserId && (
                              <button
                                onClick={() => handleRemoveMember(org.id, m.user_id)}
                                className="rounded p-1 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create another org */}
      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={newOrgName}
          onChange={(e) => setNewOrgName(e.target.value)}
          placeholder="New organisation name"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
        <button
          onClick={handleCreateOrg}
          disabled={creating || !newOrgName.trim()}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {creating ? '...' : 'Create'}
        </button>
      </div>
    </section>
  );
}

// --- Tag Form & Row (preserved from original) ---

function TagForm({
  onAdd,
}: {
  onAdd: (tag: { name: string; color: string }) => Promise<any>;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TAG_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      setSaving(true);
      await onAdd({ name: name.trim(), color });
      setName('');
      setColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]);
      setSaving(false);
    },
    [name, color, onAdd]
  );

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex-1">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Tag name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Hot Lead"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Color
        </label>
        <div className="flex gap-1">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-8 w-8 rounded-full border-2 transition-transform ${
                color === c
                  ? 'scale-110 border-gray-900'
                  : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
      <button
        type="submit"
        disabled={saving || !name.trim()}
        className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
      >
        {saving ? 'Adding...' : 'Add Tag'}
      </button>
    </form>
  );
}

function TagRow({
  tag,
  onUpdate,
  onDelete,
}: {
  tag: Tag;
  onUpdate: (id: string, data: Partial<Tag>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    await onUpdate(tag.id, { name: name.trim(), color });
    setEditing(false);
  }, [tag.id, name, color, onUpdate]);

  const handleDelete = useCallback(async () => {
    if (window.confirm(`Delete tag "${tag.name}"?`)) {
      await onDelete(tag.id);
    }
  }, [tag, onDelete]);

  if (editing) {
    return (
      <div className="flex items-center gap-3 py-3">
        <div
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: color }}
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none"
          autoFocus
        />
        <div className="flex gap-1">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`h-5 w-5 rounded-full border ${
                color === c ? 'border-gray-900' : 'border-transparent'
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <button
          onClick={handleSave}
          className="rounded px-2 py-1 text-xs font-medium text-primary-500 hover:bg-primary-50"
        >
          Save
        </button>
        <button
          onClick={() => {
            setEditing(false);
            setName(tag.name);
            setColor(tag.color);
          }}
          className="rounded px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-3">
      <div
        className="h-4 w-4 rounded-full"
        style={{ backgroundColor: tag.color }}
      />
      <span className="flex-1 text-sm text-gray-900">{tag.name}</span>
      <button
        onClick={() => setEditing(true)}
        className="rounded px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
      >
        Edit
      </button>
      <button
        onClick={handleDelete}
        className="rounded px-2 py-1 text-xs text-red-400 hover:text-red-600"
      >
        Delete
      </button>
    </div>
  );
}
