'use client';

import React, { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { WhiteboardItem, WhiteboardSuggestionContent, WhiteboardSuggestionKind } from '@realestate-crm/types';

// ── Kind metadata ────────────────────────────────────────────────────────────

interface KindDef {
  label: string;
  accent: string;
  ctaLabel: string;
  Icon: () => React.ReactElement;
}

const KIND_DEFS: Record<WhiteboardSuggestionKind, KindDef> = {
  hot_prospects: {
    label: 'Hot prospects',
    accent: '#EF4444',
    ctaLabel: 'Call now',
    Icon: FireIcon,
  },
  coverage_gap: {
    label: 'Coverage gap',
    accent: '#F59E0B',
    ctaLabel: 'Open map',
    Icon: MapAlertIcon,
  },
  today_play: {
    label: "Today's play",
    accent: '#10B981',
    ctaLabel: 'View inspection',
    Icon: CalendarIcon,
  },
  route: {
    label: 'Door-knock route',
    accent: '#6366F1',
    ctaLabel: 'Open route',
    Icon: RouteIcon,
  },
};

// ── Route translation ─────────────────────────────────────────────────────────
//
// Mobile expo-router paths → Next.js App Router equivalents.
//
// Map deep-link zoom param contract: mobile sends ?zoom=<latitudeDelta>.
// Web /map consumer converts latitudeDelta → tile-zoom via log2 (see MapView.tsx).
// We pass latitudeDelta unchanged so the conversion happens at the boundary.

function buildWebNavTarget(
  kind: WhiteboardSuggestionKind,
  payload: Record<string, unknown> | undefined,
): string | null {
  switch (kind) {
    case 'hot_prospects': {
      const ids = payload?.contactIds as string[] | undefined;
      if (ids?.[0]) return `/contacts/${ids[0]}`;
      return '/contacts';
    }
    case 'coverage_gap': {
      const lat = payload?.lat as number | undefined;
      const lng = payload?.lng as number | undefined;
      if (typeof lat === 'number' && typeof lng === 'number') {
        // Tile-zoom 17 ≈ 0.0027° delta — close enough to spot the building.
        const delta = 360 / Math.pow(2, 17);
        return `/map?lat=${lat}&lng=${lng}&zoom=${delta}&layer=buildings`;
      }
      return '/map?layer=buildings';
    }
    case 'today_play': {
      // No dedicated inspection route on web — fall back to prospecting
      return '/prospecting';
    }
    case 'route': {
      const lls = payload?.orderedLatLngs as { lat: number; lng: number }[] | undefined;
      if (lls?.[0]) {
        return `/map?lat=${lls[0].lat}&lng=${lls[0].lng}&zoom=0.05&layer=contacts`;
      }
      return null;
    }
  }
}

/** Darken a 6-char hex toward black by `amount` (0–1). */
function darken(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(raw.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(raw.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(raw.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  item: WhiteboardItem;
}

/**
 * Suggestion widget body — web version of mobile SuggestionCard.
 *
 * Read-only in Move mode. CTA button in Edit mode navigates to the correct
 * web route using Next.js router.push().
 *
 * Copy rule: NO "AI" in any displayed string — use "Intelligence" if needed.
 */
export function SuggestionCard({ item }: Props) {
  const router = useRouter();
  const content = item.content as WhiteboardSuggestionContent;
  const { kind, title, body, payload } = content;

  const def = KIND_DEFS[kind] ?? KIND_DEFS.hot_prospects;
  const accentColor = def.accent;
  const labelColor = darken(accentColor, 0.45);

  const handleNavigate = useCallback(() => {
    const target = buildWebNavTarget(kind, payload);
    if (!target) return;
    router.push(target);
  }, [kind, payload, router]);

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white"
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        borderLeftWidth: 4,
        borderLeftColor: accentColor,
        boxShadow: '0 2px 4px rgba(0,0,0,0.07)',
        paddingLeft: 10,
        paddingRight: 12,
        paddingTop: 8,
        paddingBottom: 6,
      }}
    >
      {/* Kind badge row */}
      <div
        className="mb-1.5 flex items-center gap-1.5 self-start rounded-md px-1.5 py-0.5"
        style={{ backgroundColor: accentColor + '22' }}
      >
        <def.Icon />
        <span className="text-[11px] font-semibold tracking-wide" style={{ color: labelColor }}>
          {def.label}
        </span>
      </div>

      {/* Title */}
      <p className="mb-0.5 truncate text-sm font-semibold text-gray-900">{title}</p>

      {/* Body */}
      {!!body && (
        <p className="mb-1 line-clamp-2 text-xs text-gray-500">{body}</p>
      )}

      {/* Footer CTA */}
      <div className="mt-auto flex items-center justify-between pt-1">
        <span className="text-[11px] text-gray-400">Tap to view</span>
        <button
          className="flex items-center gap-0.5 rounded-md px-2 py-1 text-[11px] font-bold transition-opacity hover:opacity-80"
          style={{ backgroundColor: accentColor + '22', color: labelColor }}
          onClick={handleNavigate}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={`${def.ctaLabel} — ${title}`}
        >
          {def.ctaLabel}
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

// ── Icons ────────────────────────────────────────────────────────────────────

function FireIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0112 21 8.25 8.25 0 016.038 7.048 8.287 8.287 0 009 9.6a8.983 8.983 0 013.361-6.867 8.21 8.21 0 003 2.48z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 00.495-7.467 5.99 5.99 0 00-1.925 3.546 5.974 5.974 0 01-2.133-1A3.75 3.75 0 0012 18z" />
    </svg>
  );
}

function MapAlertIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
    </svg>
  );
}

function RouteIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
