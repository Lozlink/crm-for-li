import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, useTheme, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { WhiteboardItem, WhiteboardChecklistContent } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
  /**
   * Inline check-toggling so users can tick items without opening the editor.
   * Only wired up in Move mode tap-handling layer, not during drag.
   */
  onToggle?: (entryId: string) => void;
  /**
   * Called when the user taps the "Done" affordance on a fully-checked list.
   * Only wired in Move mode — parent handles deletion + confirmation.
   */
  onComplete?: () => void;
}

/**
 * Checklist widget body.
 *
 * Design tokens (see DESIGN.md §6):
 * - 12pt corner radius
 * - Surface elevation 2
 * - 44pt row height (touch-target requirement — agents one-handing on doorsteps)
 * - Checkbox 22pt, primary color when checked
 */
export function ChecklistCard({ item, onToggle, onComplete }: Props) {
  const theme = useTheme();
  const content = item.content as WhiteboardChecklistContent | undefined;
  const entries = content?.items ?? [];
  const title = (content?.title ?? '').trim();
  const allDone = entries.length > 0 && entries.every((e) => e.checked);

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text variant="titleSmall" style={styles.title} numberOfLines={1}>
          {title || 'To-do'}
        </Text>
      </View>

      {/* Items */}
      <View style={styles.list}>
        {entries.length === 0 && (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', paddingVertical: 8 }}
          >
            Tap Edit to add items
          </Text>
        )}
        {entries.slice(0, 8).map((entry) => (
          <TouchableOpacity
            key={entry.id}
            style={styles.row}
            onPress={() => onToggle?.(entry.id)}
            activeOpacity={0.7}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: entry.checked }}
            accessibilityLabel={entry.text || 'List item'}
            // 44pt tall touch target — enforced via minHeight below
          >
            <Icon
              name={entry.checked ? 'checkbox-marked' : 'checkbox-blank-outline'}
              size={22}
              color={entry.checked ? theme.colors.primary : theme.colors.onSurfaceVariant}
              style={styles.checkbox}
            />
            <Text
              variant="bodyMedium"
              numberOfLines={1}
              style={[
                styles.entryText,
                entry.checked && {
                  textDecorationLine: 'line-through',
                  color: theme.colors.onSurfaceVariant,
                },
              ]}
            >
              {entry.text || '—'}
            </Text>
          </TouchableOpacity>
        ))}
        {entries.length > 8 && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingTop: 4 }}>
            +{entries.length - 8} more
          </Text>
        )}
      </View>

      {/* "Done" affordance — only shown when all items are checked and parent wires onComplete */}
      {allDone && !!onComplete && (
        <Button
          mode="contained-tonal"
          compact
          icon="check-circle-outline"
          onPress={onComplete}
          style={styles.doneButton}
          contentStyle={styles.doneButtonContent}
          labelStyle={styles.doneButtonLabel}
          accessibilityLabel="All done — remove this list"
        >
          Done — remove?
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 8,   // top 8pt for BaseWidget drag-handle overlay
    paddingBottom: 8,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  titleRow: {
    // Bottom border accent under the title
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.12)',
    paddingBottom: 6,
    marginBottom: 4,
  },
  title: {
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44, // ≥ 44pt touch target
  },
  checkbox: {
    marginRight: 8,
  },
  entryText: {
    flex: 1,
  },
  doneButton: {
    marginTop: 8,
    borderRadius: 8,
    alignSelf: 'center',
  },
  doneButtonContent: {
    height: 32,
  },
  doneButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
});
