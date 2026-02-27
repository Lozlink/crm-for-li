import { create } from 'zustand';
import type { SavedSearch } from '@realestate-crm/types';
import { supabase, isDemoMode } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface SavedSearchState {
  savedSearches: SavedSearch[];
  isLoading: boolean;
  error: string | null;

  fetchSavedSearches: (entityType?: 'contact' | 'property') => Promise<void>;
  createSavedSearch: (search: Omit<SavedSearch, 'id' | 'created_at' | 'updated_at'>) => Promise<SavedSearch | null>;
  updateSavedSearch: (id: string, updates: Partial<SavedSearch>) => Promise<void>;
  deleteSavedSearch: (id: string) => Promise<void>;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

export const useSavedSearchStore = create<SavedSearchState>()((set) => ({
  savedSearches: [],
  isLoading: false,
  error: null,

  fetchSavedSearches: async (entityType) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      let query = supabase
        .from('saved_searches')
        .select('*')
        .order('created_at', { ascending: false });

      if (entityType) query = query.eq('entity_type', entityType);

      const { data, error } = await query;
      if (error) throw error;
      set({ savedSearches: (data as SavedSearch[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch saved searches';
      set({ error: message, isLoading: false });
    }
  },

  createSavedSearch: async (search) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      if (isDemo) return null;

      const { data, error } = await supabase
        .from('saved_searches')
        .insert({ ...search, team_id: teamId, user_id: userId })
        .select()
        .single();

      if (error) throw error;
      const newSearch = data as SavedSearch;
      set((state) => ({ savedSearches: [newSearch, ...state.savedSearches] }));
      return newSearch;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create saved search';
      set({ error: message });
      return null;
    }
  },

  updateSavedSearch: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('saved_searches').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        savedSearches: state.savedSearches.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update saved search';
      set({ error: message });
    }
  },

  deleteSavedSearch: async (id) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('saved_searches').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({ savedSearches: state.savedSearches.filter((s) => s.id !== id) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete saved search';
      set({ error: message });
    }
  },
}));
