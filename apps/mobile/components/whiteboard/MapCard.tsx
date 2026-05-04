import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import type { WhiteboardItem, WhiteboardMapContent } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
}

function formatCoord(n: number): string {
  return n.toFixed(4);
}

/**
 * MapCard — a static "snippet" of the territory map, anchored to a viewport.
 *
 * Phase 2 ships as a tap-to-open shortcut (no live thumbnail rendering — we
 * deliberately avoid spawning multiple MapView instances on a board). Tapping
 * navigates to the main map route. Future polish: snapshot rendering via
 * react-native-maps `liteMode` or a server-rendered tile preview.
 */
export function MapCard({ item }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const content = item.content as WhiteboardMapContent;
  const { lat, lng, zoom } = content.viewport;

  const handlePress = () => {
    router.push('/(tabs)/map');
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={handlePress}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surfaceVariant,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Open territory map at this location"
    >
      <View style={styles.header}>
        <Icon name="map-marker-radius-outline" size={18} color={theme.colors.primary} />
        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          Territory pin
        </Text>
      </View>

      <View style={styles.body}>
        <Icon
          name="map"
          size={36}
          color={theme.colors.primary}
          style={{ opacity: 0.55 }}
        />
        <Text variant="bodySmall" style={[styles.coord, { color: theme.colors.onSurfaceVariant }]}>
          {formatCoord(lat)}, {formatCoord(lng)}
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.7 }}>
          Zoom {zoom}
        </Text>
      </View>

      <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.primary }]}>
        Tap to open
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 12,
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
  label: { fontWeight: '600' },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  coord: { fontWeight: '600' },
  hint: { textAlign: 'right', fontWeight: '600' },
});
