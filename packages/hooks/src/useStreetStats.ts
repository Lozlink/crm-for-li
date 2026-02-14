import { useMemo } from 'react';
import { useCRMStore } from './useCRMStore';
import type { Contact, StreetStats } from '@realestate-crm/types';

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

export function useStreetStats(): StreetStats[] {
  const contacts = useCRMStore(state => state.contacts);
  const recentActivities = useCRMStore(state => state.recentActivities);

  return useMemo(() => {
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

      // Street score: higher = better maintained
      // density bonus - staleness penalty
      const score = (count * 10) - ((daysSinceLastContact ?? 90) * 2);

      stats.push({
        streetName,
        suburb: entry.suburb,
        contactCount: count,
        lastContactedAt,
        daysSinceLastContact,
        score,
        contacts: entry.contacts,
        averageLatitude: entry.latSum / count,
        averageLongitude: entry.lngSum / count,
      });
    }

    // Sort by score descending (best maintained first)
    stats.sort((a, b) => b.score - a.score);

    return stats;
  }, [contacts, recentActivities]);
}
