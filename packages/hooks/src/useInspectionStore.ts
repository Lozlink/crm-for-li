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

  fetchInspections: (propertyId?: string, includeAttendees?: boolean) => Promise<void>;
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
  linkAttendeeToContact: (attendeeId: string, contactId: string) => Promise<void>;
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

const upcomingDate = new Date();
upcomingDate.setDate(upcomingDate.getDate() + 2);
upcomingDate.setHours(10, 0, 0, 0);

const pastDate = new Date();
pastDate.setDate(pastDate.getDate() - 3);
pastDate.setHours(14, 0, 0, 0);

const DEMO_INSPECTIONS: Inspection[] = [
  {
    id: 'demo-insp-1',
    property_id: 'demo-prop-1',
    scheduled_at: upcomingDate.toISOString(),
    duration_minutes: 30,
    type: 'open_home',
    status: 'scheduled',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    property: {
      id: 'demo-prop-1',
      address: '42 Harbour Street',
      suburb: 'Sydney',
    } as Inspection['property'],
  },
  {
    id: 'demo-insp-2',
    property_id: 'demo-prop-2',
    scheduled_at: pastDate.toISOString(),
    duration_minutes: 45,
    type: 'private',
    status: 'completed',
    created_at: pastDate.toISOString(),
    updated_at: pastDate.toISOString(),
    property: {
      id: 'demo-prop-2',
      address: '7 Ocean Road',
      suburb: 'Bondi Beach',
    } as Inspection['property'],
  },
];

const DEMO_ATTENDEES: InspectionAttendee[] = [
  {
    id: 'demo-att-1',
    inspection_id: 'demo-insp-2',
    contact_id: 'demo-contact-1',
    first_name: 'Sarah',
    last_name: 'Chen',
    phone: '0412 345 678',
    email: 'sarah.chen@example.com',
    source: 'registered',
    interest_level: 'hot',
    created_at: pastDate.toISOString(),
  },
  {
    id: 'demo-att-2',
    inspection_id: 'demo-insp-2',
    first_name: 'James',
    last_name: 'Wilson',
    phone: '0423 456 789',
    source: 'walk_in',
    interest_level: 'warm',
    created_at: pastDate.toISOString(),
  },
  {
    id: 'demo-att-3',
    inspection_id: 'demo-insp-2',
    first_name: 'Mei',
    last_name: 'Tan',
    email: 'mei.tan@example.com',
    source: 'invited',
    interest_level: 'cold',
    created_at: pastDate.toISOString(),
  },
];

export const useInspectionStore = create<InspectionState>()((set, get) => ({
  inspections: [],
  activeInspection: null,
  attendees: [],
  upcomingInspections: [],
  isLoading: false,
  error: null,

  fetchInspections: async (propertyId, includeAttendees) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        const filtered = propertyId
          ? DEMO_INSPECTIONS.filter((i) => i.property_id === propertyId)
          : DEMO_INSPECTIONS;
        const inspections = includeAttendees
          ? filtered.map((i) => ({
              ...i,
              attendees: DEMO_ATTENDEES.filter((a) => a.inspection_id === i.id),
            }))
          : filtered;
        set({ inspections, isLoading: false });
        return;
      }

      const selectFields = includeAttendees
        ? '*, property:properties(id, address, suburb), attendees:inspection_attendees(id, first_name, last_name, interest_level, source, phone, email, contact_id)'
        : '*, property:properties(id, address, suburb), attendees:inspection_attendees(count)';

      let query = supabase
        .from('inspections')
        .select(selectFields)
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
      if (isDemo) {
        set({
          upcomingInspections: DEMO_INSPECTIONS.filter((i) => i.status === 'scheduled'),
          isLoading: false,
        });
        return;
      }

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
      if (isDemo) {
        const inspection = DEMO_INSPECTIONS.find((i) => i.id === inspectionId) || null;
        const attendeeList = DEMO_ATTENDEES.filter((a) => a.inspection_id === inspectionId);
        set({ activeInspection: inspection, attendees: attendeeList, isLoading: false });
        return;
      }

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

  linkAttendeeToContact: async (attendeeId, contactId) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set((state) => ({
          attendees: state.attendees.map((a) =>
            a.id === attendeeId ? { ...a, contact_id: contactId } : a
          ),
        }));
        return;
      }

      const { error } = await supabase
        .from('inspection_attendees')
        .update({ contact_id: contactId })
        .eq('id', attendeeId);

      if (error) throw error;

      set((state) => ({
        attendees: state.attendees.map((a) =>
          a.id === attendeeId ? { ...a, contact_id: contactId } : a
        ),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to link attendee to contact';
      set({ error: message });
    }
  },

  clearActiveInspection: () => set({ activeInspection: null, attendees: [] }),
}));
