import { create } from 'zustand';
import { storage } from '@realestate-crm/utils';
import type { Contact, Tag, Activity, MapRegion, SavedSuburb } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface CRMState {
  // Data
  contacts: Contact[];
  tags: Tag[];
  activities: Activity[];
  savedSuburbs: SavedSuburb[];

  // UI State
  selectedTagIds: string[];
  searchQuery: string;
  mapRegion: MapRegion;
  isLoading: boolean;
  error: string | null;
  isHydrated: boolean;

  // Actions
  setContacts: (contacts: Contact[]) => void;
  setTags: (tags: Tag[]) => void;
  setActivities: (activities: Activity[]) => void;
  setSelectedTagIds: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  setMapRegion: (region: MapRegion) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // CRUD Operations
  fetchContacts: () => Promise<void>;
  fetchTags: () => Promise<void>;
  fetchActivities: (contactId: string) => Promise<void>;

  addContact: (contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>) => Promise<Contact | null>;
  updateContact: (id: string, contact: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;

  addTag: (tag: Omit<Tag, 'id' | 'created_at'>) => Promise<Tag | null>;
  updateTag: (id: string, tag: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;

  addActivity: (activity: Omit<Activity, 'id' | 'created_at'>) => Promise<void>;

  // Saved Suburbs
  addSavedSuburb: (suburb: Omit<SavedSuburb, 'id'>) => void;
  removeSavedSuburb: (id: string) => void;

  // Hydration
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;

  // Team switching
  resetData: () => Promise<void>;
}

// 15 Hornet Street, Greenfield Park, NSW, Australia - street level zoom
const DEFAULT_REGION: MapRegion = {
  latitude: -33.8756,
  longitude: 150.8956,
  latitudeDelta: 0.008,
  longitudeDelta: 0.008,
};

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

export const useCRMStore = create<CRMState>()((set, get) => ({
  // Initial state
  contacts: [],
  tags: [],
  activities: [],
  savedSuburbs: [],
  selectedTagIds: [],
  searchQuery: '',
  mapRegion: DEFAULT_REGION,
  isLoading: false,
  error: null,
  isHydrated: false,

  // Setters
  setContacts: (contacts) => { set({ contacts }); get().persist(); },
  setTags: (tags) => { set({ tags }); get().persist(); },
  setActivities: (activities) => set({ activities }),
  setSelectedTagIds: (selectedTagIds) => set({ selectedTagIds }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setMapRegion: (mapRegion) => { set({ mapRegion }); get().persist(); },
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  // Saved Suburbs
  addSavedSuburb: (suburb) => {
    const newSuburb: SavedSuburb = {
      ...suburb,
      id: generateUUID(),
    };
    set(state => ({ savedSuburbs: [...state.savedSuburbs, newSuburb] }));
    get().persist();
  },

  removeSavedSuburb: (id) => {
    set(state => ({ savedSuburbs: state.savedSuburbs.filter(s => s.id !== id) }));
    get().persist();
  },

  // Hydration
  hydrate: async () => {
    try {
      const data = await storage.getItem('crm-storage');
      if (data) {
        const parsed = JSON.parse(data);
        set({
          contacts: parsed.contacts || [],
          tags: parsed.tags || [],
          savedSuburbs: parsed.savedSuburbs || [],
          mapRegion: parsed.mapRegion || DEFAULT_REGION,
          isHydrated: true,
        });
      } else {
        set({ isHydrated: true });
      }
    } catch (e) {
      console.error('Hydration error:', e);
      set({ isHydrated: true });
    }
  },

  persist: async () => {
    try {
      const { contacts, tags, savedSuburbs, mapRegion } = get();
      await storage.setItem('crm-storage', JSON.stringify({
        contacts,
        tags,
        savedSuburbs,
        mapRegion,
      }));
    } catch (e) {
      console.error('Persist error:', e);
    }
  },

  // Reset and refetch when team switches
  resetData: async () => {
    set({
      contacts: [],
      tags: [],
      activities: [],
      selectedTagIds: [],
      searchQuery: '',
      isLoading: false,
      error: null,
    });
    await get().fetchTags();
    await get().fetchContacts();
  },

  // Fetch operations
  fetchContacts: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      let query = supabase
        .from('contacts')
        .select('*, tag:tags(*)')
        .order('created_at', { ascending: false });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;

      if (error) throw error;
      set({ contacts: data || [], isLoading: false });
      get().persist();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchTags: async () => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        return;
      }

      let query = supabase
        .from('tags')
        .select('*')
        .order('name');

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;

      if (error) throw error;
      set({ tags: data || [] });
      get().persist();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchActivities: async (contactId: string) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        return;
      }

      const { data, error } = await supabase
        .from('activities')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ activities: data || [] });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Contact CRUD
  addContact: async (contact) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newContact: Contact = {
          ...contact,
          id: generateUUID(),
          team_id: teamId || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const tags = get().tags;
        if (contact.tag_id) {
          newContact.tag = tags.find(t => t.id === contact.tag_id);
        }

        set(state => ({
          contacts: [newContact, ...state.contacts],
          isLoading: false,
        }));
        get().persist();
        return newContact;
      }

      const insertData: any = { ...contact };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data, error } = await supabase
        .from('contacts')
        .insert(insertData)
        .select('*, tag:tags(*)')
        .single();

      if (error) throw error;

      set(state => ({
        contacts: [data, ...state.contacts],
        isLoading: false,
      }));
      get().persist();
      return data;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  updateContact: async (id, contact) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        const tags = get().tags;
        set(state => ({
          contacts: state.contacts.map(c => {
            if (c.id === id) {
              const updated = { ...c, ...contact, updated_at: new Date().toISOString() };
              if (contact.tag_id) {
                updated.tag = tags.find(t => t.id === contact.tag_id);
              } else if (contact.tag_id === undefined && 'tag_id' in contact) {
                updated.tag = undefined;
              }
              return updated;
            }
            return c;
          }),
          isLoading: false,
        }));
        get().persist();
        return;
      }

      const { error } = await supabase
        .from('contacts')
        .update({ ...contact, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      await get().fetchContacts();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  deleteContact: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          contacts: state.contacts.filter(c => c.id !== id),
          activities: state.activities.filter(a => a.contact_id !== id),
          isLoading: false,
        }));
        get().persist();
        return;
      }

      const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        contacts: state.contacts.filter(c => c.id !== id),
        isLoading: false,
      }));
      get().persist();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  // Tag CRUD
  addTag: async (tag) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newTag: Tag = {
          ...tag,
          id: generateUUID(),
          team_id: teamId || undefined,
          created_at: new Date().toISOString(),
        };
        set(state => ({ tags: [...state.tags, newTag] }));
        get().persist();
        return newTag;
      }

      const insertData: any = { ...tag };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data, error } = await supabase
        .from('tags')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      set(state => ({ tags: [...state.tags, data] }));
      get().persist();
      return data;
    } catch (error: any) {
      set({ error: error.message });
      return null;
    }
  },

  updateTag: async (id, tag) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          tags: state.tags.map(t => t.id === id ? { ...t, ...tag } : t),
        }));
        get().persist();
        return;
      }

      const { error } = await supabase
        .from('tags')
        .update(tag)
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        tags: state.tags.map(t => t.id === id ? { ...t, ...tag } : t),
      }));
      get().persist();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  deleteTag: async (id) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          tags: state.tags.filter(t => t.id !== id),
          contacts: state.contacts.map(c =>
            c.tag_id === id ? { ...c, tag_id: undefined, tag: undefined } : c
          ),
        }));
        get().persist();
        return;
      }

      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id);

      if (error) throw error;

      set(state => ({ tags: state.tags.filter(t => t.id !== id) }));
      get().persist();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Activity CRUD
  addActivity: async (activity) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newActivity: Activity = {
          ...activity,
          id: generateUUID(),
          team_id: teamId || undefined,
          created_at: new Date().toISOString(),
        };
        set(state => ({ activities: [newActivity, ...state.activities] }));
        return;
      }

      const insertData: any = { ...activity };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data, error } = await supabase
        .from('activities')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      set(state => ({ activities: [data, ...state.activities] }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },
}));
