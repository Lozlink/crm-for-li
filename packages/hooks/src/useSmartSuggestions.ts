import { useMemo, useEffect, useRef } from 'react';
import type { Contact } from '@realestate-crm/types';
import { haversineDistance, normalizeAddress } from '@realestate-crm/utils';
import { useCRMStore } from './useCRMStore';
import { useLeadScoringEngine } from './useLeadScoringEngine';
import { useDeclaredBuildingsStore } from './useDeclaredBuildingsStore';
import { useTrackingStore } from './useTrackingStore';
import { useInspectionStore } from './useInspectionStore';
import { useAuthStore } from './useAuthStore';
import { useProspectingMetrics } from './useProspectingMetrics';

/**
 * Composite read-only hook that produces ranked suggestion cards for the
 * Smart Whiteboard's Intelligence sidebar.
 *
 * Pure derived state — does NOT persist to the database. When the user taps
 * "Add to board" on a SuggestionCard, the consumer turns the suggestion into
 * a `whiteboard_items` row (that flow lives outside this hook).
 *
 * Composes existing read-only hooks: lead scoring, declared buildings,
 * tracking sessions/annotations, prospecting metrics, contacts, inspections.
 *
 * Suggestions are scored 0-100 by deterministic, domain-rule-based
 * prioritization (no learned model). Top 8 are returned, sorted by score.
 */

export type SmartSuggestionKind = 'hot_prospects' | 'coverage_gap' | 'today_play' | 'route';

export interface SmartSuggestion {
  /** Stable id derived from kind + payload — same suggestion produces the same id across renders. */
  id: string;
  kind: SmartSuggestionKind;
  /** User-facing card title. */
  title: string;
  /** User-facing single-line context — optional. */
  subtitle?: string;
  /** Per-kind data. Open shape so it can be persisted as `whiteboard_items.content.payload` (jsonb). */
  payload: Record<string, unknown>;
  /** Priority score 0-100; higher = more important. */
  score: number;
}

const MAX_SUGGESTIONS = 8;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Lead score threshold for "high-score" / hot-prospect candidacy. */
const HIGH_SCORE_THRESHOLD = 70;
/** Staleness threshold — contact is "uncalled" if last contact >= this many days ago. */
const STALE_DAYS = 7;
/** Geographic radius (metres) for the door-knock route cluster. */
const ROUTE_RADIUS_METERS = 10_000;
/** Min route size — fewer than this and we don't bother with a route suggestion. */
const ROUTE_MIN_CONTACTS = 3;
/** Coverage % threshold for the coverage_gap suggestion. */
const COVERAGE_GAP_THRESHOLD = 50;

/** Clamp + round to integer in [0, 100]. */
function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return Math.round(n);
}

/** Stable secondary sort by id keeps ordering deterministic when scores tie. */
function compareByScoreDesc(a: SmartSuggestion, b: SmartSuggestion): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** True iff the date is on the same local calendar day as `reference`. */
function isSameLocalDay(date: Date, reference: Date): boolean {
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

/**
 * Greedy nearest-neighbour TSP — good enough for an 8-card sidebar and avoids
 * a heavyweight optimiser. Starts at `origin`, repeatedly hops to the closest
 * unvisited point. O(n²) which is fine for the small N we'll see here.
 */
function buildNearestNeighbourRoute(
  origin: { lat: number; lng: number },
  points: { id: string; lat: number; lng: number }[],
): { contactIds: string[]; orderedLatLngs: { lat: number; lng: number }[] } {
  const remaining = [...points];
  const orderedIds: string[] = [];
  const orderedCoords: { lat: number; lng: number }[] = [];
  let current = origin;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineDistance(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    orderedIds.push(next.id);
    orderedCoords.push({ lat: next.lat, lng: next.lng });
    current = { lat: next.lat, lng: next.lng };
  }
  return { contactIds: orderedIds, orderedLatLngs: orderedCoords };
}

export function useSmartSuggestions(): { suggestions: SmartSuggestion[]; isLoading: boolean } {
  const contacts = useCRMStore(s => s.contacts);
  const isCRMLoading = useCRMStore(s => s.isLoading);
  const { scores, isComputing } = useLeadScoringEngine();
  const declaredBuildings = useDeclaredBuildingsStore(s => s.declaredBuildings);
  const isBuildingsLoading = useDeclaredBuildingsStore(s => s.isLoading);
  const allAnnotations = useTrackingStore(s => s.allAnnotations);
  const fetchUpcoming = useInspectionStore(s => s.fetchUpcoming);
  const isInspectionLoading = useInspectionStore(s => s.isLoading);
  const upcomingInspections = useInspectionStore(s => s.upcomingInspections);
  // Subscribed for explicit dep tracking — the metrics hook already reads these stores
  // internally, but listing them here keeps future signal additions ergonomic.
  const metrics = useProspectingMetrics();
  void metrics;

  // In-flight guard — prevents concurrent fetchUpcoming calls on rapid remounts.
  const fetchInFlightRef = useRef(false);

  useEffect(() => {
    if (useAuthStore.getState().isDemoMode) return;

    const doFetch = async () => {
      if (fetchInFlightRef.current || useInspectionStore.getState().isLoading) return;
      fetchInFlightRef.current = true;
      try {
        await fetchUpcoming();
      } finally {
        fetchInFlightRef.current = false;
      }
    };

    doFetch();
    const interval = setInterval(doFetch, 5 * 60 * 1000);
    return () => clearInterval(interval);
    // fetchUpcoming is stable (Zustand selector), isDemoMode checked imperatively to avoid re-running on auth changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchUpcoming]);

  const isLoading = isCRMLoading || isBuildingsLoading || isComputing || isInspectionLoading;

  const suggestions = useMemo<SmartSuggestion[]>(() => {
    const out: SmartSuggestion[] = [];
    const now = Date.now();
    const today = new Date(now);

    // ──────────────────────────────────────────────────────────────────
    // Shared candidate pool: contacts with score >= 70 and no activity
    // in the last 7 days. Used by both `hot_prospects` (top-5 by score)
    // and `route` (10km cluster around origin).
    // ──────────────────────────────────────────────────────────────────
    type StaleHigh = { contact: Contact; total: number };
    const staleHigh: StaleHigh[] = contacts.flatMap<StaleHigh>(c => {
      const breakdown = scores.get(c.id);
      if (!breakdown) return [];
      if (breakdown.total < HIGH_SCORE_THRESHOLD) return [];
      const lastMs = c.last_contacted_at ? new Date(c.last_contacted_at).getTime() : 0;
      const daysSince = lastMs ? (now - lastMs) / DAY_MS : Number.POSITIVE_INFINITY;
      if (daysSince < STALE_DAYS) return [];
      return [{ contact: c, total: breakdown.total }];
    });

    // ──────────────────────────────────────────────────────────────────
    // 1. HOT PROSPECTS — top 5 by lead score from the stale-high pool.
    //    Score: base 70 + (avg_score - 70), bonus capped at 30 → 70-100.
    // ──────────────────────────────────────────────────────────────────
    const topHot = [...staleHigh].sort((a, b) => b.total - a.total).slice(0, 5);
    if (topHot.length > 0) {
      const avgScore = topHot.reduce((s, x) => s + x.total, 0) / topHot.length;
      const bonus = Math.min(Math.max(avgScore - HIGH_SCORE_THRESHOLD, 0), 30);
      const rankScore = clampScore(70 + bonus);
      out.push({
        id: 'hot_prospects',
        kind: 'hot_prospects',
        title: 'Hot prospects to call',
        subtitle: `${topHot.length} lead${topHot.length === 1 ? '' : 's'} scoring above ${HIGH_SCORE_THRESHOLD} ${topHot.length === 1 ? 'is' : 'are'} overdue for contact`,
        payload: {
          contactIds: topHot.map(x => x.contact.id),
        },
        score: rankScore,
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 2. COVERAGE GAP — declared buildings with coverage < 50%.
    //    Coverage = unique unit_numbers among contacts at the same
    //    normalized address (falling back to contact count when no
    //    unit_numbers are present), divided by `estimated_units`.
    //    Score: base 50 + (50 - coverage%) → 50-100. (coverage=0 → 100)
    // ──────────────────────────────────────────────────────────────────
    const contactsByAddr = new Map<string, { units: Set<string>; total: number }>();
    for (const c of contacts) {
      if (!c.address) continue;
      const key = normalizeAddress(c.address);
      if (!key) continue;
      const bucket = contactsByAddr.get(key);
      const unit = c.unit_number?.trim();
      if (bucket) {
        bucket.total += 1;
        if (unit) bucket.units.add(unit);
      } else {
        contactsByAddr.set(key, {
          units: unit ? new Set([unit]) : new Set<string>(),
          total: 1,
        });
      }
    }

    for (const b of declaredBuildings) {
      if (!b.estimated_units || b.estimated_units <= 0) continue;
      const key = normalizeAddress(b.address);
      if (!key) continue;
      const bucket = contactsByAddr.get(key);
      const visited = bucket ? (bucket.units.size > 0 ? bucket.units.size : bucket.total) : 0;
      const coveragePct = Math.min(100, (visited / b.estimated_units) * 100);
      if (coveragePct >= COVERAGE_GAP_THRESHOLD) continue;

      const rounded = Math.round(coveragePct);
      const rankScore = clampScore(50 + (COVERAGE_GAP_THRESHOLD - rounded));

      out.push({
        id: `coverage_gap:${b.id}`,
        kind: 'coverage_gap',
        title: `Building under 50% covered — ${b.address}`,
        subtitle: `${visited} of ${b.estimated_units} units canvassed (${rounded}%)`,
        payload: {
          buildingId: b.id,
          coverage: rounded,
          address: b.address,
          // Carry coords so SuggestionCard can fly the map directly to the
          // building rather than just enabling the layer and leaving the
          // user to find it by hand.
          lat: b.latitude,
          lng: b.longitude,
        },
        score: rankScore,
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 3. TODAY'S PLAY — one suggestion per upcoming inspection scheduled
    //    today. Always score 90 (time-sensitive).
    // ──────────────────────────────────────────────────────────────────
    for (const insp of upcomingInspections) {
      if (!insp.scheduled_at) continue;
      const scheduled = new Date(insp.scheduled_at);
      if (!isSameLocalDay(scheduled, today)) continue;
      const address = insp.property?.address || 'Property';
      out.push({
        id: `today_play:${insp.id}`,
        kind: 'today_play',
        title: `Open home today: ${address}`,
        subtitle: scheduled.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }),
        payload: {
          inspectionId: insp.id,
        },
        score: 90,
      });
    }

    // ──────────────────────────────────────────────────────────────────
    // 4. ROUTE — 3+ stale-high contacts within 10km of the user's
    //    current location (most recent annotation as a proxy; falls back
    //    to the first qualifying contact). Ordered via greedy nearest
    //    neighbour from the origin.
    //    Score: base 60 + (count - 3) × 5, capped at 80 → 60-80.
    // ──────────────────────────────────────────────────────────────────
    const geocodedHigh = staleHigh.filter(
      (x): x is { contact: Contact & { latitude: number; longitude: number }; total: number } =>
        x.contact.latitude != null && x.contact.longitude != null,
    );

    if (geocodedHigh.length >= ROUTE_MIN_CONTACTS) {
      // Origin: most recent annotation, else first qualifying contact.
      const latestAnnotation = allAnnotations.length > 0
        ? [...allAnnotations]
            .filter(a => a.created_at)
            .sort((a, b) =>
              new Date(b.created_at as string).getTime() -
              new Date(a.created_at as string).getTime(),
            )[0]
        : undefined;

      const origin = latestAnnotation
        ? { lat: latestAnnotation.latitude, lng: latestAnnotation.longitude }
        : { lat: geocodedHigh[0].contact.latitude, lng: geocodedHigh[0].contact.longitude };

      const within = geocodedHigh.filter(
        x => haversineDistance(origin.lat, origin.lng, x.contact.latitude, x.contact.longitude) <= ROUTE_RADIUS_METERS,
      );

      if (within.length >= ROUTE_MIN_CONTACTS) {
        const route = buildNearestNeighbourRoute(
          origin,
          within.map(x => ({ id: x.contact.id, lat: x.contact.latitude, lng: x.contact.longitude })),
        );
        const rankScore = clampScore(Math.min(60 + (within.length - ROUTE_MIN_CONTACTS) * 5, 80));
        out.push({
          id: 'route',
          kind: 'route',
          title: `Door-knock route — ${within.length} high-value contacts`,
          subtitle: `Within ${Math.round(ROUTE_RADIUS_METERS / 1000)}km, all overdue for contact`,
          payload: {
            contactIds: route.contactIds,
            orderedLatLngs: route.orderedLatLngs,
          },
          score: rankScore,
        });
      }
    }

    return out.sort(compareByScoreDesc).slice(0, MAX_SUGGESTIONS);
  }, [contacts, scores, declaredBuildings, allAnnotations, upcomingInspections]);

  return { suggestions, isLoading };
}
