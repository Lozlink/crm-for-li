'use client';

import { useState, useCallback } from 'react';
import { useCRMStore, useAuthStore } from '@realestate-crm/hooks';
import { TAG_COLORS } from '@realestate-crm/config';
import type { Tag } from '@realestate-crm/types';

export default function SettingsView() {
  const tags = useCRMStore((s) => s.tags);
  const addTag = useCRMStore((s) => s.addTag);
  const updateTag = useCRMStore((s) => s.updateTag);
  const deleteTag = useCRMStore((s) => s.deleteTag);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const profile = useAuthStore((s) => s.profile);
  const activeTeam = useAuthStore((s) => s.activeTeam);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Settings</h1>

      {/* Account info */}
      <section className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Account
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">Mode</span>
            <span className="text-sm font-medium text-gray-900">
              {isDemoMode ? 'Demo (local storage)' : 'Authenticated'}
            </span>
          </div>
          {!isDemoMode && profile && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Name</span>
                <span className="text-sm font-medium text-gray-900">
                  {profile.display_name}
                </span>
              </div>
              {activeTeam && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Team</span>
                  <span className="text-sm font-medium text-gray-900">
                    {activeTeam.name}
                  </span>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Tag management */}
      <section className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase text-gray-500">
            Tags
          </h2>
        </div>

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
                onUpdate={updateTag}
                onDelete={deleteTag}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

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
