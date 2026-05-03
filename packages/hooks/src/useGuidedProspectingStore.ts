import { create } from 'zustand';
import type {
  GuidedStop,
  LeadScoreBreakdown,
  ProspectingOutcome,
} from '@realestate-crm/types';
import { haversineDistance, optimizeRoute } from '@realestate-crm/utils';
import type { RouteCandidate } from '@realestate-crm/utils';
import { isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';
import { useCRMStore } from './useCRMStore';
import { useTaskStore } from './useTaskStore';
import { useRouteStore } from './useRouteStore';
import { useTrackingStore } from './useTrackingStore';

interface GuidedProspectingState {
  isActive: boolean;
  stops: GuidedStop[];
  currentStopIndex: number;
  proximityAlertContactIds: string[];
  buildingCoverage: Map<string, { visited: number; total: number }>;

  startGuidedSession: (
    lat: number,
    lng: number,
    scoresMap: Map<string, LeadScoreBreakdown>,
    radiusMeters?: number,
    maxStops?: number,
  ) => void;
  addStop: (stop: GuidedStop) => void;
  removeStop: (contactId: string) => void;
  reorderStops: (fromIndex: number, toIndex: number) => void;
  completeStop: (contactId: string, outcome: ProspectingOutcome, notes?: string) => Promise<void>;
  skipStop: (contactId: string) => void;
  updateProximityAlerts: (lat: number, lng: number) => void;
  endGuidedSession: () => Promise<void>;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

function makeBuildingKey(lat: number, lng: number): string {
  return `${Math.round(lat * 10000)}:${Math.round(lng * 10000)}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  d.setHours(9, 0, 0, 0);
  return d;
}

// Demo mode mock stops
const DEMO_GUIDED_STOPS: GuidedStop[] = [
  {
    contactId: 'demo-contact-1',
    address: '42 Harbour Street, Sydney NSW 2000',
    latitude: -33.8688,
    longitude: 151.2093,
    scoreBreakdown: {
      contactId: 'demo-contact-1',
      total: 82,
      tier: 'hot',
      components: { staleness: 20, salesMomentum: 22, engagement: 18, streetConversion: 12, penetration: 10, buildingCoverage: 0 },
      lastComputedAt: new Date().toISOString(),
    },
    routePosition: 0,
    distanceFromPrev: 0,
    status: 'pending',
  },
  {
    contactId: 'demo-contact-2',
    address: '7 Ocean Road, Bondi Beach NSW 2026',
    latitude: -33.8915,
    longitude: 151.2767,
    scoreBreakdown: {
      contactId: 'demo-contact-2',
      total: 65,
      tier: 'warm',
      components: { staleness: 15, salesMomentum: 18, engagement: 14, streetConversion: 10, penetration: 8, buildingCoverage: 0 },
      lastComputedAt: new Date().toISOString(),
    },
    routePosition: 1,
    distanceFromPrev: 850,
    status: 'pending',
  },
  {
    contactId: 'demo-contact-3',
    address: '15 Crown Street, Surry Hills NSW 2010',
    latitude: -33.8830,
    longitude: 151.2130,
    scoreBreakdown: {
      contactId: 'demo-contact-3',
      total: 54,
      tier: 'warm',
      components: { staleness: 12, salesMomentum: 15, engagement: 12, streetConversion: 8, penetration: 7, buildingCoverage: 0 },
      lastComputedAt: new Date().toISOString(),
    },
    routePosition: 2,
    distanceFromPrev: 620,
    status: 'pending',
  },
];

export const useGuidedProspectingStore = create<GuidedProspectingState>()((set, get) => ({
  isActive: false,
  stops: [],
  currentStopIndex: 0,
  proximityAlertContactIds: [],
  buildingCoverage: new Map(),

  startGuidedSession: (lat, lng, scoresMap, radiusMeters = 2000, maxStops) => {
    const { isDemo } = getTeamContext();

    if (isDemo) {
      set({
        isActive: true,
        stops: DEMO_GUIDED_STOPS,
        currentStopIndex: 0,
        proximityAlertContactIds: [],
        buildingCoverage: new Map(),
      });
      return;
    }

    const contacts = useCRMStore.getState().contacts;

    // Filter contacts within radius with score >= 25
    const candidates: RouteCandidate[] = [];
    const scoresByContact = new Map<string, LeadScoreBreakdown>();

    for (const contact of contacts) {
      if (contact.latitude == null || contact.longitude == null) continue;
      const breakdown = scoresMap.get(contact.id);
      if (!breakdown || breakdown.total < 25) continue;

      const dist = haversineDistance(lat, lng, contact.latitude, contact.longitude);
      if (dist > radiusMeters) continue;

      candidates.push({
        id: contact.id,
        latitude: contact.latitude,
        longitude: contact.longitude,
        score: breakdown.total,
      });
      scoresByContact.set(contact.id, breakdown);
    }

    const optimized = optimizeRoute({ latitude: lat, longitude: lng }, candidates, maxStops);

    // Build GuidedStop[] from optimized order
    let prevLat = lat;
    let prevLng = lng;
    const stops: GuidedStop[] = [];

    for (let i = 0; i < optimized.orderedIds.length; i++) {
      const contactId = optimized.orderedIds[i];
      const contact = contacts.find(c => c.id === contactId);
      if (!contact || contact.latitude == null || contact.longitude == null) continue;

      const breakdown = scoresByContact.get(contactId);
      if (!breakdown) continue;

      const distFromPrev = haversineDistance(prevLat, prevLng, contact.latitude, contact.longitude);

      stops.push({
        contactId,
        address: contact.address || '',
        latitude: contact.latitude,
        longitude: contact.longitude,
        scoreBreakdown: breakdown,
        routePosition: i,
        distanceFromPrev: Math.round(distFromPrev),
        status: 'pending',
      });

      prevLat = contact.latitude;
      prevLng = contact.longitude;
    }

    // Initialize building coverage
    const buildingCoverage = new Map<string, { visited: number; total: number }>();
    for (const stop of stops) {
      const key = makeBuildingKey(stop.latitude, stop.longitude);
      const existing = buildingCoverage.get(key);
      if (existing) {
        existing.total += 1;
      } else {
        buildingCoverage.set(key, { visited: 0, total: 1 });
      }
    }

    set({
      isActive: true,
      stops,
      currentStopIndex: 0,
      proximityAlertContactIds: [],
      buildingCoverage,
    });
  },

  addStop: (stop) => {
    const state = get();
    // Avoid duplicate contactIds
    if (state.stops.some(s => s.contactId === stop.contactId)) return;
    const updatedStops = [...state.stops, { ...stop, routePosition: state.stops.length }];
    set({ stops: updatedStops });
  },

  removeStop: (contactId) => {
    const state = get();
    const updatedStops = state.stops
      .filter(s => s.contactId !== contactId)
      .map((s, i) => ({ ...s, routePosition: i }));
    // Adjust currentStopIndex if needed
    const newIndex = Math.min(state.currentStopIndex, Math.max(updatedStops.length - 1, 0));
    set({ stops: updatedStops, currentStopIndex: newIndex });
  },

  reorderStops: (fromIndex, toIndex) => {
    const state = get();
    const updatedStops = [...state.stops];
    const [moved] = updatedStops.splice(fromIndex, 1);
    updatedStops.splice(toIndex, 0, moved);
    // Recalculate routePosition
    const reindexed = updatedStops.map((s, i) => ({ ...s, routePosition: i }));
    set({ stops: reindexed });
  },

  completeStop: async (contactId, outcome, notes) => {
    const { isDemo } = getTeamContext();
    const now = new Date();

    // Update stop status
    const state = get();
    const stopIndex = state.stops.findIndex(s => s.contactId === contactId);
    if (stopIndex === -1) return;

    const stop = state.stops[stopIndex];
    const updatedStops = [...state.stops];
    updatedStops[stopIndex] = {
      ...stop,
      status: 'visited' as const,
      outcome,
      visitedAt: now.toISOString(),
    };

    // Update building coverage
    const buildingCoverage = new Map(state.buildingCoverage);
    const key = makeBuildingKey(stop.latitude, stop.longitude);
    const building = buildingCoverage.get(key);
    if (building) {
      buildingCoverage.set(key, { ...building, visited: building.visited + 1 });
    }

    // Advance currentStopIndex to next pending stop
    let nextIndex = state.currentStopIndex;
    for (let i = stopIndex + 1; i < updatedStops.length; i++) {
      if (updatedStops[i].status === 'pending') {
        nextIndex = i;
        break;
      }
    }

    set({
      stops: updatedStops,
      currentStopIndex: nextIndex,
      buildingCoverage,
    });

    // Log activity
    await useCRMStore.getState().addActivity({
      contact_id: contactId,
      type: 'note',
      content: `Guided prospecting: ${outcome}${notes ? ` — ${notes}` : ''}`,
      source: 'field',
    });

    // Handle outcome-specific follow-up actions
    if (outcome === 'not_interested') {
      await useCRMStore.getState().updateContact(contactId, {
        status: 'inactive',
        lead_score: 10,
      });
      return;
    }

    const contact = useCRMStore.getState().contacts.find(c => c.id === contactId);
    const contactName = contact
      ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      : 'Contact';

    const taskBase = {
      status: 'pending' as const,
      contact_id: contactId,
      team_id: isDemo ? undefined : getTeamContext().teamId || undefined,
      assigned_to: isDemo ? undefined : getTeamContext().userId || undefined,
    };

    switch (outcome) {
      case 'no_answer':
        await useTaskStore.getState().createTask({
          ...taskBase,
          title: `Follow up with ${contactName}`,
          type: 'follow_up',
          priority: 'normal',
          due_at: addDays(now, 2).toISOString(),
        });
        break;

      case 'voicemail':
        await useTaskStore.getState().createTask({
          ...taskBase,
          title: `Follow up with ${contactName}`,
          type: 'follow_up',
          priority: 'normal',
          due_at: addDays(now, 3).toISOString(),
        });
        break;

      case 'interested':
        await useTaskStore.getState().createTask({
          ...taskBase,
          title: `Book appraisal`,
          type: 'appointment',
          priority: 'high',
          due_at: addDays(now, 1).toISOString(),
        });
        break;

      case 'callback_requested':
        await useTaskStore.getState().createTask({
          ...taskBase,
          title: `Callback requested`,
          type: 'follow_up',
          priority: 'high',
          due_at: addDays(now, 1).toISOString(),
        });
        break;
    }
  },

  skipStop: (contactId) => {
    const state = get();
    const stopIndex = state.stops.findIndex(s => s.contactId === contactId);
    if (stopIndex === -1) return;

    const updatedStops = [...state.stops];
    updatedStops[stopIndex] = { ...updatedStops[stopIndex], status: 'skipped' };

    // Advance currentStopIndex to next pending stop
    let nextIndex = state.currentStopIndex;
    for (let i = stopIndex + 1; i < updatedStops.length; i++) {
      if (updatedStops[i].status === 'pending') {
        nextIndex = i;
        break;
      }
    }

    set({ stops: updatedStops, currentStopIndex: nextIndex });
  },

  updateProximityAlerts: (lat, lng) => {
    const contacts = useCRMStore.getState().contacts;
    const currentStopIds = new Set(get().stops.map(s => s.contactId));

    const nearbyIds: string[] = [];
    for (const contact of contacts) {
      if (contact.latitude == null || contact.longitude == null) continue;
      if ((contact.lead_score ?? 0) < 50) continue;
      if (currentStopIds.has(contact.id)) continue;

      const dist = haversineDistance(lat, lng, contact.latitude, contact.longitude);
      if (dist <= 100) {
        nearbyIds.push(contact.id);
      }
    }

    set({ proximityAlertContactIds: nearbyIds });
  },

  endGuidedSession: async () => {
    const state = get();
    if (!state.isActive) return;

    const visitedStops = state.stops.filter(s => s.status === 'visited');
    const skippedStops = state.stops.filter(s => s.status === 'skipped');
    const totalStops = state.stops.length;

    // Persist route via useRouteStore
    if (visitedStops.length > 0) {
      await useRouteStore.getState().createRoute(
        {
          name: `Guided Prospecting ${new Date().toLocaleDateString()}`,
          status: 'completed',
          mode: 'walking',
          estimated_duration_minutes: visitedStops.length * 2,
          completed_at: new Date().toISOString(),
        },
        visitedStops.map((stop, i) => ({
          contact_id: stop.contactId,
          address: stop.address,
          latitude: stop.latitude,
          longitude: stop.longitude,
          position: i,
          status: 'visited' as const,
          visited_at: stop.visitedAt,
        })),
      );
    }

    // Feed guided session data into the active tracking session as annotations
    const activeSession = useTrackingStore.getState().activeSession;
    if (activeSession) {
      const createAnnotation = useTrackingStore.getState().createAnnotation;

      // Summary annotation
      const outcomeCounts: Record<string, number> = {};
      for (const stop of visitedStops) {
        const key = stop.outcome || 'unknown';
        outcomeCounts[key] = (outcomeCounts[key] || 0) + 1;
      }
      const outcomeLines = Object.entries(outcomeCounts)
        .map(([outcome, count]) => `${outcome.replace(/_/g, ' ')}: ${count}`)
        .join(', ');

      const coverageEntries = Array.from(state.buildingCoverage.entries());
      const coverageLine = coverageEntries.length > 0
        ? `\nBuildings: ${coverageEntries.map(([, v]) => `${v.visited}/${v.total}`).join(', ')}`
        : '';

      const summaryNote = `📋 Guided Prospecting Summary\n` +
        `Stops: ${visitedStops.length} visited, ${skippedStops.length} skipped (${totalStops} planned)\n` +
        `Outcomes: ${outcomeLines}${coverageLine}`;

      // Create summary annotation at the centroid of visited stops
      if (visitedStops.length > 0) {
        const avgLat = visitedStops.reduce((sum, s) => sum + s.latitude, 0) / visitedStops.length;
        const avgLng = visitedStops.reduce((sum, s) => sum + s.longitude, 0) / visitedStops.length;

        await createAnnotation({
          session_id: activeSession.id,
          latitude: avgLat,
          longitude: avgLng,
          note: summaryNote,
        });
      }

      // Create individual annotations for each visited stop with outcome
      for (const stop of visitedStops) {
        const contact = useCRMStore.getState().contacts.find(c => c.id === stop.contactId);
        const contactName = contact
          ? `${contact.first_name} ${contact.last_name || ''}`.trim()
          : stop.address;
        const outcomeLabel = stop.outcome ? stop.outcome.replace(/_/g, ' ') : 'visited';

        await createAnnotation({
          session_id: activeSession.id,
          latitude: stop.latitude,
          longitude: stop.longitude,
          note: `🚪 ${contactName} — ${outcomeLabel} (score: ${stop.scoreBreakdown.total})`,
          contact_id: stop.contactId,
        });
      }
    }

    set({
      isActive: false,
      stops: [],
      currentStopIndex: 0,
      proximityAlertContactIds: [],
      buildingCoverage: new Map(),
    });
  },
}));
