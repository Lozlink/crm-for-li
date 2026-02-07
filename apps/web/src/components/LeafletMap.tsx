'use client';

import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Contact, SuburbBoundary } from '@realestate-crm/types';

function createColoredIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="12" r="5" fill="white"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

export interface LeafletMapHandle {
  flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface LeafletMapProps {
  contacts: Contact[];
  center: [number, number];
  zoom: number;
  suburbBoundary: SuburbBoundary | null;
  onSelectContact: (contact: Contact) => void;
  onRegionChange?: (lat: number, lng: number, zoom: number) => void;
  onContextMenu?: (lat: number, lng: number) => void;
}

export default forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(
  {
    contacts,
    center,
    zoom,
    suburbBoundary,
    onSelectContact,
    onRegionChange,
    onContextMenu,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const boundaryRef = useRef<L.Polygon | null>(null);
  const onSelectRef = useRef(onSelectContact);
  const onRegionChangeRef = useRef(onRegionChange);
  const onContextMenuRef = useRef(onContextMenu);
  onSelectRef.current = onSelectContact;
  onRegionChangeRef.current = onRegionChange;
  onContextMenuRef.current = onContextMenu;

  // Expose flyTo to parent via ref
  useImperativeHandle(ref, () => ({
    flyTo: (lat: number, lng: number, z?: number) => {
      mapRef.current?.flyTo([lat, lng], z ?? 14, { duration: 0.8 });
    },
  }));

  // Init map
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView(center, zoom);
    mapRef.current = map;

    // Zoom control top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);

    // Region change persistence
    map.on('moveend', () => {
      const c = map.getCenter();
      onRegionChangeRef.current?.(c.lat, c.lng, map.getZoom());
    });

    // Right-click context menu
    map.on('contextmenu', (e: L.LeafletMouseEvent) => {
      onContextMenuRef.current?.(e.latlng.lat, e.latlng.lng);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
      boundaryRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync markers when contacts change
  useEffect(() => {
    const group = markersRef.current;
    if (!group) return;

    group.clearLayers();

    contacts.forEach((contact) => {
      if (!contact.latitude || !contact.longitude) return;

      const icon = createColoredIcon(contact.tag?.color || '#3B82F6');
      const name = [contact.first_name, contact.last_name]
        .filter(Boolean)
        .join(' ');

      const marker = L.marker([contact.latitude, contact.longitude], { icon });

      marker.bindPopup(
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

      marker.on('click', () => onSelectRef.current(contact));
      group.addLayer(marker);
    });
  }, [contacts]);

  // Sync suburb boundary polygon
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old boundary
    if (boundaryRef.current) {
      map.removeLayer(boundaryRef.current);
      boundaryRef.current = null;
    }

    if (suburbBoundary && suburbBoundary.coordinates.length > 0) {
      const latlngs = suburbBoundary.coordinates.map((c) =>
        L.latLng(c.latitude, c.longitude)
      );

      boundaryRef.current = L.polygon(latlngs, {
        color: '#000000',
        weight: 3,
        fillColor: '#000000',
        fillOpacity: 0.03,
      }).addTo(map);

      // Add suburb name label
      const bounds = boundaryRef.current.getBounds();
      const center = bounds.getCenter();
      const label = L.divIcon({
        html: `<div style="font-size:11px;font-weight:600;color:#374151;background:rgba(255,255,255,0.85);padding:2px 6px;border-radius:4px;white-space:nowrap">${suburbBoundary.name}</div>`,
        className: '',
        iconAnchor: [0, 0],
      });
      L.marker(center, { icon: label, interactive: false }).addTo(map);
    }
  }, [suburbBoundary]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ height: '100%', width: '100%' }}
    />
  );
});
