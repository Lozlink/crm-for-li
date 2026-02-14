import { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Searchbar, useTheme, Text, Surface, SegmentedButtons } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useStreetStats, useCRMStore } from '@realestate-crm/hooks';
import type { StreetStats } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type SortKey = 'score' | 'contactCount' | 'daysSinceLastContact';

const SORT_BUTTONS = [
  { value: 'score', label: 'Score' },
  { value: 'contactCount', label: 'Contacts' },
  { value: 'daysSinceLastContact', label: 'Staleness' },
];

function getFreshnessDotColor(daysSinceLastContact: number | null): string {
  if (daysSinceLastContact === null || daysSinceLastContact > 30) return '#EF4444';
  if (daysSinceLastContact <= 7) return '#22C55E';
  return '#EAB308';
}

export default function StatsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const streetStats = useStreetStats();
  const setMapRegion = useCRMStore(state => state.setMapRegion);

  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');

  // Load activity data when screen mounts
  useEffect(() => {
    useCRMStore.getState().fetchRecentActivities();
  }, []);

  // Filter by suburb search and sort by selected key
  const filteredStats = useMemo(() => {
    let results = streetStats;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      results = results.filter(
        (stat) =>
          stat.suburb.toLowerCase().includes(query) ||
          stat.streetName.toLowerCase().includes(query)
      );
    }

    const sorted = [...results].sort((a, b) => {
      switch (sortKey) {
        case 'score':
          return b.score - a.score;
        case 'contactCount':
          return b.contactCount - a.contactCount;
        case 'daysSinceLastContact': {
          // Null means never contacted -- treat as most stale (highest value)
          const aDays = a.daysSinceLastContact ?? 9999;
          const bDays = b.daysSinceLastContact ?? 9999;
          return bDays - aDays;
        }
        default:
          return 0;
      }
    });

    return sorted;
  }, [streetStats, searchQuery, sortKey]);

  const handleStreetPress = useCallback(
    (stat: StreetStats) => {
      // Set the map region to center on this street's average coordinates
      setMapRegion({
        latitude: stat.averageLatitude,
        longitude: stat.averageLongitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      });
      // Navigate to the map tab
      router.push({
        pathname: '/(tabs)/map',
        params: {
          lat: stat.averageLatitude.toString(),
          lng: stat.averageLongitude.toString(),
          street: stat.streetName,
        },
      });
    },
    [router, setMapRegion]
  );

  const renderItem = useCallback(
    ({ item }: { item: StreetStats }) => {
      const dotColor = getFreshnessDotColor(item.daysSinceLastContact);

      return (
        <Surface
          style={[styles.card, { backgroundColor: theme.colors.surface }]}
          elevation={1}
        >
          <View style={styles.cardContent} onTouchEnd={() => handleStreetPress(item)}>
            <View style={styles.cardLeft}>
              <View style={styles.streetRow}>
                <View style={[styles.freshnessDot, { backgroundColor: dotColor }]} />
                <Text variant="titleMedium" style={{ fontWeight: 'bold', flex: 1 }}>
                  {item.streetName}
                </Text>
              </View>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
              >
                {item.suburb}
              </Text>
            </View>

            <View style={styles.cardRight}>
              <View
                style={[
                  styles.contactBadge,
                  { backgroundColor: theme.colors.primaryContainer },
                ]}
              >
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.onPrimaryContainer, fontWeight: 'bold' }}
                >
                  {item.contactCount}
                </Text>
              </View>
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
              >
                Score: {item.score}
              </Text>
            </View>
          </View>
        </Surface>
      );
    },
    [theme, handleStreetPress]
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon
        name="chart-bar"
        size={48}
        color={theme.colors.onSurfaceVariant}
        style={{ marginBottom: 16 }}
      />
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        No street data
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
      >
        Add contacts with addresses to see street statistics
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Filter by suburb or street..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <View style={styles.sortContainer}>
        <SegmentedButtons
          value={sortKey}
          onValueChange={(value) => setSortKey(value as SortKey)}
          buttons={SORT_BUTTONS}
          style={styles.segmentedButtons}
        />
      </View>

      <FlatList
        data={filteredStats}
        keyExtractor={(item) => `${item.streetName}|${item.suburb}`}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={
          filteredStats.length === 0 ? styles.emptyList : styles.list
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchbar: {
    elevation: 0,
  },
  sortContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  segmentedButtons: {
    // Default styling from Paper is sufficient
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  card: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  streetRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  freshnessDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  cardRight: {
    alignItems: 'center',
  },
  contactBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
