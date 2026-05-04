import { useColorScheme, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
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
  /** Camera shared values lifted up so whiteboard.tsx can read viewport for placement. */
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
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
 * Gesture rules (canvas v2):
 * - Two-finger pan always moves the camera (works in both modes).
 * - Two-finger pinch zooms 0.4-2.0x (works in both modes).
 * - Single-finger pan moves the camera in Move mode ONLY when the touch
 *   doesn't land on an item. Items have their own GestureDetector inside
 *   WhiteboardItemView (with minDistance:4) — RNGH propagation gives child
 *   gestures precedence, so the canvas only fires for empty-space touches.
 * - In Edit mode the single-finger canvas pan is disabled so inputs and
 *   tap targets inside widgets receive their touches cleanly.
 */
export function WhiteboardCanvas({
  items,
  mode,
  cameraX,
  cameraY,
  cameraScale,
  onRequestEdit,
  onRequestContext,
  onToggleChecklistEntry,
  onDelete,
}: Props) {
  const colorScheme = useColorScheme();
  const canvasBg = colorScheme === 'dark' ? CANVAS_BG.dark : CANVAS_BG.light;
  const dotColor = colorScheme === 'dark' ? CANVAS_DOT_COLOR.dark : CANVAS_DOT_COLOR.light;

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);

  // Two-finger camera pan — works in both modes.
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

  // Pinch zoom — DESIGN.md canvas v2. Clamped to [0.4, 2.0] to keep widgets readable.
  const cameraPinch = Gesture.Pinch()
    .onStart(() => {
      startScale.value = cameraScale.value;
    })
    .onUpdate((e) => {
      const next = startScale.value * e.scale;
      cameraScale.value = Math.max(0.4, Math.min(2.0, next));
    });

  // Single-finger canvas pan — Move mode only. Item gestures (with
  // minDistance:4) take precedence for touches landing on a widget; this only
  // fires for touches on empty world space. Higher minDistance than items so
  // a brief tap on an item doesn't accidentally trigger a canvas pan.
  const movePan = Gesture.Pan()
    .enabled(mode === 'move')
    .minPointers(1)
    .maxPointers(1)
    .minDistance(8)
    .onStart(() => {
      startX.value = cameraX.value;
      startY.value = cameraY.value;
    })
    .onUpdate((e) => {
      cameraX.value = startX.value + e.translationX;
      cameraY.value = startY.value + e.translationY;
    });

  // All three compose simultaneously — pan + pinch can fire together with
  // two fingers, single-finger move pan with one. Items still win for touches
  // on widgets via RNGH child-gesture precedence.
  const cameraGestures = Gesture.Simultaneous(cameraPan, cameraPinch, movePan);

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cameraX.value },
      { translateY: cameraY.value },
      { scale: cameraScale.value },
    ],
  }));

  return (
    <GestureDetector gesture={cameraGestures}>
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
