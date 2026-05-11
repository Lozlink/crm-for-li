import React, { memo, useCallback, useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, StyleSheet, TouchableOpacity, Alert, Pressable } from 'react-native';
import { useTheme, Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  useAuthStore,
  useTrackingStore,
  useTabPreferencesStore,
  ALL_TAB_KEYS,
  type TabKey,
} from '@realestate-crm/hooks';
import { TrackingBanner } from '@realestate-crm/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Tab-bar button props come from `@react-navigation/bottom-tabs` (a
// transitive dep of expo-router) and have a complex GestureResponderEvent
// shape that doesn't simplify cleanly when re-typed. We only forward
// well-known fields to Pressable, so use `any` for the prop bag — the
// runtime shape is well-tested by React Navigation itself.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TabBarButtonProps = any;

const TopHeader = memo(function TopHeader() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeTeam = useAuthStore((s) => s.activeTeam);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const profile = useAuthStore((s) => s.profile);
  const activeSession = useTrackingStore(s => s.activeSession);
  const startSession = useTrackingStore(s => s.startSession);

  const displayName = isDemoMode
    ? 'Demo'
    : profile?.display_name?.split(' ')[0] || 'User';

  const handleTrackingPress = useCallback(() => {
    if (activeSession) {
      router.push('/(tabs)/map' as never);
      return;
    }
    Alert.alert(
      'Start Tracking',
      'This will record your location in the background for field prospecting. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Start', onPress: () => startSession() },
      ],
    );
  }, [activeSession, router, startSession]);

  return (
    <View style={[styles.topHeader, { paddingTop: insets.top, backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outlineVariant }]}>
      <View style={styles.topHeaderInner}>
        {/* Left: Team name */}
        <TouchableOpacity
          onPress={() => router.push('/team/switcher' as never)}
          style={styles.teamButton}
        >
          <View style={[styles.teamDot, { backgroundColor: theme.colors.primary }]} />
          <Text variant="titleSmall" numberOfLines={1} style={{ maxWidth: 140 }}>
            {isDemoMode ? 'Demo Mode' : activeTeam?.name || 'No Team'}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        {/* Right: Tracking + Stats + Avatar */}
        <View style={styles.topHeaderRight}>
          {/* Start/View Tracking button */}
          <TouchableOpacity
            onPress={handleTrackingPress}
            style={[
              styles.trackingButton,
              { backgroundColor: activeSession ? theme.colors.tertiaryContainer : theme.colors.primaryContainer },
            ]}
          >
            <Icon
              name={activeSession ? 'walk' : 'play-circle-outline'}
              size={16}
              color={activeSession ? theme.colors.onTertiaryContainer : theme.colors.onPrimaryContainer}
            />
            <Text
              variant="labelSmall"
              style={{
                color: activeSession ? theme.colors.onTertiaryContainer : theme.colors.onPrimaryContainer,
                fontWeight: '600',
                marginLeft: 4,
              }}
            >
              {activeSession ? 'Tracking' : 'Track'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/whiteboard' as never)}
            style={styles.headerIcon}
            accessibilityLabel="Open whiteboard"
          >
            <Icon name="sticker-text-outline" size={22} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings' as never)}
            style={[styles.avatar, { backgroundColor: theme.colors.primaryContainer }]}
          >
            <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700', fontSize: 13 }}>
              {displayName[0]?.toUpperCase() || 'U'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// Stable reference for Tabs screenOptions.header
const renderHeader = () => <TopHeader />;

/**
 * Tab metadata — single source of truth for icon + title + special `href`
 * overrides (the Whiteboard tab redirects to the fullscreen /whiteboard
 * stack route instead of rendering inside the tab tree, so it has a
 * non-standard href even when "pinned").
 */
const TAB_META: Record<
  TabKey,
  { title: string; icon: string; hrefOverride?: string }
> = {
  index: { title: 'Today', icon: 'lightning-bolt' },
  map: { title: 'Map', icon: 'map-outline' },
  prospecting: { title: 'Prospecting', icon: 'chart-timeline-variant' },
  'whiteboard-tab': {
    title: 'Whiteboard',
    icon: 'sticker-text-outline',
    // Redirects out of the tab tree into the fullscreen whiteboard stack.
    hrefOverride: '/whiteboard',
  },
  more: { title: 'More', icon: 'view-grid-outline' },
  contacts: { title: 'Contacts', icon: 'account-group' },
  pipeline: { title: 'Pipeline', icon: 'view-column' },
  properties: { title: 'Properties', icon: 'home-city' },
  tasks: { title: 'Tasks', icon: 'checkbox-marked-circle-outline' },
  notes: { title: 'Notes', icon: 'note-text' },
  stats: { title: 'Reports', icon: 'chart-bar' },
  settings: { title: 'Settings', icon: 'cog' },
};

/**
 * Custom tab-bar button that adds long-press → open Customize Tabs screen.
 * Preserves the default press behavior (Pressable forwards `onPress`) and
 * passes through accessibility props from React Navigation. Long-press is
 * intentionally available on every tab so the user discovers customization
 * regardless of which tab they're currently on.
 */
function makeTabBarButton(onLongPress: () => void) {
  return function CustomTabBarButton(props: TabBarButtonProps) {
    return (
      <Pressable
        accessibilityRole="button"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        accessibilityState={props.accessibilityState as any}
        accessibilityLabel={props.accessibilityLabel}
        testID={props.testID}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onPress={props.onPress as any}
        onLongPress={onLongPress}
        // Mimic default tab-bar button geometry.
        style={({ pressed }) => [
          styles.tabBarButton,
          props.style,
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        {props.children}
      </Pressable>
    );
  };
}

export default function TabLayout() {
  const theme = useTheme();
  const router = useRouter();
  const activeSession = useTrackingStore(s => s.activeSession);

  // Per-user tab preferences. Reloaded whenever the auth user changes so
  // signing into a different account picks up that account's pins.
  const pinned = useTabPreferencesStore((s) => s.pinned);
  const loadForUser = useTabPreferencesStore((s) => s.loadForUser);
  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  useEffect(() => {
    // Use a stable key per identity — real user id, or "demo" for demo mode.
    const key = isDemoMode ? 'demo' : authUserId;
    void loadForUser(key);
  }, [authUserId, isDemoMode, loadForUser]);

  // Render order: pinned tabs first (in user-chosen order), then every other
  // tab with `href: null` (still mounted, just invisible in the bar).
  const orderedKeys: TabKey[] = [
    ...pinned,
    ...ALL_TAB_KEYS.filter((k) => !pinned.includes(k)),
  ];

  const TabBarButton = makeTabBarButton(() => {
    router.push('/settings/customize-tabs' as never);
  });

  return (
    <View style={styles.root}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: theme.colors.primary,
          tabBarInactiveTintColor: theme.colors.onSurfaceVariant,
          tabBarStyle: {
            backgroundColor: theme.colors.surface,
            borderTopColor: theme.colors.outlineVariant,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
          },
          tabBarButton: (props) => <TabBarButton {...props} />,
          header: renderHeader,
        }}
      >
        {orderedKeys.map((key) => {
          const meta = TAB_META[key];
          const isPinned = pinned.includes(key);
          // Unpinned tabs hide from the bar via `href: null`. They remain
          // valid routes — accessible from More, deep links, programmatic
          // navigation — but don't take up a tab slot.
          const hrefOption =
            isPinned ? (meta.hrefOverride ? { href: meta.hrefOverride as any } : {}) : { href: null as any };
          return (
            <Tabs.Screen
              key={key}
              name={key}
              options={{
                title: meta.title,
                tabBarIcon: ({ color, size }) => (
                  <Icon name={meta.icon} size={size} color={color} />
                ),
                ...hrefOption,
              }}
            />
          );
        })}
      </Tabs>
      {activeSession && <TrackingBanner />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topHeader: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topHeaderInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  teamButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  topHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  trackingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  headerIcon: {
    padding: 6,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBarButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
