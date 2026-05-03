/**
 * Whiteboard-specific color tokens.
 * These extend the app's MD3 Paper theme — import and use alongside `useTheme()`.
 *
 * Six sticky-note color pairs: light bg / dark bg.
 * Text is always #1A1A1A (near-black) for contrast on any hue.
 */

export interface StickyColorDef {
  name: string;
  light: string;
  dark: string;
  /** MaterialCommunityIcons icon name for the color picker */
  icon: string;
}

export const STICKY_COLOR_DEFS: StickyColorDef[] = [
  { name: 'Sunshine', light: '#FEF3AC', dark: '#D4A017', icon: 'weather-sunny' },
  { name: 'Coral',    light: '#FFCDD0', dark: '#D94F57', icon: 'heart-outline' },
  { name: 'Sky',      light: '#BFE0FD', dark: '#2E86C1', icon: 'weather-partly-cloudy' },
  { name: 'Mint',     light: '#BBFAD0', dark: '#1A9C5B', icon: 'leaf-maple' },
  { name: 'Peach',    light: '#FFE0C4', dark: '#D46A1E', icon: 'fruit-pineapple' },
  { name: 'Lavender', light: '#E2D9FC', dark: '#7C5CBF', icon: 'flower-tulip-outline' },
];

/** Pick the correct shade for the current color scheme. */
export function stickyColorForScheme(
  def: StickyColorDef,
  colorScheme: 'light' | 'dark' | null | undefined,
): string {
  return colorScheme === 'dark' ? def.dark : def.light;
}

/** Sunshine is the default sticky color. */
export const DEFAULT_STICKY_COLOR_DEF = STICKY_COLOR_DEFS[0];

/** Returns the light-mode hex value for a given color def (used as the stable storage key). */
export const stickyColorKey = (def: StickyColorDef) => def.light;

/**
 * Canvas surface colors — warm, not clinical white.
 * Reference these in WhiteboardCanvas background style.
 */
export const CANVAS_BG = {
  light: '#F5F0E8',
  dark: '#1E1C1A',
} as const;

/**
 * Dot-grid colors for Edit mode background.
 * Dot size: 2pt, spacing: 16pt.
 */
export const CANVAS_DOT_COLOR = {
  light: 'rgba(0,0,0,0.09)',
  dark: 'rgba(255,255,255,0.09)',
} as const;

/** Sticky note text — always near-black regardless of bg hue. */
export const STICKY_TEXT_COLOR = '#1A1A1A';
/** Sticky placeholder text — 40% opacity near-black. */
export const STICKY_PLACEHOLDER_COLOR = 'rgba(26,26,26,0.4)';

/** Widget delete button color. */
export const WIDGET_DELETE_COLOR = '#EF4444';
