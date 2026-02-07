'use client';

import { useState, useCallback } from 'react';
import { useAuthStore } from '@realestate-crm/hooks';
import { acceptInvitation } from '@realestate-crm/api';

type Mode = 'create' | 'join';

export default function TeamSetup() {
  const [mode, setMode] = useState<Mode>('create');
  const createTeam = useAuthStore((s) => s.createTeam);
  const fetchMemberships = useAuthStore((s) => s.fetchMemberships);
  const signOut = useAuthStore((s) => s.signOut);
  const profile = useAuthStore((s) => s.profile);

  const [teamName, setTeamName] = useState('');
  const [slug, setSlug] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const slugify = (name: string) =>
    name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleNameChange = (name: string) => {
    setTeamName(name);
    setSlug(slugify(name));
  };

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!teamName.trim()) return;
      setSaving(true);
      setError('');
      try {
        await createTeam(teamName.trim(), slug || slugify(teamName));
      } catch (err: any) {
        setError(err.message || 'Failed to create team');
      } finally {
        setSaving(false);
      }
    },
    [teamName, slug, createTeam]
  );

  const handleJoin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (inviteCode.length < 8) return;
      setSaving(true);
      setError('');
      try {
        await acceptInvitation(inviteCode.toUpperCase());
        await fetchMemberships();
      } catch (err: any) {
        setError(err.message || 'Invalid or expired invite code');
      } finally {
        setSaving(false);
      }
    },
    [inviteCode, fetchMemberships]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary-500 text-lg font-bold text-white">
            RE
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Set Up Your Team</h1>
          <p className="mt-1 text-sm text-gray-500">
            {profile?.display_name
              ? `Welcome, ${profile.display_name}! `
              : ''}
            Create a new team or join an existing one.
          </p>
        </div>

        {/* Mode toggle */}
        <div className="mb-6 flex rounded-lg border border-gray-200 bg-white p-1">
          <button
            onClick={() => { setMode('create'); setError(''); }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'create'
                ? 'bg-primary-500 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Create Team
          </button>
          <button
            onClick={() => { setMode('join'); setError(''); }}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === 'join'
                ? 'bg-primary-500 text-white'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            I Have an Invite
          </button>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {mode === 'create' ? (
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Agency / Team Name
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="e.g. Smith Real Estate"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Team Slug
                </label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="smith-real-estate"
                />
                <p className="mt-1 text-xs text-gray-400">URL-friendly identifier</p>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={saving || !teamName.trim()}
                className="w-full rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? 'Creating...' : 'Create Team'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Invite Code
                </label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 8))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-center font-mono text-lg tracking-widest focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="ABCD1234"
                  maxLength={8}
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-400">
                  Enter the 8-character code from your team admin
                </p>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={saving || inviteCode.length < 8}
                className="w-full rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {saving ? 'Joining...' : 'Join Team'}
              </button>
            </form>
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
