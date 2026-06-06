/**
 * Compliance Suite store — IntelliCompli AML/CTF integration.
 *
 * Follows the same patterns as useTaskStore / useDeclaredBuildingsStore:
 *  - `getTeamContext()` reads auth state to determine demo vs. real mode
 *  - cross-store calls via `useXxxStore.getState()` (never hooks inside actions)
 *  - demo-mode branch in every action so the full UI flow works without network
 *
 * Suite opt-in is persisted locally per team via @realestate-crm/utils storage
 * (key `complianceSuite:v1:{teamId}`). `suiteEnabled && (real creds OR mock mode)`
 * means `isConfigured` is true so the compliance UI surfaces.
 */

import { create } from 'zustand';
import type { Contact } from '@realestate-crm/types';
import type {
  ComplianceProfile,
  ComplianceAlert,
  ComplianceAlertStatus,
  ComplianceAnalytics,
  ComplianceScreeningKind,
  ComplianceScreeningResult,
} from '@realestate-crm/types';
import {
  isIntelliCompliConfigured,
  getIntelliCompliMode,
  setIntelliCompliCredentials,
  clearIntelliCompliCredentials,
  setRuntimeApiKey,
  createComplianceCustomer,
  getComplianceCustomer,
  screenCustomer,
  assessCustomerRisk,
  listComplianceAlerts,
  updateComplianceAlert,
  getComplianceAnalytics,
  ComplianceValidationError,
} from '@realestate-crm/api';
import { supabase, isDemoMode } from '@realestate-crm/api';
import { storage } from '@realestate-crm/utils';
import { useAuthStore } from './useAuthStore';
import { useTaskStore } from './useTaskStore';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

// Finding 7: when teamId is null (demo mode / no active team) use the literal string
// 'demo' as the storage key segment so writers and readers always agree.
function resolvedTeamId(teamId: string | null): string {
  return teamId ?? 'demo';
}

function suitePreferenceKey(teamId: string): string {
  return `complianceSuite:v1:${teamId}`;
}

/** Tomorrow at 09:00 local time as ISO string. Used for auto-created task due dates. */
function tomorrowAt9(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// State interface — FROZEN CONTRACT (mobile-ui builds against this)
// ---------------------------------------------------------------------------

export interface ComplianceStoreState {
  suiteEnabled: boolean;
  setSuiteEnabled: (enabled: boolean) => Promise<void>;
  loadSuitePreference: (teamId: string) => Promise<void>;

  // True when the suite is enabled and the client is usable (real creds OR mock mode)
  isConfigured: boolean;

  // Runtime API key — allows the settings screen to inject a key without a restart.
  // Persisted in local storage under the same team key space.
  /** Whether a non-empty API key is currently configured (real or injected). */
  apiKeySet: boolean;
  /** Masked hint of the active key, e.g. "sk-…abc123" (last 6 chars visible). */
  apiKeyHint: string;
  /** 'live' when apiKeySet is true; 'mock' otherwise. */
  mode: 'live' | 'mock';
  /** Inject an API key at runtime; pass null or '' to clear and revert to mock mode. */
  setApiKey: (key: string | null) => Promise<void>;

  profilesByContactId: Record<string, ComplianceProfile>;
  alerts: ComplianceAlert[];
  analytics: ComplianceAnalytics | null;

  profileLoading: Record<string, boolean>;
  alertsLoading: boolean;
  analyticsLoading: boolean;

  // Actions
  enableCompliance: (contact: Contact) => Promise<ComplianceProfile | null>;
  refreshProfile: (contactId: string) => Promise<void>;
  runScreening: (contactId: string, kind: ComplianceScreeningKind) => Promise<ComplianceScreeningResult | null>;
  assessRisk: (contactId: string) => Promise<void>;
  fetchAlerts: () => Promise<void>;
  resolveAlert: (alertId: string, resolutionType: 'resolved' | 'dismissed' | 'false_positive', notes?: string) => Promise<void>;
  updateAlertStatus: (alertId: string, status: ComplianceAlertStatus) => Promise<void>;
  escalateAlert: (alertId: string, reason: string) => Promise<void>;
  fetchAnalytics: () => Promise<void>;
  hydrateProfiles: (contacts: Contact[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

/** Storage key for the runtime API key (per team, so different teams can have separate configs). */
function apiKeyStorageKey(teamId: string): string {
  return `complianceSuite:v1:${teamId}:apiKey`;
}

/** Produce a masked display hint from a raw key — shows last 6 chars only. */
function maskApiKey(key: string): string {
  if (key.length <= 6) return '••••••';
  return `••••••…${key.slice(-6)}`;
}

export const useComplianceStore = create<ComplianceStoreState>()((set, get) => ({
  suiteEnabled: false,
  isConfigured: false,

  apiKeySet: isIntelliCompliConfigured(),
  apiKeyHint: '',
  mode: isIntelliCompliConfigured() ? 'live' : 'mock',

  profilesByContactId: {},
  alerts: [],
  analytics: null,

  profileLoading: {},
  alertsLoading: false,
  analyticsLoading: false,

  // -------------------------------------------------------------------------
  // Opt-in persistence
  // -------------------------------------------------------------------------

  loadSuitePreference: async (teamId) => {
    try {
      const tid = resolvedTeamId(teamId);
      const [rawEnabled, storedKey] = await Promise.all([
        storage.getItem(suitePreferenceKey(tid)),
        storage.getItem(apiKeyStorageKey(tid)),
      ]);
      const enabled = rawEnabled === 'true';

      // Finding 3: always clear the previous team's runtime credentials before
      // re-injecting, regardless of whether the new team has a stored key.
      // Without this, switching from a team with a saved key to one without leaves
      // the previous team's key active (UI says Connected, queries wrong tenant).
      clearIntelliCompliCredentials();

      // Restore this team's persisted runtime API key (if any).
      if (storedKey && storedKey.length > 0) {
        setIntelliCompliCredentials(storedKey);
      }

      const apiKeySet = isIntelliCompliConfigured();
      // Finding 5: isConfigured is true when the suite is enabled regardless of key
      // presence (mock mode is always available).
      const configured = enabled; // mock always available; live mode if apiKeySet
      set({
        suiteEnabled: enabled,
        isConfigured: configured,
        apiKeySet,
        apiKeyHint: apiKeySet && storedKey ? maskApiKey(storedKey) : '',
        mode: getIntelliCompliMode(),
        // Finding 3: clear ALL derived compliance state on team switch — stale profiles,
        // alerts, analytics, and loading flags from the previous team must not bleed through.
        profilesByContactId: {},
        profileLoading: {},
        alerts: [],
        analytics: null,
      });
    } catch (err) {
      console.warn('useComplianceStore.loadSuitePreference failed:', err instanceof Error ? err.message : String(err));
    }
  },

  setSuiteEnabled: async (enabled) => {
    const { teamId } = getTeamContext();
    try {
      // Finding 7: always write with a resolved key so demo-mode writes land at 'demo'
      // rather than the string 'null' which the reader never looks up.
      await storage.setItem(suitePreferenceKey(resolvedTeamId(teamId)), String(enabled));
      // Finding 5: mock is always available — enabled alone is sufficient for isConfigured.
      set({ suiteEnabled: enabled, isConfigured: enabled });
    } catch (err) {
      console.warn('useComplianceStore.setSuiteEnabled failed:', err instanceof Error ? err.message : String(err));
    }
  },

  setApiKey: async (key) => {
    const { teamId } = getTeamContext();
    const trimmed = (key ?? '').trim();
    try {
      // Persist the key locally so it survives app restarts within the same device.
      // Finding 7: use resolvedTeamId so demo-mode writes land at 'demo' not 'null'.
      // TODO: upgrade to expo-secure-store for encrypted key storage once an EAS
      // rebuild is scheduled — AsyncStorage stores in plaintext on the device.
      await storage.setItem(apiKeyStorageKey(resolvedTeamId(teamId)), trimmed);

      const prevMode = get().mode;

      // Inject credentials into the client (or clear to revert to mock transport).
      if (trimmed.length > 0) {
        setIntelliCompliCredentials(trimmed);
      } else {
        clearIntelliCompliCredentials();
      }

      const apiKeySet = isIntelliCompliConfigured();
      const newMode = getIntelliCompliMode();
      const modeChanged = prevMode !== newMode;

      set({
        apiKeySet,
        apiKeyHint: apiKeySet ? maskApiKey(trimmed) : '',
        mode: newMode,
        // Finding 5: mock always available — suite enabled is sufficient for isConfigured.
        isConfigured: get().suiteEnabled,
        // Finding 4: clear stale derived data on any effective mode change so mock
        // profiles/alerts never persist into live mode (and vice versa). Clear profileLoading
        // too — stale spinners from the old mode are meaningless after a transport swap.
        ...(modeChanged ? { profilesByContactId: {}, profileLoading: {}, alerts: [], analytics: null } : {}),
      });

      // Re-fetch against the new transport. Fire-and-forget; loading flags update UI.
      if (get().suiteEnabled) {
        void get().fetchAnalytics();
        void get().fetchAlerts();
      }
    } catch (err) {
      console.warn('useComplianceStore.setApiKey failed:', err instanceof Error ? err.message : String(err));
    }
  },

  // -------------------------------------------------------------------------
  // Enable compliance for a single contact
  // Creates the IntelliCompli customer, runs an initial sanctions screen,
  // then writes intellicompli_customer_id back to the contacts row.
  // -------------------------------------------------------------------------

  enableCompliance: async (contact) => {
    const { isDemo, teamId, userId } = getTeamContext();

    set(state => ({
      profileLoading: { ...state.profileLoading, [contact.id]: true },
    }));

    try {
      // 1. Parse address parts from the free-text address field if possible
      const addressParts = parseAustralianAddress(contact.address ?? '');

      // 2. Create IntelliCompli customer — email is required by the real API.
      //    ComplianceValidationError is re-thrown so the UI panel can show it.
      const profile = await createComplianceCustomer({
        contactId: contact.id,
        firstName: contact.first_name,
        lastName: contact.last_name ?? '',
        email: contact.email ?? '',
        phone: contact.phone,
        address: addressParts,
      });

      // 3. Run initial sanctions screening (fire-and-forget any errors — non-blocking)
      let screenResult: ComplianceScreeningResult | null = null;
      try {
        screenResult = await screenCustomer(
          {
            customerId: profile.customerId,
            contactId: contact.id,
            firstName: contact.first_name,
            lastName: contact.last_name ?? '',
          },
          'sanctions',
        );
        // Finding 2: gate on transport mode, not auth demo mode — a real-login user
        // with no API key uses MockTransport but isDemo=false, so !isDemo is wrong here.
        if (screenResult.matchCount > 0 && getIntelliCompliMode() === 'live') {
          const contactName = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
          await useTaskStore.getState().createTask({
            title: `Complete enhanced due diligence — ${contactName}`,
            description: `Sanctions screening returned ${screenResult.matchCount} match(es). Review and complete EDD before proceeding.`,
            type: 'task',
            status: 'pending',
            priority: 'high',
            due_at: tomorrowAt9(),
            contact_id: contact.id,
            assigned_to: userId ?? undefined,
            team_id: teamId ?? undefined,
          });
        }
      } catch (screenErr) {
        console.warn('useComplianceStore.enableCompliance initial screening failed:', screenErr instanceof Error ? screenErr.message : String(screenErr));
      }

      // 4. Persist the IntelliCompli customer ID onto the CRM contact row.
      // Finding 2: gate Supabase write on transport mode — a real-login user with no
      // API key (mock transport) must not write mock cus_* ids into real Supabase rows.
      if (isDemo || getIntelliCompliMode() !== 'live') {
        // Demo mode OR mock transport: keep the link in memory only
        const { useCRMStore } = await import('./useCRMStore');
        useCRMStore.setState(state => ({
          contacts: state.contacts.map(c =>
            c.id === contact.id
              ? { ...c, intellicompli_customer_id: profile.customerId }
              : c,
          ),
        }));
      } else {
        // Live transport: write to Supabase contacts row
        const { error } = await supabase
          .from('contacts')
          .update({ intellicompli_customer_id: profile.customerId })
          .eq('id', contact.id);

        if (error) {
          console.error('useComplianceStore.enableCompliance supabase update failed:', error.message);
        } else {
          // Mirror into useCRMStore state — same pattern as updateContact
          const { useCRMStore } = await import('./useCRMStore');
          useCRMStore.setState(state => ({
            contacts: state.contacts.map(c =>
              c.id === contact.id
                ? { ...c, intellicompli_customer_id: profile.customerId }
                : c,
            ),
          }));
        }
      }

      set(state => ({
        profilesByContactId: { ...state.profilesByContactId, [contact.id]: profile },
        profileLoading: { ...state.profileLoading, [contact.id]: false },
      }));

      return profile;
    } catch (err) {
      set(state => ({
        profileLoading: { ...state.profileLoading, [contact.id]: false },
      }));
      // Re-throw validation errors so the UI panel can surface them directly
      // (e.g. "Add an email address to enable compliance for this contact.").
      if (err instanceof ComplianceValidationError) throw err;
      console.error('useComplianceStore.enableCompliance failed:', err instanceof Error ? err.message : String(err));
      return null;
    }
  },

  // -------------------------------------------------------------------------
  // Refresh an existing compliance profile
  // -------------------------------------------------------------------------

  refreshProfile: async (contactId) => {
    set(state => ({
      profileLoading: { ...state.profileLoading, [contactId]: true },
    }));

    try {
      const existing = get().profilesByContactId[contactId];
      if (!existing) {
        throw new Error(`No compliance profile found for contact ${contactId}`);
      }

      // The API has no GET /v1/customers/{id} — we pass the contact email so the
      // client can use GET /v1/customers?email=<email> and match on id.
      const { useCRMStore } = await import('./useCRMStore');
      const contact = useCRMStore.getState().contacts.find(c => c.id === contactId);
      const profile = await getComplianceCustomer(existing.customerId, contactId, contact?.email);

      set(state => ({
        profilesByContactId: { ...state.profilesByContactId, [contactId]: profile },
        profileLoading: { ...state.profileLoading, [contactId]: false },
      }));
    } catch (err) {
      console.warn('useComplianceStore.refreshProfile failed:', err instanceof Error ? err.message : String(err));
      set(state => ({
        profileLoading: { ...state.profileLoading, [contactId]: false },
      }));
    }
  },

  // -------------------------------------------------------------------------
  // Run a sanctions or PEP screening
  // -------------------------------------------------------------------------

  runScreening: async (contactId, kind) => {
    set(state => ({
      profileLoading: { ...state.profileLoading, [contactId]: true },
    }));

    try {
      const existing = get().profilesByContactId[contactId];
      if (!existing) {
        set(state => ({ profileLoading: { ...state.profileLoading, [contactId]: false } }));
        return null;
      }

      const { useCRMStore } = await import('./useCRMStore');
      const contact = useCRMStore.getState().contacts.find(c => c.id === contactId);

      const result = await screenCustomer(
        {
          customerId: existing.customerId,
          contactId,
          firstName: contact?.first_name ?? '',
          lastName: contact?.last_name ?? '',
        },
        kind,
      );

      // Screening hit → auto-create EDD task. Gate on transport mode (finding 2):
      // isDemo alone is insufficient — real-login + mock transport must also be excluded.
      if (result.matchCount > 0 && getIntelliCompliMode() === 'live') {
        const { teamId, userId } = getTeamContext();
        const contactName = contact
          ? [contact.first_name, contact.last_name].filter(Boolean).join(' ')
          : contactId;
        await useTaskStore.getState().createTask({
          title: `Complete enhanced due diligence — ${contactName}`,
          description: `${kind === 'pep' ? 'PEP' : 'Sanctions'} screening returned ${result.matchCount} match(es). Review and complete EDD before proceeding.`,
          type: 'task',
          status: 'pending',
          priority: 'high',
          due_at: tomorrowAt9(),
          contact_id: contactId,
          assigned_to: userId ?? undefined,
          team_id: teamId ?? undefined,
        });
      }

      // Refresh the profile so riskLevel etc. reflect the new screening
      await get().refreshProfile(contactId);

      set(state => ({
        profileLoading: { ...state.profileLoading, [contactId]: false },
      }));

      return result;
    } catch (err) {
      console.warn('useComplianceStore.runScreening failed:', err instanceof Error ? err.message : String(err));
      set(state => ({
        profileLoading: { ...state.profileLoading, [contactId]: false },
      }));
      return null;
    }
  },

  // -------------------------------------------------------------------------
  // Trigger risk re-assessment
  // -------------------------------------------------------------------------

  assessRisk: async (contactId) => {
    set(state => ({
      profileLoading: { ...state.profileLoading, [contactId]: true },
    }));

    try {
      const existing = get().profilesByContactId[contactId];
      if (!existing) {
        set(state => ({ profileLoading: { ...state.profileLoading, [contactId]: false } }));
        return;
      }

      const profile = await assessCustomerRisk(existing.customerId, contactId);

      set(state => ({
        profilesByContactId: { ...state.profilesByContactId, [contactId]: profile },
        profileLoading: { ...state.profileLoading, [contactId]: false },
      }));
    } catch (err) {
      console.warn('useComplianceStore.assessRisk failed:', err instanceof Error ? err.message : String(err));
      set(state => ({
        profileLoading: { ...state.profileLoading, [contactId]: false },
      }));
    }
  },

  // -------------------------------------------------------------------------
  // Alerts
  // -------------------------------------------------------------------------

  fetchAlerts: async () => {
    set({ alertsLoading: true });
    try {
      const alerts = await listComplianceAlerts();
      set({ alerts, alertsLoading: false });
    } catch (err) {
      console.warn('useComplianceStore.fetchAlerts failed:', err instanceof Error ? err.message : String(err));
      set({ alertsLoading: false });
    }
  },

  resolveAlert: async (alertId, resolutionType, notes) => {
    try {
      const updated = await updateComplianceAlert(alertId, {
        status: resolutionType === 'false_positive' ? 'false_positive' : resolutionType,
        resolutionType,
        resolutionNotes: notes,
      });
      set(state => ({
        alerts: state.alerts.map(a => (a.id === alertId ? updated : a)),
      }));
    } catch (err) {
      console.warn('useComplianceStore.resolveAlert failed:', err instanceof Error ? err.message : String(err));
    }
  },

  updateAlertStatus: async (alertId, status) => {
    try {
      const updated = await updateComplianceAlert(alertId, { status });
      set(state => ({
        alerts: state.alerts.map(a => (a.id === alertId ? updated : a)),
      }));
    } catch (err) {
      console.warn('useComplianceStore.updateAlertStatus failed:', err instanceof Error ? err.message : String(err));
    }
  },

  escalateAlert: async (alertId, reason) => {
    try {
      const updated = await updateComplianceAlert(alertId, {
        status: 'escalated',
        // The spec has no separate escalationReason field — use investigationNotes.
        investigationNotes: reason,
      });

      set(state => ({
        alerts: state.alerts.map(a => (a.id === alertId ? updated : a)),
      }));

      // Auto-create a review task. Gate on transport mode, not isDemo (finding 2).
      if (getIntelliCompliMode() === 'live') {
        const alert = get().alerts.find(a => a.id === alertId) ?? updated;
        const { teamId, userId } = getTeamContext();
        await useTaskStore.getState().createTask({
          title: `Review escalated compliance alert ${alert.alertNumber}`,
          description: `Escalation reason: ${reason}`,
          type: 'task',
          status: 'pending',
          priority: 'high',
          due_at: tomorrowAt9(),
          assigned_to: userId ?? undefined,
          team_id: teamId ?? undefined,
        });
      }
    } catch (err) {
      console.warn('useComplianceStore.escalateAlert failed:', err instanceof Error ? err.message : String(err));
    }
  },

  // -------------------------------------------------------------------------
  // Analytics
  // -------------------------------------------------------------------------

  fetchAnalytics: async () => {
    set({ analyticsLoading: true });
    try {
      const analytics = await getComplianceAnalytics();
      set({ analytics, analyticsLoading: false });
    } catch (err) {
      console.warn('useComplianceStore.fetchAnalytics failed:', err instanceof Error ? err.message : String(err));
      set({ analyticsLoading: false });
    }
  },

  // -------------------------------------------------------------------------
  // Batch-load linked profiles for contacts that have intellicompli_customer_id
  // -------------------------------------------------------------------------

  hydrateProfiles: async (contacts) => {
    // Finding 8 + Finding 1: only hydrate contacts that have both a customer id AND
    // an email — getComplianceCustomer now requires email to avoid unfiltered list calls.
    const linked = contacts.filter(c => c.intellicompli_customer_id && c.email);
    if (linked.length === 0) return;

    // Mark all eligible contacts as loading
    const loadingPatch: Record<string, boolean> = {};
    for (const c of linked) loadingPatch[c.id] = true;
    set(state => ({ profileLoading: { ...state.profileLoading, ...loadingPatch } }));

    // Finding 8: parallel fetches with a concurrency cap of 5 to avoid hammering the
    // API on large contact lists. Chunks are awaited sequentially; within each chunk
    // all requests run in parallel. Profiles are applied incrementally per chunk.
    const CHUNK_SIZE = 5;
    for (let i = 0; i < linked.length; i += CHUNK_SIZE) {
      const chunk = linked.slice(i, i + CHUNK_SIZE);
      const results = await Promise.allSettled(
        chunk.map(contact =>
          getComplianceCustomer(
            contact.intellicompli_customer_id!,
            contact.id,
            contact.email!,
          ).then(profile => ({ contactId: contact.id, profile })),
        ),
      );

      const profilePatch: Record<string, ComplianceProfile> = {};
      const donePatch: Record<string, boolean> = {};

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const contact = chunk[j];
        if (result.status === 'fulfilled') {
          profilePatch[result.value.contactId] = result.value.profile;
        } else {
          console.warn(
            `useComplianceStore.hydrateProfiles failed for ${contact.intellicompli_customer_id}:`,
            result.reason instanceof Error ? result.reason.message : String(result.reason),
          );
        }
        donePatch[contact.id] = false;
      }

      // Apply each chunk incrementally so profiles appear as they arrive
      set(state => ({
        profilesByContactId: { ...state.profilesByContactId, ...profilePatch },
        profileLoading: { ...state.profileLoading, ...donePatch },
      }));
    }
  },
}));

// ---------------------------------------------------------------------------
// Utility — naive AU address parser
// Attempts to split "123 Smith St, Sydney NSW 2000" into structured parts.
// The API accepts empty strings, so partial failures are fine.
// ---------------------------------------------------------------------------

interface AddressParts {
  line1: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
}

function parseAustralianAddress(raw: string): AddressParts {
  const clean = raw.trim();
  // Match postcode at end
  const postcodeMatch = clean.match(/\b(\d{4})\s*$/);
  const postcode = postcodeMatch?.[1] ?? '';

  // AU state abbreviations
  const stateMatch = clean.match(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/i);
  const state = stateMatch?.[1]?.toUpperCase() ?? '';

  // Everything after the last comma before state/postcode = city
  const parts = clean.split(',').map(p => p.trim());
  const city = parts.length >= 2 ? parts[parts.length - 1].replace(/\b(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\b/gi, '').replace(/\d{4}/, '').trim() : '';
  const line1 = parts[0] ?? clean;

  return { line1, city, state, postcode, country: 'AU' };
}
