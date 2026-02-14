import { useCallback, useState } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { FAB, useTheme, Text, Chip, ActivityIndicator, Surface } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useRouteStore } from '@realestate-crm/hooks';
import type { Route } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const STATUS_LABELS: Record<Route['status'], string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export default function RoutesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const routes = useRouteStore(state => state.routes);
  const isLoading = useRouteStore(state => state.isLoading);
  const fetchRoutes = useRouteStore(state => state.fetchRoutes);

  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchRoutes();
    }, [fetchRoutes])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRoutes();
    setRefreshing(false);
  }, [fetchRoutes]);

  const handleRoutePress = useCallback((route: Route) => {
    router.push(`/route/${route.id}`);
  }, [router]);

  const handleAddRoute = () => {
    router.push('/route/new');
  };

  const getStatusChipStyle = (status: Route['status']) => {
    switch (status) {
      case 'planned':
        return { backgroundColor: theme.colors.surfaceVariant };
      case 'in_progress':
        return { backgroundColor: theme.colors.primaryContainer };
      case 'completed':
        return { backgroundColor: theme.colors.tertiaryContainer };
    }
  };

  const getStatusTextColor = (status: Route['status']) => {
    switch (status) {
      case 'planned':
        return theme.colors.onSurfaceVariant;
      case 'in_progress':
        return theme.colors.onPrimaryContainer;
      case 'completed':
        return theme.colors.onTertiaryContainer;
    }
  };

  const getStopCount = (route: Route): number => {
    // route_stops(count) from Supabase returns [{ count: N }]
    const stopsAgg = (route as any).route_stops;
    if (Array.isArray(stopsAgg) && stopsAgg.length > 0 && typeof stopsAgg[0].count === 'number') {
      return stopsAgg[0].count;
    }
    // Fallback to stops array length if populated
    if (route.stops && route.stops.length > 0) {
      return route.stops.length;
    }
    return 0;
  };

  const renderItem = useCallback(({ item }: { item: Route }) => {
    const stopCount = getStopCount(item);
    const modeIcon = item.mode === 'driving' ? 'car' : 'walk';

    return (
      <Surface style={styles.card} elevation={1}>
        <View
          style={styles.cardTouchable}
          onTouchEnd={() => handleRoutePress(item)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Route: ${item.name}, ${STATUS_LABELS[item.status]}`}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Icon
                  name={modeIcon}
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                  style={styles.modeIcon}
                />
                <Text variant="titleMedium" numberOfLines={1} style={styles.routeName}>
                  {item.name}
                </Text>
              </View>
              <Chip
                compact
                style={getStatusChipStyle(item.status)}
                textStyle={{ color: getStatusTextColor(item.status), fontSize: 11 }}
              >
                {STATUS_LABELS[item.status]}
              </Chip>
            </View>

            <View style={styles.metaRow}>
              {stopCount > 0 && (
                <View style={styles.metaItem}>
                  <Icon name="map-marker" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                    {stopCount} stop{stopCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              {item.estimated_duration_minutes != null && (
                <View style={styles.metaItem}>
                  <Icon name="clock-outline" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                    {item.estimated_duration_minutes} min
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Surface>
    );
  }, [theme.colors, handleRoutePress]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        No routes yet
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
        Tap + to plan your first door-knock route
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={routes.length === 0 ? styles.emptyList : styles.list}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: insets.bottom + 24 }]}
        color={theme.colors.onPrimary}
        onPress={handleAddRoute}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardTouchable: {
    padding: 16,
  },
  cardContent: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  modeIcon: {
    marginRight: 8,
  },
  routeName: {
    fontWeight: '600',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
});
