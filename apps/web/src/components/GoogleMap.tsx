'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import type { Contact, SuburbBoundary } from '@realestate-crm/types';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const loader = new Loader({
  apiKey: GOOGLE_MAPS_API_KEY,
  version: 'weekly',
});

function createColoredIconUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export interface GoogleMapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface GoogleMapProps {
  contacts: Contact[];
  center: [number, number];
  zoom: number;
  suburbBoundary: SuburbBoundary | null;
  userLocation?: { lat: number; lng: number } | null;
  pendingMarker?: { lat: number; lng: number } | null;
  onSelectContact: (contact: Contact) => void;
  onRegionChange?: (lat: number, lng: number, zoom: number) => void;
  onContextMenu?: (lat: number, lng: number) => void;
}

export default forwardRef<GoogleMapHandle, GoogleMapProps>(function GoogleMap(
  {
    contacts,
    center,
    zoom,
    suburbBoundary,
    userLocation,
    pendingMarker,
    onSelectContact,
    onRegionChange,
    onContextMenu,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const labelRef = useRef<google.maps.Marker | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);
  const pendingMarkerRef = useRef<google.maps.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const onSelectRef = useRef(onSelectContact);
  const onRegionChangeRef = useRef(onRegionChange);
  const onContextMenuRef = useRef(onContextMenu);
  onSelectRef.current = onSelectContact;
  onRegionChangeRef.current = onRegionChange;
  onContextMenuRef.current = onContextMenu;

  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, z?: number) => {
      const map = mapRef.current;
      if (!map) return;
      map.panTo({ lat, lng });
      if (z != null) map.setZoom(z);
    },
  }));

  // Init map (async — Google Maps API loads on demand)
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;

    loader.importLibrary('maps').then(({ Map, InfoWindow }) => {
      if (cancelled || !containerRef.current) return;

      const map = new Map(containerRef.current, {
        center: { lat: center[0], lng: center[1] },
        zoom,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: {
          position: google.maps.ControlPosition.TOP_RIGHT,
        },
      });

      mapRef.current = map;
      infoWindowRef.current = new InfoWindow();

      map.addListener('idle', () => {
        const c = map.getCenter();
        if (c) {
          onRegionChangeRef.current?.(c.lat(), c.lng(), map.getZoom() || zoom);
        }
      });

      map.addListener('rightclick', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) {
          onContextMenuRef.current?.(e.latLng.lat(), e.latLng.lng());
        }
      });

      setMapReady(true);
    });

    return () => {
      cancelled = true;
      markersRef.current.forEach((m) => m.setMap(null));
      markersRef.current = [];
      polygonRef.current?.setMap(null);
      polygonRef.current = null;
      labelRef.current?.setMap(null);
      labelRef.current = null;
      userMarkerRef.current?.setMap(null);
      userMarkerRef.current = null;
      pendingMarkerRef.current?.setMap(null);
      pendingMarkerRef.current = null;
      infoWindowRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    // Clear old
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    const infoWindow = infoWindowRef.current;

    contacts.forEach((contact) => {
      if (!contact.latitude || !contact.longitude) return;

      const color = contact.tag?.color || '#3B82F6';
      const name = [contact.first_name, contact.last_name]
        .filter(Boolean)
        .join(' ');

      const marker = new google.maps.Marker({
        position: { lat: contact.latitude, lng: contact.longitude },
        map,
        icon: {
          url: createColoredIconUrl(color),
          scaledSize: new google.maps.Size(24, 36),
          anchor: new google.maps.Point(12, 36),
        },
        title: name,
      });

      marker.addListener('click', () => {
        onSelectRef.current(contact);
        if (infoWindow) {
          infoWindow.setContent(
            `<div style="font-size:13px"><strong>${name}</strong>${
              contact.address
                ? `<p style="margin:4px 0 0;color:#6b7280">${contact.address}</p>`
                : ''
            }${
              contact.tag
                ? `<span style="display:inline-block;margin-top:4px;padding:1px 8px;border-radius:9999px;font-size:11px;color:white;background:${contact.tag.color}">${contact.tag.name}</span>`
                : ''
            }</div>`
          );
          infoWindow.open(map, marker);
        }
      });

      markersRef.current.push(marker);
    });
  }, [mapReady, contacts]);

  // Sync suburb boundary polygon
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    polygonRef.current?.setMap(null);
    polygonRef.current = null;
    labelRef.current?.setMap(null);
    labelRef.current = null;

    if (suburbBoundary && suburbBoundary.coordinates.length > 0) {
      const path = suburbBoundary.coordinates.map((c) => ({
        lat: c.latitude,
        lng: c.longitude,
      }));

      polygonRef.current = new google.maps.Polygon({
        paths: path,
        strokeColor: '#000000',
        strokeWeight: 3,
        fillColor: '#000000',
        fillOpacity: 0.03,
        map,
      });

      // Label at polygon center
      const bounds = new google.maps.LatLngBounds();
      path.forEach((p) => bounds.extend(p));

      labelRef.current = new google.maps.Marker({
        position: bounds.getCenter(),
        map,
        icon: {
          url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>')}`,
          scaledSize: new google.maps.Size(1, 1),
        },
        label: {
          text: suburbBoundary.name,
          fontSize: '11px',
          fontWeight: '600',
          color: '#374151',
        },
        clickable: false,
      });
    }
  }, [mapReady, suburbBoundary]);

  // Sync user location marker (blue dot)
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    userMarkerRef.current?.setMap(null);
    userMarkerRef.current = null;

    if (userLocation) {
      const blueDotSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
        <circle cx="12" cy="12" r="11" fill="rgba(66,133,244,0.2)" stroke="#4285F4" stroke-width="2"/>
        <circle cx="12" cy="12" r="5" fill="#4285F4"/>
      </svg>`;

      userMarkerRef.current = new google.maps.Marker({
        position: { lat: userLocation.lat, lng: userLocation.lng },
        map,
        icon: {
          url: `data:image/svg+xml,${encodeURIComponent(blueDotSvg)}`,
          scaledSize: new google.maps.Size(24, 24),
          anchor: new google.maps.Point(12, 12),
        },
        title: 'Your location',
        clickable: false,
        zIndex: 999,
      });
    }
  }, [mapReady, userLocation]);

  // Sync pending marker (orange pin for right-click)
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    pendingMarkerRef.current?.setMap(null);
    pendingMarkerRef.current = null;

    if (pendingMarker) {
      pendingMarkerRef.current = new google.maps.Marker({
        position: { lat: pendingMarker.lat, lng: pendingMarker.lng },
        map,
        icon: {
          url: createColoredIconUrl('#FF9800'),
          scaledSize: new google.maps.Size(24, 36),
          anchor: new google.maps.Point(12, 36),
        },
        opacity: 0.7,
        clickable: false,
        zIndex: 1000,
      });
    }
  }, [mapReady, pendingMarker]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ height: '100%', width: '100%' }}
    />
  );
});
