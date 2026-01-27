import { useState, useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, Dimensions } from 'react-native';
import { FAB, Portal, useTheme, Chip, Surface, Text } from 'react-native-paper';
import { useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE, MapPressEvent } from 'react-native-maps';
import Constants from 'expo-constants';
import { useCRMStore } from '../../lib/store';
import { Contact } from '../../lib/types';
import FilterSheet from '../../components/FilterSheet';
import ContactPreview from '../../components/ContactPreview';

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

  const handleRegionChange = useCallback((region: any) => {
    setMapRegion(region);
  }, [setMapRegion]);

  const handleAddContact = useCallback(() => {
    router.push('/contact/new');
  }, [router]);

  const reverseGeocode = useCallback(async (lat: number, lng: number): Promise<string> => {
    try {
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        return data.results[0].formatted_address;
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
    }
    return '';
  }, []);

  const handleMapLongPress = useCallback(async (event: MapPressEvent) => {
    const { latitude, longitude } = event.nativeEvent.coordinate;
    setPendingMarker({ latitude, longitude });
    
    // Reverse geocode to get address
    const address = await reverseGeocode(latitude, longitude);
    
    // Navigate to new contact with pre-filled location
    router.push({
      pathname: '/contact/new',
      params: {
        lat: latitude.toString(),
        lng: longitude.toString(),
        address: address,
      },
    });
    
    // Clear pending marker after navigation
    setTimeout(() => setPendingMarker(null), 500);
  }, [router, reverseGeocode]);

  const handleViewContact = useCallback(() => {
    if (selectedContact) {
      setPreviewVisible(false);
      router.push(`/contact/${selectedContact.id}`);
    }
  }, [selectedContact, router]);

  const getMarkerColor = useCallback((contact: Contact) => {
    return contact.tag?.color || theme.colors.primary;
  }, [theme.colors.primary]);

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
      </MapView>

      {selectedTags.length > 0 && (
        <Surface style={styles.filterChips} elevation={2}>
          <Text variant="labelSmall" style={styles.filterLabel}>Filtered by:</Text>
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
        icon="filter"
        style={[styles.filterFab, { backgroundColor: theme.colors.secondaryContainer }]}
        color={theme.colors.onSecondaryContainer}
        onPress={() => setFilterVisible(true)}
      />

      <FAB
        icon="plus"
        style={[styles.addFab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={handleAddContact}
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
  filterFab: {
    position: 'absolute',
    right: 16,
    bottom: 96,
  },
  addFab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
  filterChips: {
    position: 'absolute',
    top: 16,
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
