import { supabase, isDemoMode } from './supabase';
import type { GnafBuilding, OSMBuilding } from '@realestate-crm/types';

/**
 * G-NAF buildings layer — authoritative multi-dwelling buildings from the
 * gnaf_buildings table (loaded by scripts/import-gnaf.ts from G-NAF Core).
 *
 * Replaces the OSM Overpass building layer: no third-party servers to go
 * down, and unit counts are registered addresses rather than levels*4
 * guesses. G-NAF gives address POINTS, not footprints, so buildings are
 * rendered as small circle polygons compatible with the existing
 * OSMBuilding-based map layer.
 */

const CACHE_TTL = 10 * 60 * 1000; // matches the old Overpass building cache
const cache = new Map<string, { data: OSMBuilding[]; timestamp: number }>();

function cacheKey(minLat: number, minLng: number, maxLat: number, maxLng: number): string {
  return `${minLat.toFixed(3)},${minLng.toFixed(3)},${maxLat.toFixed(3)},${maxLng.toFixed(3)}`;
}

/** Generate a small circle polygon around a point so point-based G-NAF
 *  buildings render through the existing polygon pipeline. ~18 m radius
 *  reads as "a building" at the zoom levels the layer activates at. */
function circlePolygon(
  lat: number,
  lng: number,
  radiusMeters = 18,
  points = 12,
): Array<{ latitude: number; longitude: number }> {
  const coords: Array<{ latitude: number; longitude: number }> = [];
  const latRadius = radiusMeters / 111_320;
  const lngRadius = radiusMeters / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i < points; i++) {
    const theta = (2 * Math.PI * i) / points;
    coords.push({
      latitude: lat + latRadius * Math.sin(theta),
      longitude: lng + lngRadius * Math.cos(theta),
    });
  }
  return coords;
}

function toOsmBuilding(row: GnafBuilding): OSMBuilding {
  return {
    id: `gnaf-${row.id}`,
    coordinates: circlePolygon(row.latitude, row.longitude),
    center: { latitude: row.latitude, longitude: row.longitude },
    name: row.address,
    address: [row.address, row.locality].filter(Boolean).join(', '),
    buildingType: 'unit',
    estimatedUnits: row.unit_count,
    unitNumbers: row.unit_numbers,
  };
}

// Whether the gnaf_buildings table has been loaded — probed once per app
// session so the map can fall back to Overpass until the import is run.
let gnafLoaded: boolean | null = null;

export async function isGnafLoaded(): Promise<boolean> {
  if (isDemoMode) return false;
  if (gnafLoaded !== null) return gnafLoaded;
  try {
    const { data, error } = await supabase
      .from('gnaf_buildings')
      .select('id')
      .limit(1);
    gnafLoaded = !error && (data?.length ?? 0) > 0;
  } catch {
    gnafLoaded = false;
  }
  return gnafLoaded;
}

/**
 * Search G-NAF buildings by address text — powers the declare/log-visits
 * dialog so a building can be selected from anywhere, not just when standing
 * within GPS-snap range of it. "46 coronation" or "46 coronation, baulkham"
 * both work; a comma splits street part from locality part.
 */
export async function searchGnafBuildings(
  query: string,
  limit = 6,
): Promise<GnafBuilding[]> {
  if (isDemoMode) return [];
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  try {
    let req = supabase.from('gnaf_buildings').select('*');

    const commaIdx = trimmed.indexOf(',');
    if (commaIdx > 0) {
      const street = trimmed.slice(0, commaIdx).trim();
      const locality = trimmed.slice(commaIdx + 1).trim();
      req = req.ilike('address', `%${street}%`);
      if (locality) req = req.ilike('locality', `${locality}%`);
    } else {
      req = req.ilike('address', `%${trimmed}%`);
    }

    const { data, error } = await req
      .order('unit_count', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[gnaf] address search failed:', error.message);
      return [];
    }
    return (data ?? []) as GnafBuilding[];
  } catch (err) {
    console.warn('[gnaf] address search threw:', err);
    return [];
  }
}

/**
 * Fetch multi-dwelling buildings in a bounding box, shaped as OSMBuilding so
 * the existing map layer (coverage colouring, press handlers, declare flow)
 * works unchanged. Returns [] on error — same contract as the Overpass path.
 */
export async function fetchGnafBuildings(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<OSMBuilding[]> {
  if (isDemoMode) return [];

  const key = cacheKey(minLat, minLng, maxLat, maxLng);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const { data, error } = await supabase.rpc('gnaf_buildings_in_bbox', {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
    });

    if (error) {
      console.warn('[gnaf] bbox query failed:', error.message);
      return cached?.data || [];
    }

    const buildings = ((data ?? []) as GnafBuilding[]).map(toOsmBuilding);
    cache.set(key, { data: buildings, timestamp: Date.now() });
    return buildings;
  } catch (err) {
    console.warn('[gnaf] bbox query threw:', err);
    return cached?.data || [];
  }
}
