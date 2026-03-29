import { create } from 'zustand';
import type { SoldRecord, SuburbStats } from '@realestate-crm/types';
import { supabase, isDemoMode } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface DataEnrichmentState {
  // Sold history
  soldRecords: SoldRecord[];
  soldRecordsLoading: boolean;
  fetchSoldHistory: (suburb: string) => Promise<void>;
  fetchSoldHistoryByAddress: (address: string) => Promise<void>;
  fetchSoldHistoryNearby: (lat: number, lng: number, radiusKm?: number, suburb?: string) => Promise<void>;

  // Suburb stats
  suburbStats: SuburbStats[];
  suburbStatsLoading: boolean;
  fetchSuburbStats: (suburb?: string) => Promise<void>;
  getSuburbPenetration: (suburb: string, contactCount: number) => number | null;

  // CSV import
  importSoldHistoryCSV: (records: Omit<SoldRecord, 'id' | 'created_at'>[]) => Promise<number>;
  importSuburbStatsCSV: (records: Omit<SuburbStats, 'id'>[]) => Promise<number>;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

// Demo data for development/testing
const DEMO_SOLD_RECORDS: SoldRecord[] = [
  { id: '1', address: '45 Smith St', suburb: 'Parramatta', postcode: '2150', property_type: 'house', sale_price: 1250000, sale_date: '2025-11-15', latitude: -33.8150, longitude: 151.0030, source: 'nsw_vg' },
  { id: '2', address: '12 King St', suburb: 'Parramatta', postcode: '2150', property_type: 'unit', sale_price: 680000, sale_date: '2025-10-22', latitude: -33.8135, longitude: 151.0015, source: 'nsw_vg' },
  { id: '3', address: '78 George St', suburb: 'Parramatta', postcode: '2150', property_type: 'townhouse', sale_price: 920000, sale_date: '2025-09-30', latitude: -33.8142, longitude: 151.0050, source: 'nsw_vg' },
  { id: '4', address: '3/22 Victoria Rd', suburb: 'Parramatta', postcode: '2150', property_type: 'unit', sale_price: 550000, sale_date: '2026-01-10', latitude: -33.8160, longitude: 151.0025, source: 'nsw_vg' },
  { id: '5', address: '101 Church St', suburb: 'Parramatta', postcode: '2150', property_type: 'house', sale_price: 1450000, sale_date: '2026-02-18', latitude: -33.8155, longitude: 151.0045, source: 'nsw_vg' },
];

const DEMO_SUBURB_STATS: SuburbStats[] = [
  { id: '1', suburb: 'Parramatta', state: 'NSW', postcode: '2150', total_dwellings: 15420, separate_houses: 3200, semi_detached: 1800, flats_units: 9800, population: 32890, median_household_income: 78500, median_age: 32, median_sale_price: 850000, median_rent_weekly: 520, latitude: -33.8150, longitude: 151.0030 },
  { id: '2', suburb: 'Blacktown', state: 'NSW', postcode: '2148', total_dwellings: 12800, separate_houses: 8200, semi_detached: 2100, flats_units: 2100, population: 47890, median_household_income: 72000, median_age: 34, median_sale_price: 780000, median_rent_weekly: 480, latitude: -33.7688, longitude: 150.9063 },
  { id: '3', suburb: 'Penrith', state: 'NSW', postcode: '2750', total_dwellings: 8900, separate_houses: 6200, semi_detached: 1200, flats_units: 1200, population: 13500, median_household_income: 68000, median_age: 35, median_sale_price: 720000, median_rent_weekly: 450, latitude: -33.7510, longitude: 150.6940 },
  { id: '4', suburb: 'Liverpool', state: 'NSW', postcode: '2170', total_dwellings: 10200, separate_houses: 5400, semi_detached: 1600, flats_units: 2800, population: 27600, median_household_income: 65000, median_age: 33, median_sale_price: 750000, median_rent_weekly: 460, latitude: -33.9200, longitude: 150.9260 },
  { id: '5', suburb: 'Campbelltown', state: 'NSW', postcode: '2560', total_dwellings: 7600, separate_houses: 5800, semi_detached: 900, flats_units: 600, population: 18200, median_household_income: 62000, median_age: 36, median_sale_price: 680000, median_rent_weekly: 420, latitude: -34.0650, longitude: 150.8140 },
];

export const useDataEnrichmentStore = create<DataEnrichmentState>()((set, get) => ({
  soldRecords: [],
  soldRecordsLoading: false,
  suburbStats: [],
  suburbStatsLoading: false,

  fetchSoldHistory: async (suburb: string) => {
    const { isDemo } = getTeamContext();
    set({ soldRecordsLoading: true });

    if (isDemo) {
      const filtered = DEMO_SOLD_RECORDS.filter(r =>
        r.suburb.toLowerCase() === suburb.toLowerCase()
      );
      set({ soldRecords: filtered, soldRecordsLoading: false });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('sold_history')
        .select('*')
        .ilike('suburb', suburb)
        .order('sale_date', { ascending: false })
        .limit(50);

      if (error) throw error;
      set({ soldRecords: data || [], soldRecordsLoading: false });
    } catch (error) {
      console.error('fetchSoldHistory error:', error);
      set({ soldRecordsLoading: false });
    }
  },

  fetchSoldHistoryByAddress: async (address: string) => {
    const { isDemo } = getTeamContext();
    set({ soldRecordsLoading: true });

    if (isDemo) {
      // Fuzzy match on street name
      const streetPart = address.split(',')[0]?.trim().toLowerCase() || '';
      const filtered = DEMO_SOLD_RECORDS.filter(r =>
        r.address.toLowerCase().includes(streetPart) || streetPart.includes(r.address.split(' ').slice(-2).join(' ').toLowerCase())
      );
      set({ soldRecords: filtered, soldRecordsLoading: false });
      return;
    }

    try {
      const streetPart = address.split(',')[0]?.trim() || address;
      const { data, error } = await supabase
        .from('sold_history')
        .select('*')
        .ilike('address', `%${streetPart}%`)
        .order('sale_date', { ascending: false })
        .limit(20);

      if (error) throw error;
      set({ soldRecords: data || [], soldRecordsLoading: false });
    } catch (error) {
      console.error('fetchSoldHistoryByAddress error:', error);
      set({ soldRecordsLoading: false });
    }
  },

  fetchSoldHistoryNearby: async (lat: number, lng: number, radiusKm: number = 1, suburb?: string) => {
    const { isDemo } = getTeamContext();
    set({ soldRecordsLoading: true });

    if (isDemo) {
      const degBuffer = radiusKm / 111;
      const filtered = DEMO_SOLD_RECORDS.filter(r =>
        (suburb && r.suburb.toLowerCase() === suburb.toLowerCase()) ||
        (r.latitude && r.longitude &&
          Math.abs(r.latitude - lat) < degBuffer &&
          Math.abs(r.longitude - lng) < degBuffer)
      );
      set({ soldRecords: filtered, soldRecordsLoading: false });
      return;
    }

    try {
      // Try geocoded records first
      const degBuffer = radiusKm / 111;
      const { data: geoData, error: geoError } = await supabase
        .from('sold_history')
        .select('*')
        .gte('latitude', lat - degBuffer)
        .lte('latitude', lat + degBuffer)
        .gte('longitude', lng - degBuffer)
        .lte('longitude', lng + degBuffer)
        .order('sale_date', { ascending: false })
        .limit(30);

      if (geoError) throw geoError;

      if (geoData && geoData.length > 0) {
        set({ soldRecords: geoData, soldRecordsLoading: false });
        return;
      }

      // Fallback: query by suburb name directly (no geocoding needed)
      if (suburb) {
        const { data: suburbData, error: suburbError } = await supabase
          .from('sold_history')
          .select('*')
          .ilike('suburb', suburb)
          .order('sale_date', { ascending: false })
          .limit(20);

        if (!suburbError && suburbData && suburbData.length > 0) {
          set({ soldRecords: suburbData, soldRecordsLoading: false });
          return;
        }
      }

      set({ soldRecords: [], soldRecordsLoading: false });
    } catch (error) {
      console.error('fetchSoldHistoryNearby error:', error);
      set({ soldRecordsLoading: false });
    }
  },

  fetchSuburbStats: async (suburb?: string) => {
    const { isDemo } = getTeamContext();
    set({ suburbStatsLoading: true });

    if (isDemo) {
      const filtered = suburb
        ? DEMO_SUBURB_STATS.filter(s => s.suburb.toLowerCase() === suburb.toLowerCase())
        : DEMO_SUBURB_STATS;
      set({ suburbStats: filtered, suburbStatsLoading: false });
      return;
    }

    try {
      let query = supabase.from('suburb_stats').select('*');
      if (suburb) {
        query = query.ilike('suburb', suburb);
      }
      const { data, error } = await query.order('suburb').limit(100);

      if (error) throw error;
      set({ suburbStats: data || [], suburbStatsLoading: false });
    } catch (error) {
      console.error('fetchSuburbStats error:', error);
      set({ suburbStatsLoading: false });
    }
  },

  getSuburbPenetration: (suburb: string, contactCount: number): number | null => {
    const stats = get().suburbStats.find(s =>
      s.suburb.toLowerCase() === suburb.toLowerCase()
    );
    if (!stats?.total_dwellings) return null;
    return Math.round((contactCount / stats.total_dwellings) * 1000) / 10; // 1 decimal %
  },

  importSoldHistoryCSV: async (records) => {
    const { isDemo, teamId } = getTeamContext();
    if (isDemo) {
      // In demo mode, just add to local state
      const newRecords = records.map((r, i) => ({
        ...r,
        id: `import-${Date.now()}-${i}`,
        created_at: new Date().toISOString(),
      }));
      set(state => ({ soldRecords: [...newRecords, ...state.soldRecords] }));
      return newRecords.length;
    }

    try {
      const withTeam = records.map(r => ({ ...r, team_id: teamId }));
      const { data, error } = await supabase
        .from('sold_history')
        .insert(withTeam)
        .select();

      if (error) throw error;
      const imported = data || [];
      set(state => ({ soldRecords: [...imported, ...state.soldRecords] }));
      return imported.length;
    } catch (error) {
      console.error('importSoldHistoryCSV error:', error);
      return 0;
    }
  },

  importSuburbStatsCSV: async (records) => {
    const { isDemo } = getTeamContext();
    if (isDemo) {
      const newRecords = records.map((r, i) => ({ ...r, id: `abs-${Date.now()}-${i}` }));
      set(state => ({ suburbStats: [...newRecords, ...state.suburbStats] }));
      return newRecords.length;
    }

    try {
      const { data, error } = await supabase
        .from('suburb_stats')
        .upsert(records, { onConflict: 'suburb,state' })
        .select();

      if (error) throw error;
      const imported = data || [];
      set({ suburbStats: imported });
      return imported.length;
    } catch (error) {
      console.error('importSuburbStatsCSV error:', error);
      return 0;
    }
  },
}));
