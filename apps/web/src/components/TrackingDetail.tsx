'use client';

import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Loader } from '@googlemaps/js-api-loader';
import { useTrackingStore, useCRMStore } from '@realestate-crm/hooks';
import { decodePolyline } from '@realestate-crm/api';
import type { TrackingBreadcrumb, TrackingAnnotation, Contact } from '@realestate-crm/types';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const loader = new Loader({
  apiKey: GOOGLE_MAPS_API_KEY,
  version: 'weekly',
});

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return '-';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDistance(meters?: number): string {
  if (!meters || meters <= 0) return '-';
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} m`;
}

/** Haversine distance in meters between two lat/lng points */
function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/** Check if a contact's location is within `threshold` meters of any breadcrumb on the route */
function isNearRoute(
  contactLat: number,
  contactLng: number,
  breadcrumbs: { latitude: number; longitude: number }[],
  threshold = 100
): boolean {
  return breadcrumbs.some(
    (b) => haversineDistance(contactLat, contactLng, b.latitude, b.longitude) <= threshold
  );
}

/** Sample breadcrumbs every ~30 items (5 min intervals at 10s capture rate) */
function sampleBreadcrumbs(breadcrumbs: TrackingBreadcrumb[]): TrackingBreadcrumb[] {
  if (breadcrumbs.length <= 2) return breadcrumbs;
  const step = 30;
  const sampled: TrackingBreadcrumb[] = [breadcrumbs[0]];
  for (let i = step; i < breadcrumbs.length - 1; i += step) {
    sampled.push(breadcrumbs[i]);
  }
  const last = breadcrumbs[breadcrumbs.length - 1];
  if (sampled[sampled.length - 1].id !== last.id) {
    sampled.push(last);
  }
  return sampled;
}

/** Find the closest point on the route to a given click location */
function findClosestRoutePoint(
  clickLat: number,
  clickLng: number,
  path: { lat: number; lng: number }[]
): { lat: number; lng: number } {
  let closest = path[0];
  let minDist = Infinity;
  for (const p of path) {
    const d = haversineDistance(clickLat, clickLng, p.lat, p.lng);
    if (d < minDist) {
      minDist = d;
      closest = p;
    }
  }
  return closest;
}

// --- SVG icon helpers for map markers ---

const ANNOTATION_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
  <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="#F59E0B" stroke="white" stroke-width="1.5"/>
  <circle cx="12" cy="12" r="5" fill="white"/>
  <path d="M10 10h4v1h-3v1h2v1h-2v2h-1z" fill="#F59E0B"/>
</svg>`;

const CONTACT_PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="18" height="18">
  <circle cx="10" cy="10" r="8" fill="#22C55E" stroke="white" stroke-width="2.5"/>
  <circle cx="10" cy="8" r="2.5" fill="white"/>
  <path d="M5.5 15.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5" fill="none" stroke="white" stroke-width="1.5" stroke-linecap="round"/>
</svg>`;

interface TrackingDetailProps {
  sessionId: string;
}

export default function TrackingDetail({ sessionId }: TrackingDetailProps) {
  const sessions = useTrackingStore((s) => s.sessions);
  const isLoading = useTrackingStore((s) => s.isLoading);
  const fetchSessions = useTrackingStore((s) => s.fetchSessions);
  const fetchSessionBreadcrumbs = useTrackingStore((s) => s.fetchSessionBreadcrumbs);
  const annotations = useTrackingStore((s) => s.annotations);
  const fetchAnnotations = useTrackingStore((s) => s.fetchAnnotations);
  const createAnnotation = useTrackingStore((s) => s.createAnnotation);
  const updateAnnotation = useTrackingStore((s) => s.updateAnnotation);
  const deleteAnnotation = useTrackingStore((s) => s.deleteAnnotation);
  const linkAnnotationContact = useTrackingStore((s) => s.linkAnnotationContact);

  const contacts = useCRMStore((s) => s.contacts);
  const fetchContacts = useCRMStore((s) => s.fetchContacts);

  const [breadcrumbs, setBreadcrumbs] = useState<TrackingBreadcrumb[]>([]);
  const [loadingBreadcrumbs, setLoadingBreadcrumbs] = useState(true);

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const startMarkerRef = useRef<google.maps.Marker | null>(null);
  const endMarkerRef = useRef<google.maps.Marker | null>(null);
  const annotationMarkersRef = useRef<google.maps.Marker[]>([]);
  const contactMarkersRef = useRef<google.maps.Marker[]>([]);
  const mapClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Route path used by polyline and click detection
  const routePathRef = useRef<{ lat: number; lng: number }[]>([]);

  // Annotation editing state
  const [selectedAnnotation, setSelectedAnnotation] = useState<TrackingAnnotation | null>(null);
  const [editingNote, setEditingNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // New annotation dialog state (click-to-add)
  const [newAnnotationPos, setNewAnnotationPos] = useState<{ lat: number; lng: number } | null>(null);
  const [newAnnotationNote, setNewAnnotationNote] = useState('');
  const [isCreatingAnnotation, setIsCreatingAnnotation] = useState(false);

  // Link contact picker state
  const [linkingAnnotationId, setLinkingAnnotationId] = useState<string | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  const session = sessions.find((s) => s.id === sessionId);

  // Fetch sessions if store is empty
  useEffect(() => {
    if (sessions.length === 0) {
      fetchSessions();
    }
  }, [sessions.length, fetchSessions]);

  // Fetch breadcrumbs
  useEffect(() => {
    let cancelled = false;
    setLoadingBreadcrumbs(true);
    fetchSessionBreadcrumbs(sessionId).then((data) => {
      if (!cancelled) {
        setBreadcrumbs(data);
        setLoadingBreadcrumbs(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId, fetchSessionBreadcrumbs]);

  // Fetch annotations
  useEffect(() => {
    fetchAnnotations(sessionId);
  }, [sessionId, fetchAnnotations]);

  // Fetch contacts for nearby overlay
  useEffect(() => {
    if (contacts.length === 0) {
      fetchContacts();
    }
  }, [contacts.length, fetchContacts]);

  // Nearby contacts computed from breadcrumbs + contacts
  const nearbyContacts = useMemo(() => {
    if (breadcrumbs.length === 0 || contacts.length === 0) return [];
    // Use a sparser set for the distance check for performance
    const sparsePoints = breadcrumbs.filter((_, i) => i % 5 === 0);
    return contacts.filter(
      (c) =>
        c.latitude != null &&
        c.longitude != null &&
        isNearRoute(c.latitude, c.longitude, sparsePoints, 100)
    );
  }, [breadcrumbs, contacts]);

  // Init map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    let cancelled = false;

    loader.importLibrary('maps').then(({ Map }) => {
      if (cancelled || !mapContainerRef.current) return;

      const map = new Map(mapContainerRef.current, {
        center: { lat: -33.8688, lng: 151.2093 },
        zoom: 14,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        zoomControlOptions: {
          position: google.maps.ControlPosition.TOP_RIGHT,
        },
      });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      startMarkerRef.current?.setMap(null);
      startMarkerRef.current = null;
      endMarkerRef.current?.setMap(null);
      endMarkerRef.current = null;
      clearAnnotationMarkers();
      clearContactMarkers();
      if (mapClickListenerRef.current) {
        google.maps.event.removeListener(mapClickListenerRef.current);
        mapClickListenerRef.current = null;
      }
      mapRef.current = null;
      setMapReady(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAnnotationMarkers() {
    annotationMarkersRef.current.forEach((m) => m.setMap(null));
    annotationMarkersRef.current = [];
  }

  function clearContactMarkers() {
    contactMarkersRef.current.forEach((m) => m.setMap(null));
    contactMarkersRef.current = [];
  }

  // Draw polyline, start/end markers, and set up click-to-add listener
  const drawRoute = useCallback(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;

    // Clear previous drawings
    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    startMarkerRef.current?.setMap(null);
    startMarkerRef.current = null;
    endMarkerRef.current?.setMap(null);
    endMarkerRef.current = null;
    if (mapClickListenerRef.current) {
      google.maps.event.removeListener(mapClickListenerRef.current);
      mapClickListenerRef.current = null;
    }

    // Build path from polyline string or breadcrumbs
    let path: { lat: number; lng: number }[] = [];

    if (session?.polyline) {
      const decoded = decodePolyline(session.polyline);
      path = decoded.map((p) => ({ lat: p.latitude, lng: p.longitude }));
    } else if (breadcrumbs.length > 0) {
      path = breadcrumbs.map((b) => ({ lat: b.latitude, lng: b.longitude }));
    }

    routePathRef.current = path;

    if (path.length === 0) return;

    // Draw polyline
    const polyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#3B82F6',
      strokeOpacity: 0.9,
      strokeWeight: 4,
      map,
      clickable: true,
    });
    polylineRef.current = polyline;

    // Click on polyline to add annotation at that point
    polyline.addListener('click', (e: google.maps.PolyMouseEvent) => {
      if (e.latLng) {
        setNewAnnotationPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        setNewAnnotationNote('');
      }
    });

    // Click on map (near route) to add annotation
    mapClickListenerRef.current = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const clickLat = e.latLng.lat();
      const clickLng = e.latLng.lng();
      // Only allow adding annotations within 200m of the route
      const closest = findClosestRoutePoint(clickLat, clickLng, routePathRef.current);
      const dist = haversineDistance(clickLat, clickLng, closest.lat, closest.lng);
      if (dist <= 200) {
        // Snap to the closest route point for better accuracy
        setNewAnnotationPos(closest);
        setNewAnnotationNote('');
      }
    });

    // Green circle for start
    const greenCircle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
      <circle cx="10" cy="10" r="8" fill="#22C55E" stroke="white" stroke-width="3"/>
    </svg>`;

    startMarkerRef.current = new google.maps.Marker({
      position: path[0],
      map,
      icon: {
        url: `data:image/svg+xml,${encodeURIComponent(greenCircle)}`,
        scaledSize: new google.maps.Size(20, 20),
        anchor: new google.maps.Point(10, 10),
      },
      title: 'Start',
      zIndex: 10,
    });

    // Red circle for end
    const redCircle = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
      <circle cx="10" cy="10" r="8" fill="#EF4444" stroke="white" stroke-width="3"/>
    </svg>`;

    endMarkerRef.current = new google.maps.Marker({
      position: path[path.length - 1],
      map,
      icon: {
        url: `data:image/svg+xml,${encodeURIComponent(redCircle)}`,
        scaledSize: new google.maps.Size(20, 20),
        anchor: new google.maps.Point(10, 10),
      },
      title: 'End',
      zIndex: 10,
    });

    // fitBounds
    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 60);
  }, [mapReady, session?.polyline, breadcrumbs]);

  useEffect(() => {
    drawRoute();
  }, [drawRoute]);

  // Draw annotation markers on map
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    clearAnnotationMarkers();

    annotations.forEach((ann) => {
      const marker = new google.maps.Marker({
        position: { lat: ann.latitude, lng: ann.longitude },
        map,
        icon: {
          url: `data:image/svg+xml,${encodeURIComponent(ANNOTATION_PIN_SVG)}`,
          scaledSize: new google.maps.Size(28, 42),
          anchor: new google.maps.Point(14, 42),
        },
        title: ann.note || 'Annotation',
        zIndex: 20,
      });

      marker.addListener('click', () => {
        setSelectedAnnotation(ann);
        setEditingNote(ann.note);
        setLinkingAnnotationId(null);
      });

      annotationMarkersRef.current.push(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, annotations]);

  // Draw nearby contact markers on map
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    clearContactMarkers();

    nearbyContacts.forEach((contact) => {
      if (contact.latitude == null || contact.longitude == null) return;

      const marker = new google.maps.Marker({
        position: { lat: contact.latitude, lng: contact.longitude },
        map,
        icon: {
          url: `data:image/svg+xml,${encodeURIComponent(CONTACT_PIN_SVG)}`,
          scaledSize: new google.maps.Size(18, 18),
          anchor: new google.maps.Point(9, 9),
        },
        title: [contact.first_name, contact.last_name].filter(Boolean).join(' '),
        zIndex: 5,
      });

      contactMarkersRef.current.push(marker);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, nearbyContacts]);

  // Fly to a location on the map
  const flyTo = useCallback(
    (lat: number, lng: number, zoom = 17) => {
      if (!mapRef.current) return;
      mapRef.current.panTo({ lat, lng });
      mapRef.current.setZoom(zoom);
    },
    []
  );

  // Save edited annotation note
  const handleSaveNote = useCallback(async () => {
    if (!selectedAnnotation) return;
    setIsSavingNote(true);
    await updateAnnotation(selectedAnnotation.id, editingNote);
    setSelectedAnnotation((prev) =>
      prev ? { ...prev, note: editingNote } : null
    );
    setIsSavingNote(false);
  }, [selectedAnnotation, editingNote, updateAnnotation]);

  // Delete annotation
  const handleDeleteAnnotation = useCallback(async () => {
    if (!selectedAnnotation) return;
    await deleteAnnotation(selectedAnnotation.id);
    setSelectedAnnotation(null);
    setEditingNote('');
  }, [selectedAnnotation, deleteAnnotation]);

  // Create new annotation from map click
  const handleCreateAnnotation = useCallback(async () => {
    if (!newAnnotationPos) return;
    setIsCreatingAnnotation(true);
    await createAnnotation({
      session_id: sessionId,
      latitude: newAnnotationPos.lat,
      longitude: newAnnotationPos.lng,
      note: newAnnotationNote,
    });
    setNewAnnotationPos(null);
    setNewAnnotationNote('');
    setIsCreatingAnnotation(false);
  }, [newAnnotationPos, newAnnotationNote, sessionId, createAnnotation]);

  // Link a contact to an annotation
  const handleLinkContact = useCallback(
    async (annotationId: string, contactId: string) => {
      await linkAnnotationContact(annotationId, contactId);
      setLinkingAnnotationId(null);
      setContactSearchQuery('');
      // Refresh annotations to get the linked contact data
      await fetchAnnotations(sessionId);
    },
    [linkAnnotationContact, fetchAnnotations, sessionId]
  );

  // Filtered contacts for linking search
  const filteredLinkContacts = useMemo(() => {
    if (!contactSearchQuery.trim()) return contacts.slice(0, 10);
    const q = contactSearchQuery.toLowerCase();
    return contacts
      .filter(
        (c) =>
          c.first_name.toLowerCase().includes(q) ||
          (c.last_name && c.last_name.toLowerCase().includes(q)) ||
          (c.address && c.address.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [contacts, contactSearchQuery]);

  function getContactDisplayName(contact: Contact | { first_name: string; last_name?: string; address?: string }): string {
    return [contact.first_name, contact.last_name].filter(Boolean).join(' ');
  }

  function getAnnotationContactName(ann: TrackingAnnotation): string | null {
    if (!ann.contact_id) return null;
    // Contact might be embedded on the annotation (from Supabase join)
    if (ann.contact) {
      const c = Array.isArray(ann.contact) ? (ann.contact as unknown as Contact[])[0] : ann.contact;
      if (c) return getContactDisplayName(c);
    }
    // Fallback: look up in contacts store
    const c = contacts.find((ct) => ct.id === ann.contact_id);
    if (c) return getContactDisplayName(c);
    return 'Linked Contact';
  }

  // Loading state
  if (isLoading && sessions.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  // Session not found
  if (!isLoading && sessions.length > 0 && !session) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <p className="text-sm text-gray-500">Session not found.</p>
        <Link
          href="/tracking"
          className="mt-3 text-sm font-medium text-primary-500 hover:text-primary-600"
        >
          Back to Tracking Sessions
        </Link>
      </div>
    );
  }

  const sessionDate = session
    ? new Date(session.started_at).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const sampledBreadcrumbs = sampleBreadcrumbs(breadcrumbs);

  return (
    <div className="flex h-full">
      {/* Left panel */}
      <div className="flex w-80 flex-col border-r border-gray-200 bg-white">
        <div className="flex-shrink-0 p-4">
          {/* Breadcrumb nav */}
          <Link
            href="/tracking"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 19.5L8.25 12l7.5-7.5"
              />
            </svg>
            Tracking Sessions
          </Link>

          {/* Title */}
          <h1 className="mt-3 text-lg font-bold text-gray-900">
            {sessionDate}
          </h1>

          {/* Stats grid */}
          {session && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium uppercase text-gray-500">
                  Duration
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatDuration(session.duration_seconds)}
                </p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-medium uppercase text-gray-500">
                  Distance
                </p>
                <p className="mt-1 text-lg font-semibold text-gray-900">
                  {formatDistance(session.total_distance_meters)}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable content: Timeline + Annotations + Nearby Contacts */}
        <div className="flex-1 overflow-auto border-t border-gray-100">
          {/* Timeline */}
          <div className="px-4 py-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Breadcrumb Timeline
            </h2>
            {loadingBreadcrumbs ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
              </div>
            ) : sampledBreadcrumbs.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">
                No breadcrumb data available.
              </p>
            ) : (
              <div className="relative">
                {sampledBreadcrumbs.map((bc, idx) => {
                  const isFirst = idx === 0;
                  const isLast = idx === sampledBreadcrumbs.length - 1;

                  let dotColor = 'bg-gray-300';
                  if (isFirst) dotColor = 'bg-green-500';
                  if (isLast) dotColor = 'bg-red-500';

                  const time = new Date(bc.recorded_at).toLocaleTimeString(
                    'en-US',
                    { hour: 'numeric', minute: '2-digit', second: '2-digit' }
                  );

                  return (
                    <button
                      key={bc.id}
                      className="relative flex w-full items-start pb-4 text-left hover:bg-gray-50 rounded transition-colors"
                      onClick={() => flyTo(bc.latitude, bc.longitude)}
                    >
                      {/* Vertical line */}
                      {!isLast && (
                        <div className="absolute left-[5px] top-3 h-full w-px bg-gray-200" />
                      )}
                      {/* Dot */}
                      <div
                        className={`relative z-10 mt-0.5 h-[11px] w-[11px] flex-shrink-0 rounded-full ${dotColor}`}
                      />
                      {/* Content */}
                      <div className="ml-3 min-w-0">
                        <p className="text-xs font-medium text-gray-700">
                          {time}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {bc.latitude.toFixed(5)}, {bc.longitude.toFixed(5)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Annotations section */}
          <div className="border-t border-gray-100 px-4 py-3">
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Annotations ({annotations.length})
            </h2>
            {annotations.length === 0 ? (
              <p className="py-2 text-xs text-gray-400">
                No annotations yet. Click on the route to add one.
              </p>
            ) : (
              <div className="space-y-2">
                {annotations.map((ann) => {
                  const contactName = getAnnotationContactName(ann);
                  const isSelected = selectedAnnotation?.id === ann.id;
                  const time = ann.created_at
                    ? new Date(ann.created_at).toLocaleTimeString('en-US', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '';

                  return (
                    <button
                      key={ann.id}
                      className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                        isSelected
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-gray-100 hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setSelectedAnnotation(ann);
                        setEditingNote(ann.note);
                        setLinkingAnnotationId(null);
                        flyTo(ann.latitude, ann.longitude);
                      }}
                    >
                      <div className="flex items-start gap-2">
                        {/* Amber dot */}
                        <div className="mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full bg-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-gray-800 line-clamp-2">
                            {ann.note || '(empty note)'}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2">
                            {time && (
                              <span className="text-[11px] text-gray-400">
                                {time}
                              </span>
                            )}
                            {contactName && (
                              <>
                                <span className="text-[11px] text-gray-300">|</span>
                                <span className="text-[11px] font-medium text-green-600">
                                  {contactName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Nearby contacts section */}
          {nearbyContacts.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-3">
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Nearby Contacts ({nearbyContacts.length})
              </h2>
              <div className="space-y-1.5">
                {nearbyContacts.map((contact) => (
                  <button
                    key={contact.id}
                    className="flex w-full items-center gap-2 rounded-lg p-2 text-left hover:bg-gray-50 transition-colors"
                    onClick={() => {
                      if (contact.latitude != null && contact.longitude != null) {
                        flyTo(contact.latitude, contact.longitude);
                      }
                    }}
                  >
                    <div className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-green-500" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-gray-800">
                        {getContactDisplayName(contact)}
                      </p>
                      {contact.address && (
                        <p className="truncate text-[11px] text-gray-400">
                          {contact.address}
                        </p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right panel -- Map + overlays */}
      <div className="relative flex-1">
        <div
          ref={mapContainerRef}
          className="h-full w-full"
          style={{ height: '100%', width: '100%' }}
        />

        {/* Legend overlay */}
        <div className="absolute bottom-4 left-4 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center gap-4 text-[11px] text-gray-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
              Start
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
              End
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
              Annotation
            </span>
            {nearbyContacts.length > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-400 ring-1 ring-green-500" />
                Contact
              </span>
            )}
          </div>
        </div>

        {/* New annotation dialog */}
        {newAnnotationPos && (
          <div className="absolute right-4 top-4 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Add Annotation
              </h3>
              <button
                onClick={() => {
                  setNewAnnotationPos(null);
                  setNewAnnotationNote('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="mb-2 text-[11px] text-gray-400">
              {newAnnotationPos.lat.toFixed(5)}, {newAnnotationPos.lng.toFixed(5)}
            </p>
            <textarea
              value={newAnnotationNote}
              onChange={(e) => setNewAnnotationNote(e.target.value)}
              placeholder="Write a note..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
              autoFocus
            />
            <button
              onClick={handleCreateAnnotation}
              disabled={isCreatingAnnotation || !newAnnotationNote.trim()}
              className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {isCreatingAnnotation ? 'Saving...' : 'Save Annotation'}
            </button>
          </div>
        )}

        {/* Selected annotation editor */}
        {selectedAnnotation && !newAnnotationPos && (
          <div className="absolute right-4 top-4 w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">
                Edit Annotation
              </h3>
              <button
                onClick={() => {
                  setSelectedAnnotation(null);
                  setEditingNote('');
                  setLinkingAnnotationId(null);
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="mb-2 text-[11px] text-gray-400">
              {selectedAnnotation.latitude.toFixed(5)}, {selectedAnnotation.longitude.toFixed(5)}
            </p>

            {/* Note textarea */}
            <textarea
              value={editingNote}
              onChange={(e) => setEditingNote(e.target.value)}
              placeholder="Write a note..."
              rows={3}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
            />

            {/* Save / Delete buttons */}
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleSaveNote}
                disabled={isSavingNote || editingNote === selectedAnnotation.note}
                className="flex-1 rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {isSavingNote ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={handleDeleteAnnotation}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>

            {/* Linked contact display */}
            {selectedAnnotation.contact_id && (
              <div className="mt-3 rounded-lg border border-green-100 bg-green-50 p-2">
                <p className="text-[11px] font-medium uppercase text-green-700">
                  Linked Contact
                </p>
                <p className="text-sm text-green-800">
                  {getAnnotationContactName(selectedAnnotation) || 'Unknown'}
                </p>
              </div>
            )}

            {/* Link / Create contact buttons */}
            {!selectedAnnotation.contact_id && linkingAnnotationId !== selectedAnnotation.id && (
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setLinkingAnnotationId(selectedAnnotation.id);
                    setContactSearchQuery('');
                  }}
                  className="flex-1 rounded-lg border border-green-200 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
                >
                  <span className="flex items-center justify-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.136-9.136a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                    Link Contact
                  </span>
                </button>
                <Link
                  href={`/contacts/new?lat=${selectedAnnotation.latitude}&lng=${selectedAnnotation.longitude}&note=${encodeURIComponent(selectedAnnotation.note)}`}
                  className="flex-1 rounded-lg border border-blue-200 px-3 py-1.5 text-center text-sm font-medium text-blue-700 hover:bg-blue-50 transition-colors"
                >
                  <span className="flex items-center justify-center gap-1">
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                    </svg>
                    Create Contact
                  </span>
                </Link>
              </div>
            )}

            {/* Contact search picker for linking */}
            {linkingAnnotationId === selectedAnnotation.id && (
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-gray-700">
                    Select a contact to link
                  </p>
                  <button
                    onClick={() => {
                      setLinkingAnnotationId(null);
                      setContactSearchQuery('');
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
                <input
                  type="text"
                  value={contactSearchQuery}
                  onChange={(e) => setContactSearchQuery(e.target.value)}
                  placeholder="Search contacts..."
                  className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-100">
                  {filteredLinkContacts.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">
                      No contacts found.
                    </p>
                  ) : (
                    filteredLinkContacts.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleLinkContact(selectedAnnotation.id, c.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="h-2 w-2 flex-shrink-0 rounded-full bg-green-400" />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-gray-800">
                            {getContactDisplayName(c)}
                          </p>
                          {c.address && (
                            <p className="truncate text-[11px] text-gray-400">
                              {c.address}
                            </p>
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
