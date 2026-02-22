'use client';

import { useRef, useEffect, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import type { RouteStop } from '@realestate-crm/types';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';
const loader = new Loader({ apiKey: GOOGLE_MAPS_API_KEY, version: 'weekly' });

interface RouteMapProps {
  stops: RouteStop[];
  polylinePoints: { latitude: number; longitude: number }[];
}

const STOP_COLORS: Record<string, string> = {
  pending: '#6B7280',
  visited: '#16A34A',
  skipped: '#F97316',
};

export default function RouteMap({ stops, polylinePoints }: RouteMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    loader.importLibrary('maps').then(({ Map }) => {
      if (cancelled || !containerRef.current) return;
      const firstStop = stops[0];
      const center = firstStop
        ? { lat: firstStop.latitude, lng: firstStop.longitude }
        : { lat: -33.8688, lng: 151.2093 };
      const map = new Map(containerRef.current, {
        center,
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;
      setMapReady(true);
    });
    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const bounds = new google.maps.LatLngBounds();
    stops.forEach((stop, i) => {
      if (!stop.latitude || !stop.longitude) return;
      const pos = { lat: stop.latitude, lng: stop.longitude };
      bounds.extend(pos);
      const color = STOP_COLORS[stop.status] || '#6B7280';
      const label = `${i + 1}`;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40" width="28" height="40">
        <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}"/>
        <text x="14" y="17" text-anchor="middle" fill="white" font-size="12" font-weight="bold" font-family="Arial">${label}</text>
      </svg>`;
      const marker = new google.maps.Marker({
        position: pos,
        map,
        icon: {
          url: `data:image/svg+xml,${encodeURIComponent(svg)}`,
          scaledSize: new google.maps.Size(28, 40),
          anchor: new google.maps.Point(14, 40),
        },
        title: stop.address || `Stop ${label}`,
      });
      markersRef.current.push(marker);
    });
    if (stops.length > 0) map.fitBounds(bounds, 60);
  }, [mapReady, stops]);

  // Sync polyline
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    if (polylinePoints.length > 1) {
      polylineRef.current = new google.maps.Polyline({
        path: polylinePoints.map((p) => ({ lat: p.latitude, lng: p.longitude })),
        strokeColor: '#4F46E5',
        strokeWeight: 4,
        strokeOpacity: 0.8,
        map,
      });
    }
  }, [mapReady, polylinePoints]);

  return <div ref={containerRef} className="h-full w-full" style={{ minHeight: '400px' }} />;
}
