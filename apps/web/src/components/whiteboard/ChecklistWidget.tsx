'use client';

import { useState, useCallback } from 'react';
import type { WhiteboardItem, WhiteboardChecklistContent, WhiteboardChecklistEntry } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
  /** When provided, inline toggling is enabled (Move mode). */
  onToggle?: (entryId: string) => void;
  /** Open the editor dialog for this checklist (Edit mode). */
  onEdit?: () => void;
}

/**
 * Checklist widget body — web version.
 *
 * DESIGN.md §6:
 * - White surface, 12px corner, hairline border.
 * - Title row with bottom accent border.
 * - 44px row height touch targets.
 * - 22px checkbox (checkbox-blank / checkbox-marked icons).
 * - Up to 8 items shown; "+N more" overflow indicator.
 */
export function ChecklistWidget({ item, onToggle }: Props) {
  const content = item.content as WhiteboardChecklistContent | undefined;
  const entries: WhiteboardChecklistEntry[] = content?.items ?? [];
  const title = (content?.title ?? '').trim();

  const visible = entries.slice(0, 8);
  const overflow = entries.length - visible.length;

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white"
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
      }}
    >
      {/* Title row */}
      <div
        className="px-3 pb-1.5 pt-2"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
      >
        <p className="truncate text-sm font-semibold text-gray-800">
          {title || 'To-do'}
        </p>
      </div>

      {/* Items */}
      <div className="flex flex-1 flex-col overflow-hidden px-2 py-1">
        {entries.length === 0 && (
          <p className="py-2 text-xs italic text-gray-400">Tap Edit to add items</p>
        )}

        {visible.map((entry) => (
          <ChecklistRow
            key={entry.id}
            entry={entry}
            onToggle={onToggle}
          />
        ))}

        {overflow > 0 && (
          <p className="pt-1 text-xs text-gray-400">+{overflow} more</p>
        )}
      </div>
    </div>
  );
}

interface ChecklistRowProps {
  entry: WhiteboardChecklistEntry;
  onToggle?: (entryId: string) => void;
}

function ChecklistRow({ entry, onToggle }: ChecklistRowProps) {
  const handleClick = useCallback(() => {
    onToggle?.(entry.id);
  }, [entry.id, onToggle]);

  return (
    <button
      className="flex w-full items-center gap-2 text-left transition-opacity hover:opacity-80 disabled:opacity-60"
      style={{ minHeight: 44 }}
      onClick={handleClick}
      disabled={!onToggle}
      aria-pressed={entry.checked}
      aria-label={entry.text || 'List item'}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Checkbox icon */}
      {entry.checked ? (
        <CheckedIcon className="h-[22px] w-[22px] shrink-0 text-blue-600" />
      ) : (
        <UncheckedIcon className="h-[22px] w-[22px] shrink-0 text-gray-400" />
      )}

      <span
        className={`flex-1 truncate text-sm ${
          entry.checked ? 'text-gray-400 line-through' : 'text-gray-800'
        }`}
      >
        {entry.text || '—'}
      </span>
    </button>
  );
}

function CheckedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-9 14l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function UncheckedIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
    </svg>
  );
}

/**
 * Checklist editor dialog — open from Edit mode.
 * Allows adding/removing/renaming items and editing the title.
 */
interface EditorProps {
  item: WhiteboardItem;
  onClose: () => void;
  onSave: (patch: WhiteboardChecklistContent) => void;
}

export function ChecklistEditorDialog({ item, onClose, onSave }: EditorProps) {
  const initial = item.content as WhiteboardChecklistContent | undefined;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [entries, setEntries] = useState<WhiteboardChecklistEntry[]>(
    initial?.items ?? [],
  );
  const [newText, setNewText] = useState('');

  const handleAddItem = useCallback(() => {
    const text = newText.trim();
    if (!text) return;
    setEntries((prev) => [
      ...prev,
      { id: crypto.randomUUID(), text, checked: false },
    ]);
    setNewText('');
  }, [newText]);

  const handleDeleteItem = useCallback((id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const handleUpdateText = useCallback((id: string, text: string) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  }, []);

  const handleSave = useCallback(() => {
    onSave({ title: title.trim() || undefined, items: entries });
    onClose();
  }, [title, entries, onSave, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onPointerDown={onClose}
    >
      <div
        className="w-[340px] max-w-[92vw] rounded-2xl bg-white p-5 shadow-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <h3 className="mb-3 text-base font-bold text-gray-900">Edit checklist</h3>

        {/* Title */}
        <input
          type="text"
          className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        {/* Existing items */}
        <div className="mb-3 flex max-h-48 flex-col gap-1.5 overflow-y-auto">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center gap-2">
              <input
                type="text"
                className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm text-gray-800 outline-none focus:border-blue-400"
                value={entry.text}
                onChange={(e) => handleUpdateText(entry.id, e.target.value)}
              />
              <button
                onClick={() => handleDeleteItem(entry.id)}
                className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                aria-label="Remove item"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* Add new item */}
        <div className="mb-4 flex gap-2">
          <input
            type="text"
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-500"
            placeholder="Add an item…"
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
          />
          <button
            onClick={handleAddItem}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
