'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useCRMStore } from '@realestate-crm/hooks';
import type { PlacePrediction } from '@realestate-crm/types';

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || '';

interface MapSearchBarProps {
  onLocationSelect: (lat: number, lng: number, name: string) => void;
}

export default function MapSearchBar({ onLocationSelect }: MapSearchBarProps) {
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const savedSuburbs = useCRMStore((s) => s.savedSuburbs);
  const addSavedSuburb = useCRMStore((s) => s.addSavedSuburb);
  const removeSavedSuburb = useCRMStore((s) => s.removeSavedSuburb);

  const [lastSelectedLocation, setLastSelectedLocation] = useState<{
    name: string;
    lat: number;
    lng: number;
  } | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchPlaces = useCallback(async (text: string) => {
    if (!text || text.length < 2 || !GOOGLE_PLACES_API_KEY) {
      setPredictions([]);
      return;
    }

    setIsLoading(true);
    try {
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
        const transformed: PlacePrediction[] = data.suggestions
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
    setLastSelectedLocation(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(text), 300);
  };

  const getPlaceDetails = async (placeId: string) => {
    if (!GOOGLE_PLACES_API_KEY) return null;

    try {
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
          lat: data.location.latitude,
          lng: data.location.longitude,
        };
      }
      return null;
    } catch (error) {
      console.error('Place details error:', error);
      return null;
    }
  };

  const handleSelectPlace = async (prediction: PlacePrediction) => {
    setQuery(prediction.structured_formatting.main_text);
    setShowResults(false);
    setPredictions([]);

    const details = await getPlaceDetails(prediction.place_id);
    if (details) {
      const name = details.name || prediction.structured_formatting.main_text;
      setLastSelectedLocation({ name, lat: details.lat, lng: details.lng });
      onLocationSelect(details.lat, details.lng, name);
    }
  };

  const handleSavedSuburbClick = (suburb: { latitude: number; longitude: number; name: string }) => {
    setQuery(suburb.name);
    onLocationSelect(suburb.latitude, suburb.longitude, suburb.name);
  };

  const handleSaveCurrentLocation = () => {
    if (!lastSelectedLocation) return;
    const alreadySaved = savedSuburbs.some(
      (s) => s.name.toLowerCase() === lastSelectedLocation.name.toLowerCase()
    );
    if (!alreadySaved) {
      addSavedSuburb({
        name: lastSelectedLocation.name,
        latitude: lastSelectedLocation.lat,
        longitude: lastSelectedLocation.lng,
      });
    }
  };

  const isCurrentLocationSaved = lastSelectedLocation
    ? savedSuburbs.some((s) => s.name.toLowerCase() === lastSelectedLocation.name.toLowerCase())
    : false;

  return (
    <div ref={containerRef} className="absolute left-4 right-80 top-4 z-[1000]">
      {/* Search input row */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => handleTextChange(e.target.value)}
            onFocus={() => predictions.length > 0 && setShowResults(true)}
            placeholder="Search suburb or address..."
            className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-10 pr-3 text-sm shadow-md focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-primary-500" />
            </div>
          )}
        </div>

        {/* Bookmark button */}
        {lastSelectedLocation && !isCurrentLocationSaved && (
          <button
            onClick={handleSaveCurrentLocation}
            className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600 shadow-md hover:bg-primary-100"
            title="Save this location"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
            </svg>
          </button>
        )}
      </div>

      {/* Saved suburbs chips */}
      {savedSuburbs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {savedSuburbs.map((suburb) => (
            <button
              key={suburb.id}
              onClick={() => handleSavedSuburbClick(suburb)}
              className="group flex items-center gap-1 rounded-full border border-gray-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              {suburb.name}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  removeSavedSuburb(suburb.id);
                }}
                className="ml-0.5 hidden rounded-full p-0.5 text-gray-400 hover:text-red-500 group-hover:inline-flex"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search results dropdown */}
      {showResults && predictions.length > 0 && (
        <div className="mt-1 max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              onClick={() => handleSelectPlace(prediction)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
            >
              <svg
                className="h-5 w-5 shrink-0 text-primary-500"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">
                  {prediction.structured_formatting.main_text}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {prediction.structured_formatting.secondary_text}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
