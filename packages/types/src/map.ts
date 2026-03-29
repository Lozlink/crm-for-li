export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface SavedSuburb {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export interface SuburbBoundary {
  name: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
}

export interface OSMBuilding {
  id: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
  center: { latitude: number; longitude: number };
  name?: string;
  address?: string;
  levels?: number;
  buildingType: 'apartments' | 'flats' | 'residential' | 'unit' | 'other';
  estimatedUnits: number;
}
