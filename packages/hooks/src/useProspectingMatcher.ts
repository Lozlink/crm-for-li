import { useMemo, useRef, useCallback } from 'react';
import type { Contact } from '@realestate-crm/types';
import { haversineDistance } from '@realestate-crm/utils';
import { useCRMStore } from './useCRMStore';

export interface NearbyContact {
  contact: Contact;
  distanceMeters: number;
}

export interface ProspectingMatcherResult {
  /** Contacts within radiusMeters of the given GPS position, sorted by distance ascending */
  nearbyContacts: NearbyContact[];
  /** Fuzzy-match contacts by a partial address string */
  matchContactByAddress: (address: string) => Contact[];
}

const DEFAULT_RADIUS_METERS = 50;

/**
 * Normalize an address for fuzzy comparison:
 * - lowercase
 * - collapse whitespace
 * - remove common punctuation
 */
function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[,./\\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-based fuzzy match: returns true if every token in the query
 * appears somewhere in the candidate string.
 */
function fuzzyTokenMatch(query: string, candidate: string): boolean {
  const q = normalizeForMatch(query);
  const c = normalizeForMatch(candidate);
  const tokens = q.split(' ').filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => c.includes(t));
}

/**
 * useProspectingMatcher
 *
 * Takes the current GPS position and returns contacts sorted by proximity.
 * GPS updates are debounced to avoid re-computing on every raw GPS tick.
 *
 * @param latitude  Current device latitude (from Expo Location or similar)
 * @param longitude Current device longitude
 * @param radiusMeters  Max radius for "nearby" contacts (default: 50m)
 * @param debounceMs    Minimum ms between recomputes on position change (default: 1000ms)
 */
export function useProspectingMatcher(
  latitude: number | null,
  longitude: number | null,
  radiusMeters: number = DEFAULT_RADIUS_METERS,
  debounceMs: number = 1000,
): ProspectingMatcherResult {
  const contacts = useCRMStore((s) => s.contacts);

  // Track last-used position to implement debounce without useState (avoids extra renders)
  const lastComputedAt = useRef<number>(0);
  const lastPosition = useRef<{ lat: number; lng: number } | null>(null);

  const nearbyContacts = useMemo((): NearbyContact[] => {
    if (latitude == null || longitude == null) return [];

    const now = Date.now();
    const sinceLastCompute = now - lastComputedAt.current;
    const positionChanged =
      lastPosition.current == null ||
      lastPosition.current.lat !== latitude ||
      lastPosition.current.lng !== longitude;

    // Debounce: skip recompute if position changed too recently
    if (positionChanged && sinceLastCompute < debounceMs) {
      // Return previous result; next render (after debounceMs) will recompute
      return [];
    }

    lastComputedAt.current = now;
    lastPosition.current = { lat: latitude, lng: longitude };

    const results: NearbyContact[] = [];
    for (const contact of contacts) {
      if (contact.latitude == null || contact.longitude == null) continue;
      const dist = haversineDistance(latitude, longitude, contact.latitude, contact.longitude);
      if (dist <= radiusMeters) {
        results.push({ contact, distanceMeters: dist });
      }
    }

    return results.sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [latitude, longitude, contacts, radiusMeters, debounceMs]);

  const matchContactByAddress = useCallback(
    (address: string): Contact[] => {
      if (!address || address.trim().length < 3) return [];
      return contacts.filter((c) => {
        if (!c.address) return false;
        // All query tokens must appear somewhere in the candidate (so a
        // suburb in the query still disambiguates same-named streets)...
        if (!fuzzyTokenMatch(address, c.address)) return false;
        // ...but at least one token must also hit the STREET line (before
        // the first comma). Without this, typing just a suburb
        // ("Parramatta") matched every contact in that suburb as
        // "at this address".
        const streetLine = normalizeForMatch(c.address.split(',')[0] ?? '');
        const tokens = normalizeForMatch(address).split(' ').filter(Boolean);
        return tokens.some((t) => streetLine.includes(t));
      });
    },
    [contacts],
  );

  return { nearbyContacts, matchContactByAddress };
}
