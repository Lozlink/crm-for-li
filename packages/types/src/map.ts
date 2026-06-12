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
  /** Registered unit numbers when the source knows them (G-NAF). OSM never
   *  provides these — estimatedUnits is a guess there. */
  unitNumbers?: string[];
}

/** A multi-dwelling building aggregated from G-NAF Core (gnaf_buildings table).
 *  Unlike OSM footprints these are address POINTS with authoritative unit
 *  counts — the registered unit addresses at that parent street address. */
export interface GnafBuilding {
  id: string;
  address: string;
  street_name: string | null;
  street_type: string | null;
  number_first: string | null;
  locality: string;
  postcode: string | null;
  state: string;
  latitude: number;
  longitude: number;
  unit_count: number;
  unit_numbers: string[];
}
