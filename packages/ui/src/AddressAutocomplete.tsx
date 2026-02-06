import { useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, View, FlatList, TouchableOpacity } from 'react-native';
import { TextInput, Text, Surface, useTheme, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { PlacePrediction, PlaceDetails } from '@realestate-crm/types';

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

interface AddressAutocompleteProps {
  value: string;
  onAddressSelect: (address: string, lat: number, lng: number) => void;
  style?: object;
}

export default function AddressAutocomplete({
  value,
  onAddressSelect,
  style,
}: AddressAutocompleteProps) {
  const theme = useTheme();
  const [query, setQuery] = useState(value);

  // Sync with value prop when it changes (e.g., from reverse geocoding)
  useEffect(() => {
    if (value && value !== query) {
      setQuery(value);
    }
  }, [value]);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchPlaces = useCallback(async (text: string) => {
    if (!text || text.length < 3 || !GOOGLE_PLACES_API_KEY) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Using Places API (New)
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
            includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
            languageCode: 'en',
          }),
        }
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
        setShowResults(true);
      } else {
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

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      searchPlaces(text);
    }, 300);
  };

  const getPlaceDetails = async (placeId: string): Promise<PlaceDetails | null> => {
    if (!GOOGLE_PLACES_API_KEY) return null;

    try {
      // Using Places API (New)
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}`,
        {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'formattedAddress,location',
          },
        }
      );
      const data = await response.json();

      if (data.location) {
        return {
          formatted_address: data.formattedAddress || '',
          geometry: {
            location: {
              lat: data.location.latitude,
              lng: data.location.longitude,
            },
          },
        };
      }
      return null;
    } catch (error) {
      console.error('Place details error:', error);
      return null;
    }
  };

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    setQuery(prediction.description);
    setShowResults(false);
    setPredictions([]);

    const details = await getPlaceDetails(prediction.place_id);
    if (details) {
      onAddressSelect(
        details.formatted_address,
        details.geometry.location.lat,
        details.geometry.location.lng
      );
    } else {
      // Fallback: use the description without coordinates
      onAddressSelect(prediction.description, 0, 0);
    }
  };

  const handleFocus = () => {
    if (predictions.length > 0) {
      setShowResults(true);
    }
  };

  const handleBlur = () => {
    // Delay hiding to allow tap on results
    setTimeout(() => setShowResults(false), 200);
  };

  return (
    <View style={[styles.container, style]}>
      <TextInput
        label="Address"
        value={query}
        onChangeText={handleTextChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        mode="outlined"
        right={
          isLoading ? (
            <TextInput.Icon icon={() => <ActivityIndicator size={18} />} />
          ) : (
            <TextInput.Icon icon="map-marker" />
          )
        }
      />

      {!GOOGLE_PLACES_API_KEY && (
        <Text variant="bodySmall" style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}>
          Set GOOGLE_PLACES_API_KEY for address autocomplete
        </Text>
      )}

      {showResults && predictions.length > 0 && (
        <Surface style={styles.resultsContainer} elevation={3}>
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
                  color={theme.colors.onSurfaceVariant}
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
    zIndex: 1000,
  },
  hint: {
    marginTop: 4,
    marginLeft: 4,
  },
  resultsContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    borderRadius: 8,
    maxHeight: 200,
    zIndex: 1001,
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
