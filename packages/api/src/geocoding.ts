/**
 * Reverse-geocoder using OSM Nominatim.
 *
 * Usage policy respected:
 *  - Unique User-Agent header identifying the app (required by Nominatim ToS)
 *  - In-memory LRU cache keyed on rounded lat/lng (4 decimals ≈ 11m precision)
 *    so repeated renders of the same map card don't re-query
 *  - No rate-limiting enforced here — call sites are expected to invoke on
 *    user-initiated events or component mount (not polling loops)
 */

export interface GeocodeResult {
  address: string;
  suburb: string;
}

// 4-decimal rounding gives ≈11m precision — good enough for map card display.
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

const cache = new Map<string, GeocodeResult | null>();

// Maximum cache entries — prevent unbounded growth in a long session.
const MAX_CACHE_SIZE = 200;

function pruneCache() {
  if (cache.size <= MAX_CACHE_SIZE) return;
  // Delete oldest (insertion-order) entries until under limit.
  const toDelete = cache.size - MAX_CACHE_SIZE;
  let count = 0;
  for (const key of cache.keys()) {
    cache.delete(key);
    if (++count >= toDelete) break;
  }
}

/**
 * Reverse-geocode a lat/lng pair via OSM Nominatim.
 * Returns null on network error, 429, or if Nominatim returns no result.
 * Results are cached in-memory for the lifetime of the JS runtime.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodeResult | null> {
  const key = cacheKey(lat, lng);
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`;
    const resp = await fetch(url, {
      headers: {
        // Nominatim ToS: must identify app + contact; using repo name + support email.
        'User-Agent': 'realestate-crm-mobile/1.0 (support@realestate-crm.app)',
        'Accept-Language': 'en',
      },
    });

    if (!resp.ok) {
      // 429 = rate-limited; cache null so we don't hammer on next render.
      cache.set(key, null);
      pruneCache();
      return null;
    }

    const data = await resp.json() as {
      display_name?: string;
      address?: {
        road?: string;
        house_number?: string;
        suburb?: string;
        city?: string;
        town?: string;
        village?: string;
        state?: string;
      };
    };

    if (!data?.address) {
      cache.set(key, null);
      pruneCache();
      return null;
    }

    const a = data.address;
    const streetNum = a.house_number ? `${a.house_number} ` : '';
    const street = a.road ?? '';
    const addressLine = streetNum + street || (data.display_name?.split(',')[0] ?? '');
    const suburb = a.suburb ?? a.city ?? a.town ?? a.village ?? '';

    const result: GeocodeResult = {
      address: addressLine.trim(),
      suburb: suburb.trim(),
    };

    cache.set(key, result);
    pruneCache();
    return result;
  } catch {
    // Network error — cache null briefly? No: don't cache errors so a retry
    // after connectivity restored will work. Just return null.
    return null;
  }
}
