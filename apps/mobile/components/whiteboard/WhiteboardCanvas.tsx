import { useColorScheme, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import type { WhiteboardItem } from '@realestate-crm/types';
import type { WhiteboardMode } from './types';
import { CANVAS_BG, CANVAS_DOT_COLOR } from './whiteboardColors';
import { WhiteboardItemView } from './WhiteboardItemView';
import { WhiteboardEmptyState } from './WhiteboardEmptyState';

// Dot grid constants (DESIGN.md §1)
const DOT_SPACING = 16;    // pt between dots
const DOT_SIZE = 2;        // pt diameter

// Number of dot columns/rows — enough to cover the largest phone screen.
// At DOT_SPACING=16: 30 cols × 480pt, 60 rows × 960pt.
const DOT_COLS = 30;
const DOT_ROWS = 60;

interface Props {
  items: WhiteboardItem[];
  mode: WhiteboardMode;
  onRequestEdit: (id: string) => void;
  onRequestContext: (id: string) => void;
  onToggleChecklistEntry: (itemId: string, entryId: string) => void;
  onDelete: (id: string) => void;
}

/**
 * Infinite-pan canvas hosting all whiteboard items.
 *
 * Design tokens (DESIGN.md §1):
 * - Warm canvas bg: light #F5F0E8 / dark #1E1C1A — feels like cork board, not CRM.
 * - Dot grid (Edit mode only): 2pt dots on 16pt grid, viewport-fixed overlay.
 *
 * Gesture rules:
 * - Two-finger pan always moves the camera (works in both modes).
 * - Single-finger pan is forwarded to items in Move mode.
 */
export function WhiteboardCanvas({
  items,
  mode,
  onRequestEdit,
  onRequestContext,
  onToggleChecklistEntry,
  onDelete,
}: Props) {
  const colorScheme = useColorScheme();
  const canvasBg = colorScheme === 'dark' ? CANVAS_BG.dark : CANVAS_BG.light;
  const dotColor = colorScheme === 'dark' ? CANVAS_DOT_COLOR.dark : CANVAS_DOT_COLOR.light;

  const cameraX = useSharedValue(0);
  const cameraY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  // Two-finger pan = camera. Single-finger is reserved for item drag / tap.
  const cameraPan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onStart(() => {
      startX.value = cameraX.value;
      startY.value = cameraY.value;
    })
    .onUpdate((e) => {
      cameraX.value = startX.value + e.translationX;
      cameraY.value = startY.value + e.translationY;
    });

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cameraX.value },
      { translateY: cameraY.value },
    ],
  }));

  return (
    <GestureDetector gesture={cameraPan}>
      <View style={[styles.viewport, { backgroundColor: canvasBg }]}>
        {/* Dot grid — Edit mode only, fixed to viewport */}
        {mode === 'edit' && <DotGrid dotColor={dotColor} />}

        {/* World layer — items rendered absolutely in world space */}
        <Animated.View style={[styles.world, cameraStyle]} pointerEvents="box-none">
          {items.map((it) => (
            <WhiteboardItemView
              key={it.id}
              item={it}
              mode={mode}
              onRequestEdit={onRequestEdit}
              onRequestContext={onRequestContext}
              onToggleChecklistEntry={onToggleChecklistEntry}
              onDelete={onDelete}
            />
          ))}
        </Animated.View>

        {/* Empty state — only shown when there are no items */}
        {items.length === 0 && <WhiteboardEmptyState />}
      </View>
    </GestureDetector>
  );
}

/**
 * Viewport-fixed dot grid for Edit mode.
 * Pure RN Views — no react-native-svg dependency needed.
 * 30×60 grid at 16pt spacing fills any phone screen with 2pt dots.
 */
const DOT_ROWS_ARR = Array.from({ length: DOT_ROWS });
const DOT_COLS_ARR = Array.from({ length: DOT_COLS });

function DotGrid({ dotColor }: { dotColor: string }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {DOT_ROWS_ARR.map((_, rowIdx) => (
        <View key={rowIdx} style={styles.dotRow}>
          {DOT_COLS_ARR.map((_, colIdx) => (
            <View
              key={colIdx}
              style={[styles.dot, { backgroundColor: dotColor }]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    flex: 1,
    overflow: 'hidden',
  },
  world: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Deliberately large so absolutely-positioned items stay visible when panning.
    width: 6000,
    height: 6000,
  },
  dotRow: {
    flexDirection: 'row',
    height: DOT_SPACING,
    paddingLeft: DOT_SPACING / 2 - DOT_SIZE / 2,
    gap: DOT_SPACING - DOT_SIZE,
    alignItems: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
  },
});
