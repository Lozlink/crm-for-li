import { create } from 'zustand';
import type {
  WhiteboardItem,
  WhiteboardItemType,
  WhiteboardItemContent,
} from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface CreateItemInput {
  type: WhiteboardItemType;
  position_x: number;
  position_y: number;
  width?: number;
  height?: number;
  content: WhiteboardItemContent;
  color?: string | null;
  /** Live-bound widgets (contact / property) populate this with the linked entity id. */
  ref_id?: string | null;
}

interface UpdateItemPatch {
  position_x?: number;
  position_y?: number;
  width?: number;
  height?: number;
  z_index?: number;
  content?: WhiteboardItemContent;
  color?: string | null;
  ref_id?: string | null;
}

interface WhiteboardState {
  items: WhiteboardItem[];
  isLoading: boolean;
  error: string | null;
  // Top z_index in current state — used to bring-to-front on tap.
  maxZ: number;

  fetchItems: (ctx?: { teamId: string | null; userId: string | null; isDemo: boolean }) => Promise<void>;
  createItem: (input: CreateItemInput) => Promise<WhiteboardItem | null>;
  // Persists immediately; use for content edits, color changes, resizes on commit.
  updateItem: (id: string, patch: UpdateItemPatch) => Promise<WhiteboardItem | null>;
  // In-memory only — for high-frequency updates during drag/resize gestures.
  updateItemLocal: (id: string, patch: UpdateItemPatch) => void;
  // Flush whatever is currently in local state to DB. Use on gesture release.
  commitItem: (id: string) => Promise<void>;
  bringToFront: (id: string) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
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

function computeMaxZ(items: WhiteboardItem[]): number {
  let max = 0;
  for (const it of items) {
    if (it.z_index > max) max = it.z_index;
  }
  return max;
}

export const useWhiteboardStore = create<WhiteboardState>()((set, get) => ({
  items: [],
  isLoading: false,
  error: null,
  maxZ: 0,

  clearData: () => set({ items: [], isLoading: false, error: null, maxZ: 0 }),

  fetchItems: async (ctx?) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = ctx || getTeamContext();
      if (isDemo) {
        set({ isLoading: false });
        return;
      }

      let query = supabase
        .from('whiteboard_items')
        .select('*')
        .order('z_index', { ascending: true });

      if (teamId) {
        query = query.eq('team_id', teamId);
      }

      const { data, error } = await query;
      if (error) {
        console.error('fetchItems whiteboard error:', error.message, error.details, error.hint);
        throw error;
      }

      const items = (data || []) as WhiteboardItem[];
      set({ items, maxZ: computeMaxZ(items), isLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message, isLoading: false });
    }
  },

  createItem: async (input) => {
    try {
      const { isDemo, teamId, userId } = getTeamContext();
      const nextZ = get().maxZ + 1;
      const nowIso = new Date().toISOString();

      const baseRow: WhiteboardItem = {
        id: generateUUID(),
        team_id: teamId,
        type: input.type,
        position_x: input.position_x,
        position_y: input.position_y,
        width: input.width ?? 220,
        height: input.height ?? 220,
        z_index: nextZ,
        content: input.content,
        color: input.color ?? null,
        ref_id: input.ref_id ?? null,
        created_by: userId,
        created_at: nowIso,
        updated_at: nowIso,
      };

      if (isDemo) {
        set(state => ({ items: [...state.items, baseRow], maxZ: nextZ }));
        return baseRow;
      }

      const insertData: Record<string, unknown> = {
        type: baseRow.type,
        position_x: baseRow.position_x,
        position_y: baseRow.position_y,
        width: baseRow.width,
        height: baseRow.height,
        z_index: baseRow.z_index,
        content: baseRow.content,
        color: baseRow.color,
        ref_id: baseRow.ref_id,
      };
      if (teamId) insertData.team_id = teamId;
      if (userId) insertData.created_by = userId;

      const { data, error } = await supabase
        .from('whiteboard_items')
        .insert(insertData)
        .select('*')
        .single();

      if (error) {
        console.error('createItem whiteboard error:', error.message, error.details);
        // Optimistic local fallback so the canvas still reflects the user's intent.
        set(state => ({ items: [...state.items, baseRow], maxZ: nextZ, error: error.message }));
        return baseRow;
      }

      const created = data as WhiteboardItem;
      set(state => ({
        items: [...state.items, created],
        maxZ: Math.max(state.maxZ, created.z_index),
      }));
      return created;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('createItem whiteboard failed:', message);
      set({ error: message });
      return null;
    }
  },

  updateItemLocal: (id, patch) => {
    set(state => ({
      items: state.items.map(it => (it.id === id ? { ...it, ...patch } : it)),
    }));
  },

  updateItem: async (id, patch) => {
    const existing = get().items.find(it => it.id === id);
    if (!existing) return null;

    // Apply locally first for snappy UI.
    const optimistic: WhiteboardItem = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    set(state => ({
      items: state.items.map(it => (it.id === id ? optimistic : it)),
      maxZ: patch.z_index !== undefined ? Math.max(state.maxZ, patch.z_index) : state.maxZ,
    }));

    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return optimistic;

      const updatePayload: Record<string, unknown> = {};
      if (patch.position_x !== undefined) updatePayload.position_x = patch.position_x;
      if (patch.position_y !== undefined) updatePayload.position_y = patch.position_y;
      if (patch.width !== undefined) updatePayload.width = patch.width;
      if (patch.height !== undefined) updatePayload.height = patch.height;
      if (patch.z_index !== undefined) updatePayload.z_index = patch.z_index;
      if (patch.content !== undefined) updatePayload.content = patch.content;
      if (patch.color !== undefined) updatePayload.color = patch.color;
      if (patch.ref_id !== undefined) updatePayload.ref_id = patch.ref_id;

      const { data, error } = await supabase
        .from('whiteboard_items')
        .update(updatePayload)
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('updateItem whiteboard error:', error.message);
        set({ error: error.message });
        return optimistic;
      }

      const updated = data as WhiteboardItem;
      set(state => ({
        items: state.items.map(it => (it.id === id ? updated : it)),
      }));
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ error: message });
      return optimistic;
    }
  },

  commitItem: async (id) => {
    const item = get().items.find(it => it.id === id);
    if (!item) return;
    await get().updateItem(id, {
      position_x: item.position_x,
      position_y: item.position_y,
      width: item.width,
      height: item.height,
      z_index: item.z_index,
    });
  },

  bringToFront: async (id) => {
    const { items, maxZ } = get();
    const target = items.find(it => it.id === id);
    if (!target) return;
    if (target.z_index === maxZ) return;
    const nextZ = maxZ + 1;
    await get().updateItem(id, { z_index: nextZ });
  },

  deleteItem: async (id) => {
    const previous = get().items;
    set(state => ({ items: state.items.filter(it => it.id !== id) }));

    try {
      const { isDemo } = getTeamContext();
      if (isDemo) return;

      const { error } = await supabase
        .from('whiteboard_items')
        .delete()
        .eq('id', id);

      if (error) {
        console.error('deleteItem whiteboard error:', error.message);
        // Restore on failure.
        set({ items: previous, error: error.message });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ items: previous, error: message });
    }
  },
}));
