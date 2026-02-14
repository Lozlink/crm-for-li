import Constants from 'expo-constants';

const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || '';

export interface DirectionsResult {
  polyline: string;
  totalDurationMinutes: number;
  optimizedOrder: number[];
  legs: DirectionsLeg[];
}

export interface DirectionsLeg {
  durationMinutes: number;
  distanceMeters: number;
  startAddress: string;
  endAddress: string;
}

interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Fetch optimized route from Google Routes API (v2).
 * Uses computeRoutes with optimizeWaypointOrder.
 * @param origin - Starting point
 * @param destination - Ending point (can be same as origin for round trip)
 * @param waypoints - Intermediate stops to optimize
 * @param mode - 'driving' or 'walking'
 * @returns Optimized route with polyline, durations, and waypoint order
 */
export async function fetchOptimizedRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints: LatLng[],
  mode: 'driving' | 'walking' = 'driving',
): Promise<DirectionsResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    console.error('Google Maps API key not configured');
    return null;
  }

  const travelMode = mode === 'driving' ? 'DRIVE' : 'WALK';

  const body: any = {
    origin: {
      location: {
        latLng: { latitude: origin.latitude, longitude: origin.longitude },
      },
    },
    destination: {
      location: {
        latLng: { latitude: destination.latitude, longitude: destination.longitude },
      },
    },
    travelMode,
    polylineEncoding: 'ENCODED_POLYLINE',
  };

  if (waypoints.length > 0) {
    body.intermediates = waypoints.map((w) => ({
      location: {
        latLng: { latitude: w.latitude, longitude: w.longitude },
      },
    }));
    body.optimizeWaypointOrder = true;
  }

  const fieldMask = [
    'routes.polyline.encodedPolyline',
    'routes.duration',
    'routes.legs.duration',
    'routes.legs.distanceMeters',
    'routes.legs.startLocation',
    'routes.legs.endLocation',
    'routes.optimizedIntermediateWaypointIndex',
  ].join(',');

  try {
    const response = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Routes API HTTP error:', response.status, errorText);
      return null;
    }

    const data = await response.json();

    if (!data.routes?.[0]) {
      console.error('Routes API: no routes returned', data.error || data);
      return null;
    }

    const route = data.routes[0];

    if (!route.polyline?.encodedPolyline) {
      console.error('Routes API: missing polyline in response');
      return null;
    }

    const legs: DirectionsLeg[] = (route.legs || []).map((leg: any) => {
      const durationSeconds = parseInt(leg.duration?.replace('s', '') || '0', 10);
      return {
        durationMinutes: Math.round(durationSeconds / 60),
        distanceMeters: leg.distanceMeters ?? 0,
        startAddress: '',
        endAddress: '',
      };
    });

    const totalDurationSeconds = parseInt(route.duration?.replace('s', '') || '0', 10);
    const totalDurationMinutes = Math.round(totalDurationSeconds / 60);
    const optimizedOrder: number[] = route.optimizedIntermediateWaypointIndex || [];

    return {
      polyline: route.polyline.encodedPolyline,
      totalDurationMinutes,
      optimizedOrder,
      legs,
    };
  } catch (error) {
    console.error('Routes API fetch error:', error);
    return null;
  }
}

/**
 * Decode Google's encoded polyline string into lat/lng array.
 * Used to draw the route on react-native-maps.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }

  return points;
}
