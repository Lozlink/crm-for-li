import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, FlatList, Alert, Linking, TouchableOpacity } from 'react-native';
import {
  Text,
  Button,
  Surface,
  useTheme,
  IconButton,
  Chip,
  ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import MapView, { Marker, Polyline } from 'react-native-maps';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  useGuidedProspectingStore,
  useLeadScoringEngine,
  useTrackingStore,
  useCRMStore,
} from '@realestate-crm/hooks';
import type { GuidedStop, ProspectingOutcome } from '@realestate-crm/types';
import LeadScoreBadge from '../../components/LeadScoreBadge';

const OUTCOME_OPTIONS: { value: ProspectingOutcome; label: string; icon: string }[] = [
  { value: 'no_answer', label: 'No Answer', icon: 'phone-missed' },
  { value: 'voicemail', label: 'Voicemail', icon: 'voicemail' },
  { value: 'interested', label: 'Interested', icon: 'thumb-up' },
  { value: 'not_interested', label: 'Not Int.', icon: 'thumb-down' },
  { value: 'callback_requested', label: 'Callback', icon: 'phone-return' },
];

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)}m`;
}

function formatElapsed(startMs: number): string {
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  const mins = Math.floor(elapsed / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  return `${mins}m`;
}

export default function GuidedProspectingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // Store state
  const isActive = useGuidedProspectingStore(s => s.isActive);
  const stops = useGuidedProspectingStore(s => s.stops);
  const currentStopIndex = useGuidedProspectingStore(s => s.currentStopIndex);
  const proximityAlertContactIds = useGuidedProspectingStore(s => s.proximityAlertContactIds);
  const buildingCoverage = useGuidedProspectingStore(s => s.buildingCoverage);
  const startGuidedSession = useGuidedProspectingStore(s => s.startGuidedSession);
  const completeStop = useGuidedProspectingStore(s => s.completeStop);
  const skipStop = useGuidedProspectingStore(s => s.skipStop);
  const updateProximityAlerts = useGuidedProspectingStore(s => s.updateProximityAlerts);
  const endGuidedSession = useGuidedProspectingStore(s => s.endGuidedSession);

  const { scores } = useLeadScoringEngine();
  const contacts = useCRMStore(s => s.contacts);
  const activeSession = useTrackingStore(s => s.activeSession);
  const startSession = useTrackingStore(s => s.startSession);

  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sessionStartMs] = useState(Date.now());
  const [elapsedStr, setElapsedStr] = useState('0m');
  const [proximityDismissed, setProximityDismissed] = useState(false);

  // Elapsed timer
  useEffect(() => {
    const interval = setInterval(() => setElapsedStr(formatElapsed(sessionStartMs)), 30_000);
    return () => clearInterval(interval);
  }, [sessionStartMs]);

  // Location subscription
  useEffect(() => {
    let subscription: Location.LocationSubscription | undefined;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(coords);

      // Start guided session if not active
      if (!isActive) {
        startGuidedSession(coords.latitude, coords.longitude, scores);
      }

      // Start tracking session if none active
      if (!activeSession) {
        await startSession();
      }

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          distanceInterval: 20,
        },
        (loc) => {
          const newCoords = {
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          };
          setUserLocation(newCoords);
          updateProximityAlerts(newCoords.latitude, newCoords.longitude);
        },
      );
    })();

    return () => {
      subscription?.remove();
    };
  }, []);

  // Derived
  const currentStop = stops[currentStopIndex] as GuidedStop | undefined;
  const visitedCount = useMemo(() => stops.filter(s => s.status === 'visited').length, [stops]);
  const totalDistance = useMemo(
    () => stops.reduce((acc, s) => acc + s.distanceFromPrev, 0),
    [stops],
  );
  const upcomingStops = useMemo(
    () => stops.filter((s, i) => i > currentStopIndex && s.status === 'pending'),
    [stops, currentStopIndex],
  );

  // Building coverage for current stop
  const currentBuildingCoverage = useMemo(() => {
    if (!currentStop) return null;
    const key = `${Math.round(currentStop.latitude * 10000)}:${Math.round(currentStop.longitude * 10000)}`;
    return buildingCoverage.get(key) ?? null;
  }, [currentStop, buildingCoverage]);

  // Polyline for route
  const routeCoordinates = useMemo(
    () => stops.map(s => ({ latitude: s.latitude, longitude: s.longitude })),
    [stops],
  );

  // Proximity alert contact info
  const proximityContacts = useMemo(
    () =>
      proximityAlertContactIds
        .map(id => contacts.find(c => c.id === id))
        .filter(Boolean),
    [proximityAlertContactIds, contacts],
  );

  const handleOutcome = useCallback(
    async (outcome: ProspectingOutcome) => {
      if (!currentStop) return;
      await completeStop(currentStop.contactId, outcome);
    },
    [currentStop, completeStop],
  );

  const handleSkip = useCallback(() => {
    if (!currentStop) return;
    skipStop(currentStop.contactId);
  }, [currentStop, skipStop]);

  const handleEndSession = useCallback(() => {
    Alert.alert(
      'End Session',
      `You visited ${visitedCount} of ${stops.length} stops. End now?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Session',
          style: 'destructive',
          onPress: async () => {
            await endGuidedSession();
            router.back();
          },
        },
      ],
    );
  }, [visitedCount, stops.length, endGuidedSession, router]);

  const handleCallContact = useCallback((phone?: string) => {
    if (!phone) return;
    Linking.openURL(`tel:${phone}`);
  }, []);

  const getContactForStop = useCallback(
    (stop: GuidedStop) => contacts.find(c => c.id === stop.contactId),
    [contacts],
  );

  // Center map on current stop
  useEffect(() => {
    if (currentStop && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: currentStop.latitude,
          longitude: currentStop.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        400,
      );
    }
  }, [currentStop]);

  if (!isActive && stops.length === 0) {
    return (
      <>
        <Stack.Screen options={{ title: 'Guided Prospecting' }} />
        <View style={[styles.centered, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" />
          <Text variant="bodyMedium" style={{ marginTop: 12 }}>
            Building your route...
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Guided Prospecting', headerShown: true }} />
      <View style={[styles.container, { paddingBottom: insets.bottom }]}>
        {/* Header */}
        <Surface style={styles.header} elevation={2}>
          <View style={styles.headerRow}>
            <View style={styles.headerStat}>
              <Icon name="map-marker-check" size={16} color={theme.colors.primary} />
              <Text variant="labelLarge">
                {visitedCount}/{stops.length}
              </Text>
            </View>
            <View style={styles.headerStat}>
              <Icon name="map-marker-distance" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatDistance(totalDistance)}
              </Text>
            </View>
            <View style={styles.headerStat}>
              <Icon name="timer-outline" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                {elapsedStr}
              </Text>
            </View>
          </View>
        </Surface>

        {/* Compact map */}
        <MapView
          ref={mapRef}
          style={styles.map}
          showsUserLocation
          showsMyLocationButton={false}
          initialRegion={
            currentStop
              ? {
                  latitude: currentStop.latitude,
                  longitude: currentStop.longitude,
                  latitudeDelta: 0.005,
                  longitudeDelta: 0.005,
                }
              : undefined
          }
        >
          {routeCoordinates.length > 1 && (
            <Polyline
              coordinates={routeCoordinates}
              strokeColor={theme.colors.primary}
              strokeWidth={3}
              lineDashPattern={[6, 4]}
            />
          )}
          {stops.map((stop, i) => (
            <Marker
              key={stop.contactId}
              coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
              title={getContactForStop(stop)?.first_name ?? stop.address}
              pinColor={
                i === currentStopIndex
                  ? '#2563eb'
                  : stop.status === 'visited'
                    ? '#16a34a'
                    : stop.status === 'skipped'
                      ? '#9ca3af'
                      : '#ef4444'
              }
            />
          ))}
        </MapView>

        {/* Building coverage chip */}
        {currentBuildingCoverage && currentBuildingCoverage.total > 1 && (
          <View style={styles.buildingChipContainer}>
            <Chip icon="office-building" compact style={styles.buildingChip}>
              {currentBuildingCoverage.visited}/{currentBuildingCoverage.total} units visited
            </Chip>
          </View>
        )}

        {/* Proximity alert banner */}
        {proximityContacts.length > 0 && !proximityDismissed && (
          <TouchableOpacity
            style={[styles.proximityBanner, { backgroundColor: '#fef3c7' }]}
            activeOpacity={0.7}
            onPress={() => {
              // Navigate to first proximity contact
              const first = proximityContacts[0];
              if (first) {
                router.push(`/contact/${first.id}`);
              }
            }}
          >
            <Icon name="fire" size={18} color="#f59e0b" />
            <Text variant="bodySmall" style={styles.proximityText} numberOfLines={1}>
              Hot contact nearby: {proximityContacts[0]?.first_name ?? 'Unknown'}
              {userLocation && proximityContacts[0]?.latitude != null
                ? ` - nearby`
                : ''}
            </Text>
            <IconButton
              icon="close"
              size={16}
              onPress={() => setProximityDismissed(true)}
              style={styles.proximityClose}
            />
          </TouchableOpacity>
        )}

        {/* Current stop card */}
        {currentStop && (
          <Surface style={styles.currentStopCard} elevation={2}>
            {(() => {
              const contact = getContactForStop(currentStop);
              const fullName = contact
                ? `${contact.first_name} ${contact.last_name ?? ''}`.trim()
                : 'Unknown Contact';
              return (
                <>
                  <View style={styles.currentStopHeader}>
                    <View style={{ flex: 1 }}>
                      <Text variant="titleMedium" numberOfLines={1}>
                        {fullName}
                      </Text>
                      <Text
                        variant="bodySmall"
                        numberOfLines={1}
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {currentStop.address}
                      </Text>
                    </View>
                    <LeadScoreBadge
                      score={currentStop.scoreBreakdown.total}
                      tier={currentStop.scoreBreakdown.tier}
                      size="medium"
                    />
                  </View>

                  <View style={styles.currentStopActions}>
                    {contact?.phone && (
                      <IconButton
                        icon="phone"
                        mode="contained"
                        size={20}
                        onPress={() => handleCallContact(contact.phone)}
                      />
                    )}
                    <IconButton
                      icon="skip-next"
                      mode="contained-tonal"
                      size={20}
                      onPress={handleSkip}
                    />
                  </View>

                  {/* Outcome selector */}
                  <View style={styles.outcomeRow}>
                    {OUTCOME_OPTIONS.map(opt => (
                      <TouchableOpacity
                        key={opt.value}
                        style={[styles.outcomeButton, { borderColor: theme.colors.outline }]}
                        activeOpacity={0.7}
                        onPress={() => handleOutcome(opt.value)}
                      >
                        <Icon
                          name={opt.icon}
                          size={18}
                          color={theme.colors.onSurface}
                        />
                        <Text
                          variant="labelSmall"
                          style={styles.outcomeLabel}
                          numberOfLines={1}
                        >
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              );
            })()}
          </Surface>
        )}

        {/* Upcoming stops list */}
        {upcomingStops.length > 0 && (
          <FlatList
            data={upcomingStops}
            keyExtractor={item => item.contactId}
            style={styles.upcomingList}
            renderItem={({ item }) => {
              const contact = getContactForStop(item);
              const name = contact
                ? `${contact.first_name} ${contact.last_name ?? ''}`.trim()
                : 'Unknown';
              return (
                <View style={styles.upcomingRow}>
                  <Text variant="labelMedium" style={styles.upcomingPosition}>
                    {item.routePosition + 1}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" numberOfLines={1}>
                      {name}
                    </Text>
                    <Text
                      variant="bodySmall"
                      numberOfLines={1}
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {item.address}
                    </Text>
                  </View>
                  <LeadScoreBadge
                    score={item.scoreBreakdown.total}
                    tier={item.scoreBreakdown.tier}
                    size="small"
                  />
                  <Text
                    variant="labelSmall"
                    style={[styles.upcomingDistance, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {formatDistance(item.distanceFromPrev)}
                  </Text>
                </View>
              );
            }}
          />
        )}

        {/* End session button */}
        <Button
          mode="contained"
          buttonColor={theme.colors.error}
          textColor="#fff"
          onPress={handleEndSession}
          style={styles.endButton}
          icon="stop-circle"
        >
          End Session
        </Button>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  headerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  map: {
    height: 180,
  },
  buildingChipContainer: {
    position: 'absolute',
    top: 220,
    right: 12,
    zIndex: 10,
  },
  buildingChip: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  proximityBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  proximityText: {
    flex: 1,
    color: '#92400e',
    fontWeight: '600',
  },
  proximityClose: {
    margin: 0,
  },
  currentStopCard: {
    margin: 12,
    padding: 14,
    borderRadius: 12,
  },
  currentStopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  currentStopActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  outcomeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  outcomeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
  outcomeLabel: {
    fontSize: 10,
    textAlign: 'center',
  },
  upcomingList: {
    flex: 1,
    paddingHorizontal: 12,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  upcomingPosition: {
    width: 22,
    textAlign: 'center',
    fontWeight: '700',
  },
  upcomingDistance: {
    width: 50,
    textAlign: 'right',
  },
  endButton: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
});
