import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, ScrollView, Dimensions, RefreshControl, TouchableOpacity } from 'react-native';
import { useTheme, Text, Chip, ActivityIndicator, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { usePropertyStore } from '@realestate-crm/hooks';
import { getPropertyPipelineValue } from '@realestate-crm/utils';
import type { Property, PropertyForType, PropertyStatus } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// --- Pipeline stage definitions per for_type ---

const SALE_STAGES: { status: PropertyStatus; label: string }[] = [
  { status: 'appraisal', label: 'Appraisal' },
  { status: 'available', label: 'Listed' },
  { status: 'under_offer', label: 'Under Offer' },
  { status: 'exchanged', label: 'Exchanged' },
  { status: 'settled', label: 'Settled' },
];

const LEASE_STAGES: { status: PropertyStatus; label: string }[] = [
  { status: 'appraisal', label: 'Appraisal' },
  { status: 'available', label: 'Listed' },
  { status: 'leased', label: 'Leased' },
];

// --- Helpers ---

function formatPrice(price: number | undefined): string {
  if (price == null) return '';
  if (price >= 1_000_000) {
    return `$${(price / 1_000_000).toFixed(1)}M`;
  }
  if (price >= 1_000) {
    return `$${(price / 1_000).toFixed(0)}K`;
  }
  return `$${price}`;
}

function getDisplayPrice(property: Property): string {
  if (property.advertised_price) return formatPrice(property.advertised_price);
  if (property.appraisal_price) return formatPrice(property.appraisal_price);
  if (property.sale_price) return formatPrice(property.sale_price);
  return '';
}

// Now delegates to the shared helper so this screen, Today, and Stats all
// compute pipeline value the same way. Kept as a thin alias because the
// callsite below reads more clearly as `getRawPrice(p)` than fully qualified.
const getRawPrice = getPropertyPipelineValue;

function getDaysInStage(property: Property): number {
  const now = new Date();
  let stageDate: string | undefined;

  switch (property.status) {
    case 'available':
      stageDate = property.listed_at;
      break;
    case 'exchanged':
      stageDate = property.exchanged_at;
      break;
    case 'settled':
    case 'leased':
      stageDate = property.settled_at;
      break;
    default:
      stageDate = undefined;
      break;
  }

  const dateStr = stageDate ?? property.created_at;
  if (!dateStr) return 0;

  const diff = now.getTime() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

type DaysColorBand = 'green' | 'amber' | 'red';

function getDaysColorBand(days: number): DaysColorBand {
  if (days < 7) return 'green';
  if (days <= 30) return 'amber';
  return 'red';
}

const DAYS_BAND_COLORS: Record<DaysColorBand, { bg: string; text: string }> = {
  green: { bg: '#dcfce7', text: '#166534' },
  amber: { bg: '#fef3c7', text: '#92400e' },
  red: { bg: '#fee2e2', text: '#991b1b' },
};

const COLUMN_WIDTH = 260;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Component ---

export default function PipelineScreen() {
  const theme = useTheme();
  const router = useRouter();

  const properties = usePropertyStore(state => state.properties);
  const isLoading = usePropertyStore(state => state.isLoading);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);

  const [refreshing, setRefreshing] = useState(false);
  const [forType, setForType] = useState<PropertyForType>('sale');

  useFocusEffect(
    useCallback(() => {
      fetchProperties();
    }, [fetchProperties])
  );

  const stages = forType === 'sale' ? SALE_STAGES : LEASE_STAGES;

  const filteredProperties = useMemo(() => {
    return properties.filter(p => p.for_type === forType && p.status !== 'withdrawn');
  }, [properties, forType]);

  const groupedByStatus = useMemo(() => {
    const map = new Map<PropertyStatus, Property[]>();
    for (const stage of stages) {
      map.set(stage.status, []);
    }
    for (const p of filteredProperties) {
      const bucket = map.get(p.status);
      if (bucket) {
        bucket.push(p);
      }
    }
    return map;
  }, [filteredProperties, stages]);

  const { totalValue, totalCount } = useMemo(() => {
    let value = 0;
    let count = 0;
    for (const p of filteredProperties) {
      value += getRawPrice(p);
      count += 1;
    }
    return { totalValue: value, totalCount: count };
  }, [filteredProperties]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProperties();
    setRefreshing(false);
  }, [fetchProperties]);

  const handlePropertyPress = useCallback((property: Property) => {
    router.push(`/property/${property.id}`);
  }, [router]);

  // --- Render helpers ---

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Sale / Lease toggle */}
      <View style={styles.toggleRow}>
        <Chip
          selected={forType === 'sale'}
          onPress={() => setForType('sale')}
          style={styles.toggleChip}
          compact
        >
          Sale
        </Chip>
        <Chip
          selected={forType === 'lease'}
          onPress={() => setForType('lease')}
          style={styles.toggleChip}
          compact
        >
          Lease
        </Chip>
      </View>

      {/* Summary row */}
      <Surface style={[styles.summaryCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text variant="labelSmall" style={{ color: theme.colors.onPrimaryContainer }}>
              Pipeline Value
            </Text>
            <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700' }}>
              {formatPrice(totalValue) || '$0'}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text variant="labelSmall" style={{ color: theme.colors.onPrimaryContainer }}>
              Properties
            </Text>
            <Text variant="titleMedium" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700' }}>
              {totalCount}
            </Text>
          </View>
        </View>
      </Surface>
    </View>
  );

  const renderPropertyCard = (property: Property) => {
    const price = getDisplayPrice(property);
    const days = getDaysInStage(property);
    const band = getDaysColorBand(days);
    const bandColors = DAYS_BAND_COLORS[band];

    return (
      <Surface key={property.id} style={styles.card} elevation={1}>
        <TouchableOpacity
          style={styles.cardTouchable}
          onPress={() => handlePropertyPress(property)}
          activeOpacity={0.7}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Property: ${property.address}, ${days} days in stage`}
        >
          <Text variant="bodyMedium" numberOfLines={2} style={styles.cardAddress}>
            {property.address}
          </Text>
          {property.suburb && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
              {property.suburb}
            </Text>
          )}

          <View style={styles.cardBottomRow}>
            {price !== '' && (
              <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                {price}
              </Text>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {property.latitude != null && property.longitude != null && (
                <TouchableOpacity
                  onPress={() => router.push(`/(tabs)/map?lat=${property.latitude}&lng=${property.longitude}&zoom=0.005&layer=properties` as never)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.6}
                >
                  <Icon name="map-marker-outline" size={16} color={theme.colors.primary} />
                </TouchableOpacity>
              )}
              <Chip
                compact
                style={[styles.daysBadge, { backgroundColor: bandColors.bg }]}
                textStyle={{ color: bandColors.text, fontSize: 11 }}
              >
                {days}d
              </Chip>
            </View>
          </View>

          {/* Beds / Baths / Cars */}
          {(property.beds != null || property.baths != null || property.cars != null) && (
            <View style={styles.metaRow}>
              {property.beds != null && (
                <View style={styles.metaItem}>
                  <Icon name="bed" size={12} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 3 }}>
                    {property.beds}
                  </Text>
                </View>
              )}
              {property.baths != null && (
                <View style={styles.metaItem}>
                  <Icon name="shower" size={12} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 3 }}>
                    {property.baths}
                  </Text>
                </View>
              )}
              {property.cars != null && (
                <View style={styles.metaItem}>
                  <Icon name="car" size={12} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 3 }}>
                    {property.cars}
                  </Text>
                </View>
              )}
            </View>
          )}
        </TouchableOpacity>
      </Surface>
    );
  };

  const renderColumn = (stage: { status: PropertyStatus; label: string }) => {
    const items = groupedByStatus.get(stage.status) ?? [];

    return (
      <View key={stage.status} style={styles.column}>
        <Surface style={[styles.columnHeader, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant }}>
            {stage.label}
          </Text>
          <Chip compact style={styles.countChip} textStyle={{ fontSize: 11 }}>
            {items.length}
          </Chip>
        </Surface>
        <ScrollView
          style={styles.columnScroll}
          contentContainerStyle={styles.columnScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {items.length === 0 ? (
            <View style={styles.emptyColumn}>
              <Icon name="tray-remove" size={24} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                No properties
              </Text>
            </View>
          ) : (
            items.map(renderPropertyCard)
          )}
        </ScrollView>
      </View>
    );
  };

  // --- Main render ---

  if (isLoading && !refreshing) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {renderHeader()}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[
          styles.boardContainer,
          { minWidth: Math.max(stages.length * COLUMN_WIDTH, SCREEN_WIDTH) },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {stages.map(renderColumn)}
      </ScrollView>
    </View>
  );
}

// --- Styles ---

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  headerContainer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleChip: {
    marginBottom: 0,
  },
  summaryCard: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },

  // Board
  boardContainer: {
    paddingHorizontal: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },

  // Column
  column: {
    width: COLUMN_WIDTH,
    marginHorizontal: 6,
    flex: 1,
  },
  columnHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 8,
  },
  countChip: {
    marginBottom: 0,
  },
  columnScroll: {
    flex: 1,
  },
  columnScrollContent: {
    paddingBottom: 24,
  },
  emptyColumn: {
    alignItems: 'center',
    paddingVertical: 24,
    opacity: 0.6,
  },

  // Card
  card: {
    marginBottom: 10,
    borderRadius: 10,
  },
  cardTouchable: {
    padding: 12,
    gap: 4,
  },
  cardAddress: {
    fontWeight: '600',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  daysBadge: {
    marginBottom: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
