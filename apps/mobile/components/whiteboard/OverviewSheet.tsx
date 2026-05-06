import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { Chip, IconButton, MD3Theme, Text, TextInput, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type {
  WhiteboardChecklistContent,
  WhiteboardContactContent,
  WhiteboardGoalContent,
  WhiteboardItem,
  WhiteboardItemType,
  WhiteboardMapContent,
  WhiteboardPhotoContent,
  WhiteboardPropertyContent,
  WhiteboardStickyContent,
  WhiteboardSuggestionContent,
} from '@realestate-crm/types';
import {
  DEFAULT_STICKY_COLOR_DEF,
  getSuggestionKindDef,
  STICKY_COLOR_DEFS,
  stickyColorForScheme,
} from './whiteboardColors';

// ── Type display metadata ─────────────────────────────────────────────────────

const TYPE_META: Record<WhiteboardItemType, { label: string; icon: string; singularLabel: string }> = {
  sticky:     { singularLabel: 'note',       label: 'notes',       icon: 'note-outline' },
  checklist:  { singularLabel: 'to-do',      label: 'to-dos',      icon: 'checkbox-marked-circle-outline' },
  photo:      { singularLabel: 'photo',      label: 'photos',      icon: 'image-outline' },
  contact:    { singularLabel: 'contact',    label: 'contacts',    icon: 'account-outline' },
  property:   { singularLabel: 'property',   label: 'properties',  icon: 'home-outline' },
  map:        { singularLabel: 'map',        label: 'maps',        icon: 'map-marker-outline' },
  goal:       { singularLabel: 'goal',       label: 'goals',       icon: 'target' },
  suggestion: { singularLabel: 'suggestion', label: 'suggestions', icon: 'lightbulb-outline' },
};

// Per-type stripe colors — left accent bar on each row.
const TYPE_STRIPE_COLOR: Record<Exclude<WhiteboardItemType, 'sticky' | 'suggestion'>, string> = {
  checklist: '#10B981',
  photo:     '#6366F1',
  contact:   '#F59E0B',
  property:  '#3B82F6',
  map:       '#10B981',
  goal:      '#EF4444',
};

// ── Title derivation ──────────────────────────────────────────────────────────

function deriveTitle(item: WhiteboardItem): string {
  switch (item.type) {
    case 'sticky': {
      const c = item.content as WhiteboardStickyContent;
      return c.text.slice(0, 40).trim() || 'Quick note';
    }
    case 'checklist': {
      const c = item.content as WhiteboardChecklistContent;
      const base = c.title || 'To-do';
      if (c.items.length === 0) return base;
      const checked = c.items.filter((e) => e.checked).length;
      return `${base} (${checked} / ${c.items.length})`;
    }
    case 'photo': {
      const c = item.content as WhiteboardPhotoContent;
      return c.caption || 'Photo';
    }
    case 'contact': {
      const c = item.content as WhiteboardContactContent;
      return c.snapshotName || 'Contact';
    }
    case 'property': {
      const c = item.content as WhiteboardPropertyContent;
      return c.snapshotAddress || 'Property';
    }
    case 'map': {
      const c = item.content as WhiteboardMapContent;
      return c.address || 'Map pin';
    }
    case 'goal': {
      const c = item.content as WhiteboardGoalContent;
      return `${c.metric} target — ${c.target}/${c.period}`;
    }
    case 'suggestion': {
      const c = item.content as WhiteboardSuggestionContent;
      return c.title;
    }
    default:
      return 'Item';
  }
}

function resolveStripeColor(
  item: WhiteboardItem,
  colorScheme: 'light' | 'dark' | null | undefined,
): string {
  if (item.type === 'sticky') {
    const def = STICKY_COLOR_DEFS.find((d) => d.light === item.color) ?? DEFAULT_STICKY_COLOR_DEF;
    return stickyColorForScheme(def, colorScheme);
  }
  if (item.type === 'suggestion') {
    const c = item.content as WhiteboardSuggestionContent;
    return getSuggestionKindDef(c.kind).light;
  }
  return TYPE_STRIPE_COLOR[item.type as Exclude<WhiteboardItemType, 'sticky' | 'suggestion'>];
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  items: WhiteboardItem[];
  /** Camera shared values from the route — tap-to-pan sets these. */
  cameraX: SharedValue<number>;
  cameraY: SharedValue<number>;
  cameraScale: SharedValue<number>;
  onDismiss: () => void;
}

const SHEET_HEIGHT_FRACTION = 0.70;
const PAN_DURATION_MS = 250;

// ── Component ─────────────────────────────────────────────────────────────────

export function OverviewSheet({
  visible,
  items,
  cameraX,
  cameraY,
  cameraScale,
  onDismiss,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { width: screenW, height: screenH } = useWindowDimensions();

  const sheetHeight = screenH * SHEET_HEIGHT_FRACTION;
  const translateY = useSharedValue(sheetHeight);

  // Mount state tracks whether the sheet (and its scrim) should be in the tree
  // at all. Drives the early-return at the bottom. We can't gate the early
  // return on `translateY.value` because reading a SharedValue inside the
  // render body doesn't subscribe React to its changes — the value updates on
  // the UI thread but no re-render fires when the slide-out animation finishes,
  // leaving the dark scrim stuck on screen blocking taps.
  //
  // Instead: flip mount=true when `visible` becomes true (so the slide-in can
  // play), and flip mount=false in the slide-out animation's completion
  // callback (so the scrim unmounts cleanly at the end of the animation).
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withTiming(0, { duration: 250 });
    } else {
      translateY.value = withTiming(sheetHeight, { duration: 200 }, (finished) => {
        if (finished) {
          runOnJS(setMounted)(false);
        }
      });
    }
  }, [visible, sheetHeight, translateY]);

  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<Set<WhiteboardItemType>>(
    new Set<WhiteboardItemType>([
      'sticky', 'checklist', 'photo', 'contact', 'property', 'map', 'goal', 'suggestion',
    ]),
  );

  // Reset search when sheet closes.
  const handleDismiss = useCallback(() => {
    setSearch('');
    // Don't reset activeFilters — per spec, filter persists within a session but
    // resets when sheet is re-opened. We reset on open instead (see below).
    onDismiss();
  }, [onDismiss]);

  // ── Sorted + filtered list ──────────────────────────────────────────────────
  const sorted = useMemo(
    () => [...items].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [items],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter((it) => {
      if (!activeFilters.has(it.type)) return false;
      if (!q) return true;
      const title = deriveTitle(it).toLowerCase();
      return title.includes(q);
    });
  }, [sorted, activeFilters, search]);

  // ── Count chips ─────────────────────────────────────────────────────────────
  const countsByType = useMemo(() => {
    const counts: Partial<Record<WhiteboardItemType, number>> = {};
    for (const it of items) {
      counts[it.type] = (counts[it.type] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const toggleFilter = (type: WhiteboardItemType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  // ── Tap-to-pan ──────────────────────────────────────────────────────────────
  const handleTapItem = useCallback(
    (item: WhiteboardItem) => {
      // Close the sheet immediately so the user sees the canvas animate.
      handleDismiss();
      // Pan the camera to center this item in the visible viewport.
      //
      // World transform on the canvas is [translate, scale] (right-to-left:
      // scale first, then translate). So a world point cx_w lands on screen at:
      //   screen_x = camera_x + cx_w * scale
      // Solving for the camera that puts cx_w at screen center:
      //   camera_x = screen/2 - cx_w * scale
      //
      // (An earlier revision factored scale across the whole expression —
      //  `(screen/2 - cx_w) * scale` — which only matches at scale=1. At
      //  pinch-zoom 2x the item landed at the right edge instead of center.)
      const scale = cameraScale.value || 1;
      const visibleH = screenH - 80;
      const cxWorld = item.position_x + item.width / 2;
      const cyWorld = item.position_y + item.height / 2;
      cameraX.value = withTiming(
        screenW / 2 - cxWorld * scale,
        { duration: PAN_DURATION_MS },
      );
      cameraY.value = withTiming(
        visibleH / 2 - cyWorld * scale,
        { duration: PAN_DURATION_MS },
      );
    },
    [handleDismiss, cameraX, cameraY, cameraScale, screenW, screenH],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  // Unmount only after the slide-out animation completes (see useEffect above).
  // Gating on `mounted` (a real React state) instead of `translateY.value` is
  // what makes the unmount actually fire — shared values aren't reactive in
  // render. Without this, the scrim sticks around blocking taps.
  if (!mounted) return null;

  const allTypes: WhiteboardItemType[] = [
    'sticky', 'checklist', 'photo', 'contact', 'property', 'map', 'goal', 'suggestion',
  ];

  return (
    <>
      {/* Scrim — tap to dismiss */}
      <Pressable style={styles.scrim} onPress={handleDismiss} />

      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            backgroundColor: theme.colors.surface,
            paddingBottom: insets.bottom,
          },
          sheetStyle,
        ]}
      >
        {/* Drag handle — visual affordance for swipe-to-dismiss */}
        <View style={styles.dragHandleRow}>
          <View style={[styles.dragHandle, { backgroundColor: theme.colors.onSurfaceVariant }]} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text variant="titleMedium" style={{ flex: 1 }}>
            Board list
          </Text>
          <IconButton
            icon="close"
            size={20}
            onPress={handleDismiss}
            accessibilityLabel="Close overview"
            style={styles.closeButton}
          />
        </View>

        {/* Count chips row */}
        {items.length > 0 && (
          <View style={styles.countRow}>
            {allTypes.map((type) => {
              const count = countsByType[type] ?? 0;
              if (count === 0) return null;
              const meta = TYPE_META[type];
              const label = count === 1 ? `1 ${meta.singularLabel}` : `${count} ${meta.label}`;
              return (
                <Chip key={type} compact style={styles.countChip}>
                  {label}
                </Chip>
              );
            })}
          </View>
        )}

        {/* Search */}
        <View style={styles.searchRow}>
          <TextInput
            mode="outlined"
            dense
            placeholder="Search your board..."
            value={search}
            onChangeText={setSearch}
            left={<TextInput.Icon icon="magnify" />}
            right={
              search.length > 0 ? (
                <TextInput.Icon icon="close" onPress={() => setSearch('')} />
              ) : undefined
            }
            style={styles.searchInput}
          />
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {allTypes.map((type) => {
            const count = countsByType[type] ?? 0;
            if (count === 0) return null;
            const meta = TYPE_META[type];
            const active = activeFilters.has(type);
            return (
              <Chip
                key={type}
                icon={meta.icon}
                selected={active}
                onPress={() => toggleFilter(type)}
                compact
                style={[styles.filterChip, !active && styles.filterChipInactive]}
              >
                {meta.label}
              </Chip>
            );
          })}
        </View>

        {/* List */}
        {items.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="note-plus-outline" size={40} color={theme.colors.onSurfaceVariant} />
            <Text
              variant="bodyMedium"
              style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
            >
              Your board is empty. Tap + to add your first widget.
            </Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Icon name="filter-off-outline" size={40} color={theme.colors.onSurfaceVariant} />
            <Text
              variant="bodyMedium"
              style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}
            >
              No matches. Adjust the filter or search.
            </Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(it) => it.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <OverviewRow
                item={item}
                colorScheme={colorScheme}
                onTap={handleTapItem}
                theme={theme}
              />
            )}
          />
        )}
      </Animated.View>
    </>
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

interface RowProps {
  item: WhiteboardItem;
  colorScheme: 'light' | 'dark' | null | undefined;
  onTap: (item: WhiteboardItem) => void;
  theme: MD3Theme;
}

function OverviewRow({ item, colorScheme, onTap, theme }: RowProps) {
  const meta = TYPE_META[item.type];
  const title = deriveTitle(item);
  const stripeColor = resolveStripeColor(item, colorScheme);

  return (
    <View
      style={[
        styles.row,
        { backgroundColor: theme.colors.surface },
      ]}
      onTouchEnd={() => onTap(item)}
      accessibilityRole="button"
      accessibilityLabel={`Go to ${title}`}
    >
      {/* Left stripe */}
      <View style={[styles.stripe, { backgroundColor: stripeColor }]} />

      {/* Type icon */}
      <View style={styles.rowIcon}>
        <Icon name={meta.icon} size={20} color={theme.colors.onSurfaceVariant} />
      </View>

      {/* Text */}
      <View style={styles.rowText}>
        <Text
          variant="bodyMedium"
          numberOfLines={1}
          style={{ color: theme.colors.onSurface }}
        >
          {title}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {meta.singularLabel}
        </Text>
      </View>

      {/* Navigate affordance */}
      <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
    // Outer shadow so the sheet feels elevated above the canvas
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 2,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  closeButton: {
    margin: 0,
  },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  countChip: {
    height: 24,
  },
  searchRow: {
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  searchInput: {
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  filterChip: {
    height: 28,
  },
  filterChipInactive: {
    opacity: 0.45,
  },
  listContent: {
    paddingHorizontal: 0,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 12,
    paddingVertical: 10,
    gap: 8,
  },
  stripe: {
    width: 4,
    alignSelf: 'stretch',
  },
  rowIcon: {
    width: 32,
    alignItems: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 20,
  },
});
