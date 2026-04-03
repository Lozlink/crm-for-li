import { haversineDistance } from './geocode';

export interface RouteCandidate {
  id: string;
  latitude: number;
  longitude: number;
  score: number; // 0-100
}

export interface OptimizedRoute {
  orderedIds: string[];
  totalDistanceMeters: number;
  estimatedWalkMinutes: number;
}

const WALKING_SPEED_KMH = 5;
const MINUTES_PER_STOP = 2;

/**
 * Nearest-neighbour TSP with score weighting.
 * Effective distance = haversineDistance * (1.5 - score/100).
 * A 100-score contact has its effective distance halved.
 * Walking speed: 5 km/h + 2 min per stop.
 */
export function optimizeRoute(
  origin: { latitude: number; longitude: number },
  candidates: RouteCandidate[],
  maxStops?: number,
): OptimizedRoute {
  if (candidates.length === 0) {
    return { orderedIds: [], totalDistanceMeters: 0, estimatedWalkMinutes: 0 };
  }

  const limit = maxStops != null ? Math.min(maxStops, candidates.length) : candidates.length;
  const remaining = [...candidates];
  const ordered: RouteCandidate[] = [];
  let currentLat = origin.latitude;
  let currentLng = origin.longitude;
  let totalDistanceMeters = 0;

  while (ordered.length < limit && remaining.length > 0) {
    let bestIdx = 0;
    let bestEffective = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      const dist = haversineDistance(currentLat, currentLng, c.latitude, c.longitude);
      const scoreWeight = 1.5 - c.score / 100;
      const effective = dist * scoreWeight;

      if (effective < bestEffective) {
        bestEffective = effective;
        bestIdx = i;
      }
    }

    const chosen = remaining.splice(bestIdx, 1)[0];
    const actualDist = haversineDistance(currentLat, currentLng, chosen.latitude, chosen.longitude);
    totalDistanceMeters += actualDist;
    currentLat = chosen.latitude;
    currentLng = chosen.longitude;
    ordered.push(chosen);
  }

  const walkingMinutes = (totalDistanceMeters / 1000) * (60 / WALKING_SPEED_KMH);
  const estimatedWalkMinutes = Math.round(walkingMinutes + ordered.length * MINUTES_PER_STOP);

  return {
    orderedIds: ordered.map((c) => c.id),
    totalDistanceMeters: Math.round(totalDistanceMeters),
    estimatedWalkMinutes,
  };
}
