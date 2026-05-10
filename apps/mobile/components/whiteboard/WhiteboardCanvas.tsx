import { Platform, TextInput, useColorScheme, useWindowDimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import type { WhiteboardItem } from '@realestate-crm/types';
import { CANVAS_BG, CANVAS_DOT_COLOR } from './whiteboardColors';
import { WhiteboardItemView } from './WhiteboardItemView';
import { WhiteboardEmptyState } from './WhiteboardEmptyState';
import {
  clampCameraAxis,
  rubberbandCameraAxis,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  type ContentBounds,
} from './whiteboardWorld';

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

// World-anchored coarse grid (DESIGN.md §1, addendum 2026-05-10).
// Heavier dots every COARSE_SPACING world-pt that translate WITH the world,
// not the viewport. They give users a sense of motion when panning across
// empty space — without them, the viewport-fixed fine grid looks identical
// at every position and the canvas feels like it isn't moving.
const COARSE_SPACING = 200; // world-pt between coarse dots
const COARSE_DOT_SIZE = 4;  // world-pt — scales with camera

// Spring config for snap-back when a gesture ends past the bounds. Lighter
// than the default — the snap should feel like elastic, not a magnet.
const SNAP_BACK_SPRING = {
  damping: 18,
  mass: 0.6,
  stiffness: 180,
} as const;

interface Props {
  items: WhiteboardItem[];
  /** Camera shared values lifted up so whiteboard.tsx can read viewport for placement. */
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  /**
   * Effective pan bounds — items' bounding box padded by ~one viewport.
   * Falls back to the full world rect when the board is empty (parent's
   * responsibility). The camera is clamped to this rect with rubberband
   * resistance during gestures and a spring snap-back on `.onEnd`.
   */
  bounds: ContentBounds;
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
 * - Coarse world-anchored dots every 200pt — orientation cue when panning
 *   across empty space.
 *
 * Gesture model (mode-free):
 * - Single-finger canvas pan: always-on for empty-space touches. High
 *   minDistance (iOS 8 / Android 14) avoids accidental pans during item taps.
 * - Two-finger pan: always moves the camera.
 * - Two-finger pinch: zooms 0.4–2.0x, anchored to focal point.
 * - Item interactions are handled in WhiteboardItemView:
 *     Tap → bring to front. Long-press → open editor. Drag → move item.
 *
 * Bounds (2026-05-10): The camera clamps to a CONTENT-padded rect rather
 * than the abstract world rect. During pan/pinch the user can overshoot
 * with rubberband resistance; on `.onEnd` the camera springs back to the
 * clamped position. Result: users can't drift into empty world (the bug
 * that started this rewrite) but still feel free to add items in open space.
 */
export function WhiteboardCanvas({
  items,
  cameraX,
  cameraY,
  cameraScale,
  bounds,
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

  // Bounds are captured into the worklet bodies as plain numbers (same
  // pattern as `viewportW` from useWindowDimensions). Worklet capture is
  // by-value at gesture-creation time, and `Gesture.Pinch()` / `Gesture.Pan()`
  // build a fresh gesture object every render, so the worklet always sees
  // the latest bounds without any SharedValue indirection.
  //
  // Earlier rev hoisted bounds onto SharedValues and reassigned them inline
  // (`boundsMinX = bounds.minX`), which trips Reanimated 4 strict-mode
  // ("Writing to `value` during component render"). The plain-capture pattern
  // here avoids the warning entirely and is also less code.
  const { minX: boundsMinX, minY: boundsMinY, maxX: boundsMaxX, maxY: boundsMaxY } = bounds;

  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startScale = useSharedValue(1);
  const startFocalX = useSharedValue(0);
  const startFocalY = useSharedValue(0);

  // Unified two-finger gesture: handles BOTH pinch-zoom AND two-finger pan in
  // a single handler. The previous design used a separate `Gesture.Pan()` with
  // .minPointers(2) running simultaneously with this pinch handler — that
  // produced a race where both wrote to cameraX/cameraY each frame, causing
  // the minimap viewport rect to flicker between two values during pinch.
  //
  //   // Solution: track the *current* focal point (`e.focalX/Y`) on the LHS of the
  //   // algebra. The world point originally under (startFocalX, startFocalY) at
  //   // scaleOld is anchored to (e.focalX, e.focalY) at scaleNew. This handles both
  //   // scale change AND centroid translation in one update, so two-finger drag
  //   // without zoom (e.scale ≈ 1) still produces clean panning via the same
  //   // formula:  cameraX_new = e.focalX - startFocalX + startX  when scaleNew=scaleOld.
  //
  // Form A transform: screen = camera + world * scale.
  // worldX_at_startFocal = (startFocalX - startX) / scaleOld
  // We want that same world point at e.focalX at scaleNew:
  //   e.focalX = cameraX_new + worldX_at_startFocal * scaleNew
  //   → cameraX_new = e.focalX - (startFocalX - startX) * (scaleNew / scaleOld)
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

      const rawX = e.focalX - (startFocalX.value - startX.value) * (scaleNew / scaleOld);
      const rawY = e.focalY - (startFocalY.value - startY.value) * (scaleNew / scaleOld);
      // Rubberband instead of hard-clamp during the gesture so users feel the
      // edge instead of slamming into it. The trailing snap-back happens in
      // .onEnd below.
      cameraX.value = rubberbandCameraAxis(
        rawX,
        viewportW,
        boundsMinX,
        boundsMaxX,
        scaleNew,
      );
      cameraY.value = rubberbandCameraAxis(
        rawY,
        viewportH,
        boundsMinY,
        boundsMaxY,
        scaleNew,
      );

      if (__DEV__) {
        console.log(
          `[whiteboard:pinch] gestureScale=${e.scale.toFixed(4)} scaleOld=${scaleOld.toFixed(4)} scaleNew=${scaleNew.toFixed(4)}` +
          ` startFocalX=${startFocalX.value.toFixed(1)} startFocalY=${startFocalY.value.toFixed(1)}` +
          ` eFocalX=${e.focalX.toFixed(1)} eFocalY=${e.focalY.toFixed(1)}` +
          ` startX=${startX.value.toFixed(1)} startY=${startY.value.toFixed(1)}` +
          ` rawX=${rawX.toFixed(1)} rawY=${rawY.toFixed(1)}` +
          ` cameraX.value=${cameraX.value.toFixed(1)} cameraY.value=${cameraY.value.toFixed(1)}`,
        );
      }
    })
    .onEnd(() => {
      // Spring back to the strict clamp boundary. If the user finished inside
      // bounds, clampCameraAxis returns the same value and withSpring is a
      // no-op. If they overshot, this animates the rubberbanded position
      // back into the valid range with a soft elastic feel.
      const scale = cameraScale.value;
      cameraX.value = withSpring(
        clampCameraAxis(cameraX.value, viewportW, boundsMinX, boundsMaxX, scale),
        SNAP_BACK_SPRING,
      );
      cameraY.value = withSpring(
        clampCameraAxis(cameraY.value, viewportH, boundsMinY, boundsMaxY, scale),
        SNAP_BACK_SPRING,
      );
    });

  // Single-finger canvas pan — empty-space only. We attach this to a dedicated
  // background layer behind all widgets so buttons and item gestures are never
  // competing with the canvas for the same one-finger touch stream.
  // Higher minDistance than items (iOS 8 vs item's 4) so a brief tap near a
  // widget edge doesn't accidentally trigger a camera pan.
  // Android bumped further (14pt) to match the item's raised 8pt threshold —
  // keeping the ratio consistent avoids canvas pan winning over nearby taps on
  // noisy Android touchscreens. If a second finger lands after this pan has
  // already begun, we fail it immediately so the pinch gesture becomes the only
  // camera writer for the rest of that multi-touch interaction.
  const CANVAS_PAN_MIN_DISTANCE = Platform.select({ android: 14, default: 8 });

  const movePan = Gesture.Pan()
    .minPointers(1)
    .maxPointers(1)
    .minDistance(CANVAS_PAN_MIN_DISTANCE)
    .onTouchesDown((e, stateManager) => {
      if (e.numberOfTouches > 1) {
        stateManager.fail();
      }
    })
    .onStart(() => {
      startX.value = cameraX.value;
      startY.value = cameraY.value;
    })
    .onUpdate((e) => {
      // Rubberband during the drag; snap back in .onEnd.
      cameraX.value = rubberbandCameraAxis(
        startX.value + e.translationX,
        viewportW,
        boundsMinX,
        boundsMaxX,
        cameraScale.value,
      );
      cameraY.value = rubberbandCameraAxis(
        startY.value + e.translationY,
        viewportH,
        boundsMinY,
        boundsMaxY,
        cameraScale.value,
      );
    })
    .onEnd(() => {
      const scale = cameraScale.value;
      cameraX.value = withSpring(
        clampCameraAxis(cameraX.value, viewportW, boundsMinX, boundsMaxX, scale),
        SNAP_BACK_SPRING,
      );
      cameraY.value = withSpring(
        clampCameraAxis(cameraY.value, viewportH, boundsMinY, boundsMaxY, scale),
        SNAP_BACK_SPRING,
      );
    });

  // DEV-ONLY: animated props for the camera state overlay.
  // Reanimated's useAnimatedProps must drive `text` (the private TextInput
  // animatable prop), NOT `value` (React's controlled-input prop) — `value`
  // goes through React reconciliation and won't update from the UI thread.
  // The `text` prop is the documented Reanimated pattern for animated text.
  const debugOverlayProps = useAnimatedProps(() => {
    return {
      // `text` is the documented Reanimated-only animatable prop on TextInput.
      // It's not a public React prop, so we cast through `any` (standard
      // Reanimated pattern — see docs on createAnimatedComponent for TextInput).
      text:
        `cameraX: ${cameraX.value.toFixed(1)}\n` +
        `cameraY: ${cameraY.value.toFixed(1)}\n` +
        `scale:   ${cameraScale.value.toFixed(4)}`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  });

  const cameraStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: cameraX.value },
      { translateY: cameraY.value },
      { scale: cameraScale.value },
    ],
  }));

  return (
    <GestureDetector gesture={cameraPinch}>
      <View style={[styles.viewport, { backgroundColor: canvasBg }]}>
        {/* Fine-grained dot grid — viewport-fixed (always shown). */}
        <DotGrid dotColor={dotColor} />

        {/* Empty-space pan layer — sits behind widgets so one-finger camera pan
            only starts from bare canvas, not from item bodies or buttons. */}
        <GestureDetector gesture={movePan}>
          <View style={StyleSheet.absoluteFill} />
        </GestureDetector>

        {/* World layer — items rendered absolutely in world space.
            The coarse orientation grid is rendered FIRST so it sits behind the
            items but inside the same camera transform; `pointerEvents="none"`
            keeps it out of hit testing. */}
        <Animated.View style={[styles.world, cameraStyle]} pointerEvents="box-none">
          <CoarseWorldGrid dotColor={dotColor} />
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
            // Initial text — gets replaced by useAnimatedProps `text` updates on UI thread.
            defaultValue={'cameraX: …\ncameraY: …\nscale:   …'}
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

/**
 * Coarse, world-anchored orientation dots.
 *
 * Lives inside the camera-transformed world layer, so they translate AND
 * scale with the camera — meaning they slide past as the user pans, giving
 * the empty parts of the canvas a sense of motion. Without this the
 * viewport-fixed fine grid looks identical at every position and panning
 * across empty space feels like the canvas isn't moving at all (one of the
 * symptoms in the 2026-05-10 video).
 *
 * 21×21 dots at 200pt spacing covers 4000×4000pt — the full world. We render
 * View dots rather than something fancier (SVG/canvas) because RN Views are
 * the cheapest option and a 441-element grid is fine on phones; profiling
 * showed it's a no-op next to the dynamic item list.
 */
const COARSE_COLS_ARR = Array.from({ length: Math.ceil(WORLD_WIDTH / COARSE_SPACING) + 1 });
const COARSE_ROWS_ARR = Array.from({ length: Math.ceil(WORLD_HEIGHT / COARSE_SPACING) + 1 });

function CoarseWorldGrid({ dotColor }: { dotColor: string }) {
  return (
    <View
      style={[
        styles.coarseGridLayer,
        { width: WORLD_WIDTH, height: WORLD_HEIGHT },
      ]}
      pointerEvents="none"
    >
      {COARSE_ROWS_ARR.map((_, rowIdx) =>
        COARSE_COLS_ARR.map((_, colIdx) => (
          <View
            key={`${rowIdx}-${colIdx}`}
            style={[
              styles.coarseDot,
              {
                backgroundColor: dotColor,
                left: colIdx * COARSE_SPACING - COARSE_DOT_SIZE / 2,
                top: rowIdx * COARSE_SPACING - COARSE_DOT_SIZE / 2,
              },
            ]}
          />
        )),
      )}
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
    // CRITICAL: transformOrigin default in RN is '50% 50%' (the element's
    // center). For a 4000×4000 world layer, that means `scale(s)` shifts all
    // children by (1-s) * 2000 on each axis — at scale=0.64 that's 720pt of
    // offset, pushing every item off-screen.
    //
    // Setting origin to top-left makes the camera transform math actually
    // match its written form: `screen = cameraXY + world * scale`. Without
    // this, every camera-clamp / minimap-projection / item-placement
    // calculation in this codebase is silently wrong at any scale != 1.0.
    //
    // Symptom this fixes: items rendered correctly at scale=1.0 but
    // disappeared as soon as the user zoomed out, even though minimap +
    // dev overlay said they should be visible.
    transformOrigin: '0% 0%',
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
  coarseGridLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  coarseDot: {
    position: 'absolute',
    width: COARSE_DOT_SIZE,
    height: COARSE_DOT_SIZE,
    borderRadius: COARSE_DOT_SIZE / 2,
    // Slight transparency keeps it from competing with the fine grid up close
    // while remaining visible enough to feel motion when panning.
    opacity: 0.5,
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
