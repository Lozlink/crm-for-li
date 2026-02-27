import { create } from 'zustand';
import type { Inspection, InspectionAttendee, InspectionStatus, AttendeeSource, InterestLevel } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';
import { useCRMStore } from './useCRMStore';

interface InspectionState {
  inspections: Inspection[];
  activeInspection: Inspection | null;
  attendees: InspectionAttendee[];
  upcomingInspections: Inspection[];
  isLoading: boolean;
  error: string | null;

  fetchInspections: (propertyId?: string) => Promise<void>;
  fetchUpcoming: () => Promise<void>;
  fetchInspection: (inspectionId: string) => Promise<void>;
  createInspection: (inspection: Omit<Inspection, 'id' | 'created_at' | 'updated_at' | 'attendees' | 'property'>) => Promise<Inspection | null>;
  updateInspection: (id: string, updates: Partial<Inspection>) => Promise<void>;
  startInspection: (id: string) => Promise<void>;
  completeInspection: (id: string) => Promise<void>;
  cancelInspection: (id: string) => Promise<void>;
  addAttendee: (
    inspectionId: string,
    attendee: { first_name: string; last_name?: string; phone?: string; email?: string; source: AttendeeSource }
  ) => Promise<InspectionAttendee | null>;
  updateAttendee: (attendeeId: string, updates: { interest_level?: InterestLevel; feedback?: string }) => Promise<void>;
  removeAttendee: (attendeeId: string) => Promise<void>;
  clearActiveInspection: () => void;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

export const useInspectionStore = create<InspectionState>()((set, get) => ({
  inspections: [],
  activeInspection: null,
  attendees: [],
  upcomingInspections: [],
  isLoading: false,
  error: null,

  fetchInspections: async (propertyId) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) { set({ isLoading: false }); return; }

      let query = supabase
        .from('inspections')
        .select('*, property:properties(id, address, suburb), attendees:inspection_attendees(count)')
        .order('scheduled_at', { ascending: false });

      if (teamId) query = query.eq('team_id', teamId);
      if (propertyId) query = query.eq('property_id', propertyId);

      const { data, error } = await query;
      if (error) throw error;
      set({ inspections: (data as Inspection[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch inspections';
      set({ error: message, isLoading: false });
    }
  },

  fetchUpcoming: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) { set({ isLoading: false }); return; }

      let query = supabase
        .from('inspections')
        .select('*, property:properties(id, address, suburb)')
        .eq('status', 'scheduled')
        .gte('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true });

      if (teamId) query = query.eq('team_id', teamId);

      const { data, error } = await query;
      if (error) throw error;
      set({ upcomingInspections: (data as Inspection[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch upcoming inspections';
      set({ error: message, isLoading: false });
    }
  },

  fetchInspection: async (inspectionId) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) { set({ isLoading: false }); return; }

      const { data, error } = await supabase
        .from('inspections')
        .select('*, property:properties(id, address, suburb)')
        .eq('id', inspectionId)
        .single();

      if (error) throw error;

      const { data: attendees, error: attendeesError } = await supabase
        .from('inspection_attendees')
        .select('*, contact:contacts(id, first_name, last_name, phone, email)')
        .eq('inspection_id', inspectionId)
        .order('created_at', { ascending: true });

      if (attendeesError) throw attendeesError;

      set({
        activeInspection: data as Inspection,
        attendees: (attendees as InspectionAttendee[]) || [],
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch inspection';
      set({ error: message, isLoading: false });
    }
  },

  createInspection: async (inspection) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      if (isDemo) return null;

      const insertData: Record<string, unknown> = { ...inspection };
      if (teamId) insertData.team_id = teamId;
      if (!insertData.agent_id && userId) insertData.agent_id = userId;

      const { data, error } = await supabase
        .from('inspections')
        .insert(insertData)
        .select('*, property:properties(id, address, suburb)')
        .single();

      if (error) throw error;
      const newInspection = data as Inspection;
      set((state) => ({ inspections: [newInspection, ...state.inspections] }));
      return newInspection;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create inspection';
      set({ error: message });
      return null;
    }
  },

  updateInspection: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('inspections').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        inspections: state.inspections.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        activeInspection: state.activeInspection?.id === id ? { ...state.activeInspection, ...updates } : state.activeInspection,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update inspection';
      set({ error: message });
    }
  },

  startInspection: async (id) => {
    await get().updateInspection(id, { status: 'in_progress' as InspectionStatus });
  },

  completeInspection: async (id) => {
    await get().updateInspection(id, { status: 'completed' as InspectionStatus });
  },

  cancelInspection: async (id) => {
    await get().updateInspection(id, { status: 'cancelled' as InspectionStatus });
  },

  addAttendee: async (inspectionId, attendee) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return null;

      // Try to match existing contact by phone or email
      let contactId: string | null = null;
      if (attendee.phone || attendee.email) {
        let matchQuery = supabase.from('contacts').select('id').limit(1);
        if (teamId) matchQuery = matchQuery.eq('team_id', teamId);

        if (attendee.phone) {
          const { data: phoneMatch } = await matchQuery.eq('phone', attendee.phone);
          if (phoneMatch && phoneMatch.length > 0) {
            contactId = (phoneMatch[0] as { id: string }).id;
          }
        }

        if (!contactId && attendee.email) {
          let emailQuery = supabase.from('contacts').select('id').eq('email', attendee.email).limit(1);
          if (teamId) emailQuery = emailQuery.eq('team_id', teamId);
          const { data: emailMatch } = await emailQuery;
          if (emailMatch && emailMatch.length > 0) {
            contactId = (emailMatch[0] as { id: string }).id;
          }
        }
      }

      // If no match, create a new contact
      if (!contactId) {
        const newContact = await useCRMStore.getState().addContact({
          first_name: attendee.first_name,
          last_name: attendee.last_name || '',
          phone: attendee.phone || '',
          email: attendee.email || '',
          address: '',
        });
        if (newContact) contactId = newContact.id;
      }

      const { data, error } = await supabase
        .from('inspection_attendees')
        .insert({
          inspection_id: inspectionId,
          contact_id: contactId,
          first_name: attendee.first_name,
          last_name: attendee.last_name,
          phone: attendee.phone,
          email: attendee.email,
          source: attendee.source,
        })
        .select()
        .single();

      if (error) throw error;
      const newAttendee = data as InspectionAttendee;
      set((state) => ({ attendees: [...state.attendees, newAttendee] }));
      return newAttendee;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add attendee';
      set({ error: message });
      return null;
    }
  },

  updateAttendee: async (attendeeId, updates) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('inspection_attendees').update(updates).eq('id', attendeeId);
      if (error) throw error;

      set((state) => ({
        attendees: state.attendees.map((a) => (a.id === attendeeId ? { ...a, ...updates } : a)),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update attendee';
      set({ error: message });
    }
  },

  removeAttendee: async (attendeeId) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('inspection_attendees').delete().eq('id', attendeeId);
      if (error) throw error;

      set((state) => ({ attendees: state.attendees.filter((a) => a.id !== attendeeId) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove attendee';
      set({ error: message });
    }
  },

  clearActiveInspection: () => set({ activeInspection: null, attendees: [] }),
}));
