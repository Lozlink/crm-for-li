'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import { useAuthStore } from '@realestate-crm/hooks';
import type {
  WhiteboardItemType,
  WhiteboardChecklistContent,
} from '@realestate-crm/types';
import {
  DEFAULT_STICKY_COLOR_DEF,
  stickyColorKey,
} from './whiteboard/whiteboardColors';
import { WhiteboardCanvas } from './whiteboard/WhiteboardCanvas';
import { AddWidgetPanel } from './whiteboard/AddWidgetPanel';

type WhiteboardMode = 'move' | 'edit';

// Default item sizes — Phase-1 types have explicit sizes; others fall back to 200×200.
const DEFAULT_SIZES: Partial<Record<WhiteboardItemType, { width: number; height: number }>> = {
  sticky:    { width: 160, height: 160 },
  checklist: { width: 200, height: 240 },
  photo:     { width: 200, height: 200 },
};

const getSizeForType = (type: WhiteboardItemType) =>
  DEFAULT_SIZES[type] ?? { width: 200, height: 200 };

/**
 * Top-level whiteboard view — orchestrates mode, item CRUD, and toolbar.
 *
 * Rendered inside the /whiteboard route, wrapped in AppShell + AuthGuard.
 *
 * Spec refs: DESIGN.md §2 (mode pill), §8 (add panel), §4 (BaseWidget interactions).
 */
export default function WhiteboardView() {
  const [mode, setMode] = useState<WhiteboardMode>('move');
  const [addPanelOpen, setAddPanelOpen] = useState(false);

  const items = useWhiteboardStore((s) => s.items);
  const isLoading = useWhiteboardStore((s) => s.isLoading);
  const fetchItems = useWhiteboardStore((s) => s.fetchItems);
  const createItem = useWhiteboardStore((s) => s.createItem);
  const updateItem = useWhiteboardStore((s) => s.updateItem);
  const deleteItem = useWhiteboardStore((s) => s.deleteItem);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const activeTeam = useAuthStore((s) => s.activeTeam);

  // Fetch items when auth + team resolve
  useEffect(() => {
    if (isDemoMode || (isAuthenticated && activeTeam)) {
      void fetchItems();
    }
  }, [isDemoMode, isAuthenticated, activeTeam, fetchItems]);

  // ── Add widget ────────────────────────────────────────────────────────────

  const handleAddWidget = useCallback(
    async (type: WhiteboardItemType) => {
      // Place new items in a slightly offset position so they're immediately visible.
      const offset = (items.length % 5) * 24;
      const size = getSizeForType(type);

      const content =
        type === 'sticky'
          ? { text: '' }
          : type === 'checklist'
          ? ({ title: '', items: [] } satisfies WhiteboardChecklistContent)
          : { url: '' };

      await createItem({
        type,
        position_x: 40 + offset,
        position_y: 40 + offset,
        width: size.width,
        height: size.height,
        content,
        color: type === 'sticky' ? stickyColorKey(DEFAULT_STICKY_COLOR_DEF) : null,
      });
    },
    [items.length, createItem],
  );

  // ── Inline checklist toggle (Move mode) ──────────────────────────────────

  const handleToggleChecklistEntry = useCallback(
    (itemId: string, entryId: string) => {
      const target = items.find((it) => it.id === itemId);
      if (!target) return;
      const c = target.content as WhiteboardChecklistContent;
      const updated: WhiteboardChecklistContent = {
        ...c,
        items: c.items.map((entry) =>
          entry.id === entryId ? { ...entry, checked: !entry.checked } : entry,
        ),
      };
      void updateItem(itemId, { content: updated });
    },
    [items, updateItem],
  );

  const handleDelete = useCallback(
    (id: string) => {
      void deleteItem(id);
    },
    [deleteItem],
  );

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'move' ? 'edit' : 'move'));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-col">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Whiteboard</h1>

        {/* Mode pill — DESIGN.md §2: 44px tall, full-pill border-radius, 200ms transition */}
        <button
          onClick={toggleMode}
          className="flex items-center gap-2 rounded-full px-4 text-sm font-bold transition-all duration-200"
          style={{
            minWidth: 100,
            height: 44,
            backgroundColor: mode === 'edit' ? '#023c69' : '#F3F4F6',
            color: mode === 'edit' ? '#FFFFFF' : '#374151',
          }}
          aria-pressed={mode === 'edit'}
          aria-label={`Switch to ${mode === 'edit' ? 'Move' : 'Edit'} mode`}
        >
          {mode === 'edit' ? (
            <PencilIcon className="h-4 w-4" />
          ) : (
            <MoveIcon className="h-4 w-4" />
          )}
          <span>{mode === 'edit' ? 'Edit' : 'Move'}</span>
        </button>
      </div>

      {/* ── Canvas area ───────────────────────────────────────────────── */}
      <div className="relative min-h-0 flex-1">
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
          </div>
        ) : (
          <WhiteboardCanvas
            items={items}
            mode={mode}
            onToggleChecklistEntry={handleToggleChecklistEntry}
            onDelete={handleDelete}
          />
        )}

        {/* ── FAB + Add panel (bottom-right) ─────────────────────────── */}
        <div className="absolute bottom-4 right-4 z-30">
          {addPanelOpen && (
            <AddWidgetPanel
              onSelect={handleAddWidget}
              onClose={() => setAddPanelOpen(false)}
            />
          )}

          <button
            onClick={() => setAddPanelOpen((v) => !v)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg transition-transform hover:scale-105 active:scale-95 focus:outline-none"
            aria-label="Add to board"
            aria-expanded={addPanelOpen}
          >
            <svg
              className={`h-6 w-6 transition-transform duration-200 ${addPanelOpen ? 'rotate-45' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

/* Inline SVG icons */

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    </svg>
  );
}

function MoveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
    </svg>
  );
}
