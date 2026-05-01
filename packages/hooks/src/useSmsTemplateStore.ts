import { create } from 'zustand';
import type { SmsTemplate, SmsLabel } from '@realestate-crm/types';
import { SMS_LABEL_SEEDS } from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface CreateTemplateInput {
  name: string;
  message: string;
  labelIds?: string[];
}

interface UpdateTemplateInput {
  name?: string;
  message?: string;
  labelIds?: string[];
}

interface CreateLabelInput {
  name: string;
  color?: string;
}

interface SmsTemplateState {
  templates: SmsTemplate[];
  labels: SmsLabel[];
  isLoading: boolean;
  error: string | null;

  fetchAll: (ctx?: { teamId: string | null; userId: string | null; isDemo: boolean }) => Promise<void>;
  createTemplate: (input: CreateTemplateInput) => Promise<SmsTemplate | null>;
  updateTemplate: (id: string, updates: UpdateTemplateInput) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  createLabel: (input: CreateLabelInput) => Promise<SmsLabel | null>;
  updateLabel: (id: string, updates: { name?: string; color?: string }) => Promise<void>;
  deleteLabel: (id: string) => Promise<void>;
  /** Returns the templates that carry the given label id. */
  templatesByLabel: (labelId: string) => SmsTemplate[];
  clearData: () => void;
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

function nowIso() {
  return new Date().toISOString();
}

const DEMO_LABELS: SmsLabel[] = SMS_LABEL_SEEDS.map((seed, i) => ({
  id: `demo-lbl-${i + 1}`,
  team_id: null,
  name: seed.name,
  color: seed.color,
  created_by: null,
  created_at: '2026-04-01T00:00:00Z',
  updated_at: '2026-04-01T00:00:00Z',
}));

const DEMO_TEMPLATES: SmsTemplate[] = [
  {
    id: 'demo-tmpl-1',
    team_id: null,
    name: 'Touching base',
    message: 'Hi {name}, just touching base. Would love to catch up when you have a moment.',
    created_by: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    labels: [DEMO_LABELS[0]], // General
  },
  {
    id: 'demo-tmpl-2',
    team_id: null,
    name: 'Open home invite',
    message: 'Hi {name}, we have an open home this Saturday in your area — would love to see you there. Reply STOP to opt out.',
    created_by: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    labels: [DEMO_LABELS[1]], // Open Home
  },
  {
    id: 'demo-tmpl-3',
    team_id: null,
    name: 'Market update',
    message: 'Hi {name}, your monthly market update is ready. Properties in your suburb moved fast last month. Reply STOP to opt out.',
    created_by: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
    labels: [DEMO_LABELS[4]], // Market Update
  },
];

interface RawTemplateRow {
  id: string;
  team_id: string | null;
  name: string;
  message: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface RawLinkRow {
  template_id: string;
  label_id: string;
}

function attachLabels(templates: RawTemplateRow[], links: RawLinkRow[], labels: SmsLabel[]): SmsTemplate[] {
  const labelById = new Map(labels.map((l) => [l.id, l]));
  const linksByTemplate = new Map<string, SmsLabel[]>();
  for (const link of links) {
    const lbl = labelById.get(link.label_id);
    if (!lbl) continue;
    const arr = linksByTemplate.get(link.template_id);
    if (arr) arr.push(lbl);
    else linksByTemplate.set(link.template_id, [lbl]);
  }
  return templates.map((t) => ({ ...t, labels: linksByTemplate.get(t.id) || [] }));
}

export const useSmsTemplateStore = create<SmsTemplateState>()((set, get) => ({
  templates: [],
  labels: [],
  isLoading: false,
  error: null,

  clearData: () => {
    set({ templates: [], labels: [], isLoading: false, error: null });
  },

  templatesByLabel: (labelId) => {
    return get().templates.filter((t) => (t.labels || []).some((l) => l.id === labelId));
  },

  fetchAll: async (ctx?) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = ctx || getTeamContext();
      if (isDemo) {
        set({ templates: DEMO_TEMPLATES, labels: DEMO_LABELS, isLoading: false });
        return;
      }

      let labelsQuery = supabase.from('sms_labels').select('*').order('name', { ascending: true });
      if (teamId) labelsQuery = labelsQuery.eq('team_id', teamId);

      let templatesQuery = supabase
        .from('sms_templates')
        .select('*')
        .order('updated_at', { ascending: false });
      if (teamId) templatesQuery = templatesQuery.eq('team_id', teamId);

      const [labelsRes, templatesRes] = await Promise.all([labelsQuery, templatesQuery]);
      if (labelsRes.error) throw labelsRes.error;
      if (templatesRes.error) throw templatesRes.error;

      const labels = (labelsRes.data || []) as SmsLabel[];
      const rawTemplates = (templatesRes.data || []) as RawTemplateRow[];

      let links: RawLinkRow[] = [];
      if (rawTemplates.length > 0) {
        const { data, error } = await supabase
          .from('sms_template_labels')
          .select('template_id, label_id')
          .in(
            'template_id',
            rawTemplates.map((t) => t.id),
          );
        if (error) throw error;
        links = (data || []) as RawLinkRow[];
      }

      set({
        templates: attachLabels(rawTemplates, links, labels),
        labels,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch SMS templates';
      set({ error: message, isLoading: false });
    }
  },

  createTemplate: async (input) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      const trimmedName = input.name.trim();
      const trimmedMessage = input.message.trim();
      if (!trimmedName || !trimmedMessage) return null;
      const labelIds = input.labelIds || [];

      if (isDemo) {
        const labels = get().labels.filter((l) => labelIds.includes(l.id));
        const created: SmsTemplate = {
          id: generateUUID(),
          team_id: teamId,
          name: trimmedName,
          message: trimmedMessage,
          created_by: userId,
          created_at: nowIso(),
          updated_at: nowIso(),
          labels,
        };
        set((state) => ({ templates: [created, ...state.templates] }));
        return created;
      }

      const insertData: Record<string, unknown> = { name: trimmedName, message: trimmedMessage };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.created_by = userId;

      const { data, error } = await supabase
        .from('sms_templates')
        .insert(insertData)
        .select('*')
        .single();
      if (error) throw error;

      const created = data as RawTemplateRow;

      // Attach labels via junction
      if (labelIds.length > 0) {
        const linkRows = labelIds.map((labelId) => ({ template_id: created.id, label_id: labelId }));
        const { error: linkError } = await supabase.from('sms_template_labels').insert(linkRows);
        if (linkError) console.warn('createTemplate label link error:', linkError.message);
      }

      const labels = get().labels.filter((l) => labelIds.includes(l.id));
      const enriched: SmsTemplate = { ...created, labels };
      set((state) => ({ templates: [enriched, ...state.templates] }));
      return enriched;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create SMS template';
      set({ error: message });
      return null;
    }
  },

  updateTemplate: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();

      const fieldUpdates: { name?: string; message?: string } = {};
      if (updates.name !== undefined) fieldUpdates.name = updates.name.trim();
      if (updates.message !== undefined) fieldUpdates.message = updates.message.trim();
      if (fieldUpdates.name === '' || fieldUpdates.message === '') return;

      if (isDemo) {
        const labels = updates.labelIds
          ? get().labels.filter((l) => updates.labelIds!.includes(l.id))
          : undefined;
        set((state) => ({
          templates: state.templates.map((t) =>
            t.id === id
              ? {
                  ...t,
                  ...fieldUpdates,
                  ...(labels ? { labels } : {}),
                  updated_at: nowIso(),
                }
              : t,
          ),
        }));
        return;
      }

      if (Object.keys(fieldUpdates).length > 0) {
        const { error } = await supabase.from('sms_templates').update(fieldUpdates).eq('id', id);
        if (error) throw error;
      }

      // Reset labels if a new set was provided
      if (updates.labelIds !== undefined) {
        await supabase.from('sms_template_labels').delete().eq('template_id', id);
        if (updates.labelIds.length > 0) {
          const linkRows = updates.labelIds.map((labelId) => ({ template_id: id, label_id: labelId }));
          const { error } = await supabase.from('sms_template_labels').insert(linkRows);
          if (error) throw error;
        }
      }

      const labels = updates.labelIds
        ? get().labels.filter((l) => updates.labelIds!.includes(l.id))
        : undefined;
      set((state) => ({
        templates: state.templates.map((t) =>
          t.id === id
            ? {
                ...t,
                ...fieldUpdates,
                ...(labels ? { labels } : {}),
                updated_at: nowIso(),
              }
            : t,
        ),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update SMS template';
      set({ error: message });
    }
  },

  deleteTemplate: async (id) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
        return;
      }
      const { error } = await supabase.from('sms_templates').delete().eq('id', id);
      if (error) throw error;
      set((state) => ({ templates: state.templates.filter((t) => t.id !== id) }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete SMS template';
      set({ error: message });
    }
  },

  createLabel: async (input) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      const trimmedName = input.name.trim();
      if (!trimmedName) return null;
      const color = input.color || '#6366F1';

      if (isDemo) {
        const created: SmsLabel = {
          id: generateUUID(),
          team_id: teamId,
          name: trimmedName,
          color,
          created_by: userId,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        set((state) => ({ labels: [...state.labels, created].sort((a, b) => a.name.localeCompare(b.name)) }));
        return created;
      }

      const insertData: Record<string, unknown> = { name: trimmedName, color };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.created_by = userId;

      const { data, error } = await supabase.from('sms_labels').insert(insertData).select('*').single();
      if (error) throw error;
      const created = data as SmsLabel;
      set((state) => ({ labels: [...state.labels, created].sort((a, b) => a.name.localeCompare(b.name)) }));
      return created;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create SMS label';
      set({ error: message });
      return null;
    }
  },

  updateLabel: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();
      const cleaned: { name?: string; color?: string } = {};
      if (updates.name !== undefined) cleaned.name = updates.name.trim();
      if (updates.color !== undefined) cleaned.color = updates.color;
      if (cleaned.name === '') return;

      if (isDemo) {
        set((state) => ({
          labels: state.labels.map((l) => (l.id === id ? { ...l, ...cleaned, updated_at: nowIso() } : l)),
          templates: state.templates.map((t) => ({
            ...t,
            labels: (t.labels || []).map((l) => (l.id === id ? { ...l, ...cleaned } : l)),
          })),
        }));
        return;
      }

      const { error } = await supabase.from('sms_labels').update(cleaned).eq('id', id);
      if (error) throw error;
      set((state) => ({
        labels: state.labels.map((l) => (l.id === id ? { ...l, ...cleaned, updated_at: nowIso() } : l)),
        templates: state.templates.map((t) => ({
          ...t,
          labels: (t.labels || []).map((l) => (l.id === id ? { ...l, ...cleaned } : l)),
        })),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update SMS label';
      set({ error: message });
    }
  },

  deleteLabel: async (id) => {
    try {
      const { isDemo } = getTeamContext();
      if (isDemo) {
        set((state) => ({
          labels: state.labels.filter((l) => l.id !== id),
          templates: state.templates.map((t) => ({
            ...t,
            labels: (t.labels || []).filter((l) => l.id !== id),
          })),
        }));
        return;
      }
      const { error } = await supabase.from('sms_labels').delete().eq('id', id);
      if (error) throw error;
      // ON DELETE CASCADE on sms_template_labels handles the junction cleanup.
      set((state) => ({
        labels: state.labels.filter((l) => l.id !== id),
        templates: state.templates.map((t) => ({
          ...t,
          labels: (t.labels || []).filter((l) => l.id !== id),
        })),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to delete SMS label';
      set({ error: message });
    }
  },
}));
