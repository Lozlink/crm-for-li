// Mode model for the whiteboard.
// - 'move' : drag/reposition items, bring-to-front on tap, long-press for context.
// - 'edit' : tap an item to open its content editor (sticky text, checklist items, photo caption).
export type WhiteboardMode = 'move' | 'edit';

// Re-export the canonical color tokens from whiteboardColors.ts so that
// code that imports from './types' still compiles without changes.
export {
  STICKY_COLOR_DEFS as STICKY_COLORS_DEFS,
  DEFAULT_STICKY_COLOR_DEF,
  stickyColorKey,
  stickyColorForScheme,
  STICKY_TEXT_COLOR,
  STICKY_PLACEHOLDER_COLOR,
  CANVAS_BG,
  CANVAS_DOT_COLOR,
  WIDGET_DELETE_COLOR,
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
