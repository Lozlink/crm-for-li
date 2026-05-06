import { useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, View, Vibration, type LayoutChangeEvent } from 'react-native';
// expo-haptics added for iOS light impact on mode toggle. Requires a native
// rebuild — the user is already rebuilding for expo-image-picker, so this dep
// rides along at no extra cost.
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { TouchableRipple, IconButton, Surface, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { WhiteboardMode } from './types';

// Matches SPRING_LIFT/SPRING_DROP feel from WhiteboardItemView
const SPRING_TOGGLE = { mass: 0.3, damping: 18, stiffness: 260 } as const;

const PILL_HEIGHT = 36;

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
  /** Opens the OverviewSheet — a searchable list of all items on the board. */
  onRequestOverview: () => void;
  onClose: () => void;
}

/**
 * Bottom-anchored toolbar for the whiteboard.
 *
 * - Close (left): back to Hub.
 * - Sliding segmented-control pill (center): Move / Edit toggle with spring
 *   animation and a brief vibration on toggle.
 * - Add (right): opens the AddWidgetSheet (DESIGN.md §8).
 *
 * Honors Android nav bar safe-area inset (project gotcha — fullscreen routes
 * need explicit bottom padding).
 *
 * Design spec: DESIGN.md §2, §8.
 * Copy rules: "Add to your board", "Quick note", "To-do" — not "sticky"/"widget".
 */
export function WhiteboardToolbar({ mode, onModeChange, onRequestAdd, onRequestSuggestions, onRequestOverview, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Tracks the last mode we actually animated to. `null` until the pill has
  // measured itself (initial mount — snap, no haptic). Once non-null, an
  // incoming `mode` that differs from this is a real user toggle and fires
  // the spring + haptic. Keying off mode (not segmentWidth) avoids the prior
  // race where a layout-only re-render was treated as a toggle and buzzed
  // the device on every screen mount.
  const prevModeRef = useRef<WhiteboardMode | null>(null);
  const [segmentWidth, setSegmentWidth] = useState(0);

  const indicatorX = useSharedValue(0);

  useEffect(() => {
    if (segmentWidth === 0) return;
    const targetX = mode === 'edit' ? segmentWidth : 0;
    if (prevModeRef.current === null) {
      // First measurement — snap into place without animation or haptic.
      indicatorX.value = targetX;
      prevModeRef.current = mode;
      return;
    }
    if (prevModeRef.current === mode) {
      // Width changed (rotation, layout reflow) but mode didn't — re-pin
      // silently. No haptic; nothing the user did.
      indicatorX.value = targetX;
      return;
    }
    // Real mode change.
    indicatorX.value = withSpring(targetX, SPRING_TOGGLE);
    // iOS Vibration.vibrate is a no-op for short pulses; use expo-haptics light
    // impact instead. Android keeps the short Vibration.vibrate path.
    if (Platform.OS === 'android') {
      Vibration.vibrate(30);
    } else if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    prevModeRef.current = mode;
  }, [mode, segmentWidth]);

  const handlePillLayout = (e: LayoutChangeEvent) => {
    const half = e.nativeEvent.layout.width / 2;
    setSegmentWidth(half);
    // Don't touch prevModeRef here — the effect owns first-mount initialization.
    // Pre-empting it caused the every-mount buzz this fix is replacing.
  };

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
  }));

  // Text colors: active segment gets onPrimary, inactive gets onSurfaceVariant.
  const moveIsActive = mode === 'move';
  const editIsActive = mode === 'edit';

  const handleModeChange = (next: WhiteboardMode) => {
    if (next !== mode) onModeChange(next);
  };

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

      {/* Sliding segmented pill */}
      <View
        style={[
          styles.pill,
          { backgroundColor: theme.colors.surfaceVariant },
        ]}
        onLayout={handlePillLayout}
      >
        {/* Sliding indicator — sits behind the labels */}
        <Animated.View
          style={[
            styles.indicator,
            { backgroundColor: theme.colors.primary, width: segmentWidth || '50%' },
            indicatorStyle,
          ]}
          pointerEvents="none"
        />

        {/* Move segment */}
        <TouchableRipple
          onPress={() => handleModeChange('move')}
          borderless
          style={styles.pillHalf}
          accessibilityRole="button"
          accessibilityLabel="Switch to Move mode"
          accessibilityState={{ selected: moveIsActive }}
        >
          <View style={styles.pillSegment}>
            <Icon
              name="cursor-move"
              size={15}
              color={moveIsActive ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}
            />
            <Animated.Text
              style={[
                styles.pillLabel,
                { color: moveIsActive ? theme.colors.onPrimary : theme.colors.onSurfaceVariant },
              ]}
            >
              Move
            </Animated.Text>
          </View>
        </TouchableRipple>

        {/* Edit segment */}
        <TouchableRipple
          onPress={() => handleModeChange('edit')}
          borderless
          style={styles.pillHalf}
          accessibilityRole="button"
          accessibilityLabel="Switch to Edit mode"
          accessibilityState={{ selected: editIsActive }}
        >
          <View style={styles.pillSegment}>
            <Icon
              name="pencil-outline"
              size={15}
              color={editIsActive ? theme.colors.onPrimary : theme.colors.onSurfaceVariant}
            />
            <Animated.Text
              style={[
                styles.pillLabel,
                { color: editIsActive ? theme.colors.onPrimary : theme.colors.onSurfaceVariant },
              ]}
            >
              Edit
            </Animated.Text>
          </View>
        </TouchableRipple>
      </View>

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

      {/* Overview — opens the OverviewSheet (searchable item list). */}
      <View style={styles.sideButton}>
        <IconButton
          icon="format-list-bulleted-square"
          size={24}
          iconColor={theme.colors.onSurfaceVariant}
          onPress={onRequestOverview}
          accessibilityLabel="List"
          accessibilityRole="button"
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
  pill: {
    height: PILL_HEIGHT,
    borderRadius: PILL_HEIGHT / 2,
    overflow: 'hidden',
    flexDirection: 'row',
    marginHorizontal: 8,
    flex: 1,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: PILL_HEIGHT / 2,
  },
  pillHalf: {
    flex: 1,
  },
  pillSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
  },
  pillLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
