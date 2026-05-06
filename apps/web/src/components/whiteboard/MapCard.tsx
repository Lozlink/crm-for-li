'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { reverseGeocode } from '@realestate-crm/api';
import { useWhiteboardStore } from '@realestate-crm/hooks';
import type { WhiteboardItem, WhiteboardMapContent } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
}

/**
 * Map widget body — web version.
 *
 * Shows a "Territory pin" card with resolved address via OSM Nominatim.
 * On first render with no cached address, kicks off a reverse-geocode and
 * persists the result via updateItem so subsequent renders skip the call.
 *
 * Clicking navigates to /map?lat=&lng=&zoom=&layer= — consumed by MapView's
 * useSearchParams handler.
 */
export function MapCard({ item }: Props) {
  const router = useRouter();
  const updateItem = useWhiteboardStore((s) => s.updateItem);
  const content = item.content as WhiteboardMapContent;
  const { lat, lng, zoom } = content.viewport;

  const geocodeFired = useRef(false);

  useEffect(() => {
    if (geocodeFired.current) return;
    if (content.address) return; // already resolved

    geocodeFired.current = true;

    reverseGeocode(lat, lng).then((result) => {
      if (!result) return;
      void updateItem(item.id, {
        content: {
          ...content,
          address: result.address,
          suburb: result.suburb,
        } as WhiteboardMapContent,
      });
    });
  }, [item.id, lat, lng, content, updateItem]);

  const handleClick = () => {
    // ?zoom= contract: latitudeDelta in degrees (the cross-platform convention,
    // matching mobile MapCard + SuggestionCard producers). The stored
    // `viewport.zoom` is a tile-zoom integer (1–21, Google/OSM convention),
    // so convert here: delta = 360 / 2^z. Clamps to a sane tile-zoom range
    // so a corrupt stored value can't push a global-scale delta.
    const tileZoom = zoom >= 1 && zoom <= 21 ? zoom : 13;
    const delta = 360 / Math.pow(2, tileZoom);
    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      zoom: String(delta),
    });
    if (content.overlays?.length) {
      params.set('layer', content.overlays[0]);
    }
    router.push(`/map?${params.toString()}`);
  };

  const addressLine = content.address ?? null;
  const suburbLine = content.suburb ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

  return (
    <button
      className="flex h-full w-full flex-col overflow-hidden rounded-xl bg-white text-left"
      style={{
        border: '1px solid rgba(0,0,0,0.08)',
        boxShadow: '0 2px 4px rgba(0,0,0,0.08)',
      }}
      onClick={handleClick}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 pb-1.5 pt-2"
        style={{ borderBottom: '1px solid rgba(0,0,0,0.08)' }}
      >
        <MapPinIcon className="h-4 w-4 shrink-0 text-blue-600" />
        <span className="truncate text-sm font-semibold text-gray-800">
          Territory pin
        </span>
      </div>

      {/* Address lines */}
      <div className="flex flex-1 flex-col justify-center gap-0.5 px-3 py-2">
        <p className="truncate text-sm text-gray-700">
          {addressLine ?? (
            <span className="italic text-gray-400">Resolving address…</span>
          )}
        </p>
        <p className="truncate text-xs text-gray-400">{suburbLine}</p>
      </div>

      {/* Footer hint */}
      <p className="px-3 pb-2 text-[11px] text-blue-500">Tap to open map</p>
    </button>
  );
}

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
    </svg>
  );
}
