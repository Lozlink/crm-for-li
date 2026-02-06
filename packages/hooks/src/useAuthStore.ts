import { create } from 'zustand';
import { storage } from '@realestate-crm/utils';
import type { UserProfile, Team, Membership, TeamRole, Permission } from '@realestate-crm/types';
import { hasRole as checkRole, hasPermission as checkPermission } from '@realestate-crm/types';
import {
  isDemoMode,
  generateUUID,
  signUp as apiSignUp,
  signIn as apiSignIn,
  signOut as apiSignOut,
  resetPassword as apiResetPassword,
  getSession as apiGetSession,
  getProfile as apiGetProfile,
  onAuthStateChange,
  fetchUserTeams as apiFetchUserTeams,
  fetchTeamMembers as apiFetchTeamMembers,
  createTeam as apiCreateTeam,
  switchActiveTeam as apiSwitchActiveTeam,
} from '@realestate-crm/api';

interface AuthState {
  // Auth
  session: any | null;
  user: any | null;
  profile: UserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  authError: string | null;
  isDemoMode: boolean;

  // Team
  activeTeam: Team | null;
  activeRole: TeamRole | null;
  memberships: Membership[];
  teamMembers: Membership[];

  // Actions
  initialize: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  fetchMemberships: () => Promise<void>;
  switchTeam: (teamId: string) => Promise<void>;
  createTeam: (name: string, slug: string) => Promise<Team>;
  fetchTeamMembers: (teamId: string) => Promise<void>;
  setAuthError: (error: string | null) => void;

  // Computed
  hasPermission: (permission: Permission) => boolean;
  hasRole: (requiredRole: TeamRole) => boolean;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  session: null,
  user: null,
  profile: null,
  isAuthenticated: false,
  isLoading: true,
  authError: null,
  isDemoMode: false,

  activeTeam: null,
  activeRole: null,
  memberships: [],
  teamMembers: [],

  setAuthError: (authError) => set({ authError }),

  initialize: async () => {
    set({ isLoading: true, authError: null });
    try {
      // Check if user was in demo mode
      const demoFlag = await storage.getItem('demo-mode');
      if (demoFlag === 'true') {
        set({ isDemoMode: true, isAuthenticated: false, isLoading: false });
        return;
      }

      if (isDemoMode) {
        set({ isLoading: false });
        return;
      }

      const session = await apiGetSession();
      if (session?.user) {
        const profile = await apiGetProfile();
        set({
          session,
          user: session.user,
          profile,
          isAuthenticated: true,
        });

        // Fetch memberships and set active team
        await get().fetchMemberships();
      }

      // Listen for auth changes
      onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT') {
          set({
            session: null,
            user: null,
            profile: null,
            isAuthenticated: false,
            activeTeam: null,
            activeRole: null,
            memberships: [],
            teamMembers: [],
          });
        } else if (session?.user) {
          set({ session, user: session.user, isAuthenticated: true });
        }
      });
    } catch (error: any) {
      console.error('Auth init error:', error);
      set({ authError: error.message });
    } finally {
      set({ isLoading: false });
    }
  },

  signUp: async (email, password, displayName) => {
    set({ isLoading: true, authError: null });
    try {
      await apiSignUp(email, password, displayName);
      // After signup, sign in automatically
      const { session, user } = await apiSignIn(email, password);
      const profile = await apiGetProfile();
      set({
        session,
        user,
        profile,
        isAuthenticated: true,
        isDemoMode: false,
      });
      await storage.removeItem('demo-mode');
      await get().fetchMemberships();
      set({ isLoading: false });
    } catch (error: any) {
      set({ authError: error.message, isLoading: false });
      throw error;
    }
  },

  signIn: async (email, password) => {
    set({ isLoading: true, authError: null });
    try {
      const { session, user } = await apiSignIn(email, password);
      const profile = await apiGetProfile();
      set({
        session,
        user,
        profile,
        isAuthenticated: true,
        isDemoMode: false,
      });
      await storage.removeItem('demo-mode');
      try {
        await get().fetchMemberships();
      } catch {
        // fetchMemberships failed but auth succeeded — still let user in.
        // They'll see team create screen but authError will explain why.
      }
      set({ isLoading: false });
    } catch (error: any) {
      set({ authError: error.message, isLoading: false });
      throw error;
    }
  },

  signOut: async () => {
    set({ isLoading: true });
    try {
      if (!get().isDemoMode) {
        await apiSignOut();
      }
      await storage.removeItem('demo-mode');
      set({
        session: null,
        user: null,
        profile: null,
        isAuthenticated: false,
        isLoading: false,
        isDemoMode: false,
        activeTeam: null,
        activeRole: null,
        memberships: [],
        teamMembers: [],
      });
    } catch (error: any) {
      set({ authError: error.message, isLoading: false });
    }
  },

  resetPassword: async (email) => {
    set({ isLoading: true, authError: null });
    try {
      await apiResetPassword(email);
      set({ isLoading: false });
    } catch (error: any) {
      set({ authError: error.message, isLoading: false });
      throw error;
    }
  },

  enterDemoMode: () => {
    storage.setItem('demo-mode', 'true');
    set({ isDemoMode: true, isAuthenticated: false, isLoading: false });
  },

  exitDemoMode: () => {
    storage.removeItem('demo-mode');
    set({ isDemoMode: false });
  },

  fetchMemberships: async () => {
    try {
      const memberships = await apiFetchUserTeams();
      set({ memberships });

      // Set active team from profile or first membership
      const { profile } = get();
      let activeTeam: Team | null = null;
      let activeRole: TeamRole | null = null;

      if (profile?.active_team_id) {
        const activeMembership = memberships.find(m => m.team_id === profile.active_team_id);
        if (activeMembership?.team) {
          activeTeam = activeMembership.team;
          activeRole = activeMembership.role;
        }
      }

      // Fallback to first membership
      if (!activeTeam && memberships.length > 0 && memberships[0].team) {
        activeTeam = memberships[0].team;
        activeRole = memberships[0].role;
      }

      set({ activeTeam, activeRole });
    } catch (error: any) {
      console.error('Fetch memberships error:', error);
      set({ authError: `Failed to load teams: ${error.message}` });
      throw error;
    }
  },

  switchTeam: async (teamId) => {
    try {
      await apiSwitchActiveTeam(teamId);
      const { memberships } = get();
      const membership = memberships.find(m => m.team_id === teamId);
      set({
        activeTeam: membership?.team || null,
        activeRole: membership?.role || null,
        profile: get().profile ? { ...get().profile!, active_team_id: teamId } : null,
      });
    } catch (error: any) {
      set({ authError: error.message });
    }
  },

  createTeam: async (name, slug) => {
    try {
      const team = await apiCreateTeam(name, slug);
      // Refresh memberships to include the new team
      await get().fetchMemberships();
      // Switch to the new team
      set({
        activeTeam: team,
        activeRole: 'owner',
        profile: get().profile ? { ...get().profile!, active_team_id: team.id } : null,
      });
      return team;
    } catch (error: any) {
      set({ authError: error.message });
      throw error;
    }
  },

  fetchTeamMembers: async (teamId) => {
    try {
      const teamMembers = await apiFetchTeamMembers(teamId);
      set({ teamMembers });
    } catch (error: any) {
      console.error('Fetch team members error:', error);
    }
  },

  hasPermission: (permission) => {
    const { activeRole, isDemoMode: demo } = get();
    if (demo) return true; // Demo mode: full access
    if (!activeRole) return false;
    return checkPermission(activeRole, permission);
  },

  hasRole: (requiredRole) => {
    const { activeRole, isDemoMode: demo } = get();
    if (demo) return true;
    if (!activeRole) return false;
    return checkRole(activeRole, requiredRole);
  },
}));
