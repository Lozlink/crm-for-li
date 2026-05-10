import { StyleSheet, View } from 'react-native';
import { IconButton, Surface, useTheme } from 'react-native-paper';
import { withTiming, type SharedValue } from 'react-native-reanimated';
import {
  clampCameraAxis,
  DEFAULT_WORLD_BOUNDS,
  type ContentBounds,
} from '../whiteboard/whiteboardWorld';

const ANIM_DURATION = 250;

/**
 * @deprecated Re-exported under its old name for legacy callers. New code
 * should import `ContentBounds` from `whiteboardWorld` directly.
 */
export type WorldBounds = ContentBounds;

interface Props {
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  /**
   * Effective pan bounds — items' bbox + ~one viewport of padding. Clamps
   * applied during +/- and Fit-All target this rect, so the camera never
   * lands somewhere the canvas's pan-clamp would immediately reject (which
   * showed up as the minimap viewport rect drifting into invalid space when
   * users pressed +/- repeatedly near an edge).
   */
  bounds: ContentBounds;
  /**
   * The raw items' bounding box (NOT padded). Fit-All / Reset frame this
   * tightly so items fill the viewport rather than being framed by padding.
   * Null → board is empty; Reset falls back to (0, 0, 1) in that case.
   */
  fitTarget: ContentBounds | null;
  /** Optional quick-arrange handler. When provided, a fifth button appears in the
   *  cluster that triggers the host's arrangement logic (e.g. tidy items into a grid). */
  onQuickArrange?: () => void;
  viewportW: number;
  viewportH: number;
  minScale?: number;
  maxScale?: number;
}

/**
 * Floating zoom/fit/reset controls for any Reanimated canvas.
 * Uses the same camera algebra as WhiteboardCanvas:
 *   screen_x = cameraX + worldX * scale
 * Placed absolutely by the parent — does not position itself.
 *
 * 2026-05-10: Now bounds-aware. Home button used to go to (0, 0, scale=1)
 * which dumped users in the upper-left of an empty world if items lived
 * elsewhere. Now Home → Fit-All when items exist; falls back to (0, 0, 1)
 * only on a truly empty board.
 */
export function CanvasViewControls({
  cameraX,
  cameraY,
  cameraScale,
  bounds,
  fitTarget,
  onQuickArrange,
  viewportW,
  viewportH,
  minScale = 0.4,
  maxScale = 2.0,
}: Props) {
  const theme = useTheme();

  // Zoom around the viewport center, then clamp the resulting camera so it
  // can't drift past the bounds. Without the clamp, zooming near an edge
  // would leave the camera in a position the pan gestures would immediately
  // have rejected — visible as the minimap viewport rect drifting off into
  // invalid space when the user pressed +/- repeatedly.
  const zoomAround = (next: number) => {
    const cx = viewportW / 2;
    const cy = viewportH / 2;
    const worldCx = (cx - cameraX.value) / cameraScale.value;
    const worldCy = (cy - cameraY.value) / cameraScale.value;
    const rawX = cx - worldCx * next;
    const rawY = cy - worldCy * next;
    cameraScale.value = withTiming(next, { duration: ANIM_DURATION });
    cameraX.value = withTiming(
      clampCameraAxis(rawX, viewportW, bounds.minX, bounds.maxX, next),
      { duration: ANIM_DURATION },
    );
    cameraY.value = withTiming(
      clampCameraAxis(rawY, viewportH, bounds.minY, bounds.maxY, next),
      { duration: ANIM_DURATION },
    );
  };

  const handleZoomIn = () => zoomAround(Math.min(cameraScale.value * 1.25, maxScale));
  const handleZoomOut = () => zoomAround(Math.max(cameraScale.value * 0.8, minScale));

  /**
   * Fit `target` into the viewport with 10% padding on each side, then center
   * the camera on it (clamped against the effective `bounds` rect). Shared
   * between the explicit Fit-All button and the Home button (when items exist).
   */
  const fitTo = (target: ContentBounds) => {
    const { minX, minY, maxX, maxY } = target;
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (worldW <= 0 || worldH <= 0) return;
    const PAD = 0.10;
    const sX = (viewportW * (1 - PAD * 2)) / worldW;
    const sY = (viewportH * (1 - PAD * 2)) / worldH;
    const next = Math.max(minScale, Math.min(maxScale, Math.min(sX, sY)));
    const worldCenterX = minX + worldW / 2;
    const worldCenterY = minY + worldH / 2;
    cameraScale.value = withTiming(next, { duration: ANIM_DURATION });
    cameraX.value = withTiming(
      clampCameraAxis(viewportW / 2 - worldCenterX * next, viewportW, bounds.minX, bounds.maxX, next),
      { duration: ANIM_DURATION },
    );
    cameraY.value = withTiming(
      clampCameraAxis(viewportH / 2 - worldCenterY * next, viewportH, bounds.minY, bounds.maxY, next),
      { duration: ANIM_DURATION },
    );
  };

  const handleFitAll = () => {
    if (!fitTarget) return;
    fitTo(fitTarget);
  };

  /**
   * Home behavior:
   *   - Items exist → Fit-All (frame the items, not the abstract world origin).
   *     Pre-2026-05-10 this went to (0, 0, scale=1) which left users staring
   *     at empty canvas when items lived elsewhere — exactly the "I clicked
   *     home and nothing's there" case the screen recording showed.
   *   - Empty board → reset to default origin so a brand-new user lands
   *     somewhere sensible.
   */
  const handleReset = () => {
    if (fitTarget) {
      fitTo(fitTarget);
      return;
    }
    cameraScale.value = withTiming(1, { duration: ANIM_DURATION });
    cameraX.value = withTiming(
      clampCameraAxis(0, viewportW, DEFAULT_WORLD_BOUNDS.minX, DEFAULT_WORLD_BOUNDS.maxX, 1),
      { duration: ANIM_DURATION },
    );
    cameraY.value = withTiming(
      clampCameraAxis(0, viewportH, DEFAULT_WORLD_BOUNDS.minY, DEFAULT_WORLD_BOUNDS.maxY, 1),
      { duration: ANIM_DURATION },
    );
  };

  const fitDisabled = !fitTarget;

  return (
    <Surface style={styles.container} elevation={2}>
      <IconButton
        icon="plus"
        size={20}
        onPress={handleZoomIn}
        style={styles.btn}
        accessibilityLabel="Zoom in"
      />
      <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
      <IconButton
        icon="minus"
        size={20}
        onPress={handleZoomOut}
        style={styles.btn}
        accessibilityLabel="Zoom out"
      />
      <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
      <IconButton
        icon="fit-to-screen-outline"
        size={20}
        onPress={handleFitAll}
        disabled={fitDisabled}
        style={styles.btn}
        accessibilityLabel="Fit all items"
      />
      <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
      <IconButton
        icon="home-outline"
        size={20}
        onPress={handleReset}
        style={styles.btn}
        accessibilityLabel={fitTarget ? 'Recenter on items' : 'Reset view'}
      />
      {onQuickArrange ? (
        <>
          <View style={[styles.divider, { backgroundColor: theme.colors.outlineVariant }]} />
          <IconButton
            icon="view-grid-plus-outline"
            size={20}
            onPress={onQuickArrange}
            style={styles.btn}
            accessibilityLabel="Quick arrange items into a tidy grid"
          />
        </>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    width: 44,
  },
  btn: {
    margin: 0,
    width: 44,
    height: 44,
    borderRadius: 0,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 6,
  },
});
