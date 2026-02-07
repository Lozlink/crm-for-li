'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Contact } from '@realestate-crm/types';

// Fix Leaflet default icon issue in bundlers
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

interface LeafletMapProps {
  contacts: Contact[];
  center: [number, number];
  zoom: number;
  onSelectContact: (contact: Contact) => void;
}

export default function LeafletMap({
  contacts,
  center,
  zoom,
  onSelectContact,
}: LeafletMapProps) {
  return (
    <MapContainer
      center={center}
      zoom={zoom}
      className="h-full w-full"
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {contacts.map((contact) => {
        if (!contact.latitude || !contact.longitude) return null;
        const icon = createColoredIcon(contact.tag?.color || '#3B82F6');
        return (
          <Marker
            key={contact.id}
            position={[contact.latitude, contact.longitude]}
            icon={icon}
            eventHandlers={{
              click: () => onSelectContact(contact),
            }}
          >
            <Popup>
              <div className="text-sm">
                <strong>
                  {[contact.first_name, contact.last_name]
                    .filter(Boolean)
                    .join(' ')}
                </strong>
                {contact.address && (
                  <p className="mt-1 text-gray-500">{contact.address}</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
