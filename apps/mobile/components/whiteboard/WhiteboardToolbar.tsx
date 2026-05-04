import { StyleSheet, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { TouchableRipple, IconButton, Surface, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { WhiteboardMode } from './types';

interface Props {
  mode: WhiteboardMode;
  onModeChange: (mode: WhiteboardMode) => void;
  /**
   * Tapped when the user wants to add a widget. The route owns the
   * AddWidgetSheet (DESIGN.md §8) — the toolbar just signals intent.
   * Disabled in Move mode (only meaningful when editing).
   */
  onRequestAdd: () => void;
  /**
   * Opens the IntelligenceSidebar (DESIGN.md §12).
   * Always enabled — suggestions are available in both Move and Edit mode.
   * Accessibility label: "Suggestions for your board" (NOT "AI suggestions").
   */
  onRequestSuggestions: () => void;
  onClose: () => void;
}

// 200ms ease per DESIGN.md §2
const MODE_DURATION = 200;
const MODE_EASING = Easing.bezier(0.4, 0, 0.2, 1);

/**
 * Bottom-anchored toolbar for the whiteboard.
 *
 * - Close (left): back to Hub.
 * - Animated Mode pill (center): Move / Edit — 200ms color transition.
 * - Add (right): opens the AddWidgetSheet (DESIGN.md §8).
 *
 * Honors Android nav bar safe-area inset (project gotcha — fullscreen routes
 * need explicit bottom padding).
 *
 * Design spec: DESIGN.md §2, §8.
 * Copy rules: "Add to your board", "Quick note", "To-do" — not "sticky"/"widget".
 */
export function WhiteboardToolbar({ mode, onModeChange, onRequestAdd, onRequestSuggestions, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  // 0 = Move, 1 = Edit
  const progress = useSharedValue(mode === 'edit' ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(mode === 'edit' ? 1 : 0, {
      duration: MODE_DURATION,
      easing: MODE_EASING,
    });
  }, [mode]);

  const pillStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.surfaceVariant, theme.colors.primary],
    ),
  }));

  const moveTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.onSurfaceVariant, theme.colors.onSurface + '66'],
    ),
  }));

  const editTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [theme.colors.onSurface + '66', theme.colors.onPrimary],
    ),
  }));

  const moveIconColor = mode === 'move' ? theme.colors.onSurfaceVariant : theme.colors.onSurface + '66';
  const editIconColor = mode === 'edit' ? theme.colors.onPrimary : theme.colors.onSurface + '66';

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

      {/* Animated mode pill */}
      <Animated.View style={[styles.pill, pillStyle]}>
        <TouchableRipple
          onPress={() => onModeChange('move')}
          borderless
          style={styles.pillHalf}
          accessibilityRole="button"
          accessibilityLabel="Move mode"
          accessibilityState={{ selected: mode === 'move' }}
        >
          <View style={styles.pillSegment}>
            <Icon name="cursor-move" size={16} color={moveIconColor} />
            <Animated.Text style={[styles.pillLabel, moveTextStyle]}>
              Move
            </Animated.Text>
          </View>
        </TouchableRipple>

        <TouchableRipple
          onPress={() => onModeChange('edit')}
          borderless
          style={styles.pillHalf}
          accessibilityRole="button"
          accessibilityLabel="Edit mode"
          accessibilityState={{ selected: mode === 'edit' }}
        >
          <View style={styles.pillSegment}>
            <Icon name="pencil-outline" size={16} color={editIconColor} />
            <Animated.Text style={[styles.pillLabel, editTextStyle]}>
              Edit
            </Animated.Text>
          </View>
        </TouchableRipple>
      </Animated.View>

      {/* Add — opens the AddWidgetSheet. Only meaningful in Edit mode. */}
      <View style={styles.sideButton}>
        <IconButton
          icon="plus-circle"
          size={28}
          iconColor={theme.colors.primary}
          onPress={onRequestAdd}
          accessibilityLabel="Add to your board"
          disabled={mode === 'move'}
        />
      </View>

      {/* Intelligence trigger — opens IntelligenceSidebar. Always enabled.
          Accessibility label: "Suggestions for your board" (no "AI" language — DESIGN.md §12). */}
      <View style={styles.sideButton}>
        <IconButton
          icon="lightbulb-on-outline"
          size={24}
          iconColor={theme.colors.onSurfaceVariant}
          onPress={onRequestSuggestions}
          accessibilityLabel="Suggestions for your board"
          accessibilityRole="button"
        />
      </View>
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
  sideButton: {
    width: 48,
    alignItems: 'center',
  },
  // Pill container
  pill: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    marginHorizontal: 8,
  },
  pillHalf: {
    flex: 1,
  },
  pillSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
