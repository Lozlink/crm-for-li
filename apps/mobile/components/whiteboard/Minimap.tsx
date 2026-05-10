import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';
import { Text, Surface, useTheme } from 'react-native-paper';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
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
   * RAW items' bounding box (no padding). Used as one of the two inputs to the
   * dynamic union projection: `displayBounds = union(itemsBounds, visibleWorldRect)`.
   * This gives items a stable position in the minimap as long as the viewport
   * stays within or near them, and lets the projection expand to keep the rect
   * inside the minimap when the user pans far away.
   */
  itemsBounds: ContentBounds;
  /**
   * Padded effective bounds — what the *canvas* clamps to. Used ONLY for tap-
   * to-pan target clamping, so a tap near a minimap edge lands at a position
   * the canvas pan-gesture would itself allow. NOT used for display projection.
   */
  bounds: ContentBounds;
  viewportW: number;
  viewportH: number;
}

/**
 * Minimap — persistent corner overlay showing items as colored dots plus a
 * stroked viewport rectangle.
 *
 * ── Dynamic union projection (2026-05-10) ───────────────────────────────────
 * Earlier revs projected against a fixed `bounds` rect (items + padding):
 *   - When the viewport happened to be bigger than `bounds`, the rect overflowed
 *     the minimap with `overflow:hidden` clipping it — looked like a giant rect.
 *   - When the user panned far past `bounds`, the rect rendered outside the
 *     minimap surface entirely → disappeared.
 *
 * New projection: `displayBounds = union(itemsBounds, visibleWorldRect)`,
 * recomputed each frame via `useDerivedValue`. Both the items cluster AND
 * the viewport rect are always fully inside the minimap. The minimap rescales
 * dynamically as the user pans — items shrink slightly when the user wanders,
 * but they're always visible. This is the projection model Figma/Miro use.
 *
 * Per-item animated style (one `useAnimatedStyle` per dot via `MinimapDot`)
 * is needed because `displayBounds` changes per frame, so the item dots' scale
 * and offset also change per frame.
 *
 * ── Tap-to-pan math ─────────────────────────────────────────────────────────
 * Reverse the projection using the CURRENT `displayBounds.value`:
 *   worldX = displayBounds.minX + tapX_in_minimap / scaleX
 *   cameraX = viewport/2 - worldX * scale  (then clamped against `bounds`)
 *
 * `bounds` (the padded effective bounds) is used for the final clamp so the
 * resulting camera position matches what the canvas pan-gesture would itself
 * accept — keeps the two in sync.
 */
export function Minimap({
  items,
  cameraX,
  cameraY,
  cameraScale,
  itemsBounds,
  bounds,
  viewportW,
  viewportH,
}: Props) {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const [collapsed, setCollapsed] = useState(false);

  // Dynamic display bounds = union of items' bbox and the current visible
  // viewport (in world coords). Recomputed on UI thread whenever cameraX/Y/scale
  // change. Both items and viewport rect project against this — by construction,
  // both always fit inside the minimap surface.
  const displayBounds = useDerivedValue(() => {
    const scale = cameraScale.value || 1;
    const visibleLeft = -cameraX.value / scale;
    const visibleTop = -cameraY.value / scale;
    const visibleRight = visibleLeft + viewportW / scale;
    const visibleBottom = visibleTop + viewportH / scale;
    return {
      minX: Math.min(itemsBounds.minX, visibleLeft),
      minY: Math.min(itemsBounds.minY, visibleTop),
      maxX: Math.max(itemsBounds.maxX, visibleRight),
      maxY: Math.max(itemsBounds.maxY, visibleBottom),
    };
  });

  const panWorldPoint = useCallback(
    (tapXInMinimap: number, tapYInMinimap: number) => {
      // Convert minimap tap → world coords using the CURRENT displayBounds.
      // Reading `.value` from JS thread can be a frame stale; for a tap that's
      // imperceptible.
      const db = displayBounds.value;
      const dbW = Math.max(1, db.maxX - db.minX);
      const dbH = Math.max(1, db.maxY - db.minY);
      const sX = MINIMAP_W / dbW;
      const sY = MINIMAP_H / dbH;
      const worldX = db.minX + tapXInMinimap / sX;
      const worldY = db.minY + tapYInMinimap / sY;
      const scale = cameraScale.value || 1;
      // Center the tapped world point in the viewport. Clamp against the
      // CANVAS pan bounds (`bounds` prop) so the result is a position the
      // canvas itself would allow.
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
    [displayBounds, bounds, cameraX, cameraY, cameraScale, viewportW, viewportH],
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

  // Viewport rect — projects against the current displayBounds on the UI
  // thread. Since displayBounds ⊇ visibleWorldRect by construction, the rect
  // ALWAYS fits fully inside the minimap surface. No more overflow clipping.
  const viewportRectStyle = useAnimatedStyle(() => {
    const scale = cameraScale.value || 1;
    const db = displayBounds.value;
    const dbW = Math.max(1, db.maxX - db.minX);
    const dbH = Math.max(1, db.maxY - db.minY);
    const sX = MINIMAP_W / dbW;
    const sY = MINIMAP_H / dbH;
    const worldVisibleX = -cameraX.value / scale;
    const worldVisibleY = -cameraY.value / scale;
    const left = (worldVisibleX - db.minX) * sX;
    const top = (worldVisibleY - db.minY) * sY;
    const width = (viewportW / scale) * sX;
    const height = (viewportH / scale) * sY;

    if (__DEV__) {
      console.log(
        `[whiteboard:minimap-rect] cam=(${cameraX.value.toFixed(1)},${cameraY.value.toFixed(1)},${scale.toFixed(3)})` +
        ` db=(${db.minX.toFixed(0)}..${db.maxX.toFixed(0)},${db.minY.toFixed(0)}..${db.maxY.toFixed(0)})` +
        ` rect=(${left.toFixed(1)},${top.toFixed(1)},${width.toFixed(1)},${height.toFixed(1)})`,
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
            {/* Item dots — each dot is its own animated component because the
                projection (displayBounds) changes per frame as the user pans.
                One useAnimatedStyle per dot lets each dot rescale on the UI
                thread without re-rendering the parent. Acceptable cost for
                whiteboards of typical size (10s of items). */}
            {items.map((item) => (
              <MinimapDot
                key={item.id}
                item={item}
                color={itemDotColor(item, colorScheme)}
                displayBounds={displayBounds}
              />
            ))}

            {/* Viewport rect — also driven by displayBounds, so it ALWAYS fits
                inside the minimap surface. No more "rect falls off the
                minimap when I pan far" symptom. */}
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

/**
 * One item dot in the minimap. Extracted so each dot can have its own
 * `useAnimatedStyle` hook — necessary because the projection (displayBounds)
 * changes per frame as the user pans/zooms, so each dot's `left/top/width/height`
 * also change per frame. React doesn't allow hooks in a loop, hence a separate
 * component.
 */
function MinimapDot({
  item,
  color,
  displayBounds,
}: {
  item: WhiteboardItem;
  color: string;
  displayBounds: SharedValue<ContentBounds>;
}) {
  const style = useAnimatedStyle(() => {
    const db = displayBounds.value;
    const dbW = Math.max(1, db.maxX - db.minX);
    const dbH = Math.max(1, db.maxY - db.minY);
    const sX = MINIMAP_W / dbW;
    const sY = MINIMAP_H / dbH;
    // Position via translate (cheaper than left/top on Android per old comment
    // — transforms route through the GPU compositor and don't trip layout
    // caching).
    return {
      transform: [
        { translateX: (item.position_x - db.minX) * sX },
        { translateY: (item.position_y - db.minY) * sY },
      ],
      // Min 2pt size keeps small items visible. Items don't typically have
      // sub-2pt rendered size at typical zoom, but very-zoomed-out wide boards
      // could collapse a tall thin item to <1px otherwise.
      width: Math.max(2, item.width * sX),
      height: Math.max(2, item.height * sY),
    };
  });
  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: color },
        style,
      ]}
    />
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
