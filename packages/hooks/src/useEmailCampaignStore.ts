import { create } from 'zustand';
import type { EmailCampaign, EmailRecipient, ContactSubscription, Contact } from '@realestate-crm/types';
import { supabase, isDemoMode } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface EmailCampaignState {
  campaigns: EmailCampaign[];
  activeCampaign: EmailCampaign | null;
  recipients: EmailRecipient[];
  isLoading: boolean;
  error: string | null;

  fetchCampaigns: () => Promise<void>;
  fetchCampaign: (campaignId: string) => Promise<void>;
  createCampaign: (campaign: Omit<EmailCampaign, 'id' | 'created_at' | 'updated_at' | 'recipient_count' | 'sent_count' | 'opened_count'>) => Promise<EmailCampaign | null>;
  updateCampaign: (id: string, updates: Partial<EmailCampaign>) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  addRecipients: (campaignId: string, contacts: Contact[]) => Promise<void>;
  removeRecipient: (recipientId: string) => Promise<void>;
  sendCampaign: (campaignId: string) => Promise<void>;
  scheduleCampaign: (campaignId: string, scheduledAt: string) => Promise<void>;
  fetchSubscription: (contactId: string) => Promise<ContactSubscription | null>;
  updateSubscription: (contactId: string, subscribed: boolean) => Promise<void>;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

export const useEmailCampaignStore = create<EmailCampaignState>()((set, get) => ({
  campaigns: [],
  activeCampaign: null,
  recipients: [],
  isLoading: false,
  error: null,

  fetchCampaigns: async () => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) { set({ isLoading: false }); return; }

      let query = supabase
        .from('email_campaigns')
        .select('*, recipients:email_recipients(count)')
        .order('created_at', { ascending: false });

      if (teamId) query = query.eq('team_id', teamId);

      const { data, error } = await query;
      if (error) throw error;
      set({ campaigns: (data as EmailCampaign[]) || [], isLoading: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch campaigns';
      set({ error: message, isLoading: false });
    }
  },

  fetchCampaign: async (campaignId) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) { set({ isLoading: false }); return; }

      const { data, error } = await supabase
        .from('email_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;

      const { data: recipients, error: recipError } = await supabase
        .from('email_recipients')
        .select('*, contact:contacts(id, first_name, last_name, email)')
        .eq('campaign_id', campaignId)
        .order('email');

      if (recipError) throw recipError;

      set({
        activeCampaign: data as EmailCampaign,
        recipients: (recipients as EmailRecipient[]) || [],
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch campaign';
      set({ error: message, isLoading: false });
    }
  },

  createCampaign: async (campaign) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      if (isDemo) return null;

      const { data, error } = await supabase
        .from('email_campaigns')
        .insert({ ...campaign, team_id: teamId, sender_id: userId })
        .select()
        .single();

      if (error) throw error;
      const newCampaign = data as EmailCampaign;
      set((state) => ({ campaigns: [newCampaign, ...state.campaigns] }));
      return newCampaign;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create campaign';
      set({ error: message });
      return null;
    }
  },

  updateCampaign: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('email_campaigns').update(updates).eq('id', id);
      if (error) throw error;

      set((state) => ({
        campaigns: state.campaigns.map((c) => (c.id === id ? { ...c, ...updates } : c)),
        activeCampaign:
          state.activeCampaign?.id === id ? { ...state.activeCampaign, ...updates } : state.activeCampaign,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update campaign';
      set({ error: message });
    }
  },

  deleteCampaign: async (id) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('email_campaigns').delete().eq('id', id);
      if (error) throw error;

      set((state) => ({
        campaigns: state.campaigns.filter((c) => c.id !== id),
        activeCampaign: state.activeCampaign?.id === id ? null : state.activeCampaign,
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete campaign';
      set({ error: message });
    }
  },

  addRecipients: async (campaignId, contacts) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return;

      // Filter out unsubscribed contacts
      const contactIds = contacts.map((c) => c.id);
      const { data: subs } = await supabase
        .from('contact_subscriptions')
        .select('contact_id')
        .in('contact_id', contactIds)
        .eq('subscribed', false);

      const unsubscribedIds = new Set((subs || []).map((s: { contact_id: string }) => s.contact_id));

      const recipientRows = contacts
        .filter((c) => c.email && !unsubscribedIds.has(c.id))
        .map((c) => ({
          campaign_id: campaignId,
          contact_id: c.id,
          email: c.email!,
        }));

      if (recipientRows.length === 0) return;

      const { error } = await supabase.from('email_recipients').insert(recipientRows);
      if (error) throw error;

      // Refresh campaign to get updated counts
      await get().fetchCampaign(campaignId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add recipients';
      set({ error: message });
    }
  },

  removeRecipient: async (recipientId) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase.from('email_recipients').delete().eq('id', recipientId);
      if (error) throw error;

      set((state) => ({ recipients: state.recipients.filter((r) => r.id !== recipientId) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to remove recipient';
      set({ error: message });
    }
  },

  sendCampaign: async (campaignId) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      // Set status to sending
      await get().updateCampaign(campaignId, { status: 'sending' });

      // Call Supabase Edge Function to handle actual email sending
      const { error } = await supabase.functions.invoke('send-campaign', {
        body: { campaign_id: campaignId },
      });

      if (error) throw error;

      // Status will be updated to 'sent' by the edge function on completion
      await get().fetchCampaign(campaignId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to send campaign';
      set({ error: message });
      // Revert status on error
      await get().updateCampaign(campaignId, { status: 'draft' });
    }
  },

  scheduleCampaign: async (campaignId, scheduledAt) => {
    await get().updateCampaign(campaignId, {
      status: 'scheduled',
      scheduled_at: scheduledAt,
    });
  },

  fetchSubscription: async (contactId) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return null;

      const { data, error } = await supabase
        .from('contact_subscriptions')
        .select('*')
        .eq('contact_id', contactId)
        .eq('team_id', teamId)
        .maybeSingle();

      if (error) throw error;
      return data as ContactSubscription | null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch subscription';
      set({ error: message });
      return null;
    }
  },

  updateSubscription: async (contactId, subscribed) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      if (isDemo) return;

      const updates: Record<string, unknown> = { subscribed };
      if (!subscribed) {
        updates.unsubscribed_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('contact_subscriptions')
        .upsert(
          { contact_id: contactId, team_id: teamId, ...updates },
          { onConflict: 'contact_id,team_id' }
        );

      if (error) throw error;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update subscription';
      set({ error: message });
    }
  },
}));
