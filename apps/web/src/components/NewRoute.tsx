'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useRouteStore } from '@realestate-crm/hooks';
import { fetchOptimizedRoute } from '@realestate-crm/api';
import type { RouteMode, RouteStop } from '@realestate-crm/types';
import AddressAutocomplete from './AddressAutocomplete';

const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false });

interface PendingStop {
  tempId: string;
  address: string;
  latitude: number;
  longitude: number;
}

let nextTempId = 1;
function makeTempId(): string {
  return `temp-${nextTempId++}`;
}

export default function NewRoute() {
  const router = useRouter();
  const createRoute = useRouteStore((s) => s.createRoute);

  const [name, setName] = useState('');
  const [mode, setMode] = useState<RouteMode>('driving');
  const [stops, setStops] = useState<PendingStop[]>([]);
  const [addressInput, setAddressInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddressSelect = useCallback(
    (address: string, lat: number, lng: number) => {
      if (lat == null || lng == null) return;
      setStops((prev) => [
        ...prev,
        { tempId: makeTempId(), address, latitude: lat, longitude: lng },
      ]);
      setAddressInput('');
    },
    []
  );

  const handleRemoveStop = useCallback((tempId: string) => {
    setStops((prev) => prev.filter((s) => s.tempId !== tempId));
  }, []);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    setStops((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }, []);

  const handleMoveDown = useCallback((index: number) => {
    setStops((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }, []);

  const handleOptimize = async () => {
    if (stops.length < 3) {
      setError('Need at least 3 stops to optimize order.');
      return;
    }

    setOptimizing(true);
    setError(null);

    try {
      const origin = { latitude: stops[0].latitude, longitude: stops[0].longitude };
      const destination = {
        latitude: stops[stops.length - 1].latitude,
        longitude: stops[stops.length - 1].longitude,
      };
      const waypoints = stops.slice(1, -1).map((s) => ({
        latitude: s.latitude,
        longitude: s.longitude,
      }));

      const result = await fetchOptimizedRoute(origin, destination, waypoints, mode);

      if (!result) {
        setError('Could not optimize route. Check your API key configuration.');
        return;
      }

      if (result.optimizedOrder.length > 0) {
        const middleStops = stops.slice(1, -1);
        const reordered = result.optimizedOrder.map((i) => middleStops[i]);
        setStops([stops[0], ...reordered, stops[stops.length - 1]]);
      }
    } catch (err) {
      setError('Failed to optimize route. Please try again.');
      console.error('Optimize error:', err);
    } finally {
      setOptimizing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Please enter a route name.');
      return;
    }
    if (stops.length < 2) {
      setError('Add at least 2 stops to create a route.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const routeStops = stops.map((s, i) => ({
        position: i,
        address: s.address,
        latitude: s.latitude,
        longitude: s.longitude,
        status: 'pending' as const,
      }));

      const created = await createRoute(
        { name: name.trim(), status: 'planned', mode },
        routeStops
      );

      if (created) {
        router.push(`/routes/${created.id}`);
      } else {
        setError('Failed to create route. Please try again.');
      }
    } catch (err) {
      setError('An error occurred while creating the route.');
      console.error('Create route error:', err);
    } finally {
      setSaving(false);
    }
  };

  // Convert pending stops to RouteStop-like objects for the map
  const mapStops: RouteStop[] = stops.map((s, i) => ({
    id: s.tempId,
    route_id: '',
    position: i,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    status: 'pending' as const,
  }));

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="w-96 shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
        <div className="p-4">
          {/* Breadcrumb */}
          <Link href="/routes" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
            Routes
          </Link>

          <h1 className="mb-4 text-xl font-bold text-gray-900">New Route</h1>

          {/* Route name */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Route Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Morning Canvassing"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
            />
          </div>

          {/* Mode toggle */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Travel Mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('driving')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'driving'
                    ? 'bg-primary-500 text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Driving
              </button>
              <button
                onClick={() => setMode('walking')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'walking'
                    ? 'bg-primary-500 text-white'
                    : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Walking
              </button>
            </div>
          </div>

          {/* Add stop */}
          <div className="mb-4">
            <label className="mb-1 block text-sm font-medium text-gray-700">Add Stop</label>
            <AddressAutocomplete
              value={addressInput}
              onChange={setAddressInput}
              onSelect={handleAddressSelect}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
              placeholder="Search for an address..."
            />
          </div>

          {/* Optimize button */}
          {stops.length >= 3 && (
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {optimizing ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Optimizing...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
                  </svg>
                  Optimize Order
                </>
              )}
            </button>
          )}

          {/* Stops list */}
          {stops.length > 0 && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Stops ({stops.length})
              </h2>
              <div className="mb-4 space-y-2">
                {stops.map((stop, i) => (
                  <div
                    key={stop.tempId}
                    className="flex items-center gap-2 rounded-lg border border-gray-100 p-2.5"
                  >
                    {/* Numbered badge */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                      {i + 1}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
                      {stop.address}
                    </p>
                    {/* Reorder & remove buttons */}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() => handleMoveUp(i)}
                        disabled={i === 0}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-25"
                        title="Move up"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleMoveDown(i)}
                        disabled={i === stops.length - 1}
                        className="rounded p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-25"
                        title="Move down"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleRemoveStop(stop.tempId)}
                        className="rounded p-0.5 text-gray-400 hover:text-red-500"
                        title="Remove stop"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Error display */}
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Create button */}
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || stops.length < 2}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Creating...
              </>
            ) : (
              'Create Route'
            )}
          </button>
        </div>
      </div>

      {/* Right panel — Map preview */}
      <div className="flex-1">
        <RouteMap stops={mapStops} polylinePoints={[]} />
      </div>
    </div>
  );
}
