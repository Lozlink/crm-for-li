import { StyleSheet, View } from 'react-native';
import { IconButton, Surface, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  /**
   * Tapped when the user wants to add a widget. The route owns the
   * AddWidgetSheet (DESIGN.md §8) — the toolbar just signals intent.
   */
  onRequestAdd: () => void;
  /**
   * Opens the IntelligenceSidebar (DESIGN.md §12).
   * Accessibility label: "Suggestions for your board" (NOT "AI suggestions").
   */
  onRequestSuggestions: () => void;
  /** Opens the OverviewSheet — a searchable list of all items on the board. */
  onRequestOverview: () => void;
  onClose: () => void;
}

/**
 * Bottom-anchored toolbar for the whiteboard.
 *
 * Layout (left → right):
 *   Close | [flex spacer] | List (overview) | Suggestions | Add
 *
 * The Move/Edit toggle pill has been removed. Gesture model is now:
 *   Tap item → bring to front
 *   Long-press item → open editor
 *   Drag item → move
 *   Single-finger empty space → pan canvas
 *
 * Honors Android nav bar safe-area inset (project gotcha — fullscreen routes
 * need explicit bottom padding).
 *
 * Design spec: DESIGN.md §2, §8.
 */
export function WhiteboardToolbar({ onRequestAdd, onRequestSuggestions, onRequestOverview, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Surface
      elevation={3}
      style={[
        styles.bar,
        {
          backgroundColor: theme.colors.surface,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}
    >
      {/* Close — back to Hub */}
      <IconButton
        icon="close"
        size={24}
        onPress={onClose}
        accessibilityLabel="Close whiteboard"
        style={styles.sideButton}
      />

      {/* Spacer — fills center so action buttons stay right-aligned */}
      <View style={styles.spacer} />

      {/* Overview — opens the OverviewSheet (searchable item list). */}
      <IconButton
        icon="format-list-bulleted-square"
        size={24}
        iconColor={theme.colors.onSurfaceVariant}
        onPress={onRequestOverview}
        accessibilityLabel="List"
        accessibilityRole="button"
        style={styles.sideButton}
      />

      {/* Intelligence trigger — opens IntelligenceSidebar. Always enabled.
          Accessibility label: "Suggestions for your board" (no "AI" language — DESIGN.md §12). */}
      <IconButton
        icon="lightbulb-on-outline"
        size={24}
        iconColor={theme.colors.onSurfaceVariant}
        onPress={onRequestSuggestions}
        accessibilityLabel="Suggestions for your board"
        accessibilityRole="button"
        style={styles.sideButton}
      />

      {/* Add — opens the AddWidgetSheet. */}
      <IconButton
        icon="plus-circle"
        size={28}
        iconColor={theme.colors.primary}
        onPress={onRequestAdd}
        accessibilityLabel="Add to your board"
        style={styles.sideButton}
      />
    </Surface>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  spacer: {
    flex: 1,
  },
  sideButton: {
    width: 48,
    alignItems: 'center',
  },
});
