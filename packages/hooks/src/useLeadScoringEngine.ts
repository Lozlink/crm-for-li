import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import type { LeadScoreBreakdown, LeadTier, Contact, SoldRecord, InspectionAttendee } from '@realestate-crm/types';
import { haversineDistance, normalizeAddress } from '@realestate-crm/utils';
import { useCRMStore } from './useCRMStore';
import { useDataEnrichmentStore } from './useDataEnrichmentStore';
import { useDeclaredBuildingsStore } from './useDeclaredBuildingsStore';
import { useInspectionStore } from './useInspectionStore';
import { usePropertyStore } from './usePropertyStore';
import { useTrackingStore } from './useTrackingStore';

/**
 * Parse street name from a full address (same logic as useStreetStats).
 */
function extractStreetName(address: string): string | null {
  if (!address) return null;
  const streetPart = address.split(',')[0].trim();
  const withoutUnit = streetPart.replace(/^(unit|lot|apt|suite)\s+\S+\//i, '').trim();
  const streetName = withoutUnit.replace(/^\d+[a-zA-Z]?\s+/, '').trim();
  return streetName || null;
}

function extractSuburb(address: string): string {
  const parts = address.split(',');
  if (parts.length < 2) return 'Unknown';
  const suburbPart = parts[1].trim();
  return suburbPart.replace(/\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4}$/i, '').trim() || 'Unknown';
}

// Thresholds preserve the original 25%/50%/75%-of-max percentile cutoffs after the
// building-coverage bonus widened the score range from 0-100 to 0-108. Without rescaling,
// a +8 bonus alone could push a borderline contact a full tier up — the bonus is meant to
// be a momentum bias, not a tier kicker. 27/54/81 = round(108 * 0.25/0.5/0.75).
function computeTier(total: number): LeadTier {
  if (total >= 81) return 'hot';
  if (total >= 54) return 'warm';
  if (total >= 27) return 'cold';
  return 'dormant';
}

function makeSoldGridKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100)}:${Math.round(lng * 100)}`;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const CONVERSION_STATUSES = new Set(['available', 'under_offer', 'exchanged', 'settled']);

// Declared-building coverage signal — see LeadScoreBreakdown for rationale.
// "In-progress pipeline" bonus: contacts in buildings the agent has started but not finished
// get a small priority bump (finishing the building has high marginal ROI — already on-site,
// momentum, and rapport with neighbours). Trapezoidal so we don't reward declaring without
// canvassing (ratio≈0) or already-finished buildings (ratio≈1).
const BUILDING_COVERAGE_MAX = 8;
const COVERAGE_RAMP_LOW = 0.05;
const COVERAGE_RAMP_HIGH = 0.95;

function buildingCoverageBonus(visited: number, estimated: number): number {
  if (estimated <= 0 || visited <= 0) return 0;
  const ratio = visited / estimated;
  if (ratio >= 1) return 0; // building is done — no bump
  if (ratio < COVERAGE_RAMP_LOW) return BUILDING_COVERAGE_MAX * (ratio / COVERAGE_RAMP_LOW);
  if (ratio > COVERAGE_RAMP_HIGH) return BUILDING_COVERAGE_MAX * ((1 - ratio) / (1 - COVERAGE_RAMP_HIGH));
  return BUILDING_COVERAGE_MAX;
}

// Inspection attendance scoring constants.
//
// Rule: for each inspection_attendees row where contact_id matches, in the last 90 days:
//   - Base bonus by interest_level: hot=+12, warm=+6, cold=+2, null/unset=+4
//   - Recency multiplier: ≤14d → 1.0×, 15-45d → 0.6×, 46-90d → 0.3×, >90d → 0×
//   - Cap total inspection-attendance bonus at +30 points per contact
// Weights are intentionally smaller than engagement (0-25) and staleness (0-25) —
// a single attendance is a strong signal but shouldn't dominate over sustained engagement.
const INSPECTION_ATTENDANCE_CAP = 30;
const INTEREST_LEVEL_BASE: Record<string, number> = { hot: 12, warm: 6, cold: 2 };
const INTEREST_LEVEL_DEFAULT = 4;

function inspectionRecencyMultiplier(daysAgo: number): number {
  if (daysAgo <= 14) return 1.0;
  if (daysAgo <= 45) return 0.6;
  if (daysAgo <= 90) return 0.3;
  return 0;
}

export function useLeadScoringEngine(): {
  scores: Map<string, LeadScoreBreakdown>;
  isComputing: boolean;
  writeScoredContacts: () => Promise<void>;
  getScore: (contactId: string) => LeadScoreBreakdown | null;
  getTier: (contactId: string) => LeadTier;
} {
  const contacts = useCRMStore(s => s.contacts);
  const activities = useCRMStore(s => s.activities);
  const soldRecords = useDataEnrichmentStore(s => s.soldRecords);
  const suburbStats = useDataEnrichmentStore(s => s.suburbStats);
  const properties = usePropertyStore(s => s.properties);
  const declaredBuildings = useDeclaredBuildingsStore(s => s.declaredBuildings);
  const activeSession = useTrackingStore(s => s.activeSession);
  // Flatten all attendees across all fetched inspections into a single list.
  // useSmartSuggestions owns the fetchUpcoming() trigger; the engine reads whatever
  // attendees the store has hydrated (inspections + upcomingInspections).
  const inspections = useInspectionStore(s => s.inspections);
  const upcomingInspections = useInspectionStore(s => s.upcomingInspections);

  const [isComputing, setIsComputing] = useState(false);
  const prevSessionRef = useRef(activeSession);

  // Pre-build activity lookup: contactId -> { count, lastDate }
  const activityMap = useMemo(() => {
    const map = new Map<string, { count: number; lastDate: Date }>();
    for (const act of activities) {
      if (!act.created_at) continue;
      const existing = map.get(act.contact_id);
      const actDate = new Date(act.created_at);
      if (existing) {
        existing.count += 1;
        if (actDate > existing.lastDate) {
          existing.lastDate = actDate;
        }
      } else {
        map.set(act.contact_id, { count: 1, lastDate: actDate });
      }
    }
    return map;
  }, [activities]);

  // Pre-build sold grid: gridKey -> SoldRecord[] (only recent, with coords)
  const soldGrid = useMemo(() => {
    const now = Date.now();
    const grid = new Map<string, SoldRecord[]>();
    for (const record of soldRecords) {
      if (record.latitude == null || record.longitude == null) continue;
      if (!record.sale_date) continue;
      const saleTime = new Date(record.sale_date).getTime();
      if (now - saleTime > NINETY_DAYS_MS) continue;

      const key = makeSoldGridKey(record.latitude, record.longitude);
      const bucket = grid.get(key);
      if (bucket) {
        bucket.push(record);
      } else {
        grid.set(key, [record]);
      }
    }
    return grid;
  }, [soldRecords]);

  // Pre-build street conversions: streetKey -> count of listed properties
  const streetConversions = useMemo(() => {
    const map = new Map<string, number>();
    for (const prop of properties) {
      if (!CONVERSION_STATUSES.has(prop.status)) continue;
      if (!prop.address) continue;
      const street = extractStreetName(prop.address);
      if (!street) continue;
      const suburb = prop.suburb || extractSuburb(prop.address);
      const key = `${street}|${suburb}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [properties]);

  // Pre-build declared-building coverage: normalizedAddress -> { estimatedUnits, visitedUnits }.
  // visitedUnits = distinct unit_numbers among contacts at the same normalized address. Falling
  // back to the contact count when no unit_numbers are present keeps the signal alive for
  // buildings where the agent hasn't been recording unit numbers (still strictly bounded by
  // estimatedUnits via the coverage formula).
  const buildingCoverageMap = useMemo(() => {
    if (declaredBuildings.length === 0) return new Map<string, { estimatedUnits: number; visitedUnits: number }>();

    // Group contacts by normalized address.
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
          units: unit ? new Set([unit]) : new Set(),
          total: 1,
        });
      }
    }

    const map = new Map<string, { estimatedUnits: number; visitedUnits: number }>();
    for (const b of declaredBuildings) {
      const key = normalizeAddress(b.address);
      if (!key) continue;
      const bucket = contactsByAddr.get(key);
      const visited = bucket
        ? (bucket.units.size > 0 ? bucket.units.size : bucket.total)
        : 0;
      // If the same address is declared twice (shouldn't happen — store de-dupes — but be safe),
      // keep the larger estimate so the ratio never overshoots.
      const existing = map.get(key);
      const estimated = existing
        ? Math.max(existing.estimatedUnits, b.estimated_units)
        : b.estimated_units;
      map.set(key, { estimatedUnits: estimated, visitedUnits: visited });
    }
    return map;
  }, [declaredBuildings, contacts]);

  // Pre-build inspection attendance index: contactId -> InspectionAttendee[].
  // Built once per render from the union of loaded inspections (all + upcoming).
  // Using a Map avoids O(n) filtering per contact inside the scoring loop.
  const attendeeIndex = useMemo(() => {
    const map = new Map<string, InspectionAttendee[]>();
    const allInspections = [...inspections, ...upcomingInspections];
    for (const insp of allInspections) {
      if (!insp.attendees) continue;
      for (const att of insp.attendees) {
        if (!att.contact_id) continue;
        const bucket = map.get(att.contact_id);
        if (bucket) {
          bucket.push(att);
        } else {
          map.set(att.contact_id, [att]);
        }
      }
    }
    return map;
  }, [inspections, upcomingInspections]);

  // Pre-build suburb stats lookup and per-suburb contact counts
  const { suburbStatsMap, suburbContactCounts } = useMemo(() => {
    const statsMap = new Map<string, (typeof suburbStats)[number]>();
    for (const stat of suburbStats) {
      statsMap.set(stat.suburb.toLowerCase(), stat);
    }

    const contactCounts = new Map<string, number>();
    for (const contact of contacts) {
      if (!contact.address) continue;
      const suburb = extractSuburb(contact.address).toLowerCase();
      contactCounts.set(suburb, (contactCounts.get(suburb) || 0) + 1);
    }

    return { suburbStatsMap: statsMap, suburbContactCounts: contactCounts };
  }, [suburbStats, contacts]);

  // Main scoring computation
  const scores = useMemo(() => {
    const now = Date.now();
    const result = new Map<string, LeadScoreBreakdown>();
    const computedAt = new Date().toISOString();

    for (const contact of contacts) {
      // 1. Staleness (0-25)
      const actData = activityMap.get(contact.id);
      const daysSinceLastContact = actData
        ? (now - actData.lastDate.getTime()) / (1000 * 60 * 60 * 24)
        : 90;
      const staleness = 25 * Math.max(0, 1 - daysSinceLastContact / 90);

      // 2. Sales Momentum (0-25)
      let nearbyRecentSales = 0;
      if (contact.latitude != null && contact.longitude != null) {
        // Check the 3x3 grid cells around the contact's position
        const centerLat = Math.round(contact.latitude * 100);
        const centerLng = Math.round(contact.longitude * 100);
        for (let dLat = -1; dLat <= 1; dLat++) {
          for (let dLng = -1; dLng <= 1; dLng++) {
            const key = `${centerLat + dLat}:${centerLng + dLng}`;
            const bucket = soldGrid.get(key);
            if (!bucket) continue;
            for (const record of bucket) {
              const dist = haversineDistance(
                contact.latitude, contact.longitude,
                record.latitude!, record.longitude!,
              );
              if (dist <= 500) {
                nearbyRecentSales++;
              }
            }
          }
        }
      }
      const salesMomentum = 25 * Math.min(1, nearbyRecentSales / 5);

      // 3. Engagement (0-25)
      const activityCount = actData?.count ?? 0;
      const daysSinceLastActivity = actData
        ? (now - actData.lastDate.getTime()) / (1000 * 60 * 60 * 24)
        : 30;
      const recencyBonus = Math.max(0, 1 - daysSinceLastActivity / 30);
      const engagement = 25 * (Math.min(1, activityCount / 5) * 0.6 + recencyBonus * 0.4);

      // 4. Street Conversion (0-15)
      let streetListings = 0;
      if (contact.address) {
        const street = extractStreetName(contact.address);
        if (street) {
          const suburb = extractSuburb(contact.address);
          const key = `${street}|${suburb}`;
          streetListings = streetConversions.get(key) || 0;
        }
      }
      const streetConversion = 15 * Math.min(1, streetListings / 3);

      // 5. Penetration (0-10)
      let penetrationPct = 0;
      if (contact.address) {
        const suburb = extractSuburb(contact.address).toLowerCase();
        const stats = suburbStatsMap.get(suburb);
        if (stats?.total_dwellings) {
          const contactCount = suburbContactCounts.get(suburb) || 0;
          penetrationPct = (contactCount / stats.total_dwellings) * 100;
        }
      }
      const penetration = 10 * (1 - Math.min(1, penetrationPct / 10));

      // 6. Building Coverage (0-8) — momentum bonus for in-progress declared buildings
      let buildingCoverage = 0;
      if (contact.address && buildingCoverageMap.size > 0) {
        const key = normalizeAddress(contact.address);
        if (key) {
          const cov = buildingCoverageMap.get(key);
          if (cov) buildingCoverage = buildingCoverageBonus(cov.visitedUnits, cov.estimatedUnits);
        }
      }

      // 7. Inspection Attendance (0-30) — open-home attendance is a strong buying-intent signal.
      // Base points by interest_level × recency multiplier, capped at INSPECTION_ATTENDANCE_CAP.
      let inspectionAttendance = 0;
      const attendances = attendeeIndex.get(contact.id);
      if (attendances) {
        let raw = 0;
        for (const att of attendances) {
          if (!att.created_at) continue;
          const daysAgo = (now - new Date(att.created_at).getTime()) / (1000 * 60 * 60 * 24);
          const multiplier = inspectionRecencyMultiplier(daysAgo);
          if (multiplier === 0) continue;
          const base = att.interest_level
            ? (INTEREST_LEVEL_BASE[att.interest_level] ?? INTEREST_LEVEL_DEFAULT)
            : INTEREST_LEVEL_DEFAULT;
          raw += base * multiplier;
        }
        inspectionAttendance = Math.min(raw, INSPECTION_ATTENDANCE_CAP);
      }

      const total = Math.round(
        staleness + salesMomentum + engagement + streetConversion + penetration + buildingCoverage + inspectionAttendance,
      );

      result.set(contact.id, {
        contactId: contact.id,
        total,
        tier: computeTier(total),
        components: {
          staleness: Math.round(staleness * 10) / 10,
          salesMomentum: Math.round(salesMomentum * 10) / 10,
          engagement: Math.round(engagement * 10) / 10,
          streetConversion: Math.round(streetConversion * 10) / 10,
          penetration: Math.round(penetration * 10) / 10,
          buildingCoverage: Math.round(buildingCoverage * 10) / 10,
          inspectionAttendance: Math.round(inspectionAttendance * 10) / 10,
        },
        lastComputedAt: computedAt,
      });
    }

    return result;
  }, [contacts, activityMap, soldGrid, streetConversions, suburbStatsMap, suburbContactCounts, buildingCoverageMap, attendeeIndex]);

  // Write-back: batch update contacts whose lead_score has changed
  const writeScoredContacts = useCallback(async () => {
    setIsComputing(true);
    try {
      const currentContacts = useCRMStore.getState().contacts;
      const updateContact = useCRMStore.getState().updateContact;

      const toUpdate: { id: string; score: number }[] = [];
      for (const contact of currentContacts) {
        const breakdown = scores.get(contact.id);
        if (!breakdown) continue;
        if (contact.lead_score !== breakdown.total) {
          toUpdate.push({ id: contact.id, score: breakdown.total });
        }
      }

      // Batch in groups of 50 with 200ms gaps
      for (let i = 0; i < toUpdate.length; i += 50) {
        const batch = toUpdate.slice(i, i + 50);
        await Promise.all(
          batch.map(({ id, score }) => updateContact(id, { lead_score: score })),
        );
        if (i + 50 < toUpdate.length) {
          await new Promise<void>(resolve => setTimeout(() => resolve(), 200));
        }
      }
    } finally {
      setIsComputing(false);
    }
  }, [scores]);

  // Trigger write-back when tracking session transitions to null (session ended)
  useEffect(() => {
    if (prevSessionRef.current != null && activeSession == null) {
      writeScoredContacts();
    }
    prevSessionRef.current = activeSession;
  }, [activeSession, writeScoredContacts]);

  const getScore = useCallback(
    (contactId: string): LeadScoreBreakdown | null => scores.get(contactId) ?? null,
    [scores],
  );

  const getTier = useCallback(
    (contactId: string): LeadTier => scores.get(contactId)?.tier ?? 'dormant',
    [scores],
  );

  return { scores, isComputing, writeScoredContacts, getScore, getTier };
}
