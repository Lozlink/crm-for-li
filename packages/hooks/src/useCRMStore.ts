import { create } from 'zustand';
import { storage, normalizeAddress, generateCallDedupKey } from '@realestate-crm/utils';
import type { Contact, Tag, Activity, ActivityWithContact, MapRegion, SavedSuburb, ActivitySource } from '@realestate-crm/types';
// Note: Activity type is still used in addActivity parameter type (Omit<Activity, ...>)
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

// Valid columns in the contacts table — used to strip form-only fields before Supabase operations
const CONTACT_DB_COLUMNS = new Set([
  'first_name', 'last_name', 'email', 'phone', 'address', 'unit_number',
  'latitude', 'longitude', 'tag_id', 'user_id', 'team_id',
  'source', 'contact_type', 'company_name', 'title',
  'preferred_contact_method', 'do_not_contact', 'notes',
  'status', 'lead_score', 'last_contacted_at', 'next_follow_up_at',
]);

function pickContactColumns(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (CONTACT_DB_COLUMNS.has(key) && value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

interface CRMState {
  // Data
  contacts: Contact[];
  tags: Tag[];
  activities: ActivityWithContact[];
  savedSuburbs: SavedSuburb[];

  // Cross-store sync counters
  propertyLinksVersion: number;
  bumpPropertyLinksVersion: () => void;

  // Subscription statuses
  subscriptionStatuses: Map<string, { email: boolean; sms: boolean }>;
  fetchSubscriptionStatuses: () => Promise<void>;
  getSubscriptionStatus: (contactId: string) => { email: boolean; sms: boolean };

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
  setActivities: (activities: ActivityWithContact[]) => void;
  setSelectedTagIds: (ids: string[]) => void;
  setSearchQuery: (query: string) => void;
  setMapRegion: (region: MapRegion) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;

  // CRUD Operations
  fetchContacts: (ctx?: { teamId: string | null; userId: string | null; isDemo: boolean }) => Promise<void>;
  fetchTags: (ctx?: { teamId: string | null; userId: string | null; isDemo: boolean }) => Promise<void>;
  fetchActivities: (contactIdOrLimit?: string | number) => Promise<void>;

  addContact: (contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>) => Promise<Contact | null>;
  updateContact: (id: string, contact: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;

  addTag: (tag: Omit<Tag, 'id' | 'created_at'>) => Promise<Tag | null>;
  updateTag: (id: string, tag: Partial<Tag>) => Promise<void>;
  deleteTag: (id: string) => Promise<void>;

  addTagToContact: (contactId: string, tagId: string) => Promise<void>;
  removeTagFromContact: (contactId: string, tagId: string) => Promise<void>;

  addActivity: (activity: Omit<Activity, 'id' | 'created_at'>) => Promise<Activity | null>;
  updateActivity: (id: string, updates: Partial<Activity>) => Promise<void>;
  bulkAddContacts: (contacts: Omit<Contact, 'id' | 'created_at' | 'updated_at'>[]) => Promise<Contact[]>;
  bulkDeleteContacts: (ids: string[]) => Promise<void>;
  findContactByAddress: (address: string) => Contact | undefined;

  // Saved Suburbs
  addSavedSuburb: (suburb: Omit<SavedSuburb, 'id'>) => void;
  removeSavedSuburb: (id: string) => void;

  // Hydration
  hydrate: () => Promise<void>;
  persist: () => Promise<void>;

  // Team switching / cleanup
  resetData: () => Promise<void>;
  clearData: () => void;
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

// Helper to sync contact_tags junction table for a contact
export async function syncContactTags(contactId: string, tagIds: string[], teamId: string | null) {
  // Remove all existing tags for this contact
  const { error: deleteError } = await supabase.from('contact_tags').delete().eq('contact_id', contactId);
  if (deleteError) throw deleteError;

  // Insert new tag associations
  if (tagIds.length > 0) {
    const rows = tagIds.map(tag_id => ({
      contact_id: contactId,
      tag_id,
      team_id: teamId,
    }));
    const { error } = await supabase.from('contact_tags').insert(rows);
    if (error) throw error;
  }
}

export const useCRMStore = create<CRMState>()((set, get) => ({
  // Initial state
  contacts: [],
  tags: [],
  activities: [],
  savedSuburbs: [],
  propertyLinksVersion: 0,
  bumpPropertyLinksVersion: () => set(state => ({ propertyLinksVersion: state.propertyLinksVersion + 1 })),
  subscriptionStatuses: new Map(),
  fetchSubscriptionStatuses: async () => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return;

      // Fetch email unsubscribes from contact_subscriptions
      const { data: emailSubs } = await supabase
        .from('contact_subscriptions')
        .select('contact_id, subscribed')
        .eq('team_id', teamId);

      // Fetch SMS opt-outs
      const { data: smsOptOuts } = await supabase
        .from('sms_opt_outs')
        .select('phone_number')
        .eq('team_id', teamId);

      const smsOptOutPhones = new Set((smsOptOuts || []).map((r: { phone_number: string }) => r.phone_number));

      // Build the lookup map
      const statusMap = new Map<string, { email: boolean; sms: boolean }>();

      // First, set all contacts as subscribed by default
      const contacts = get().contacts;
      for (const c of contacts) {
        statusMap.set(c.id, {
          email: true,
          sms: c.phone ? !smsOptOutPhones.has(c.phone) : true,
        });
      }

      // Override email status from contact_subscriptions
      for (const sub of emailSubs || []) {
        const existing = statusMap.get(sub.contact_id);
        if (existing) {
          existing.email = sub.subscribed;
        } else {
          statusMap.set(sub.contact_id, { email: sub.subscribed, sms: true });
        }
      }

      set({ subscriptionStatuses: statusMap });
    } catch (error: any) {
      console.error('Failed to fetch subscription statuses:', error.message);
    }
  },
  getSubscriptionStatus: (contactId) => {
    const status = get().subscriptionStatuses.get(contactId);
    return status || { email: true, sms: true };
  },
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

  // Hydration - only loads from local storage in demo mode
  hydrate: async () => {
    try {
      const { isDemo } = getTeamContext();

      // In auth mode, data comes from Supabase - skip local hydration
      if (!isDemo) {
        set({ isHydrated: true });
        return;
      }

      const data = await storage.getItem('crm-storage-demo');
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

  // Persist - only saves to local storage in demo mode
  persist: async () => {
    try {
      const { isDemo } = getTeamContext();
      if (!isDemo) return;

      const { contacts, tags, savedSuburbs, mapRegion } = get();
      await storage.setItem('crm-storage-demo', JSON.stringify({
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
    // Capture team context once to avoid stale reads during sequential fetches
    const ctx = getTeamContext();
    set({
      contacts: [],
      tags: [],
      activities: [],
      selectedTagIds: [],
      searchQuery: '',
      isLoading: false,
      error: null,
    });
    await get().fetchTags(ctx);
    await get().fetchContacts(ctx);
  },

  // Clear all data from store (used on sign out)
  clearData: () => {
    set({
      contacts: [],
      tags: [],
      activities: [],
      savedSuburbs: [],
      selectedTagIds: [],
      searchQuery: '',
      isHydrated: false,
      isLoading: false,
      error: null,
    });
  },

  // Fetch operations
  fetchContacts: async (ctx?) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = ctx || getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      let query = supabase
        .from('contacts')
        .select('*, tag:tags!contacts_tag_id_fkey(*), contact_tags(tag:tags!contact_tags_tag_id_fkey(*))')
        .order('created_at', { ascending: false });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('fetchContacts error:', error.message, error.details, error.hint);
        throw error;
      }

      // Flatten nested contact_tags join into a tags array
      const contacts = (data || []).map((c: any) => ({
        ...c,
        tags: (c.contact_tags || []).map((ct: any) => ct.tag).filter(Boolean),
        contact_tags: undefined,
      }));

      set({ contacts, isLoading: false });
      get().persist();

      // Lazily refresh subscription statuses after contacts load
      get().fetchSubscriptionStatuses();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchTags: async (ctx?) => {
    try {
      const { isDemo, teamId } = ctx || getTeamContext();
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

  fetchActivities: async (contactIdOrLimit?: string | number) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return;

      const isContactFetch = typeof contactIdOrLimit === 'string';
      const limit = typeof contactIdOrLimit === 'number' ? contactIdOrLimit : 10;

      if (isContactFetch) {
        // Per-contact fetch: load with contact join for the specific contact
        const { data, error } = await supabase
          .from('activities')
          .select('*, contact:contacts(first_name, last_name)')
          .eq('contact_id', contactIdOrLimit)
          .order('created_at', { ascending: false });

        if (error) throw error;
        // Merge fetched activities into the existing list, replacing any for this contact
        set(state => {
          const others = state.activities.filter(a => a.contact_id !== contactIdOrLimit);
          return { activities: [...(data as ActivityWithContact[] || []), ...others] };
        });
        return;
      }

      // Team-wide fetch: load recent activities with contact join + orphaned field notes
      let query = supabase
        .from('activities')
        .select('*, contact:contacts(first_name, last_name)')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Also fetch orphaned tracking annotations (no contact_id) — field notes not yet linked
      let orphanQuery = supabase
        .from('tracking_annotations')
        .select('id, note, created_at, latitude, longitude, session_id, team_id')
        .is('contact_id', null)
        .order('created_at', { ascending: false })
        .limit(50);

      if (teamId) {
        orphanQuery = orphanQuery.eq('team_id', teamId);
      }

      const { data: orphans } = await orphanQuery;

      // Convert orphaned annotations to ActivityWithContact shape for display
      const orphanActivities: ActivityWithContact[] = (orphans || []).map(o => ({
        id: `orphan-${o.id}`,
        contact_id: '',
        type: 'note' as const,
        content: o.note,
        source: 'tracking' as const,
        tracking_annotation_id: o.id,
        team_id: o.team_id,
        created_at: o.created_at,
        contact: { first_name: 'Field Note', last_name: '(unlinked)' },
      }));

      // Merge and sort by date
      const merged = [...(data as ActivityWithContact[] || []), ...orphanActivities]
        .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
        .slice(0, limit);

      set({ activities: merged });
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
        const allTags = get().tags;
        const newContact: Contact = {
          ...contact,
          id: generateUUID(),
          team_id: teamId || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Support both single tag_id and multi-tag via tags array
        if (contact.tag_id) {
          newContact.tag = allTags.find(t => t.id === contact.tag_id);
        }
        if (contact.tags && contact.tags.length > 0) {
          newContact.tags = contact.tags;
        } else if (newContact.tag) {
          newContact.tags = [newContact.tag];
        } else {
          newContact.tags = [];
        }

        set(state => ({
          contacts: [newContact, ...state.contacts],
          isLoading: false,
        }));
        get().persist();
        return newContact;
      }

      // Extract tag_ids before inserting (they go to junction table, not contacts row)
      const { tags: tagObjects, ...contactFields } = contact as any;
      const tagIds: string[] = tagObjects
        ? tagObjects.map((t: Tag) => t.id)
        : contact.tag_id ? [contact.tag_id] : [];

      const insertData: any = pickContactColumns(contactFields);
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;
      // Keep tag_id for backward compat (first tag or null)
      insertData.tag_id = tagIds[0] || null;

      const { data, error } = await supabase
        .from('contacts')
        .insert(insertData)
        .select('*, tag:tags!contacts_tag_id_fkey(*)')
        .single();

      if (error) throw error;

      // Insert into junction table
      if (tagIds.length > 0) {
        await syncContactTags(data.id, tagIds, teamId);
      }

      // Attach tags array to returned contact
      const allTags = get().tags;
      data.tags = tagIds.map(tid => allTags.find(t => t.id === tid)).filter(Boolean);

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
      const { isDemo, teamId } = getTeamContext();

      if (isDemo) {
        const allTags = get().tags;
        set(state => ({
          contacts: state.contacts.map(c => {
            if (c.id === id) {
              const updated = { ...c, ...contact, updated_at: new Date().toISOString() };
              if (contact.tag_id) {
                updated.tag = allTags.find(t => t.id === contact.tag_id);
              } else if (contact.tag_id === undefined && 'tag_id' in contact) {
                updated.tag = undefined;
              }
              // Update tags array for multi-tag
              if (contact.tags !== undefined) {
                updated.tags = contact.tags;
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

      // Extract tags and whitelist only valid DB columns
      const { tags: tagObjects, ...contactFields } = contact as any;
      const updateData: any = { ...pickContactColumns(contactFields), updated_at: new Date().toISOString() };

      // If tags array is provided, sync junction table and update tag_id for compat
      if (tagObjects !== undefined) {
        const tagIds: string[] = tagObjects
          ? tagObjects.map((t: Tag) => t.id)
          : [];
        updateData.tag_id = tagIds[0] || null;
        await syncContactTags(id, tagIds, teamId);
      }

      const { error } = await supabase
        .from('contacts')
        .update(updateData)
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

      // contact_tags rows are deleted automatically via ON DELETE CASCADE
      const { error, count } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (error) throw error;
      if (count === 0) throw new Error('Contact could not be deleted. You may not have permission.');

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
          contacts: state.contacts.map(c => {
            const hadTag = c.tag_id === id || (c.tags || []).some(t => t.id === id);
            if (!hadTag) return c;
            return {
              ...c,
              tag_id: c.tag_id === id ? undefined : c.tag_id,
              tag: c.tag_id === id ? undefined : c.tag,
              tags: (c.tags || []).filter(t => t.id !== id),
            };
          }),
        }));
        get().persist();
        return;
      }

      // contact_tags rows are deleted automatically via ON DELETE CASCADE
      const { error, count } = await supabase
        .from('tags')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (error) throw error;
      if (count === 0) throw new Error('Tag could not be deleted. You may not have permission.');

      set(state => ({
        tags: state.tags.filter(t => t.id !== id),
        contacts: state.contacts.map(c => ({
          ...c,
          tags: (c.tags || []).filter(t => t.id !== id),
          tag_id: c.tag_id === id ? undefined : c.tag_id,
          tag: c.tag_id === id ? undefined : c.tag,
        })),
      }));
      get().persist();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  addTagToContact: async (contactId, tagId) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      const allTags = get().tags;
      const tag = allTags.find(t => t.id === tagId);

      if (isDemo) {
        if (!tag) return;
        set(state => ({
          contacts: state.contacts.map(c => {
            if (c.id !== contactId) return c;
            const existing = (c.tags || []).map(t => t.id);
            if (existing.includes(tagId)) return c;
            const newTags = [...(c.tags || []), tag];
            return { ...c, tags: newTags, tag_id: c.tag_id || tagId, tag: c.tag || tag };
          }),
        }));
        get().persist();
        return;
      }

      // Insert into junction table (ignore conflict if already exists)
      await supabase.from('contact_tags').upsert(
        { contact_id: contactId, tag_id: tagId, team_id: teamId },
        { onConflict: 'contact_id,tag_id' }
      );

      // Update local state
      set(state => ({
        contacts: state.contacts.map(c => {
          if (c.id !== contactId) return c;
          const existing = (c.tags || []).map(t => t.id);
          if (existing.includes(tagId)) return c;
          const newTags = [...(c.tags || []), tag].filter(Boolean) as Tag[];
          return { ...c, tags: newTags, tag_id: c.tag_id || tagId };
        }),
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  removeTagFromContact: async (contactId, tagId) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          contacts: state.contacts.map(c => {
            if (c.id !== contactId) return c;
            const newTags = (c.tags || []).filter(t => t.id !== tagId);
            const newTagId = c.tag_id === tagId ? (newTags[0]?.id || undefined) : c.tag_id;
            const newTag = c.tag_id === tagId ? (newTags[0] || undefined) : c.tag;
            return { ...c, tags: newTags, tag_id: newTagId, tag: newTag };
          }),
        }));
        get().persist();
        return;
      }

      await supabase.from('contact_tags').delete()
        .eq('contact_id', contactId)
        .eq('tag_id', tagId);

      // Update tag_id for backward compat if we removed the primary tag
      const contact = get().contacts.find(c => c.id === contactId);
      if (contact?.tag_id === tagId) {
        const remainingTags = (contact.tags || []).filter(t => t.id !== tagId);
        await supabase.from('contacts').update({
          tag_id: remainingTags[0]?.id || null,
        }).eq('id', contactId);
      }

      // Update local state
      set(state => ({
        contacts: state.contacts.map(c => {
          if (c.id !== contactId) return c;
          const newTags = (c.tags || []).filter(t => t.id !== tagId);
          const newTagId = c.tag_id === tagId ? (newTags[0]?.id || undefined) : c.tag_id;
          const newTag = c.tag_id === tagId ? (newTags[0] || undefined) : c.tag;
          return { ...c, tags: newTags, tag_id: newTagId, tag: newTag };
        }),
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  // Activity CRUD
  addActivity: async (activity) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      // Default source based on activity type if not provided
      const source: ActivitySource | undefined = activity.source
        ?? (activity.type === 'call' ? 'call' : activity.type === 'note' ? 'office' : undefined);

      // For call activities, attach a dedup key so that auto-detection and manual
      // entry referencing the same call can be identified and deduplicated.
      const contact = get().contacts.find(c => c.id === activity.contact_id);
      const callDedupKey = activity.type === 'call' && contact?.phone
        ? generateCallDedupKey(contact.phone, new Date())
        : undefined;

      const activityWithSource = {
        ...activity,
        source,
        ...(callDedupKey ? { call_dedup_key: callDedupKey } : {}),
      };

      if (isDemo) {
        const newActivity: ActivityWithContact = {
          ...activityWithSource,
          id: generateUUID(),
          team_id: teamId || undefined,
          created_at: new Date().toISOString(),
          contact: contact
            ? { first_name: contact.first_name, last_name: contact.last_name }
            : { first_name: 'Unknown' },
        };
        set(state => ({
          activities: [newActivity, ...state.activities],
          contacts: ['call', 'meeting', 'email'].includes(activityWithSource.type)
            ? state.contacts.map((c) =>
                c.id === activityWithSource.contact_id
                  ? { ...c, last_contacted_at: new Date().toISOString() }
                  : c
              )
            : state.contacts,
        }));
        return newActivity;
      }

      const insertData: Record<string, unknown> = { ...activityWithSource };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data, error } = await supabase
        .from('activities')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Attach contact info for the consolidated ActivityWithContact shape
      const activityWithContact: ActivityWithContact = {
        ...data,
        contact: contact
          ? { first_name: contact.first_name, last_name: contact.last_name }
          : { first_name: 'Unknown' },
      };

      // Auto-update last_contacted_at for communication activities
      if (['call', 'meeting', 'email'].includes(activityWithSource.type)) {
        const now = new Date().toISOString();
        await supabase
          .from('contacts')
          .update({ last_contacted_at: now })
          .eq('id', activityWithSource.contact_id);

        set(state => ({
          activities: [activityWithContact, ...state.activities],
          contacts: state.contacts.map((c) =>
            c.id === activityWithSource.contact_id ? { ...c, last_contacted_at: now } : c
          ),
        }));
      } else {
        set(state => ({ activities: [activityWithContact, ...state.activities] }));
      }
      return data;
    } catch (error: any) {
      set({ error: error.message });
      return null;
    }
  },

  updateActivity: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();

      // Spread updates preserving the contact join field
      if (isDemo) {
        set(state => ({
          activities: state.activities.map(a =>
            a.id === id ? { ...a, ...updates } : a
          ),
        }));
        return;
      }

      const { error } = await supabase
        .from('activities')
        .update(updates)
        .eq('id', id);

      if (error) throw error;

      set(state => ({
        activities: state.activities.map(a =>
          a.id === id ? { ...a, ...updates } : a
        ),
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  bulkAddContacts: async (contacts) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const now = new Date().toISOString();
        const allTags = get().tags;
        const newContacts: Contact[] = contacts.map(c => {
          const nc: Contact = {
            ...c,
            id: generateUUID(),
            team_id: teamId || undefined,
            created_at: now,
            updated_at: now,
          };
          // Populate tags array from tag_id for demo mode
          if (c.tag_id) {
            const tag = allTags.find(t => t.id === c.tag_id);
            nc.tag = tag;
            nc.tags = tag ? [tag] : [];
          } else {
            nc.tags = [];
          }
          return nc;
        });
        set(state => ({
          contacts: [...newContacts, ...state.contacts],
        }));
        get().persist();
        return newContacts;
      }

      const insertData = contacts.map(c => {
        const d: any = { ...c };
        if (teamId) d.team_id = teamId;
        if (userId) d.user_id = userId;
        return d;
      });

      // Insert in batches to avoid PostgREST body size limits
      const BATCH_SIZE = 500;
      const allCreated: Contact[] = [];

      for (let i = 0; i < insertData.length; i += BATCH_SIZE) {
        const batch = insertData.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase
          .from('contacts')
          .insert(batch)
          .select('*, tag:tags!contacts_tag_id_fkey(*)');

        if (error) throw error;

        const created = data || [];

        // Sync junction table for each contact that has a tag_id
        for (const contact of created) {
          if (contact.tag_id) {
            await syncContactTags(contact.id, [contact.tag_id], teamId);
          }
          contact.tags = contact.tag ? [contact.tag] : [];
        }

        allCreated.push(...created);
      }

      set(state => ({
        contacts: [...allCreated, ...state.contacts],
      }));
      get().persist();
      return allCreated;
    } catch (error: any) {
      set({ error: error.message });
      return [];
    }
  },

  findContactByAddress: (address) => {
    if (!address.trim()) return undefined;
    const normalized = normalizeAddress(address);
    return get().contacts.find(
      (c) => c.address && normalizeAddress(c.address) === normalized
    );
  },

  bulkDeleteContacts: async (ids) => {
    if (ids.length === 0) return;
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        const idSet = new Set(ids);
        set(state => ({
          contacts: state.contacts.filter(c => !idSet.has(c.id)),
          activities: state.activities.filter(a => !idSet.has(a.contact_id)),
          isLoading: false,
        }));
        get().persist();
        return;
      }

      // Delete in batches to avoid PostgREST limits
      const BATCH_SIZE = 500;
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        const batch = ids.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from('contacts')
          .delete()
          .in('id', batch);

        if (error) throw error;
      }

      const idSet = new Set(ids);
      set(state => ({
        contacts: state.contacts.filter(c => !idSet.has(c.id)),
        isLoading: false,
      }));
      get().persist();
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },
}));
