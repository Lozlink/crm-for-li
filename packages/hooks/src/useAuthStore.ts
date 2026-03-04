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

// Track the auth subscription outside the store to prevent multiple listeners
let authSubscription: { unsubscribe: () => void } | null = null;

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

    // Safety timeout: if initialization hangs (e.g. Supabase auth lock
    // deadlock), force isLoading to false so the user isn't stuck forever.
    const timeout = setTimeout(() => {
      if (get().isLoading) {
        console.warn('Auth init timed out after 10s — forcing isLoading to false');
        set({ isLoading: false });
      }
    }, 10000);

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

      // Get session BEFORE setting up the auth listener to avoid
      // Supabase's internal auth lock contention. onAuthStateChange()
      // internally calls getSession() for the INITIAL_SESSION event;
      // calling apiGetSession() concurrently can deadlock on the same lock.
      const session = await apiGetSession();

      // Now set up auth listener for ongoing state changes
      if (!authSubscription) {
        const { data } = onAuthStateChange(async (event, newSession) => {
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
          } else if (event !== 'INITIAL_SESSION' && newSession?.user) {
            set({ session: newSession, user: newSession.user, isAuthenticated: true });

            // Recovery: if memberships haven't been loaded (e.g. init failed
            // due to expired token and Supabase later refreshed it), fetch now
            if (get().memberships.length === 0 && !get().activeTeam) {
              try {
                if (!get().profile) {
                  const profile = await apiGetProfile();
                  set({ profile });
                }
                await get().fetchMemberships();
                set({ authError: null });
              } catch {
                // Will retry on next auth state change
              }
            }
          }
        });
        authSubscription = data.subscription;
      }

      if (session?.user) {
        const profile = await apiGetProfile();
        set({
          session,
          user: session.user,
          profile,
          isAuthenticated: true,
        });

        // Fetch memberships — don't let failure skip the finally block
        // or leave user stuck on team-create with no recovery path
        try {
          await get().fetchMemberships();
        } catch (error: unknown) {
          console.error('Failed to fetch memberships during init:', error);
          // Auth listener above will retry when token refreshes
        }
      }
    } catch (error: unknown) {
      console.error('Auth init error:', error);
      const message = error instanceof Error ? error.message : 'Initialization failed';
      set({ authError: message });
    } finally {
      clearTimeout(timeout);
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
      console.error('Fetch team members error:', error?.message || error?.code || JSON.stringify(error));
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
