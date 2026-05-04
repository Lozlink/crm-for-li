/**
 * Whiteboard color tokens — web port of apps/mobile/components/whiteboard/whiteboardColors.ts
 *
 * Six sticky-note color pairs (light / dark), canvas surface tokens, and helpers.
 * Text on all sticky colors is always #1A1A1A for contrast.
 */

export interface StickyColorDef {
  name: string;
  /** Light-mode sticky background. Also used as the stable storage key. */
  light: string;
  /** Dark-mode sticky background. */
  dark: string;
}

export const STICKY_COLOR_DEFS: StickyColorDef[] = [
  { name: 'Sunshine', light: '#FEF3AC', dark: '#D4A017' },
  { name: 'Coral',    light: '#FFCDD0', dark: '#D94F57' },
  { name: 'Sky',      light: '#BFE0FD', dark: '#2E86C1' },
  { name: 'Mint',     light: '#BBFAD0', dark: '#1A9C5B' },
  { name: 'Peach',    light: '#FFE0C4', dark: '#D46A1E' },
  { name: 'Lavender', light: '#E2D9FC', dark: '#7C5CBF' },
];

/** Sunshine is the default sticky color. */
export const DEFAULT_STICKY_COLOR_DEF = STICKY_COLOR_DEFS[0];

/** Returns the light-mode hex value for a given color def (used as the stable storage key). */
export const stickyColorKey = (def: StickyColorDef): string => def.light;

/** Pick the correct shade for the current color scheme. */
export function stickyColorForScheme(
  def: StickyColorDef,
  isDark: boolean,
): string {
  return isDark ? def.dark : def.light;
}

/**
 * Canvas surface colors — warm, not clinical white.
 * DESIGN.md §1: feels like a physical cork board, not a CRM screen.
 */
export const CANVAS_BG = {
  light: '#F5F0E8',
  dark: '#1E1C1A',
} as const;

/**
 * Dot-grid overlay colors for Edit mode.
 * DESIGN.md §1: 2px dots on 16px grid.
 */
export const CANVAS_DOT_COLOR = {
  light: 'rgba(0,0,0,0.09)',
  dark: 'rgba(255,255,255,0.09)',
} as const;

/** Sticky note body text — always near-black for contrast on any hue. */
export const STICKY_TEXT_COLOR = '#1A1A1A';
/** Sticky placeholder — 40% opacity near-black. */
export const STICKY_PLACEHOLDER_COLOR = 'rgba(26,26,26,0.4)';

/** Widget delete affordance color (× button). */
export const WIDGET_DELETE_COLOR = '#EF4444';

/** Primary accent for Edit mode pill and focus rings. */
export const PRIMARY_COLOR = '#023c69';

/** Snap-to-grid cell size in px (matches mobile 16pt grid). */
export const GRID_SIZE = 16;

/** Snap a coordinate to the nearest grid cell. */
export const snapToGrid = (v: number): number => Math.round(v / GRID_SIZE) * GRID_SIZE;
