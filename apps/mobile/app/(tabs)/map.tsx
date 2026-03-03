import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Dimensions, Linking } from 'react-native';
import { FAB, Portal, useTheme, Chip, Surface, Text, Dialog, Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import MapView, { Marker, Polygon, Circle, Polyline, PROVIDER_GOOGLE, LongPressEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useCRMStore, useStreetStats, usePropertyStore, useTrackingStore, useBuyerMatchStore } from '@realestate-crm/hooks';
import type { Contact, Property, ActivityWithContact, ContactRequirement } from '@realestate-crm/types';
import { fetchSuburbByName, decodePolyline } from '@realestate-crm/api';
import type { SuburbBoundary } from '@realestate-crm/types';
import { FilterSheet, ContactPreview, MapSearchBar, PropertyPreview } from '@realestate-crm/ui';

const { width, height } = Dimensions.get('window');

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

interface VisibleLayers {
  contacts: boolean;
  properties: boolean;
  routes: boolean;
  annotations: boolean;
  stats: boolean;
}

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);

  const contacts = useCRMStore(state => state.contacts);
  const mapRegion = useCRMStore(state => state.mapRegion);
  const setMapRegion = useCRMStore(state => state.setMapRegion);
  const selectedTagIds = useCRMStore(state => state.selectedTagIds);
  const tags = useCRMStore(state => state.tags);
  const recentActivities = useCRMStore(state => state.recentActivities);
  const fetchRecentActivities = useCRMStore(state => state.fetchRecentActivities);

  const properties = usePropertyStore(state => state.properties);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);

  const sessions = useTrackingStore(state => state.sessions);
  const fetchSessions = useTrackingStore(state => state.fetchSessions);
  const allAnnotations = useTrackingStore(state => state.allAnnotations);
  const fetchAllAnnotations = useTrackingStore(state => state.fetchAllAnnotations);
  const activeSession = useTrackingStore(state => state.activeSession);
  const startSession = useTrackingStore(state => state.startSession);

  const fetchRequirements = useBuyerMatchStore(s => s.fetchRequirements);

  const streetStats = useStreetStats();

  const [visibleLayers, setVisibleLayers] = useState<VisibleLayers>({
    contacts: true,
    properties: false,
    routes: false,
    annotations: false,
    stats: false,
  });

  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertyPreviewVisible, setPropertyPreviewVisible] = useState(false);
  const [pendingMarker, setPendingMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentSuburbBoundary, setCurrentSuburbBoundary] = useState<SuburbBoundary | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [isStartingTracking, setIsStartingTracking] = useState(false);
  const [longPressDialog, setLongPressDialog] = useState<{
    visible: boolean;
    latitude: number;
    longitude: number;
    address: string;
  }>({ visible: false, latitude: 0, longitude: 0, address: '' });

  // Fetch data on mount
  useEffect(() => {
    fetchProperties();
    fetchSessions();
    fetchAllAnnotations();
    fetchRecentActivities(200);
  }, [fetchProperties, fetchSessions, fetchAllAnnotations, fetchRecentActivities]);

  // Get user location on mount
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
  }, []);

  // Get suburb name from coordinates using reverse geocoding
  const getSuburbFromCoords = useCallback(async (lat: number, lng: number): Promise<string | null> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality|sublocality&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        const components = data.results[0].address_components;
        const suburb = components.find((c: Record<string, unknown>) =>
          (c.types as string[]).includes('locality') || (c.types as string[]).includes('sublocality')
        );
        return (suburb?.long_name as string) || null;
      }
    } catch (error) {
      console.error('Reverse geocode for suburb error:', error);
    }
    return null;
  }, []);

  // Fetch boundary for a specific suburb
  const fetchSuburbBoundary = useCallback(async (suburbName: string) => {
    const boundary = await fetchSuburbByName(suburbName, 'New South Wales');
    setCurrentSuburbBoundary(boundary);
  }, []);

  // Filter contacts with coordinates
  const mappedContacts = useMemo(() => {
    return contacts.filter(contact => {
      if (!contact.latitude || !contact.longitude) return false;
      if (selectedTagIds.length > 0) {
        const contactTagIds = (contact.tags || []).map(t => t.id);
        const hasMatchingTag = contactTagIds.some(id => selectedTagIds.includes(id));
        if (!hasMatchingTag && !selectedTagIds.includes(contact.tag_id || '')) {
          return false;
        }
      }
      return true;
    });
  }, [contacts, selectedTagIds]);

  const selectedTags = useMemo(() => {
    return tags.filter(t => selectedTagIds.includes(t.id));
  }, [tags, selectedTagIds]);

  // Properties with coordinates
  const mappedProperties = useMemo(() => {
    return properties.filter(p => p.latitude != null && p.longitude != null);
  }, [properties]);

  // Decoded route polylines
  const routePolylines = useMemo(() => {
    return sessions
      .filter(s => s.polyline)
      .map(s => ({
        id: s.id,
        coordinates: decodePolyline(s.polyline!),
        startedAt: s.started_at,
      }));
  }, [sessions]);

  const [contactRequirements, setContactRequirements] = useState<ContactRequirement[]>([]);

  const selectedContactLastActivity = useMemo((): ActivityWithContact | null => {
    if (!selectedContact) return null;
    const activity = recentActivities.find(a => a.contact_id === selectedContact.id);
    return activity || null;
  }, [selectedContact, recentActivities]);

  const handleMarkerPress = useCallback(async (contact: Contact) => {
    setSelectedContact(contact);
    setPreviewVisible(true);

    // Fetch buyer requirements for this contact
    await fetchRequirements(contact.id);
    setContactRequirements(useBuyerMatchStore.getState().requirements);
  }, [fetchRequirements]);

  const handlePropertyMarkerPress = useCallback((property: Property) => {
    setSelectedProperty(property);
    setPropertyPreviewVisible(true);
  }, []);

  const handleRegionChange = useCallback((region: Region) => {
    setMapRegion(region);
  }, [setMapRegion]);

  const handleAddContact = useCallback(() => {
    setFabOpen(false);
    router.push('/contact/new');
  }, [router]);

  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        return data.results[0].formatted_address as string;
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
    return '';
  }, []);

  const handleAddQuickNote = useCallback(async () => {
    setFabOpen(false);
    const center = mapRegion;
    const address = await reverseGeocode(center.latitude, center.longitude);

    router.push({
      pathname: '/contact/new',
      params: {
        lat: center.latitude.toString(),
        lng: center.longitude.toString(),
        address: address,
        quickNote: 'true',
      },
    });
  }, [mapRegion, reverseGeocode, router]);

  const handleMapLongPress = useCallback(async (event: LongPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setPendingMarker({ latitude, longitude });

    const address = await reverseGeocode(latitude, longitude);
    setLongPressDialog({ visible: true, latitude, longitude, address });
  }, [reverseGeocode]);

  const handleLongPressAction = useCallback((quickNote: boolean) => {
    const { latitude, longitude, address } = longPressDialog;
    setLongPressDialog(prev => ({ ...prev, visible: false }));

    router.push({
      pathname: '/contact/new',
      params: {
        lat: latitude.toString(),
        lng: longitude.toString(),
        address: address,
        quickNote: quickNote ? 'true' : undefined,
      },
    });

    setTimeout(() => setPendingMarker(null), 500);
  }, [longPressDialog, router]);

  const dismissLongPressDialog = useCallback(() => {
    setLongPressDialog(prev => ({ ...prev, visible: false }));
    setPendingMarker(null);
  }, []);

  const handleViewContact = useCallback(() => {
    if (selectedContact) {
      setPreviewVisible(false);
      router.push(`/contact/${selectedContact.id}`);
    }
  }, [selectedContact, router]);

  const handleViewProperty = useCallback(() => {
    if (selectedProperty) {
      setPropertyPreviewVisible(false);
      router.push(`/property/${selectedProperty.id}`);
    }
  }, [selectedProperty, router]);

  const handleAddNoteForContact = useCallback(() => {
    if (selectedContact) {
      setPreviewVisible(false);
      router.push(`/contact/${selectedContact.id}`);
    }
  }, [selectedContact, router]);

  const handleNavigateToContact = useCallback(() => {
    if (selectedContact?.latitude != null && selectedContact?.longitude != null) {
      Linking.openURL(`maps:?daddr=${selectedContact.latitude},${selectedContact.longitude}`);
    }
  }, [selectedContact]);

  const getMarkerColor = useCallback((contact: Contact) => {
    return contact.tags?.[0]?.color || contact.tag?.color || theme.colors.primary;
  }, [theme.colors.primary]);

  const getStatsColor = useCallback((daysSinceLastContact: number | null): string => {
    if (daysSinceLastContact === null || daysSinceLastContact > 30) return 'rgba(239, 68, 68, 0.4)';
    if (daysSinceLastContact > 7) return 'rgba(234, 179, 8, 0.4)';
    return 'rgba(34, 197, 94, 0.4)';
  }, []);

  const handleSearchLocationSelect = useCallback((lat: number, lng: number, name: string) => {
    const newRegion = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    };
    setMapRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 500);
    fetchSuburbBoundary(name);
  }, [setMapRegion, fetchSuburbBoundary]);

  const handleCenterOnUser = useCallback(async () => {
    let location = userLocation;

    if (!location) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;

      const pos = await Location.getCurrentPositionAsync({});
      location = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
      setUserLocation(location);
    }

    const newRegion = {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: 0.008,
      longitudeDelta: 0.008,
    };
    mapRef.current?.animateToRegion(newRegion, 500);

    const suburbName = await getSuburbFromCoords(location.latitude, location.longitude);
    if (suburbName) {
      fetchSuburbBoundary(suburbName);
    }
  }, [userLocation, getSuburbFromCoords, fetchSuburbBoundary]);

  const handleStartTracking = useCallback(async () => {
    setIsStartingTracking(true);
    setFabOpen(false);
    await startSession();
    setIsStartingTracking(false);
  }, [startSession]);

  const toggleLayer = useCallback((layer: keyof VisibleLayers) => {
    setVisibleLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  // Route line colors
  const ROUTE_COLORS = ['#6366f1', '#0d9488', '#f59e0b', '#ef4444', '#2563eb'];

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={mapRegion}
        onRegionChangeComplete={handleRegionChange}
        onLongPress={handleMapLongPress}
        showsUserLocation
        showsMyLocationButton
      >
        {/* Contact markers */}
        {visibleLayers.contacts && mappedContacts.map((contact) => (
          <Marker
            key={`c-${contact.id}`}
            coordinate={{
              latitude: contact.latitude!,
              longitude: contact.longitude!,
            }}
            title={`${contact.first_name} ${contact.last_name || ''}`}
            description={contact.address}
            pinColor={getMarkerColor(contact)}
            onPress={() => handleMarkerPress(contact)}
          />
        ))}

        {/* Property markers (purple) */}
        {visibleLayers.properties && mappedProperties.map((property) => (
          <Marker
            key={`p-${property.id}`}
            coordinate={{
              latitude: property.latitude!,
              longitude: property.longitude!,
            }}
            title={property.address}
            description={`${property.status} - ${property.for_type}`}
            pinColor="#7c3aed"
            onPress={() => handlePropertyMarkerPress(property)}
          />
        ))}

        {/* Route polyline overlays */}
        {visibleLayers.routes && routePolylines.map((route, idx) => (
          <Polyline
            key={`r-${route.id}`}
            coordinates={route.coordinates}
            strokeColor={ROUTE_COLORS[idx % ROUTE_COLORS.length]}
            strokeWidth={3}
            lineDashPattern={[0]}
          />
        ))}

        {/* Annotation markers (amber) */}
        {visibleLayers.annotations && allAnnotations.map((annotation) => (
          <Marker
            key={`a-${annotation.id}`}
            coordinate={{
              latitude: annotation.latitude,
              longitude: annotation.longitude,
            }}
            title={annotation.note}
            description={annotation.created_at ? new Date(annotation.created_at).toLocaleDateString() : ''}
            pinColor="#f59e0b"
          />
        ))}

        {/* Pending long-press marker */}
        {pendingMarker && (
          <Marker
            coordinate={pendingMarker}
            pinColor="#FF9800"
            opacity={0.7}
          />
        )}

        {/* Current suburb boundary polygon */}
        {currentSuburbBoundary && (
          <Polygon
            key={currentSuburbBoundary.name}
            coordinates={currentSuburbBoundary.coordinates}
            strokeColor="#000000"
            strokeWidth={3}
            fillColor="rgba(0, 0, 0, 0.03)"
          />
        )}

        {/* Street stats heat circles */}
        {visibleLayers.stats && streetStats.map((stat) => (
          <Circle
            key={`${stat.streetName}-${stat.suburb}`}
            center={{
              latitude: stat.averageLatitude,
              longitude: stat.averageLongitude,
            }}
            radius={Math.max(30, stat.contactCount * 15)}
            fillColor={getStatsColor(stat.daysSinceLastContact)}
            strokeColor={getStatsColor(stat.daysSinceLastContact).replace('0.4', '0.8')}
            strokeWidth={1}
          />
        ))}
      </MapView>

      <MapSearchBar onLocationSelect={handleSearchLocationSelect} />

      {selectedTags.length > 0 && (
        <Surface style={styles.filterChips} elevation={2}>
          <Text variant="labelSmall" style={styles.filterLabel}>Filtered:</Text>
          <View style={styles.chipContainer}>
            {selectedTags.map(tag => (
              <Chip
                key={tag.id}
                mode="flat"
                compact
                style={[styles.chip, { backgroundColor: tag.color }]}
                textStyle={{ color: '#fff', fontSize: 12 }}
              >
                {tag.name}
              </Chip>
            ))}
          </View>
        </Surface>
      )}

      {/* Layer toggle buttons (left side) */}
      <View style={[styles.layerToggles, { top: 130 }]}>
        <FAB
          icon={visibleLayers.contacts ? 'account' : 'account-outline'}
          style={[styles.layerFab, {
            backgroundColor: visibleLayers.contacts ? theme.colors.primaryContainer : theme.colors.surface,
          }]}
          color={visibleLayers.contacts ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant}
          onPress={() => toggleLayer('contacts')}
          size="small"
        />
        <FAB
          icon={visibleLayers.properties ? 'home-city' : 'home-city-outline'}
          style={[styles.layerFab, {
            backgroundColor: visibleLayers.properties ? '#7c3aed' : theme.colors.surface,
          }]}
          color={visibleLayers.properties ? '#fff' : theme.colors.onSurfaceVariant}
          onPress={() => toggleLayer('properties')}
          size="small"
        />
        <FAB
          icon={visibleLayers.routes ? 'map-marker-path' : 'map-marker-path'}
          style={[styles.layerFab, {
            backgroundColor: visibleLayers.routes ? theme.colors.tertiaryContainer : theme.colors.surface,
          }]}
          color={visibleLayers.routes ? theme.colors.onTertiaryContainer : theme.colors.onSurfaceVariant}
          onPress={() => toggleLayer('routes')}
          size="small"
        />
        <FAB
          icon={visibleLayers.annotations ? 'map-marker-alert' : 'map-marker-alert-outline'}
          style={[styles.layerFab, {
            backgroundColor: visibleLayers.annotations ? '#f59e0b' : theme.colors.surface,
          }]}
          color={visibleLayers.annotations ? '#fff' : theme.colors.onSurfaceVariant}
          onPress={() => toggleLayer('annotations')}
          size="small"
        />
        <FAB
          icon={visibleLayers.stats ? 'chart-bar' : 'chart-bar'}
          style={[styles.layerFab, {
            backgroundColor: visibleLayers.stats ? theme.colors.primaryContainer : theme.colors.surface,
          }]}
          color={visibleLayers.stats ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant}
          onPress={() => toggleLayer('stats')}
          size="small"
        />
      </View>

      {/* Right side action FABs */}
      <FAB
        icon="crosshairs-gps"
        style={[styles.rightFab, { backgroundColor: theme.colors.surface, bottom: insets.bottom + 190 }]}
        color={theme.colors.primary}
        onPress={handleCenterOnUser}
        size="small"
      />

      <FAB
        icon="filter"
        style={[styles.rightFab, { backgroundColor: theme.colors.secondaryContainer, bottom: insets.bottom + 130 }]}
        color={theme.colors.onSecondaryContainer}
        onPress={() => setFilterVisible(true)}
      />

      {/* Start Tracking FAB (only if not already tracking) */}
      {!activeSession && (
        <FAB
          icon="walk"
          label="Track"
          style={[styles.trackingFab, { backgroundColor: theme.colors.tertiaryContainer, bottom: insets.bottom + 130 }]}
          color={theme.colors.onTertiaryContainer}
          onPress={handleStartTracking}
          loading={isStartingTracking}
          disabled={isStartingTracking}
          size="small"
        />
      )}

      <FAB.Group
        open={fabOpen}
        visible
        icon={fabOpen ? 'close' : 'plus'}
        fabStyle={{ backgroundColor: theme.colors.primary }}
        color={theme.colors.onPrimary}
        actions={[
          {
            icon: 'account-plus',
            label: 'New Contact',
            onPress: handleAddContact,
          },
          {
            icon: 'note-plus',
            label: 'Quick Note',
            onPress: handleAddQuickNote,
          },
          ...(!activeSession ? [{
            icon: 'map-marker-path' as const,
            label: 'Start Tracking',
            onPress: handleStartTracking,
          }] : []),
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        style={[styles.fabGroup, { bottom: insets.bottom }]}
      />

      <Portal>
        <FilterSheet
          visible={filterVisible}
          onDismiss={() => setFilterVisible(false)}
        />

        <ContactPreview
          contact={selectedContact}
          visible={previewVisible}
          onDismiss={() => setPreviewVisible(false)}
          onViewDetails={handleViewContact}
          requirements={contactRequirements}
          lastActivity={selectedContactLastActivity}
          onAddNote={handleAddNoteForContact}
          onNavigate={handleNavigateToContact}
        />

        <PropertyPreview
          property={selectedProperty}
          visible={propertyPreviewVisible}
          onDismiss={() => setPropertyPreviewVisible(false)}
          onViewDetails={handleViewProperty}
        />

        <Dialog visible={longPressDialog.visible} onDismiss={dismissLongPressDialog}>
          <Dialog.Title>Add to Map</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
              {longPressDialog.address || 'Loading address...'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <Button onPress={dismissLongPressDialog}>Cancel</Button>
            <Button icon="note-plus" onPress={() => handleLongPressAction(true)}>
              Quick Note
            </Button>
            <Button icon="account-plus" mode="contained" onPress={() => handleLongPressAction(false)}>
              Contact
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width,
    height,
  },
  layerToggles: {
    position: 'absolute',
    left: 12,
    gap: 8,
  },
  layerFab: {
    elevation: 2,
  },
  rightFab: {
    position: 'absolute',
    right: 16,
  },
  trackingFab: {
    position: 'absolute',
    left: 16,
  },
  fabGroup: {
    position: 'absolute',
    right: 0,
  },
  dialogActions: {
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 8,
  },
  filterChips: {
    position: 'absolute',
    top: 120,
    left: 16,
    right: 16,
    padding: 8,
    borderRadius: 8,
  },
  filterLabel: {
    marginBottom: 4,
    opacity: 0.7,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  chip: {
    marginRight: 4,
  },
});
