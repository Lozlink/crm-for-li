import { StyleSheet, View } from 'react-native';
import { IconButton, Surface, useTheme } from 'react-native-paper';
import { withTiming, type SharedValue } from 'react-native-reanimated';

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
  viewportW,
  viewportH,
  minScale = 0.4,
  maxScale = 2.0,
}: Props) {
  const theme = useTheme();

  const handleZoomIn = () => {
    const next = Math.min(cameraScale.value * 1.25, maxScale);
    // Keep the viewport center point fixed during zoom.
    const cx = viewportW / 2;
    const cy = viewportH / 2;
    const worldCx = (cx - cameraX.value) / cameraScale.value;
    const worldCy = (cy - cameraY.value) / cameraScale.value;
    cameraScale.value = withTiming(next, { duration: ANIM_DURATION });
    cameraX.value = withTiming(cx - worldCx * next, { duration: ANIM_DURATION });
    cameraY.value = withTiming(cy - worldCy * next, { duration: ANIM_DURATION });
  };

  const handleZoomOut = () => {
    const next = Math.max(cameraScale.value * 0.8, minScale);
    const cx = viewportW / 2;
    const cy = viewportH / 2;
    const worldCx = (cx - cameraX.value) / cameraScale.value;
    const worldCy = (cy - cameraY.value) / cameraScale.value;
    cameraScale.value = withTiming(next, { duration: ANIM_DURATION });
    cameraX.value = withTiming(cx - worldCx * next, { duration: ANIM_DURATION });
    cameraY.value = withTiming(cy - worldCy * next, { duration: ANIM_DURATION });
  };

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
    cameraX.value = withTiming(viewportW / 2 - worldCenterX * next, { duration: ANIM_DURATION });
    cameraY.value = withTiming(viewportH / 2 - worldCenterY * next, { duration: ANIM_DURATION });
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
