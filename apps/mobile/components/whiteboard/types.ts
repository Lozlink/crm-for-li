// Re-export the canonical color tokens from whiteboardColors.ts so that
// code that imports from './types' still compiles without changes.
export {
  // Sticky palette
  STICKY_COLOR_DEFS as STICKY_COLORS_DEFS,
  DEFAULT_STICKY_COLOR_DEF,
  stickyColorKey,
  stickyColorForScheme,
  STICKY_TEXT_COLOR,
  STICKY_PLACEHOLDER_COLOR,
  // Canvas surface
  CANVAS_BG,
  CANVAS_DOT_COLOR,
  // Widget affordances
  WIDGET_DELETE_COLOR,
  // Intelligence layer — suggestion kind tokens
  SUGGESTION_KIND_DEFS,
  getSuggestionKindDef,
  suggestionKindColorForScheme,
  type SuggestionKind,
  type SuggestionKindDef,
} from './whiteboardColors';

// Legacy flat list — kept for consumers that need a simple {value,label}[].
// Light-mode hex values used as keys (stable storage). Map to full defs when needed.
import { STICKY_COLOR_DEFS } from './whiteboardColors';
export const STICKY_COLORS: { value: string; label: string }[] = STICKY_COLOR_DEFS.map(
  (d) => ({ value: d.light, label: d.name }),
);
export const DEFAULT_STICKY_COLOR = STICKY_COLORS[0].value;

// Widget default sizes (pt).
export const ITEM_DEFAULT_SIZE = { width: 160, height: 160 };
export const PHOTO_DEFAULT_SIZE = { width: 200, height: 200 };
export const CHECKLIST_DEFAULT_SIZE = { width: 200, height: 240 };
// SuggestionCard default size (pt) — wider + shorter than a sticky.
export const SUGGESTION_CARD_DEFAULT_SIZE = { width: 220, height: 120 };

// ── Intelligence layer: canonical re-exports ──────────────────────────────────
//
// SmartSuggestion is the in-memory shape from useSmartSuggestions (the hook).
// WhiteboardSuggestionContent is the on-board persisted shape (lives in
// @realestate-crm/types — projection happens in whiteboard.tsx at "Add to board").

export type { SmartSuggestion, SmartSuggestionKind } from '@realestate-crm/hooks';

import type { WhiteboardItem, WhiteboardSuggestionContent } from '@realestate-crm/types';

export type { WhiteboardSuggestionContent };

/**
 * Cast-safe alias for a WhiteboardItem carrying suggestion content.
 * Use when the renderer needs to access content.body / content.title without
 * the discriminated-union narrowing dance.
 */
export type WhiteboardSuggestionItem = Omit<WhiteboardItem, 'type' | 'content'> & {
  type: 'suggestion';
  content: WhiteboardSuggestionContent;
};
