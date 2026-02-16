import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import {
  useTheme,
  Text,
  Chip,
  Surface,
  ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, Stack } from 'expo-router';
import MapView, { Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import Constants from 'expo-constants';
import { useTrackingStore } from '@realestate-crm/hooks';
import { decodePolyline } from '@realestate-crm/api';
import type { TrackingSession, TrackingBreadcrumb } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const MAP_HEIGHT = 250;

const GOOGLE_MAPS_API_KEY =
  Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY ||
  Constants.expoConfig?.extra?.googleMapsApiKey ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  '';

// ---- Helpers ----

function formatDuration(seconds: number): string {
  if (seconds < 60) return '< 1m';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Sample breadcrumbs at roughly every 5-minute intervals for
 * the timeline view, always including first and last.
 */
function sampleBreadcrumbs(
  breadcrumbs: TrackingBreadcrumb[],
  intervalMs: number = 5 * 60 * 1000,
): TrackingBreadcrumb[] {
  if (breadcrumbs.length <= 2) return [...breadcrumbs];

  const sampled: TrackingBreadcrumb[] = [breadcrumbs[0]];
  let lastTime = new Date(breadcrumbs[0].recorded_at).getTime();

  for (let i = 1; i < breadcrumbs.length - 1; i++) {
    const time = new Date(breadcrumbs[i].recorded_at).getTime();
    if (time - lastTime >= intervalMs) {
      sampled.push(breadcrumbs[i]);
      lastTime = time;
    }
  }

  // Always include the last breadcrumb
  const last = breadcrumbs[breadcrumbs.length - 1];
  if (sampled[sampled.length - 1].id !== last.id) {
    sampled.push(last);
  }

  return sampled;
}

// ---- Timeline entry type ----

interface TimelineEntry {
  id: string;
  time: string;
  address: string | null;
  isFirst: boolean;
  isLast: boolean;
  isLoading: boolean;
}

// ---- Component ----

export default function TrackingSessionDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mapRef = useRef<MapView>(null);

  // Store data
  const sessions = useTrackingStore((s) => s.sessions);
  const fetchSessionBreadcrumbs = useTrackingStore(
    (s) => s.fetchSessionBreadcrumbs,
  );

  const session: TrackingSession | undefined = useMemo(
    () => sessions.find((s) => s.id === id),
    [sessions, id],
  );

  // Local state
  const [breadcrumbs, setBreadcrumbs] = useState<TrackingBreadcrumb[]>([]);
  const [breadcrumbsLoading, setBreadcrumbsLoading] = useState(true);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [geocodingComplete, setGeocodingComplete] = useState(false);

  // Decode polyline or fall back to raw breadcrumbs
  const pathCoordinates = useMemo(() => {
    if (session?.polyline) {
      try {
        return decodePolyline(session.polyline);
      } catch {
        // fall through to breadcrumbs
      }
    }
    if (breadcrumbs.length > 0) {
      return breadcrumbs.map((b) => ({
        latitude: b.latitude,
        longitude: b.longitude,
      }));
    }
    return [];
  }, [session?.polyline, breadcrumbs]);

  // Load breadcrumbs
  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    setBreadcrumbsLoading(true);

    fetchSessionBreadcrumbs(id).then((data) => {
      if (!cancelled) {
        setBreadcrumbs(data);
        setBreadcrumbsLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [id, fetchSessionBreadcrumbs]);

  // Fit map to path
  useEffect(() => {
    if (pathCoordinates.length > 0 && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(pathCoordinates, {
          edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
          animated: true,
        });
      }, 300);
    }
  }, [pathCoordinates]);

  // Build timeline entries and reverse geocode
  useEffect(() => {
    if (breadcrumbsLoading || breadcrumbs.length === 0) {
      setTimelineEntries([]);
      return;
    }

    let cancelled = false;
    const sampled = sampleBreadcrumbs(breadcrumbs);

    // Initialize entries with loading state
    const initial: TimelineEntry[] = sampled.map((b, i) => ({
      id: b.id,
      time: formatTime(b.recorded_at),
      address: null,
      isFirst: i === 0,
      isLast: i === sampled.length - 1,
      isLoading: true,
    }));
    setTimelineEntries(initial);
    setGeocodingComplete(false);

    // Reverse geocode each sampled point
    const geocode = async () => {
      const results: TimelineEntry[] = [...initial];

      for (let i = 0; i < sampled.length; i++) {
        if (cancelled) return;

        const b = sampled[i];
        let address = `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}`;

        if (GOOGLE_MAPS_API_KEY) {
          try {
            const response = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${b.latitude},${b.longitude}&result_type=route|street_address&key=${GOOGLE_MAPS_API_KEY}`,
            );
            const data = await response.json();
            if (data.results && data.results[0]) {
              address = data.results[0].formatted_address;
            }
          } catch (err) {
            console.error('Geocoding error:', err);
          }
        }

        if (cancelled) return;

        results[i] = {
          ...results[i],
          address,
          isLoading: false,
        };
        setTimelineEntries([...results]);
      }

      if (!cancelled) {
        setGeocodingComplete(true);
      }
    };

    geocode();

    return () => {
      cancelled = true;
    };
  }, [breadcrumbs, breadcrumbsLoading]);

  // Derive stat values
  const durationLabel = useMemo(() => {
    if (!session) return '';
    if (session.duration_seconds != null) {
      return formatDuration(session.duration_seconds);
    }
    if (session.started_at && session.completed_at) {
      const diffSec = Math.round(
        (new Date(session.completed_at).getTime() -
          new Date(session.started_at).getTime()) /
          1000,
      );
      return formatDuration(diffSec);
    }
    return '--';
  }, [session]);

  const distanceLabel = useMemo(() => {
    if (!session) return '';
    if (session.total_distance_meters != null) {
      return formatDistance(session.total_distance_meters);
    }
    return '--';
  }, [session]);

  const dateLabel = useMemo(() => {
    if (!session) return '';
    return formatDate(session.started_at);
  }, [session]);

  // ---- Render helpers ----

  const renderTimelineItem = useCallback(
    ({ item, index }: { item: TimelineEntry; index: number }) => {
      const isLast = item.isLast;

      let dotColor = theme.colors.onSurfaceVariant;
      if (item.isFirst) dotColor = theme.colors.primary;
      else if (item.isLast) dotColor = theme.colors.error;

      return (
        <View style={styles.timelineItem}>
          {/* Time column */}
          <View style={styles.timelineLeft}>
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {item.time}
            </Text>
          </View>

          {/* Dot + line column */}
          <View style={styles.timelineDot}>
            <View style={[styles.dot, { backgroundColor: dotColor }]} />
            {!isLast && (
              <View
                style={[
                  styles.line,
                  { backgroundColor: theme.colors.outlineVariant },
                ]}
              />
            )}
          </View>

          {/* Address column */}
          <View style={styles.timelineRight}>
            {item.isLoading ? (
              <ActivityIndicator size={14} style={{ alignSelf: 'flex-start' }} />
            ) : (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurface }}
                numberOfLines={2}
              >
                {item.address}
              </Text>
            )}

            {item.isFirst && (
              <Text
                variant="labelSmall"
                style={{
                  color: theme.colors.primary,
                  marginTop: 2,
                  fontWeight: '600',
                }}
              >
                Start
              </Text>
            )}
            {item.isLast && (
              <Text
                variant="labelSmall"
                style={{
                  color: theme.colors.error,
                  marginTop: 2,
                  fontWeight: '600',
                }}
              >
                End
              </Text>
            )}
          </View>
        </View>
      );
    },
    [theme],
  );

  // ---- Loading state ----

  if (!session) {
    return (
      <>
        <Stack.Screen options={{ title: 'Session' }} />
        <View
          style={[
            styles.container,
            styles.centered,
            { backgroundColor: theme.colors.background },
          ]}
        >
          <ActivityIndicator size="large" />
          <Text
            variant="bodyMedium"
            style={{ marginTop: 16, color: theme.colors.onSurfaceVariant }}
          >
            Loading session...
          </Text>
        </View>
      </>
    );
  }

  // ---- Main render ----

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Session Detail',
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.onSurface,
        }}
      />

      <View
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        {/* Map section */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            scrollEnabled={false}
            zoomEnabled={false}
            rotateEnabled={false}
            pitchEnabled={false}
          >
            {pathCoordinates.length > 0 && (
              <Polyline
                coordinates={pathCoordinates}
                strokeColor={theme.colors.primary}
                strokeWidth={4}
              />
            )}
          </MapView>

          {/* Map overlay gradient (subtle bottom fade) */}
          <View
            style={[
              styles.mapOverlay,
              { backgroundColor: theme.colors.background },
            ]}
          />
        </View>

        {/* Stats row */}
        <Surface style={styles.statsRow} elevation={0}>
          <Chip
            icon={() => (
              <Icon
                name="clock-outline"
                size={16}
                color={theme.colors.primary}
              />
            )}
            compact
            style={[
              styles.statChip,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
            textStyle={{
              color: theme.colors.onPrimaryContainer,
              fontSize: 12,
            }}
          >
            {durationLabel}
          </Chip>

          <Chip
            icon={() => (
              <Icon
                name="map-marker-distance"
                size={16}
                color={theme.colors.tertiary || theme.colors.primary}
              />
            )}
            compact
            style={[
              styles.statChip,
              {
                backgroundColor:
                  theme.colors.tertiaryContainer ||
                  theme.colors.secondaryContainer,
              },
            ]}
            textStyle={{
              color:
                theme.colors.onTertiaryContainer ||
                theme.colors.onSecondaryContainer,
              fontSize: 12,
            }}
          >
            {distanceLabel}
          </Chip>

          <Chip
            icon={() => (
              <Icon
                name="calendar"
                size={16}
                color={theme.colors.onSurfaceVariant}
              />
            )}
            compact
            style={[
              styles.statChip,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
            textStyle={{
              color: theme.colors.onSurfaceVariant,
              fontSize: 12,
            }}
          >
            {dateLabel}
          </Chip>
        </Surface>

        {/* Timeline section */}
        <View style={styles.timelineSection}>
          <Text
            variant="titleSmall"
            style={[
              styles.timelineTitle,
              { color: theme.colors.onSurface },
            ]}
          >
            Timeline
          </Text>

          {breadcrumbsLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="small" />
              <Text
                variant="bodySmall"
                style={{
                  marginTop: 8,
                  color: theme.colors.onSurfaceVariant,
                }}
              >
                Loading breadcrumbs...
              </Text>
            </View>
          ) : timelineEntries.length === 0 ? (
            <View style={styles.emptyTimeline}>
              <Icon
                name="map-marker-off"
                size={40}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="bodyMedium"
                style={{
                  marginTop: 8,
                  color: theme.colors.onSurfaceVariant,
                  textAlign: 'center',
                }}
              >
                No breadcrumbs recorded for this session.
              </Text>
            </View>
          ) : (
            <FlatList
              data={timelineEntries}
              keyExtractor={(item) => item.id}
              renderItem={renderTimelineItem}
              contentContainerStyle={{
                paddingBottom: insets.bottom + 16,
                paddingHorizontal: 16,
              }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </>
  );
}

// ---- Styles ----

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    width: '100%',
    position: 'relative',
  },
  map: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 8,
    opacity: 0.6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  statChip: {
    borderRadius: 20,
  },
  timelineSection: {
    flex: 1,
  },
  timelineTitle: {
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 48,
  },
  timelineLeft: {
    width: 50,
    paddingTop: 2,
    alignItems: 'flex-end',
  },
  timelineDot: {
    width: 24,
    alignItems: 'center',
    paddingTop: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  line: {
    width: 2,
    flex: 1,
    marginTop: 4,
  },
  timelineRight: {
    flex: 1,
    paddingLeft: 8,
    paddingBottom: 16,
  },
  emptyTimeline: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
  },
});
