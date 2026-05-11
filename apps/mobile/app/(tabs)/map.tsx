import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Dimensions, Linking, TouchableOpacity, ScrollView, LayoutAnimation } from 'react-native';
import { FAB, Portal, useTheme, Chip, Surface, Text, Dialog, Button, Switch, Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import ClusterMapView from 'react-native-map-clustering';
import MapView, { Marker, Polygon, Circle, Polyline, PROVIDER_GOOGLE, LongPressEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore, useStreetStats, usePropertyStore, useTrackingStore, useBuyerMatchStore, useProspectingMetrics, useProspectingMatcher, useLeadScoringEngine, useDeclaredBuildingsStore, useWhiteboardStore } from '@realestate-crm/hooks';
import type { MultiDwellingBuilding, NearbyContact } from '@realestate-crm/hooks';
import type { Contact, Property, ActivityWithContact, ContactRequirement, OSMBuilding, DeclaredBuilding } from '@realestate-crm/types';
import { fetchSuburbByName, decodePolyline, fetchMultiDwellingBuildings } from '@realestate-crm/api';
import { formatRelativeDate } from '@realestate-crm/utils';
import type { SuburbBoundary } from '@realestate-crm/types';
import { FilterSheet, ContactPreview, MapSearchBar, PropertyPreview, BuildingActivityDialog } from '@realestate-crm/ui';
import TerritoryBriefingCard from '../../components/TerritoryBriefingCard';
import { TIER_COLORS } from '../../components/LeadScoreBadge';

const { width, height } = Dimensions.get('window');

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey ||
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

/**
 * Deep-link param contract — producers should push to '/(tabs)/map' with:
 *   ?lat=<latitude>         — map centers here (required for focus)
 *   &lng=<longitude>        — map centers here (required for focus)
 *   &zoom=<latitudeDelta>   — camera zoom expressed as latitudeDelta (default 0.005 ≈ 500m)
 *   &layer=<layerKey>       — auto-enables the named VisibleLayers key (contacts|properties|
 *                             fieldActivity|buildings|stats). Comma-separated not supported yet.
 *
 * Producers: MapCard (whiteboard), SuggestionCard (route + coverage_gap kinds).
 * Handled in the useFocusEffect below.
 */

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
  { key: 'stats', label: 'Opportunity', icon: 'chart-bar', activeColor: '#ef4444' },
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
  const recentActivities = useCRMStore(state => state.activities);
  const fetchRecentActivities = useCRMStore(state => state.fetchActivities);

  const properties = usePropertyStore(state => state.properties);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);

  const sessions = useTrackingStore(state => state.sessions);
  const fetchSessions = useTrackingStore(state => state.fetchSessions);
  const allAnnotations = useTrackingStore(state => state.allAnnotations);
  const fetchAllAnnotations = useTrackingStore(state => state.fetchAllAnnotations);

  const fetchRequirements = useBuyerMatchStore(s => s.fetchRequirements);

  // visibleLayers must be declared before useStreetStats so the enabled flag can reference it
  const [visibleLayers, setVisibleLayers] = useState<VisibleLayers>({
    contacts: false,
    properties: false,
    fieldActivity: false,
    buildings: false,
    stats: false,
  });

  const { streets: streetStats, getBriefing } = useStreetStats({ enabled: visibleLayers.stats });
  const { getTier } = useLeadScoringEngine();

  const [briefingVisible, setBriefingVisible] = useState(false);
  const [activeBriefing, setActiveBriefing] = useState<ReturnType<typeof getBriefing>>(null);

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
  const [multiDwellingDialog, setMultiDwellingDialog] = useState<{
    visible: boolean;
    latitude: number;
    longitude: number;
    address: string;
  }>({ visible: false, latitude: 0, longitude: 0, address: '' });

  const [fieldActivityWindow, setFieldActivityWindow] = useState<FieldActivityWindow>('30d');
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());

  // Nearby contacts (prospecting)
  const { nearbyContacts } = useProspectingMatcher(
    userLocation?.latitude ?? null,
    userLocation?.longitude ?? null,
    200, // 200m radius for field prospecting
  );
  // Nearby contacts now handled by TrackingBanner bottom sheet

  // Buildings layer state
  const metrics = useProspectingMetrics();
  const declaredBuildings = useDeclaredBuildingsStore(s => s.declaredBuildings);
  const fetchDeclaredBuildings = useDeclaredBuildingsStore(s => s.fetchDeclaredBuildings);
  const [osmBuildings, setOsmBuildings] = useState<OSMBuilding[]>([]);
  const [buildingDialogVisible, setBuildingDialogVisible] = useState(false);
  const [selectedBuildingView, setSelectedBuildingView] = useState<
    | { kind: 'osm'; building: OSMBuilding }
    | { kind: 'declared'; building: DeclaredBuilding }
    | null
  >(null);
  const [selectedBuildingCoverage, setSelectedBuildingCoverage] = useState<MultiDwellingBuilding | null>(null);

  // Whiteboard pin state (building dialog)
  const createWhiteboardItem = useWhiteboardStore((s) => s.createItem);
  const [buildingPinSnackbar, setBuildingPinSnackbar] = useState(false);

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
      fetchDeclaredBuildings();
    }, [fetchContacts, fetchProperties, fetchSessions, fetchAllAnnotations, fetchRecentActivities, fetchDeclaredBuildings])
  );

  // Get user location on first mount and center map there
  const initialLocationSet = useRef(false);
  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const location = await Location.getCurrentPositionAsync({});
      const coords = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
      setUserLocation(coords);

      // Center map on user's location only on first load
      if (!initialLocationSet.current) {
        initialLocationSet.current = true;
        const region = {
          ...coords,
          latitudeDelta: 0.008,
          longitudeDelta: 0.008,
        };
        setMapRegion(region);
        mapRef.current?.animateToRegion(region, 600);
      }
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
    // Compute viewport bounds with a 100% buffer so contacts near the edge don't pop in when panning
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const latBuffer = latitudeDelta; // 100% extra on each side
    const lngBuffer = longitudeDelta;
    const minLat = latitude - latitudeDelta / 2 - latBuffer;
    const maxLat = latitude + latitudeDelta / 2 + latBuffer;
    const minLng = longitude - longitudeDelta / 2 - lngBuffer;
    const maxLng = longitude + longitudeDelta / 2 + lngBuffer;

    return contacts.filter(contact => {
      if (!contact.latitude || !contact.longitude) return false;
      // Skip contacts outside the buffered viewport — ClusterMapView handles the rest
      if (
        contact.latitude < minLat || contact.latitude > maxLat ||
        contact.longitude < minLng || contact.longitude > maxLng
      ) return false;
      if (selectedTagIds.length > 0) {
        const contactTagIds = (contact.tags || []).map(t => t.id);
        const hasMatchingTag = contactTagIds.some(id => selectedTagIds.includes(id));
        if (!hasMatchingTag && !selectedTagIds.includes(contact.tag_id || '')) {
          return false;
        }
      }
      return true;
    });
  }, [contacts, selectedTagIds, mapRegion]);

  const selectedTags = useMemo(() => {
    return tags.filter(t => selectedTagIds.includes(t.id));
  }, [tags, selectedTagIds]);

  const mappedProperties = useMemo(() => {
    return properties.filter(p => p.latitude != null && p.longitude != null);
  }, [properties]);

  // Sessions filtered by time window, sorted newest-first, NOT yet capped at
  // 10. The "X more" hint below compares against this count so it shows the
  // true overflow within the current window — earlier rev compared against
  // the unfiltered total `sessions.length`, which produced misleading
  // counts (e.g. "8 more" when the time window only had 3 hidden).
  const windowedSessionsAll = useMemo(() => {
    const now = Date.now();
    const cutoffs: Record<FieldActivityWindow, number | null> = {
      '7d': now - 7 * 24 * 60 * 60 * 1000,
      '30d': now - 30 * 24 * 60 * 60 * 1000,
      'all': null,
    };
    const cutoff = cutoffs[fieldActivityWindow];
    return sessions
      .filter(s => cutoff === null || new Date(s.started_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }, [sessions, fieldActivityWindow]);

  const windowedSessions = useMemo(
    () => windowedSessionsAll.slice(0, 10),
    [windowedSessionsAll],
  );

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

  const handleLongPressMultiDwelling = useCallback(() => {
    const { latitude, longitude, address } = longPressDialog;
    setLongPressDialog(prev => ({ ...prev, visible: false }));
    setMultiDwellingDialog({ visible: true, latitude, longitude, address });
    setTimeout(() => setPendingMarker(null), 500);
  }, [longPressDialog]);

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
    const tier = getTier(contact.id);
    if (tier !== 'dormant') return TIER_COLORS[tier];
    return contact.tags?.[0]?.color || contact.tag?.color || theme.colors.primary;
  }, [theme.colors.primary, getTier]);

  const getStatsColor = useCallback((daysSinceLastContact: number | null): string => {
    if (daysSinceLastContact === null || daysSinceLastContact > 30) return 'rgba(239, 68, 68, 0.4)';
    if (daysSinceLastContact > 7) return 'rgba(234, 179, 8, 0.4)';
    return 'rgba(34, 197, 94, 0.4)';
  }, []);

  const getOpportunityColor = useCallback((score: number | undefined): string => {
    const s = score ?? 0;
    if (s >= 70) return 'rgba(34, 197, 94, 0.5)';
    if (s >= 40) return 'rgba(234, 179, 8, 0.4)';
    return 'rgba(239, 68, 68, 0.3)';
  }, []);

  const handleStatCirclePress = useCallback((streetKey: string) => {
    const briefing = getBriefing(streetKey);
    if (briefing) {
      setActiveBriefing(briefing);
      setBriefingVisible(true);
    }
  }, [getBriefing]);

  // ── Buildings layer helpers ──────────────────────────────────────

  const BUILDING_PROXIMITY_THRESHOLD = 0.00045; // ~50m at Australian latitudes

  /** Match an OSM building to our prospecting coverage data by proximity (~50m). */
  const findBuildingCoverage = useCallback((building: OSMBuilding): MultiDwellingBuilding | null => {
    for (const mdb of metrics.multiDwellingBuildings) {
      const latDiff = Math.abs(building.center.latitude - mdb.latitude);
      const lngDiff = Math.abs(building.center.longitude - mdb.longitude);
      if (latDiff < BUILDING_PROXIMITY_THRESHOLD && lngDiff < BUILDING_PROXIMITY_THRESHOLD) {
        return mdb;
      }
    }
    return null;
  }, [metrics.multiDwellingBuildings]);

  /** Match a declared building to our coverage data by id first, proximity as fallback. */
  const findDeclaredCoverage = useCallback((declared: DeclaredBuilding): MultiDwellingBuilding | null => {
    for (const mdb of metrics.multiDwellingBuildings) {
      if (mdb.declaredBuildingId === declared.id) return mdb;
    }
    for (const mdb of metrics.multiDwellingBuildings) {
      const latDiff = Math.abs(declared.latitude - mdb.latitude);
      const lngDiff = Math.abs(declared.longitude - mdb.longitude);
      if (latDiff < BUILDING_PROXIMITY_THRESHOLD && lngDiff < BUILDING_PROXIMITY_THRESHOLD) {
        return mdb;
      }
    }
    return null;
  }, [metrics.multiDwellingBuildings]);

  const getBuildingFillColor = useCallback((building: OSMBuilding): string => {
    const coverage = findBuildingCoverage(building);
    // Declared buildings override OSM estimates when they overlap (more trustworthy).
    const effectiveUnits = coverage?.estimatedUnits ?? building.estimatedUnits;
    if (!coverage) return 'rgba(124, 58, 237, 0.1)'; // light purple, unvisited

    const percent = (coverage.totalUnitsVisited / Math.max(1, effectiveUnits)) * 100;
    if (percent >= 75) return 'rgba(34, 197, 94, 0.3)';  // green, well covered
    if (percent >= 25) return 'rgba(234, 179, 8, 0.3)';   // amber, partial
    return 'rgba(239, 68, 68, 0.2)';                       // red, barely touched
  }, [findBuildingCoverage]);

  const getDeclaredBuildingFillColor = useCallback((declared: DeclaredBuilding): string => {
    const coverage = findDeclaredCoverage(declared);
    const visited = coverage?.totalUnitsVisited ?? 0;
    if (visited === 0) return 'rgba(124, 58, 237, 0.1)';
    const percent = (visited / Math.max(1, declared.estimated_units)) * 100;
    if (percent >= 75) return 'rgba(34, 197, 94, 0.3)';
    if (percent >= 25) return 'rgba(234, 179, 8, 0.3)';
    return 'rgba(239, 68, 68, 0.2)';
  }, [findDeclaredCoverage]);

  // Declared buildings already covered by an OSM polygon get drawn as polygons (polygon wins visually).
  // Only render declared-as-Circle when no OSM polygon overlaps.
  const declaredBuildingsWithoutPolygons = useMemo(() => {
    return declaredBuildings.filter(declared => {
      for (const osm of osmBuildings) {
        const latDiff = Math.abs(declared.latitude - osm.center.latitude);
        const lngDiff = Math.abs(declared.longitude - osm.center.longitude);
        if (latDiff < BUILDING_PROXIMITY_THRESHOLD && lngDiff < BUILDING_PROXIMITY_THRESHOLD) {
          return false;
        }
      }
      return true;
    });
  }, [declaredBuildings, osmBuildings]);

  const handleBuildingPress = useCallback((building: OSMBuilding) => {
    setSelectedBuildingView({ kind: 'osm', building });
    setSelectedBuildingCoverage(findBuildingCoverage(building));
    setBuildingDialogVisible(true);
  }, [findBuildingCoverage]);

  const handleDeclaredBuildingPress = useCallback((declared: DeclaredBuilding) => {
    setSelectedBuildingView({ kind: 'declared', building: declared });
    setSelectedBuildingCoverage(findDeclaredCoverage(declared));
    setBuildingDialogVisible(true);
  }, [findDeclaredCoverage]);

  const handleStartProspectingBuilding = useCallback(() => {
    if (!selectedBuildingView) return;
    setBuildingDialogVisible(false);
    if (selectedBuildingView.kind === 'osm') {
      const b = selectedBuildingView.building;
      router.push({
        pathname: '/contact/new',
        params: {
          lat: b.center.latitude.toString(),
          lng: b.center.longitude.toString(),
          address: b.address || '',
          quickNote: 'true',
        },
      });
    } else {
      const b = selectedBuildingView.building;
      router.push({
        pathname: '/contact/new',
        params: {
          lat: b.latitude.toString(),
          lng: b.longitude.toString(),
          address: b.address,
          quickNote: 'true',
        },
      });
    }
  }, [selectedBuildingView, router]);

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
      {/* ClusterMapView is a drop-in replacement for MapView — it clusters <Marker> children
          while passing Polygon/Circle/Polyline through untouched as otherChildren.
          The ref is forwarded to the underlying native MapView, so animateToRegion works. */}
      <ClusterMapView
        ref={mapRef as unknown as React.RefObject<InstanceType<typeof ClusterMapView>>}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={mapRegion}
        onRegionChangeComplete={handleRegionChange}
        onLongPress={handleMapLongPress}
        showsUserLocation
        showsMyLocationButton={false}
        clusterColor="#6366f1"
        clusterTextColor="#ffffff"
        radius={40}
      >
        {/* Contact markers */}
        {visibleLayers.contacts && mappedContacts
          .filter((c) => c.latitude != null && c.longitude != null)
          .map((contact) => (
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
        {visibleLayers.properties && mappedProperties
          .filter((p) => p.latitude != null && p.longitude != null)
          .map((property) => (
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
            description={formatRelativeDate(annotation.created_at)}
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
            key={`stat-${stat.streetName}-${stat.suburb}`}
            center={{ latitude: stat.averageLatitude, longitude: stat.averageLongitude }}
            radius={Math.max(30, stat.contactCount * 15)}
            fillColor={getOpportunityColor(stat.opportunityScore)}
            strokeColor={getOpportunityColor(stat.opportunityScore).replace(/[\d.]+\)$/, '0.8)')}
            strokeWidth={1}
          />
        ))}
        {visibleLayers.stats && streetStats.map((stat) => (
          // cluster={false} opts this invisible tap target out of clustering — otherwise
          // react-native-map-clustering would merge nearby tap markers into bubbles and
          // break stat-circle tap detection (it duck-types Markers by `coordinate` prop).
          // `cluster` is read by the clustering wrapper but isn't in react-native-maps'
          // type alias (MapMarkerProps is `type`, not `interface`, so unaugmentable).
          <Marker
            key={`stat-tap-${stat.streetName}-${stat.suburb}`}
            coordinate={{ latitude: stat.averageLatitude, longitude: stat.averageLongitude }}
            onPress={() => handleStatCirclePress(`${stat.streetName}|${stat.suburb}`)}
            opacity={0}
            anchor={{ x: 0.5, y: 0.5 }}
            // @ts-expect-error react-native-map-clustering reads this prop via duck typing
            cluster={false}
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

        {/* Declared buildings (buildings layer) — user-declared buildings without an OSM polygon overlap */}
        {visibleLayers.buildings && declaredBuildingsWithoutPolygons.map((declared) => (
          <Circle
            key={`declared-${declared.id}`}
            center={{ latitude: declared.latitude, longitude: declared.longitude }}
            radius={25}
            strokeColor="#7c3aed"
            strokeWidth={2}
            fillColor={getDeclaredBuildingFillColor(declared)}
          />
        ))}
        {/* Invisible tap target markers for declared-building circles (Circle doesn't expose onPress reliably) */}
        {/* cluster={false} keeps each tap target individually addressable — otherwise the
            clustering library would merge them and tap targets would silently disappear. */}
        {visibleLayers.buildings && declaredBuildingsWithoutPolygons.map((declared) => (
          <Marker
            key={`declared-tap-${declared.id}`}
            coordinate={{ latitude: declared.latitude, longitude: declared.longitude }}
            onPress={() => handleDeclaredBuildingPress(declared)}
            opacity={0}
            anchor={{ x: 0.5, y: 0.5 }}
            // @ts-expect-error react-native-map-clustering reads this prop via duck typing
            cluster={false}
          />
        ))}
      </ClusterMapView>

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
        accessibilityLabel="Center map on my location"
        accessibilityRole="button"
      >
        <Icon name="crosshairs-gps" size={20} color={theme.colors.primary} />
      </TouchableOpacity>

      {/* ── Layers pill (bottom-left) ── */}
      <TouchableOpacity
        style={[styles.layersPill, { backgroundColor: theme.colors.surface, bottom: insets.bottom + 90 }]}
        onPress={() => setLayerSheetVisible(true)}
        activeOpacity={0.8}
        accessibilityLabel="Open map layers"
        accessibilityRole="button"
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
                      {windowedSessionsAll.length > 10 && (
                        <Text variant="labelSmall" style={[styles.sessionOverflow, { color: theme.colors.onSurfaceVariant }]}>
                          {windowedSessionsAll.length - 10} more — narrow time window
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

        {/* Building detail dialog — handles both OSM-derived polygons and user-declared buildings */}
        <Dialog visible={buildingDialogVisible} onDismiss={() => setBuildingDialogVisible(false)} style={styles.buildingDialog}>
          <Dialog.Title>
            <View style={styles.buildingDialogTitleRow}>
              <Icon name="office-building" size={20} color="#7c3aed" />
              <Text variant="titleMedium" style={styles.buildingDialogTitleText}>
                {selectedBuildingView?.kind === 'osm'
                  ? (selectedBuildingView.building.name || selectedBuildingView.building.address || 'Building')
                  : selectedBuildingView?.kind === 'declared'
                    ? (selectedBuildingView.building.address || 'Multi-dwelling building')
                    : 'Building'}
              </Text>
            </View>
          </Dialog.Title>
          <Dialog.Content>
            {selectedBuildingView && (() => {
              // Declared buildings win over OSM polygons for coverage/unit totals when both exist at same coords.
              const isDeclared = selectedBuildingView.kind === 'declared';
              const addressText = isDeclared
                ? selectedBuildingView.building.address
                : (selectedBuildingView.building.address || '');
              const effectiveUnits = isDeclared
                ? selectedBuildingView.building.estimated_units
                : (selectedBuildingCoverage?.estimatedUnits ?? selectedBuildingView.building.estimatedUnits);
              const coverage = selectedBuildingCoverage;
              const coveragePercent = coverage
                ? Math.min(100, Math.round((coverage.totalUnitsVisited / Math.max(1, effectiveUnits)) * 100))
                : 0;

              return (
                <View>
                  {addressText ? (
                    <View style={styles.buildingDetailRow}>
                      <Icon name="map-marker" size={16} color={theme.colors.onSurfaceVariant} />
                      <Text variant="bodyMedium" style={styles.buildingDetailText}>
                        {addressText}
                      </Text>
                    </View>
                  ) : null}

                  <View style={styles.buildingDetailRow}>
                    <Icon name="door" size={16} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.buildingDetailText}>
                      {isDeclared ? 'Total units: ' : 'Estimated units: '}{effectiveUnits}
                    </Text>
                  </View>

                  {!isDeclared && selectedBuildingView.building.levels != null && (
                    <View style={styles.buildingDetailRow}>
                      <Icon name="stairs" size={16} color={theme.colors.onSurfaceVariant} />
                      <Text variant="bodyMedium" style={styles.buildingDetailText}>
                        Levels: {selectedBuildingView.building.levels}
                      </Text>
                    </View>
                  )}

                  {!isDeclared && (
                    <View style={styles.buildingDetailRow}>
                      <Icon name="home-variant" size={16} color={theme.colors.onSurfaceVariant} />
                      <Text variant="bodyMedium" style={styles.buildingDetailText}>
                        Type: {selectedBuildingView.building.buildingType}
                      </Text>
                    </View>
                  )}

                  {isDeclared && (
                    <View style={styles.buildingDetailRow}>
                      <Icon name="account-check" size={16} color="#7c3aed" />
                      <Text variant="bodyMedium" style={styles.buildingDetailText}>
                        User-declared building
                      </Text>
                    </View>
                  )}

                  <View style={styles.buildingDivider} />

                  {coverage ? (
                    <View>
                      <View style={styles.buildingDetailRow}>
                        <Icon name="clipboard-check" size={16} color="#22c55e" />
                        <Text variant="bodyMedium" style={styles.buildingDetailText}>
                          Units visited: {coverage.totalUnitsVisited} / {effectiveUnits}
                        </Text>
                      </View>

                      <View style={styles.buildingCoverageBar}>
                        <View
                          style={[
                            styles.buildingCoverageFill,
                            {
                              width: `${coveragePercent}%`,
                              backgroundColor:
                                coveragePercent >= 75 ? '#22c55e'
                                  : coveragePercent >= 25 ? '#eab308'
                                    : '#ef4444',
                            },
                          ]}
                        />
                      </View>

                      <Text variant="labelSmall" style={[styles.buildingCoveragePercent, { color: theme.colors.onSurfaceVariant }]}>
                        {coveragePercent}% coverage
                      </Text>

                      {coverage.uniqueUnits.length > 0 && (
                        <View style={styles.buildingUnitsVisited}>
                          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                            Units visited:
                          </Text>
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.buildingUnitChips}>
                            {coverage.uniqueUnits.map(unit => (
                              <Chip key={unit} compact mode="outlined" textStyle={{ fontSize: 11 }} style={styles.buildingUnitChip}>
                                {unit}
                              </Chip>
                            ))}
                          </ScrollView>
                        </View>
                      )}

                      {coverage.lastVisited && (
                        <Text variant="labelSmall" style={[styles.buildingLastVisited, { color: theme.colors.onSurfaceVariant }]}>
                          Last visited: {new Date(coverage.lastVisited).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
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
              );
            })()}
          </Dialog.Content>
          <Dialog.Actions style={styles.dialogActions}>
            <Button onPress={() => setBuildingDialogVisible(false)}>Close</Button>
            <Button
              icon="pin-outline"
              onPress={() => {
                if (!selectedBuildingView) return;
                const lat =
                  selectedBuildingView.kind === 'declared'
                    ? selectedBuildingView.building.latitude
                    : selectedBuildingView.building.center.latitude;
                const lng =
                  selectedBuildingView.kind === 'declared'
                    ? selectedBuildingView.building.longitude
                    : selectedBuildingView.building.center.longitude;
                createWhiteboardItem({
                  type: 'map',
                  position_x: 0,
                  position_y: 0,
                  width: 180,
                  height: 160,
                  content: {
                    viewport: { lat, lng, zoom: 17 },
                    overlays: ['buildings'],
                  },
                });
                setBuildingDialogVisible(false);
                setBuildingPinSnackbar(true);
              }}
            >
              Pin to whiteboard
            </Button>
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
            <Button icon="office-building" onPress={handleLongPressMultiDwelling}>Multi-Dwelling</Button>
          </Dialog.Actions>
        </Dialog>

        <BuildingActivityDialog
          visible={multiDwellingDialog.visible}
          onDismiss={() => setMultiDwellingDialog(prev => ({ ...prev, visible: false }))}
          initialAddress={multiDwellingDialog.address}
          initialLatitude={multiDwellingDialog.latitude}
          initialLongitude={multiDwellingDialog.longitude}
          sessionId={null}
          initialMode="declare"
        />
      </Portal>

      <TerritoryBriefingCard
        visible={briefingVisible}
        onDismiss={() => setBriefingVisible(false)}
        briefing={activeBriefing}
      />

      <Snackbar
        visible={buildingPinSnackbar}
        onDismiss={() => setBuildingPinSnackbar(false)}
        duration={3500}
        action={{ label: 'Open', onPress: () => router.push('/whiteboard') }}
      >
        Pinned to whiteboard
      </Snackbar>
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
    // No fixed height — Paper's Chip sizes to its content + padding.
    // Fixed-height clipped text descenders on tags ("Friendly", "Hot", etc).
  },
  editFilterChip: {
    // Same — no fixed height.
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
    // No fixed height — was clipping text.
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
