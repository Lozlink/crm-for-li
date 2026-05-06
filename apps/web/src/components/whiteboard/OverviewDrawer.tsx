'use client';

import { useState, useMemo, useCallback } from 'react';
import type {
  WhiteboardItem,
  WhiteboardItemType,
  WhiteboardStickyContent,
  WhiteboardChecklistContent,
  WhiteboardPhotoContent,
  WhiteboardContactContent,
  WhiteboardPropertyContent,
  WhiteboardMapContent,
  WhiteboardGoalContent,
  WhiteboardSuggestionContent,
} from '@realestate-crm/types';

// ── Title derivation ──────────────────────────────────────────────────────────

function deriveTitle(item: WhiteboardItem): string {
  switch (item.type) {
    case 'sticky': {
      const c = item.content as WhiteboardStickyContent;
      return c.text.slice(0, 40).trim() || 'Quick note';
    }
    case 'checklist': {
      const c = item.content as WhiteboardChecklistContent;
      const label = c.title || 'To-do';
      const checked = c.items.filter((e) => e.checked).length;
      const total = c.items.length;
      if (total > 0) return `${label} (${checked} / ${total})`;
      return label;
    }
    case 'photo': {
      const c = item.content as WhiteboardPhotoContent;
      return c.caption || 'Photo';
    }
    case 'contact': {
      const c = item.content as WhiteboardContactContent;
      return c.snapshotName || 'Contact';
    }
    case 'property': {
      const c = item.content as WhiteboardPropertyContent;
      return c.snapshotAddress || 'Property';
    }
    case 'map': {
      const c = item.content as WhiteboardMapContent;
      if (c.address) return c.address;
      if (c.suburb) return `Map pin — ${c.suburb}`;
      return 'Map pin';
    }
    case 'goal': {
      const c = item.content as WhiteboardGoalContent;
      const metricLabel: Record<string, string> = {
        commission: 'Commission target',
        listings: 'Listings target',
        leads: 'Leads target',
        calls: 'Calls target',
      };
      return `${metricLabel[c.metric] ?? c.metric} — ${c.target}/${c.period}`;
    }
    case 'suggestion': {
      const c = item.content as WhiteboardSuggestionContent;
      return c.title;
    }
    default:
      return 'Widget';
  }
}

function deriveSubtitle(item: WhiteboardItem): string | null {
  switch (item.type) {
    case 'checklist': {
      const c = item.content as WhiteboardChecklistContent;
      return c.items.length === 0 ? 'No items yet' : null;
    }
    case 'map': {
      const c = item.content as WhiteboardMapContent;
      return c.suburb ?? null;
    }
    case 'suggestion': {
      const c = item.content as WhiteboardSuggestionContent;
      return c.body || null;
    }
    default:
      return null;
  }
}

// ── Widget type metadata ──────────────────────────────────────────────────────

interface TypeDef {
  label: string;
  pluralLabel: string;
  accent: string;
  Icon: () => React.ReactElement;
}

const TYPE_DEFS: Record<WhiteboardItemType, TypeDef> = {
  sticky:     { label: 'note',       pluralLabel: 'notes',       accent: '#F59E0B', Icon: StickyIcon },
  checklist:  { label: 'to-do',      pluralLabel: 'to-dos',      accent: '#10B981', Icon: ChecklistIcon },
  photo:      { label: 'photo',      pluralLabel: 'photos',      accent: '#6366F1', Icon: PhotoIcon },
  contact:    { label: 'contact',    pluralLabel: 'contacts',    accent: '#3B82F6', Icon: ContactIcon },
  property:   { label: 'property',   pluralLabel: 'properties',  accent: '#EC4899', Icon: PropertyIcon },
  map:        { label: 'map',        pluralLabel: 'maps',        accent: '#06B6D4', Icon: MapIcon },
  goal:       { label: 'goal',       pluralLabel: 'goals',       accent: '#8B5CF6', Icon: GoalIcon },
  suggestion: { label: 'suggestion', pluralLabel: 'suggestions', accent: '#EF4444', Icon: SuggestionIcon },
};

const ALL_TYPES: WhiteboardItemType[] = [
  'sticky', 'checklist', 'photo', 'contact', 'property', 'map', 'goal', 'suggestion',
];

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  items: WhiteboardItem[];
  onClose: () => void;
  onJumpTo: (item: WhiteboardItem) => void;
}

/**
 * Right-anchored Overview Drawer (~400px wide).
 *
 * Shows all whiteboard items as a searchable, filterable list. Tap a row to
 * pan the canvas to that item and close the drawer.
 *
 * Deferred (future sprint): bulk multi-select, drag-to-reorder, group-by type, export.
 */
export function OverviewDrawer({ items, onClose, onJumpTo }: Props) {
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<WhiteboardItemType>>(
    new Set(ALL_TYPES),
  );

  const toggleFilter = useCallback((type: WhiteboardItemType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Count by type for chip labels
  const countByType = useMemo(() => {
    const counts: Partial<Record<WhiteboardItemType, number>> = {};
    for (const item of items) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  // Sorted + filtered + searched list
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return [...items]
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      .filter((it) => activeFilters.has(it.type))
      .filter((it) => {
        if (!q) return true;
        const title = deriveTitle(it).toLowerCase();
        const subtitle = (deriveSubtitle(it) ?? '').toLowerCase();
        return title.includes(q) || subtitle.includes(q);
      });
  }, [items, activeFilters, search]);

  const handleRowTap = useCallback(
    (item: WhiteboardItem) => {
      onJumpTo(item);
      onClose();
    },
    [onJumpTo, onClose],
  );

  // Header count chips — only show types that have at least 1 item
  const headerChips = useMemo(() => {
    return ALL_TYPES.flatMap((type) => {
      const count = countByType[type] ?? 0;
      if (count === 0) return [];
      const def = TYPE_DEFS[type];
      const label = count === 1 ? `1 ${def.label}` : `${count} ${def.pluralLabel}`;
      return [{ type, label, count }];
    });
  }, [countByType]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden
      />

      {/* Drawer */}
      <div
        className="fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col border-l border-gray-200 bg-white shadow-2xl"
        style={{ transition: 'transform 200ms cubic-bezier(.2,.8,.2,1)' }}
        role="dialog"
        aria-label="Board overview"
      >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-gray-100 px-4 pb-3 pt-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">Board list</h2>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close board list"
            >
              <XIcon />
            </button>
          </div>

          {/* Widget count chips */}
          {headerChips.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {headerChips.map(({ type, label }) => (
                <span
                  key={type}
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    backgroundColor: TYPE_DEFS[type].accent + '22',
                    color: TYPE_DEFS[type].accent,
                  }}
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Search */}
          <div className="relative">
            <SearchIcon className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search board…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-sm text-gray-800 placeholder-gray-400 outline-none focus:border-blue-400 focus:bg-white"
            />
          </div>
        </div>

        {/* ── Filter chips ────────────────────────────────────────────── */}
        <div className="shrink-0 overflow-x-auto border-b border-gray-100 px-4 py-2">
          <div className="flex gap-1.5">
            {ALL_TYPES.filter((t) => (countByType[t] ?? 0) > 0).map((type) => {
              const def = TYPE_DEFS[type];
              const active = activeFilters.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleFilter(type)}
                  className="flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors"
                  style={{
                    backgroundColor: active ? def.accent + '22' : 'transparent',
                    borderColor: active ? def.accent : '#E5E7EB',
                    color: active ? def.accent : '#9CA3AF',
                  }}
                >
                  <def.Icon />
                  <span className="capitalize">{def.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── List ────────────────────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <BoardEmptyIcon className="h-12 w-12 text-gray-300" />
              <p className="text-sm font-semibold text-gray-500">Your board is empty</p>
              <p className="text-xs text-gray-400">Tap + to add your first widget.</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-sm font-semibold text-gray-500">No matches</p>
              <p className="text-xs text-gray-400">Adjust the filter or search.</p>
            </div>
          ) : (
            <ul>
              {filtered.map((item) => (
                <OverviewRow
                  key={item.id}
                  item={item}
                  onTap={handleRowTap}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface RowProps {
  item: WhiteboardItem;
  onTap: (item: WhiteboardItem) => void;
}

function OverviewRow({ item, onTap }: RowProps) {
  const def = TYPE_DEFS[item.type] ?? TYPE_DEFS.sticky;
  const title = deriveTitle(item);
  const subtitle = deriveSubtitle(item);

  return (
    <li>
      <button
        className="flex w-full items-center gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50"
        onClick={() => onTap(item)}
      >
        {/* Left accent stripe */}
        <div
          className="h-10 w-1 shrink-0 rounded-full"
          style={{ backgroundColor: def.accent }}
        />

        {/* Icon */}
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: def.accent + '18' }}
        >
          <def.Icon />
        </div>

        {/* Text */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-800">{title}</p>
          {subtitle && (
            <p className="truncate text-xs text-gray-400">{subtitle}</p>
          )}
        </div>

        {/* Chevron */}
        <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300" />
      </button>
    </li>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function StickyIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
    </svg>
  );
}

function ChecklistIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function PhotoIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

function ContactIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PropertyIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function GoalIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
    </svg>
  );
}

function SuggestionIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0016.803 15.803z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}

function BoardEmptyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}
