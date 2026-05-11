import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Alert,
  Linking,
  TouchableOpacity,
  Dimensions,
  ScrollView,
  Keyboard,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import {
  Text,
  Button,
  Surface,
  useTheme,
  IconButton,
  Chip,
  ActivityIndicator,
  Searchbar,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import MapView, { Marker, Polyline, LongPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  useGuidedProspectingStore,
  useLeadScoringEngine,
  useTrackingStore,
  useCRMStore,
} from '@realestate-crm/hooks';
import type { GuidedStop, ProspectingOutcome, PlacePrediction } from '@realestate-crm/types';
import LeadScoreBadge from '../../components/LeadScoreBadge';

const GOOGLE_PLACES_API_KEY =
  Constants.expoConfig?.extra?.GOOGLE_PLACES_API_KEY || '';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const EDIT_MAP_HEIGHT = SCREEN_HEIGHT * 0.45;

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

type Phase = 'loading' | 'editing' | 'walking';

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
  const activateGuidedSession = useGuidedProspectingStore(s => s.activateGuidedSession);
  const cancelGuidedSession = useGuidedProspectingStore(s => s.cancelGuidedSession);
  const addStop = useGuidedProspectingStore(s => s.addStop);
  const removeStop = useGuidedProspectingStore(s => s.removeStop);
  const reorderStops = useGuidedProspectingStore(s => s.reorderStops);
  const completeStop = useGuidedProspectingStore(s => s.completeStop);
  const skipStop = useGuidedProspectingStore(s => s.skipStop);
  const updateProximityAlerts = useGuidedProspectingStore(s => s.updateProximityAlerts);
  const endGuidedSession = useGuidedProspectingStore(s => s.endGuidedSession);

  const { scores } = useLeadScoringEngine();
  const contacts = useCRMStore(s => s.contacts);
  const activeSession = useTrackingStore(s => s.activeSession);
  const startSession = useTrackingStore(s => s.startSession);

  const [phase, setPhase] = useState<Phase>('loading');
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [sessionStartMs, setSessionStartMs] = useState(Date.now());
  const [elapsedStr, setElapsedStr] = useState('0m');
  const [proximityDismissed, setProximityDismissed] = useState(false);

  // Editing phase state
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adHocCounter = useRef(0);

  // Mappable contacts for marker selection in edit mode
  const mappedContacts = useMemo(() => {
    return contacts.filter(c => c.latitude != null && c.longitude != null);
  }, [contacts]);

  // Set of contact IDs already in stops (for marker coloring)
  const stopContactIds = useMemo(() => {
    return new Set(stops.map(s => s.contactId));
  }, [stops]);

  // Elapsed timer (only during walking)
  useEffect(() => {
    if (phase !== 'walking') return;
    const interval = setInterval(() => setElapsedStr(formatElapsed(sessionStartMs)), 30_000);
    return () => clearInterval(interval);
  }, [sessionStartMs, phase]);

  // Location subscription + auto-generate stops
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

      // Generate initial stops and enter editing phase. `startGuidedSession`
      // only prepares the route now — it doesn't flip `isActive`, so opening
      // this screen and immediately backing out won't leave a phantom session
      // showing as active on the Prospecting tab. The flip happens later in
      // `handleStartWalking` once the user commits.
      if (stops.length === 0) {
        startGuidedSession(coords.latitude, coords.longitude, scores);
      }
      setPhase('editing');

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
          if (phase === 'walking') {
            updateProximityAlerts(newCoords.latitude, newCoords.longitude);
          }
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

  // ── Editing phase handlers ──────────────────────────────────────────

  const handleMarkerPress = useCallback(
    (contact: { id: string; first_name: string; last_name?: string | null; address?: string | null; latitude: number; longitude: number }) => {
      if (stopContactIds.has(contact.id)) {
        removeStop(contact.id);
      } else {
        const breakdown = scores.get(contact.id);
        const newStop: GuidedStop = {
          contactId: contact.id,
          address: contact.address || '',
          latitude: contact.latitude,
          longitude: contact.longitude,
          scoreBreakdown: breakdown || {
            contactId: contact.id,
            total: 0,
            tier: 'dormant' as const,
            components: { staleness: 0, salesMomentum: 0, engagement: 0, streetConversion: 0, penetration: 0, buildingCoverage: 0, inspectionAttendance: 0 },
            lastComputedAt: new Date().toISOString(),
          },
          routePosition: stops.length,
          distanceFromPrev: 0,
          status: 'pending',
        };
        addStop(newStop);
      }
    },
    [stopContactIds, scores, stops.length, addStop, removeStop],
  );

  const handleMapLongPress = useCallback(async (event: LongPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const stopId = `adhoc-${++adHocCounter.current}`;

    // Reverse geocode
    let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    try {
      const apiKey = Constants.expoConfig?.extra?.GOOGLE_MAPS_API_KEY || '';
      if (apiKey) {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`,
        );
        const data = await res.json();
        if (data.results?.[0]) {
          address = data.results[0].formatted_address;
        }
      }
    } catch { /* keep coordinate string */ }

    const newStop: GuidedStop = {
      contactId: stopId,
      address,
      latitude,
      longitude,
      scoreBreakdown: {
        contactId: stopId,
        total: 0,
        tier: 'dormant' as const,
        components: { staleness: 0, salesMomentum: 0, engagement: 0, streetConversion: 0, penetration: 0, buildingCoverage: 0, inspectionAttendance: 0 },
        lastComputedAt: new Date().toISOString(),
      },
      routePosition: stops.length,
      distanceFromPrev: 0,
      status: 'pending',
    };
    addStop(newStop);
  }, [stops.length, addStop]);

  // Address search - Places Autocomplete (ported from route/new.tsx)
  const searchPlaces = useCallback(async (text: string) => {
    if (!text || text.length < 2 || !GOOGLE_PLACES_API_KEY) {
      setPredictions([]);
      return;
    }
    setIsSearching(true);
    try {
      const response = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          },
          body: JSON.stringify({ input: text, languageCode: 'en' }),
        },
      );
      const data = await response.json();
      if (data.suggestions) {
        const transformed: PlacePrediction[] = data.suggestions
          .filter((s: Record<string, unknown>) => s.placePrediction)
          .map((s: Record<string, unknown>) => {
            const pp = s.placePrediction as Record<string, unknown>;
            const text = pp.text as Record<string, string> | undefined;
            const sf = pp.structuredFormat as Record<string, Record<string, string>> | undefined;
            return {
              place_id: pp.placeId as string,
              description: text?.text || '',
              structured_formatting: {
                main_text: sf?.mainText?.text || '',
                secondary_text: sf?.secondaryText?.text || '',
              },
            };
          });
        setPredictions(transformed);
        setShowSearchResults(true);
      } else {
        setPredictions([]);
      }
    } catch {
      setPredictions([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchTextChange = (text: string) => {
    setSearchQuery(text);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => searchPlaces(text), 300);
  };

  const handleSelectPlace = useCallback(async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setSearchQuery('');
    setShowSearchResults(false);
    setPredictions([]);

    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${prediction.place_id}`,
        {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'displayName,formattedAddress,location',
          },
        },
      );
      const data = await response.json();
      if (data.location) {
        const stopId = `adhoc-${++adHocCounter.current}`;
        const address = data.formattedAddress || prediction.description;
        const newStop: GuidedStop = {
          contactId: stopId,
          address,
          latitude: data.location.latitude,
          longitude: data.location.longitude,
          scoreBreakdown: {
            contactId: stopId,
            total: 0,
            tier: 'dormant' as const,
            components: { staleness: 0, salesMomentum: 0, engagement: 0, streetConversion: 0, penetration: 0, buildingCoverage: 0, inspectionAttendance: 0 },
            lastComputedAt: new Date().toISOString(),
          },
          routePosition: stops.length,
          distanceFromPrev: 0,
          status: 'pending',
        };
        addStop(newStop);
      }
    } catch (error) {
      console.error('Place details error:', error);
    }
  }, [stops.length, addStop]);

  const handleMoveUp = useCallback((index: number) => {
    if (index <= 0) return;
    reorderStops(index, index - 1);
  }, [reorderStops]);

  const handleMoveDown = useCallback((index: number) => {
    if (index >= stops.length - 1) return;
    reorderStops(index, index + 1);
  }, [reorderStops, stops.length]);

  const handleStartWalking = useCallback(async () => {
    if (stops.length === 0) {
      Alert.alert('No Stops', 'Add at least one stop before starting.');
      return;
    }
    // Flip guided-session `isActive` only now. Before this point the
    // store has stops prepared but isActive stays false, so the
    // Prospecting tab doesn't show an "in progress" banner just because
    // the user opened the editing screen.
    activateGuidedSession();
    // Start tracking session if none active
    if (!activeSession) {
      await startSession();
    }
    setSessionStartMs(Date.now());
    setPhase('walking');
  }, [stops.length, activeSession, startSession, activateGuidedSession]);

  // ── Walking phase handlers ──────────────────────────────────────────

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

  // Center map on current stop (walking phase)
  useEffect(() => {
    if (phase !== 'walking') return;
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
  }, [currentStop, phase]);

  // Fit map to stops when entering editing phase
  useEffect(() => {
    if (phase !== 'editing' || stops.length === 0 || !mapRef.current) return;
    const allCoords = stops.map(s => ({ latitude: s.latitude, longitude: s.longitude }));
    if (userLocation) allCoords.push(userLocation);
    if (allCoords.length > 1) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(allCoords, {
          edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
          animated: true,
        });
      }, 300);
    }
  }, [phase, stops.length === 0]);

  // ── Loading phase ───────────────────────────────────────────────────

  if (phase === 'loading') {
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

  // ── Editing phase ───────────────────────────────────────────────────

  if (phase === 'editing') {
    return (
      <>
        {/* Explicit Cancel button — the parent `prospecting/_layout` sets
            `headerShown: false`, and the override here only turns the header
            back on without guaranteeing a back arrow. Some users reached
            this screen via the "Start Guided Session" CTA on Today/Prospecting
            and reported they couldn't get out. Forcing a `headerLeft` Cancel
            makes the exit obvious. */}
        <Stack.Screen
          options={{
            title: 'Edit Route',
            headerShown: true,
            headerLeft: () => (
              <Button
                onPress={() => {
                  // Clear any prepared-but-not-activated route so the
                  // Prospecting tab doesn't show a phantom in-progress
                  // session next time we land there.
                  cancelGuidedSession();
                  router.back();
                }}
                compact
              >
                Cancel
              </Button>
            ),
          }}
        />
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          {/* Full-height map with contact markers */}
          <View style={styles.editMapContainer}>
            <MapView
              ref={mapRef}
              style={styles.editMap}
              showsUserLocation
              showsMyLocationButton={false}
              onLongPress={handleMapLongPress}
              initialRegion={
                userLocation
                  ? {
                      ...userLocation,
                      latitudeDelta: 0.02,
                      longitudeDelta: 0.02,
                    }
                  : stops.length > 0
                    ? {
                        latitude: stops[0].latitude,
                        longitude: stops[0].longitude,
                        latitudeDelta: 0.02,
                        longitudeDelta: 0.02,
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
              {/* All mappable contacts as tappable markers */}
              {mappedContacts.map((contact) => {
                const isSelected = stopContactIds.has(contact.id);
                const stopIdx = stops.findIndex(s => s.contactId === contact.id);
                return (
                  <Marker
                    key={contact.id}
                    coordinate={{
                      latitude: contact.latitude!,
                      longitude: contact.longitude!,
                    }}
                    title={`${contact.first_name} ${contact.last_name || ''}`}
                    description={contact.address || undefined}
                    pinColor={isSelected ? '#4CAF50' : '#F44336'}
                    onPress={() =>
                      handleMarkerPress({
                        id: contact.id,
                        first_name: contact.first_name,
                        last_name: contact.last_name,
                        address: contact.address,
                        latitude: contact.latitude!,
                        longitude: contact.longitude!,
                      })
                    }
                    tracksViewChanges={false}
                  >
                    {isSelected && stopIdx >= 0 && (
                      <View style={styles.numberedMarker}>
                        <View style={[styles.markerCircle, { backgroundColor: '#4CAF50' }]}>
                          <Text style={styles.markerNumber}>{stopIdx + 1}</Text>
                        </View>
                        <View style={styles.markerTriangle} />
                      </View>
                    )}
                  </Marker>
                );
              })}
              {/* Ad-hoc stop markers */}
              {stops.filter(s => s.contactId.startsWith('adhoc-')).map((stop) => {
                const stopIdx = stops.indexOf(stop);
                return (
                  <Marker
                    key={stop.contactId}
                    coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                    title={stop.address.split(',')[0]}
                    description={stop.address}
                    tracksViewChanges={false}
                  >
                    <View style={styles.numberedMarker}>
                      <View style={[styles.markerCircle, { backgroundColor: '#2196F3' }]}>
                        <Text style={styles.markerNumber}>{stopIdx + 1}</Text>
                      </View>
                      <View style={[styles.markerTriangle, { borderTopColor: '#2196F3' }]} />
                    </View>
                  </Marker>
                );
              })}
            </MapView>

            {/* Stop count badge */}
            <Surface style={styles.countBadge} elevation={2}>
              <Icon name="map-marker-check" size={16} color={theme.colors.primary} />
              <Text variant="labelMedium" style={{ marginLeft: 4, color: theme.colors.onSurface }}>
                {stops.length} stop{stops.length !== 1 ? 's' : ''}
              </Text>
            </Surface>
          </View>

          {/* Bottom editing panel */}
          <Surface style={[styles.editPanel, { backgroundColor: theme.colors.background }]} elevation={3}>
            <ScrollView
              style={styles.editPanelScroll}
              contentContainerStyle={styles.editPanelContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Address search */}
              <View style={styles.editSection}>
                <Searchbar
                  placeholder="Search address to add stop..."
                  value={searchQuery}
                  onChangeText={handleSearchTextChange}
                  onFocus={() => predictions.length > 0 && setShowSearchResults(true)}
                  loading={isSearching}
                  icon="map-marker-plus"
                  style={styles.searchbar}
                />
                {showSearchResults && predictions.length > 0 && (
                  <Surface style={styles.searchResults} elevation={3}>
                    {predictions.map((item) => (
                      <TouchableOpacity
                        key={item.place_id}
                        onPress={() => handleSelectPlace(item)}
                        style={styles.searchResultItem}
                      >
                        <Icon name="map-marker" size={18} color={theme.colors.primary} style={{ marginRight: 10 }} />
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyMedium" numberOfLines={1}>
                            {item.structured_formatting.main_text}
                          </Text>
                          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                            {item.structured_formatting.secondary_text}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </Surface>
                )}
              </View>

              {/* Editable stop list */}
              <View style={styles.editSection}>
                <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                  Stops ({stops.length})
                </Text>

                {stops.length === 0 ? (
                  <View style={styles.emptyStops}>
                    <Icon name="map-marker-plus" size={32} color={theme.colors.onSurfaceVariant} />
                    <Text
                      variant="bodyMedium"
                      style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}
                    >
                      Tap contacts on the map, long-press to drop a pin, or search an address
                    </Text>
                  </View>
                ) : (
                  stops.map((stop, index) => {
                    const contact = getContactForStop(stop);
                    const label = contact
                      ? `${contact.first_name} ${contact.last_name ?? ''}`.trim()
                      : stop.address.split(',')[0];
                    const isAdHoc = stop.contactId.startsWith('adhoc-');
                    return (
                      <Surface key={stop.contactId} style={styles.editStopItem} elevation={1}>
                        <View style={styles.editStopRow}>
                          <View style={[styles.stopNumberBadge, { backgroundColor: isAdHoc ? '#2196F3' : '#4CAF50' }]}>
                            <Text style={styles.stopNumberText}>{index + 1}</Text>
                          </View>
                          <View style={styles.editStopInfo}>
                            <Text variant="bodyMedium" numberOfLines={1}>
                              {label}
                            </Text>
                            {contact && stop.address ? (
                              <Text
                                variant="bodySmall"
                                numberOfLines={1}
                                style={{ color: theme.colors.onSurfaceVariant }}
                              >
                                {stop.address}
                              </Text>
                            ) : null}
                            {isAdHoc && (
                              <Text variant="labelSmall" style={{ color: '#2196F3', marginTop: 1 }}>
                                Ad-hoc stop
                              </Text>
                            )}
                          </View>
                          {!isAdHoc && (
                            <LeadScoreBadge
                              score={stop.scoreBreakdown.total}
                              tier={stop.scoreBreakdown.tier}
                              size="small"
                            />
                          )}
                          <View style={styles.editStopActions}>
                            <IconButton
                              icon="chevron-up"
                              size={16}
                              onPress={() => handleMoveUp(index)}
                              disabled={index === 0}
                              style={styles.reorderButton}
                            />
                            <IconButton
                              icon="chevron-down"
                              size={16}
                              onPress={() => handleMoveDown(index)}
                              disabled={index === stops.length - 1}
                              style={styles.reorderButton}
                            />
                          </View>
                          <IconButton
                            icon="close-circle"
                            size={20}
                            iconColor={theme.colors.error}
                            onPress={() => removeStop(stop.contactId)}
                          />
                        </View>
                      </Surface>
                    );
                  })
                )}
              </View>

              <View style={{ height: insets.bottom + 80 }} />
            </ScrollView>

            {/* Start Walking button */}
            <View style={[styles.startWalkingBar, { paddingBottom: insets.bottom + 8 }]}>
              <Button
                mode="contained"
                icon="walk"
                onPress={handleStartWalking}
                disabled={stops.length === 0}
                style={styles.startWalkingButton}
                contentStyle={styles.startWalkingContent}
              >
                Start Walking ({stops.length} stop{stops.length !== 1 ? 's' : ''})
              </Button>
            </View>
          </Surface>
        </KeyboardAvoidingView>
      </>
    );
  }

  // ── Walking phase ───────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Guided Prospecting',
          headerShown: true,
          // Visible End button in the header — gives the user a second way
          // to exit (the bigger End Session button at the bottom of the
          // screen is still there). Same Alert.alert confirmation flow.
          headerLeft: () => (
            <Button onPress={handleEndSession} compact>
              End
            </Button>
          ),
        }}
      />
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
          style={styles.walkMap}
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

  // ── Editing phase styles ──────────────────────────────────────────
  editMapContainer: {
    height: EDIT_MAP_HEIGHT,
    position: 'relative',
  },
  editMap: {
    width: '100%',
    height: EDIT_MAP_HEIGHT,
  },
  countBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  editPanel: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: -16,
  },
  editPanelScroll: {
    flex: 1,
  },
  editPanelContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  editSection: {
    marginBottom: 12,
  },
  searchbar: {
    elevation: 1,
  },
  searchResults: {
    marginTop: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  emptyStops: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  editStopItem: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  editStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingVertical: 4,
  },
  stopNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stopNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  editStopInfo: {
    flex: 1,
    marginRight: 4,
  },
  editStopActions: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  reorderButton: {
    margin: 0,
    width: 28,
    height: 28,
  },
  startWalkingBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.12)',
  },
  startWalkingButton: {
    borderRadius: 12,
  },
  startWalkingContent: {
    paddingVertical: 6,
  },

  // Numbered marker styles (ported from route/new.tsx)
  numberedMarker: {
    alignItems: 'center',
  },
  markerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 4,
  },
  markerNumber: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  markerTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#4CAF50',
    marginTop: -1,
  },

  // ── Walking phase styles ──────────────────────────────────────────
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
  walkMap: {
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
