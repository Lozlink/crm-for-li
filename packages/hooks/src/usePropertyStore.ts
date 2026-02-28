import { create } from 'zustand';
import type { Property, PropertyContact, PropertyStatus, PropertyContactRole } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface PropertyState {
  properties: Property[];
  activeProperty: Property | null;
  isLoading: boolean;
  error: string | null;

  fetchProperties: () => Promise<void>;
  fetchProperty: (propertyId: string) => Promise<void>;
  createProperty: (
    property: Omit<Property, 'id' | 'created_at' | 'updated_at'>,
    contacts?: { contact_id: string; role: PropertyContactRole }[]
  ) => Promise<Property | null>;
  updateProperty: (propertyId: string, updates: Partial<Property>) => Promise<void>;
  updatePropertyStatus: (propertyId: string, status: PropertyStatus) => Promise<void>;
  deleteProperty: (propertyId: string) => Promise<void>;
  addPropertyContact: (propertyId: string, contactId: string, role: PropertyContactRole) => Promise<void>;
  removePropertyContact: (propertyContactId: string) => Promise<void>;
  clearActiveProperty: () => void;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

const DEMO_PROPERTIES: Property[] = [
  {
    id: 'demo-prop-1',
    address: '42 Harbour Street',
    suburb: 'Sydney',
    state: 'NSW',
    postcode: '2000',
    latitude: -33.8688,
    longitude: 151.2093,
    property_type: 'residential',
    category: 'apartment',
    for_type: 'sale',
    status: 'available',
    appraisal_price: 1200000,
    advertised_price: 1250000,
    beds: 2,
    baths: 2,
    cars: 1,
    land_size_sqm: 95,
    features: ['harbour views', 'balcony', 'gym'],
    photos: [],
    assigned_agents: [],
    listed_at: '2026-02-01T00:00:00Z',
    created_at: '2026-01-15T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
  {
    id: 'demo-prop-2',
    address: '7 Ocean Road',
    suburb: 'Bondi Beach',
    state: 'NSW',
    postcode: '2026',
    latitude: -33.8915,
    longitude: 151.2767,
    property_type: 'residential',
    category: 'house',
    for_type: 'sale',
    status: 'under_offer',
    appraisal_price: 3500000,
    advertised_price: 3650000,
    beds: 4,
    baths: 3,
    cars: 2,
    land_size_sqm: 450,
    features: ['ocean views', 'pool', 'renovated kitchen'],
    photos: [],
    assigned_agents: [],
    listed_at: '2026-01-20T00:00:00Z',
    created_at: '2026-01-10T00:00:00Z',
    updated_at: '2026-02-20T00:00:00Z',
  },
  {
    id: 'demo-prop-3',
    address: '15/88 Crown Street',
    suburb: 'Surry Hills',
    state: 'NSW',
    postcode: '2010',
    latitude: -33.8830,
    longitude: 151.2116,
    property_type: 'residential',
    category: 'apartment',
    for_type: 'lease',
    status: 'available',
    advertised_price: 750,
    beds: 1,
    baths: 1,
    cars: 0,
    land_size_sqm: 55,
    features: ['pet friendly', 'rooftop access'],
    photos: [],
    assigned_agents: [],
    listed_at: '2026-02-15T00:00:00Z',
    created_at: '2026-02-15T00:00:00Z',
    updated_at: '2026-02-15T00:00:00Z',
  },
  {
    id: 'demo-prop-4',
    address: '23 Victoria Avenue',
    suburb: 'Chatswood',
    state: 'NSW',
    postcode: '2067',
    latitude: -33.7969,
    longitude: 151.1832,
    property_type: 'residential',
    category: 'townhouse',
    for_type: 'sale',
    status: 'appraisal',
    appraisal_price: 1800000,
    beds: 3,
    baths: 2,
    cars: 2,
    land_size_sqm: 200,
    features: ['courtyard', 'double garage'],
    photos: [],
    assigned_agents: [],
    created_at: '2026-02-25T00:00:00Z',
    updated_at: '2026-02-25T00:00:00Z',
  },
];

export const usePropertyStore = create<PropertyState>()((set, get) => ({
  properties: [],
  activeProperty: null,
  isLoading: false,
  error: null,

  fetchProperties: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        set({
          properties: DEMO_PROPERTIES,
          isLoading: false,
        });
        return;
      }

      let query = supabase
        .from('properties')
        .select('*, property_contacts(id, contact_id, role, contact:contacts(id, first_name, last_name, phone, email))')
        .order('created_at', { ascending: false });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ properties: (data as Property[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch properties';
      set({ error: message, isLoading: false });
    }
  },

  fetchProperty: async (propertyId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      const { data, error } = await supabase
        .from('properties')
        .select('*, property_contacts(id, contact_id, role, contact:contacts(id, first_name, last_name, phone, email))')
        .eq('id', propertyId)
        .single();

      if (error) throw error;
      set({ activeProperty: data as Property, isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch property';
      set({ error: message, isLoading: false });
    }
  },

  createProperty: async (property, contacts) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newProperty: Property = {
          ...property,
          id: generateUUID(),
          team_id: teamId || undefined,
          user_id: userId || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set((state) => ({ properties: [newProperty, ...state.properties] }));
        return newProperty;
      }

      const insertData: Record<string, unknown> = { ...property };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data, error } = await supabase
        .from('properties')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      const newProperty = data as Property;

      // Add linked contacts if provided
      if (contacts && contacts.length > 0) {
        const contactRows = contacts.map((c) => ({
          property_id: newProperty.id,
          contact_id: c.contact_id,
          role: c.role,
        }));
        await supabase.from('property_contacts').insert(contactRows);
      }

      set((state) => ({ properties: [newProperty, ...state.properties] }));
      return newProperty;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create property';
      set({ error: message });
      return null;
    }
  },

  updateProperty: async (propertyId, updates) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set((state) => ({
          properties: state.properties.map((p) =>
            p.id === propertyId ? { ...p, ...updates } : p
          ),
          activeProperty:
            state.activeProperty?.id === propertyId
              ? { ...state.activeProperty, ...updates }
              : state.activeProperty,
        }));
        return;
      }

      const { error } = await supabase
        .from('properties')
        .update(updates)
        .eq('id', propertyId);

      if (error) throw error;

      set((state) => ({
        properties: state.properties.map((p) =>
          p.id === propertyId ? { ...p, ...updates } : p
        ),
        activeProperty:
          state.activeProperty?.id === propertyId
            ? { ...state.activeProperty, ...updates }
            : state.activeProperty,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update property';
      set({ error: message });
    }
  },

  updatePropertyStatus: async (propertyId, status) => {
    const timestampField =
      status === 'available' ? 'listed_at'
      : status === 'exchanged' ? 'exchanged_at'
      : status === 'settled' || status === 'leased' ? 'settled_at'
      : null;

    const updates: Record<string, unknown> = { status };
    if (timestampField) {
      updates[timestampField] = new Date().toISOString();
    }

    await get().updateProperty(propertyId, updates as Partial<Property>);
  },

  deleteProperty: async (propertyId) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set((state) => ({
          properties: state.properties.filter((p) => p.id !== propertyId),
          activeProperty: state.activeProperty?.id === propertyId ? null : state.activeProperty,
        }));
        return;
      }

      const { error } = await supabase
        .from('properties')
        .delete()
        .eq('id', propertyId);

      if (error) throw error;

      set((state) => ({
        properties: state.properties.filter((p) => p.id !== propertyId),
        activeProperty: state.activeProperty?.id === propertyId ? null : state.activeProperty,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete property';
      set({ error: message });
    }
  },

  addPropertyContact: async (propertyId, contactId, role) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase
        .from('property_contacts')
        .insert({ property_id: propertyId, contact_id: contactId, role });

      if (error) throw error;

      // Re-fetch the property to get updated contacts
      await get().fetchProperty(propertyId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add property contact';
      set({ error: message });
    }
  },

  removePropertyContact: async (propertyContactId) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase
        .from('property_contacts')
        .delete()
        .eq('id', propertyContactId);

      if (error) throw error;

      // Refresh active property if loaded
      const activeProperty = get().activeProperty;
      if (activeProperty) {
        await get().fetchProperty(activeProperty.id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove property contact';
      set({ error: message });
    }
  },

  clearActiveProperty: () => set({ activeProperty: null }),
}));
