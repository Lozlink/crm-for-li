import { create } from 'zustand';
import type { Organisation, OrganisationMembership, OrgRole, Team } from '@realestate-crm/types';
import { supabase, isDemoMode } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface OrganisationState {
  organisations: Organisation[];
  activeOrganisation: Organisation | null;
  orgMemberships: OrganisationMembership[];
  orgTeams: Team[];
  isLoading: boolean;
  error: string | null;

  fetchUserOrgs: () => Promise<void>;
  createOrg: (name: string) => Promise<Organisation | null>;
  updateOrg: (id: string, updates: Partial<Organisation>) => Promise<void>;
  addTeamToOrg: (orgId: string, teamId: string) => Promise<void>;
  fetchOrgTeams: (orgId: string) => Promise<void>;
  inviteToOrg: (orgId: string, userId: string, role: OrgRole) => Promise<void>;
  removeFromOrg: (orgId: string, userId: string) => Promise<void>;
  setActiveOrganisation: (org: Organisation | null) => void;
}

function getContext() {
  const authState = useAuthStore.getState();
  return {
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

export const useOrganisationStore = create<OrganisationState>()((set, get) => ({
  organisations: [],
  activeOrganisation: null,
  orgMemberships: [],
  orgTeams: [],
  isLoading: false,
  error: null,

  fetchUserOrgs: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, userId } = getContext();
      if (isDemo || !userId) {
        set({ isLoading: false });
        return;
      }

      const { data: memberships, error: memError } = await supabase
        .from('organisation_memberships')
        .select('*, organisation:organisations(*)')
        .eq('user_id', userId);

      if (memError) throw memError;

      const orgs = (memberships || [])
        .map((m: OrganisationMembership) => m.organisation)
        .filter(Boolean) as Organisation[];

      set({
        organisations: orgs,
        orgMemberships: (memberships as OrganisationMembership[]) || [],
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch organisations';
      set({ error: message, isLoading: false });
    }
  },

  createOrg: async (name) => {
    try {
      const { isDemo, userId } = getContext();
      if (isDemo || !userId) return null;

      const { data, error } = await supabase
        .from('organisations')
        .insert({ name, owner_id: userId })
        .select()
        .single();

      if (error) throw error;
      const newOrg = data as Organisation;

      // Auto-create org_admin membership
      await supabase
        .from('organisation_memberships')
        .insert({ user_id: userId, organisation_id: newOrg.id, role: 'org_admin' });

      // Link current team if available
      const activeTeam = useAuthStore.getState().activeTeam;
      if (activeTeam) {
        await supabase.from('teams').update({ organisation_id: newOrg.id }).eq('id', activeTeam.id);
      }

      set((state) => ({ organisations: [newOrg, ...state.organisations] }));
      return newOrg;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create organisation';
      set({ error: message });
      return null;
    }
  },

  updateOrg: async (id, updates) => {
    try {
      const { isDemo } = getContext();
      if (isDemo) return;

      const { error } = await supabase.from('organisations').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        organisations: state.organisations.map((o) => (o.id === id ? { ...o, ...updates } : o)),
        activeOrganisation:
          state.activeOrganisation?.id === id
            ? { ...state.activeOrganisation, ...updates }
            : state.activeOrganisation,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update organisation';
      set({ error: message });
    }
  },

  addTeamToOrg: async (orgId, teamId) => {
    try {
      const { isDemo } = getContext();
      if (isDemo) return;

      const { error } = await supabase.from('teams').update({ organisation_id: orgId }).eq('id', teamId);
      if (error) throw error;

      // Refresh org teams
      await get().fetchOrgTeams(orgId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add team to organisation';
      set({ error: message });
    }
  },

  fetchOrgTeams: async (orgId) => {
    try {
      const { isDemo } = getContext();
      if (isDemo) return;

      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('organisation_id', orgId)
        .order('name');

      if (error) throw error;
      set({ orgTeams: (data as Team[]) || [] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch org teams';
      set({ error: message });
    }
  },

  inviteToOrg: async (orgId, userId, role) => {
    try {
      const { isDemo } = getContext();
      if (isDemo) return;

      const { error } = await supabase
        .from('organisation_memberships')
        .insert({ user_id: userId, organisation_id: orgId, role });

      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to invite to organisation';
      set({ error: message });
    }
  },

  removeFromOrg: async (orgId, userId) => {
    try {
      const { isDemo } = getContext();
      if (isDemo) return;

      const { error } = await supabase
        .from('organisation_memberships')
        .delete()
        .eq('organisation_id', orgId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove from organisation';
      set({ error: message });
    }
  },

  setActiveOrganisation: (org) => set({ activeOrganisation: org }),
}));
