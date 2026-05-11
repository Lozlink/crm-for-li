import { useMemo } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTheme, Text, Surface, Divider, IconButton, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  useTabPreferencesStore,
  ALL_TAB_KEYS,
  MAX_PINNED,
  MIN_PINNED,
  type TabKey,
} from '@realestate-crm/hooks';

/**
 * Customize Tabs — per-user bottom-nav editor.
 *
 * Reached via long-press on any bottom tab (set up in `(tabs)/_layout.tsx`'s
 * custom `tabBarButton`). Two sections:
 *
 *   1. "Pinned (N / 5)" — current tab bar, in display order. Each row has
 *      up/down arrows for reordering and an unpin button. Min 1, max 5.
 *
 *   2. "Available" — everything not currently pinned. Tap the pin button
 *      to add it to the tab bar (greyed out at the 5-tab ceiling).
 *
 * Reset button restores the default Today / Map / Prospecting / Whiteboard /
 * More layout in case the user gets stuck somewhere weird.
 */

const TAB_LABELS: Record<TabKey, { title: string; icon: string; subtitle?: string }> = {
  index: { title: 'Today', icon: 'lightning-bolt', subtitle: 'Home dashboard' },
  map: { title: 'Map', icon: 'map-outline', subtitle: 'Territory map' },
  prospecting: { title: 'Prospecting', icon: 'chart-timeline-variant', subtitle: 'Field metrics' },
  'whiteboard-tab': { title: 'Whiteboard', icon: 'sticker-text-outline', subtitle: 'Sticky board' },
  more: { title: 'More', icon: 'view-grid-outline', subtitle: 'All-screens grid' },
  contacts: { title: 'Contacts', icon: 'account-group', subtitle: 'Contact list' },
  pipeline: { title: 'Pipeline', icon: 'view-column', subtitle: 'Kanban board' },
  properties: { title: 'Properties', icon: 'home-city', subtitle: 'Listings' },
  tasks: { title: 'Tasks', icon: 'checkbox-marked-circle-outline', subtitle: 'To-do list' },
  notes: { title: 'Notes', icon: 'note-text', subtitle: 'Field notes' },
  stats: { title: 'Reports', icon: 'chart-bar', subtitle: 'Stats & charts' },
  settings: { title: 'Settings', icon: 'cog', subtitle: 'Account & app' },
};

export default function CustomizeTabsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const pinned = useTabPreferencesStore((s) => s.pinned);
  const togglePin = useTabPreferencesStore((s) => s.togglePin);
  const moveTabUp = useTabPreferencesStore((s) => s.moveTabUp);
  const moveTabDown = useTabPreferencesStore((s) => s.moveTabDown);
  const resetToDefaults = useTabPreferencesStore((s) => s.resetToDefaults);

  const available = useMemo(
    () => ALL_TAB_KEYS.filter((k) => !pinned.includes(k)),
    [pinned],
  );

  const handleConfirmReset = () => {
    Alert.alert(
      'Reset tabs?',
      'Restores the default Today / Map / Prospecting / Whiteboard / More layout.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Reset', style: 'destructive', onPress: () => void resetToDefaults() },
      ],
    );
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Customize tabs',
          presentation: 'modal',
          headerLeft: () => (
            <Button onPress={() => router.back()} compact>
              Done
            </Button>
          ),
        }}
      />
      <ScrollView
        style={[styles.scroll, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Pinned section */}
        <Text variant="labelMedium" style={[styles.sectionLabel, { color: theme.colors.onSurfaceVariant }]}>
          Pinned ({pinned.length}/{MAX_PINNED})
        </Text>
        <Surface style={styles.section} elevation={1}>
          {pinned.map((key, idx) => {
            const meta = TAB_LABELS[key];
            const canMoveUp = idx > 0;
            const canMoveDown = idx < pinned.length - 1;
            const canUnpin = pinned.length > MIN_PINNED;
            return (
              <View key={key}>
                <View style={styles.row}>
                  <View style={[styles.iconWrap, { backgroundColor: theme.colors.primaryContainer }]}>
                    <Icon name={meta.icon} size={20} color={theme.colors.onPrimaryContainer} />
                  </View>
                  <View style={styles.rowLabels}>
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                      {meta.title}
                    </Text>
                    {meta.subtitle ? (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {meta.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  <IconButton
                    icon="arrow-up"
                    size={18}
                    disabled={!canMoveUp}
                    onPress={() => void moveTabUp(key)}
                    accessibilityLabel={`Move ${meta.title} up`}
                  />
                  <IconButton
                    icon="arrow-down"
                    size={18}
                    disabled={!canMoveDown}
                    onPress={() => void moveTabDown(key)}
                    accessibilityLabel={`Move ${meta.title} down`}
                  />
                  <IconButton
                    icon="minus-circle-outline"
                    iconColor={canUnpin ? theme.colors.error : theme.colors.onSurfaceDisabled}
                    size={20}
                    disabled={!canUnpin}
                    onPress={() => void togglePin(key)}
                    accessibilityLabel={`Unpin ${meta.title}`}
                  />
                </View>
                {idx < pinned.length - 1 ? <Divider /> : null}
              </View>
            );
          })}
        </Surface>
        {pinned.length === MIN_PINNED ? (
          <Text variant="bodySmall" style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}>
            At least one tab must stay pinned.
          </Text>
        ) : null}

        {/* Available section */}
        {available.length > 0 ? (
          <>
            <Text
              variant="labelMedium"
              style={[styles.sectionLabel, styles.sectionLabelSpacing, { color: theme.colors.onSurfaceVariant }]}
            >
              Available
            </Text>
            <Surface style={styles.section} elevation={1}>
              {available.map((key, idx) => {
                const meta = TAB_LABELS[key];
                const atCeiling = pinned.length >= MAX_PINNED;
                return (
                  <View key={key}>
                    <TouchableOpacity
                      style={styles.row}
                      disabled={atCeiling}
                      onPress={() => void togglePin(key)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.iconWrap, { backgroundColor: theme.colors.surfaceVariant }]}>
                        <Icon name={meta.icon} size={20} color={theme.colors.onSurfaceVariant} />
                      </View>
                      <View style={styles.rowLabels}>
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                          {meta.title}
                        </Text>
                        {meta.subtitle ? (
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {meta.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      <IconButton
                        icon="plus-circle-outline"
                        size={20}
                        iconColor={atCeiling ? theme.colors.onSurfaceDisabled : theme.colors.primary}
                        disabled={atCeiling}
                        onPress={() => void togglePin(key)}
                        accessibilityLabel={`Pin ${meta.title}`}
                      />
                    </TouchableOpacity>
                    {idx < available.length - 1 ? <Divider /> : null}
                  </View>
                );
              })}
            </Surface>
            {pinned.length >= MAX_PINNED ? (
              <Text variant="bodySmall" style={[styles.helper, { color: theme.colors.onSurfaceVariant }]}>
                Tab bar full ({MAX_PINNED} max). Unpin one to make room.
              </Text>
            ) : null}
          </>
        ) : null}

        {/* Footer actions */}
        <Button
          mode="text"
          onPress={handleConfirmReset}
          style={styles.resetButton}
        >
          Reset to defaults
        </Button>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 32 },
  sectionLabel: {
    marginLeft: 4,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '700',
  },
  sectionLabelSpacing: {
    marginTop: 20,
  },
  section: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingLeft: 12,
    paddingRight: 4,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rowLabels: { flex: 1 },
  helper: {
    marginTop: 6,
    marginLeft: 4,
  },
  resetButton: {
    marginTop: 24,
    alignSelf: 'flex-start',
  },
});
