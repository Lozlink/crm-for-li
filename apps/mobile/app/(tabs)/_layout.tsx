import { Tabs, useRouter } from 'expo-router';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme, Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuthStore, useTrackingStore } from '@realestate-crm/hooks';
import { TrackingBanner } from '@realestate-crm/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

function TopHeader() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const activeTeam = useAuthStore((s) => s.activeTeam);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const profile = useAuthStore((s) => s.profile);

  const displayName = isDemoMode
    ? 'Demo'
    : profile?.display_name?.split(' ')[0] || 'User';

  return (
    <View style={[styles.topHeader, { paddingTop: insets.top, backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.outlineVariant }]}>
      <View style={styles.topHeaderInner}>
        {/* Left: Team name */}
        <TouchableOpacity
          onPress={() => router.push('/team/switcher' as never)}
          style={styles.teamButton}
        >
          <View style={[styles.teamDot, { backgroundColor: theme.colors.primary }]} />
          <Text variant="titleSmall" numberOfLines={1} style={{ maxWidth: 160 }}>
            {isDemoMode ? 'Demo Mode' : activeTeam?.name || 'No Team'}
          </Text>
          <Icon name="chevron-down" size={16} color={theme.colors.onSurfaceVariant} />
        </TouchableOpacity>

        {/* Right: User actions */}
        <View style={styles.topHeaderRight}>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/stats' as never)}
            style={styles.headerIcon}
          >
            <Icon name="chart-bar" size={22} color={theme.colors.onSurfaceVariant} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/settings' as never)}
            style={styles.headerIcon}
          >
            <Icon name="cog-outline" size={22} color={theme.colors.onSurfaceVariant} />
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
}

export default function TabLayout() {
  const theme = useTheme();
  const activeSession = useTrackingStore(s => s.activeSession);

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
          header: () => <TopHeader />,
        }}
      >
        <Tabs.Screen
          name="properties"
          options={{
            title: 'Properties',
            tabBarIcon: ({ color, size }) => (
              <Icon name="home-city" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="index"
          options={{
            title: 'Contacts',
            tabBarIcon: ({ color, size }) => (
              <Icon name="account-group" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Tasks',
            tabBarIcon: ({ color, size }) => (
              <Icon name="checkbox-marked-circle-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="map"
          options={{
            title: 'Map',
            tabBarIcon: ({ color, size }) => (
              <Icon name="map-outline" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color, size }) => (
              <Icon name="view-grid-outline" size={size} color={color} />
            ),
          }}
        />
        {/* Hidden tabs — accessible via More grid or top header */}
        <Tabs.Screen
          name="pipeline"
          options={{ title: 'Pipeline', href: null,
            tabBarIcon: ({ color, size }) => <Icon name="view-column" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="notes"
          options={{ title: 'Notes', href: null,
            tabBarIcon: ({ color, size }) => <Icon name="note-text" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="routes"
          options={{ title: 'Routes', href: null,
            tabBarIcon: ({ color, size }) => <Icon name="routes" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="stats"
          options={{ title: 'Reports', href: null,
            tabBarIcon: ({ color, size }) => <Icon name="chart-bar" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{ title: 'Settings', href: null,
            tabBarIcon: ({ color, size }) => <Icon name="cog" size={size} color={color} />,
          }}
        />
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
    gap: 4,
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
    marginLeft: 4,
  },
});
