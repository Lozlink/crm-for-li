import { Platform, TextInput, useColorScheme, useWindowDimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';
import type { WhiteboardItem } from '@realestate-crm/types';
import { CANVAS_BG, CANVAS_DOT_COLOR } from './whiteboardColors';
import { WhiteboardItemView } from './WhiteboardItemView';
import { WhiteboardEmptyState } from './WhiteboardEmptyState';
import { WORLD_WIDTH, WORLD_HEIGHT, clampCameraTranslate } from './whiteboardWorld';

// DEV-ONLY: Animated TextInput for the camera debug overlay.
// createAnimatedComponent lets useAnimatedProps drive the `value` prop
// on the UI thread at 60fps without any JS-thread involvement.
const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

// Dot grid constants (DESIGN.md §1)
const DOT_SPACING = 16;    // pt between dots
const DOT_SIZE = 2;        // pt diameter

// Number of dot columns/rows — enough to cover the largest phone screen.
// At DOT_SPACING=16: 30 cols × 480pt, 60 rows × 960pt.
const DOT_COLS = 30;
const DOT_ROWS = 60;

interface Props {
  items: WhiteboardItem[];
  /** Camera shared values lifted up so whiteboard.tsx can read viewport for placement. */
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  onRequestEdit: (id: string) => void;
  onRequestContext: (id: string) => void;
  onToggleChecklistEntry: (itemId: string, entryId: string) => void;
  onDelete: (id: string) => void;
  onCompleteChecklist?: (id: string) => void;
}

/**
 * Infinite-pan canvas hosting all whiteboard items.
 *
 * Design tokens (DESIGN.md §1):
 * - Warm canvas bg: light #F5F0E8 / dark #1E1C1A — feels like cork board, not CRM.
 * - Dot grid: 2pt dots on 16pt grid, viewport-fixed overlay (always shown).
 *
 * Gesture model (mode-free):
 * - Single-finger canvas pan: always-on for empty-space touches. High
 *   minDistance (iOS 8 / Android 14) avoids accidental pans during item taps.
 * - Two-finger pan: always moves the camera.
 * - Two-finger pinch: zooms 0.4–2.0x, anchored to focal point.
 * - Item interactions are handled in WhiteboardItemView:
 *     Tap → bring to front. Long-press → open editor. Drag → move item.
 */
export function WhiteboardCanvas({
  items,
  cameraX,
  cameraY,
  cameraScale,
  onRequestEdit,
  onRequestContext,
  onToggleChecklistEntry,
  onDelete,
  onCompleteChecklist,
}: Props) {
  const colorScheme = useColorScheme();
  const canvasBg = colorScheme === 'dark' ? CANVAS_BG.dark : CANVAS_BG.light;
  const dotColor = colorScheme === 'dark' ? CANVAS_DOT_COLOR.dark : CANVAS_DOT_COLOR.light;
  const { width: viewportW, height: viewportH } = useWindowDimensions();

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);

  // Two-finger camera pan. Clamps so the user can't pan past the world edges;
  // without this the canvas felt boundless and items could vanish into empty space.
  const cameraPan = Gesture.Pan()
    .minPointers(2)
    .maxPointers(2)
    .onStart(() => {
      startX.value = cameraX.value;
      startY.value = cameraY.value;
    })
    .onUpdate((e) => {
      cameraX.value = clampCameraTranslate(
        startX.value + e.translationX,
        viewportW,
        WORLD_WIDTH,
        cameraScale.value,
      );
      cameraY.value = clampCameraTranslate(
        startY.value + e.translationY,
        viewportH,
        WORLD_HEIGHT,
        cameraScale.value,
      );
    });

  // Pinch zoom — DESIGN.md canvas v2. Clamped to [0.4, 2.0] to keep widgets readable.
  //
  // Focal-point algebra (ensures the world point under the pinch stays fixed):
  //   World transform: screen = camera + world * scale
  //   So worldX_at_focal = (focalX - camera_old) / scale_old
  //   We want that same world point to be at focalX after the zoom:
  //     focalX = camera_new + worldX_at_focal * scale_new
  //   → camera_new = focalX - worldX_at_focal * scale_new
  //               = focalX - (focalX - camera_old) * (scale_new / scale_old)
  const cameraPinch = Gesture.Pinch()
    .onStart((e) => {
      startScale.value = cameraScale.value;
      startX.value = cameraX.value;
      startY.value = cameraY.value;
      startFocalX.value = e.focalX;
      startFocalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const scaleOld = startScale.value;
      const scaleNew = Math.max(0.4, Math.min(2.0, scaleOld * e.scale));
      cameraScale.value = scaleNew;

      // Adjust camera so the focal world point stays pinned to the focal screen coord.
      const rawX = startFocalX.value - (startFocalX.value - startX.value) * (scaleNew / scaleOld);
      const rawY = startFocalY.value - (startFocalY.value - startY.value) * (scaleNew / scaleOld);
      cameraX.value = clampCameraTranslate(rawX, viewportW, WORLD_WIDTH, scaleNew);
      cameraY.value = clampCameraTranslate(rawY, viewportH, WORLD_HEIGHT, scaleNew);

      if (__DEV__) {
        const clampedX = clampCameraTranslate(rawX, viewportW, WORLD_WIDTH, scaleNew);
        const clampedY = clampCameraTranslate(rawY, viewportH, WORLD_HEIGHT, scaleNew);
        console.log(
          `[whiteboard:pinch] gestureScale=${e.scale.toFixed(4)} scaleOld=${scaleOld.toFixed(4)} scaleNew=${scaleNew.toFixed(4)}` +
          ` startFocalX=${startFocalX.value.toFixed(1)} startFocalY=${startFocalY.value.toFixed(1)}` +
          ` startX=${startX.value.toFixed(1)} startY=${startY.value.toFixed(1)}` +
          ` rawX=${rawX.toFixed(1)} rawY=${rawY.toFixed(1)}` +
          ` clampedX=${clampedX.toFixed(1)} clampedY=${clampedY.toFixed(1)}` +
          ` cameraX.value=${cameraX.value.toFixed(1)} cameraY.value=${cameraY.value.toFixed(1)}`,
        );
      }
    });

  // Single-finger canvas pan — always-on. Item gestures take precedence for
  // touches landing on a widget; this only fires for touches on empty world
  // space. Higher minDistance than items (iOS 8 vs item's 4) so a brief tap on
  // an item doesn't accidentally trigger a canvas pan.
  // Android bumped further (14pt) to match the item's raised 8pt threshold —
  // keeping the ratio consistent avoids canvas pan winning over item taps on
  // noisy Android touchscreens.
  const CANVAS_PAN_MIN_DISTANCE = Platform.select({ android: 14, default: 8 });

  const movePan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(CANVAS_PAN_MIN_DISTANCE)
    .onStart(() => {
      startX.value = cameraX.value;
      startY.value = cameraY.value;
    })
    .onUpdate((e) => {
      cameraX.value = clampCameraTranslate(
        startX.value + e.translationX,
        viewportW,
        WORLD_WIDTH,
        cameraScale.value,
      );
      cameraY.value = clampCameraTranslate(
        startY.value + e.translationY,
        viewportH,
        WORLD_HEIGHT,
        cameraScale.value,
      );
    });

  // All three compose simultaneously — pan + pinch can fire together with
  // two fingers, single-finger move pan with one. Items still win for touches
  // on widgets via RNGH child-gesture precedence.
  const cameraGestures = Gesture.Simultaneous(cameraPan, cameraPinch, movePan);

  // DEV-ONLY: animated props for the camera state overlay.
  // Called unconditionally to satisfy rules-of-hooks; the overlay JSX is
  // only rendered when __DEV__ is true so it dead-code-eliminates in prod.
  // useAnimatedProps runs on the UI thread driven directly by shared values —
  // the overlay updates at 60fps without any JS-thread roundtrip.
  const debugOverlayProps = useAnimatedProps(() => ({
    value:
      `cameraX: ${cameraX.value.toFixed(1)}\n` +
      `cameraY: ${cameraY.value.toFixed(1)}\n` +
      `scale:   ${cameraScale.value.toFixed(4)}`,
  }));

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
        {/* Dot grid — always visible, fixed to viewport */}
        <DotGrid dotColor={dotColor} />

        {/* World layer — items rendered absolutely in world space */}
        <Animated.View style={[styles.world, cameraStyle]} pointerEvents="box-none">
          {items.map((it) => (
            <WhiteboardItemView
              key={it.id}
              item={it}
              onRequestEdit={onRequestEdit}
              onRequestContext={onRequestContext}
              onToggleChecklistEntry={onToggleChecklistEntry}
              onDelete={onDelete}
              onCompleteChecklist={onCompleteChecklist}
            />
          ))}
        </Animated.View>

        {/* Empty state — only shown when there are no items */}
        {items.length === 0 && <WhiteboardEmptyState />}

        {/* DEV-ONLY: camera state overlay — shows live cameraX/cameraY/scale as
            text so the user can screenshot exact values during repro without
            needing Metro. Driven by useAnimatedProps so it updates on the UI
            thread at 60fps. Strips from production via Metro dead-code elimination
            on __DEV__. */}
        {__DEV__ && (
          <AnimatedTextInput
            animatedProps={debugOverlayProps}
            editable={false}
            multiline
            pointerEvents="none"
            style={styles.debugOverlay}
          />
        )}
      </View>
    </GestureDetector>
  );
}

/**
 * Viewport-fixed dot grid.
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
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
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
  debugOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.65)',
    color: '#fff',
    fontFamily: 'monospace',
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    // Prevent the TextInput from capturing any touches.
    pointerEvents: 'none',
  },
});
