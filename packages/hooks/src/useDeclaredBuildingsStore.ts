import { create } from 'zustand';
import type { DeclaredBuilding } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface UpsertInput {
  address: string;
  latitude: number;
  longitude: number;
  estimatedUnits: number;
}

interface DeclaredBuildingsState {
  declaredBuildings: DeclaredBuilding[];
  isLoading: boolean;
  error: string | null;

  setDeclaredBuildings: (list: DeclaredBuilding[]) => void;
  fetchDeclaredBuildings: (ctx?: { teamId: string | null; userId: string | null; isDemo: boolean }) => Promise<void>;
  upsertDeclaredBuilding: (input: UpsertInput) => Promise<DeclaredBuilding | null>;
  deleteDeclaredBuilding: (id: string) => Promise<void>;
  clearData: () => void;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

function normalizeAddressKey(address: string): string {
  return address.trim().toLowerCase();
}

export const useDeclaredBuildingsStore = create<DeclaredBuildingsState>()((set, get) => ({
  declaredBuildings: [],
  isLoading: false,
  error: null,

  setDeclaredBuildings: (declaredBuildings) => set({ declaredBuildings }),

  clearData: () => {
    set({ declaredBuildings: [], isLoading: false, error: null });
  },

  fetchDeclaredBuildings: async (ctx?) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = ctx || getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      let query = supabase
        .from('declared_buildings')
        .select('*')
        .order('created_at', { ascending: false });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('fetchDeclaredBuildings error:', error.message, error.details, error.hint);
        throw error;
      }

      set({ declaredBuildings: (data || []) as DeclaredBuilding[], isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
    }
  },

  upsertDeclaredBuilding: async (input) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      const key = normalizeAddressKey(input.address);
      if (!key) return null;

      const existing = get().declaredBuildings.find(
        b => normalizeAddressKey(b.address) === key,
      );

      // Never forget a higher previous estimate when the same building is declared again.
      const mergedEstimate = existing
        ? Math.max(existing.estimated_units, input.estimatedUnits)
        : input.estimatedUnits;

      if (isDemo) {
        const nowIso = new Date().toISOString();
        if (existing) {
          const updated: DeclaredBuilding = {
            ...existing,
            address: input.address.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            estimated_units: mergedEstimate,
            updated_at: nowIso,
          };
          set(state => ({
            declaredBuildings: state.declaredBuildings.map(b => (b.id === existing.id ? updated : b)),
          }));
          return updated;
        }
        const created: DeclaredBuilding = {
          id: generateUUID(),
          team_id: teamId,
          address: input.address.trim(),
          latitude: input.latitude,
          longitude: input.longitude,
          estimated_units: mergedEstimate,
          created_by: userId,
          created_at: nowIso,
          updated_at: nowIso,
        };
        set(state => ({ declaredBuildings: [created, ...state.declaredBuildings] }));
        return created;
      }

      if (existing) {
        const { data, error } = await supabase
          .from('declared_buildings')
          .update({
            address: input.address.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            estimated_units: mergedEstimate,
          })
          .eq('id', existing.id)
          .select('*')
          .single();

        if (error) {
          console.error('upsertDeclaredBuilding update error:', error.message);
          // Optimistic local fallback so the UI still reflects the user's intent.
          const fallback: DeclaredBuilding = {
            ...existing,
            address: input.address.trim(),
            latitude: input.latitude,
            longitude: input.longitude,
            estimated_units: mergedEstimate,
            updated_at: new Date().toISOString(),
          };
          set(state => ({
            declaredBuildings: state.declaredBuildings.map(b => (b.id === existing.id ? fallback : b)),
            error: error.message,
          }));
          return fallback;
        }

        const updated = data as DeclaredBuilding;
        set(state => ({
          declaredBuildings: state.declaredBuildings.map(b => (b.id === updated.id ? updated : b)),
        }));
        return updated;
      }

      const insertData: Record<string, unknown> = {
        address: input.address.trim(),
        latitude: input.latitude,
        longitude: input.longitude,
        estimated_units: mergedEstimate,
      };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.created_by = userId;

      const { data, error } = await supabase
        .from('declared_buildings')
        .insert(insertData)
        .select('*')
        .single();

      if (error) {
        console.error('upsertDeclaredBuilding insert error:', error.message, error.details);
        // Optimistic local fallback so the UI still reflects the user's intent.
        const nowIso = new Date().toISOString();
        const fallback: DeclaredBuilding = {
          id: generateUUID(),
          team_id: teamId,
          address: input.address.trim(),
          latitude: input.latitude,
          longitude: input.longitude,
          estimated_units: mergedEstimate,
          created_by: userId,
          created_at: nowIso,
          updated_at: nowIso,
        };
        set(state => ({
          declaredBuildings: [fallback, ...state.declaredBuildings],
          error: error.message,
        }));
        return fallback;
      }

      const created = data as DeclaredBuilding;
      set(state => ({ declaredBuildings: [created, ...state.declaredBuildings] }));
      return created;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('upsertDeclaredBuilding failed:', message);
      set({ error: message });
      return null;
    }
  },

  deleteDeclaredBuilding: async (id) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          declaredBuildings: state.declaredBuildings.filter(b => b.id !== id),
        }));
        return;
      }

      const { error } = await supabase
        .from('declared_buildings')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        declaredBuildings: state.declaredBuildings.filter(b => b.id !== id),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
    }
  },
}));
