'use client';

import { useRef, useEffect } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MatchStrength } from '@realestate-crm/types';

export interface BuyerPin {
  latitude: number;
  longitude: number;
  name: string;
  strength: MatchStrength;
}

interface PropertyMapProps {
  latitude: number;
  longitude: number;
  address: string;
  buyerPins?: BuyerPin[];
}

const STRENGTH_COLORS: Record<MatchStrength, string> = {
  strong: '#16A34A',
  partial: '#D97706',
  weak: '#9CA3AF',
};

function createPropertyIcon() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#3B82F6"/>
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

function createBuyerIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="20" height="30">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}"/>
    <circle cx="12" cy="10" r="3.5" fill="white"/>
    <path d="M7 18c0-2.8 2.2-5 5-5s5 2.2 5 5" fill="white" stroke="white" stroke-width="0.5"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [20, 30],
    iconAnchor: [10, 30],
    popupAnchor: [0, -30],
  });
}

export default function PropertyMap({ latitude, longitude, address, buyerPins }: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const buyerLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
    }).setView([latitude, longitude], 15);
    mapRef.current = map;

    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const icon = createPropertyIcon();
    const marker = L.marker([latitude, longitude], { icon });
    marker.bindPopup(
      `<div style="font-size:13px"><strong>${address}</strong></div>`
    );
    marker.addTo(map);

    buyerLayerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      buyerLayerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker position if coords change
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView([latitude, longitude], 15);
    }
  }, [latitude, longitude]);

  // Sync buyer pins
  useEffect(() => {
    const group = buyerLayerRef.current;
    if (!group) return;

    group.clearLayers();

    if (!buyerPins || buyerPins.length === 0) return;

    const bounds = L.latLngBounds([[latitude, longitude]]);

    buyerPins.forEach((pin) => {
      if (!pin.latitude || !pin.longitude) return;
      const color = STRENGTH_COLORS[pin.strength];
      const icon = createBuyerIcon(color);
      const marker = L.marker([pin.latitude, pin.longitude], { icon });
      marker.bindPopup(
        `<div style="font-size:13px"><strong>${pin.name}</strong><br/><span style="color:${color};font-weight:600;text-transform:capitalize">${pin.strength} match</span></div>`
      );
      group.addLayer(marker);
      bounds.extend([pin.latitude, pin.longitude]);
    });

    // Fit map to show property + all buyer pins
    if (mapRef.current && buyerPins.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    }
  }, [buyerPins, latitude, longitude]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ height: '100%', width: '100%' }}
    />
  );
}
