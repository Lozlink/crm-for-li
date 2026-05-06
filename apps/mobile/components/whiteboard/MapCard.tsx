import { useEffect, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { reverseGeocode, buildMapDeepLink } from '@realestate-crm/api';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import type { WhiteboardItem, WhiteboardMapContent } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
}

/**
 * MapCard — a static "snippet" of the territory map, anchored to a viewport.
 *
 * Resolves a human-readable address via OSM Nominatim reverse-geocode on
 * first render; writes the result back to the whiteboard row so subsequent
 * renders skip the network call. Falls back to suburb, then raw coords.
 *
 * Tapping navigates to the map tab with focus + layer params so the view
 * lands at the saved viewport (T#13).
 *
 * Deep-link param contract for /(tabs)/map:
 *   ?lat=<latitude>&lng=<longitude>&zoom=<latitudeDelta>&layer=<layerKey>
 *
 * Note on zoom semantics: `viewport.zoom` is stored as a **tile-zoom integer**
 * (Google/OSM convention, ~1-20) — that's what users mentally associate with
 * "zoom level" and what the editor surfaces. The map screen, however, takes a
 * `latitudeDelta` in degrees. We convert here so callers see a sensible zoom
 * regardless of which units they think in. (Earlier revisions pushed the raw
 * tile-zoom value as `?zoom=`, which the map screen interpreted as ~1450km
 * latitudeDelta and showed the entire continent.)
 */
export function MapCard({ item }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const content = item.content as WhiteboardMapContent;
  const { lat, lng, zoom } = content.viewport;
  const updateItem = useWhiteboardStore((s) => s.updateItem);

  const [resolvedAddress, setResolvedAddress] = useState<string | null>(
    content.address || null,
  );
  const [resolvedSuburb, setResolvedSuburb] = useState<string | null>(
    content.suburb || null,
  );

  useEffect(() => {
    // Already resolved — nothing to do.
    if (content.address) return;

    let cancelled = false;
    reverseGeocode(lat, lng).then((result) => {
      if (cancelled || !result) return;
      setResolvedAddress(result.address);
      setResolvedSuburb(result.suburb);
      // Persist back so the next render skips the network call.
      const updatedContent: WhiteboardMapContent = {
        ...content,
        address: result.address,
        suburb: result.suburb,
      };
      updateItem(item.id, { content: updatedContent });
    });
    return () => { cancelled = true; };
  }, [lat, lng]);

  const displayLine1 = resolvedAddress || null;
  const displayLine2 = resolvedSuburb || null;
  const fallbackCoords = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  const handlePress = () => {
    const deepLink = buildMapDeepLink({ lat, lng, tileZoom: zoom });
    router.push(`/(tabs)/map${deepLink}` as never);
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
        {displayLine1 ? (
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={[styles.addressLine, { color: theme.colors.onSurface }]}
          >
            {displayLine1}
          </Text>
        ) : null}
        {displayLine2 ? (
          <Text
            variant="bodySmall"
            numberOfLines={1}
            style={[styles.suburbLine, { color: theme.colors.onSurfaceVariant }]}
          >
            {displayLine2}
          </Text>
        ) : null}
        {!displayLine1 && !displayLine2 ? (
          <Text
            variant="bodySmall"
            style={[styles.coord, { color: theme.colors.onSurfaceVariant }]}
          >
            {content.address === undefined ? 'Resolving address...' : fallbackCoords}
          </Text>
        ) : null}
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
  addressLine: { fontWeight: '600', textAlign: 'center' },
  suburbLine: { textAlign: 'center', opacity: 0.7 },
  coord: { fontWeight: '600' },
  hint: { textAlign: 'right', fontWeight: '600' },
});
