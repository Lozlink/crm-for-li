import { useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import {
  Text,
  Button,
  Divider,
  Surface,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSmartSuggestions, type SmartSuggestion } from '@realestate-crm/hooks';
import type { WhiteboardSuggestionKind } from '@realestate-crm/types';
import {
  getSuggestionKindDef,
  suggestionKindColorForScheme,
} from './whiteboardColors';

// ─── Layout constants ─────────────────────────────────────────────────────────
const MAX_SIDEBAR_WIDTH = 300;
const BACKDROP_OPACITY = 0.4;

// ─── Animation constants ──────────────────────────────────────────────────────
// Slide spring — physical, not bouncy. Panel is a tool panel, not a notification.
const SLIDE_SPRING = { mass: 0.6, damping: 20, stiffness: 200 } as const;
// Backdrop fades in faster than the panel slides so the scrim precedes focus.
const BACKDROP_TIMING = { duration: 180, easing: Easing.bezier(0.4, 0, 0.2, 1) } as const;

interface Props {
  visible: boolean;
  onDismiss: () => void;
  /**
   * Called when the user taps "Add to board" for a suggestion.
   * whiteboard.tsx owns the board placement logic and the createItem call.
   */
  onAddToBoard: (suggestion: SmartSuggestion) => void;
}

/**
 * IntelligenceSidebar — right-edge slide-in panel showing smart picks.
 *
 * Data: calls useSmartSuggestions() internally — self-contained.
 * Design spec: DESIGN.md §12.3.
 *
 * ── Copy rules (CRITICAL) ────────────────────────────────────────────────────
 *  Header:      "For your board"                   (NOT "AI Suggestions")
 *  Subtitle:    "Smart picks based on your activity"
 *  Add CTA:     "Add to board"                     (NOT "Save")
 *  Empty state: "No picks for now. Keep prospecting."
 *  Accessibility label on toolbar trigger: "Suggestions for your board"
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Animation: react-native-reanimated withSpring slide from right edge.
 * Backdrop: 40% opacity black Pressable — tap to dismiss.
 * Always mounted (even when hidden) so the enter animation fires cleanly.
 * pointerEvents="none" when closed to prevent touch-through on canvas.
 */
export function IntelligenceSidebar({ visible, onDismiss, onAddToBoard }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const colorScheme = useColorScheme();
  const { suggestions, isLoading } = useSmartSuggestions();

  // Live window width so the panel tracks a Catalyst window resize (module-scope
  // Dimensions.get captured a stale width).
  const { width: windowWidth } = useWindowDimensions();
  const sidebarWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.round(windowWidth * 0.84));

  // ── Slide + backdrop animation ────────────────────────────────────────────
  const translateX = useSharedValue(sidebarWidth);   // start offscreen right
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      backdropOpacity.value = withTiming(BACKDROP_OPACITY, BACKDROP_TIMING);
      translateX.value = withSpring(0, SLIDE_SPRING);
    } else {
      backdropOpacity.value = withTiming(0, BACKDROP_TIMING);
      translateX.value = withSpring(sidebarWidth, SLIDE_SPRING);
    }
  }, [visible, sidebarWidth, translateX, backdropOpacity]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdropOpacity.value }));
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  // ── FlatList helpers ──────────────────────────────────────────────────────
  const renderRow = useCallback(
    ({ item }: { item: SmartSuggestion }) => (
      <SuggestionRow
        suggestion={item}
        colorScheme={colorScheme}
        onAddToBoard={onAddToBoard}
        onDismiss={onDismiss}
        theme={theme}
      />
    ),
    [colorScheme, onAddToBoard, onDismiss, theme],
  );

  const keyExtractor = useCallback((item: SmartSuggestion) => item.id, []);

  return (
    <View
      style={styles.root}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Backdrop — semi-opaque scrim, tap to dismiss */}
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={onDismiss}
          accessibilityLabel="Close suggestions panel"
          accessibilityRole="button"
        />
      </Animated.View>

      {/* Sliding panel */}
      <Animated.View style={[styles.panelWrapper, { width: sidebarWidth }, panelStyle]}>
        <Surface
          elevation={4}
          style={[
            styles.panel,
            {
              backgroundColor: theme.colors.surface,
              paddingTop: insets.top > 0 ? insets.top : 12,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          {/* ── Header ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text
                variant="titleMedium"
                style={[styles.headerTitle, { color: theme.colors.onSurface }]}
                accessibilityRole="header"
              >
                For your board
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, lineHeight: 16 }}
              >
                Smart picks based on your activity
              </Text>
            </View>
            <Pressable
              onPress={onDismiss}
              style={styles.closeButton}
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.onSurfaceVariant} />
            </Pressable>
          </View>

          <Divider style={styles.divider} />

          {/* ── Body: loading / empty / list ───────────────────────────── */}
          {isLoading ? (
            <LoadingState theme={theme} />
          ) : suggestions.length === 0 ? (
            <EmptyState theme={theme} />
          ) : (
            <FlatList
              data={suggestions}
              renderItem={renderRow}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={styles.itemSeparator} />}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </Surface>
      </Animated.View>
    </View>
  );
}

// ─── SuggestionRow ─────────────────────────────────────────────────────────────

interface RowProps {
  suggestion: SmartSuggestion;
  colorScheme: 'light' | 'dark' | null | undefined;
  onAddToBoard: (s: SmartSuggestion) => void;
  onDismiss: () => void;
  theme: MD3Theme;
}

function SuggestionRow({ suggestion, colorScheme, onAddToBoard, onDismiss, theme }: RowProps) {
  const router = useRouter();
  const kindDef = getSuggestionKindDef(suggestion.kind);
  const accentColor = suggestionKindColorForScheme(kindDef, colorScheme);
  const chipFg = colorScheme === 'dark' ? '#FFFFFF' : darken(accentColor, 0.5);

  const handleRowPress = () => {
    const target = buildNavTarget(suggestion.kind, suggestion.payload);
    onDismiss();
    router.push(target as never);
  };

  return (
    <Pressable
      onPress={handleRowPress}
      accessibilityRole="button"
      accessibilityLabel={suggestion.title}
      style={({ pressed }) => [
        styles.row,
        {
          borderLeftColor: accentColor,
          backgroundColor: pressed
            ? theme.colors.surfaceVariant + '88'
            : theme.colors.surfaceVariant + '44',
        },
      ]}
    >
      {/* Kind chip */}
      <View style={[styles.kindChip, { backgroundColor: accentColor + '33' }]}>
        <Icon name={kindDef.icon} size={12} color={chipFg} style={styles.chipIcon} />
        <Text
          variant="labelSmall"
          style={[styles.chipLabel, { color: chipFg }]}
          numberOfLines={1}
        >
          {kindDef.label}
        </Text>
      </View>

      {/* Title */}
      <Text
        variant="titleSmall"
        numberOfLines={2}
        style={[styles.rowTitle, { color: theme.colors.onSurface }]}
      >
        {suggestion.title}
      </Text>

      {/* Subtitle — optional */}
      {!!suggestion.subtitle && (
        <Text
          variant="bodySmall"
          numberOfLines={3}
          style={[styles.rowBody, { color: theme.colors.onSurfaceVariant }]}
        >
          {suggestion.subtitle}
        </Text>
      )}

      {/* Add to board CTA — stopPropagation so row press doesn't also fire */}
      <View style={styles.ctaRow}>
        <Button
          mode="text"
          compact
          icon="plus-circle-outline"
          onPress={(e) => {
            // Prevent the parent Pressable from also triggering navigation
            (e as unknown as { stopPropagation?: () => void }).stopPropagation?.();
            onAddToBoard(suggestion);
          }}
          accessibilityLabel={`Add "${suggestion.title}" to board`}
          labelStyle={styles.ctaLabel}
        >
          Add to board
        </Button>
      </View>
    </Pressable>
  );
}

// ─── LoadingState ──────────────────────────────────────────────────────────────

function LoadingState({ theme }: { theme: MD3Theme }) {
  return (
    <View style={styles.centeredState}>
      <ActivityIndicator size="large" color={theme.colors.primary} />
      <Text
        variant="bodySmall"
        style={[styles.loadingLabel, { color: theme.colors.onSurfaceVariant }]}
      >
        Finding your picks…
      </Text>
    </View>
  );
}

// ─── EmptyState ────────────────────────────────────────────────────────────────

function EmptyState({ theme }: { theme: MD3Theme }) {
  return (
    <View style={styles.centeredState}>
      <Icon
        name="lightbulb-on-outline"
        size={44}
        color={theme.colors.onSurfaceVariant}
        style={styles.emptyIcon}
      />
      <Text
        variant="bodyMedium"
        style={[styles.emptyTitle, { color: theme.colors.onSurfaceVariant }]}
      >
        No picks for now.
      </Text>
      <Text
        variant="bodySmall"
        style={[styles.emptyBody, { color: theme.colors.onSurfaceVariant }]}
      >
        Keep prospecting.
      </Text>
    </View>
  );
}

// ─── Navigation helper ─────────────────────────────────────────────────────────

/**
 * Derives the expo-router push target from kind + SmartSuggestion.payload.
 * Mirrors the deep-link spec in the team task brief.
 */
function buildNavTarget(
  kind: WhiteboardSuggestionKind,
  payload: Record<string, unknown>,
): string {
  switch (kind) {
    case 'hot_prospects': {
      const ids = payload.contactIds as string[] | undefined;
      return ids?.[0] ? `/contact/${ids[0]}` : '/(tabs)/contacts';
    }
    case 'coverage_gap':
      // payload: { buildingId, coverage, address } — no lat/lng, open map tab
      return '/(tabs)/map';
    case 'today_play': {
      const id = payload.inspectionId as string | undefined;
      return id ? `/inspection/${id}` : '/(tabs)/prospecting';
    }
    case 'route': {
      const lls = payload.orderedLatLngs as { lat: number; lng: number }[] | undefined;
      if (lls?.[0]) {
        return `/(tabs)/map?lat=${lls[0].lat}&lng=${lls[0].lng}&zoom=0.01&layer=contacts`;
      }
      return '/(tabs)/map';
    }
  }
}

// ─── Colour util ───────────────────────────────────────────────────────────────

function darken(hex: string, amount: number): string {
  const raw = hex.replace('#', '').replace(/^([0-9a-f])([0-9a-f])([0-9a-f])$/i, '$1$1$2$2$3$3');
  const r = Math.max(0, Math.round(parseInt(raw.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(raw.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(raw.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  panelWrapper: {
    // width is set inline from useWindowDimensions (Catalyst-resize-safe).
    height: '100%',
  },
  panel: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontWeight: '700',
    marginBottom: 2,
  },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginRight: -8,
  },
  divider: {
    marginBottom: 4,
  },

  // List
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
  },
  itemSeparator: {
    height: 10,
  },

  // SuggestionRow
  row: {
    borderRadius: 10,
    borderLeftWidth: 4,
    paddingLeft: 10,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  kindChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    marginBottom: 6,
  },
  chipIcon: {
    marginRight: 4,
  },
  chipLabel: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  rowTitle: {
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 4,
  },
  rowBody: {
    lineHeight: 16,
    marginBottom: 4,
  },
  ctaRow: {
    alignItems: 'flex-end',
    marginTop: 2,
  },
  ctaLabel: {
    fontSize: 13,
    fontWeight: '600',
  },

  // Loading + empty states
  centeredState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  loadingLabel: {
    marginTop: 12,
  },
  emptyIcon: {
    opacity: 0.45,
    marginBottom: 14,
  },
  emptyTitle: {
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  emptyBody: {
    textAlign: 'center',
    opacity: 0.7,
  },
});
