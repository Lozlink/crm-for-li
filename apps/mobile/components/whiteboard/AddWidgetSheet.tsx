import { StyleSheet, View } from 'react-native';
import {
  Modal,
  Portal,
  Surface,
  Text,
  TouchableRipple,
  useTheme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WhiteboardItemType } from '@realestate-crm/types';

interface Props {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (type: WhiteboardItemType) => void;
}

interface CellSpec {
  type: WhiteboardItemType | null; // null => "Coming soon" placeholder
  icon: string;
  label: string;
}

// DESIGN.md §8: 3 active + 4 coming-soon placeholders.
// Copy: "Quick note" / "To-do" / "Photo" — never "sticky" or "widget" in user copy.
const CELLS: CellSpec[] = [
  { type: 'sticky', icon: 'note-text-outline', label: 'Quick note' },
  { type: 'checklist', icon: 'format-list-checkbox', label: 'To-do' },
  { type: 'photo', icon: 'image-outline', label: 'Photo' },
  { type: null, icon: 'account-card-outline', label: 'Contact' },
  { type: null, icon: 'home-outline', label: 'Property' },
  { type: null, icon: 'map-marker-outline', label: 'Map' },
  { type: null, icon: 'bullseye-arrow', label: 'Goal' },
];

/**
 * Bottom-anchored "Add to your board" sheet.
 *
 * 3-column grid of widget types. Active cells (sticky/checklist/photo)
 * dispatch an `onSelect` call; "Coming soon" cells are non-interactive and
 * show their future capability at 40% opacity per DESIGN.md §8.
 *
 * Built with Paper's Modal + Portal so we don't pull in @gorhom/bottom-sheet
 * for a single Phase-1 use case. The Modal's outer style anchors the sheet
 * to the bottom of the screen via `justifyContent: 'flex-end'`.
 *
 * Honors Android nav bar safe area (project gotcha — fullscreen routes need
 * explicit bottom padding).
 */
export function AddWidgetSheet({ visible, onDismiss, onSelect }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        style={styles.modalWrap}
        contentContainerStyle={[
          styles.sheet,
          {
            backgroundColor: theme.colors.surface,
            paddingBottom: Math.max(insets.bottom + 16, 24),
          },
        ]}
      >
        {/* Handle bar — DESIGN.md §8 */}
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: theme.colors.outlineVariant }]} />
        </View>

        <Text variant="titleMedium" style={styles.header}>
          Add to your board
        </Text>

        <View style={styles.grid}>
          {CELLS.map((cell) => (
            <Cell
              key={cell.label}
              cell={cell}
              onPress={() => {
                if (cell.type) {
                  onSelect(cell.type);
                  onDismiss();
                }
              }}
            />
          ))}
        </View>
      </Modal>
    </Portal>
  );
}

interface CellProps {
  cell: CellSpec;
  onPress: () => void;
}

function Cell({ cell, onPress }: CellProps) {
  const theme = useTheme();
  const comingSoon = cell.type === null;

  // 40% opacity for non-interactive coming-soon cells.
  const dim = comingSoon ? 0.4 : 1;
  const labelColor = theme.colors.onSurface;
  const subColor = theme.colors.onSurfaceVariant;

  return (
    <View style={styles.cellWrap}>
      <TouchableRipple
        onPress={comingSoon ? undefined : onPress}
        disabled={comingSoon}
        borderless
        style={styles.cellPressable}
        accessibilityRole="button"
        accessibilityState={{ disabled: comingSoon }}
        accessibilityLabel={comingSoon ? `${cell.label} — coming soon` : cell.label}
      >
        <Surface
          elevation={comingSoon ? 0 : 1}
          style={[
            styles.cell,
            {
              backgroundColor: comingSoon ? 'transparent' : theme.colors.surfaceVariant,
              borderColor: theme.colors.outlineVariant,
              borderWidth: comingSoon ? StyleSheet.hairlineWidth : 0,
              opacity: dim,
            },
          ]}
        >
          <Icon
            name={cell.icon}
            size={28}
            color={comingSoon ? subColor : theme.colors.primary}
          />
          <Text
            variant="bodySmall"
            style={[styles.cellLabel, { color: labelColor }]}
            numberOfLines={1}
          >
            {cell.label}
          </Text>
          {comingSoon && (
            <Text
              variant="bodySmall"
              style={[styles.cellSub, { color: subColor }]}
              numberOfLines={1}
            >
              Coming soon
            </Text>
          )}
        </Surface>
      </TouchableRipple>
    </View>
  );
}

const styles = StyleSheet.create({
  modalWrap: {
    // Anchor the modal to the bottom of the screen.
    justifyContent: 'flex-end',
    margin: 0,
  },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handleWrap: {
    alignItems: 'center',
    paddingTop: 4,
    paddingBottom: 8,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    fontWeight: '700',
    marginBottom: 12,
    marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    justifyContent: 'flex-start',
    paddingTop: 4,
    paddingBottom: 8,
  },
  cellWrap: {
    width: 80,
  },
  cellPressable: {
    borderRadius: 12,
  },
  cell: {
    width: 80,
    height: 88,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    gap: 4,
  },
  cellLabel: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  cellSub: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: -2,
  },
});
