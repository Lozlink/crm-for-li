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
