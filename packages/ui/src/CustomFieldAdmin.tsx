import React, { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Alert } from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Surface,
  Chip,
  IconButton,
  Portal,
  Dialog,
  TextInput,
  Switch,
  Menu,
  SegmentedButtons,
  ActivityIndicator,
  Divider,
} from 'react-native-paper';
import { useCustomFieldStore } from '@realestate-crm/hooks';
import type { CustomFieldEntityType, CustomFieldType, CustomFieldDefinition } from '@realestate-crm/types';

const ENTITY_TYPE_BUTTONS: { value: CustomFieldEntityType; label: string }[] = [
  { value: 'contact', label: 'Contact' },
  { value: 'property', label: 'Property' },
  { value: 'contact_requirement', label: 'Requirements' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'task', label: 'Task' },
];

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'date', label: 'Date' },
  { value: 'single_select', label: 'Single Select' },
  { value: 'multi_select', label: 'Multi Select' },
];

function toSnakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

interface FieldFormState {
  field_label: string;
  field_name: string;
  field_type: CustomFieldType;
  options: string;
  is_required: boolean;
}

const INITIAL_FORM: FieldFormState = {
  field_label: '',
  field_name: '',
  field_type: 'text',
  options: '',
  is_required: false,
};

export default function CustomFieldAdmin() {
  const theme = useTheme();
  const [selectedEntity, setSelectedEntity] = useState<CustomFieldEntityType>('contact');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingDef, setEditingDef] = useState<CustomFieldDefinition | null>(null);
  const [form, setForm] = useState<FieldFormState>(INITIAL_FORM);
  const [fieldTypeMenuVisible, setFieldTypeMenuVisible] = useState(false);

  const definitions = useCustomFieldStore(s => s.definitions);
  const isLoading = useCustomFieldStore(s => s.isLoading);
  const fetchDefinitions = useCustomFieldStore(s => s.fetchDefinitions);
  const createDefinition = useCustomFieldStore(s => s.createDefinition);
  const updateDefinition = useCustomFieldStore(s => s.updateDefinition);
  const deleteDefinition = useCustomFieldStore(s => s.deleteDefinition);

  useEffect(() => {
    fetchDefinitions(selectedEntity);
  }, [selectedEntity, fetchDefinitions]);

  const entityDefs = definitions
    .filter(d => d.entity_type === selectedEntity)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));

  const showsOptions = form.field_type === 'single_select' || form.field_type === 'multi_select';

  const handleAdd = useCallback(async () => {
    if (!form.field_label.trim()) return;
    const fieldName = form.field_name.trim() || toSnakeCase(form.field_label);
    const options = showsOptions
      ? form.options.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    await createDefinition({
      entity_type: selectedEntity,
      field_name: fieldName,
      field_label: form.field_label.trim(),
      field_type: form.field_type,
      options,
      is_required: form.is_required,
      display_order: entityDefs.length,
    });
    setShowAddDialog(false);
    setForm(INITIAL_FORM);
    fetchDefinitions(selectedEntity);
  }, [form, selectedEntity, entityDefs.length, showsOptions, createDefinition, fetchDefinitions]);

  const handleEdit = useCallback(async () => {
    if (!editingDef || !form.field_label.trim()) return;
    const fieldName = form.field_name.trim() || toSnakeCase(form.field_label);
    const options = showsOptions
      ? form.options.split(',').map(s => s.trim()).filter(Boolean)
      : undefined;

    await updateDefinition(editingDef.id, {
      field_name: fieldName,
      field_label: form.field_label.trim(),
      field_type: form.field_type,
      options,
      is_required: form.is_required,
    });
    setShowEditDialog(false);
    setEditingDef(null);
    setForm(INITIAL_FORM);
    fetchDefinitions(selectedEntity);
  }, [editingDef, form, showsOptions, updateDefinition, selectedEntity, fetchDefinitions]);

  const handleDelete = useCallback(async () => {
    if (!editingDef) return;
    await deleteDefinition(editingDef.id);
    setShowDeleteDialog(false);
    setEditingDef(null);
    fetchDefinitions(selectedEntity);
  }, [editingDef, deleteDefinition, selectedEntity, fetchDefinitions]);

  const openEdit = useCallback((def: CustomFieldDefinition) => {
    setEditingDef(def);
    setForm({
      field_label: def.field_label,
      field_name: def.field_name,
      field_type: def.field_type,
      options: def.options?.join(', ') ?? '',
      is_required: def.is_required ?? false,
    });
    setShowEditDialog(true);
  }, []);

  const openDelete = useCallback((def: CustomFieldDefinition) => {
    setEditingDef(def);
    setShowDeleteDialog(true);
  }, []);

  const fieldTypeLabel = FIELD_TYPE_OPTIONS.find(f => f.value === form.field_type)?.label ?? 'Text';

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.entitySelector}>
        <SegmentedButtons
          value={selectedEntity}
          onValueChange={(v) => setSelectedEntity(v as CustomFieldEntityType)}
          buttons={ENTITY_TYPE_BUTTONS}
          density="small"
        />
      </ScrollView>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="small" />
        </View>
      ) : entityDefs.length === 0 ? (
        <View style={styles.emptyState}>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            No custom fields defined for this entity type.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {entityDefs.map((def, idx) => (
            <React.Fragment key={def.id}>
              {idx > 0 && <Divider />}
              <View style={styles.defRow}>
                <View style={{ flex: 1 }}>
                  <View style={styles.defLabelRow}>
                    <Text variant="bodyLarge">{def.field_label}</Text>
                    {def.is_required && (
                      <Text variant="labelSmall" style={{ color: theme.colors.error }}> *</Text>
                    )}
                  </View>
                  <Chip compact style={styles.typeChip} textStyle={styles.typeChipText}>
                    {FIELD_TYPE_OPTIONS.find(f => f.value === def.field_type)?.label ?? def.field_type}
                  </Chip>
                </View>
                <IconButton icon="pencil" size={20} onPress={() => openEdit(def)} />
                <IconButton icon="delete" size={20} onPress={() => openDelete(def)} iconColor={theme.colors.error} />
              </View>
            </React.Fragment>
          ))}
        </View>
      )}

      <Button
        mode="contained"
        icon="plus"
        onPress={() => {
          setForm(INITIAL_FORM);
          setShowAddDialog(true);
        }}
        style={styles.addButton}
      >
        Add Field
      </Button>

      {/* Add Field Dialog */}
      <Portal>
        <Dialog visible={showAddDialog} onDismiss={() => setShowAddDialog(false)}>
          <Dialog.Title>Add Custom Field</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <View style={styles.dialogContent}>
                <TextInput
                  label="Field Label"
                  value={form.field_label}
                  onChangeText={(v) => setForm(prev => ({
                    ...prev,
                    field_label: v,
                    field_name: toSnakeCase(v),
                  }))}
                  mode="outlined"
                  dense
                  style={styles.dialogInput}
                />
                <TextInput
                  label="Field Name (auto-generated)"
                  value={form.field_name}
                  onChangeText={(v) => setForm(prev => ({ ...prev, field_name: v }))}
                  mode="outlined"
                  dense
                  style={styles.dialogInput}
                />

                <Menu
                  visible={fieldTypeMenuVisible}
                  onDismiss={() => setFieldTypeMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setFieldTypeMenuVisible(true)}
                      icon="menu-down"
                      contentStyle={styles.menuButtonContent}
                      style={styles.dialogInput}
                    >
                      Type: {fieldTypeLabel}
                    </Button>
                  }
                >
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <Menu.Item
                      key={opt.value}
                      onPress={() => {
                        setForm(prev => ({ ...prev, field_type: opt.value }));
                        setFieldTypeMenuVisible(false);
                      }}
                      title={opt.label}
                      leadingIcon={form.field_type === opt.value ? 'check' : undefined}
                    />
                  ))}
                </Menu>

                {showsOptions && (
                  <TextInput
                    label="Options (comma-separated)"
                    value={form.options}
                    onChangeText={(v) => setForm(prev => ({ ...prev, options: v }))}
                    mode="outlined"
                    dense
                    style={styles.dialogInput}
                    placeholder="e.g. Option A, Option B, Option C"
                  />
                )}

                <View style={styles.switchRow}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>Required</Text>
                  <Switch
                    value={form.is_required}
                    onValueChange={(v) => setForm(prev => ({ ...prev, is_required: v }))}
                  />
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onPress={handleAdd} disabled={!form.field_label.trim()}>Add</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Edit Field Dialog */}
      <Portal>
        <Dialog visible={showEditDialog} onDismiss={() => setShowEditDialog(false)}>
          <Dialog.Title>Edit Custom Field</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <View style={styles.dialogContent}>
                <TextInput
                  label="Field Label"
                  value={form.field_label}
                  onChangeText={(v) => setForm(prev => ({
                    ...prev,
                    field_label: v,
                    field_name: toSnakeCase(v),
                  }))}
                  mode="outlined"
                  dense
                  style={styles.dialogInput}
                />
                <TextInput
                  label="Field Name"
                  value={form.field_name}
                  onChangeText={(v) => setForm(prev => ({ ...prev, field_name: v }))}
                  mode="outlined"
                  dense
                  style={styles.dialogInput}
                />

                <Menu
                  visible={fieldTypeMenuVisible}
                  onDismiss={() => setFieldTypeMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setFieldTypeMenuVisible(true)}
                      icon="menu-down"
                      contentStyle={styles.menuButtonContent}
                      style={styles.dialogInput}
                    >
                      Type: {fieldTypeLabel}
                    </Button>
                  }
                >
                  {FIELD_TYPE_OPTIONS.map((opt) => (
                    <Menu.Item
                      key={opt.value}
                      onPress={() => {
                        setForm(prev => ({ ...prev, field_type: opt.value }));
                        setFieldTypeMenuVisible(false);
                      }}
                      title={opt.label}
                      leadingIcon={form.field_type === opt.value ? 'check' : undefined}
                    />
                  ))}
                </Menu>

                {showsOptions && (
                  <TextInput
                    label="Options (comma-separated)"
                    value={form.options}
                    onChangeText={(v) => setForm(prev => ({ ...prev, options: v }))}
                    mode="outlined"
                    dense
                    style={styles.dialogInput}
                    placeholder="e.g. Option A, Option B, Option C"
                  />
                )}

                <View style={styles.switchRow}>
                  <Text variant="bodyMedium" style={{ flex: 1 }}>Required</Text>
                  <Switch
                    value={form.is_required}
                    onValueChange={(v) => setForm(prev => ({ ...prev, is_required: v }))}
                  />
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setShowEditDialog(false)}>Cancel</Button>
            <Button onPress={handleEdit} disabled={!form.field_label.trim()}>Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Delete Confirmation Dialog */}
      <Portal>
        <Dialog visible={showDeleteDialog} onDismiss={() => setShowDeleteDialog(false)}>
          <Dialog.Title>Delete Custom Field</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to delete &quot;{editingDef?.field_label}&quot;? All values stored for this field will be permanently removed.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button onPress={handleDelete} textColor={theme.colors.error}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  entitySelector: {
    marginBottom: 16,
    flexGrow: 0,
  },
  centered: {
    padding: 32,
    alignItems: 'center',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
  },
  list: {
    marginBottom: 16,
  },
  defRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  defLabelRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  typeChip: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  typeChipText: {
    fontSize: 11,
  },
  addButton: {
    marginTop: 8,
  },
  dialogScroll: {
    maxHeight: 400,
    paddingHorizontal: 0,
  },
  dialogContent: {
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  dialogInput: {
    marginBottom: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  menuButtonContent: {
    justifyContent: 'flex-start',
  },
});
