'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore, useCRMStore, useOrganisationStore } from '@realestate-crm/hooks';
import type { Membership, Organisation } from '@realestate-crm/types';
import TeamSetup from './TeamSetup';

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: DashboardIcon, group: 'prospecting' },
  { href: '/prospecting', label: 'Prospecting', icon: ProspectingIcon, group: 'prospecting' },
  { href: '/pipeline', label: 'Pipeline', icon: PipelineIcon, group: 'prospecting' },
  { href: '/contacts', label: 'Contacts', icon: ContactsIcon, group: 'prospecting' },
  { href: '/map', label: 'Map', icon: MapIcon, group: 'prospecting' },
  { href: '/properties', label: 'Properties', icon: PropertiesIcon, group: 'listings' },
  { href: '/tasks', label: 'Tasks', icon: TasksIcon, group: 'operations' },
  { href: '/routes', label: 'Routes', icon: RoutesIcon, group: 'operations' },
  { href: '/tracking', label: 'Tracking', icon: TrackingIcon, group: 'operations' },
  { href: '/campaigns', label: 'Campaigns', icon: CampaignsIcon, group: 'grow' },
  { href: '/notes', label: 'Notes', icon: NotesIcon, group: 'grow' },
  { href: '/whiteboard', label: 'Whiteboard', icon: WhiteboardIcon, group: 'grow' },
  { href: '/reports', label: 'Reports', icon: ReportsIcon, group: 'grow' },
  { href: '/settings', label: 'Settings', icon: SettingsIcon, group: 'system' },
];

const NAV_GROUPS: { key: string; label: string }[] = [
  { key: 'prospecting', label: 'PROSPECTING' },
  { key: 'listings', label: 'LISTINGS' },
  { key: 'operations', label: 'OPERATIONS' },
  { key: 'grow', label: 'GROW' },
  { key: 'system', label: '' },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const profile = useAuthStore((s) => s.profile);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const signOut = useAuthStore((s) => s.signOut);
  const activeTeam = useAuthStore((s) => s.activeTeam);
  const memberships = useAuthStore((s) => s.memberships);
  const switchTeam = useAuthStore((s) => s.switchTeam);
  const activeRole = useAuthStore((s) => s.activeRole);
  const fetchContacts = useCRMStore((s) => s.fetchContacts);
  const fetchTags = useCRMStore((s) => s.fetchTags);
  const resetData = useCRMStore((s) => s.resetData);
  const organisations = useOrganisationStore((s) => s.organisations);
  const fetchUserOrgs = useOrganisationStore((s) => s.fetchUserOrgs);

  const [syncing, setSyncing] = useState(false);
  const [teamDropdownOpen, setTeamDropdownOpen] = useState(false);
  const [showTeamSetup, setShowTeamSetup] = useState(false);

  useEffect(() => {
    if (!isDemoMode) {
      fetchUserOrgs();
    }
  }, [isDemoMode, fetchUserOrgs]);

  // Group memberships by organisation for the team dropdown
  const groupedTeams = useMemo(() => {
    const orgMap = new Map<string, Organisation>();
    for (const org of organisations) {
      orgMap.set(org.id, org);
    }

    const grouped: { org: Organisation; members: Membership[] }[] = [];
    const independent: Membership[] = [];

    const orgBuckets = new Map<string, Membership[]>();

    for (const m of memberships) {
      const orgId = m.team?.organisation_id;
      if (orgId && orgMap.has(orgId)) {
        const bucket = orgBuckets.get(orgId) || [];
        bucket.push(m);
        orgBuckets.set(orgId, bucket);
      } else {
        independent.push(m);
      }
    }

    for (const [orgId, members] of orgBuckets) {
      const org = orgMap.get(orgId);
      if (org) {
        grouped.push({ org, members });
      }
    }

    // Sort org groups by name
    grouped.sort((a, b) => a.org.name.localeCompare(b.org.name));

    return { grouped, independent };
  }, [memberships, organisations]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await Promise.all([fetchTags(), fetchContacts()]);
    } finally {
      setSyncing(false);
    }
  }, [fetchTags, fetchContacts]);

  const handleSwitchTeam = useCallback(
    async (teamId: string) => {
      setTeamDropdownOpen(false);
      await switchTeam(teamId);
      await resetData();
    },
    [switchTeam, resetData]
  );

  const ROLE_COLORS: Record<string, string> = {
    owner: 'text-purple-600 bg-purple-50',
    admin: 'text-blue-600 bg-blue-50',
    member: 'text-green-600 bg-green-50',
    viewer: 'text-gray-600 bg-gray-50',
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="flex w-60 flex-col border-r border-gray-200 bg-white">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2 border-b border-gray-200 px-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-500 text-sm font-bold text-white">
            RE
          </div>
          <span className="font-semibold text-gray-900">Real Estate CRM</span>
        </div>

        {/* Team switcher */}
        {(activeTeam || isDemoMode) && (
          <div className="relative border-b border-gray-100">
            <button
              onClick={() => !isDemoMode && setTeamDropdownOpen(!teamDropdownOpen)}
              className={`flex w-full items-center gap-2 px-4 py-2.5 text-left ${
                !isDemoMode ? 'hover:bg-gray-50 cursor-pointer' : ''
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {isDemoMode ? 'Demo Mode' : activeTeam?.name}
                </p>
                {activeRole && !isDemoMode && (
                  <span className={`inline-block mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[activeRole] || ''}`}>
                    {activeRole}
                  </span>
                )}
              </div>
              {!isDemoMode && (
                <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${teamDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              )}
            </button>

            {teamDropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTeamDropdownOpen(false)} />
                <div className="absolute left-2 right-2 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  {/* Organisation-grouped teams */}
                  {groupedTeams.grouped.map(({ org, members }) => (
                    <div key={org.id}>
                      <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
                        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                        </svg>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                          {org.name}
                        </span>
                      </div>
                      {members.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleSwitchTeam(m.team_id)}
                          className={`flex w-full items-center gap-2 px-3 py-2 pl-7 text-left text-sm hover:bg-gray-50 ${
                            m.team_id === activeTeam?.id ? 'bg-primary-50' : ''
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate text-gray-900">
                            {m.team?.name || 'Unknown'}
                          </span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[m.role] || ''}`}>
                            {m.role}
                          </span>
                          {m.team_id === activeTeam?.id && (
                            <svg className="h-4 w-4 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  ))}

                  {/* Independent teams (no organisation) */}
                  {groupedTeams.independent.length > 0 && (
                    <div>
                      {groupedTeams.grouped.length > 0 && (
                        <div className="flex items-center gap-1.5 px-3 pb-1 pt-2.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                            Independent Teams
                          </span>
                        </div>
                      )}
                      {groupedTeams.independent.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleSwitchTeam(m.team_id)}
                          className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                            m.team_id === activeTeam?.id ? 'bg-primary-50' : ''
                          } ${groupedTeams.grouped.length > 0 ? 'pl-7' : ''}`}
                        >
                          <span className="min-w-0 flex-1 truncate text-gray-900">
                            {m.team?.name || 'Unknown'}
                          </span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ROLE_COLORS[m.role] || ''}`}>
                            {m.role}
                          </span>
                          {m.team_id === activeTeam?.id && (
                            <svg className="h-4 w-4 shrink-0 text-primary-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  <hr className="my-1" />
                  <button
                    onClick={() => { setTeamDropdownOpen(false); setShowTeamSetup(true); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary-600 hover:bg-gray-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Create or Join Team
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group, groupIndex) => {
            const groupItems = NAV_ITEMS.filter((item) => item.group === group.key);
            if (groupItems.length === 0) return null;
            return (
              <div key={group.key}>
                {groupIndex > 0 && (
                  <hr className="mx-3 my-2 border-gray-100" />
                )}
                {group.label && (
                  <p className="mb-1 px-3 pt-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {group.label}
                  </p>
                )}
                <div className="space-y-0.5">
                  {groupItems.map((item) => {
                    const isActive =
                      item.href === '/'
                        ? pathname === '/'
                        : pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <item.icon
                          className={`h-5 w-5 ${isActive ? 'text-primary-500' : 'text-gray-400'}`}
                        />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Sync button */}
        <div className="px-2 pb-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-50"
          >
            <SyncIcon className={`h-5 w-5 text-gray-400 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Data'}
          </button>
        </div>

        {/* User section */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-medium text-gray-600">
              {isDemoMode
                ? 'D'
                : (profile?.display_name?.[0] || 'U').toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-700">
                {isDemoMode ? 'Demo User' : profile?.display_name || 'User'}
              </p>
            </div>
            <button
              onClick={() => signOut()}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="Sign out"
            >
              <LogoutIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>

      {/* Team create/join modal */}
      {showTeamSetup && <TeamSetup onClose={() => setShowTeamSetup(false)} />}
    </div>
  );
}

/* Inline SVG icons */

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function PropertiesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" />
    </svg>
  );
}

function ContactsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function MapIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}

function RoutesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function NotesIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function ReportsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function PipelineIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  );
}

function TasksIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CampaignsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}

function ProspectingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
    </svg>
  );
}

function TrackingIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function WhiteboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  );
}
