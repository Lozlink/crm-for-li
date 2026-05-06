'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import { useAuthStore } from '@realestate-crm/hooks';
import type {
  WhiteboardItemType,
  WhiteboardChecklistContent,
  WhiteboardItem,
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

interface UndoEntry {
  item: WhiteboardItem;
  timeoutId: ReturnType<typeof setTimeout>;
}

export default function WhiteboardView() {
  const [mode, setMode] = useState<WhiteboardMode>('move');
  const [addPanelOpen, setAddPanelOpen] = useState(false);
  // Snackbar state for completed-checklist undo
  const [undoEntry, setUndoEntry] = useState<UndoEntry | null>(null);

  const items = useWhiteboardStore((s) => s.items);
  const isLoading = useWhiteboardStore((s) => s.isLoading);
  const fetchItems = useWhiteboardStore((s) => s.fetchItems);
  const createItem = useWhiteboardStore((s) => s.createItem);
  const updateItem = useWhiteboardStore((s) => s.updateItem);
  const deleteItem = useWhiteboardStore((s) => s.deleteItem);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const activeTeam = useAuthStore((s) => s.activeTeam);

  const undoEntryRef = useRef(undoEntry);
  undoEntryRef.current = undoEntry;

  useEffect(() => {
    if (isDemoMode || (isAuthenticated && activeTeam)) {
      void fetchItems();
    }
  }, [isDemoMode, isAuthenticated, activeTeam, fetchItems]);

  // Clean up pending undo timeout on unmount
  useEffect(() => {
    return () => {
      if (undoEntryRef.current) {
        clearTimeout(undoEntryRef.current.timeoutId);
      }
    };
  }, []);

  // ── Add widget ────────────────────────────────────────────────────────────

  const handleAddWidget = useCallback(
    async (type: WhiteboardItemType) => {
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

  // ── Delete with snackbar+undo for fully-completed checklists ─────────────

  const handleDelete = useCallback(
    (id: string) => {
      const target = items.find((it) => it.id === id);
      const isCompletedChecklist =
        target?.type === 'checklist' &&
        (() => {
          const c = target.content as WhiteboardChecklistContent;
          return c.items.length > 0 && c.items.every((e) => e.checked);
        })();

      if (isCompletedChecklist && target) {
        // Clear any existing undo before starting a new one
        if (undoEntryRef.current) {
          clearTimeout(undoEntryRef.current.timeoutId);
        }

        // Delete immediately; the undo will re-create
        void deleteItem(id);

        const timeoutId = setTimeout(() => {
          setUndoEntry(null);
        }, 5000);

        setUndoEntry({ item: target, timeoutId });
      } else {
        void deleteItem(id);
      }
    },
    [items, deleteItem],
  );

  const handleUndo = useCallback(async () => {
    const entry = undoEntryRef.current;
    if (!entry) return;

    clearTimeout(entry.timeoutId);
    setUndoEntry(null);

    // Re-create the deleted item — preserve ref_id so live-binding survives
    // the delete/undo round-trip (matters for any pinned widget type, not just
    // the checklists this path currently fires on).
    const { type, position_x, position_y, width, height, content, color, ref_id } = entry.item;
    await createItem({ type, position_x, position_y, width, height, content, color, ref_id });
  }, [createItem]);

  const handleDismissSnackbar = useCallback(() => {
    if (undoEntryRef.current) {
      clearTimeout(undoEntryRef.current.timeoutId);
      setUndoEntry(null);
    }
  }, []);

  const toggleMode = useCallback(() => {
    setMode((m) => (m === 'move' ? 'edit' : 'move'));
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-full flex-col">
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Whiteboard</h1>

        {/* Animated segmented-control pill — DESIGN.md §2 */}
        <AnimatedModePill mode={mode} onToggle={toggleMode} />
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

      {/* ── Snackbar — completed-checklist remove + Undo ──────────────── */}
      {undoEntry && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div
            className="pointer-events-auto flex items-center gap-3 rounded-xl bg-gray-900 px-4 py-3 text-white shadow-xl"
            style={{ maxWidth: 360 }}
          >
            <span className="flex-1 text-sm">Checklist removed</span>
            <button
              onClick={handleUndo}
              className="shrink-0 text-sm font-bold text-blue-400 hover:text-blue-300"
            >
              Undo
            </button>
            <button
              onClick={handleDismissSnackbar}
              className="shrink-0 text-gray-400 hover:text-gray-200"
              aria-label="Dismiss"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── AnimatedModePill ────────────────────────────────────────────────────────

/**
 * Sliding-pill segmented control — 230px wide, 36px tall.
 *
 * The indicator translates via CSS transform so the animation runs on the
 * compositor thread (no layout thrash). Cubic-bezier(.2,.8,.2,1) matches the
 * mobile spring feel without a JS animation library.
 */
function AnimatedModePill({
  mode,
  onToggle,
}: {
  mode: WhiteboardMode;
  onToggle: () => void;
}) {
  const isEdit = mode === 'edit';

  return (
    <div
      className="relative flex items-center rounded-full p-0.5"
      style={{
        width: 230,
        height: 36,
        backgroundColor: '#E5E7EB', // surfaceVariant equivalent
      }}
      role="group"
      aria-label="Canvas mode"
    >
      {/* Sliding indicator */}
      <div
        className="absolute top-0.5 h-[calc(100%-4px)] rounded-full"
        style={{
          width: 'calc(50% - 4px)',
          backgroundColor: '#023c69', // primary
          left: isEdit ? 'calc(50% + 2px)' : '2px',
          transition: 'left 200ms cubic-bezier(.2,.8,.2,1)',
        }}
        aria-hidden
      />

      {/* Move segment */}
      <button
        onClick={isEdit ? onToggle : undefined}
        className="relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1 text-sm font-semibold transition-colors duration-100"
        style={{ color: isEdit ? '#6B7280' : '#FFFFFF' }}
        aria-pressed={!isEdit}
      >
        <MoveIcon className="h-3.5 w-3.5" />
        <span>Move</span>
      </button>

      {/* Edit segment */}
      <button
        onClick={!isEdit ? onToggle : undefined}
        className="relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full py-1 text-sm font-semibold transition-colors duration-100"
        style={{ color: isEdit ? '#FFFFFF' : '#6B7280' }}
        aria-pressed={isEdit}
      >
        <PencilIcon className="h-3.5 w-3.5" />
        <span>Edit</span>
      </button>
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
