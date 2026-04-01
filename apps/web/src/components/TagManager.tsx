'use client';

import { useState, useCallback } from 'react';
import { useCRMStore } from '@realestate-crm/hooks';
import type { Tag } from '@realestate-crm/types';

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#14B8A6', '#3B82F6', '#8B5CF6', '#EC4899',
  '#6B7280', '#1D4ED8',
];

interface TagManagerProps {
  onClose: () => void;
}

export default function TagManager({ onClose }: TagManagerProps) {
  const tags = useCRMStore((s) => s.tags);
  const addTag = useCRMStore((s) => s.addTag);
  const updateTag = useCRMStore((s) => s.updateTag);
  const deleteTag = useCRMStore((s) => s.deleteTag);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(PRESET_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Inline edit state: tagId -> { name, color }
  const [editing, setEditing] = useState<Record<string, { name: string; color: string }>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) {
      setCreateError('Tag name is required');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      await addTag({ name: newName.trim(), color: newColor });
      setNewName('');
      setNewColor(PRESET_COLORS[0]);
    } catch {
      setCreateError('Failed to create tag');
    } finally {
      setCreating(false);
    }
  }, [newName, newColor, addTag]);

  const startEdit = useCallback((tag: Tag) => {
    setEditing((prev) => ({ ...prev, [tag.id]: { name: tag.name, color: tag.color } }));
  }, []);

  const cancelEdit = useCallback((tagId: string) => {
    setEditing((prev) => {
      const next = { ...prev };
      delete next[tagId];
      return next;
    });
  }, []);

  const handleSave = useCallback(async (tagId: string) => {
    const edits = editing[tagId];
    if (!edits?.name.trim()) return;
    setSavingId(tagId);
    try {
      await updateTag(tagId, { name: edits.name.trim(), color: edits.color });
      cancelEdit(tagId);
    } finally {
      setSavingId(null);
    }
  }, [editing, updateTag, cancelEdit]);

  const handleDelete = useCallback(async (tag: Tag) => {
    if (!window.confirm(`Delete tag "${tag.name}"? This will remove it from all contacts.`)) return;
    await deleteTag(tag.id);
    cancelEdit(tag.id);
  }, [deleteTag, cancelEdit]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Manage Tags</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-6">
          {/* Create new tag */}
          <div className="mb-6">
            <h3 className="mb-3 text-sm font-semibold text-gray-700">Create New Tag</h3>
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  placeholder="Tag name..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                {createError && (
                  <p className="mt-1 text-xs text-red-600">{createError}</p>
                )}
              </div>
              <ColorPicker value={newColor} onChange={setNewColor} />
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {creating ? 'Adding...' : 'Add'}
              </button>
            </div>
          </div>

          {/* Existing tags */}
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Existing Tags ({tags.length})
          </h3>
          {tags.length === 0 ? (
            <p className="text-sm text-gray-400">No tags yet. Create one above.</p>
          ) : (
            <ul className="space-y-2">
              {tags.map((tag) => {
                const isEditing = !!editing[tag.id];
                const edits = editing[tag.id];
                const isSaving = savingId === tag.id;

                return (
                  <li
                    key={tag.id}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5"
                  >
                    {isEditing ? (
                      <>
                        <ColorPicker
                          value={edits.color}
                          onChange={(c) =>
                            setEditing((prev) => ({ ...prev, [tag.id]: { ...prev[tag.id], color: c } }))
                          }
                        />
                        <input
                          type="text"
                          value={edits.name}
                          onChange={(e) =>
                            setEditing((prev) => ({ ...prev, [tag.id]: { ...prev[tag.id], name: e.target.value } }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSave(tag.id);
                            if (e.key === 'Escape') cancelEdit(tag.id);
                          }}
                          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          autoFocus
                        />
                        <button
                          onClick={() => handleSave(tag.id)}
                          disabled={isSaving}
                          className="rounded bg-primary-500 px-2 py-1 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                        >
                          {isSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => cancelEdit(tag.id)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span
                          className="flex-1 text-sm font-medium"
                          style={{ color: tag.color }}
                        >
                          {tag.name}
                        </span>
                        <button
                          onClick={() => startEdit(tag)}
                          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(tag)}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end border-t px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <div className="flex items-center gap-1">
      {PRESET_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${
            value === c ? 'border-gray-700 scale-110' : 'border-transparent'
          }`}
          style={{ backgroundColor: c }}
          title={c}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-5 w-5 cursor-pointer rounded border-0 p-0"
        title="Custom color"
      />
    </div>
  );
}
