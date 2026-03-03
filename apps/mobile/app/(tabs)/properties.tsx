import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, FlatList, ScrollView, Alert } from 'react-native';
import {
  FAB, useTheme, Text, Chip, ActivityIndicator, Surface,
  IconButton, Portal, Dialog, Button, TextInput,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { usePropertyStore, useSavedSearchStore } from '@realestate-crm/hooks';
import type {
  Property, PropertyForType, PropertyStatus, PropertyType, PropertyCategory,
} from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const FOR_TYPE_FILTERS: { label: string; value: PropertyForType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Sale', value: 'sale' },
  { label: 'Lease', value: 'lease' },
];

const STATUS_LABELS: Record<PropertyStatus, string> = {
  appraisal: 'Appraisal',
  available: 'Listed',
  under_offer: 'Under Offer',
  exchanged: 'Exchanged',
  settled: 'Settled',
  leased: 'Leased',
  withdrawn: 'Withdrawn',
};

const STATUS_FILTERS: { label: string; value: PropertyStatus | 'all' }[] = [
  { label: 'All Status', value: 'all' },
  { label: 'Appraisal', value: 'appraisal' },
  { label: 'Listed', value: 'available' },
  { label: 'Under Offer', value: 'under_offer' },
  { label: 'Exchanged', value: 'exchanged' },
  { label: 'Settled', value: 'settled' },
  { label: 'Leased', value: 'leased' },
  { label: 'Withdrawn', value: 'withdrawn' },
];

const PROPERTY_TYPE_OPTIONS: { label: string; value: PropertyType }[] = [
  { label: 'Residential', value: 'residential' },
  { label: 'Commercial', value: 'commercial' },
];

const CATEGORY_OPTIONS: { label: string; value: PropertyCategory }[] = [
  { label: 'House', value: 'house' },
  { label: 'Apartment', value: 'apartment' },
  { label: 'Townhouse', value: 'townhouse' },
  { label: 'Land', value: 'land' },
  { label: 'Unit', value: 'unit' },
  { label: 'Villa', value: 'villa' },
  { label: 'Acreage', value: 'acreage' },
  { label: 'Block of Units', value: 'block_of_units' },
  { label: 'Other', value: 'other' },
];

interface PropertyFilters {
  forType: PropertyForType | 'all';
  status: PropertyStatus | 'all';
  propertyType: PropertyType | null;
  category: PropertyCategory | null;
  priceMin: string;
  priceMax: string;
  bedsMin: string;
  bathsMin: string;
  carsMin: string;
}

const DEFAULT_FILTERS: PropertyFilters = {
  forType: 'all',
  status: 'all',
  propertyType: null,
  category: null,
  priceMin: '',
  priceMax: '',
  bedsMin: '',
  bathsMin: '',
  carsMin: '',
};

function getStatusColor(status: PropertyStatus): string {
  switch (status) {
    case 'appraisal':
      return '#6366f1';
    case 'available':
      return '#16a34a';
    case 'under_offer':
      return '#f59e0b';
    case 'exchanged':
      return '#2563eb';
    case 'settled':
      return '#059669';
    case 'leased':
      return '#0d9488';
    case 'withdrawn':
      return '#9ca3af';
  }
}

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

function getDisplayPriceValue(property: Property): number | undefined {
  return property.advertised_price ?? property.appraisal_price ?? property.sale_price;
}

function hasActiveAdvancedFilters(filters: PropertyFilters): boolean {
  return (
    filters.propertyType !== null ||
    filters.category !== null ||
    filters.priceMin !== '' ||
    filters.priceMax !== '' ||
    filters.bedsMin !== '' ||
    filters.bathsMin !== '' ||
    filters.carsMin !== ''
  );
}

function hasAnyActiveFilters(filters: PropertyFilters): boolean {
  return (
    filters.forType !== 'all' ||
    filters.status !== 'all' ||
    hasActiveAdvancedFilters(filters)
  );
}

function filtersToRecord(filters: PropertyFilters): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  if (filters.forType !== 'all') record.forType = filters.forType;
  if (filters.status !== 'all') record.status = filters.status;
  if (filters.propertyType) record.propertyType = filters.propertyType;
  if (filters.category) record.category = filters.category;
  if (filters.priceMin) record.priceMin = filters.priceMin;
  if (filters.priceMax) record.priceMax = filters.priceMax;
  if (filters.bedsMin) record.bedsMin = filters.bedsMin;
  if (filters.bathsMin) record.bathsMin = filters.bathsMin;
  if (filters.carsMin) record.carsMin = filters.carsMin;
  return record;
}

function recordToFilters(record: Record<string, unknown>): PropertyFilters {
  return {
    forType: (record.forType as PropertyForType) || 'all',
    status: (record.status as PropertyStatus) || 'all',
    propertyType: (record.propertyType as PropertyType) || null,
    category: (record.category as PropertyCategory) || null,
    priceMin: (record.priceMin as string) || '',
    priceMax: (record.priceMax as string) || '',
    bedsMin: (record.bedsMin as string) || '',
    bathsMin: (record.bathsMin as string) || '',
    carsMin: (record.carsMin as string) || '',
  };
}

export default function PropertiesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const properties = usePropertyStore(state => state.properties);
  const isLoading = usePropertyStore(state => state.isLoading);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);

  const savedSearches = useSavedSearchStore(state => state.savedSearches);
  const fetchSavedSearches = useSavedSearchStore(state => state.fetchSavedSearches);
  const createSavedSearch = useSavedSearchStore(state => state.createSavedSearch);
  const deleteSavedSearch = useSavedSearchStore(state => state.deleteSavedSearch);

  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<PropertyFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<PropertyFilters>(DEFAULT_FILTERS);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');

  const propertySavedSearches = useMemo(
    () => savedSearches.filter(s => s.entity_type === 'property'),
    [savedSearches]
  );

  useFocusEffect(
    useCallback(() => {
      fetchProperties();
      fetchSavedSearches('property');
    }, [fetchProperties, fetchSavedSearches])
  );

  const filteredProperties = useMemo(() => {
    let result = properties;

    if (filters.forType !== 'all') {
      result = result.filter(p => p.for_type === filters.forType);
    }
    if (filters.status !== 'all') {
      result = result.filter(p => p.status === filters.status);
    }
    if (filters.propertyType) {
      result = result.filter(p => p.property_type === filters.propertyType);
    }
    if (filters.category) {
      result = result.filter(p => p.category === filters.category);
    }
    if (filters.priceMin) {
      const min = parseFloat(filters.priceMin);
      if (!isNaN(min)) {
        result = result.filter(p => {
          const price = getDisplayPriceValue(p);
          return price != null && price >= min;
        });
      }
    }
    if (filters.priceMax) {
      const max = parseFloat(filters.priceMax);
      if (!isNaN(max)) {
        result = result.filter(p => {
          const price = getDisplayPriceValue(p);
          return price != null && price <= max;
        });
      }
    }
    if (filters.bedsMin) {
      const min = parseInt(filters.bedsMin, 10);
      if (!isNaN(min)) {
        result = result.filter(p => p.beds != null && p.beds >= min);
      }
    }
    if (filters.bathsMin) {
      const min = parseInt(filters.bathsMin, 10);
      if (!isNaN(min)) {
        result = result.filter(p => p.baths != null && p.baths >= min);
      }
    }
    if (filters.carsMin) {
      const min = parseInt(filters.carsMin, 10);
      if (!isNaN(min)) {
        result = result.filter(p => p.cars != null && p.cars >= min);
      }
    }

    return result;
  }, [properties, filters]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProperties();
    setRefreshing(false);
  }, [fetchProperties]);

  const handlePropertyPress = useCallback((property: Property) => {
    router.push(`/property/${property.id}`);
  }, [router]);

  const handleAddProperty = () => {
    router.push('/property/new');
  };

  const openFilterDialog = () => {
    setDraftFilters({ ...filters });
    setShowFilterDialog(true);
  };

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setShowFilterDialog(false);
  };

  const clearAllFilters = () => {
    setDraftFilters({ ...DEFAULT_FILTERS });
  };

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) return;
    await createSavedSearch({
      name: saveSearchName.trim(),
      entity_type: 'property',
      filters: filtersToRecord(filters),
      is_shared: false,
    });
    setSaveSearchName('');
    setShowSaveDialog(false);
  };

  const handleApplySavedSearch = (searchFilters: Record<string, unknown>) => {
    setFilters(recordToFilters(searchFilters));
  };

  const handleDeleteSavedSearch = (id: string, name: string) => {
    Alert.alert('Delete Saved Search', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSavedSearch(id) },
    ]);
  };

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (filters.forType !== 'all') labels.push(filters.forType === 'sale' ? 'Sale' : 'Lease');
    if (filters.status !== 'all') labels.push(STATUS_LABELS[filters.status]);
    if (filters.propertyType) labels.push(filters.propertyType === 'residential' ? 'Residential' : 'Commercial');
    if (filters.category) labels.push(filters.category.replace(/_/g, ' '));
    if (filters.priceMin) labels.push(`Min $${filters.priceMin}`);
    if (filters.priceMax) labels.push(`Max $${filters.priceMax}`);
    if (filters.bedsMin) labels.push(`${filters.bedsMin}+ beds`);
    if (filters.bathsMin) labels.push(`${filters.bathsMin}+ baths`);
    if (filters.carsMin) labels.push(`${filters.carsMin}+ cars`);
    return labels;
  }, [filters]);

  const renderSavedSearches = () => {
    if (propertySavedSearches.length === 0) return null;
    return (
      <View style={styles.savedSearchContainer}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
          Saved Searches
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.savedSearchRow}>
            {propertySavedSearches.map(s => (
              <Chip
                key={s.id}
                mode="outlined"
                onPress={() => handleApplySavedSearch(s.filters)}
                onLongPress={() => handleDeleteSavedSearch(s.id, s.name)}
                style={styles.savedSearchChip}
                compact
                icon="magnify"
              >
                {s.name}
              </Chip>
            ))}
          </View>
        </ScrollView>
      </View>
    );
  };

  const renderFilters = () => (
    <View style={styles.filtersContainer}>
      {/* Saved searches row */}
      {renderSavedSearches()}

      {/* Filter row with chips and filter button */}
      <View style={styles.filterHeaderRow}>
        <View style={styles.filterChipsArea}>
          <View style={styles.filterRow}>
            {FOR_TYPE_FILTERS.map(filter => (
              <Chip
                key={filter.value}
                selected={filters.forType === filter.value}
                onPress={() => setFilters(prev => ({ ...prev, forType: filter.value }))}
                style={styles.filterChip}
                compact
              >
                {filter.label}
              </Chip>
            ))}
          </View>
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map(filter => (
              <Chip
                key={filter.value}
                selected={filters.status === filter.value}
                onPress={() => setFilters(prev => ({ ...prev, status: filter.value }))}
                style={styles.filterChip}
                compact
              >
                {filter.label}
              </Chip>
            ))}
          </View>
        </View>
        <IconButton
          icon="filter-variant"
          mode={hasActiveAdvancedFilters(filters) ? 'contained' : 'outlined'}
          onPress={openFilterDialog}
          size={20}
        />
      </View>

      {/* Active advanced filter chips */}
      {activeFilterLabels.length > 0 && (
        <View style={styles.activeFiltersRow}>
          {activeFilterLabels.map((label, idx) => (
            <Chip
              key={idx}
              compact
              style={{ backgroundColor: theme.colors.primaryContainer }}
              textStyle={{ color: theme.colors.onPrimaryContainer, fontSize: 11 }}
            >
              {label}
            </Chip>
          ))}
          {hasAnyActiveFilters(filters) && (
            <Chip
              compact
              onPress={() => setFilters({ ...DEFAULT_FILTERS })}
              icon="close"
              style={{ backgroundColor: theme.colors.errorContainer }}
              textStyle={{ color: theme.colors.onErrorContainer, fontSize: 11 }}
            >
              Clear All
            </Chip>
          )}
        </View>
      )}

      {/* Save search button */}
      {hasAnyActiveFilters(filters) && (
        <Button
          mode="outlined"
          icon="content-save"
          compact
          onPress={() => setShowSaveDialog(true)}
          style={styles.saveSearchButton}
        >
          Save Search
        </Button>
      )}
    </View>
  );

  const renderItem = useCallback(({ item }: { item: Property }) => {
    const price = getDisplayPrice(item);
    const statusColor = getStatusColor(item.status);

    return (
      <Surface style={styles.card} elevation={1}>
        <View
          style={styles.cardTouchable}
          onTouchEnd={() => handlePropertyPress(item)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Property: ${item.address}, ${STATUS_LABELS[item.status]}`}
        >
          <View style={styles.cardContent}>
            {/* Top row: thumbnail/icon + address info */}
            <View style={styles.cardTopRow}>
              <View style={styles.thumbnailContainer}>
                {item.photos && item.photos.length > 0 ? (
                  <Surface style={styles.thumbnail} elevation={0}>
                    <Icon name="image" size={24} color={theme.colors.onSurfaceVariant} />
                  </Surface>
                ) : (
                  <Surface style={[styles.thumbnail, { backgroundColor: theme.colors.primaryContainer }]} elevation={0}>
                    <Icon name="home" size={24} color={theme.colors.onPrimaryContainer} />
                  </Surface>
                )}
              </View>
              <View style={styles.addressContainer}>
                <Text variant="titleMedium" numberOfLines={1} style={styles.addressText}>
                  {item.address}
                </Text>
                {item.suburb && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.suburb}{item.state ? `, ${item.state}` : ''}{item.postcode ? ` ${item.postcode}` : ''}
                  </Text>
                )}
              </View>
            </View>

            {/* Badges row: status + for_type + price */}
            <View style={styles.badgeRow}>
              <Chip
                compact
                style={{ backgroundColor: statusColor }}
                textStyle={{ color: '#fff', fontSize: 11 }}
              >
                {STATUS_LABELS[item.status]}
              </Chip>
              <Chip
                compact
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                textStyle={{ color: theme.colors.onSecondaryContainer, fontSize: 11 }}
              >
                {item.for_type === 'sale' ? 'Sale' : 'Lease'}
              </Chip>
              {price !== '' && (
                <Text variant="titleSmall" style={{ color: theme.colors.primary, marginLeft: 'auto' }}>
                  {price}
                </Text>
              )}
            </View>

            {/* Beds/Baths/Cars row */}
            {(item.beds != null || item.baths != null || item.cars != null) && (
              <View style={styles.metaRow}>
                {item.beds != null && (
                  <View style={styles.metaItem}>
                    <Icon name="bed" size={14} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                      {item.beds}
                    </Text>
                  </View>
                )}
                {item.baths != null && (
                  <View style={styles.metaItem}>
                    <Icon name="shower" size={14} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                      {item.baths}
                    </Text>
                  </View>
                )}
                {item.cars != null && (
                  <View style={styles.metaItem}>
                    <Icon name="car" size={14} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                      {item.cars}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </Surface>
    );
  }, [theme.colors, handlePropertyPress]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Icon name="home-city-outline" size={48} color={theme.colors.onSurfaceVariant} />
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
        No properties yet
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
        Tap + to add your first property listing
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
          data={filteredProperties}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderFilters}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={filteredProperties.length === 0 ? styles.emptyList : styles.list}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: insets.bottom + 24 }]}
        color={theme.colors.onPrimary}
        onPress={handleAddProperty}
      />

      {/* Advanced Filter Dialog */}
      <Portal>
        <Dialog visible={showFilterDialog} onDismiss={() => setShowFilterDialog(false)} style={styles.dialog}>
          <Dialog.Title>Advanced Filters</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <View style={styles.dialogContent}>
                {/* Property Type */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Property Type</Text>
                <View style={styles.filterRow}>
                  {PROPERTY_TYPE_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={draftFilters.propertyType === opt.value}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          propertyType: prev.propertyType === opt.value ? null : opt.value,
                        }))
                      }
                      style={styles.filterChip}
                      compact
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Category */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Category</Text>
                <View style={styles.filterRow}>
                  {CATEGORY_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={draftFilters.category === opt.value}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          category: prev.category === opt.value ? null : opt.value,
                        }))
                      }
                      style={styles.filterChip}
                      compact
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Status */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Status</Text>
                <View style={styles.filterRow}>
                  {STATUS_FILTERS.map(filter => (
                    <Chip
                      key={filter.value}
                      selected={draftFilters.status === filter.value}
                      onPress={() =>
                        setDraftFilters(prev => ({ ...prev, status: filter.value }))
                      }
                      style={styles.filterChip}
                      compact
                    >
                      {filter.label}
                    </Chip>
                  ))}
                </View>

                {/* For Type */}
                <Text variant="labelLarge" style={styles.sectionLabel}>For Type</Text>
                <View style={styles.filterRow}>
                  {FOR_TYPE_FILTERS.map(filter => (
                    <Chip
                      key={filter.value}
                      selected={draftFilters.forType === filter.value}
                      onPress={() =>
                        setDraftFilters(prev => ({ ...prev, forType: filter.value }))
                      }
                      style={styles.filterChip}
                      compact
                    >
                      {filter.label}
                    </Chip>
                  ))}
                </View>

                {/* Price Range */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Price Range</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    label="Min Price"
                    value={draftFilters.priceMin}
                    onChangeText={val => setDraftFilters(prev => ({ ...prev, priceMin: val }))}
                    keyboardType="numeric"
                    mode="outlined"
                    style={styles.halfInput}
                    dense
                  />
                  <TextInput
                    label="Max Price"
                    value={draftFilters.priceMax}
                    onChangeText={val => setDraftFilters(prev => ({ ...prev, priceMax: val }))}
                    keyboardType="numeric"
                    mode="outlined"
                    style={styles.halfInput}
                    dense
                  />
                </View>

                {/* Beds / Baths / Cars */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Minimum Beds / Baths / Cars</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    label="Beds"
                    value={draftFilters.bedsMin}
                    onChangeText={val => setDraftFilters(prev => ({ ...prev, bedsMin: val }))}
                    keyboardType="numeric"
                    mode="outlined"
                    style={styles.thirdInput}
                    dense
                  />
                  <TextInput
                    label="Baths"
                    value={draftFilters.bathsMin}
                    onChangeText={val => setDraftFilters(prev => ({ ...prev, bathsMin: val }))}
                    keyboardType="numeric"
                    mode="outlined"
                    style={styles.thirdInput}
                    dense
                  />
                  <TextInput
                    label="Cars"
                    value={draftFilters.carsMin}
                    onChangeText={val => setDraftFilters(prev => ({ ...prev, carsMin: val }))}
                    keyboardType="numeric"
                    mode="outlined"
                    style={styles.thirdInput}
                    dense
                  />
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={clearAllFilters}>Clear</Button>
            <Button onPress={() => setShowFilterDialog(false)}>Cancel</Button>
            <Button mode="contained" onPress={applyFilters}>Apply</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Save Search Dialog */}
      <Portal>
        <Dialog visible={showSaveDialog} onDismiss={() => setShowSaveDialog(false)}>
          <Dialog.Title>Save Search</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Search Name"
              value={saveSearchName}
              onChangeText={setSaveSearchName}
              mode="outlined"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSaveSearch} disabled={!saveSearchName.trim()}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  filtersContainer: {
    marginBottom: 8,
    gap: 8,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  filterChipsArea: {
    flex: 1,
    gap: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    marginBottom: 0,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  savedSearchContainer: {
    marginBottom: 4,
  },
  savedSearchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  savedSearchChip: {
    marginRight: 0,
  },
  saveSearchButton: {
    alignSelf: 'flex-start',
  },
  dialog: {
    maxHeight: '80%',
  },
  dialogScrollArea: {
    paddingHorizontal: 0,
  },
  dialogContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 8,
  },
  sectionLabel: {
    marginTop: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  thirdInput: {
    flex: 1,
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
  },
  cardTouchable: {
    padding: 16,
  },
  cardContent: {
    gap: 8,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  thumbnailContainer: {
    marginRight: 12,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addressContainer: {
    flex: 1,
  },
  addressText: {
    fontWeight: '600',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
