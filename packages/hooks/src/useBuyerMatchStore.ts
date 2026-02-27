import { create } from 'zustand';
import type { ContactRequirement, BuyerMatch, Property, Contact } from '@realestate-crm/types';
import { supabase, isDemoMode } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface BuyerMatchState {
  requirements: ContactRequirement[];
  matches: BuyerMatch[];
  isLoading: boolean;
  error: string | null;

  fetchRequirements: (contactId: string) => Promise<void>;
  createRequirement: (req: Omit<ContactRequirement, 'id' | 'created_at' | 'updated_at'>) => Promise<ContactRequirement | null>;
  updateRequirement: (id: string, updates: Partial<ContactRequirement>) => Promise<void>;
  deleteRequirement: (id: string) => Promise<void>;
  findMatchingBuyers: (property: Property) => Promise<BuyerMatch[]>;
  findMatchingProperties: (requirement: ContactRequirement, properties: Property[]) => Property[];
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

function calculateMatchStrength(
  req: ContactRequirement,
  prop: Property
): { strength: BuyerMatch['strength']; matchingFields: string[] } {
  const matchingFields: string[] = [];
  const totalFields: string[] = [];

  // Suburb match
  if (req.suburbs.length > 0) {
    totalFields.push('suburb');
    if (prop.suburb && req.suburbs.some((s) => s.toLowerCase() === prop.suburb!.toLowerCase())) {
      matchingFields.push('suburb');
    }
  }

  // Price match
  const price = prop.advertised_price || prop.appraisal_price;
  if (req.price_min != null || req.price_max != null) {
    totalFields.push('price');
    if (price != null) {
      const aboveMin = req.price_min == null || price >= req.price_min;
      const belowMax = req.price_max == null || price <= req.price_max;
      if (aboveMin && belowMax) matchingFields.push('price');
    }
  }

  // Beds match
  if (req.beds_min != null) {
    totalFields.push('beds');
    if (prop.beds != null && prop.beds >= req.beds_min) matchingFields.push('beds');
  }

  // Baths match
  if (req.baths_min != null) {
    totalFields.push('baths');
    if (prop.baths != null && prop.baths >= req.baths_min) matchingFields.push('baths');
  }

  // Cars match
  if (req.cars_min != null) {
    totalFields.push('cars');
    if (prop.cars != null && prop.cars >= req.cars_min) matchingFields.push('cars');
  }

  // Type match
  if (req.property_types.length > 0) {
    totalFields.push('type');
    if (req.property_types.includes(prop.property_type)) matchingFields.push('type');
  }

  // Category match
  if (req.categories.length > 0) {
    totalFields.push('category');
    if (req.categories.includes(prop.category)) matchingFields.push('category');
  }

  const ratio = totalFields.length > 0 ? matchingFields.length / totalFields.length : 0;
  const strength = ratio >= 0.8 ? 'strong' : ratio >= 0.5 ? 'partial' : 'weak';

  return { strength, matchingFields };
}

export const useBuyerMatchStore = create<BuyerMatchState>()((set) => ({
  requirements: [],
  matches: [],
  isLoading: false,
  error: null,

  fetchRequirements: async (contactId) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      const { data, error } = await supabase
        .from('contact_requirements')
        .select('*')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ requirements: (data as ContactRequirement[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch requirements';
      set({ error: message, isLoading: false });
    }
  },

  createRequirement: async (req) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return null;

      const { data, error } = await supabase
        .from('contact_requirements')
        .insert({ ...req, team_id: teamId })
        .select()
        .single();

      if (error) throw error;
      const newReq = data as ContactRequirement;
      set((state) => ({ requirements: [newReq, ...state.requirements] }));
      return newReq;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create requirement';
      set({ error: message });
      return null;
    }
  },

  updateRequirement: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('contact_requirements').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        requirements: state.requirements.map((r) => (r.id === id ? { ...r, ...updates } : r)),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update requirement';
      set({ error: message });
    }
  },

  deleteRequirement: async (id) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('contact_requirements').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({ requirements: state.requirements.filter((r) => r.id !== id) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete requirement';
      set({ error: message });
    }
  },

  findMatchingBuyers: async (property) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return [];
      }

      // Fetch all active requirements for the team
      let query = supabase
        .from('contact_requirements')
        .select('*, contact:contacts(id, first_name, last_name, phone, email, address, latitude, longitude)')
        .eq('active', true);

      if (teamId) query = query.eq('team_id', teamId);

      // Filter by for_type: sale properties match 'buy' requirements, lease match 'rent'
      const reqForType = property.for_type === 'sale' ? 'buy' : 'rent';
      query = query.eq('for_type', reqForType);

      const { data, error } = await query;
      if (error) throw error;

      const matches: BuyerMatch[] = [];
      for (const req of (data || []) as (ContactRequirement & { contact: Contact })[]) {
        const { strength, matchingFields } = calculateMatchStrength(req, property);
        if (matchingFields.length > 0) {
          matches.push({
            contact: req.contact,
            requirement: req,
            strength,
            matchingFields,
          });
        }
      }

      // Sort: strong first, then partial, then weak
      const order = { strong: 0, partial: 1, weak: 2 };
      matches.sort((a, b) => order[a.strength] - order[b.strength]);

      set({ matches, isLoading: false });
      return matches;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to find matches';
      set({ error: message, isLoading: false });
      return [];
    }
  },

  findMatchingProperties: (requirement, properties) => {
    const forType = requirement.for_type === 'buy' ? 'sale' : 'lease';
    return properties.filter((prop) => {
      if (prop.for_type !== forType) return false;
      if (prop.status === 'withdrawn' || prop.status === 'settled' || prop.status === 'leased') return false;
      const { strength } = calculateMatchStrength(requirement, prop);
      return strength === 'strong' || strength === 'partial';
    });
  },
}));
