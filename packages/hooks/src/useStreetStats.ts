import { useMemo, useCallback } from 'react';
import { useCRMStore } from './useCRMStore';
import { useDataEnrichmentStore } from './useDataEnrichmentStore';
import { usePropertyStore } from './usePropertyStore';
import type { Contact, StreetStats, SoldRecord, TerritoryBriefing } from '@realestate-crm/types';
import { haversineDistance } from '@realestate-crm/utils';

/**
 * Parse street name from a full address.
 * "15 Hornet Street, Greenfield Park NSW 2176" -> "Hornet Street"
 * "Unit 3/42 Smith Ave, Suburb NSW 2000" -> "Smith Ave"
 */
function extractStreetName(address: string): string | null {
  if (!address) return null;

  // Take the first part before the comma (street address)
  const streetPart = address.split(',')[0].trim();

  // Remove unit/lot prefix: "Unit 3/42 Smith Ave" -> "42 Smith Ave"
  const withoutUnit = streetPart.replace(/^(unit|lot|apt|suite)\s+\S+\//i, '').trim();

  // Remove leading numbers: "42 Smith Ave" -> "Smith Ave"
  const streetName = withoutUnit.replace(/^\d+[a-zA-Z]?\s+/, '').trim();

  return streetName || null;
}

/**
 * Extract suburb from address.
 * "15 Hornet Street, Greenfield Park NSW 2176" -> "Greenfield Park"
 */
function extractSuburb(address: string): string {
  const parts = address.split(',');
  if (parts.length < 2) return 'Unknown';

  // Second part typically contains "Suburb STATE POSTCODE"
  const suburbPart = parts[1].trim();
  // Remove state and postcode
  return suburbPart.replace(/\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\s+\d{4}$/i, '').trim() || 'Unknown';
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const CONVERSION_STATUSES = new Set(['available', 'under_offer', 'exchanged', 'settled']);

export function useStreetStats(): {
  streets: StreetStats[];
  getBriefing: (streetKey: string) => TerritoryBriefing | null;
} {
  const contacts = useCRMStore(state => state.contacts);
  const recentActivities = useCRMStore(state => state.activities);
  const soldRecords = useDataEnrichmentStore(state => state.soldRecords);
  const suburbStats = useDataEnrichmentStore(state => state.suburbStats);
  const properties = usePropertyStore(state => state.properties);

  // Pre-build suburb stats lookup
  const suburbStatsMap = useMemo(() => {
    const map = new Map<string, (typeof suburbStats)[number]>();
    for (const stat of suburbStats) {
      map.set(stat.suburb.toLowerCase(), stat);
    }
    return map;
  }, [suburbStats]);

  // Pre-build per-suburb contact counts for penetration
  const suburbContactCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of contacts) {
      if (!contact.address) continue;
      const suburb = extractSuburb(contact.address).toLowerCase();
      counts.set(suburb, (counts.get(suburb) || 0) + 1);
    }
    return counts;
  }, [contacts]);

  // Pre-build street conversion counts from properties
  const streetConversionMap = useMemo(() => {
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

  // Pre-build sold grid for nearby sales lookup
  const recentSoldWithCoords = useMemo(() => {
    const now = Date.now();
    const records: SoldRecord[] = [];
    for (const record of soldRecords) {
      if (record.latitude == null || record.longitude == null) continue;
      if (!record.sale_date) continue;
      if (now - new Date(record.sale_date).getTime() > NINETY_DAYS_MS) continue;
      records.push(record);
    }
    return records;
  }, [soldRecords]);

  const streets = useMemo(() => {
    // Group contacts by street
    const streetMap = new Map<string, {
      contacts: Contact[];
      suburb: string;
      latSum: number;
      lngSum: number;
    }>();

    for (const contact of contacts) {
      if (!contact.address) continue;

      const streetName = extractStreetName(contact.address);
      if (!streetName) continue;

      const suburb = extractSuburb(contact.address);
      const key = `${streetName}|${suburb}`;

      if (!streetMap.has(key)) {
        streetMap.set(key, {
          contacts: [],
          suburb,
          latSum: 0,
          lngSum: 0,
        });
      }

      const entry = streetMap.get(key)!;
      entry.contacts.push(contact);
      if (contact.latitude) entry.latSum += contact.latitude;
      if (contact.longitude) entry.lngSum += contact.longitude;
    }

    // Build activity lookup: contact_id -> most recent activity date
    const lastActivityMap = new Map<string, string>();
    for (const activity of recentActivities) {
      const existing = lastActivityMap.get(activity.contact_id);
      if (!existing || activity.created_at! > existing) {
        lastActivityMap.set(activity.contact_id, activity.created_at!);
      }
    }

    const now = Date.now();
    const stats: StreetStats[] = [];

    for (const [key, entry] of streetMap.entries()) {
      const streetName = key.split('|')[0];
      const count = entry.contacts.length;

      // Find most recent activity across all contacts on this street
      let lastContactedAt: string | null = null;
      for (const contact of entry.contacts) {
        const actDate = lastActivityMap.get(contact.id);
        if (actDate && (!lastContactedAt || actDate > lastContactedAt)) {
          lastContactedAt = actDate;
        }
      }

      const daysSinceLastContact = lastContactedAt
        ? Math.floor((now - new Date(lastContactedAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      // Legacy score (backward compat)
      const score = (count * 10) - ((daysSinceLastContact ?? 90) * 2);

      // --- New territory heatmap fields ---

      // Penetration
      const suburbLower = entry.suburb.toLowerCase();
      const suburbStat = suburbStatsMap.get(suburbLower);
      let penetrationPct: number | null = null;
      if (suburbStat?.total_dwellings) {
        const suburbContacts = suburbContactCounts.get(suburbLower) || 0;
        penetrationPct = Math.round((suburbContacts / suburbStat.total_dwellings) * 1000) / 10;
      }
      const penetration = penetrationPct ?? 0;

      // Freshness
      const freshness = Math.max(0, 1 - (daysSinceLastContact ?? 90) / 90);

      // Sales momentum: count sold records within 500m in last 90 days
      const avgLat = entry.latSum / count;
      const avgLng = entry.lngSum / count;
      let recentSalesNearby = 0;
      if (avgLat && avgLng) {
        for (const record of recentSoldWithCoords) {
          const dist = haversineDistance(avgLat, avgLng, record.latitude!, record.longitude!);
          if (dist <= 500) {
            recentSalesNearby++;
          }
        }
      }
      const salesMomentumRatio = Math.min(1, recentSalesNearby / 5);

      // Conversion rate from properties on same street
      const conversionCount = streetConversionMap.get(key) || 0;
      const conversionRate = Math.min(1, conversionCount / 3);

      // Opportunity score formula
      const opportunityScore = Math.round(
        (1 - Math.min(1, penetration / 10)) * 40 +
        freshness * 30 +
        salesMomentumRatio * 20 +
        conversionRate * 10
      );

      stats.push({
        streetName,
        suburb: entry.suburb,
        contactCount: count,
        lastContactedAt,
        daysSinceLastContact,
        score,
        contacts: entry.contacts,
        averageLatitude: avgLat,
        averageLongitude: avgLng,
        opportunityScore,
        salesMomentum: recentSalesNearby,
        penetrationPct,
        conversionCount,
      });
    }

    // Sort by opportunityScore descending (best opportunities first)
    stats.sort((a, b) => (b.opportunityScore ?? 0) - (a.opportunityScore ?? 0));

    return stats;
  }, [contacts, recentActivities, recentSoldWithCoords, suburbStatsMap, suburbContactCounts, streetConversionMap]);

  const getBriefing = useCallback((streetKey: string): TerritoryBriefing | null => {
    // streetKey can be "StreetName|Suburb" or just suburb name
    const street = streets.find(s => {
      const key = `${s.streetName}|${s.suburb}`;
      return key === streetKey || s.suburb === streetKey;
    });
    if (!street) return null;

    const suburbLower = street.suburb.toLowerCase();
    const stat = suburbStatsMap.get(suburbLower);

    const recommendedAction =
      (street.opportunityScore ?? 0) > 70 ? 'Focus here' :
      (street.opportunityScore ?? 0) >= 40 ? 'Maintain presence' :
      'Low priority';

    return {
      suburb: street.suburb,
      medianSalePrice: stat?.median_sale_price ?? 0,
      avgDaysOnMarket: stat?.avg_days_on_market ?? 0,
      penetrationPct: street.penetrationPct ?? 0,
      contactCount: street.contactCount,
      recentSales: street.salesMomentum ?? 0,
      recommendedAction,
    };
  }, [streets, suburbStatsMap]);

  // Return both the array (backward compat when destructured) and getBriefing
  // The return type is a hybrid: the object has streets + getBriefing,
  // but we keep StreetStats[] as the primary data.
  return { streets, getBriefing };
}
