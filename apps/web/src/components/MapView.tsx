'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCRMStore } from '@realestate-crm/hooks';
import { fetchSuburbByName } from '@realestate-crm/api';
import type { Contact, SuburbBoundary } from '@realestate-crm/types';
import type { GoogleMapHandle } from './GoogleMap';
import MapSearchBar from './MapSearchBar';
import ContactFormDialog from './ContactFormDialog';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

// Google Maps must be loaded client-side only
const GoogleMap = dynamic(() => import('./GoogleMap'), { ssr: false });

export default function MapView() {
  const contacts = useCRMStore((s) => s.contacts);
  const tags = useCRMStore((s) => s.tags);
  const mapRegion = useCRMStore((s) => s.mapRegion);
  const setMapRegion = useCRMStore((s) => s.setMapRegion);
  const addActivity = useCRMStore((s) => s.addActivity);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [suburbBoundary, setSuburbBoundary] = useState<SuburbBoundary | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [formPrefill, setFormPrefill] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);
  const [contextMenuCoords, setContextMenuCoords] = useState<{
    lat: number;
    lng: number;
    address: string;
  } | null>(null);

  // User location
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Pending marker (shown at right-click location)
  const [pendingMarker, setPendingMarker] = useState<{ lat: number; lng: number } | null>(null);

  // Quick note dialog
  const [quickNoteDialog, setQuickNoteDialog] = useState<{
    visible: boolean;
    lat: number;
    lng: number;
    address: string;
  }>({ visible: false, lat: 0, lng: 0, address: '' });
  const [quickNoteData, setQuickNoteData] = useState({ firstName: '', note: '' });
  const [quickNoteSaving, setQuickNoteSaving] = useState(false);

  // FAB open state
  const [fabOpen, setFabOpen] = useState(false);

  const mapRef = useRef<GoogleMapHandle>(null);
  const addContact = useCRMStore((s) => s.addContact);

  // Request geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {}, // silently fail
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // Filter contacts with coordinates, then by selected tags
  const mappableContacts = useMemo(() => {
    let result = contacts.filter((c) => c.latitude && c.longitude);
    if (selectedTagIds.length > 0) {
      result = result.filter(
        (c) => c.tag_id && selectedTagIds.includes(c.tag_id)
      );
    }
    return result;
  }, [contacts, selectedTagIds]);

  const totalMappedContacts = useMemo(
    () => contacts.filter((c) => c.latitude && c.longitude).length,
    [contacts]
  );

  // Per-tag contact counts (only contacts with coordinates)
  const tagContactCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    contacts.forEach((c) => {
      if (c.latitude && c.longitude && c.tag_id) {
        counts[c.tag_id] = (counts[c.tag_id] || 0) + 1;
      }
    });
    return counts;
  }, [contacts]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Map region persistence
  const handleRegionChange = useCallback(
    (lat: number, lng: number, zoom: number) => {
      const latDelta = 360 / Math.pow(2, zoom) / 2;
      setMapRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: latDelta,
        longitudeDelta: latDelta,
      });
    },
    [setMapRegion]
  );

  // Search location selected → fly to and fetch boundary
  const handleSearchLocationSelect = useCallback(
    async (lat: number, lng: number, name: string) => {
      mapRef.current?.flyTo(lat, lng, 14);
      const boundary = await fetchSuburbByName(name, 'New South Wales');
      setSuburbBoundary(boundary);
    },
    []
  );

  // Reverse geocode helper
  const reverseGeocode = useCallback(
    async (lat: number, lng: number): Promise<string> => {
      if (!GOOGLE_MAPS_API_KEY) return '';
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.results?.[0]) {
          return data.results[0].formatted_address;
        }
      } catch (error) {
        console.error('Reverse geocode error:', error);
      }
      return '';
    },
    []
  );

  // Get suburb name from coords (for boundary fetch after centering on user)
  const getSuburbFromCoords = useCallback(
    async (lat: number, lng: number): Promise<string | null> => {
      if (!GOOGLE_MAPS_API_KEY) return null;
      try {
        const response = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&result_type=locality|sublocality&key=${GOOGLE_MAPS_API_KEY}`
        );
        const data = await response.json();
        if (data.results?.[0]) {
          const comp = data.results[0].address_components?.find((c: any) =>
            c.types.includes('locality') || c.types.includes('sublocality')
          );
          return comp?.long_name || null;
        }
      } catch (error) {
        console.error('Reverse geocode for suburb error:', error);
      }
      return null;
    },
    []
  );

  // Right-click → show pending marker + reverse geocode → context menu
  const handleContextMenu = useCallback(
    async (lat: number, lng: number) => {
      setPendingMarker({ lat, lng });
      const address = await reverseGeocode(lat, lng);
      setContextMenuCoords({ lat, lng, address });
    },
    [reverseGeocode]
  );

  const handleContextMenuNewContact = () => {
    setFormPrefill(contextMenuCoords);
    setShowContactForm(true);
    setContextMenuCoords(null);
    // keep pending marker visible until form closes
  };

  const handleContextMenuQuickNote = () => {
    if (contextMenuCoords) {
      setQuickNoteDialog({
        visible: true,
        lat: contextMenuCoords.lat,
        lng: contextMenuCoords.lng,
        address: contextMenuCoords.address,
      });
      setQuickNoteData({ firstName: '', note: '' });
    }
    setContextMenuCoords(null);
  };

  const dismissContextMenu = () => {
    setContextMenuCoords(null);
    setPendingMarker(null);
  };

  // My Location button
  const handleCenterOnUser = useCallback(async () => {
    const getPosition = (): Promise<GeolocationPosition> =>
      new Promise((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        })
      );

    try {
      let loc = userLocation;
      if (!loc) {
        const pos = await getPosition();
        loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
      }
      mapRef.current?.flyTo(loc.lat, loc.lng, 17); // street-level zoom

      // Fetch suburb boundary for user's location
      const suburbName = await getSuburbFromCoords(loc.lat, loc.lng);
      if (suburbName) {
        const boundary = await fetchSuburbByName(suburbName, 'New South Wales');
        setSuburbBoundary(boundary);
      }
    } catch {
      // geolocation denied or unavailable
    }
  }, [userLocation, getSuburbFromCoords]);

  // FAB: Quick Note from map center
  const handleFabQuickNote = useCallback(async () => {
    setFabOpen(false);
    const address = await reverseGeocode(mapRegion.latitude, mapRegion.longitude);
    setQuickNoteDialog({
      visible: true,
      lat: mapRegion.latitude,
      lng: mapRegion.longitude,
      address,
    });
    setQuickNoteData({ firstName: '', note: '' });
  }, [mapRegion, reverseGeocode]);

  // FAB: New Contact
  const handleFabNewContact = useCallback(() => {
    setFabOpen(false);
    setFormPrefill(null);
    setShowContactForm(true);
  }, []);

  // Submit quick note
  const handleQuickNoteSubmit = useCallback(async () => {
    if (!quickNoteData.firstName.trim()) return;
    setQuickNoteSaving(true);
    try {
      const newContact = await addContact({
        first_name: quickNoteData.firstName.trim(),
        address: quickNoteDialog.address || undefined,
        latitude: quickNoteDialog.lat,
        longitude: quickNoteDialog.lng,
      });
      if (newContact && quickNoteData.note.trim()) {
        await addActivity({
          contact_id: newContact.id,
          type: 'note',
          content: quickNoteData.note.trim(),
        });
      }
      setQuickNoteDialog((prev) => ({ ...prev, visible: false }));
      setPendingMarker(null);
    } catch (err) {
      console.error('Quick note error:', err);
    } finally {
      setQuickNoteSaving(false);
    }
  }, [quickNoteData, quickNoteDialog, addContact, addActivity]);

  const dismissQuickNote = () => {
    setQuickNoteDialog((prev) => ({ ...prev, visible: false }));
    setPendingMarker(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Map</h1>
        <span className="text-sm text-gray-500">
          {selectedTagIds.length > 0
            ? `${mappableContacts.length} of ${totalMappedContacts} mapped contacts`
            : `${totalMappedContacts} contacts with location`}
        </span>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const count = tagContactCounts[tag.id] || 0;
            const isSelected = selectedTagIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  isSelected
                    ? 'border-transparent text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
                style={isSelected ? { backgroundColor: tag.color } : {}}
              >
                {tag.name}
                {count > 0 && (
                  <span
                    className={`ml-1 ${isSelected ? 'opacity-80' : 'text-gray-400'}`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {selectedTagIds.length > 0 && (
            <button
              onClick={() => setSelectedTagIds([])}
              className="rounded-full px-2 py-1 text-xs text-gray-400 hover:text-gray-600"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Map + sidebar */}
      <div className="relative flex flex-1">
        <div className="relative flex-1">
          <GoogleMap
            ref={mapRef}
            contacts={mappableContacts}
            center={[mapRegion.latitude, mapRegion.longitude]}
            zoom={
              mapRegion.latitudeDelta
                ? Math.round(Math.log2(360 / mapRegion.latitudeDelta))
                : 13
            }
            suburbBoundary={suburbBoundary}
            userLocation={userLocation}
            pendingMarker={pendingMarker}
            onSelectContact={setSelectedContact}
            onRegionChange={handleRegionChange}
            onContextMenu={handleContextMenu}
          />

          <MapSearchBar onLocationSelect={handleSearchLocationSelect} />

          {/* My Location button */}
          <button
            onClick={handleCenterOnUser}
            className="absolute bottom-28 left-4 z-[1000] flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 bg-white shadow-md hover:bg-gray-50 transition-colors"
            title="My location"
          >
            <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2M3 12h2m14 0h2" />
            </svg>
          </button>

          {/* Quick Add FAB group */}
          <div className="absolute bottom-6 left-4 z-[1000] flex flex-col items-start gap-2">
            {fabOpen && (
              <>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFabQuickNote}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white shadow-lg hover:bg-amber-600 transition-colors"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                  </button>
                  <span className="rounded-lg bg-gray-800 px-2.5 py-1 text-xs font-medium text-white shadow">
                    Quick Note
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleFabNewContact}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white shadow-lg hover:bg-green-600 transition-colors"
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                    </svg>
                  </button>
                  <span className="rounded-lg bg-gray-800 px-2.5 py-1 text-xs font-medium text-white shadow">
                    New Contact
                  </span>
                </div>
              </>
            )}
            <button
              onClick={() => setFabOpen(!fabOpen)}
              className={`flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all ${
                fabOpen
                  ? 'bg-gray-700 rotate-45'
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>

          {/* Right-click context menu */}
          {contextMenuCoords && (
            <>
              <div
                className="fixed inset-0 z-[1001]"
                onClick={dismissContextMenu}
              />
              <div className="absolute left-1/2 top-1/2 z-[1002] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
                <h3 className="mb-1 text-sm font-semibold text-gray-900">
                  Add to Map
                </h3>
                <p className="mb-3 max-w-xs text-xs text-gray-500">
                  {contextMenuCoords.address || 'Loading address...'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={dismissContextMenu}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleContextMenuQuickNote}
                    className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    Quick Note
                  </button>
                  <button
                    onClick={handleContextMenuNewContact}
                    className="flex items-center gap-1.5 rounded-lg bg-primary-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-600"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                    </svg>
                    Contact
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Contact sidebar */}
        {selectedContact && (
          <div className="w-80 border-l border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold text-white"
                  style={{
                    backgroundColor:
                      selectedContact.tag?.color || '#9CA3AF',
                  }}
                >
                  {(selectedContact.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <p className="text-base font-semibold text-gray-900">
                    {[selectedContact.first_name, selectedContact.last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </p>
                  {selectedContact.tag && (
                    <span
                      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: selectedContact.tag.color + '20',
                        color: selectedContact.tag.color,
                      }}
                    >
                      {selectedContact.tag.name}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setSelectedContact(null)}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {selectedContact.email && (
                <div className="flex items-center gap-2.5 text-sm">
                  <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                  </svg>
                  <a
                    href={`mailto:${selectedContact.email}`}
                    className="text-primary-600 hover:underline"
                  >
                    {selectedContact.email}
                  </a>
                </div>
              )}
              {selectedContact.phone && (
                <div className="flex items-center gap-2.5 text-sm">
                  <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  <a
                    href={`tel:${selectedContact.phone}`}
                    className="text-gray-700 hover:underline"
                  >
                    {selectedContact.phone}
                  </a>
                </div>
              )}
              {selectedContact.address && (
                <div className="flex items-start gap-2.5 text-sm">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  <span className="text-gray-500">
                    {selectedContact.address}
                  </span>
                </div>
              )}
              {selectedContact.latitude && selectedContact.longitude && (
                <div className="flex items-center gap-2.5 text-sm">
                  <svg className="h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                  <span className="text-xs text-gray-400">
                    {selectedContact.latitude.toFixed(6)}, {selectedContact.longitude.toFixed(6)}
                  </span>
                </div>
              )}
            </div>

            <Link
              href={`/contacts/${selectedContact.id}`}
              className="mt-5 block rounded-lg bg-primary-500 px-3 py-2.5 text-center text-sm font-medium text-white hover:bg-primary-600"
            >
              View Details
            </Link>
          </div>
        )}
      </div>

      {/* Contact form dialog */}
      {showContactForm && (
        <ContactFormDialog
          contact={null}
          prefillAddress={formPrefill?.address}
          prefillCoords={
            formPrefill
              ? { lat: formPrefill.lat, lng: formPrefill.lng }
              : undefined
          }
          onClose={() => {
            setShowContactForm(false);
            setFormPrefill(null);
            setPendingMarker(null);
          }}
        />
      )}

      {/* Quick Note dialog */}
      {quickNoteDialog.visible && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
          <div className="mx-4 w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Quick Note
              </h2>
              <button
                onClick={dismissQuickNote}
                className="rounded p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {quickNoteDialog.address && (
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-gray-50 p-3">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                  </svg>
                  <p className="text-xs text-gray-600">{quickNoteDialog.address}</p>
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={quickNoteData.firstName}
                    onChange={(e) =>
                      setQuickNoteData((prev) => ({ ...prev, firstName: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Contact name"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Note
                  </label>
                  <textarea
                    value={quickNoteData.note}
                    onChange={(e) =>
                      setQuickNoteData((prev) => ({ ...prev, note: e.target.value }))
                    }
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Add a quick note..."
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={dismissQuickNote}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleQuickNoteSubmit}
                  disabled={quickNoteSaving || !quickNoteData.firstName.trim()}
                  className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {quickNoteSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
