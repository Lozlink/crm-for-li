import { create } from 'zustand';
import { storage } from '@realestate-crm/utils';

/**
 * Per-user customizable bottom-tab preferences.
 *
 * Users long-press any bottom tab to open the customize screen, which lets
 * them choose which routes appear in the tab bar and in what order. The
 * preference is keyed by user id so swapping accounts or teams gives each
 * person their own layout.
 *
 * Constraints:
 *   - At least 1 pinned tab (`MIN_PINNED`) so the bar is never empty.
 *   - At most 5 pinned tabs (`MAX_PINNED`) to stay within iOS native
 *     tab-bar comfort. Anything more crams labels.
 *   - The route still exists in `(tabs)/` whether pinned or not — unpinned
 *     ones are rendered with `href: null` so they're invisible in the bar
 *     but still reachable via the More grid, deep links, or programmatic
 *     navigation.
 */

export type TabKey =
  | 'index'
  | 'map'
  | 'prospecting'
  | 'whiteboard-tab'
  | 'more'
  | 'contacts'
  | 'pipeline'
  | 'properties'
  | 'tasks'
  | 'notes'
  | 'stats'
  | 'settings'
  | 'dialer-tab'
  | 'campaigns-tab'
  | 'compliance';

/** Every available tab key — the union of pinned + unpinned at any time. */
export const ALL_TAB_KEYS: readonly TabKey[] = [
  'index',
  'map',
  'prospecting',
  'whiteboard-tab',
  'more',
  'contacts',
  'pipeline',
  'properties',
  'tasks',
  'notes',
  'stats',
  'settings',
  // Redirect-style tabs (placeholder file in (tabs)/, actual route at root).
  // Follow the whiteboard-tab pattern.
  'dialer-tab',
  'campaigns-tab',
  // Opt-in Compliance Suite tab — never in the defaults; additionally gated
  // on `useComplianceStore.suiteEnabled` in the tab layout + customize screen.
  'compliance',
];

/**
 * What new users see before they customize.
 *
 * `whiteboard-tab` is intentionally NOT in the defaults: the Whiteboard is a
 * fullscreen modal route (`/whiteboard`), reachable from the More grid, the
 * top-header sticky-note icon, deep links, and entity "Pin to whiteboard"
 * snackbars. It stays in `ALL_TAB_KEYS` so the customize-tabs screen still
 * lists it as pinnable for users who want a one-tap tab-bar shortcut — when
 * pinned, its tab button redirects into the same `/whiteboard` modal via
 * `hrefOverride` (the tab bar stays visible behind the modal).
 */
export const DEFAULT_PINNED_TABS: TabKey[] = [
  'index',
  'map',
  'prospecting',
  'more',
];

export const MAX_PINNED = 5;
export const MIN_PINNED = 1;

const STORAGE_PREFIX = 'tabPrefs:v1:';

interface State {
  pinned: TabKey[];
  /** True once `loadForUser` has resolved at least once this session. */
  loaded: boolean;
  loadForUser: (userId: string | null) => Promise<void>;
  setPinned: (next: TabKey[]) => Promise<void>;
  togglePin: (key: TabKey) => Promise<void>;
  moveTabUp: (key: TabKey) => Promise<void>;
  moveTabDown: (key: TabKey) => Promise<void>;
  resetToDefaults: () => Promise<void>;
}

// Module-level cache of the active user id so persistence in setPinned etc.
// doesn't need to be threaded through every action call site. Refreshed by
// `loadForUser`.
let activeUserId: string | null = null;

async function persist(userId: string | null, pinned: TabKey[]): Promise<void> {
  if (!userId) return;
  try {
    await storage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(pinned));
  } catch {
    // Best-effort persistence; failing here just means the user re-customizes
    // next session. Don't block the UI on storage errors.
  }
}

/**
 * Validate + clamp arbitrary input (e.g. stale storage payload from an older
 * app version) to a usable pinned list. Falls back to defaults if the input
 * is structurally broken.
 */
function sanitize(input: unknown): TabKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_PINNED_TABS];
  const allKeysSet = new Set<TabKey>(ALL_TAB_KEYS);
  const valid = input.filter(
    (k): k is TabKey => typeof k === 'string' && allKeysSet.has(k as TabKey),
  );
  // Dedupe while preserving order.
  const seen = new Set<TabKey>();
  const unique: TabKey[] = [];
  for (const k of valid) {
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(k);
    }
  }
  if (unique.length < MIN_PINNED) return [...DEFAULT_PINNED_TABS];
  return unique.slice(0, MAX_PINNED);
}

export const useTabPreferencesStore = create<State>((set, get) => ({
  pinned: [...DEFAULT_PINNED_TABS],
  loaded: false,

  loadForUser: async (userId) => {
    activeUserId = userId;
    if (!userId) {
      set({ pinned: [...DEFAULT_PINNED_TABS], loaded: true });
      return;
    }
    try {
      const raw = await storage.getItem(`${STORAGE_PREFIX}${userId}`);
      if (!raw) {
        set({ pinned: [...DEFAULT_PINNED_TABS], loaded: true });
        return;
      }
      const parsed = JSON.parse(raw) as unknown;
      set({ pinned: sanitize(parsed), loaded: true });
    } catch {
      set({ pinned: [...DEFAULT_PINNED_TABS], loaded: true });
    }
  },

  setPinned: async (next) => {
    const sanitized = sanitize(next);
    set({ pinned: sanitized });
    await persist(activeUserId, sanitized);
  },

  togglePin: async (key) => {
    const { pinned } = get();
    if (pinned.includes(key)) {
      if (pinned.length <= MIN_PINNED) return; // can't drop below floor
      await get().setPinned(pinned.filter((k) => k !== key));
    } else {
      if (pinned.length >= MAX_PINNED) return; // can't exceed ceiling
      await get().setPinned([...pinned, key]);
    }
  },

  moveTabUp: async (key) => {
    const { pinned } = get();
    const idx = pinned.indexOf(key);
    if (idx <= 0) return;
    const next = [...pinned];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    await get().setPinned(next);
  },

  moveTabDown: async (key) => {
    const { pinned } = get();
    const idx = pinned.indexOf(key);
    if (idx === -1 || idx >= pinned.length - 1) return;
    const next = [...pinned];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    await get().setPinned(next);
  },

  resetToDefaults: async () => {
    await get().setPinned([...DEFAULT_PINNED_TABS]);
  },
}));
