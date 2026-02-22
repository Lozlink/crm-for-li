import { create } from 'zustand';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TrackingSession, TrackingBreadcrumb, TrackingAnnotation } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID, encodePolyline } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

const TRACKING_TASK_NAME = 'background-location-tracking';
const BREADCRUMB_BUFFER_KEY = 'tracking_breadcrumbs_buffer';
const ACTIVE_SESSION_KEY = 'tracking_active_session_id';

interface TrackingState {
  activeSession: TrackingSession | null;
  sessions: TrackingSession[];
  annotations: TrackingAnnotation[];
  isLoading: boolean;
  error: string | null;

  startSession: () => Promise<void>;
  stopSession: () => Promise<TrackingSession | null>;
  fetchSessions: () => Promise<void>;
  fetchSessionBreadcrumbs: (sessionId: string) => Promise<TrackingBreadcrumb[]>;
  recoverOrphanedSession: () => Promise<void>;

  fetchAnnotations: (sessionId: string) => Promise<void>;
  createAnnotation: (annotation: { session_id: string; latitude: number; longitude: number; note: string }) => Promise<TrackingAnnotation | null>;
  updateAnnotation: (id: string, note: string) => Promise<void>;
  deleteAnnotation: (id: string) => Promise<void>;
  linkAnnotationContact: (id: string, contactId: string) => Promise<void>;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

TaskManager.defineTask(TRACKING_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    if (!locations || locations.length === 0) return;

    try {
      const existing = await AsyncStorage.getItem(BREADCRUMB_BUFFER_KEY);
      const buffer: TrackingBreadcrumb[] = existing ? JSON.parse(existing) : [];

      for (const loc of locations) {
        buffer.push({
          id: generateUUID(),
          session_id: '',
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          altitude: loc.coords.altitude ?? undefined,
          speed: loc.coords.speed ?? undefined,
          heading: loc.coords.heading ?? undefined,
          accuracy: loc.coords.accuracy ?? undefined,
          recorded_at: new Date(loc.timestamp).toISOString(),
        });
      }

      await AsyncStorage.setItem(BREADCRUMB_BUFFER_KEY, JSON.stringify(buffer));
    } catch (e) {
      console.error('Error buffering breadcrumb:', e);
    }
  }
});

export const useTrackingStore = create<TrackingState>()((set, get) => ({
  activeSession: null,
  sessions: [],
  annotations: [],
  isLoading: false,
  error: null,

  startSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
      if (fgStatus !== 'granted') throw new Error('Foreground location permission required');

      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      if (bgStatus !== 'granted') throw new Error('Background location permission required');

      await AsyncStorage.removeItem(BREADCRUMB_BUFFER_KEY);

      let session: TrackingSession;

      if (isDemo) {
        session = {
          id: generateUUID(),
          user_id: userId || undefined,
          team_id: teamId || undefined,
          status: 'active',
          started_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        };
      } else {
        const insertData: any = {
          status: 'active',
          started_at: new Date().toISOString(),
        };
        if (teamId) insertData.team_id = teamId;
        if (userId) insertData.user_id = userId;

        const { data, error } = await supabase
          .from('tracking_sessions')
          .insert(insertData)
          .select()
          .single();

        if (error) throw error;
        session = data;
      }

      await AsyncStorage.setItem(ACTIVE_SESSION_KEY, session.id);

      await Location.startLocationUpdatesAsync(TRACKING_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10000,
        distanceInterval: 10,
        deferredUpdatesInterval: 10000,
        pausesUpdatesAutomatically: true,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Tracking Active',
          notificationBody: 'Recording your location...',
          notificationColor: '#6200ee',
        },
      });

      set({ activeSession: session, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  stopSession: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      const { activeSession } = get();
      if (!activeSession) throw new Error('No active session');

      const isTracking = await TaskManager.isTaskRegisteredAsync(TRACKING_TASK_NAME);
      if (isTracking) {
        await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
      }

      const raw = await AsyncStorage.getItem(BREADCRUMB_BUFFER_KEY);
      const breadcrumbs: TrackingBreadcrumb[] = raw ? JSON.parse(raw) : [];

      breadcrumbs.sort((a, b) =>
        new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
      );

      let totalDistance = 0;
      for (let i = 1; i < breadcrumbs.length; i++) {
        totalDistance += haversineDistance(
          breadcrumbs[i - 1].latitude, breadcrumbs[i - 1].longitude,
          breadcrumbs[i].latitude, breadcrumbs[i].longitude
        );
      }

      const polyline = breadcrumbs.length > 0
        ? encodePolyline(breadcrumbs.map(b => ({
            latitude: b.latitude,
            longitude: b.longitude,
          })))
        : undefined;

      const now = new Date().toISOString();
      const durationSeconds = Math.round(
        (new Date(now).getTime() - new Date(activeSession.started_at).getTime()) / 1000
      );

      const updates = {
        status: 'completed' as const,
        completed_at: now,
        total_distance_meters: Math.round(totalDistance),
        duration_seconds: durationSeconds,
        polyline,
      };

      const completedSession: TrackingSession = { ...activeSession, ...updates };

      if (!isDemo) {
        const { error: updateError } = await supabase
          .from('tracking_sessions')
          .update(updates)
          .eq('id', activeSession.id);

        if (updateError) throw updateError;

        if (breadcrumbs.length > 0) {
          const rows = breadcrumbs.map(b => ({
            session_id: activeSession.id,
            latitude: b.latitude,
            longitude: b.longitude,
            altitude: b.altitude,
            speed: b.speed,
            heading: b.heading,
            accuracy: b.accuracy,
            recorded_at: b.recorded_at,
          }));

          for (let i = 0; i < rows.length; i += 500) {
            const batch = rows.slice(i, i + 500);
            const { error: insertError } = await supabase
              .from('tracking_breadcrumbs')
              .insert(batch);
            if (insertError) throw insertError;
          }
        }
      }

      await AsyncStorage.removeItem(BREADCRUMB_BUFFER_KEY);
      await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);

      set({
        activeSession: null,
        isLoading: false,
        sessions: [completedSession, ...get().sessions],
      });

      return completedSession;
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
      return null;
    }
  },

  fetchSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      let query = supabase
        .from('tracking_sessions')
        .select('*')
        .eq('status', 'completed')
        .order('started_at', { ascending: false });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) throw error;

      set({ sessions: data || [], isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchSessionBreadcrumbs: async (sessionId: string) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return [];

      const { data, error } = await supabase
        .from('tracking_breadcrumbs')
        .select('*')
        .eq('session_id', sessionId)
        .order('recorded_at', { ascending: true });

      if (error) throw error;
      return data || [];
    } catch (error: any) {
      console.error('Error fetching breadcrumbs:', error);
      return [];
    }
  },

  recoverOrphanedSession: async () => {
    try {
      const sessionId = await AsyncStorage.getItem(ACTIVE_SESSION_KEY);
      if (!sessionId) return;

      const isTracking = await TaskManager.isTaskRegisteredAsync(TRACKING_TASK_NAME);

      if (isTracking) {
        const { isDemo } = getTeamContext();
        if (isDemo) return;

        const { data, error } = await supabase
          .from('tracking_sessions')
          .select('*')
          .eq('id', sessionId)
          .single();

        if (!error && data && data.status === 'active') {
          set({ activeSession: data });
          return;
        }
      }

      try {
        await Location.stopLocationUpdatesAsync(TRACKING_TASK_NAME);
      } catch {}

      await AsyncStorage.removeItem(BREADCRUMB_BUFFER_KEY);
      await AsyncStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch (e) {
      console.error('Error recovering tracking session:', e);
    }
  },

  fetchAnnotations: async (sessionId: string) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set({ annotations: [] });
        return;
      }

      const { data, error } = await supabase
        .from('tracking_annotations')
        .select('*, contact:contacts(id, first_name, last_name, address)')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      set({ annotations: data || [] });
    } catch (error: any) {
      console.error('Error fetching annotations:', error);
      set({ annotations: [] });
    }
  },

  createAnnotation: async (annotation) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newAnnotation: TrackingAnnotation = {
          id: generateUUID(),
          ...annotation,
          user_id: userId || undefined,
          team_id: teamId || undefined,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set({ annotations: [...get().annotations, newAnnotation] });
        return newAnnotation;
      }

      const insertData: any = { ...annotation };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data, error } = await supabase
        .from('tracking_annotations')
        .insert(insertData)
        .select('*, contact:contacts(id, first_name, last_name, address)')
        .single();

      if (error) throw error;
      set({ annotations: [...get().annotations, data] });
      return data;
    } catch (error: any) {
      console.error('Error creating annotation:', error);
      return null;
    }
  },

  updateAnnotation: async (id: string, note: string) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set({
          annotations: get().annotations.map((a) =>
            a.id === id ? { ...a, note, updated_at: new Date().toISOString() } : a
          ),
        });
        return;
      }

      const { error } = await supabase
        .from('tracking_annotations')
        .update({ note, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      set({
        annotations: get().annotations.map((a) =>
          a.id === id ? { ...a, note, updated_at: new Date().toISOString() } : a
        ),
      });
    } catch (error: any) {
      console.error('Error updating annotation:', error);
    }
  },

  deleteAnnotation: async (id: string) => {
    try {
      const { isDemo } = getTeamContext();

      if (!isDemo) {
        const { error } = await supabase
          .from('tracking_annotations')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }

      set({ annotations: get().annotations.filter((a) => a.id !== id) });
    } catch (error: any) {
      console.error('Error deleting annotation:', error);
    }
  },

  linkAnnotationContact: async (id: string, contactId: string) => {
    try {
      const { isDemo } = getTeamContext();

      if (!isDemo) {
        const { error } = await supabase
          .from('tracking_annotations')
          .update({ contact_id: contactId, updated_at: new Date().toISOString() })
          .eq('id', id);
        if (error) throw error;
      }

      set({
        annotations: get().annotations.map((a) =>
          a.id === id ? { ...a, contact_id: contactId, updated_at: new Date().toISOString() } : a
        ),
      });
    } catch (error: any) {
      console.error('Error linking annotation contact:', error);
    }
  },
}));
