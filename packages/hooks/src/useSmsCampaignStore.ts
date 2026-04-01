import { create } from 'zustand';
import type { SmsCampaign, SmsMessage, SmsOptOut, Contact, Tag } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface SmsCampaignState {
  campaigns: SmsCampaign[];
  activeCampaign: SmsCampaign | null;
  messages: SmsMessage[];
  isLoading: boolean;
  error: string | null;

  fetchCampaigns: () => Promise<void>;
  fetchCampaign: (campaignId: string) => Promise<void>;
  createCampaign: (campaign: Omit<SmsCampaign, 'id' | 'created_at' | 'recipient_count' | 'sent_count' | 'failed_count'>) => Promise<SmsCampaign | null>;
  updateCampaign: (id: string, updates: Partial<SmsCampaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  /** Add recipients from a pre-filtered contact list. Skips opted-out numbers. */
  addRecipients: (campaignId: string, contacts: Contact[]) => Promise<void>;
  /** Add recipients by resolving a tag filter server-side. Skips opted-out numbers. */
  addRecipientsByTag: (campaignId: string, tagIds: string[]) => Promise<void>;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

/** Fetch opt-out phone numbers for a team to exclude from campaigns */
async function fetchOptOutNumbers(teamId: string | null): Promise<Set<string>> {
  if (!teamId) return new Set();
  const { data } = await supabase
    .from('sms_opt_outs')
    .select('phone_number')
    .eq('team_id', teamId);
  return new Set((data || []).map((r: Pick<SmsOptOut, 'phone_number'>) => r.phone_number));
}

const DEMO_CAMPAIGNS: SmsCampaign[] = [
  {
    id: 'demo-sms-1',
    name: 'Spring Market Alert',
    message_template: 'Hi {{first_name}}, we have exciting new listings in your area this spring. Reply STOP to opt out.',
    status: 'draft',
    recipient_count: 32,
    sent_count: 0,
    failed_count: 0,
    created_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 'demo-sms-2',
    name: 'March Market Update',
    message_template: 'Hi {{first_name}}, your monthly market update is ready. Properties in your suburb moved fast last month!',
    status: 'sent',
    recipient_count: 85,
    sent_count: 83,
    failed_count: 2,
    sent_at: '2026-03-15T09:00:00Z',
    created_at: '2026-03-10T00:00:00Z',
  },
];

export const useSmsCampaignStore = create<SmsCampaignState>()((set, get) => ({
  campaigns: [],
  activeCampaign: null,
  messages: [],
  isLoading: false,
  error: null,

  fetchCampaigns: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) {
        set({ campaigns: DEMO_CAMPAIGNS, isLoading: false });
        return;
      }

      let query = supabase
        .from('sms_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (teamId) query = query.eq('team_id', teamId);

      const { data, error } = await query;
      if (error) throw error;
      set({ campaigns: (data as SmsCampaign[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch SMS campaigns';
      set({ error: message, isLoading: false });
    }
  },

  fetchCampaign: async (campaignId) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) { set({ isLoading: false }); return; }

      const { data, error } = await supabase
        .from('sms_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;

      const { data: messages, error: msgError } = await supabase
        .from('sms_messages')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true });

      if (msgError) throw msgError;

      set({
        activeCampaign: data as SmsCampaign,
        messages: (messages as SmsMessage[]) || [],
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch SMS campaign';
      set({ error: message, isLoading: false });
    }
  },

  createCampaign: async (campaign) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();

      if (isDemo) {
        const newCampaign: SmsCampaign = {
          ...campaign,
          id: generateUUID(),
          recipient_count: 0,
          sent_count: 0,
          failed_count: 0,
          created_at: new Date().toISOString(),
        };
        set((state) => ({ campaigns: [newCampaign, ...state.campaigns] }));
        return newCampaign;
      }

      const insertData: Record<string, unknown> = { ...campaign, recipient_count: 0, sent_count: 0, failed_count: 0 };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.user_id = userId;

      const { data, error } = await supabase
        .from('sms_campaigns')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      const newCampaign = data as SmsCampaign;
      set((state) => ({ campaigns: [newCampaign, ...state.campaigns] }));
      return newCampaign;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create SMS campaign';
      set({ error: message });
      return null;
    }
  },

  updateCampaign: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set((state) => ({
          campaigns: state.campaigns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
          activeCampaign: state.activeCampaign?.id === id ? { ...state.activeCampaign, ...updates } : state.activeCampaign,
        }));
        return;
      }

      const { error } = await supabase.from('sms_campaigns').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        campaigns: state.campaigns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        activeCampaign: state.activeCampaign?.id === id ? { ...state.activeCampaign, ...updates } : state.activeCampaign,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update SMS campaign';
      set({ error: message });
    }
  },

  deleteCampaign: async (id) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set((state) => ({
          campaigns: state.campaigns.filter((c) => c.id !== id),
          activeCampaign: state.activeCampaign?.id === id ? null : state.activeCampaign,
        }));
        return;
      }

      const { error } = await supabase.from('sms_campaigns').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({
        campaigns: state.campaigns.filter((c) => c.id !== id),
        activeCampaign: state.activeCampaign?.id === id ? null : state.activeCampaign,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete SMS campaign';
      set({ error: message });
    }
  },

  addRecipients: async (campaignId, contacts) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return;

      const optedOut = await fetchOptOutNumbers(teamId);

      const messageRows = contacts
        .filter((c) => c.phone && !optedOut.has(c.phone) && !c.do_not_contact)
        .map((c) => ({
          campaign_id: campaignId,
          contact_id: c.id,
          phone_number: c.phone!,
          // Template rendering deferred to Edge Function at send time
          message_body: '',
          team_id: teamId,
        }));

      if (messageRows.length === 0) return;

      const { error } = await supabase.from('sms_messages').insert(messageRows);
      if (error) throw error;

      // Update recipient_count on the campaign
      await supabase
        .from('sms_campaigns')
        .update({ recipient_count: messageRows.length })
        .eq('id', campaignId);

      await get().fetchCampaign(campaignId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add SMS recipients';
      set({ error: message });
    }
  },

  addRecipientsByTag: async (campaignId, tagIds) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return;

      if (tagIds.length === 0) return;

      // Fetch contacts with any of the given tags via junction table
      let query = supabase
        .from('contacts')
        .select('id, phone, do_not_contact, contact_tags!inner(tag_id)')
        .in('contact_tags.tag_id', tagIds)
        .not('phone', 'is', null);

      if (teamId) query = query.eq('team_id', teamId);

      const { data, error } = await query;
      if (error) throw error;

      // Deduplicate by contact id (a contact may match multiple tags)
      // The query only selects a partial shape — cast via unknown then pick only
      // the fields addRecipients actually reads (id, phone, do_not_contact).
      type PartialContact = Pick<Contact, 'id' | 'phone' | 'do_not_contact' | 'first_name'>;
      const seen = new Set<string>();
      const contacts: PartialContact[] = [];
      for (const row of (data || []) as unknown as PartialContact[]) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          contacts.push(row);
        }
      }

      await get().addRecipients(campaignId, contacts as Contact[]);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add recipients by tag';
      set({ error: message });
    }
  },
}));
