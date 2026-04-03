import { useMemo, useEffect, useRef, useCallback, useState } from 'react';
import type { LeadScoreBreakdown, LeadTier, Contact, SoldRecord } from '@realestate-crm/types';
import { haversineDistance } from '@realestate-crm/utils';
import { useCRMStore } from './useCRMStore';
import { useDataEnrichmentStore } from './useDataEnrichmentStore';
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

function computeTier(total: number): LeadTier {
  if (total >= 75) return 'hot';
  if (total >= 50) return 'warm';
  if (total >= 25) return 'cold';
  return 'dormant';
}

function makeSoldGridKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100)}:${Math.round(lng * 100)}`;
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const CONVERSION_STATUSES = new Set(['available', 'under_offer', 'exchanged', 'settled']);

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
  const activeSession = useTrackingStore(s => s.activeSession);

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

      const total = Math.round(staleness + salesMomentum + engagement + streetConversion + penetration);

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
        },
        lastComputedAt: computedAt,
      });
    }

    return result;
  }, [contacts, activityMap, soldGrid, streetConversions, suburbStatsMap, suburbContactCounts]);

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
