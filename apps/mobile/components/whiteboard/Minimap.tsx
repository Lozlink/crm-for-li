import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';
import { Text, Surface, useTheme } from 'react-native-paper';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { WhiteboardItem, WhiteboardItemType } from '@realestate-crm/types';
import {
  DEFAULT_STICKY_COLOR_DEF,
  getSuggestionKindDef,
  STICKY_COLOR_DEFS,
  stickyColorForScheme,
  type SuggestionKind,
} from './whiteboardColors';
import { clampCameraAxis, type ContentBounds } from './whiteboardWorld';

// Minimap display size in points.
const MINIMAP_W = 140;
const MINIMAP_H = 100;

const PAN_DURATION_MS = 200;

// Per-type accent colors for item dots.
const TYPE_DOT_COLOR: Record<Exclude<WhiteboardItemType, 'sticky' | 'suggestion'>, string> = {
  checklist: '#10B981',
  photo:     '#6366F1',
  contact:   '#F59E0B',
  property:  '#3B82F6',
  map:       '#10B981',
  goal:      '#EF4444',
};

function itemDotColor(
  item: WhiteboardItem,
  colorScheme: 'light' | 'dark' | null | undefined,
): string {
  if (item.type === 'sticky') {
    const def = STICKY_COLOR_DEFS.find((d) => d.light === item.color) ?? DEFAULT_STICKY_COLOR_DEF;
    return stickyColorForScheme(def, colorScheme);
  }
  if (item.type === 'suggestion') {
    const c = item.content as { kind: SuggestionKind };
    return getSuggestionKindDef(c.kind).light;
  }
  return TYPE_DOT_COLOR[item.type as Exclude<WhiteboardItemType, 'sticky' | 'suggestion'>];
}

interface Props {
  items: WhiteboardItem[];
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  /**
   * Effective minimap bounds — the content region the minimap projects.
   * In practice this is items' bbox + ~one viewport of padding (computed by
   * the parent), so dots fill the minimap meaningfully instead of clustering
   * in 3% of it (the pre-2026-05-10 bug — items lived in <10% of the abstract
   * 4000×4000 world rect, so MINIMAP_SCALE = 140/4000 collapsed them into a
   * tiny corner).
   */
  bounds: ContentBounds;
  viewportW: number;
  viewportH: number;
}

/**
 * Minimap — a persistent corner overlay showing all board items as colored
 * dots within the content bounds, plus a stroked viewport rectangle.
 *
 * Coordinate system note: items have world-coordinate positions, but the
 * minimap shows the BOUNDS region (not the abstract world). All projections
 * subtract `bounds.minX/Y` so the bounds top-left maps to (0, 0) on the
 * minimap, then multiply by the per-axis minimap scale.
 *
 *   minimapX = (worldX - bounds.minX) * (MINIMAP_W / boundsW)
 *
 * Tap-to-pan reverses this:
 *   worldX = bounds.minX + tapX_in_minimap / (MINIMAP_W / boundsW)
 *   cameraX = viewport/2 - worldX * scale (then clamped against bounds)
 *
 * DO NOT distribute scale across the whole expression — that was an earlier
 * bug: (screen/2 - worldX) * scale only matches at scale=1.
 */
export function Minimap({
  items,
  cameraX,
  cameraY,
  cameraScale,
  bounds,
  viewportW,
  viewportH,
}: Props) {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const [collapsed, setCollapsed] = useState(false);

  // Per-axis minimap scales derived from the *bounds* extent, not the
  // abstract world. Guard against zero-size bounds (would never happen in
  // practice since the parent pads by ~one viewport, but the math should
  // still degrade gracefully).
  const boundsW = Math.max(1, bounds.maxX - bounds.minX);
  const boundsH = Math.max(1, bounds.maxY - bounds.minY);
  const scaleX = MINIMAP_W / boundsW;
  const scaleY = MINIMAP_H / boundsH;

  const panWorldPoint = useCallback(
    (tapXInMinimap: number, tapYInMinimap: number) => {
      // Convert minimap-local tap → world coords by reversing the projection
      // (add bounds origin, divide by minimap scale).
      const worldX = bounds.minX + tapXInMinimap / scaleX;
      const worldY = bounds.minY + tapYInMinimap / scaleY;
      const scale = cameraScale.value || 1;
      // Center the tapped world point in the viewport, then clamp the result
      // against the same content bounds the canvas uses — keeps the camera
      // honest at the minimap's edge instead of overshooting into padding.
      const targetX = clampCameraAxis(
        viewportW / 2 - worldX * scale,
        viewportW,
        bounds.minX,
        bounds.maxX,
        scale,
      );
      const targetY = clampCameraAxis(
        viewportH / 2 - worldY * scale,
        viewportH,
        bounds.minY,
        bounds.maxY,
        scale,
      );
      cameraX.value = withTiming(targetX, { duration: PAN_DURATION_MS });
      cameraY.value = withTiming(targetY, { duration: PAN_DURATION_MS });
    },
    [bounds, scaleX, scaleY, cameraX, cameraY, cameraScale, viewportW, viewportH],
  );

  // Tap gesture — pan camera to tapped world point.
  const tapGesture = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e) => {
      panWorldPoint(e.x, e.y);
    });

  // Drag gesture — continuous pan as finger moves within minimap.
  const dragGesture = Gesture.Pan()
    .runOnJS(true)
    .onUpdate((e) => {
      panWorldPoint(e.x, e.y);
    });

  const minimapGesture = Gesture.Simultaneous(tapGesture, dragGesture);

  // Viewport rect driven by useAnimatedStyle so it updates on the UI thread
  // in real time as the camera moves — React render is NOT subscribed to
  // SharedValue changes, so reading `.value` in JSX only works at mount/re-render.
  //
  // Math: the visible world area's top-left in WORLD coords is
  // (-cameraX/scale, -cameraY/scale). To project onto the minimap (which is
  // anchored at bounds.minX/Y), subtract the bounds origin first. The
  // visible window has size (viewportW/scale, viewportH/scale) in world coords,
  // multiplied by the minimap scale to render.
  const viewportRectStyle = useAnimatedStyle(() => {
    const scale = cameraScale.value || 1;
    const worldVisibleX = -cameraX.value / scale;
    const worldVisibleY = -cameraY.value / scale;
    // Project the visible-world rect into bounds-space, then onto the minimap.
    // Earlier rev clamped `left/top` to [0..MINIMAP_*] but left `width/height`
    // unclamped — meaning when the camera was past the bounds origin (e.g.
    // visible world starts at y=-251 because the user panned above the
    // padded bounds), the rect rendered at top=0 with full height,
    // *pinned* to the minimap top-edge regardless of where the user
    // actually was. Symptom from logs: cameraY varied but `top` stayed at
    // 0.00 — the rect didn't track the camera at all.
    //
    // Fix: don't clamp at all. Render the rect at its true projected
    // position with its true projected size. The container View already
    // has overflow:hidden, so portions extending past the minimap edge
    // are correctly cut off. The visible portion always represents the
    // actual on-screen visible-world region — which is what the user
    // expects "minimap rect" to mean.
    const left = (worldVisibleX - bounds.minX) * scaleX;
    const top = (worldVisibleY - bounds.minY) * scaleY;
    const width = (viewportW / scale) * scaleX;
    const height = (viewportH / scale) * scaleY;

    if (__DEV__) {
      console.log(
        `[whiteboard:minimap-rect] cameraX=${cameraX.value.toFixed(1)} cameraY=${cameraY.value.toFixed(1)} scale=${scale.toFixed(4)}` +
        ` worldVisibleX=${worldVisibleX.toFixed(1)} worldVisibleY=${worldVisibleY.toFixed(1)}` +
        ` left=${left.toFixed(2)} top=${top.toFixed(2)} width=${width.toFixed(2)} height=${height.toFixed(2)}`,
      );
    }

    return { left, top, width, height };
  });

  if (collapsed) {
    return (
      <TouchableOpacity
        onPress={() => setCollapsed(false)}
        activeOpacity={0.85}
        accessibilityLabel="Expand minimap"
        style={styles.pill}
      >
        <Surface style={[styles.pillSurface, { backgroundColor: theme.colors.surface }]} elevation={2}>
          <Icon name="map-outline" size={14} color={theme.colors.onSurfaceVariant} />
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </Text>
        </Surface>
      </TouchableOpacity>
    );
  }

  return (
    // Surface owns the elevation/shadow ONLY. The clipping View below holds
    // overflow:hidden so RN Paper doesn't warn about Surface losing its
    // shadow when the parent crops itself.
    <Surface style={[styles.container, { backgroundColor: theme.colors.surface }]} elevation={3}>
      <View style={styles.containerInner}>
        {/* Collapse chevron */}
        <TouchableOpacity
          onPress={() => setCollapsed(true)}
          style={[styles.chevron]}
          hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
          accessibilityLabel="Collapse minimap"
        >
          <Icon name="chevron-down" size={12} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        {/* Canvas area with gesture detector */}
        <GestureDetector gesture={minimapGesture}>
          <View
            style={[
              styles.canvas,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
          >
          {/* Item dots — positioned via transform rather than left/top.
              On Android, an absolutely-positioned View inside an overflow:hidden
              parent can cache its layout bounds and not pick up subsequent
              `left/top` changes when items are dragged or migrated. Going through
              transform (translateX/Y) routes the position through the GPU
              compositor, which always picks up the new value, AND is slightly
              cheaper. Width/height stay as layout props since they don't change
              after first render for a given item. */}
          {items.map((item) => {
            // Per-axis projection via bounds origin (NOT abstract world origin).
            const x = (item.position_x - bounds.minX) * scaleX;
            const y = (item.position_y - bounds.minY) * scaleY;
            const w = Math.max(2, item.width * scaleX);
            const h = Math.max(2, item.height * scaleY);
            const color = itemDotColor(item, colorScheme);
            return (
              <View
                key={item.id}
                style={[
                  styles.dot,
                  {
                    width: w,
                    height: h,
                    backgroundColor: color,
                    transform: [{ translateX: x }, { translateY: y }],
                  },
                ]}
              />
            );
          })}

          {/* Viewport rect — driven by useAnimatedStyle so it tracks camera in real time.
              Left/top/width/height all animate on the UI thread (no JS-thread lag). */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.viewportRect,
              { borderColor: theme.colors.primary },
              viewportRectStyle,
            ]}
          />
          </View>
        </GestureDetector>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    // NOTE: no overflow:hidden here — RN Paper's Surface needs to render its
    // shadow OUTSIDE its own bounds. The inner View below crops content.
    width: MINIMAP_W,
  },
  containerInner: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  chevron: {
    alignSelf: 'flex-end',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  canvas: {
    width: MINIMAP_W,
    height: MINIMAP_H,
    overflow: 'hidden',
    position: 'relative',
  },
  dot: {
    position: 'absolute',
    borderRadius: 1,
    opacity: 0.85,
  },
  viewportRect: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(99,102,241,0.08)',
  },
  pill: {
    alignSelf: 'flex-end',
  },
  pillSurface: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
  },
});
