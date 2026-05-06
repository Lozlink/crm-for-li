'use client';

import { useRef, useCallback, useState } from 'react';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import type {
  WhiteboardItem,
  WhiteboardChecklistContent,
  WhiteboardStickyContent,
  WhiteboardPhotoContent,
} from '@realestate-crm/types';
import { snapToGrid, WIDGET_DELETE_COLOR } from './whiteboardColors';
import { StickyNoteWidget } from './StickyNoteWidget';
import { ChecklistWidget, ChecklistEditorDialog } from './ChecklistWidget';
import { PhotoWidget } from './PhotoWidget';
import { MapCard } from './MapCard';
import { SuggestionCard } from './SuggestionCard';

type WhiteboardMode = 'move' | 'edit';

interface Props {
  item: WhiteboardItem;
  mode: WhiteboardMode;
  /** Camera offset — needed to convert pointer client coords → world coords. */
  cameraX: number;
  cameraY: number;
  onToggleChecklistEntry: (itemId: string, entryId: string) => void;
  onDelete: (id: string) => void;
}

/**
 * One draggable, resizable whiteboard item — web version.
 *
 * Move mode:
 *   - Pointer-drag repositions the item (snap to 16px grid on release).
 *   - Click brings to front.
 *
 * Edit mode:
 *   - Drag disabled. Sticky textarea becomes editable inline.
 *   - Checklist opens an editor dialog on click.
 *   - Photo opens file picker on click.
 *   - Delete × button visible top-right.
 *   - Focus ring: 2px primary border, 14px radius.
 *
 * Unsupported item types (Contact, Property, Map, Goal from Phase 2) render
 * a graceful "View on mobile" placeholder — never a runtime error.
 */
export function WhiteboardItemView({
  item,
  mode,
  cameraX,
  cameraY,
  onToggleChecklistEntry,
  onDelete,
}: Props) {
  const updateItemLocal = useWhiteboardStore((s) => s.updateItemLocal);
  const commitItem = useWhiteboardStore((s) => s.commitItem);
  const updateItem = useWhiteboardStore((s) => s.updateItem);
  const bringToFront = useWhiteboardStore((s) => s.bringToFront);

  const [checklistEditorOpen, setChecklistEditorOpen] = useState(false);

  // Drag tracking refs — avoid state to keep drag path lag-free.
  const isDragging = useRef(false);
  const pointerStartClient = useRef({ x: 0, y: 0 });
  const itemStartWorld = useRef({ x: item.position_x, y: item.position_y });

  const isEdit = mode === 'edit';

  // ── Drag (Move mode only) ─────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isEdit) return;
      if (e.button !== 0) return; // left-click only

      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);

      isDragging.current = false;
      pointerStartClient.current = { x: e.clientX, y: e.clientY };
      itemStartWorld.current = { x: item.position_x, y: item.position_y };
    },
    [isEdit, item.position_x, item.position_y],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (isEdit) return;
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;

      const dx = e.clientX - pointerStartClient.current.x;
      const dy = e.clientY - pointerStartClient.current.y;

      // Treat as drag once moved more than 4px
      if (!isDragging.current && Math.hypot(dx, dy) > 4) {
        isDragging.current = true;
        void bringToFront(item.id);
      }

      if (!isDragging.current) return;

      const newX = itemStartWorld.current.x + dx;
      const newY = itemStartWorld.current.y + dy;
      updateItemLocal(item.id, { position_x: newX, position_y: newY });
    },
    [isEdit, item.id, updateItemLocal, bringToFront],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.releasePointerCapture(e.pointerId);

      if (!isDragging.current) {
        // Treat as click → bring to front
        void bringToFront(item.id);
        isDragging.current = false;
        return;
      }

      isDragging.current = false;

      // Snap to grid and commit
      const snapped = {
        position_x: snapToGrid(item.position_x),
        position_y: snapToGrid(item.position_y),
      };
      updateItemLocal(item.id, snapped);
      void commitItem(item.id);
    },
    [item.id, item.position_x, item.position_y, updateItemLocal, commitItem, bringToFront],
  );

  // ── Content update helpers ────────────────────────────────────────────────

  const handleStickyTextChange = useCallback(
    (text: string) => {
      void updateItem(item.id, { content: { text } as WhiteboardStickyContent });
    },
    [item.id, updateItem],
  );

  const handleStickyColorChange = useCallback(
    (colorKey: string) => {
      void updateItem(item.id, { color: colorKey });
    },
    [item.id, updateItem],
  );

  const handleChecklistSave = useCallback(
    (patch: WhiteboardChecklistContent) => {
      void updateItem(item.id, { content: patch });
    },
    [item.id, updateItem],
  );

  const handlePhotoUpdate = useCallback(
    (content: WhiteboardPhotoContent) => {
      void updateItem(item.id, { content });
    },
    [item.id, updateItem],
  );

  // ── Resize (bottom-right handle) ─────────────────────────────────────────

  const resizeStart = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: item.width,
        h: item.height,
      };
    },
    [item.width, item.height],
  );

  const handleResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!resizeStart.current) return;
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;

      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      const newW = Math.max(120, resizeStart.current.w + dx);
      const newH = Math.max(80, resizeStart.current.h + dy);
      updateItemLocal(item.id, { width: newW, height: newH });
    },
    [item.id, updateItemLocal],
  );

  const handleResizePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
      e.currentTarget.releasePointerCapture(e.pointerId);
      void commitItem(item.id);
      resizeStart.current = null;
    },
    [item.id, commitItem],
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div
        className={`absolute select-none ${isEdit ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        style={{
          left: item.position_x,
          top: item.position_y,
          width: item.width,
          height: item.height,
          zIndex: item.z_index,
          // Edit mode focus ring — DESIGN.md §4
          ...(isEdit
            ? { outline: '2px solid #023c69', outlineOffset: 1, borderRadius: 14 }
            : {}),
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* ── Widget body ─────────────────────────────────────────────── */}
        {item.type === 'sticky' && (
          <StickyNoteWidget
            item={item}
            editable={isEdit}
            onChangeText={handleStickyTextChange}
            onChangeColor={handleStickyColorChange}
          />
        )}

        {item.type === 'checklist' && (
          <div
            className="h-full w-full"
            onClick={isEdit ? () => setChecklistEditorOpen(true) : undefined}
            onPointerDown={(e) => { if (isEdit) e.stopPropagation(); }}
            style={{ cursor: isEdit ? 'pointer' : 'inherit' }}
          >
            <ChecklistWidget
              item={item}
              onToggle={
                mode === 'move'
                  ? (entryId) => onToggleChecklistEntry(item.id, entryId)
                  : undefined
              }
            />
          </div>
        )}

        {item.type === 'photo' && (
          <PhotoWidget
            item={item}
            editable={isEdit}
            onPhotoUpdate={handlePhotoUpdate}
          />
        )}

        {item.type === 'map' && (
          <MapCard item={item} />
        )}

        {item.type === 'suggestion' && (
          <SuggestionCard item={item} />
        )}

        {/* Phase 2 contact/property/goal widgets: graceful "View on mobile" placeholder */}
        {item.type !== 'sticky' &&
          item.type !== 'checklist' &&
          item.type !== 'photo' &&
          item.type !== 'map' &&
          item.type !== 'suggestion' && (
          <MobileOnlyPlaceholder type={item.type} />
        )}

        {/* ── Delete × button (Edit mode, top-right) — DESIGN.md §4 ── */}
        {isEdit && (
          <button
            className="absolute -right-3 -top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-md transition-transform hover:scale-110 focus:outline-none"
            style={{ color: WIDGET_DELETE_COLOR }}
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            aria-label="Delete item"
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}

        {/* ── Resize handle (bottom-right) — DESIGN.md §4 ─────────── */}
        {isEdit && (
          <div
            className="absolute bottom-0 right-0 h-7 w-7 cursor-se-resize"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerUp}
            aria-hidden
          >
            <svg
              className="absolute bottom-1 right-1 h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 16 16"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path d="M5 11l6-6M9 11l2-2M11 9l2-2" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Checklist editor dialog */}
      {checklistEditorOpen && (
        <ChecklistEditorDialog
          item={item}
          onClose={() => setChecklistEditorOpen(false)}
          onSave={handleChecklistSave}
        />
      )}
    </>
  );
}

function MobileOnlyPlaceholder({ type }: { type: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-4 text-center">
      <svg
        className="h-8 w-8 text-gray-300"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 8.25h3m-3 3.75h3m-6 3.75H9m1.5-12H9"
        />
      </svg>
      <p className="text-xs font-medium text-gray-400 capitalize">{type}</p>
      <p className="text-[11px] text-gray-400">View on mobile</p>
    </div>
  );
}
