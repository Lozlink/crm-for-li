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

// ── Intelligence layer: suggestion kind color tokens ──────────────────────────
//
// Four kinds matching SmartSuggestion.kind from useSmartSuggestions and the
// canonical WhiteboardSuggestionKind in @realestate-crm/types. Deliberately
// distinct from the sticky palette — agents immediately recognise "these cards
// came from the Intelligence layer, not from me."
//
// Copy rule: NO "AI" in label strings. See DESIGN.md §12.

export type SuggestionKind = 'hot_prospects' | 'coverage_gap' | 'today_play' | 'route';

export interface SuggestionKindDef {
  kind: SuggestionKind;
  /** Short label — real-estate-agent voice. No "AI" language. */
  label: string;
  /** Left-stripe / tinted-bg accent in light mode. */
  light: string;
  /** Left-stripe / tinted-bg accent in dark mode. */
  dark: string;
  /** MaterialCommunityIcons icon name for the card header and sidebar list. */
  icon: string;
}

/**
 * Canonical kind color + icon table.
 * Colors are spec-mandated (DESIGN.md §12.1): same accent value used in both
 * light and dark since these are accent stripes/chips, not full backgrounds.
 */
export const SUGGESTION_KIND_DEFS: SuggestionKindDef[] = [
  { kind: 'hot_prospects', label: 'Hot prospects',    light: '#EF4444', dark: '#EF4444', icon: 'fire' },
  { kind: 'coverage_gap',  label: 'Coverage gap',     light: '#F59E0B', dark: '#F59E0B', icon: 'map-marker-alert-outline' },
  { kind: 'today_play',    label: "Today's play",     light: '#10B981', dark: '#10B981', icon: 'calendar-today' },
  { kind: 'route',         label: 'Door-knock route', light: '#6366F1', dark: '#6366F1', icon: 'map-marker-path' },
];

/** Returns the accent color for the current color scheme. */
export function suggestionKindColorForScheme(
  def: SuggestionKindDef,
  colorScheme: 'light' | 'dark' | null | undefined,
): string {
  return colorScheme === 'dark' ? def.dark : def.light;
}

/** Returns the SuggestionKindDef for the given kind, falling back to hot_prospects. */
export function getSuggestionKindDef(kind: SuggestionKind): SuggestionKindDef {
  return SUGGESTION_KIND_DEFS.find((d) => d.kind === kind) ?? SUGGESTION_KIND_DEFS[0];
}
