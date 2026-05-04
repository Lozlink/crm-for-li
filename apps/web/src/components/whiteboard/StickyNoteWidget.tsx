'use client';

import { useState, useCallback } from 'react';
import type { WhiteboardItem, WhiteboardStickyContent } from '@realestate-crm/types';
import {
  STICKY_COLOR_DEFS,
  DEFAULT_STICKY_COLOR_DEF,
  stickyColorKey,
  STICKY_TEXT_COLOR,
  STICKY_PLACEHOLDER_COLOR,
} from './whiteboardColors';

interface Props {
  item: WhiteboardItem;
  /** Edit mode = textarea is editable; Move mode = read-only. */
  editable: boolean;
  onChangeText: (text: string) => void;
  /** In edit mode: change sticky color (receives the light-mode hex key). */
  onChangeColor: (colorKey: string) => void;
}

/**
 * Sticky note body widget — web version.
 *
 * DESIGN.md §5:
 * - Flat look: soft drop-shadow, no elevation border.
 * - 15/22 custom font, near-black text on all hues.
 * - Placeholder "Quick note…" at 40% opacity.
 * - Color picker (bottom-right) visible in Edit mode only.
 */
export function StickyNoteWidget({ item, editable, onChangeText, onChangeColor }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const content = item.content as WhiteboardStickyContent | undefined;
  const text = content?.text ?? '';

  // Resolve background from the stored color key (light-mode hex = storage key).
  const storedKey = item.color ?? DEFAULT_STICKY_COLOR_DEF.light;
  const colorDef =
    STICKY_COLOR_DEFS.find((d) => stickyColorKey(d) === storedKey) ?? DEFAULT_STICKY_COLOR_DEF;
  const bg = colorDef.light; // web is light-mode first

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChangeText(e.target.value);
    },
    [onChangeText],
  );

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden rounded-xl"
      style={{
        backgroundColor: bg,
        boxShadow: '0 2px 4px rgba(0,0,0,0.10)',
        padding: '8px 12px 12px',
      }}
    >
      {/* Body text */}
      <textarea
        className="flex-1 resize-none bg-transparent text-[15px] leading-[22px] font-normal outline-none"
        style={{ color: STICKY_TEXT_COLOR }}
        value={text}
        onChange={handleTextChange}
        placeholder="Quick note…"
        readOnly={!editable}
        tabIndex={editable ? 0 : -1}
        // Stop pointer from reaching the canvas drag handler when in edit mode
        onPointerDown={(e) => { if (editable) e.stopPropagation(); }}
      />

      {/* Color picker — Edit mode only (DESIGN.md §5) */}
      {editable && (
        <div className="flex items-center justify-end pt-1">
          <button
            title="Change color"
            aria-label="Change sticky color"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded p-1 hover:bg-black/10 transition-colors"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Palette icon (heroicons outline) */}
            <svg
              className="h-4 w-4"
              style={{ color: STICKY_TEXT_COLOR, opacity: 0.6 }}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.098 19.902a3.75 3.75 0 005.304 0l6.401-6.402M6.75 21A3.75 3.75 0 013 17.25V4.125C3 3.504 3.504 3 4.125 3h5.25c.621 0 1.125.504 1.125 1.125v4.072M6.75 21a3.75 3.75 0 003.75-3.75V8.197M6.75 21h13.125c.621 0 1.125-.504 1.125-1.125v-5.25c0-.621-.504-1.125-1.125-1.125h-4.072M10.5 8.197l2.88-2.88c.438-.439 1.15-.439 1.587 0l4.236 4.236c.438.438.438 1.15 0 1.587L10.5 17.25"
              />
            </svg>
          </button>

          {/* Inline color swatch row — DESIGN.md §5: 24pt circles, 8pt gap */}
          {pickerOpen && (
            <div
              className="absolute bottom-9 right-2 flex items-center gap-2 rounded-xl border border-gray-200 bg-white/95 px-2 py-1.5 shadow-lg z-20"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {STICKY_COLOR_DEFS.map((def) => {
                const isSelected = stickyColorKey(def) === storedKey;
                return (
                  <button
                    key={def.name}
                    title={def.name}
                    aria-label={`${def.name} sticky color`}
                    onClick={() => {
                      onChangeColor(stickyColorKey(def));
                      setPickerOpen(false);
                    }}
                    className="rounded-full transition-transform hover:scale-110 focus:outline-none"
                    style={{
                      width: 24,
                      height: 24,
                      backgroundColor: def.light,
                      border: isSelected ? `3px solid #023c69` : '2px solid rgba(0,0,0,0.12)',
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Placeholder overlay when no text in Move mode */}
      {!editable && !text && (
        <span
          className="pointer-events-none absolute left-3 top-2 text-[15px] leading-[22px]"
          style={{ color: STICKY_PLACEHOLDER_COLOR }}
        >
          Quick note…
        </span>
      )}
    </div>
  );
}
