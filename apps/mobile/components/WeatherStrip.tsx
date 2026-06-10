import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useWeather } from '@realestate-crm/hooks';
import { weatherCodeInfo } from '@realestate-crm/api';
import type { DoorKnockRating, HourlyWeather } from '@realestate-crm/api';

/**
 * Door-knock weather strip for the Today hub.
 *
 * Fully self-contained (location permission → coords → forecast → render)
 * so the host screen just drops in `<WeatherStrip />`. Renders:
 *  - a fixed-height skeleton while loading (no layout jump),
 *  - a tap-to-enable affordance when location permission is undetermined,
 *  - nothing at all when permission is denied or the fetch fails —
 *    weather is an enhancement and must never block the hub.
 */

const RATING_META: Record<DoorKnockRating, { label: string; color: string; icon: string }> = {
  good: { label: 'Good to knock', color: '#16a34a', icon: 'door-open' },
  fair: { label: 'Fair', color: '#f59e0b', icon: 'door' },
  poor: { label: 'Hold off', color: '#dc2626', icon: 'door-closed' },
};

const STRIP_HEIGHT = 118;

type PermissionState = 'checking' | 'undetermined' | 'granted' | 'denied';

export default function WeatherStrip() {
  const theme = useTheme();
  const [permission, setPermission] = useState<PermissionState>('checking');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);

  const resolvePosition = useCallback(async () => {
    // Last-known is instant and plenty accurate for weather (~1 km cells);
    // fall back to a low-accuracy live fix only when the cache is empty.
    const last = await Location.getLastKnownPositionAsync();
    const pos = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }));
    setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
        if (cancelled) return;
        if (status === 'granted') {
          setPermission('granted');
          await resolvePosition();
        } else if (canAskAgain) {
          setPermission('undetermined');
        } else {
          setPermission('denied');
        }
      } catch {
        if (!cancelled) setPermission('denied');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resolvePosition]);

  const handleEnable = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        setPermission('granted');
        await resolvePosition();
      } else {
        setPermission('denied');
      }
    } catch {
      setPermission('denied');
    }
  }, [resolvePosition]);

  const { forecast, assessment, loading } = useWeather(coords?.lat, coords?.lng);

  // Fade the loaded strip in over the skeleton.
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (forecast) {
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    }
  }, [forecast, opacity]);

  const nextHours = useMemo<HourlyWeather[]>(() => {
    if (!forecast) return [];
    const now = new Date();
    const idx = forecast.hourly.findIndex(h => {
      const t = new Date(h.time);
      return t.getDate() === now.getDate() && t.getHours() === now.getHours();
    });
    if (idx === -1) return [];
    return forecast.hourly.slice(idx + 1, idx + 7);
  }, [forecast]);

  if (permission === 'denied') return null;

  if (permission === 'undetermined') {
    return (
      <View style={styles.section}>
        <TouchableOpacity onPress={handleEnable} activeOpacity={0.7}>
          <Surface style={[styles.card, styles.enableCard, { backgroundColor: theme.colors.surfaceVariant }]} elevation={1}>
            <Icon name="weather-partly-cloudy" size={22} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 10, flex: 1 }}>
              Enable location to see door-knock weather
            </Text>
            <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
          </Surface>
        </TouchableOpacity>
      </View>
    );
  }

  // Checking permission, resolving GPS, or fetching — hold space with a skeleton.
  if (permission === 'checking' || !coords || loading) {
    return (
      <View style={styles.section}>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface, height: STRIP_HEIGHT }]} elevation={1}>
          <SkeletonPulse color={theme.colors.surfaceVariant} />
        </Surface>
      </View>
    );
  }

  // Fetch failed — vanish quietly.
  if (!forecast || !assessment) return null;

  const { current } = forecast;
  const condition = weatherCodeInfo(current.weatherCode, current.isDay);
  const rating = RATING_META[assessment.rating];

  return (
    <View style={styles.section}>
      <Animated.View style={{ opacity }}>
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.topRow}>
            <Icon name={condition.icon} size={30} color={theme.colors.primary} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                  {Math.round(current.temperature)}°
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 6 }}>
                  {condition.label}
                </Text>
              </View>
              <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                {assessment.headline}
              </Text>
            </View>
            <View style={[styles.ratingPill, { backgroundColor: rating.color + '14' }]}>
              <Icon name={rating.icon} size={13} color={rating.color} />
              <Text variant="labelSmall" style={{ color: rating.color, fontWeight: '700', marginLeft: 4 }}>
                {rating.label}
              </Text>
            </View>
          </View>

          {nextHours.length > 0 && (
            <View style={styles.hoursRow}>
              {nextHours.map(h => {
                const hourDate = new Date(h.time);
                const hr = hourDate.getHours();
                const label = `${hr % 12 === 0 ? 12 : hr % 12}${hr < 12 ? 'am' : 'pm'}`;
                const info = weatherCodeInfo(h.weatherCode, hr >= 6 && hr < 19);
                const showRain = h.precipitationProbability >= 20;
                return (
                  <View key={h.time} style={styles.hourCell}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
                    <Icon name={info.icon} size={16} color={theme.colors.onSurfaceVariant} style={{ marginVertical: 2 }} />
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                      {Math.round(h.temperature)}°
                    </Text>
                    <Text variant="labelSmall" style={{ color: showRain ? '#3b82f6' : 'transparent', fontSize: 10 }}>
                      {showRain ? `${h.precipitationProbability}%` : '·'}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </Surface>
      </Animated.View>
    </View>
  );
}

/** Minimal shimmer placeholder — two pulsing bars matching the loaded layout. */
function SkeletonPulse({ color }: { color: string }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.7, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={{ flex: 1, justifyContent: 'space-between' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Animated.View style={[styles.skelCircle, { backgroundColor: color, opacity: pulse }]} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Animated.View style={[styles.skelBar, { width: '45%', backgroundColor: color, opacity: pulse }]} />
          <Animated.View style={[styles.skelBar, { width: '70%', backgroundColor: color, opacity: pulse, marginTop: 6 }]} />
        </View>
      </View>
      <Animated.View style={[styles.skelBar, { width: '100%', height: 34, backgroundColor: color, opacity: pulse }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  card: {
    borderRadius: 12,
    padding: 12,
  },
  enableCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  hoursRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.25)',
  },
  hourCell: {
    alignItems: 'center',
    flex: 1,
  },
  skelCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  skelBar: {
    height: 10,
    borderRadius: 5,
  },
});
