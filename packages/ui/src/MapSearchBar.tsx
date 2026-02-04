import { useState, useCallback, useRef } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity, ScrollView, Keyboard } from 'react-native';
import { Searchbar, Text, Surface, useTheme, Chip, IconButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { PlacePrediction } from '@realestate-crm/types';
import { useCRMStore } from '@realestate-crm/hooks';

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

interface MapSearchBarProps {
  onLocationSelect: (lat: number, lng: number, name: string) => void;
}

export default function MapSearchBar({ onLocationSelect }: MapSearchBarProps) {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const savedSuburbs = useCRMStore(state => state.savedSuburbs);
  const addSavedSuburb = useCRMStore(state => state.addSavedSuburb);
  const removeSavedSuburb = useCRMStore(state => state.removeSavedSuburb);

  const [lastSelectedLocation, setLastSelectedLocation] = useState<{
    name: string;
    lat: number;
    lng: number;
  } | null>(null);

  const searchPlaces = useCallback(async (text: string) => {
    if (!text || text.length < 2 || !GOOGLE_PLACES_API_KEY) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Using Places API (New) - Autocomplete endpoint
      const response = await fetch(
        'https://places.googleapis.com/v1/places:autocomplete',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
          },
          body: JSON.stringify({
            input: text,
            includedRegionCodes: ['au'],
            languageCode: 'en',
          }),
        }
      );
      const data = await response.json();

      if (data.suggestions) {
        // Transform new API response to match our interface
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
        setShowResults(true);
      } else {
        console.log('Places API (New) response:', data);
        setPredictions([]);
      }
    } catch (error) {
      console.error('Places autocomplete error:', error);
      setPredictions([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleTextChange = (text: string) => {
    setQuery(text);
    setLastSelectedLocation(null);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchPlaces(text);
    }, 300);
  };

  const getPlaceDetails = async (placeId: string) => {
    if (!GOOGLE_PLACES_API_KEY) return null;

    try {
      // Using Places API (New) - Place Details endpoint
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}`,
        {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'displayName,formattedAddress,location',
          },
        }
      );
      const data = await response.json();

      if (data.location) {
        return {
          name: data.displayName?.text || '',
          formatted_address: data.formattedAddress || '',
          geometry: {
            location: {
              lat: data.location.latitude,
              lng: data.location.longitude,
            },
          },
        };
      }
      console.log('Place details response:', data);
      return null;
    } catch (error) {
      console.error('Place details error:', error);
      return null;
    }
  };

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    Keyboard.dismiss();
    setQuery(prediction.structured_formatting.main_text);
    setShowResults(false);
    setPredictions([]);

    const details = await getPlaceDetails(prediction.place_id);
    if (details) {
      const name = details.name || prediction.structured_formatting.main_text;
      const lat = details.geometry.location.lat;
      const lng = details.geometry.location.lng;
      
      setLastSelectedLocation({ name, lat, lng });
      onLocationSelect(lat, lng, name);
    }
  };

  const handleSavedSuburbPress = (suburb: { latitude: number; longitude: number; name: string }) => {
    Keyboard.dismiss();
    setQuery(suburb.name);
    onLocationSelect(suburb.latitude, suburb.longitude, suburb.name);
  };

  const handleSaveCurrentLocation = () => {
    if (lastSelectedLocation) {
      // Check if already saved
      const alreadySaved = savedSuburbs.some(
        s => s.name.toLowerCase() === lastSelectedLocation.name.toLowerCase()
      );
      if (!alreadySaved) {
        addSavedSuburb({
          name: lastSelectedLocation.name,
          latitude: lastSelectedLocation.lat,
          longitude: lastSelectedLocation.lng,
        });
      }
    }
  };

  const isCurrentLocationSaved = lastSelectedLocation
    ? savedSuburbs.some(s => s.name.toLowerCase() === lastSelectedLocation.name.toLowerCase())
    : false;

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <Searchbar
          placeholder="Search suburb or address..."
          value={query}
          onChangeText={handleTextChange}
          onFocus={() => predictions.length > 0 && setShowResults(true)}
          style={styles.searchbar}
          loading={isLoading}
          icon="magnify"
        />
        {lastSelectedLocation && !isCurrentLocationSaved && (
          <IconButton
            icon="bookmark-plus-outline"
            mode="contained"
            containerColor={theme.colors.primaryContainer}
            iconColor={theme.colors.onPrimaryContainer}
            size={20}
            onPress={handleSaveCurrentLocation}
            style={styles.saveButton}
          />
        )}
      </View>

      {/* Saved suburbs chips */}
      {savedSuburbs.length > 0 && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.chipsContainer}
          contentContainerStyle={styles.chipsContent}
        >
          {savedSuburbs.map(suburb => (
            <Chip
              key={suburb.id}
              mode="outlined"
              compact
              onPress={() => handleSavedSuburbPress(suburb)}
              onClose={() => removeSavedSuburb(suburb.id)}
              style={styles.chip}
              textStyle={styles.chipText}
            >
              {suburb.name}
            </Chip>
          ))}
        </ScrollView>
      )}

      {/* Search results dropdown */}
      {showResults && predictions.length > 0 && (
        <Surface style={styles.resultsContainer} elevation={4}>
          <FlatList
            data={predictions}
            keyExtractor={(item) => item.place_id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelectPlace(item)}
                style={styles.resultItem}
              >
                <Icon
                  name="map-marker"
                  size={20}
                  color={theme.colors.primary}
                  style={styles.resultIcon}
                />
                <View style={styles.resultText}>
                  <Text variant="bodyMedium" numberOfLines={1}>
                    {item.structured_formatting.main_text}
                  </Text>
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={{ color: theme.colors.onSurfaceVariant }}
                  >
                    {item.structured_formatting.secondary_text}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            keyboardShouldPersistTaps="handled"
            style={styles.resultsList}
          />
        </Surface>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    zIndex: 1000,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchbar: {
    flex: 1,
    elevation: 4,
  },
  saveButton: {
    margin: 0,
  },
  chipsContainer: {
    marginTop: 8,
    maxHeight: 40,
  },
  chipsContent: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
  },
  chipText: {
    fontSize: 12,
  },
  resultsContainer: {
    marginTop: 4,
    borderRadius: 8,
    maxHeight: 250,
    overflow: 'hidden',
  },
  resultsList: {
    borderRadius: 8,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  resultIcon: {
    marginRight: 12,
  },
  resultText: {
    flex: 1,
  },
});
