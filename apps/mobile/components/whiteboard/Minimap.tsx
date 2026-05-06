import { useCallback, useState } from 'react';
import { StyleSheet, TouchableOpacity, View, useColorScheme } from 'react-native';
import { Text, Surface, useTheme } from 'react-native-paper';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { withTiming, type SharedValue } from 'react-native-reanimated';
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

// Minimap is drawn at (MINIMAP_W / WORLD_WIDTH) scale — the world is square so
// the X scale also works for Y. If the world ever becomes non-square, derive
// a separate Y scale from MINIMAP_H / WORLD_HEIGHT.
const MINIMAP_SCALE = MINIMAP_W / WORLD_WIDTH;

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
      const worldX = tapXInMinimap / MINIMAP_SCALE;
      const worldY = tapYInMinimap / MINIMAP_SCALE;
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

  // Viewport rect in minimap coords.
  // World coords visible: topLeft = (-cameraX/scale, -cameraY/scale)
  // Map to minimap: multiply by MINIMAP_SCALE
  const viewportRectStyle = () => {
    const scale = cameraScale.value || 1;
    const left = (-cameraX.value / scale) * MINIMAP_SCALE;
    const top = (-cameraY.value / scale) * MINIMAP_SCALE;
    const width = (viewportW / scale) * MINIMAP_SCALE;
    const height = (viewportH / scale) * MINIMAP_SCALE;
    return { left, top, width, height };
  };

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

  const vp = viewportRectStyle();

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
          {/* Item dots */}
          {items.map((item) => {
            const x = item.position_x * MINIMAP_SCALE;
            const y = item.position_y * MINIMAP_SCALE;
            const w = Math.max(2, item.width * MINIMAP_SCALE);
            const h = Math.max(2, item.height * MINIMAP_SCALE);
            const color = itemDotColor(item, colorScheme);
            return (
              <View
                key={item.id}
                style={[
                  styles.dot,
                  {
                    left: x,
                    top: y,
                    width: w,
                    height: h,
                    backgroundColor: color,
                  },
                ]}
              />
            );
          })}

          {/* Viewport rect — clamped so it doesn't render outside the minimap */}
          <View
            pointerEvents="none"
            style={[
              styles.viewportRect,
              {
                left: Math.max(0, vp.left),
                top: Math.max(0, vp.top),
                width: Math.min(vp.width, MINIMAP_W - Math.max(0, vp.left)),
                height: Math.min(vp.height, MINIMAP_H - Math.max(0, vp.top)),
                borderColor: theme.colors.primary,
              },
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
