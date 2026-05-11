import { StyleSheet, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { usePropertyStore } from '@realestate-crm/hooks';
import type { WhiteboardItem, WhiteboardPropertyContent, PropertyType } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
}

// Defensive partial — PropertyType may grow over time; unknown values fall
// back to a generic home icon at the call site.
const TYPE_ICON: Partial<Record<PropertyType, string>> = {
  residential: 'home-outline',
  commercial: 'office-building-outline',
};

export function PropertyCard({ item }: Props) {
  const theme = useTheme();
  const content = item.content as WhiteboardPropertyContent;
  const propertyId = content.propertyId;

  const property = usePropertyStore((s) => s.properties.find((p) => p.id === propertyId));

  if (!property) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: theme.colors.outlineVariant,
            opacity: 0.7,
          },
        ]}
      >
        <View style={styles.tombstone}>
          <Icon name="home-off-outline" size={28} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            {content.snapshotAddress || 'Property unavailable'}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.7 }}>
            {propertyId ? 'Property removed' : 'Tap edit to link a property'}
          </Text>
        </View>
      </View>
    );
  }

  const icon = TYPE_ICON[property.property_type] ?? 'home-outline';

  return (
    // Plain View (was TouchableOpacity). Navigation moved up to
    // WhiteboardItemView's tap handler — see ContactCard note.
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
      accessibilityLabel={`${property.address} property card`}
    >
      <View style={styles.header}>
        <Icon name={icon} size={20} color={theme.colors.primary} />
        <Text
          variant="labelSmall"
          style={{ color: theme.colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 0.5 }}
        >
          {property.status}
        </Text>
      </View>

      <Text variant="titleSmall" numberOfLines={2} style={{ color: theme.colors.onSurface, marginTop: 4 }}>
        {property.address}
      </Text>
      <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
        {property.suburb}
        {property.state ? `, ${property.state}` : ''}
      </Text>

      <View style={styles.footer}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.7 }}>
          {property.category}
        </Text>
        <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tombstone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
  },
});
