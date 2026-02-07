'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useCRMStore, useAuthStore } from '@realestate-crm/hooks';
import type { Contact } from '@realestate-crm/types';

export default function Dashboard() {
  const contacts = useCRMStore((s) => s.contacts);
  const tags = useCRMStore((s) => s.tags);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);

  const stats = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentContacts = contacts.filter(
      (c) => new Date(c.created_at || '') >= weekAgo
    );

    const tagBreakdown = tags.map((tag) => ({
      ...tag,
      count: contacts.filter((c) => c.tag_id === tag.id).length,
    }));

    const untagged = contacts.filter((c) => !c.tag_id).length;

    return {
      totalContacts: contacts.length,
      recentContacts: recentContacts.length,
      totalTags: tags.length,
      tagBreakdown,
      untagged,
    };
  }, [contacts, tags]);

  // Get recently added contacts for the feed
  const recentlyAdded = useMemo(() => {
    return [...contacts]
      .sort(
        (a, b) =>
          new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
      )
      .slice(0, 8);
  }, [contacts]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500">
          {isDemoMode
            ? 'Running in demo mode — data is stored locally'
            : 'Overview of your CRM activity'}
        </p>
      </div>

      {/* Stats cards */}
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Contacts"
          value={stats.totalContacts}
          color="blue"
        />
        <StatCard
          label="Added This Week"
          value={stats.recentContacts}
          color="green"
        />
        <StatCard label="Tags" value={stats.totalTags} color="purple" />
        <StatCard label="Untagged" value={stats.untagged} color="gray" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Tag breakdown */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-1">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Contacts by Tag
          </h2>
          {stats.tagBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400">
              No tags yet. Create tags in Settings.
            </p>
          ) : (
            <div className="space-y-3">
              {stats.tagBreakdown.map((tag) => (
                <div key={tag.id} className="flex items-center gap-3">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="flex-1 truncate text-sm text-gray-700">
                    {tag.name}
                  </span>
                  <span className="text-sm font-medium text-gray-500">
                    {tag.count}
                  </span>
                </div>
              ))}
              {stats.untagged > 0 && (
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-gray-300" />
                  <span className="flex-1 text-sm text-gray-500">
                    Untagged
                  </span>
                  <span className="text-sm font-medium text-gray-500">
                    {stats.untagged}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Recent contacts */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Recent Contacts
            </h2>
            <Link
              href="/contacts"
              className="text-xs font-medium text-primary-500 hover:text-primary-600"
            >
              View all
            </Link>
          </div>
          {recentlyAdded.length === 0 ? (
            <p className="text-sm text-gray-400">
              No contacts yet. Add your first contact.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {recentlyAdded.map((contact) => (
                <RecentContactRow key={contact.id} contact={contact} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'green' | 'purple' | 'gray';
}) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    gray: 'bg-gray-50 text-gray-600',
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${colorMap[color].split(' ')[1]}`}>
        {value}
      </p>
    </div>
  );
}

function RecentContactRow({ contact }: { contact: Contact }) {
  const displayName = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ');
  const date = new Date(contact.created_at || '');
  const timeAgo = getTimeAgo(date);

  return (
    <Link
      href={`/contacts/${contact.id}`}
      className="flex items-center gap-3 py-2.5 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors"
    >
      {/* Avatar */}
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium text-white"
        style={{
          backgroundColor: contact.tag?.color || '#9CA3AF',
        }}
      >
        {(contact.first_name?.[0] || '?').toUpperCase()}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">
          {displayName || 'Unnamed'}
        </p>
        <p className="truncate text-xs text-gray-500">
          {contact.address || contact.email || contact.phone || 'No details'}
        </p>
      </div>

      {/* Tag badge */}
      {contact.tag && (
        <span
          className="rounded-full px-2 py-0.5 text-xs font-medium"
          style={{
            backgroundColor: contact.tag.color + '20',
            color: contact.tag.color,
          }}
        >
          {contact.tag.name}
        </span>
      )}

      {/* Time */}
      <span className="text-xs text-gray-400">{timeAgo}</span>
    </Link>
  );
}

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
