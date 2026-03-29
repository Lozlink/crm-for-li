/**
 * Geocode an address string to lat/lng coordinates using Google Geocoding API.
 * Returns null if geocoding fails or no results found.
 */
export async function geocodeAddress(
  address: string,
  apiKey: string,
): Promise<{ lat: number; lng: number } | null> {
  if (!address || !apiKey) return null;

  try {
    const encoded = encodeURIComponent(address);
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${apiKey}`
    );
    const data = await response.json();

    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const { lat, lng } = data.results[0].geometry.location;
      return { lat, lng };
    }
    return null;
  } catch (error) {
    console.error('Geocode error:', error);
    return null;
  }
}

/**
 * Geocode multiple addresses in parallel with a concurrency limit.
 * Returns a Map of index → { lat, lng } for successful geocodes.
 */
export async function batchGeocodeAddresses(
  addresses: { index: number; address: string }[],
  apiKey: string,
  concurrency = 5,
): Promise<Map<number, { lat: number; lng: number }>> {
  const results = new Map<number, { lat: number; lng: number }>();
  if (!apiKey || addresses.length === 0) return results;

  // Process in chunks to respect rate limits
  for (let i = 0; i < addresses.length; i += concurrency) {
    const batch = addresses.slice(i, i + concurrency);
    const promises = batch.map(async ({ index, address }) => {
      const coords = await geocodeAddress(address, apiKey);
      if (coords) results.set(index, coords);
    });
    await Promise.all(promises);
  }

  return results;
}
