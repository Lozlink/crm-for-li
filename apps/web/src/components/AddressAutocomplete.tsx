'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

const GOOGLE_PLACES_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || '';

interface PlacePrediction {
  place_id: string;
  description: string;
  main_text: string;
  secondary_text: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  onSelect: (address: string, lat: number, lng: number) => void;
  className?: string;
  placeholder?: string;
}

export default function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  className,
  placeholder = 'Search address...',
}: AddressAutocompleteProps) {
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchPlaces = useCallback(async (text: string) => {
    if (!text || text.length < 3 || !GOOGLE_PLACES_API_KEY) {
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
            includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
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
            main_text: s.placePrediction.structuredFormat?.mainText?.text || '',
            secondary_text: s.placePrediction.structuredFormat?.secondaryText?.text || '',
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    onChange(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchPlaces(text), 300);
  };

  const handleSelect = async (prediction: PlacePrediction) => {
    onChange(prediction.description);
    setShowResults(false);
    setPredictions([]);

    if (!GOOGLE_PLACES_API_KEY) {
      onSelect(prediction.description, 0, 0);
      return;
    }

    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${prediction.place_id}`,
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
        const formatted = data.formattedAddress || prediction.description;
        onChange(formatted);
        onSelect(formatted, data.location.latitude, data.location.longitude);
      } else {
        onSelect(prediction.description, 0, 0);
      }
    } catch (error) {
      console.error('Place details error:', error);
      onSelect(prediction.description, 0, 0);
    }
  };

  if (!GOOGLE_PLACES_API_KEY) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onFocus={() => predictions.length > 0 && setShowResults(true)}
          className={className}
          placeholder={placeholder}
        />
        {isLoading && (
          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
            <svg className="h-4 w-4 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        )}
      </div>

      {showResults && predictions.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {predictions.map((prediction) => (
            <button
              key={prediction.place_id}
              type="button"
              className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(prediction)}
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900">
                  {prediction.main_text}
                </p>
                <p className="truncate text-xs text-gray-500">
                  {prediction.secondary_text}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
