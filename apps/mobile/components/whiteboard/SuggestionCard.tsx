import { useColorScheme, StyleSheet, View, Pressable } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { buildMapDeepLink } from '@realestate-crm/api';
import {
  getSuggestionKindDef,
  suggestionKindColorForScheme,
} from './whiteboardColors';
import type { WhiteboardSuggestionItem } from './types';
import type { WhiteboardSuggestionKind } from '@realestate-crm/types';

// ─── Kind-specific CTA labels ──────────────────────────────────────────────────
// "Real-estate agent voice" — active, contextual, no "AI" language.
const CTA_LABEL: Record<WhiteboardSuggestionKind, string> = {
  hot_prospects: 'Call now',
  coverage_gap:  'Open map',
  today_play:    'View inspection',
  route:         'Open route',
};

interface Props {
  item: WhiteboardSuggestionItem;
}

/**
 * SuggestionCard — canvas widget rendered when `item.type === 'suggestion'`.
 *
 * Design spec: DESIGN.md §12.2.
 *
 * Visual anatomy:
 *  ┌──────────────────────────────────────────────┐
 *  │▍ [icon 14pt] Kind label (labelSmall, bold)    │  ← 4pt left stripe (kind accent)
 *  │  Title (titleSmall, 600, 1 line)              │
 *  │  Body  (bodyMedium, 2 lines, onSurface)       │
 *  │                                               │
 *  │  Tap to view          [Kind-specific CTA →]  │  ← footer affordance
 *  └──────────────────────────────────────────────┘
 *
 * Read-only on canvas in Move mode (tap = bring-to-front).
 * In Edit mode the footer CTA becomes tappable → kind-specific deep link.
 *
 * Copy rule: NO "AI" in any displayed string.
 */
export function SuggestionCard({ item }: Props) {
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const router = useRouter();

  const { kind, title, body, payload } = item.content;
  const kindDef = getSuggestionKindDef(kind);
  const accentColor = suggestionKindColorForScheme(kindDef, colorScheme);
  const labelColor = colorScheme === 'dark' ? '#FFFFFF' : darken(accentColor, 0.45);

  const handleNavigate = () => {
    const target = buildNavTarget(kind, payload);
    if (!target) return; // fail-soft: payload missing required fields
    router.push(target as never);
  };

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
          borderLeftColor: accentColor,
        },
      ]}
    >
      {/* ── Kind badge row ───────────────────────────────────────────── */}
      <View style={[styles.kindRow, { backgroundColor: accentColor + '22' }]}>
        <Icon name={kindDef.icon} size={13} color={labelColor} style={styles.kindIcon} />
        <Text
          variant="labelSmall"
          numberOfLines={1}
          style={[styles.kindLabel, { color: labelColor }]}
        >
          {kindDef.label}
        </Text>
      </View>

      {/* ── Title ────────────────────────────────────────────────────── */}
      <Text
        variant="titleSmall"
        numberOfLines={1}
        style={[styles.title, { color: theme.colors.onSurface }]}
      >
        {title}
      </Text>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      {!!body && (
        <Text
          variant="bodySmall"
          numberOfLines={2}
          style={[styles.body, { color: theme.colors.onSurfaceVariant }]}
        >
          {body}
        </Text>
      )}

      {/* ── Footer CTA ───────────────────────────────────────────────── */}
      <View style={styles.footer}>
        <Text
          variant="labelSmall"
          style={[styles.footerHint, { color: theme.colors.onSurfaceVariant }]}
        >
          Tap to view
        </Text>
        <Pressable
          onPress={handleNavigate}
          style={({ pressed }) => [
            styles.ctaButton,
            { backgroundColor: accentColor + (pressed ? '44' : '22') },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${CTA_LABEL[kind]} — ${title}`}
          hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
        >
          <Text
            variant="labelSmall"
            style={[styles.ctaLabel, { color: labelColor }]}
          >
            {CTA_LABEL[kind]}
          </Text>
          <Icon name="chevron-right" size={12} color={labelColor} />
        </Pressable>
      </View>
    </View>
  );
}

// ─── Navigation helper ────────────────────────────────────────────────────────

/**
 * Derives the expo-router push target from the kind + persisted payload.
 *
 * Map deep-link param contract (consumed by /(tabs)/map.tsx):
 *   ?lat=<latitude>  — map centers here
 *   &lng=<longitude>
 *   &zoom=<latitudeDelta>  — defaults to 0.01 (≈1km) when omitted
 *   &layer=<layerKey>  — auto-enables the named VisibleLayers key on arrival
 *
 * Returns null when the payload is missing required fields so the caller can
 * fail-soft (no navigation, optional snackbar).
 */
function buildNavTarget(
  kind: WhiteboardSuggestionKind,
  payload: Record<string, unknown> | undefined,
): string | null {
  switch (kind) {
    case 'hot_prospects': {
      const ids = payload?.contactIds as string[] | undefined;
      if (ids?.[0]) return `/contact/${ids[0]}`;
      // Fall back to contact list if no specific id persisted.
      return '/(tabs)/contacts';
    }
    case 'coverage_gap': {
      // Payload: { buildingId, coverage, address, lat?, lng? }
      // New suggestions carry lat/lng (B3 fix) so we can fly the map directly
      // to the building. Older persisted suggestions lack the coords; those
      // fall through to a layer-only nav so the user at least lands on the
      // right view rather than getting nothing.
      const lat = payload?.lat as number | undefined;
      const lng = payload?.lng as number | undefined;
      if (typeof lat === 'number' && typeof lng === 'number') {
        // Tile-zoom 17 ≈ 0.0027° (~300m) — close enough to spot the building.
        return `/(tabs)/map${buildMapDeepLink({ lat, lng, tileZoom: 17, layer: 'buildings' })}`;
      }
      return '/(tabs)/map?layer=buildings';
    }
    case 'today_play': {
      const id = payload?.inspectionId as string | undefined;
      return id ? `/inspection/${id}` : '/(tabs)/prospecting';
    }
    case 'route': {
      const lls = payload?.orderedLatLngs as { lat: number; lng: number }[] | undefined;
      if (lls?.[0]) {
        // Zoom out a bit (0.05 ≈ 5km) to show several contacts at once.
        return `/(tabs)/map${buildMapDeepLink({ lat: lls[0].lat, lng: lls[0].lng, latitudeDelta: 0.05, layer: 'contacts' })}`;
      }
      return null;
    }
  }
}

// ─── Colour util ──────────────────────────────────────────────────────────────

/** Darken a 6-char hex toward black by `amount` (0–1). No third-party dep. */
function darken(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const r = Math.max(0, Math.round(parseInt(raw.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(raw.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(raw.slice(4, 6), 16) * (1 - amount)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,            // Kind-accent stripe — BaseWidget convention (DESIGN.md §4)
    paddingLeft: 10,               // 12 − 2 to account for the 4pt stripe
    paddingRight: 12,
    paddingTop: 8,                 // Top 8pt reserved for drag-handle overlay
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  // Kind badge pill
  kindRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: 5,
  },
  kindIcon: {
    marginRight: 4,
  },
  kindLabel: {
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  title: {
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    lineHeight: 15,
    marginBottom: 4,
  },
  // Footer row: hint label + CTA button
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 4,
  },
  footerHint: {
    opacity: 0.5,
    letterSpacing: 0.2,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 2,
  },
  ctaLabel: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
