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
import { WORLD_WIDTH, WORLD_HEIGHT, clampCameraTranslate } from './whiteboardWorld';

// Minimap display size in points.
const MINIMAP_W = 140;
const MINIMAP_H = 100;

// Separate X/Y scales — the world is square but the minimap isn't (140×100),
// so a single uniform scale would clip the bottom (4000-2857)/4000 = ~28% of
// the world's vertical range. Earlier revisions used MINIMAP_W/WORLD_WIDTH for
// both axes; the comment claimed "world is square so X works for Y" but missed
// that the MINIMAP isn't square. Symptom: at certain zoom/pan combinations the
// viewport rect would drift off the bottom edge and disappear, and items in
// the bottom ~28% of the world were silently clipped from the dots.
const MINIMAP_SCALE_X = MINIMAP_W / WORLD_WIDTH;
const MINIMAP_SCALE_Y = MINIMAP_H / WORLD_HEIGHT;

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
  viewportW: number;
  viewportH: number;
}

/**
 * Minimap — a persistent corner overlay showing all board items as colored
 * dots at world scale, plus a stroked viewport rectangle.
 *
 * Tap-to-pan math (matches OverviewSheet.tsx:217-228 derivation):
 *   screen_x = cameraX + worldX * scale
 *   => cameraX = screen/2 - worldX * scale
 * where worldX = tapX_in_minimap / MINIMAP_SCALE.
 *
 * DO NOT distribute scale across the whole expression — that was the earlier
 * bug: (screen/2 - worldX) * scale is only correct at scale=1.
 */
export function Minimap({ items, cameraX, cameraY, cameraScale, viewportW, viewportH }: Props) {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const [collapsed, setCollapsed] = useState(false);

  const panWorldPoint = useCallback(
    (tapXInMinimap: number, tapYInMinimap: number) => {
      // Use separate X/Y scales when converting minimap coords back to world.
      const worldX = tapXInMinimap / MINIMAP_SCALE_X;
      const worldY = tapYInMinimap / MINIMAP_SCALE_Y;
      const scale = cameraScale.value || 1;
      // Correct algebra: cameraX = screenCenter - worldX * scale.
      // Clamp so a tap near the minimap edges doesn't pan the camera past
      // the world boundary into empty space.
      const targetX = clampCameraTranslate(viewportW / 2 - worldX * scale, viewportW, WORLD_WIDTH, scale);
      const targetY = clampCameraTranslate(viewportH / 2 - worldY * scale, viewportH, WORLD_HEIGHT, scale);
      cameraX.value = withTiming(targetX, { duration: PAN_DURATION_MS });
      cameraY.value = withTiming(targetY, { duration: PAN_DURATION_MS });
    },
    [cameraX, cameraY, cameraScale, viewportW, viewportH],
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
  // Math: the visible world area starts at (-cameraX/scale, -cameraY/scale)
  // and has size (viewportW/scale, viewportH/scale). Multiply by MINIMAP_SCALE
  // to map onto the minimap. Width/height are also animated because they shrink
  // as the user zooms in (larger scale → smaller visible window).
  const viewportRectStyle = useAnimatedStyle(() => {
    const scale = cameraScale.value || 1;
    // Per-axis scales — minimap aspect ratio (140×100) doesn't match world
    // aspect (4000×4000), so X and Y need different MINIMAP_SCALEs.
    const left = Math.max(0, (-cameraX.value / scale) * MINIMAP_SCALE_X);
    const top = Math.max(0, (-cameraY.value / scale) * MINIMAP_SCALE_Y);
    const width = Math.min((viewportW / scale) * MINIMAP_SCALE_X, MINIMAP_W - left);
    const height = Math.min((viewportH / scale) * MINIMAP_SCALE_Y, MINIMAP_H - top);
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
    <Surface style={[styles.container, { backgroundColor: theme.colors.surface }]} elevation={3}>
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
            // Per-axis scale — see MINIMAP_SCALE_X/Y notes above.
            const x = item.position_x * MINIMAP_SCALE_X;
            const y = item.position_y * MINIMAP_SCALE_Y;
            const w = Math.max(2, item.width * MINIMAP_SCALE_X);
            const h = Math.max(2, item.height * MINIMAP_SCALE_Y);
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
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    overflow: 'hidden',
    width: MINIMAP_W,
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
