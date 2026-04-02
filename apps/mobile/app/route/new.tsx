import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Dimensions, ScrollView, Alert, Platform, KeyboardAvoidingView, TouchableOpacity, Keyboard } from 'react-native';
import {
  FAB,
  useTheme,
  Text,
  Button,
  TextInput,
  Surface,
  Chip,
  SegmentedButtons,
  IconButton,
  Divider,
  Searchbar,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, LongPressEvent } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useCRMStore, useRouteStore } from '@realestate-crm/hooks';
import { fetchOptimizedRoute, decodePolyline } from '@realestate-crm/api';
import type { Contact, RouteMode } from '@realestate-crm/types';
import type { PlacePrediction } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const GOOGLE_PLACES_API_KEY =
  Constants.expoConfig?.extra?.GOOGLE_PLACES_API_KEY || '';

/** A stop can be linked to a contact or be an ad-hoc location. */
interface StopItem {
  id: string; // unique render key
  contact?: Contact;
  label: string;
  address: string;
  latitude: number;
  longitude: number;
}

const { width, height } = Dimensions.get('window');
const MAP_HEIGHT = height * 0.55;

export default function NewRouteScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  // Store data
  const contacts = useCRMStore(state => state.contacts);
  const mapRegion = useCRMStore(state => state.mapRegion);
  const createRoute = useRouteStore(state => state.createRoute);

  // Route building state
  const [stops, setStops] = useState<StopItem[]>([]);
  const [mode, setMode] = useState<RouteMode>('driving');
  const [routeName, setRouteName] = useState('');
  const [polylineCoords, setPolylineCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [optimizedOrder, setOptimizedOrder] = useState<number[]>([]);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isOptimized, setIsOptimized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [estimatedDuration, setEstimatedDuration] = useState<number | null>(null);
  const [encodedPolyline, setEncodedPolyline] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Address search state
  const [searchQuery, setSearchQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adHocCounter = useRef(0);

  // Get user location on mount and fit map to contacts
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    })();

    // Fit map to show all contacts with coordinates
    const withCoords = contacts.filter(c => c.latitude != null && c.longitude != null);
    if (withCoords.length > 0 && mapRef.current) {
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(
          withCoords.map(c => ({ latitude: c.latitude!, longitude: c.longitude! })),
          { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: false },
        );
      }, 500);
    }
  }, []);

  // Filter contacts that have coordinates (mappable)
  const mappedContacts = useMemo(() => {
    return contacts.filter(
      (contact) => contact.latitude != null && contact.longitude != null,
    );
  }, [contacts]);

  // Build a lookup set for quick selected-check (contact IDs only)
  const selectedContactIds = useMemo(() => {
    const ids = new Set<string>();
    stops.forEach((s) => { if (s.contact) ids.add(s.contact.id); });
    return ids;
  }, [stops]);

  // Get the display label (number) for a contact marker on the map
  const getStopNumber = useCallback(
    (contactId: string): number | null => {
      const idx = stops.findIndex((s) => s.contact?.id === contactId);
      if (idx === -1) return null;
      return idx + 1;
    },
    [stops],
  );

  // Clear optimization state
  const clearOptimization = useCallback(() => {
    setIsOptimized(false);
    setPolylineCoords([]);
    setOptimizedOrder([]);
    setEstimatedDuration(null);
    setEncodedPolyline(null);
  }, []);

  // Toggle contact selection
  const handleMarkerPress = useCallback(
    (contact: Contact) => {
      if (isOptimized) clearOptimization();

      setStops((prev) => {
        const exists = prev.find((s) => s.contact?.id === contact.id);
        if (exists) {
          return prev.filter((s) => s.contact?.id !== contact.id);
        }
        return [...prev, {
          id: `contact-${contact.id}`,
          contact,
          label: `${contact.first_name} ${contact.last_name || ''}`.trim(),
          address: contact.address || '',
          latitude: contact.latitude!,
          longitude: contact.longitude!,
        }];
      });
    },
    [isOptimized, clearOptimization],
  );

  // Remove a specific stop from the list
  const handleRemoveStop = useCallback(
    (stopId: string) => {
      if (isOptimized) clearOptimization();
      setStops((prev) => prev.filter((s) => s.id !== stopId));
    },
    [isOptimized, clearOptimization],
  );

  // Long-press on map to add ad-hoc stop
  const handleMapLongPress = useCallback(async (event: LongPressEvent) => {
    if (isOptimized) clearOptimization();

    const { latitude, longitude } = event.nativeEvent.coordinate;
    const stopId = `adhoc-${++adHocCounter.current}`;

    // Reverse geocode to get address
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

    setStops((prev) => [...prev, {
      id: stopId,
      label: address.split(',')[0], // Short label from first part of address
      address,
      latitude,
      longitude,
    }]);
  }, [isOptimized, clearOptimization]);

  // Address search - Places Autocomplete
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
        const transformed = data.suggestions
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            place_id: s.placePrediction.placeId,
            description: s.placePrediction.text?.text || '',
            structured_formatting: {
              main_text: s.placePrediction.structuredFormat?.mainText?.text || '',
              secondary_text: s.placePrediction.structuredFormat?.secondaryText?.text || '',
            },
          }));
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
    if (isOptimized) clearOptimization();

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
        const label = data.displayName?.text || prediction.structured_formatting.main_text;
        const address = data.formattedAddress || prediction.description;
        setStops((prev) => [...prev, {
          id: stopId,
          label,
          address,
          latitude: data.location.latitude,
          longitude: data.location.longitude,
        }]);
      }
    } catch (error) {
      console.error('Place details error:', error);
    }
  }, [isOptimized, clearOptimization]);

  // Optimize route via Google Routes API
  const handleOptimize = useCallback(async () => {
    if (stops.length === 0) {
      Alert.alert('No Stops', 'Add at least one stop to optimize a route.');
      return;
    }

    setIsOptimizing(true);

    try {
      const waypoints = stops.map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
      }));

      // Use user location as origin/destination, but fall back to first stop
      // if user location is too far away or unavailable
      let origin = userLocation;
      if (!origin) {
        origin = waypoints[0];
      } else {
        const dlat = Math.abs(origin.latitude - waypoints[0].latitude);
        const dlng = Math.abs(origin.longitude - waypoints[0].longitude);
        if (dlat > 4.5 || dlng > 4.5) {
          origin = waypoints[0];
        }
      }

      const result = await fetchOptimizedRoute(
        origin,
        origin,
        waypoints,
        mode,
      );

      if (!result) {
        Alert.alert('Optimization Failed', 'Could not calculate the optimized route. Please try again.');
        setIsOptimizing(false);
        return;
      }

      const decoded = decodePolyline(result.polyline);
      setPolylineCoords(decoded);
      setEncodedPolyline(result.polyline);
      setOptimizedOrder(result.optimizedOrder);
      setEstimatedDuration(result.totalDurationMinutes);

      // Reorder stops by the optimized order
      if (result.optimizedOrder.length > 0) {
        const reordered = result.optimizedOrder.map((idx) => stops[idx]);
        setStops(reordered);
      }

      setIsOptimized(true);

      // Fit the map to show the full route
      if (mapRef.current && decoded.length > 0) {
        const allCoords = userLocation ? [userLocation, ...decoded] : decoded;
        mapRef.current.fitToCoordinates(allCoords, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      }
    } catch (error) {
      console.error('Route optimization error:', error);
      Alert.alert('Error', 'An unexpected error occurred while optimizing the route.');
    } finally {
      setIsOptimizing(false);
    }
  }, [stops, userLocation, mode]);

  // Save the route
  const handleSave = useCallback(async () => {
    const name = routeName.trim();
    if (!name) {
      Alert.alert('Name Required', 'Please enter a name for this route.');
      return;
    }

    setIsSaving(true);

    try {
      const routeStops = stops.map((stop, index) => ({
        contact_id: stop.contact?.id ?? undefined,
        address: stop.address,
        latitude: stop.latitude,
        longitude: stop.longitude,
        position: index,
        status: 'pending' as const,
      }));

      const result = await createRoute(
        {
          name,
          status: 'planned',
          mode,
          estimated_duration_minutes: estimatedDuration ?? undefined,
          polyline: encodedPolyline ?? undefined,
        },
        routeStops,
      );

      if (result) {
        router.back();
      } else {
        Alert.alert('Save Failed', 'Could not save the route. Please try again.');
      }
    } catch (error) {
      console.error('Route save error:', error);
      Alert.alert('Error', 'An unexpected error occurred while saving the route.');
    } finally {
      setIsSaving(false);
    }
  }, [routeName, stops, mode, estimatedDuration, encodedPolyline, createRoute, router]);

  // Format duration for display
  const formattedDuration = useMemo(() => {
    if (estimatedDuration == null) return null;
    if (estimatedDuration < 60) return `${estimatedDuration} min`;
    const hours = Math.floor(estimatedDuration / 60);
    const mins = estimatedDuration % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }, [estimatedDuration]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Map section - top portion */}
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={styles.map}
          provider={PROVIDER_GOOGLE}
          initialRegion={mapRegion}
          showsUserLocation
          showsMyLocationButton={false}
          onLongPress={handleMapLongPress}
        >
          {/* Contact markers */}
          {mappedContacts.map((contact) => {
            const isSelected = selectedContactIds.has(contact.id);
            const stopNum = getStopNumber(contact.id);

            return (
              <Marker
                key={contact.id}
                coordinate={{
                  latitude: contact.latitude!,
                  longitude: contact.longitude!,
                }}
                title={`${contact.first_name} ${contact.last_name || ''}`}
                description={contact.address}
                pinColor={isSelected ? '#4CAF50' : '#F44336'}
                onPress={() => handleMarkerPress(contact)}
                tracksViewChanges={false}
              >
                {isSelected && stopNum != null && (
                  <View style={styles.numberedMarker}>
                    <View style={[styles.markerCircle, { backgroundColor: '#4CAF50' }]}>
                      <Text style={styles.markerNumber}>{stopNum}</Text>
                    </View>
                    <View style={styles.markerTriangle} />
                  </View>
                )}
              </Marker>
            );
          })}

          {/* Ad-hoc stop markers (no linked contact) */}
          {stops.filter((s) => !s.contact).map((stop) => {
            const stopNum = stops.indexOf(stop) + 1;
            return (
              <Marker
                key={stop.id}
                coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
                title={stop.label}
                description={stop.address}
                tracksViewChanges={false}
              >
                <View style={styles.numberedMarker}>
                  <View style={[styles.markerCircle, { backgroundColor: '#2196F3' }]}>
                    <Text style={styles.markerNumber}>{stopNum}</Text>
                  </View>
                  <View style={[styles.markerTriangle, { borderTopColor: '#2196F3' }]} />
                </View>
              </Marker>
            );
          })}

          {/* User location shown via showsUserLocation prop on MapView */}

          {/* Optimized route polyline */}
          {isOptimized && polylineCoords.length > 0 && (
            <Polyline
              coordinates={polylineCoords}
              strokeColor={theme.colors.primary}
              strokeWidth={4}
            />
          )}
        </MapView>

        {/* Stop count overlay */}
        <Surface style={styles.countBadge} elevation={2}>
          <Icon name="map-marker-check" size={16} color={theme.colors.primary} />
          <Text variant="labelMedium" style={{ marginLeft: 4, color: theme.colors.onSurface }}>
            {stops.length} stop{stops.length !== 1 ? 's' : ''} selected
          </Text>
        </Surface>

        {/* Center on user location button */}
        {userLocation && (
          <FAB
            icon="crosshairs-gps"
            style={[styles.locationFab, { backgroundColor: theme.colors.surface }]}
            color={theme.colors.primary}
            onPress={() => {
              mapRef.current?.animateToRegion(
                {
                  ...userLocation,
                  latitudeDelta: 0.02,
                  longitudeDelta: 0.02,
                },
                500,
              );
            }}
            size="small"
          />
        )}
      </View>

      {/* Bottom panel - controls and stop list */}
      <Surface style={[styles.bottomPanel, { backgroundColor: theme.colors.background }]} elevation={3}>
        <ScrollView
          style={styles.panelScroll}
          contentContainerStyle={styles.panelContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Mode toggle */}
          <View style={styles.section}>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Travel Mode
            </Text>
            <SegmentedButtons
              value={mode}
              onValueChange={(value) => {
                setMode(value as RouteMode);
                if (isOptimized) clearOptimization();
              }}
              buttons={[
                {
                  value: 'driving',
                  label: 'Driving',
                  icon: 'car',
                },
                {
                  value: 'walking',
                  label: 'Walking',
                  icon: 'walk',
                },
              ]}
            />
          </View>

          <Divider style={styles.divider} />

          {/* Address search to add ad-hoc stops */}
          <View style={styles.section}>
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Add Stop by Address
            </Text>
            <Searchbar
              placeholder="Search address..."
              value={searchQuery}
              onChangeText={handleSearchTextChange}
              onFocus={() => predictions.length > 0 && setShowSearchResults(true)}
              loading={isSearching}
              icon="map-marker-plus"
              style={styles.addressSearchbar}
            />
            {showSearchResults && predictions.length > 0 && (
              <Surface style={styles.searchResultsContainer} elevation={3}>
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

          <Divider style={styles.divider} />

          {/* Selected stops list */}
          <View style={styles.section}>
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
                  Tap contacts on the map, long-press to drop a pin, or search an address above
                </Text>
              </View>
            ) : (
              stops.map((stop, index) => (
                <Surface key={stop.id} style={styles.stopItem} elevation={1}>
                  <View style={styles.stopRow}>
                    <View style={[styles.stopNumberBadge, { backgroundColor: stop.contact ? '#4CAF50' : '#2196F3' }]}>
                      <Text style={styles.stopNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopInfo}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {stop.label}
                      </Text>
                      {stop.address ? (
                        <Text
                          variant="bodySmall"
                          numberOfLines={1}
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          {stop.contact ? stop.address : (stop.address !== stop.label ? stop.address : '')}
                        </Text>
                      ) : null}
                      {!stop.contact && (
                        <Text variant="labelSmall" style={{ color: '#2196F3', marginTop: 2 }}>
                          Ad-hoc stop
                        </Text>
                      )}
                    </View>
                    <IconButton
                      icon="close-circle"
                      size={20}
                      iconColor={theme.colors.error}
                      onPress={() => handleRemoveStop(stop.id)}
                      accessibilityLabel={`Remove ${stop.label} from route`}
                    />
                  </View>
                </Surface>
              ))
            )}
          </View>

          {/* Estimated duration badge */}
          {isOptimized && formattedDuration && (
            <>
              <Divider style={styles.divider} />
              <View style={styles.section}>
                <Surface style={styles.durationBadge} elevation={1}>
                  <Icon name="clock-outline" size={20} color={theme.colors.primary} />
                  <View style={styles.durationInfo}>
                    <Text variant="labelLarge" style={{ color: theme.colors.onSurface }}>
                      Estimated Duration
                    </Text>
                    <Text variant="titleMedium" style={{ color: theme.colors.primary }}>
                      {formattedDuration}
                    </Text>
                  </View>
                  <Chip
                    compact
                    style={{ backgroundColor: theme.colors.primaryContainer }}
                    textStyle={{ color: theme.colors.onPrimaryContainer, fontSize: 11 }}
                  >
                    Round trip
                  </Chip>
                </Surface>
              </View>
            </>
          )}

          <Divider style={styles.divider} />

          {/* Optimize button */}
          <View style={styles.section}>
            <Button
              mode="outlined"
              icon={isOptimized ? 'check-circle' : 'routes'}
              onPress={handleOptimize}
              loading={isOptimizing}
              disabled={isOptimizing || stops.length === 0}
              style={styles.actionButton}
              contentStyle={styles.actionButtonContent}
            >
              {isOptimizing
                ? 'Optimizing...'
                : isOptimized
                  ? 'Re-Optimize Route'
                  : 'Optimize Route'}
            </Button>
          </View>

          {/* Route name input and save - shown after optimization */}
          {isOptimized && (
            <View style={styles.section}>
              <TextInput
                mode="outlined"
                label="Route Name"
                placeholder="e.g. Monday Morning Suburb Run"
                value={routeName}
                onChangeText={setRouteName}
                style={styles.nameInput}
                left={<TextInput.Icon icon="pencil" />}
              />
              <Button
                mode="contained"
                icon="content-save"
                onPress={handleSave}
                loading={isSaving}
                disabled={isSaving || !routeName.trim()}
                style={styles.actionButton}
                contentStyle={styles.actionButtonContent}
              >
                {isSaving ? 'Saving...' : 'Save Route'}
              </Button>
            </View>
          )}

          {/* Bottom spacing for safe area */}
          <View style={{ height: insets.bottom + 16 }} />
        </ScrollView>
      </Surface>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    height: MAP_HEIGHT,
    position: 'relative',
  },
  map: {
    width,
    height: MAP_HEIGHT,
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
  locationFab: {
    position: 'absolute',
    right: 12,
    bottom: 12,
  },
  bottomPanel: {
    flex: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: -16,
  },
  panelScroll: {
    flex: 1,
  },
  panelContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  section: {
    marginBottom: 12,
  },
  divider: {
    marginBottom: 12,
  },
  emptyStops: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  stopItem: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  stopRow: {
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
    marginRight: 12,
  },
  stopNumberText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  stopInfo: {
    flex: 1,
    marginRight: 4,
  },
  durationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    gap: 12,
  },
  durationInfo: {
    flex: 1,
  },
  actionButton: {
    marginTop: 8,
  },
  actionButtonContent: {
    paddingVertical: 6,
  },
  nameInput: {
    marginBottom: 8,
  },
  // Numbered marker styles
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
  // Address search styles
  addressSearchbar: {
    elevation: 1,
  },
  searchResultsContainer: {
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
});
