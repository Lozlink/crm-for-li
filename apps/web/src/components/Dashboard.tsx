'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useCRMStore, useAuthStore } from '@realestate-crm/hooks';
import type { Contact, ActivityWithContact } from '@realestate-crm/types';

// --- Helpers ---

function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

function getDaysAgo(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

function parseSuburb(address?: string): string | null {
  if (!address) return null;
  const parts = address.split(',').map((s) => s.trim());
  // "123 Street, Suburb, State Postcode" → take second segment
  // "Suburb, State" → take first segment
  if (parts.length >= 3) return parts[1];
  if (parts.length === 2) return parts[0];
  return null;
}

const ACTIVITY_ICONS: Record<string, string> = {
  note: '📝',
  call: '📞',
  meeting: '🤝',
  email: '✉️',
};

// --- Main Component ---

export default function Dashboard() {
  const contacts = useCRMStore((s) => s.contacts);
  const tags = useCRMStore((s) => s.tags);
  const recentActivities = useCRMStore((s) => s.recentActivities);
  const fetchRecentActivities = useCRMStore((s) => s.fetchRecentActivities);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const activeTeam = useAuthStore((s) => s.activeTeam);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    fetchRecentActivities();
  }, [fetchRecentActivities]);

  // --- Territory Stats ---
  const stats = useMemo(() => {
    const now = Date.now();
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const propertiesMapped = contacts.filter(
      (c) => c.latitude != null && c.longitude != null
    ).length;

    const suburbs = new Set<string>();
    contacts.forEach((c) => {
      const s = parseSuburb(c.address);
      if (s) suburbs.add(s);
    });

    const addedThisWeek = contacts.filter(
      (c) => new Date(c.created_at || '').getTime() >= weekAgo
    ).length;

    return { propertiesMapped, areasCovered: suburbs.size, addedThisWeek };
  }, [contacts]);

  // --- Pipeline ---
  const pipeline = useMemo(() => {
    const tagCounts = tags.map((tag) => ({
      ...tag,
      count: contacts.filter((c) => c.tag_id === tag.id).length,
    }));
    const untagged = contacts.filter((c) => !c.tag_id).length;
    const total = contacts.length || 1; // avoid division by zero
    return { tagCounts, untagged, total };
  }, [contacts, tags]);

  // --- Top Areas ---
  const topAreas = useMemo(() => {
    const counts: Record<string, number> = {};
    contacts.forEach((c) => {
      const suburb = parseSuburb(c.address);
      if (suburb) counts[suburb] = (counts[suburb] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({ name, count }));
  }, [contacts]);

  const maxAreaCount = topAreas.length > 0 ? topAreas[0].count : 1;

  // --- Needs Follow-up ---
  const needsFollowUp = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return contacts
      .filter((c) => new Date(c.created_at || '').getTime() < cutoff)
      .sort(
        (a, b) =>
          new Date(a.created_at || '').getTime() -
          new Date(b.created_at || '').getTime()
      )
      .slice(0, 5);
  }, [contacts]);

  // --- Greeting ---
  const greeting = activeTeam?.name
    ? `Welcome back, ${activeTeam.name}`
    : user?.email
      ? `Welcome back`
      : 'Welcome';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header: Welcome + Quick Actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{greeting}</h1>
          <p className="text-sm text-gray-500">
            {isDemoMode
              ? 'Running in demo mode — data is stored locally'
              : 'Your real estate prospecting overview'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/contacts"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Contact
          </Link>
          <Link
            href="/map"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            Open Map
          </Link>
        </div>
      </div>

      {/* Row 1: Territory Stats */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
          label="Properties Mapped"
          value={stats.propertiesMapped}
          color="blue"
        />
        <StatCard
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          label="Areas Covered"
          value={stats.areasCovered}
          color="purple"
        />
        <StatCard
          icon={<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          label="Added This Week"
          value={stats.addedThisWeek}
          color="green"
        />
      </div>

      {/* Row 2: Pipeline + Top Areas */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Pipeline */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">Pipeline</h2>
          {pipeline.tagCounts.length === 0 && pipeline.untagged === 0 ? (
            <p className="text-sm text-gray-400">
              No contacts yet. Start prospecting to build your pipeline.
            </p>
          ) : (
            <div className="space-y-2.5">
              {pipeline.tagCounts.map((tag) => (
                <PipelineBar
                  key={tag.id}
                  label={tag.name}
                  count={tag.count}
                  total={pipeline.total}
                  color={tag.color}
                />
              ))}
              {pipeline.untagged > 0 && (
                <PipelineBar
                  label="Untagged"
                  count={pipeline.untagged}
                  total={pipeline.total}
                  color="#9CA3AF"
                />
              )}
            </div>
          )}
        </div>

        {/* Top Areas */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Top Areas
          </h2>
          {topAreas.length === 0 ? (
            <p className="text-sm text-gray-400">
              Add addresses to your contacts to see area stats.
            </p>
          ) : (
            <div className="space-y-2.5">
              {topAreas.map((area) => (
                <div key={area.name} className="flex items-center gap-3">
                  <span className="w-28 truncate text-sm text-gray-700">
                    {area.name}
                  </span>
                  <div className="flex-1">
                    <div className="h-2 rounded-full bg-gray-100">
                      <div
                        className="h-2 rounded-full bg-primary-500"
                        style={{
                          width: `${(area.count / maxAreaCount) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-500 w-6 text-right">
                    {area.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 3: Recent Activity + Needs Follow-up */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Recent Activity */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-3">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Recent Activity
          </h2>
          {recentActivities.length === 0 ? (
            <p className="text-sm text-gray-400">
              No activity yet. Start by adding notes to your contacts.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentActivities.map((activity) => (
                <ActivityRow key={activity.id} activity={activity} />
              ))}
            </div>
          )}
        </div>

        {/* Needs Follow-up */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Needs Follow-up
          </h2>
          {needsFollowUp.length === 0 ? (
            <p className="text-sm text-gray-400">
              No contacts need follow-up right now.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {needsFollowUp.map((contact) => (
                <FollowUpRow key={contact.id} contact={contact} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: 'blue' | 'green' | 'purple';
}) {
  const colorMap = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', value: 'text-blue-600' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', value: 'text-green-600' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', value: 'text-purple-600' },
  };
  const c = colorMap[color];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${c.bg} ${c.icon}`}>
          {icon}
        </div>
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className={`text-2xl font-bold ${c.value}`}>{value}</p>
        </div>
      </div>
    </div>
  );
}

function PipelineBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = Math.max((count / total) * 100, 2); // min 2% so it's visible
  return (
    <Link href="/contacts" className="group flex items-center gap-3">
      <span className="w-24 truncate text-sm text-gray-700 group-hover:text-gray-900">
        {label}
      </span>
      <div className="flex-1">
        <div className="h-5 rounded bg-gray-50">
          <div
            className="h-5 rounded transition-all group-hover:opacity-80"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
      <span className="text-xs font-medium text-gray-500 w-8 text-right">
        {count}
      </span>
    </Link>
  );
}

function ActivityRow({ activity }: { activity: ActivityWithContact }) {
  const contactName = [activity.contact?.first_name, activity.contact?.last_name]
    .filter(Boolean)
    .join(' ') || 'Unknown';
  const icon = ACTIVITY_ICONS[activity.type] || '📋';
  const timeAgo = getTimeAgo(new Date(activity.created_at || ''));

  return (
    <Link
      href={`/contacts/${activity.contact_id}`}
      className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <span className="text-base" title={activity.type}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">
          <span className="font-medium">{contactName}</span>
        </p>
        {activity.content && (
          <p className="truncate text-xs text-gray-500">{activity.content}</p>
        )}
      </div>
      <span className="text-xs text-gray-400 whitespace-nowrap">{timeAgo}</span>
    </Link>
  );
}

function FollowUpRow({ contact }: { contact: Contact }) {
  const displayName = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ') || 'Unnamed';
  const days = getDaysAgo(new Date(contact.created_at || ''));

  return (
    <Link
      href={`/contacts/${contact.id}`}
      className="flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-lg hover:bg-gray-50 transition-colors"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: contact.tag?.color || '#9CA3AF' }}
      >
        {(contact.first_name?.[0] || '?').toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
        <p className="truncate text-xs text-gray-500">
          {contact.address || 'No address'}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
        {days}d ago
      </span>
    </Link>
  );
}
