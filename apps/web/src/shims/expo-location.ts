export interface LocationObjectCoords {
  latitude: number;
  longitude: number;
  altitude: number | null;
  accuracy: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface LocationObject {
  coords: LocationObjectCoords;
  timestamp: number;
}

export const Accuracy = {
  Balanced: 3,
  BestForNavigation: 6,
  High: 4,
  Low: 2,
  Lowest: 1,
};

export async function requestForegroundPermissionsAsync() {
  return { status: 'denied' };
}

export async function requestBackgroundPermissionsAsync() {
  return { status: 'denied' };
}

export async function startLocationUpdatesAsync() {
  throw new Error('Location tracking is not supported on web');
}

export async function stopLocationUpdatesAsync() {
  // no-op
}

export default {
  Accuracy,
  requestForegroundPermissionsAsync,
  requestBackgroundPermissionsAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
};
