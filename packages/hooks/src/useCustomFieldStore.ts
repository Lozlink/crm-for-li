import { create } from 'zustand';
import type {
  CustomFieldDefinition,
  CustomFieldValue,
  CustomFieldWithValue,
  CustomFieldEntityType,
  CustomFieldType,
} from '@realestate-crm/types';
import { supabase, isDemoMode, generateUUID } from '@realestate-crm/api';
import { useAuthStore } from './useAuthStore';

interface CustomFieldState {
  definitions: CustomFieldDefinition[];
  values: Record<string, CustomFieldValue[]>;
  isLoading: boolean;
  error: string | null;

  fetchDefinitions: (entityType?: CustomFieldEntityType) => Promise<void>;
  createDefinition: (def: Omit<CustomFieldDefinition, 'id' | 'team_id' | 'created_at' | 'updated_at'>) => Promise<CustomFieldDefinition | null>;
  updateDefinition: (id: string, updates: Partial<Pick<CustomFieldDefinition, 'field_label' | 'field_name' | 'field_type' | 'options' | 'is_required' | 'display_order'>>) => Promise<void>;
  deleteDefinition: (id: string) => Promise<void>;
  reorderDefinitions: (entityType: CustomFieldEntityType, orderedIds: string[]) => Promise<void>;
  fetchValues: (entityType: CustomFieldEntityType, entityId: string) => Promise<void>;
  setFieldValue: (definitionId: string, entityId: string, entityType: CustomFieldEntityType, value: string | number | boolean | string[] | null) => Promise<void>;
  clearFieldValue: (definitionId: string, entityId: string) => Promise<void>;
  getFieldsWithValues: (entityType: CustomFieldEntityType, entityId: string) => CustomFieldWithValue[];
}

function getTeamContext() {
  const authState = useAuthStore.getState();
  return {
    teamId: authState.activeTeam?.id || null,
    userId: authState.user?.id || null,
    isDemo: authState.isDemoMode || isDemoMode,
  };
}

function getValueColumn(fieldType: CustomFieldType): keyof Pick<CustomFieldValue, 'value_text' | 'value_number' | 'value_boolean' | 'value_date' | 'value_json'> {
  switch (fieldType) {
    case 'text':
    case 'single_select':
      return 'value_text';
    case 'number':
      return 'value_number';
    case 'boolean':
      return 'value_boolean';
    case 'date':
      return 'value_date';
    case 'multi_select':
      return 'value_json';
  }
}

const DEMO_DEFINITIONS: CustomFieldDefinition[] = [
  {
    id: generateUUID(),
    team_id: 'demo-team',
    entity_type: 'contact',
    field_name: 'preferred_language',
    field_label: 'Preferred Language',
    field_type: 'single_select',
    options: ['English', 'Mandarin', 'Arabic', 'Vietnamese', 'Hindi'],
    is_required: false,
    display_order: 0,
  },
  {
    id: generateUUID(),
    team_id: 'demo-team',
    entity_type: 'contact',
    field_name: 'birthday',
    field_label: 'Birthday',
    field_type: 'date',
    is_required: false,
    display_order: 1,
  },
  {
    id: generateUUID(),
    team_id: 'demo-team',
    entity_type: 'property',
    field_name: 'key_location',
    field_label: 'Key Location',
    field_type: 'text',
    is_required: false,
    display_order: 0,
  },
  {
    id: generateUUID(),
    team_id: 'demo-team',
    entity_type: 'contact_requirement',
    field_name: 'must_have',
    field_label: 'Must Have',
    field_type: 'text',
    is_required: false,
    display_order: 0,
  },
];

export const useCustomFieldStore = create<CustomFieldState>()((set, get) => ({
  definitions: [],
  values: {},
  isLoading: false,
  error: null,

  fetchDefinitions: async (entityType?: CustomFieldEntityType) => {
    set({ isLoading: true, error: null });
    try {
      const { isDemo, teamId } = getTeamContext();

      if (isDemo) {
        const filtered = entityType
          ? DEMO_DEFINITIONS.filter(d => d.entity_type === entityType)
          : DEMO_DEFINITIONS;
        set({ definitions: filtered, isLoading: false });
        return;
      }

      if (!teamId) {
        set({ definitions: [], isLoading: false });
        return;
      }

      let query = supabase
        .from('custom_field_definitions')
        .select('*')
        .eq('team_id', teamId)
        .order('display_order', { ascending: true });

      if (entityType) {
        query = query.eq('entity_type', entityType);
      }

      const { data, error } = await query;
      if (error) throw error;
      set({ definitions: data || [], isLoading: false });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch definitions';
      set({ error: message, isLoading: false });
    }
  },

  createDefinition: async (def) => {
    try {
      const { isDemo, teamId } = getTeamContext();

      if (isDemo) {
        const newDef: CustomFieldDefinition = {
          ...def,
          id: generateUUID(),
          team_id: 'demo-team',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        set({ definitions: [...get().definitions, newDef] });
        return newDef;
      }

      if (!teamId) throw new Error('No active team');

      const { data, error } = await supabase
        .from('custom_field_definitions')
        .insert({ ...def, team_id: teamId })
        .select()
        .single();

      if (error) throw error;
      set({ definitions: [...get().definitions, data] });
      return data as CustomFieldDefinition;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to create definition';
      set({ error: message });
      return null;
    }
  },

  updateDefinition: async (id, updates) => {
    try {
      const { isDemo } = getTeamContext();

      if (isDemo) {
        set({
          definitions: get().definitions.map(d =>
            d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } : d
          ),
        });
        return;
      }

      const { error } = await supabase
        .from('custom_field_definitions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      set({
        definitions: get().definitions.map(d =>
          d.id === id ? { ...d, ...updates, updated_at: new Date().toISOString() } : d
        ),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to update definition';
      set({ error: message });
    }
  },

  deleteDefinition: async (id) => {
    try {
      const { isDemo } = getTeamContext();

      if (!isDemo) {
        const { error } = await supabase
          .from('custom_field_definitions')
          .delete()
          .eq('id', id);
        if (error) throw error;
      }

      set({ definitions: get().definitions.filter(d => d.id !== id) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to delete definition';
      set({ error: message });
    }
  },

  reorderDefinitions: async (entityType, orderedIds) => {
    try {
      const { isDemo } = getTeamContext();

      const updatedDefs = get().definitions.map(d => {
        if (d.entity_type !== entityType) return d;
        const idx = orderedIds.indexOf(d.id);
        return idx >= 0 ? { ...d, display_order: idx } : d;
      });
      set({ definitions: updatedDefs });

      if (!isDemo) {
        const updates = orderedIds.map((id, idx) => ({
          id,
          display_order: idx,
          updated_at: new Date().toISOString(),
        }));

        for (const update of updates) {
          const { error } = await supabase
            .from('custom_field_definitions')
            .update({ display_order: update.display_order, updated_at: update.updated_at })
            .eq('id', update.id);
          if (error) throw error;
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to reorder definitions';
      set({ error: message });
    }
  },

  fetchValues: async (entityType, entityId) => {
    try {
      const { isDemo, teamId } = getTeamContext();

      if (isDemo) {
        // Keep existing demo values in memory
        if (!get().values[entityId]) {
          set({ values: { ...get().values, [entityId]: [] } });
        }
        return;
      }

      if (!teamId) return;

      const { data, error } = await supabase
        .from('custom_field_values')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .eq('team_id', teamId);

      if (error) throw error;
      set({ values: { ...get().values, [entityId]: data || [] } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to fetch values';
      set({ error: message });
    }
  },

  setFieldValue: async (definitionId, entityId, entityType, value) => {
    try {
      const { isDemo, teamId } = getTeamContext();
      const definition = get().definitions.find(d => d.id === definitionId);
      if (!definition) throw new Error('Definition not found');

      const column = getValueColumn(definition.field_type);
      const now = new Date().toISOString();

      if (isDemo) {
        const entityValues = get().values[entityId] || [];
        const existingIdx = entityValues.findIndex(v => v.definition_id === definitionId);

        const newValue: CustomFieldValue = {
          id: existingIdx >= 0 ? entityValues[existingIdx].id : generateUUID(),
          definition_id: definitionId,
          entity_id: entityId,
          entity_type: entityType,
          team_id: 'demo-team',
          created_at: existingIdx >= 0 ? entityValues[existingIdx].created_at : now,
          updated_at: now,
        };

        // Set the appropriate column
        if (column === 'value_text') newValue.value_text = value as string;
        else if (column === 'value_number') newValue.value_number = value as number;
        else if (column === 'value_boolean') newValue.value_boolean = value as boolean;
        else if (column === 'value_date') newValue.value_date = value as string;
        else if (column === 'value_json') newValue.value_json = value;

        const updatedValues = existingIdx >= 0
          ? entityValues.map((v, i) => (i === existingIdx ? newValue : v))
          : [...entityValues, newValue];

        set({ values: { ...get().values, [entityId]: updatedValues } });
        return;
      }

      if (!teamId) throw new Error('No active team');

      const upsertData: Record<string, unknown> = {
        definition_id: definitionId,
        entity_id: entityId,
        entity_type: entityType,
        team_id: teamId,
        updated_at: now,
        // Clear all value columns first
        value_text: null,
        value_number: null,
        value_boolean: null,
        value_date: null,
        value_json: null,
      };
      upsertData[column] = value;

      const { data, error } = await supabase
        .from('custom_field_values')
        .upsert(upsertData, { onConflict: 'definition_id,entity_id' })
        .select()
        .single();

      if (error) throw error;

      const entityValues = get().values[entityId] || [];
      const existingIdx = entityValues.findIndex(v => v.definition_id === definitionId);
      const updatedValues = existingIdx >= 0
        ? entityValues.map((v, i) => (i === existingIdx ? data : v))
        : [...entityValues, data];

      set({ values: { ...get().values, [entityId]: updatedValues } });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to set field value';
      set({ error: message });
    }
  },

  clearFieldValue: async (definitionId, entityId) => {
    try {
      const { isDemo } = getTeamContext();

      if (!isDemo) {
        const { error } = await supabase
          .from('custom_field_values')
          .delete()
          .eq('definition_id', definitionId)
          .eq('entity_id', entityId);
        if (error) throw error;
      }

      const entityValues = get().values[entityId] || [];
      set({
        values: {
          ...get().values,
          [entityId]: entityValues.filter(v => v.definition_id !== definitionId),
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to clear field value';
      set({ error: message });
    }
  },

  getFieldsWithValues: (entityType, entityId) => {
    const { definitions, values } = get();
    const entityDefs = definitions.filter(d => d.entity_type === entityType);
    const entityValues = values[entityId] || [];

    return entityDefs
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .map(definition => ({
        definition,
        value: entityValues.find(v => v.definition_id === definition.id) || null,
      }));
  },
}));
