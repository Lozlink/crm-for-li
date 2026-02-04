import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { FAB, Portal, useTheme, Chip, Surface, Text, Dialog, Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE, MapPressEvent, LongPressEvent, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import Constants from 'expo-constants';
import { useCRMStore } from '@realestate-crm/hooks';
import { Contact, SuburbBoundary  } from '@realestate-crm/types';
import { fetchSuburbByName} from '@realestate-crm/api';
import { FilterSheet } from '@realestate-crm/ui';
import { ContactPreview } from '@realestate-crm/ui';
import { MapSearchBar } from '@realestate-crm/ui';

const { width, height } = Dimensions.get('window');

const GOOGLE_MAPS_API_KEY = Constants.expoConfig?.extra?.googleMapsApiKey || 
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

export default function MapScreen() {
  const theme = useTheme();
  const router = useRouter();
  const mapRef = useRef<MapView>(null);

  const contacts = useCRMStore(state => state.contacts);
  const mapRegion = useCRMStore(state => state.mapRegion);
  const setMapRegion = useCRMStore(state => state.setMapRegion);
  const selectedTagIds = useCRMStore(state => state.selectedTagIds);
  const tags = useCRMStore(state => state.tags);

  const [filterVisible, setFilterVisible] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
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
        // Find the suburb/locality component
        const components = data.results[0].address_components;
        const suburb = components.find((c: any) => 
          c.types.includes('locality') || c.types.includes('sublocality')
        );
        return suburb?.long_name || null;
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
      if (selectedTagIds.length > 0 && !selectedTagIds.includes(contact.tag_id || '')) {
        return false;
      }
      return true;
    });
  }, [contacts, selectedTagIds]);

  const selectedTags = useMemo(() => {
    return tags.filter(t => selectedTagIds.includes(t.id));
  }, [tags, selectedTagIds]);

  const handleMarkerPress = useCallback((contact: Contact) => {
    setSelectedContact(contact);
    setPreviewVisible(true);
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
      console.log('Geocoding response:', data.status, data.error_message || data.results?.[0]?.formatted_address);
      if (data.results && data.results[0]) {
        return data.results[0].formatted_address;
      }
      if (data.error_message) {
        console.error('Geocoding API error:', data.error_message);
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
    return '';
  }, []);

  const handleAddQuickNote = useCallback(async () => {
    setFabOpen(false);
    // Get center of current map view
    const center = mapRegion;
    const address = await reverseGeocode(center.latitude, center.longitude);
    
    router.push({
      pathname: '/contact/new',
      params: {
        lat: center.latitude.toString(),
        lng: center.longitude.toString(),
        address: address,
        quickNote: 'true', // Flag to show minimal form
      },
    });
  }, [mapRegion, reverseGeocode, router]);

  const handleMapLongPress = useCallback(async (event: LongPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setPendingMarker({ latitude, longitude });
    
    // Reverse geocode to get address
    const address = await reverseGeocode(latitude, longitude);
    
    // Show dialog to choose action
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
    
    // Clear pending marker after navigation
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

  const getMarkerColor = useCallback((contact: Contact) => {
    return contact.tag?.color || theme.colors.primary;
  }, [theme.colors.primary]);

  const handleSearchLocationSelect = useCallback((lat: number, lng: number, name: string) => {
    const newRegion = {
      latitude: lat,
      longitude: lng,
      latitudeDelta: 0.04, // Suburb-level zoom (shows whole suburb)
      longitudeDelta: 0.04,
    };
    setMapRegion(newRegion);
    mapRef.current?.animateToRegion(newRegion, 500);
    
    // Fetch boundary for the searched suburb
    fetchSuburbBoundary(name);
  }, [setMapRegion, fetchSuburbBoundary]);

  const handleCenterOnUser = useCallback(async () => {
    let location = userLocation;
    
    if (!location) {
      // Try to get fresh location
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
    
    // Fetch suburb boundary for user's location
    const suburbName = await getSuburbFromCoords(location.latitude, location.longitude);
    if (suburbName) {
      fetchSuburbBoundary(suburbName);
    }
  }, [userLocation, getSuburbFromCoords, fetchSuburbBoundary]);

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
        {mappedContacts.map((contact) => (
          <Marker
            key={contact.id}
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
        {pendingMarker && (
          <Marker
            coordinate={pendingMarker}
            pinColor="#FF9800"
            opacity={0.7}
          />
        )}
        {/* User location marker */}
        {userLocation && (
          <Marker
            coordinate={userLocation}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={styles.userMarker}>
              <View style={styles.userMarkerDot} />
            </View>
          </Marker>
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

      <FAB
        icon="crosshairs-gps"
        style={[styles.locationFab, { backgroundColor: theme.colors.surface }]}
        color={theme.colors.primary}
        onPress={handleCenterOnUser}
        size="small"
      />

      <FAB
        icon="filter"
        style={[styles.filterFab, { backgroundColor: theme.colors.secondaryContainer }]}
        color={theme.colors.onSecondaryContainer}
        onPress={() => setFilterVisible(true)}
      />

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
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        style={styles.fabGroup}
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
  locationFab: {
    position: 'absolute',
    right: 16,
    bottom: 190,
  },
  filterFab: {
    position: 'absolute',
    right: 16,
    bottom: 130,
  },
  fabGroup: {
    position: 'absolute',
    right: 0,
    bottom: 0,
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
  userMarker: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(66, 133, 244, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#4285F4',
  },
  userMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4285F4',
  },
});
