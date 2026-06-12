import { StyleSheet, View } from 'react-native';
import { Modal, Text, Button, useTheme, Surface, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { Property, PropertyStatus } from '@realestate-crm/types';
import { useBottomSheetPadding } from './useBottomSheetPadding';

const STATUS_LABELS: Record<PropertyStatus, string> = {
  appraisal: 'Appraisal',
  available: 'Listed',
  under_offer: 'Under Offer',
  exchanged: 'Exchanged',
  settled: 'Settled',
  leased: 'Leased',
  withdrawn: 'Withdrawn',
};

function getStatusColor(status: PropertyStatus): string {
  switch (status) {
    case 'appraisal': return '#6366f1';
    case 'available': return '#16a34a';
    case 'under_offer': return '#f59e0b';
    case 'exchanged': return '#0d9488';
    case 'settled': return '#2563eb';
    case 'leased': return '#8b5cf6';
    case 'withdrawn': return '#ef4444';
  }
}

function formatPrice(price: number | undefined): string {
  if (price == null) return '';
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price}`;
}

interface PropertyPreviewProps {
  property: Property | null;
  visible: boolean;
  onDismiss: () => void;
  onViewDetails: () => void;
}

export default function PropertyPreview({
  property,
  visible,
  onDismiss,
  onViewDetails,
}: PropertyPreviewProps) {
  const theme = useTheme();
  // Bottom-anchored sheet: clear the Android nav bar / home indicator. Keep the
  // prior 100px gap as the floor so non-inset platforms are unchanged.
  const bottomGap = useBottomSheetPadding(100);

  if (!property) return null;

  const statusColor = getStatusColor(property.status);
  const displayPrice = formatPrice(property.advertised_price || property.appraisal_price || property.sale_price);
  const propertyTypeLabel = property.property_type === 'residential' ? 'Residential' : 'Commercial';
  const categoryLabel = property.category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={[
        styles.container,
        { backgroundColor: theme.colors.surface, marginBottom: bottomGap },
      ]}
    >
      <Surface style={styles.card} elevation={0}>
        <View style={styles.headerRow}>
          <Chip
            compact
            style={{ backgroundColor: statusColor }}
            textStyle={{ color: '#fff', fontSize: 11 }}
          >
            {STATUS_LABELS[property.status]}
          </Chip>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {propertyTypeLabel}
          </Text>
        </View>

        <Text variant="titleMedium" style={styles.address} numberOfLines={2}>
          {property.address}
        </Text>

        {property.suburb && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            {property.suburb}{property.state ? `, ${property.state}` : ''}{property.postcode ? ` ${property.postcode}` : ''}
          </Text>
        )}

        {displayPrice ? (
          <Text variant="titleLarge" style={[styles.price, { color: theme.colors.primary }]}>
            {displayPrice}
          </Text>
        ) : null}

        <View style={styles.specRow}>
          {property.beds != null && (
            <View style={styles.specItem}>
              <Icon name="bed-outline" size={18} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={styles.specText}>{property.beds}</Text>
            </View>
          )}
          {property.baths != null && (
            <View style={styles.specItem}>
              <Icon name="shower" size={18} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={styles.specText}>{property.baths}</Text>
            </View>
          )}
          {property.cars != null && (
            <View style={styles.specItem}>
              <Icon name="car-outline" size={18} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={styles.specText}>{property.cars}</Text>
            </View>
          )}
          {property.land_size_sqm != null && (
            <View style={styles.specItem}>
              <Icon name="ruler-square" size={18} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyMedium" style={styles.specText}>{property.land_size_sqm}m²</Text>
            </View>
          )}
        </View>

        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          {categoryLabel} -- {property.for_type === 'sale' ? 'For Sale' : 'For Lease'}
        </Text>

        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} style={styles.button}>
            Close
          </Button>
          <Button mode="contained" onPress={onViewDetails} style={styles.button}>
            View Details
          </Button>
        </View>
      </Surface>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 20,
    marginTop: 'auto',
    // marginBottom is set inline (insets-aware) — see useBottomSheetPadding.
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    padding: 20,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  address: {
    fontWeight: '600',
    marginBottom: 4,
  },
  price: {
    fontWeight: '700',
    marginBottom: 12,
  },
  specRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 4,
  },
  specItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  specText: {
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
  },
});
