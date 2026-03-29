import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Dimensions, Linking, TouchableOpacity, ScrollView, LayoutAnimation } from 'react-native';
import { FAB, Portal, useTheme, Chip, Surface, Text, Dialog, Button, Switch } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import MapView, { Marker, Polygon, Circle, Polyline, PROVIDER_GOOGLE, LongPressEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore, useStreetStats, usePropertyStore, useTrackingStore, useBuyerMatchStore, useProspectingMetrics } from '@realestate-crm/hooks';
import type { MultiDwellingBuilding } from '@realestate-crm/hooks';
import type { Contact, Property, ActivityWithContact, ContactRequirement, OSMBuilding } from '@realestate-crm/types';
import { fetchSuburbByName, decodePolyline, fetchMultiDwellingBuildings } from '@realestate-crm/api';
import type { SuburbBoundary } from '@realestate-crm/types';
import { FilterSheet, ContactPreview, MapSearchBar, PropertyPreview } from '@realestate-crm/ui';

const { width, height } = Dimensions.get('window');

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

interface VisibleLayers {
  contacts: boolean;
  properties: boolean;
  fieldActivity: boolean;
  buildings: boolean;
  stats: boolean;
}

const LAYER_DEFS: { key: keyof VisibleLayers; label: string; icon: string; activeColor: string }[] = [
  { key: 'contacts', label: 'Contacts', icon: 'account-group', activeColor: '#6366f1' },
  { key: 'properties', label: 'Properties', icon: 'home-city', activeColor: '#7c3aed' },
  { key: 'fieldActivity', label: 'Field Activity', icon: 'map-marker-path', activeColor: '#0d9488' },
  { key: 'buildings', label: 'Buildings', icon: 'office-building', activeColor: '#7c3aed' },
  { key: 'stats', label: 'Street Stats', icon: 'chart-bar', activeColor: '#ef4444' },
];

// ── Helpers ──────────────────────────────────────────────────────────

type FieldActivityWindow = '7d' | '30d' | 'all';

function formatSessionDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatSessionDuration(seconds: number | undefined): string {
  if (!seconds) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

const ROUTE_COLORS = ['#6366f1', '#0d9488', '#f59e0b', '#ef4444', '#2563eb'];

// ── Component ────────────────────────────────────────────────────────

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView>(null);
  const params = useLocalSearchParams<{ lat?: string; lng?: string; zoom?: string; label?: string; layer?: string }>();

  const contacts = useCRMStore(state => state.contacts);
  const fetchContacts = useCRMStore(state => state.fetchContacts);
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

  const fetchRequirements = useBuyerMatchStore(s => s.fetchRequirements);

  const streetStats = useStreetStats();

  const [visibleLayers, setVisibleLayers] = useState<VisibleLayers>({
    contacts: true,
    properties: false,
    fieldActivity: false,
    buildings: false,
    stats: false,
  });

  const [layerSheetVisible, setLayerSheetVisible] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertyPreviewVisible, setPropertyPreviewVisible] = useState(false);
  const [pendingMarker, setPendingMarker] = useState<{ latitude: number; longitude: number } | null>(null);
  const [currentSuburbBoundary, setCurrentSuburbBoundary] = useState<SuburbBoundary | null>(null);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [fabOpen, setFabOpen] = useState(false);
  const [longPressDialog, setLongPressDialog] = useState<{
    visible: boolean;
    latitude: number;
    longitude: number;
    address: string;
  }>({ visible: false, latitude: 0, longitude: 0, address: '' });

  const [fieldActivityWindow, setFieldActivityWindow] = useState<FieldActivityWindow>('30d');
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

  // Buildings layer state
  const metrics = useProspectingMetrics();
  const [osmBuildings, setOsmBuildings] = useState<OSMBuilding[]>([]);
  const [buildingDialogVisible, setBuildingDialogVisible] = useState(false);
  const [selectedBuilding, setSelectedBuilding] = useState<OSMBuilding | null>(null);
  const [selectedBuildingCoverage, setSelectedBuildingCoverage] = useState<MultiDwellingBuilding | null>(null);

  // Fly to coordinates when navigated with ?lat=X&lng=Y params
  // Auto-enable the relevant layer so the marker is visible
  useFocusEffect(
    useCallback(() => {
      if (params.lat && params.lng) {
        const lat = parseFloat(params.lat);
        const lng = parseFloat(params.lng);
        const zoom = params.zoom ? parseFloat(params.zoom) : 0.005;
        if (!isNaN(lat) && !isNaN(lng)) {
          // Auto-enable the layer for what we're navigating to
          if (params.layer) {
            let layerKey = params.layer as keyof VisibleLayers;
            // Backward compat: old layer names map to fieldActivity
            if (layerKey === ('routes' as string) || layerKey === ('annotations' as string)) {
              layerKey = 'fieldActivity';
            }
            if (layerKey in visibleLayers && !visibleLayers[layerKey]) {
              setVisibleLayers(prev => ({ ...prev, [layerKey]: true }));
            }
          }

          const targetRegion = { latitude: lat, longitude: lng, latitudeDelta: zoom, longitudeDelta: zoom };
          setTimeout(() => {
            mapRef.current?.animateToRegion(targetRegion, 600);
          }, 300);
        }
      }
    }, [params.lat, params.lng, params.zoom, params.layer])
  );

  // Fetch data on focus
  useFocusEffect(
    useCallback(() => {
      fetchContacts();
      fetchProperties();
      fetchSessions();
      fetchAllAnnotations();
      fetchRecentActivities(200);
    }, [fetchContacts, fetchProperties, fetchSessions, fetchAllAnnotations, fetchRecentActivities])
  );

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

  // Fetch OSM buildings when layer is enabled and region stabilises
  useEffect(() => {
    if (!visibleLayers.buildings) return;

    // Only fetch when zoomed in enough to avoid overwhelming Overpass
    if (mapRegion.latitudeDelta >= 0.02) {
      setOsmBuildings([]);
      return;
    }

    const timer = setTimeout(async () => {
      const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
      try {
        const buildings = await fetchMultiDwellingBuildings(
          latitude - latitudeDelta / 2,
          longitude - longitudeDelta / 2,
          latitude + latitudeDelta / 2,
          longitude + longitudeDelta / 2,
        );
        setOsmBuildings(buildings);
      } catch (error) {
        console.error('Failed to fetch OSM buildings:', error);
      }
    }, 1000); // 1s debounce

    return () => clearTimeout(timer);
  }, [visibleLayers.buildings, mapRegion]);

  // ── Derived data ──────────────────────────────────────────────────

  const activeLayerCount = useMemo(() => {
    return Object.values(visibleLayers).filter(Boolean).length;
  }, [visibleLayers]);

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

  const mappedProperties = useMemo(() => {
    return properties.filter(p => p.latitude != null && p.longitude != null);
  }, [properties]);

  const windowedSessions = useMemo(() => {
    const now = Date.now();
    const cutoffs: Record<FieldActivityWindow, number | null> = {
      '7d': now - 7 * 24 * 60 * 60 * 1000,
      '30d': now - 30 * 24 * 60 * 60 * 1000,
      'all': null,
    };
    const cutoff = cutoffs[fieldActivityWindow];
    return sessions
      .filter(s => cutoff === null || new Date(s.started_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())
      .slice(0, 10);
  }, [sessions, fieldActivityWindow]);

  // Auto-select all sessions when the time window changes
  useEffect(() => {
    setSelectedSessionIds(new Set(windowedSessions.map(s => s.id)));
  }, [windowedSessions]);

  const routePolylines = useMemo(() => {
    return windowedSessions
      .filter(s => s.polyline && selectedSessionIds.has(s.id))
      .map(s => ({
        id: s.id,
        coordinates: decodePolyline(s.polyline!),
        startedAt: s.started_at,
      }));
  }, [windowedSessions, selectedSessionIds]);

  const filteredAnnotations = useMemo(() => {
    return allAnnotations.filter(a => selectedSessionIds.has(a.session_id));
  }, [allAnnotations, selectedSessionIds]);

  const [contactRequirements, setContactRequirements] = useState<ContactRequirement[]>([]);

  const selectedContactLastActivity = useMemo((): ActivityWithContact | null => {
    if (!selectedContact) return null;
    return recentActivities.find(a => a.contact_id === selectedContact.id) || null;
  }, [selectedContact, recentActivities]);

  // ── Callbacks ─────────────────────────────────────────────────────

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

  const fetchSuburbBoundary = useCallback(async (suburbName: string) => {
    const boundary = await fetchSuburbByName(suburbName, 'New South Wales');
    setCurrentSuburbBoundary(boundary);
  }, []);

  const handleMarkerPress = useCallback(async (contact: Contact) => {
    setSelectedContact(contact);
    setPreviewVisible(true);
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

  const handleAddContact = useCallback(() => {
    setFabOpen(false);
    router.push('/contact/new');
  }, [router]);

  const handleAddQuickNote = useCallback(async () => {
    setFabOpen(false);
    const center = mapRegion;
    const address = await reverseGeocode(center.latitude, center.longitude);
    router.push({
      pathname: '/contact/new',
      params: { lat: center.latitude.toString(), lng: center.longitude.toString(), address, quickNote: 'true' },
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
      params: { lat: latitude.toString(), lng: longitude.toString(), address, quickNote: quickNote ? 'true' : undefined },
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

  // ── Buildings layer helpers ──────────────────────────────────────

  /** Match an OSM building to our prospecting coverage data by proximity (~50m). */
  const findBuildingCoverage = useCallback((building: OSMBuilding): MultiDwellingBuilding | null => {
    const PROXIMITY_THRESHOLD = 0.00045; // ~50m at Australian latitudes
    for (const mdb of metrics.multiDwellingBuildings) {
      const latDiff = Math.abs(building.center.latitude - mdb.latitude);
      const lngDiff = Math.abs(building.center.longitude - mdb.longitude);
      if (latDiff < PROXIMITY_THRESHOLD && lngDiff < PROXIMITY_THRESHOLD) {
        return mdb;
      }
    }
    return null;
  }, [metrics.multiDwellingBuildings]);

  const getBuildingFillColor = useCallback((building: OSMBuilding): string => {
    const coverage = findBuildingCoverage(building);
    if (!coverage) return 'rgba(124, 58, 237, 0.1)'; // light purple, unvisited

    const percent = (coverage.totalUnitsVisited / building.estimatedUnits) * 100;
    if (percent >= 75) return 'rgba(34, 197, 94, 0.3)';  // green, well covered
    if (percent >= 25) return 'rgba(234, 179, 8, 0.3)';   // amber, partial
    return 'rgba(239, 68, 68, 0.2)';                       // red, barely touched
  }, [findBuildingCoverage]);

  const handleBuildingPress = useCallback((building: OSMBuilding) => {
    setSelectedBuilding(building);
    setSelectedBuildingCoverage(findBuildingCoverage(building));
    setBuildingDialogVisible(true);
  }, [findBuildingCoverage]);

  const handleStartProspectingBuilding = useCallback(() => {
    if (!selectedBuilding) return;
    setBuildingDialogVisible(false);
    router.push({
      pathname: '/contact/new',
      params: {
        lat: selectedBuilding.center.latitude.toString(),
        lng: selectedBuilding.center.longitude.toString(),
        address: selectedBuilding.address || '',
        quickNote: 'true',
      },
    });
  }, [selectedBuilding, router]);

  const handleSearchLocationSelect = useCallback((lat: number, lng: number, name: string) => {
    const newRegion = { latitude: lat, longitude: lng, latitudeDelta: 0.04, longitudeDelta: 0.04 };
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
      location = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserLocation(location);
    }
    const newRegion = { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.008, longitudeDelta: 0.008 };
    mapRef.current?.animateToRegion(newRegion, 500);
    const suburbName = await getSuburbFromCoords(location.latitude, location.longitude);
    if (suburbName) fetchSuburbBoundary(suburbName);
  }, [userLocation, getSuburbFromCoords, fetchSuburbBoundary]);

  const toggleLayer = useCallback((layer: keyof VisibleLayers) => {
    if (layer === 'fieldActivity') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setVisibleLayers(prev => ({ ...prev, [layer]: !prev[layer] }));
  }, []);

  // ── Render ────────────────────────────────────────────────────────

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
        showsMyLocationButton={false}
      >
        {/* Contact markers */}
        {visibleLayers.contacts && mappedContacts.map((contact) => (
          <Marker
            key={`c-${contact.id}`}
            coordinate={{ latitude: contact.latitude!, longitude: contact.longitude! }}
            title={`${contact.first_name} ${contact.last_name || ''}`}
            description={contact.address}
            pinColor={getMarkerColor(contact)}
            onPress={() => handleMarkerPress(contact)}
          />
        ))}

        {/* Property markers */}
        {visibleLayers.properties && mappedProperties.map((property) => (
          <Marker
            key={`p-${property.id}`}
            coordinate={{ latitude: property.latitude!, longitude: property.longitude! }}
            title={property.address}
            description={`${property.status} - ${property.for_type}`}
            pinColor="#7c3aed"
            onPress={() => handlePropertyMarkerPress(property)}
          />
        ))}

        {/* Route polylines (field activity layer) */}
        {visibleLayers.fieldActivity && routePolylines.map((route, idx) => (
          <Polyline
            key={`r-${route.id}`}
            coordinates={route.coordinates}
            strokeColor={ROUTE_COLORS[idx % ROUTE_COLORS.length]}
            strokeWidth={3}
            lineDashPattern={[0]}
          />
        ))}

        {/* Annotations (field activity layer) */}
        {visibleLayers.fieldActivity && filteredAnnotations.map((annotation) => (
          <Marker
            key={`a-${annotation.id}`}
            coordinate={{ latitude: annotation.latitude, longitude: annotation.longitude }}
            title={annotation.note}
            description={annotation.created_at ? new Date(annotation.created_at).toLocaleDateString() : ''}
            pinColor="#f59e0b"
          />
        ))}

        {/* Pending long-press marker */}
        {pendingMarker && <Marker coordinate={pendingMarker} pinColor="#FF9800" opacity={0.7} />}

        {/* Suburb boundary */}
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
            center={{ latitude: stat.averageLatitude, longitude: stat.averageLongitude }}
            radius={Math.max(30, stat.contactCount * 15)}
            fillColor={getStatsColor(stat.daysSinceLastContact)}
            strokeColor={getStatsColor(stat.daysSinceLastContact).replace('0.4', '0.8')}
            strokeWidth={1}
          />
        ))}

        {/* Building footprint polygons (buildings layer) */}
        {visibleLayers.buildings && osmBuildings.map((building) => (
          <Polygon
            key={`bldg-${building.id}`}
            coordinates={building.coordinates}
            strokeColor="#7c3aed"
            strokeWidth={2}
            fillColor={getBuildingFillColor(building)}
            tappable
            onPress={() => handleBuildingPress(building)}
          />
        ))}
      </MapView>

      {/* ── Search bar ── */}
      <MapSearchBar onLocationSelect={handleSearchLocationSelect} />

      {/* ── Active tag filter chips (below search) ── */}
      {selectedTags.length > 0 && (
        <View style={styles.tagChipBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tagChipScroll}>
            {selectedTags.map(tag => (
              <Chip
                key={tag.id}
                mode="flat"
                compact
                style={[styles.tagChip, { backgroundColor: tag.color }]}
                textStyle={{ color: '#fff', fontSize: 11 }}
              >
                {tag.name}
              </Chip>
            ))}
            <Chip
              compact
              icon="pencil"
              onPress={() => setFilterVisible(true)}
              style={styles.editFilterChip}
              textStyle={{ fontSize: 11 }}
            >
              Edit
            </Chip>
          </ScrollView>
        </View>
      )}

      {/* ── Zoom hint for buildings layer ── */}
      {visibleLayers.buildings && mapRegion.latitudeDelta >= 0.02 && (
        <Surface style={styles.buildingZoomHint} elevation={2}>
          <Icon name="magnify-plus-outline" size={16} color="#7c3aed" />
          <Text variant="labelSmall" style={styles.buildingZoomHintText}>
            Zoom in to see buildings
          </Text>
        </Surface>
      )}

      {/* ── GPS Center button (top-right, below search) ── */}
      <TouchableOpacity
        style={[styles.gpsButton, { backgroundColor: theme.colors.surface }]}
        onPress={handleCenterOnUser}
        activeOpacity={0.8}
      >
        <Icon name="crosshairs-gps" size={20} color={theme.colors.primary} />
      </TouchableOpacity>

      {/* ── Layers pill (bottom-left) ── */}
      <TouchableOpacity
        style={[styles.layersPill, { backgroundColor: theme.colors.surface, bottom: insets.bottom + 90 }]}
        onPress={() => setLayerSheetVisible(true)}
        activeOpacity={0.8}
      >
        <Icon name="layers-outline" size={18} color={theme.colors.onSurface} />
        <Text variant="labelMedium" style={{ color: theme.colors.onSurface, marginLeft: 6 }}>
          Layers
        </Text>
        {activeLayerCount > 0 && (
          <View style={[styles.layerBadge, { backgroundColor: theme.colors.primary }]}>
            <Text style={{ color: theme.colors.onPrimary, fontSize: 10, fontWeight: '700' }}>
              {activeLayerCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Main FAB (bottom-right) ── */}
      <FAB.Group
        open={fabOpen}
        visible
        icon={fabOpen ? 'close' : 'plus'}
        fabStyle={[styles.mainFab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        actions={[
          { icon: 'account-plus', label: 'New Contact', onPress: handleAddContact },
          { icon: 'note-plus', label: 'Quick Note', onPress: handleAddQuickNote },
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        style={[styles.fabGroup, { bottom: insets.bottom }]}
      />

      {/* ── Portals ── */}
      <Portal>
        {/* Layers bottom sheet */}
        <Dialog visible={layerSheetVisible} onDismiss={() => setLayerSheetVisible(false)} style={styles.layerSheet}>
          <Dialog.Title>Map Layers</Dialog.Title>
          <Dialog.Content>
            {LAYER_DEFS.map((layer) => (
              <View key={layer.key}>
                <TouchableOpacity
                  style={styles.layerRow}
                  onPress={() => toggleLayer(layer.key)}
                  activeOpacity={0.7}
                >
                  <View style={styles.layerRowLeft}>
                    <Icon
                      name={layer.icon}
                      size={20}
                      color={visibleLayers[layer.key] ? layer.activeColor : theme.colors.onSurfaceVariant}
                    />
                    <Text
                      variant="bodyMedium"
                      style={{ marginLeft: 12, color: visibleLayers[layer.key] ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}
                    >
                      {layer.label}
                    </Text>
                  </View>
                  <Switch
                    value={visibleLayers[layer.key]}
                    onValueChange={() => toggleLayer(layer.key)}
                    color={layer.activeColor}
                  />
                </TouchableOpacity>

                {/* Field Activity expansion panel */}
                {layer.key === 'fieldActivity' && visibleLayers.fieldActivity && (
                  <View style={styles.fieldActivityPanel}>
                    {/* Time window chips */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.timeWindowChips}>
                      {([
                        { value: '7d' as FieldActivityWindow, label: '7 days' },
                        { value: '30d' as FieldActivityWindow, label: '30 days' },
                        { value: 'all' as FieldActivityWindow, label: 'All' },
                      ]).map((opt) => (
                        <Chip
                          key={opt.value}
                          mode={fieldActivityWindow === opt.value ? 'flat' : 'outlined'}
                          compact
                          onPress={() => setFieldActivityWindow(opt.value)}
                          style={fieldActivityWindow === opt.value ? styles.timeChipActive : styles.timeChipInactive}
                          textStyle={fieldActivityWindow === opt.value ? styles.timeChipTextActive : styles.timeChipTextInactive}
                        >
                          {opt.label}
                        </Chip>
                      ))}
                    </ScrollView>

                    {/* Session list */}
                    <ScrollView style={styles.sessionList} nestedScrollEnabled>
                      {windowedSessions.map((session, idx) => {
                        const isSelected = selectedSessionIds.has(session.id);
                        return (
                          <TouchableOpacity
                            key={session.id}
                            style={styles.sessionRow}
                            onPress={() => {
                              setSelectedSessionIds(prev => {
                                const next = new Set(prev);
                                if (next.has(session.id)) {
                                  next.delete(session.id);
                                } else {
                                  next.add(session.id);
                                }
                                return next;
                              });
                            }}
                            activeOpacity={0.7}
                          >
                            <View style={[styles.sessionDot, { backgroundColor: ROUTE_COLORS[idx % ROUTE_COLORS.length] }]} />
                            <Text variant="bodySmall" style={[styles.sessionDate, { color: theme.colors.onSurface }]}>
                              {formatSessionDate(session.started_at)}
                            </Text>
                            <Text variant="bodySmall" style={[styles.sessionDuration, { color: theme.colors.onSurfaceVariant }]}>
                              {formatSessionDuration(session.duration_seconds)}
                            </Text>
                            <Icon
                              name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                              size={20}
                              color={isSelected ? '#0d9488' : theme.colors.onSurfaceVariant}
                            />
                          </TouchableOpacity>
                        );
                      })}
                      {sessions.length > 10 && (
                        <Text variant="labelSmall" style={[styles.sessionOverflow, { color: theme.colors.onSurfaceVariant }]}>
                          {sessions.length - 10} more — narrow time window
                        </Text>
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
            ))}

            {/* Tag filter shortcut */}
            <View style={styles.layerDivider} />
            <TouchableOpacity
              style={styles.layerRow}
              onPress={() => { setLayerSheetVisible(false); setFilterVisible(true); }}
              activeOpacity={0.7}
            >
              <View style={styles.layerRowLeft}>
                <Icon name="tag-multiple" size={20} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodyMedium" style={{ marginLeft: 12, color: theme.colors.onSurface }}>
                  Tag Filters
                </Text>
                {selectedTags.length > 0 && (
                  <View style={[styles.tagCountBadge, { backgroundColor: theme.colors.primaryContainer }]}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onPrimaryContainer }}>
                      {selectedTags.length}
                    </Text>
                  </View>
                )}
              </View>
              <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
            </TouchableOpacity>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLayerSheetVisible(false)}>Done</Button>
          </Dialog.Actions>
        </Dialog>

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

        {/* Building detail dialog */}
        <Dialog visible={buildingDialogVisible} onDismiss={() => setBuildingDialogVisible(false)} style={styles.buildingDialog}>
          <Dialog.Title>
            <View style={styles.buildingDialogTitleRow}>
              <Icon name="office-building" size={20} color="#7c3aed" />
              <Text variant="titleMedium" style={styles.buildingDialogTitleText}>
                {selectedBuilding?.name || selectedBuilding?.address || 'Building'}
              </Text>
            </View>
          </Dialog.Title>
          <Dialog.Content>
            {selectedBuilding && (
              <View>
                {selectedBuilding.address && (
                  <View style={styles.buildingDetailRow}>
                    <Icon name="map-marker" size={16} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.buildingDetailText}>
                      {selectedBuilding.address}
                    </Text>
                  </View>
                )}

                <View style={styles.buildingDetailRow}>
                  <Icon name="door" size={16} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyMedium" style={styles.buildingDetailText}>
                    Estimated units: {selectedBuilding.estimatedUnits}
                  </Text>
                </View>

                {selectedBuilding.levels != null && (
                  <View style={styles.buildingDetailRow}>
                    <Icon name="stairs" size={16} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.buildingDetailText}>
                      Levels: {selectedBuilding.levels}
                    </Text>
                  </View>
                )}

                <View style={styles.buildingDetailRow}>
                  <Icon name="home-variant" size={16} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyMedium" style={styles.buildingDetailText}>
                    Type: {selectedBuilding.buildingType}
                  </Text>
                </View>

                <View style={styles.buildingDivider} />

                {selectedBuildingCoverage ? (
                  <View>
                    <View style={styles.buildingDetailRow}>
                      <Icon name="clipboard-check" size={16} color="#22c55e" />
                      <Text variant="bodyMedium" style={styles.buildingDetailText}>
                        Units visited: {selectedBuildingCoverage.totalUnitsVisited} / {selectedBuilding.estimatedUnits}
                      </Text>
                    </View>

                    <View style={styles.buildingCoverageBar}>
                      <View
                        style={[
                          styles.buildingCoverageFill,
                          {
                            width: `${Math.min(100, Math.round((selectedBuildingCoverage.totalUnitsVisited / selectedBuilding.estimatedUnits) * 100))}%`,
                            backgroundColor:
                              (selectedBuildingCoverage.totalUnitsVisited / selectedBuilding.estimatedUnits) >= 0.75
                                ? '#22c55e'
                                : (selectedBuildingCoverage.totalUnitsVisited / selectedBuilding.estimatedUnits) >= 0.25
                                  ? '#eab308'
                                  : '#ef4444',
                          },
                        ]}
                      />
                    </View>

                    <Text variant="labelSmall" style={[styles.buildingCoveragePercent, { color: theme.colors.onSurfaceVariant }]}>
                      {Math.round((selectedBuildingCoverage.totalUnitsVisited / selectedBuilding.estimatedUnits) * 100)}% coverage
                    </Text>

                    {selectedBuildingCoverage.uniqueUnits.length > 0 && (
                      <View style={styles.buildingUnitsVisited}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                          Units visited:
                        </Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.buildingUnitChips}>
                          {selectedBuildingCoverage.uniqueUnits.map(unit => (
                            <Chip key={unit} compact mode="outlined" textStyle={{ fontSize: 11 }} style={styles.buildingUnitChip}>
                              {unit}
                            </Chip>
                          ))}
                        </ScrollView>
                      </View>
                    )}

                    {selectedBuildingCoverage.lastVisited && (
                      <Text variant="labelSmall" style={[styles.buildingLastVisited, { color: theme.colors.onSurfaceVariant }]}>
                        Last visited: {new Date(selectedBuildingCoverage.lastVisited).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.buildingDetailRow}>
                    <Icon name="alert-circle-outline" size={16} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={[styles.buildingDetailText, { color: theme.colors.onSurfaceVariant }]}>
                      Not yet visited
                    </Text>
                  </View>
                )}
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <Button onPress={() => setBuildingDialogVisible(false)}>Close</Button>
            <Button icon="walk" mode="contained" onPress={handleStartProspectingBuilding}>
              Start Prospecting
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={longPressDialog.visible} onDismiss={dismissLongPressDialog}>
          <Dialog.Title>Add to Map</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
              {longPressDialog.address || 'Loading address...'}
            </Text>
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <Button onPress={dismissLongPressDialog}>Cancel</Button>
            <Button icon="note-plus" onPress={() => handleLongPressAction(true)}>Quick Note</Button>
            <Button icon="account-plus" mode="contained" onPress={() => handleLongPressAction(false)}>Contact</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    width,
    height,
  },

  // Tag chips below search
  tagChipBar: {
    position: 'absolute',
    top: 64,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
  },
  tagChipScroll: {
    gap: 6,
    paddingRight: 8,
  },
  tagChip: {
    height: 28,
  },
  editFilterChip: {
    height: 28,
  },

  // GPS button
  gpsButton: {
    position: 'absolute',
    top: 72,
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },

  // Layers pill
  layersPill: {
    position: 'absolute',
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 22,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  layerBadge: {
    marginLeft: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Layer sheet
  layerSheet: {
    maxHeight: '70%',
  },
  layerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  layerRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  layerDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: 4,
  },
  tagCountBadge: {
    marginLeft: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },

  // Field Activity panel
  fieldActivityPanel: {
    paddingLeft: 32,
    paddingBottom: 8,
  },
  timeWindowChips: {
    gap: 8,
    paddingBottom: 10,
  },
  timeChipActive: {
    backgroundColor: '#0d9488',
  },
  timeChipInactive: {},
  timeChipTextActive: {
    color: '#ffffff',
    fontSize: 12,
  },
  timeChipTextInactive: {
    fontSize: 12,
  },
  sessionList: {
    maxHeight: 180,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  sessionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sessionDate: {
    flex: 1,
  },
  sessionDuration: {
    marginRight: 8,
  },
  sessionOverflow: {
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Buildings layer
  buildingZoomHint: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  buildingZoomHintText: {
    color: '#7c3aed',
  },
  buildingDialog: {
    maxHeight: '80%',
  },
  buildingDialogTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buildingDialogTitleText: {
    flex: 1,
  },
  buildingDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  buildingDetailText: {
    flex: 1,
  },
  buildingDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(0,0,0,0.1)',
    marginVertical: 12,
  },
  buildingCoverageBar: {
    height: 6,
    backgroundColor: 'rgba(0,0,0,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  buildingCoverageFill: {
    height: '100%',
    borderRadius: 3,
  },
  buildingCoveragePercent: {
    textAlign: 'right',
    marginBottom: 8,
  },
  buildingUnitsVisited: {
    marginTop: 4,
  },
  buildingUnitChips: {
    gap: 6,
    paddingBottom: 4,
  },
  buildingUnitChip: {
    height: 26,
  },
  buildingLastVisited: {
    marginTop: 8,
    fontStyle: 'italic',
  },

  // FAB
  mainFab: {
    elevation: 4,
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
});
