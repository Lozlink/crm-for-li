import { StyleSheet, View } from 'react-native';
import { IconButton, Surface, useTheme } from 'react-native-paper';
import { withTiming, type SharedValue } from 'react-native-reanimated';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  clampCameraTranslate,
} from '../whiteboard/whiteboardWorld';

const ANIM_DURATION = 250;

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Props {
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  worldBounds?: WorldBounds | null;
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
 */
export function CanvasViewControls({
  cameraX,
  cameraY,
  cameraScale,
  worldBounds,
  onQuickArrange,
  viewportW,
  viewportH,
  minScale = 0.4,
  maxScale = 2.0,
}: Props) {
  const theme = useTheme();

  // Zoom around the viewport center, then clamp the resulting camera so it
  // can't drift past the world bounds. Without the clamp, zooming near an
  // edge would leave the camera in a position the pan gestures would
  // immediately have rejected — visible as the minimap viewport rect drifting
  // off into invalid space when the user pressed +/- repeatedly.
  const zoomAround = (next: number) => {
    const cx = viewportW / 2;
    const cy = viewportH / 2;
    const worldCx = (cx - cameraX.value) / cameraScale.value;
    const worldCy = (cy - cameraY.value) / cameraScale.value;
    const rawX = cx - worldCx * next;
    const rawY = cy - worldCy * next;
    cameraScale.value = withTiming(next, { duration: ANIM_DURATION });
    cameraX.value = withTiming(
      clampCameraTranslate(rawX, viewportW, WORLD_WIDTH, next),
      { duration: ANIM_DURATION },
    );
    cameraY.value = withTiming(
      clampCameraTranslate(rawY, viewportH, WORLD_HEIGHT, next),
      { duration: ANIM_DURATION },
    );
  };

  const handleZoomIn = () => zoomAround(Math.min(cameraScale.value * 1.25, maxScale));
  const handleZoomOut = () => zoomAround(Math.max(cameraScale.value * 0.8, minScale));

  const handleFitAll = () => {
    if (!worldBounds) return;
    const { minX, minY, maxX, maxY } = worldBounds;
    const worldW = maxX - minX;
    const worldH = maxY - minY;
    if (worldW <= 0 || worldH <= 0) return;
    const PAD = 0.10;
    const scaleX = (viewportW * (1 - PAD * 2)) / worldW;
    const scaleY = (viewportH * (1 - PAD * 2)) / worldH;
    const next = Math.max(minScale, Math.min(maxScale, Math.min(scaleX, scaleY)));
    const worldCenterX = minX + worldW / 2;
    const worldCenterY = minY + worldH / 2;
    cameraScale.value = withTiming(next, { duration: ANIM_DURATION });
    // Clamp Fit-All's target camera to world bounds too. Centering on the
    // items' bounding box can produce an out-of-bounds camera if the items
    // cluster near a world edge.
    cameraX.value = withTiming(
      clampCameraTranslate(viewportW / 2 - worldCenterX * next, viewportW, WORLD_WIDTH, next),
      { duration: ANIM_DURATION },
    );
    cameraY.value = withTiming(
      clampCameraTranslate(viewportH / 2 - worldCenterY * next, viewportH, WORLD_HEIGHT, next),
      { duration: ANIM_DURATION },
    );
  };

  const handleReset = () => {
    cameraScale.value = withTiming(1, { duration: ANIM_DURATION });
    cameraX.value = withTiming(0, { duration: ANIM_DURATION });
    cameraY.value = withTiming(0, { duration: ANIM_DURATION });
  };

  const fitDisabled = !worldBounds;

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
        accessibilityLabel="Reset view"
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
