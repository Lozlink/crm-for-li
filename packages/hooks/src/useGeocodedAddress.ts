import { useEffect, useState } from 'react';
import { reverseGeocode } from '@realestate-crm/api';

interface GeocodedAddress {
  /**
   * Human-readable address derived from the coordinates, e.g.
   * `"7/46 Coronation Rd, Baulkham Hills"`. Null while the request is in
   * flight, or after a failed reverse-geocode (rate-limited / no result /
   * network error). Callers should fall back to displaying the raw lat/lng
   * when this is null.
   */
  address: string | null;
  /** True while the underlying `reverseGeocode` call is pending. */
  loading: boolean;
}

/**
 * React hook wrapping the in-memory-cached `reverseGeocode` API call.
 *
 * Used to render notes / annotations / pinned field notes as readable
 * addresses instead of bare lat/lng pairs. The underlying cache in
 * `packages/api/src/geocoding.ts` means rendering the same coordinate
 * twice during a session is free after the first hit; this hook just
 * adapts that cache to React state so callers don't have to imperatively
 * fetch + re-render.
 *
 * Falls back gracefully: returns `{ address: null, loading: true }` on
 * mount, then either `{ address: 'X', loading: false }` on success or
 * `{ address: null, loading: false }` on failure. Callers should display
 * the raw `lat, lng` when address is null AND loading is false (i.e.,
 * geocoder unavailable for this point).
 *
 * Inputs are nullable so callers can pass an annotation's coords directly
 * without guarding — null inputs skip the request and resolve to a "no
 * data" state instantly.
 */
export function useGeocodedAddress(
  lat: number | null | undefined,
  lng: number | null | undefined,
): GeocodedAddress {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(lat != null && lng != null);

  useEffect(() => {
    if (lat == null || lng == null) {
      setAddress(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    reverseGeocode(lat, lng)
      .then((result) => {
        if (cancelled) return;
        setAddress(result?.address ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setAddress(null);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  return { address, loading };
}
