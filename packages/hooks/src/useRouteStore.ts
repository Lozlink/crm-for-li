import { create } from 'zustand';
import type { Route, RouteStop, StopStatus } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface RouteState {
  routes: Route[];
  activeRoute: Route | null;
  activeStops: RouteStop[];
  isLoading: boolean;
  error: string | null;

  fetchRoutes: () => Promise<void>;
  fetchRouteWithStops: (routeId: string) => Promise<void>;
  createRoute: (route: Omit<Route, 'id' | 'created_at' | 'updated_at'>, stops: Omit<RouteStop, 'id' | 'route_id'>[]) => Promise<Route | null>;
  updateRouteStatus: (routeId: string, status: Route['status']) => Promise<void>;
  updateStopStatus: (stopId: string, status: StopStatus, notes?: string) => Promise<void>;
  updateStopNotes: (stopId: string, notes: string) => Promise<void>;
  linkStopContact: (stopId: string, contactId: string) => Promise<void>;
  reorderStops: (routeId: string, stops: RouteStop[]) => Promise<void>;
  deleteRoute: (routeId: string) => Promise<void>;
  clearActiveRoute: () => void;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

export const useRouteStore = create<RouteState>()((set, get) => ({
  routes: [],
  activeRoute: null,
  activeStops: [],
  isLoading: false,
  error: null,

  fetchRoutes: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      let query = supabase
        .from('routes')
        .select('*, route_stops(count)')
        .order('created_at', { ascending: false });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) throw error;

      set({ routes: data || [], isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchRouteWithStops: async (routeId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      const { data: route, error: routeError } = await supabase
        .from('routes')
        .select('*')
        .eq('id', routeId)
        .single();

      if (routeError) throw routeError;

      const { data: stops, error: stopsError } = await supabase
        .from('route_stops')
        .select('*, contact:contacts(first_name, last_name, phone, address)')
        .eq('route_id', routeId)
        .order('position', { ascending: true });

      if (stopsError) throw stopsError;

      set({
        activeRoute: route,
        activeStops: stops || [],
        isLoading: false,
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createRoute: async (route, stops) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newRoute: Route = {
          ...route,
          id: generateUUID(),
          team_id: teamId || undefined,
          user_id: userId || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const newStops: RouteStop[] = stops.map((s, i) => ({
          ...s,
          id: generateUUID(),
          route_id: newRoute.id,
          position: i,
          status: 'pending' as const,
          team_id: teamId || undefined,
        }));
        newRoute.stops = newStops;
        set(state => ({
          routes: [newRoute, ...state.routes],
          isLoading: false,
        }));
        return newRoute;
      }

      const insertData: any = { ...route };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data: routeData, error: routeError } = await supabase
        .from('routes')
        .insert(insertData)
        .select()
        .single();

      if (routeError) throw routeError;

      const stopRows = stops.map((s, i) => ({
        ...s,
        route_id: routeData.id,
        position: i,
        status: 'pending',
        team_id: teamId,
      }));

      const { error: stopsError } = await supabase
        .from('route_stops')
        .insert(stopRows);

      if (stopsError) throw stopsError;

      set(state => ({
        routes: [routeData, ...state.routes],
        isLoading: false,
      }));
      return routeData;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  updateRouteStatus: async (routeId, status) => {
    try {
      const { isDemo } = getTeamContext();
      const updates: any = { status, updated_at: new Date().toISOString() };
      if (status === 'in_progress') updates.started_at = new Date().toISOString();
      if (status === 'completed') updates.completed_at = new Date().toISOString();

      if (isDemo) {
        set(state => ({
          routes: state.routes.map(r => r.id === routeId ? { ...r, ...updates } : r),
          activeRoute: state.activeRoute?.id === routeId ? { ...state.activeRoute, ...updates } : state.activeRoute,
        }));
        return;
      }

      const { error } = await supabase.from('routes').update(updates).eq('id', routeId);
      if (error) throw error;

      set(state => ({
        routes: state.routes.map(r => r.id === routeId ? { ...r, ...updates } : r),
        activeRoute: state.activeRoute?.id === routeId ? { ...state.activeRoute, ...updates } : state.activeRoute,
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  updateStopStatus: async (stopId, status, notes) => {
    try {
      const { isDemo } = getTeamContext();
      const updates: any = { status };
      if (status === 'visited') updates.visited_at = new Date().toISOString();
      if (notes !== undefined) updates.notes = notes;

      if (isDemo) {
        set(state => ({
          activeStops: state.activeStops.map(s => s.id === stopId ? { ...s, ...updates } : s),
        }));
        return;
      }

      const { error } = await supabase.from('route_stops').update(updates).eq('id', stopId);
      if (error) throw error;

      set(state => ({
        activeStops: state.activeStops.map(s => s.id === stopId ? { ...s, ...updates } : s),
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  updateStopNotes: async (stopId, notes) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          activeStops: state.activeStops.map(s => s.id === stopId ? { ...s, notes } : s),
        }));
        return;
      }

      const { error } = await supabase.from('route_stops').update({ notes }).eq('id', stopId);
      if (error) throw error;

      set(state => ({
        activeStops: state.activeStops.map(s => s.id === stopId ? { ...s, notes } : s),
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  linkStopContact: async (stopId, contactId) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          activeStops: state.activeStops.map(s => s.id === stopId ? { ...s, contact_id: contactId } : s),
        }));
        return;
      }

      const { error } = await supabase.from('route_stops').update({ contact_id: contactId }).eq('id', stopId);
      if (error) throw error;

      set(state => ({
        activeStops: state.activeStops.map(s => s.id === stopId ? { ...s, contact_id: contactId } : s),
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  reorderStops: async (routeId, stops) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set({ activeStops: stops });
        return;
      }

      for (let i = 0; i < stops.length; i++) {
        await supabase
          .from('route_stops')
          .update({ position: i })
          .eq('id', stops[i].id);
      }

      set({ activeStops: stops });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  deleteRoute: async (routeId) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set(state => ({
          routes: state.routes.filter(r => r.id !== routeId),
          activeRoute: state.activeRoute?.id === routeId ? null : state.activeRoute,
          activeStops: state.activeRoute?.id === routeId ? [] : state.activeStops,
        }));
        return;
      }

      const { error } = await supabase.from('routes').delete().eq('id', routeId);
      if (error) throw error;

      set(state => ({
        routes: state.routes.filter(r => r.id !== routeId),
        activeRoute: state.activeRoute?.id === routeId ? null : state.activeRoute,
        activeStops: state.activeRoute?.id === routeId ? [] : state.activeStops,
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  clearActiveRoute: () => set({ activeRoute: null, activeStops: [] }),
}));
