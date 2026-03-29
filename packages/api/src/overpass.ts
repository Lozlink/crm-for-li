import type { SuburbBoundary, OSMBuilding } from '@realestate-crm/types';

// Cache for suburb boundaries to avoid repeated API calls
const boundaryCache = new Map<string, { data: SuburbBoundary[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MIN_REQUEST_INTERVAL = 3000; // 3 seconds between requests
let lastRequestTime = 0;

// Alternative Overpass servers to rotate through
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter',
];
let currentServerIndex = 0;

function getCacheKey(minLat: number, minLng: number, maxLat: number, maxLng: number): string {
  // Round to reduce cache misses for nearby regions
  return `${minLat.toFixed(3)},${minLng.toFixed(3)},${maxLat.toFixed(3)},${maxLng.toFixed(3)}`;
}

/**
 * Fetch suburb boundaries from OpenStreetMap Overpass API
 * for the visible map region (with caching and rate limiting)
 */
export async function fetchSuburbBoundaries(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number
): Promise<SuburbBoundary[]> {
  const cacheKey = getCacheKey(minLat, minLng, maxLat, maxLng);

  // Check cache first
  const cached = boundaryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Rate limiting
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    // Return cached data or empty if rate limited
    return cached?.data || [];
  }
  lastRequestTime = now;

  // Overpass query for suburb boundaries in Australia
  // Try admin_level 9 (suburbs in NSW) and 10, plus boundary=suburb
  const query = `
    [out:json][timeout:30];
    (
      relation["boundary"="administrative"]["admin_level"~"9|10"](${minLat},${minLng},${maxLat},${maxLng});
      relation["boundary"="suburb"](${minLat},${minLng},${maxLat},${maxLng});
      relation["place"="suburb"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out geom;
  `;

  // Try servers with rotation on failure
  for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
    const serverUrl = OVERPASS_SERVERS[(currentServerIndex + attempt) % OVERPASS_SERVERS.length];

    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.status === 429) {
        // Rate limited, try next server
        currentServerIndex = (currentServerIndex + 1) % OVERPASS_SERVERS.length;
        continue;
      }

      if (!response.ok) {
        throw new Error(`Overpass API error: ${response.status}`);
      }

      const data = await response.json();
      const boundaries = parseOverpassResponse(data);

      // Cache the result
      boundaryCache.set(cacheKey, { data: boundaries, timestamp: Date.now() });

      return boundaries;
    } catch (error) {
      console.warn(`Overpass server ${serverUrl} failed:`, error);
      // Try next server
      currentServerIndex = (currentServerIndex + 1) % OVERPASS_SERVERS.length;
    }
  }

  console.error('All Overpass servers failed');
  return cached?.data || [];
}

function parseOverpassResponse(data: any): SuburbBoundary[] {
  const boundaries: SuburbBoundary[] = [];

  if (!data.elements) return boundaries;

  for (const element of data.elements) {
    if (element.type !== 'relation') continue;

    const name = element.tags?.name;
    if (!name) continue;

    // Extract outer way coordinates from the relation
    const outerMembers = element.members?.filter(
      (m: any) => m.type === 'way' && m.role === 'outer' && m.geometry
    );

    if (!outerMembers || outerMembers.length === 0) continue;

    // Join ways into a continuous ring
    const ring = joinWaysIntoRing(outerMembers);

    if (ring.length > 0) {
      boundaries.push({
        name,
        coordinates: ring,
      });
    }
  }

  return boundaries;
}

// Join multiple ways into a single continuous polygon ring
function joinWaysIntoRing(ways: any[]): Array<{ latitude: number; longitude: number }> {
  if (ways.length === 0) return [];
  if (ways.length === 1) {
    return ways[0].geometry.map((p: any) => ({ latitude: p.lat, longitude: p.lon }));
  }

  // Convert ways to arrays of coords
  const segments = ways.map((w: any) =>
    w.geometry.map((p: any) => ({ latitude: p.lat, longitude: p.lon }))
  );

  // Start with first segment
  const result = [...segments[0]];
  const used = new Set([0]);

  // Keep joining segments until we can't find more
  while (used.size < segments.length) {
    const lastPoint = result[result.length - 1];
    let found = false;

    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue;

      const seg = segments[i];
      const firstPoint = seg[0];
      const lastSegPoint = seg[seg.length - 1];

      // Check if this segment connects to the end of our result
      if (pointsMatch(lastPoint, firstPoint)) {
        // Append segment (skip first point as it matches)
        result.push(...seg.slice(1));
        used.add(i);
        found = true;
        break;
      } else if (pointsMatch(lastPoint, lastSegPoint)) {
        // Append reversed segment (skip first point as it matches)
        result.push(...seg.slice(0, -1).reverse());
        used.add(i);
        found = true;
        break;
      }
    }

    if (!found) break; // Can't connect more segments
  }

  return result;
}

function pointsMatch(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): boolean {
  // Allow small tolerance for floating point comparison
  return Math.abs(a.latitude - b.latitude) < 0.00001 && Math.abs(a.longitude - b.longitude) < 0.00001;
}

/**
 * Fetch a single suburb boundary by name (with server rotation and caching)
 */
const suburbNameCache = new Map<string, { data: SuburbBoundary | null; timestamp: number }>();

export async function fetchSuburbByName(
  suburbName: string,
  state: string = 'New South Wales'
): Promise<SuburbBoundary | null> {
  const cacheKey = `${suburbName.toLowerCase()}-${state}`;

  // Check cache
  const cached = suburbNameCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Rate limiting
  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    return cached?.data || null;
  }
  lastRequestTime = now;

  // Try multiple query variations (Australian suburbs can be tagged differently)
  const queries = [
    // Try admin_level 9 first (common for NSW suburbs)
    `[out:json][timeout:30];
     area["name"="${state}"]["admin_level"="4"]->.state;
     (
       relation["name"="${suburbName}"]["boundary"="administrative"]["admin_level"~"9|10"](area.state);
       relation["name"="${suburbName}"]["boundary"="suburb"](area.state);
       relation["name"="${suburbName}"]["place"="suburb"](area.state);
     );
     out geom;`,
  ];

  for (const query of queries) {
    // Try each server
    for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
      const serverUrl = OVERPASS_SERVERS[(currentServerIndex + attempt) % OVERPASS_SERVERS.length];

      try {
        const response = await fetch(serverUrl, {
          method: 'POST',
          body: `data=${encodeURIComponent(query)}`,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        });

        if (response.status === 429 || response.status === 504) {
          currentServerIndex = (currentServerIndex + 1) % OVERPASS_SERVERS.length;
          continue;
        }

        if (!response.ok) {
          throw new Error(`Overpass API error: ${response.status}`);
        }

        const data = await response.json();
        const boundaries = parseOverpassResponse(data);
        const result = boundaries[0] || null;

        // Cache result
        suburbNameCache.set(cacheKey, { data: result, timestamp: Date.now() });

        return result;
      } catch (error) {
        console.warn(`Overpass server ${serverUrl} failed for suburb query:`, error);
        currentServerIndex = (currentServerIndex + 1) % OVERPASS_SERVERS.length;
      }
    }
  }

  console.error('All Overpass servers failed for suburb:', suburbName);
  return cached?.data || null;
}

// ── Multi-dwelling building queries ──────────────────────────────────

const buildingCache = new Map<string, { data: OSMBuilding[]; timestamp: number }>();
const BUILDING_CACHE_TTL = 10 * 60 * 1000; // 10 minutes (buildings don't change often)

/**
 * Fetch multi-dwelling buildings from OpenStreetMap in the given bounding box.
 * Returns apartment blocks, unit complexes, and multi-story residential buildings.
 */
export async function fetchMultiDwellingBuildings(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<OSMBuilding[]> {
  const cacheKey = `bldg-${getCacheKey(minLat, minLng, maxLat, maxLng)}`;

  const cached = buildingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < BUILDING_CACHE_TTL) {
    return cached.data;
  }

  const now = Date.now();
  if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
    return cached?.data || [];
  }
  lastRequestTime = now;

  // Query for multi-dwelling building types common in Australian suburbs
  const query = `
    [out:json][timeout:30];
    (
      way["building"="apartments"](${minLat},${minLng},${maxLat},${maxLng});
      way["building"="flats"](${minLat},${minLng},${maxLat},${maxLng});
      way["building"="residential"]["building:levels"~"^[2-9]|[1-9][0-9]"](${minLat},${minLng},${maxLat},${maxLng});
      relation["building"="apartments"](${minLat},${minLng},${maxLat},${maxLng});
      relation["building"="flats"](${minLat},${minLng},${maxLat},${maxLng});
    );
    out body geom;
  `;

  // Always start from primary server for building queries
  for (let attempt = 0; attempt < OVERPASS_SERVERS.length; attempt++) {
    const serverUrl = OVERPASS_SERVERS[attempt];

    try {
      const response = await fetch(serverUrl, {
        method: 'POST',
        body: `data=${encodeURIComponent(query)}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      if (response.status === 429 || response.status === 403 || response.status === 504) {
        continue; // try next server
      }
      if (!response.ok) throw new Error(`Overpass API error: ${response.status}`);

      const data = await response.json();
      const buildings = parseBuildingResponse(data);

      buildingCache.set(cacheKey, { data: buildings, timestamp: Date.now() });
      return buildings;
    } catch (error) {
      console.warn(`Overpass server ${serverUrl} failed for building query:`, error);
    }
  }

  console.error('All Overpass servers failed for building query');
  return cached?.data || [];
}

function parseBuildingResponse(data: { elements?: Array<Record<string, unknown>> }): OSMBuilding[] {
  const buildings: OSMBuilding[] = [];
  if (!data.elements) return buildings;

  for (const element of data.elements) {
    const tags = element.tags as Record<string, string> | undefined;
    if (!tags) continue;

    let coords: Array<{ latitude: number; longitude: number }> = [];

    if (element.type === 'way' && element.geometry) {
      coords = (element.geometry as Array<{ lat: number; lon: number }>)
        .map(p => ({ latitude: p.lat, longitude: p.lon }));
    } else if (element.type === 'relation' && element.members) {
      const outerWays = (element.members as Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>)
        .filter(m => m.type === 'way' && m.role === 'outer' && m.geometry);
      if (outerWays.length > 0) {
        coords = joinWaysIntoRing(outerWays.map(w => ({ geometry: w.geometry })));
      }
    }

    if (coords.length < 3) continue;

    // Compute center
    const latSum = coords.reduce((s, c) => s + c.latitude, 0);
    const lngSum = coords.reduce((s, c) => s + c.longitude, 0);
    const center = { latitude: latSum / coords.length, longitude: lngSum / coords.length };

    // Determine building type
    const rawType = tags.building || 'other';
    const buildingType = (['apartments', 'flats', 'residential', 'unit'].includes(rawType)
      ? rawType
      : 'other') as OSMBuilding['buildingType'];

    // Estimate units from levels or default
    const levels = parseInt(tags['building:levels'] || '0', 10);
    const flats = parseInt(tags['building:flats'] || '0', 10);
    const estimatedUnits = flats > 0 ? flats : (levels > 0 ? levels * 4 : 8); // rough: 4 units/level default

    // Build address from tags
    const addrParts = [tags['addr:unit'], tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
    const address = addrParts.length > 0 ? addrParts.join(' ') : undefined;

    buildings.push({
      id: String(element.id),
      coordinates: coords,
      center,
      name: tags.name,
      address,
      levels: levels || undefined,
      buildingType,
      estimatedUnits,
    });
  }

  return buildings;
}
