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
        set({ isLoading: false });
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
