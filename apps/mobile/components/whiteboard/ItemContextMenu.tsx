import { StyleSheet, View, useColorScheme } from 'react-native';
import { Button, Dialog, IconButton, Portal, Text, useTheme } from 'react-native-paper';
import type { WhiteboardItem } from '@realestate-crm/types';
import { STICKY_COLOR_DEFS, stickyColorKey, stickyColorForScheme } from './whiteboardColors';

interface Props {
  item: WhiteboardItem | null;
  onDismiss: () => void;
  onDelete: (id: string) => void;
  onBringToFront: (id: string) => void;
  onChangeColor: (id: string, color: string) => void;
}

/**
 * Long-press context menu for an item.
 * Shows: bring-to-front, change color (sticky only), delete.
 *
 * Dialog.Actions children are plain Buttons — never Fragments.
 */
export function ItemContextMenu({
  item,
  onDismiss,
  onDelete,
  onBringToFront,
  onChangeColor,
}: Props) {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  if (!item) return null;

  // Phase 2 widget types fall back to a generic title — the long-press
  // context menu is meaningful for any widget but only sticky has the
  // colour-picker affordance below.
  const labelByType: Partial<Record<typeof item.type, string>> = {
    sticky: 'Sticky note',
    checklist: 'Checklist',
    photo: 'Photo',
    contact: 'Contact card',
    property: 'Property card',
    map: 'Map snippet',
    goal: 'Goal',
    suggestion: 'Suggestion',
  };

  return (
    <Portal>
      <Dialog visible={!!item} onDismiss={onDismiss}>
        <Dialog.Title>{labelByType[item.type] ?? 'Item'}</Dialog.Title>
        <Dialog.Content>
          <Button
            icon="arrange-bring-to-front"
            mode="text"
            style={styles.action}
            onPress={() => {
              onBringToFront(item.id);
              onDismiss();
            }}
          >
            Bring to front
          </Button>

          {item.type === 'sticky' && (
            <View>
              <Text variant="labelMedium" style={styles.swatchLabel}>
                Color
              </Text>
              <View style={styles.swatchRow}>
                {STICKY_COLOR_DEFS.map((def) => {
                  const key = stickyColorKey(def);
                  const displayColor = stickyColorForScheme(def, colorScheme);
                  const selected = item.color === key;
                  return (
                    <IconButton
                      key={key}
                      accessibilityLabel={def.name}
                      icon={selected ? 'check' : 'circle'}
                      iconColor={selected ? '#1A1A1A' : displayColor}
                      size={20}
                      containerColor={displayColor}
                      onPress={() => onChangeColor(item.id, key)}
                    />
                  );
                })}
              </View>
            </View>
          )}

          <Button
            icon="trash-can-outline"
            mode="text"
            textColor={theme.colors.error}
            style={styles.action}
            onPress={() => {
              onDelete(item.id);
              onDismiss();
            }}
          >
            Delete
          </Button>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Done</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  action: {
    alignSelf: 'flex-start',
    marginVertical: 2,
  },
  swatchLabel: {
    marginTop: 8,
    marginBottom: 4,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
});
