import React, { useEffect, useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  Text,
  TextInput,
  Switch,
  Chip,
  useTheme,
  Menu,
  ActivityIndicator,
  IconButton,
  Portal,
  Dialog,
  Button,
  SegmentedButtons,
} from 'react-native-paper';
import { useCustomFieldStore } from '@realestate-crm/hooks';
import type { CustomFieldEntityType, CustomFieldWithValue, CustomFieldType } from '@realestate-crm/types';

const FIELD_TYPE_OPTIONS: { value: CustomFieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Yes/No' },
  { value: 'date', label: 'Date' },
  { value: 'single_select', label: 'Select' },
  { value: 'multi_select', label: 'Multi' },
];

interface CustomFieldRendererProps {
  entityType: CustomFieldEntityType;
  entityId: string;
  readonly?: boolean;
  /** When true, renders nothing if no custom fields exist and no add button (for embedding within existing cards) */
  inline?: boolean;
}

function FieldRow({
  field,
  readonly,
  onChangeValue,
}: {
  field: CustomFieldWithValue;
  readonly?: boolean;
  onChangeValue: (value: string | number | boolean | string[] | null) => void;
}) {
  const theme = useTheme();
  const { definition, value } = field;
  const [menuVisible, setMenuVisible] = React.useState(false);

  switch (definition.field_type) {
    case 'text': {
      const textVal = value?.value_text ?? '';
      if (readonly) {
        return (
          <View style={styles.fieldContainer}>
            <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              {definition.field_label}
            </Text>
            <Text variant="bodyMedium">{textVal || '-'}</Text>
          </View>
        );
      }
      return (
        <View style={styles.fieldContainer}>
          <TextInput
            label={definition.field_label}
            value={textVal}
            onChangeText={(v) => onChangeValue(v)}
            mode="outlined"
            dense
          />
        </View>
      );
    }

    case 'number': {
      const numVal = value?.value_number != null ? String(value.value_number) : '';
      if (readonly) {
        return (
          <View style={styles.fieldContainer}>
            <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              {definition.field_label}
            </Text>
            <Text variant="bodyMedium">{numVal || '-'}</Text>
          </View>
        );
      }
      return (
        <View style={styles.fieldContainer}>
          <TextInput
            label={definition.field_label}
            value={numVal}
            onChangeText={(v) => {
              const parsed = parseFloat(v);
              if (!isNaN(parsed)) onChangeValue(parsed);
              else if (v === '' || v === '-') onChangeValue(0);
            }}
            mode="outlined"
            dense
            keyboardType="numeric"
          />
        </View>
      );
    }

    case 'boolean': {
      const boolVal = value?.value_boolean ?? false;
      if (readonly) {
        return (
          <View style={styles.fieldContainer}>
            <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              {definition.field_label}
            </Text>
            <Text variant="bodyMedium">{boolVal ? 'Yes' : 'No'}</Text>
          </View>
        );
      }
      return (
        <View style={[styles.fieldContainer, styles.switchRow]}>
          <Text variant="bodyMedium" style={{ flex: 1 }}>{definition.field_label}</Text>
          <Switch value={boolVal} onValueChange={(v) => onChangeValue(v)} />
        </View>
      );
    }

    case 'date': {
      const dateVal = value?.value_date ?? '';
      if (readonly) {
        return (
          <View style={styles.fieldContainer}>
            <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              {definition.field_label}
            </Text>
            <Text variant="bodyMedium">{dateVal || '-'}</Text>
          </View>
        );
      }
      return (
        <View style={styles.fieldContainer}>
          <TextInput
            label={definition.field_label}
            value={dateVal}
            onChangeText={(v) => onChangeValue(v)}
            mode="outlined"
            dense
            placeholder="YYYY-MM-DD"
          />
        </View>
      );
    }

    case 'single_select': {
      const selectedVal = value?.value_text ?? '';
      const options = definition.options ?? [];
      if (readonly) {
        return (
          <View style={styles.fieldContainer}>
            <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              {definition.field_label}
            </Text>
            {selectedVal ? (
              <Chip compact>{selectedVal}</Chip>
            ) : (
              <Text variant="bodyMedium">-</Text>
            )}
          </View>
        );
      }
      return (
        <View style={styles.fieldContainer}>
          <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
            {definition.field_label}
          </Text>
          <Menu
            visible={menuVisible}
            onDismiss={() => setMenuVisible(false)}
            anchor={
              <Chip onPress={() => setMenuVisible(true)} icon="menu-down">
                {selectedVal || 'Select...'}
              </Chip>
            }
          >
            {options.map((opt) => (
              <Menu.Item
                key={opt}
                onPress={() => {
                  onChangeValue(opt === selectedVal ? '' : opt);
                  setMenuVisible(false);
                }}
                title={opt}
                leadingIcon={opt === selectedVal ? 'check' : undefined}
              />
            ))}
          </Menu>
        </View>
      );
    }

    case 'multi_select': {
      const selectedArr = Array.isArray(value?.value_json) ? (value.value_json as string[]) : [];
      const options = definition.options ?? [];
      if (readonly) {
        return (
          <View style={styles.fieldContainer}>
            <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
              {definition.field_label}
            </Text>
            {selectedArr.length > 0 ? (
              <View style={styles.chipRow}>
                {selectedArr.map((s) => (
                  <Chip key={s} compact>{s}</Chip>
                ))}
              </View>
            ) : (
              <Text variant="bodyMedium">-</Text>
            )}
          </View>
        );
      }
      return (
        <View style={styles.fieldContainer}>
          <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
            {definition.field_label}
          </Text>
          <View style={styles.chipRow}>
            {options.map((opt) => {
              const isSelected = selectedArr.includes(opt);
              return (
                <Chip
                  key={opt}
                  selected={isSelected}
                  onPress={() => {
                    const newArr = isSelected
                      ? selectedArr.filter((s) => s !== opt)
                      : [...selectedArr, opt];
                    onChangeValue(newArr);
                  }}
                  compact
                >
                  {opt}
                </Chip>
              );
            })}
          </View>
        </View>
      );
    }

    default:
      return null;
  }
}

function AddFieldDialog({
  visible,
  onDismiss,
  entityType,
}: {
  visible: boolean;
  onDismiss: () => void;
  entityType: CustomFieldEntityType;
}) {
  const theme = useTheme();
  const createDefinition = useCustomFieldStore(s => s.createDefinition);
  const definitions = useCustomFieldStore(s => s.definitions);

  const [fieldLabel, setFieldLabel] = useState('');
  const [fieldType, setFieldType] = useState<CustomFieldType>('text');
  const [optionsText, setOptionsText] = useState('');
  const [saving, setSaving] = useState(false);

  const needsOptions = fieldType === 'single_select' || fieldType === 'multi_select';
  const canSave = fieldLabel.trim().length > 0 && (!needsOptions || optionsText.trim().length > 0);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    const fieldName = fieldLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const options = needsOptions
      ? optionsText.split(',').map(o => o.trim()).filter(Boolean)
      : undefined;
    const existingCount = definitions.filter(d => d.entity_type === entityType).length;

    await createDefinition({
      entity_type: entityType,
      field_name: fieldName,
      field_label: fieldLabel.trim(),
      field_type: fieldType,
      options,
      is_required: false,
      display_order: existingCount,
    });

    setFieldLabel('');
    setFieldType('text');
    setOptionsText('');
    setSaving(false);
    onDismiss();
  };

  const handleDismiss = () => {
    setFieldLabel('');
    setFieldType('text');
    setOptionsText('');
    onDismiss();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss}>
        <Dialog.Title>Add Custom Field</Dialog.Title>
        <Dialog.Content style={styles.dialogContent}>
          <TextInput
            label="Field Label"
            value={fieldLabel}
            onChangeText={setFieldLabel}
            mode="outlined"
            dense
            autoFocus
          />
          <Text variant="labelMedium" style={[styles.dialogLabel, { color: theme.colors.onSurfaceVariant }]}>
            Field Type
          </Text>
          <View style={styles.typeGrid}>
            {FIELD_TYPE_OPTIONS.map(opt => (
              <Chip
                key={opt.value}
                selected={fieldType === opt.value}
                onPress={() => setFieldType(opt.value)}
                compact
                style={styles.typeChip}
              >
                {opt.label}
              </Chip>
            ))}
          </View>
          {needsOptions && (
            <TextInput
              label="Options (comma-separated)"
              value={optionsText}
              onChangeText={setOptionsText}
              mode="outlined"
              dense
              placeholder="Option 1, Option 2, Option 3"
              style={{ marginTop: 8 }}
            />
          )}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss}>Cancel</Button>
          <Button onPress={handleSave} disabled={!canSave || saving} loading={saving}>
            Add
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

export default function CustomFieldRenderer({ entityType, entityId, readonly, inline }: CustomFieldRendererProps) {
  const theme = useTheme();
  const fetchDefinitions = useCustomFieldStore(s => s.fetchDefinitions);
  const fetchValues = useCustomFieldStore(s => s.fetchValues);
  const setFieldValue = useCustomFieldStore(s => s.setFieldValue);
  const getFieldsWithValues = useCustomFieldStore(s => s.getFieldsWithValues);
  const isLoading = useCustomFieldStore(s => s.isLoading);

  const [addDialogVisible, setAddDialogVisible] = useState(false);

  useEffect(() => {
    fetchDefinitions(entityType);
    fetchValues(entityType, entityId);
  }, [entityType, entityId, fetchDefinitions, fetchValues]);

  const fields = getFieldsWithValues(entityType, entityId);

  const handleChange = useCallback(
    (definitionId: string) => (value: string | number | boolean | string[] | null) => {
      setFieldValue(definitionId, entityId, entityType, value);
    },
    [setFieldValue, entityId, entityType],
  );

  if (isLoading) {
    if (inline) return null;
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

  // When inline and no fields + readonly, render nothing
  if (fields.length === 0 && inline && readonly) {
    return null;
  }

  // When inline with no fields but editable, show just the add button
  if (fields.length === 0 && inline) {
    return (
      <View style={styles.inlineAddRow}>
        <Chip
          icon="plus"
          onPress={() => setAddDialogVisible(true)}
          compact
          style={{ backgroundColor: theme.colors.surfaceVariant }}
        >
          Add Field
        </Chip>
        <AddFieldDialog
          visible={addDialogVisible}
          onDismiss={() => setAddDialogVisible(false)}
          entityType={entityType}
        />
      </View>
    );
  }

  // Standalone (non-inline) with no fields
  if (fields.length === 0) {
    return (
      <View style={styles.empty}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          No custom fields configured
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {fields.map((field) => (
        <FieldRow
          key={field.definition.id}
          field={field}
          readonly={readonly}
          onChangeValue={handleChange(field.definition.id)}
        />
      ))}
      {!readonly && inline && (
        <View style={styles.inlineAddRow}>
          <Chip
            icon="plus"
            onPress={() => setAddDialogVisible(true)}
            compact
            style={{ backgroundColor: theme.colors.surfaceVariant }}
          >
            Add Field
          </Chip>
        </View>
      )}
      {!readonly && (
        <AddFieldDialog
          visible={addDialogVisible}
          onDismiss={() => setAddDialogVisible(false)}
          entityType={entityType}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  fieldContainer: {
    marginBottom: 4,
  },
  label: {
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  centered: {
    padding: 16,
    alignItems: 'center',
  },
  empty: {
    padding: 12,
    alignItems: 'center',
  },
  inlineAddRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  dialogContent: {
    gap: 12,
  },
  dialogLabel: {
    marginTop: 4,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeChip: {
    marginBottom: 2,
  },
});
