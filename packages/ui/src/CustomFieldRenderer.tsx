import React, { useEffect, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput, Switch, Chip, useTheme, Menu, ActivityIndicator } from 'react-native-paper';
import { useCustomFieldStore } from '@realestate-crm/hooks';
import type { CustomFieldEntityType, CustomFieldWithValue } from '@realestate-crm/types';

interface CustomFieldRendererProps {
  entityType: CustomFieldEntityType;
  entityId: string;
  readonly?: boolean;
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

export default function CustomFieldRenderer({ entityType, entityId, readonly }: CustomFieldRendererProps) {
  const theme = useTheme();
  const fetchDefinitions = useCustomFieldStore(s => s.fetchDefinitions);
  const fetchValues = useCustomFieldStore(s => s.fetchValues);
  const setFieldValue = useCustomFieldStore(s => s.setFieldValue);
  const getFieldsWithValues = useCustomFieldStore(s => s.getFieldsWithValues);
  const isLoading = useCustomFieldStore(s => s.isLoading);

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
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" />
      </View>
    );
  }

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
});
