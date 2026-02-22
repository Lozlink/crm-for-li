'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useRouteStore, useCRMStore } from '@realestate-crm/hooks';
import { decodePolyline } from '@realestate-crm/api';
import type { RouteStatus, Contact, Activity } from '@realestate-crm/types';
import ContactFormDialog from './ContactFormDialog';

const RouteMap = dynamic(() => import('./RouteMap'), { ssr: false });

const STATUS_STYLES: Record<RouteStatus, string> = {
  planned: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  completed: 'bg-green-50 text-green-700',
};

const STATUS_LABELS: Record<RouteStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
};

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  note: 'Note',
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
};

const ACTIVITY_TYPE_ICONS: Record<string, string> = {
  note: '\u{1F4DD}',
  call: '\u{1F4DE}',
  meeting: '\u{1F91D}',
  email: '\u{2709}\u{FE0F}',
};

interface RouteDetailProps {
  routeId: string;
}

export default function RouteDetail({ routeId }: RouteDetailProps) {
  const router = useRouter();

  // Route store
  const activeRoute = useRouteStore((s) => s.activeRoute);
  const activeStops = useRouteStore((s) => s.activeStops);
  const isLoading = useRouteStore((s) => s.isLoading);
  const fetchRouteWithStops = useRouteStore((s) => s.fetchRouteWithStops);
  const updateRouteStatus = useRouteStore((s) => s.updateRouteStatus);
  const updateStopStatus = useRouteStore((s) => s.updateStopStatus);
  const updateStopNotes = useRouteStore((s) => s.updateStopNotes);
  const linkStopContact = useRouteStore((s) => s.linkStopContact);
  const deleteRoute = useRouteStore((s) => s.deleteRoute);
  const clearActiveRoute = useRouteStore((s) => s.clearActiveRoute);

  // CRM store
  const contacts = useCRMStore((s) => s.contacts);
  const activities = useCRMStore((s) => s.activities);
  const fetchContacts = useCRMStore((s) => s.fetchContacts);
  const fetchActivities = useCRMStore((s) => s.fetchActivities);
  const addActivity = useCRMStore((s) => s.addActivity);

  // Local UI state
  const [stopNotes, setStopNotes] = useState<Record<string, string>>({});
  const [deleting, setDeleting] = useState(false);

  // Expanded stop (shows contact linking + activity timeline)
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);

  // Editable notes state
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesText, setEditingNotesText] = useState('');

  // Contact linking state
  const [linkingContactId, setLinkingContactId] = useState<string | null>(null);
  const [contactSearchQuery, setContactSearchQuery] = useState('');

  // Contact creation dialog
  const [createContactForStop, setCreateContactForStop] = useState<string | null>(null);

  // Quick-add note state
  const [quickNoteStopId, setQuickNoteStopId] = useState<string | null>(null);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Track which stop's activities we've loaded
  const [loadedActivitiesContactId, setLoadedActivitiesContactId] = useState<string | null>(null);

  useEffect(() => {
    fetchRouteWithStops(routeId);
    return () => clearActiveRoute();
  }, [routeId, fetchRouteWithStops, clearActiveRoute]);

  // Fetch contacts list for linking (once)
  useEffect(() => {
    if (contacts.length === 0) {
      fetchContacts();
    }
  }, [contacts.length, fetchContacts]);

  // When a stop with a contact is expanded, fetch that contact's activities
  useEffect(() => {
    if (!expandedStopId) return;
    const stop = activeStops.find((s) => s.id === expandedStopId);
    if (stop?.contact_id && stop.contact_id !== loadedActivitiesContactId) {
      setLoadedActivitiesContactId(stop.contact_id);
      fetchActivities(stop.contact_id);
    }
  }, [expandedStopId, activeStops, loadedActivitiesContactId, fetchActivities]);

  const polylinePoints = useMemo(() => {
    if (!activeRoute?.polyline) return [];
    try {
      return decodePolyline(activeRoute.polyline);
    } catch {
      return [];
    }
  }, [activeRoute?.polyline]);

  const visitedCount = activeStops.filter((s) => s.status === 'visited').length;
  const totalStops = activeStops.length;
  const progressPercent = totalStops > 0 ? Math.round((visitedCount / totalStops) * 100) : 0;

  // Filtered contacts for search dropdown
  const filteredContacts = useMemo(() => {
    if (!contactSearchQuery.trim()) return contacts.slice(0, 10);
    const q = contactSearchQuery.toLowerCase();
    return contacts
      .filter((c) => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
        const addr = (c.address || '').toLowerCase();
        return name.includes(q) || addr.includes(q);
      })
      .slice(0, 10);
  }, [contacts, contactSearchQuery]);

  const handleStatusChange = async (status: RouteStatus) => {
    if (!activeRoute) return;
    await updateRouteStatus(activeRoute.id, status);
  };

  const handleStopVisited = async (stopId: string) => {
    await updateStopStatus(stopId, 'visited', stopNotes[stopId] || undefined);
    setStopNotes((prev) => {
      const next = { ...prev };
      delete next[stopId];
      return next;
    });
  };

  const handleStopSkipped = async (stopId: string) => {
    await updateStopStatus(stopId, 'skipped', stopNotes[stopId] || undefined);
    setStopNotes((prev) => {
      const next = { ...prev };
      delete next[stopId];
      return next;
    });
  };

  const handleDelete = async () => {
    if (!activeRoute) return;
    if (!confirm(`Delete route "${activeRoute.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteRoute(activeRoute.id);
    router.push('/routes');
  };

  const handleStartEditNotes = (stopId: string, currentNotes: string) => {
    setEditingNotesId(stopId);
    setEditingNotesText(currentNotes);
  };

  const handleSaveNotes = async () => {
    if (!editingNotesId) return;
    await updateStopNotes(editingNotesId, editingNotesText);
    setEditingNotesId(null);
    setEditingNotesText('');
  };

  const handleCancelEditNotes = () => {
    setEditingNotesId(null);
    setEditingNotesText('');
  };

  const handleLinkContact = async (stopId: string, contactId: string) => {
    await linkStopContact(stopId, contactId);
    setLinkingContactId(null);
    setContactSearchQuery('');
    // Re-fetch route to get updated contact join data
    fetchRouteWithStops(routeId);
  };

  const handleQuickAddNote = useCallback(async (contactId: string) => {
    if (!quickNoteText.trim()) return;
    setAddingNote(true);
    await addActivity({
      contact_id: contactId,
      type: 'note',
      content: quickNoteText.trim(),
    });
    setQuickNoteText('');
    setAddingNote(false);
    // Refresh activities
    fetchActivities(contactId);
  }, [quickNoteText, addActivity, fetchActivities]);

  const handleContactCreated = () => {
    setCreateContactForStop(null);
    // Refresh contacts list so it shows up in linking
    fetchContacts();
  };

  const toggleExpanded = (stopId: string) => {
    if (expandedStopId === stopId) {
      setExpandedStopId(null);
      setLinkingContactId(null);
      setContactSearchQuery('');
      setQuickNoteStopId(null);
      setQuickNoteText('');
    } else {
      setExpandedStopId(stopId);
      setLinkingContactId(null);
      setContactSearchQuery('');
      setQuickNoteStopId(null);
      setQuickNoteText('');
    }
  };

  function getContactName(stop: (typeof activeStops)[0]): string {
    if (!stop.contact) return '';
    const c = Array.isArray(stop.contact) ? stop.contact[0] : stop.contact;
    if (!c) return '';
    return [c.first_name, c.last_name].filter(Boolean).join(' ');
  }

  function getContactFromStop(stop: (typeof activeStops)[0]): Partial<Contact> | null {
    if (!stop.contact) return null;
    const c = Array.isArray(stop.contact) ? stop.contact[0] : stop.contact;
    return c || null;
  }

  function formatActivityTime(createdAt?: string): string {
    if (!createdAt) return '';
    const d = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!activeRoute) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">Route not found.</p>
        <Link href="/routes" className="text-sm text-primary-600 hover:underline">
          Back to Routes
        </Link>
      </div>
    );
  }

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

          {/* Route info */}
          <div className="mb-4">
            <h1 className="text-xl font-bold text-gray-900">{activeRoute.name}</h1>
            <div className="mt-2 flex items-center gap-2">
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[activeRoute.status]}`}>
                {STATUS_LABELS[activeRoute.status]}
              </span>
              <span className="text-xs capitalize text-gray-500">{activeRoute.mode}</span>
            </div>
          </div>

          {/* Progress bar */}
          {(activeRoute.status === 'in_progress' || activeRoute.status === 'completed') && totalStops > 0 && (
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>Progress</span>
                <span>{visitedCount} / {totalStops} stops</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-green-500 transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="mb-4 flex gap-2">
            {activeRoute.status === 'planned' && (
              <button
                onClick={() => handleStatusChange('in_progress')}
                className="flex-1 rounded-lg bg-primary-500 px-3 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
              >
                Start Route
              </button>
            )}
            {activeRoute.status === 'in_progress' && (
              <button
                onClick={() => handleStatusChange('completed')}
                className="flex-1 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600 transition-colors"
              >
                Complete Route
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>

          {/* Stops list */}
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Stops ({totalStops})
          </h2>
          <div className="space-y-2">
            {activeStops.map((stop, i) => {
              const contactName = getContactName(stop);
              const contactData = getContactFromStop(stop);
              const displayName = contactName || stop.address || `Stop ${i + 1}`;
              const isExpanded = expandedStopId === stop.id;
              const isEditingNotes = editingNotesId === stop.id;
              const isLinkingContact = linkingContactId === stop.id;
              const hasContact = !!stop.contact_id;

              return (
                <div
                  key={stop.id}
                  className="rounded-xl border border-gray-200 bg-white"
                >
                  {/* Stop header -- clickable to expand */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(stop.id)}
                    className="flex w-full items-start gap-2 p-3 text-left"
                  >
                    {/* Numbered badge */}
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-gray-900">
                          {displayName}
                        </p>
                        {/* Status icon */}
                        <span className="shrink-0 text-sm">
                          {stop.status === 'visited' && (
                            <span className="text-green-500" title="Visited">&#10003;</span>
                          )}
                          {stop.status === 'skipped' && (
                            <span className="text-orange-500" title="Skipped">&mdash;</span>
                          )}
                          {stop.status === 'pending' && (
                            <span className="text-gray-400" title="Pending">&#9675;</span>
                          )}
                        </span>
                      </div>
                      {contactName && stop.address && (
                        <p className="mt-0.5 truncate text-xs text-gray-500">{stop.address}</p>
                      )}
                      {/* Notes display (read-only, collapsed view) */}
                      {stop.notes && !isExpanded && (
                        <p className="mt-1 truncate text-xs text-gray-500 italic">{stop.notes}</p>
                      )}
                    </div>
                    {/* Chevron */}
                    <svg
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={1.5}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-3 pb-3">
                      {/* ---- Notes section ---- */}
                      {(stop.status === 'visited' || stop.status === 'skipped') && (
                        <div className="mt-3">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-600">Notes</span>
                            {!isEditingNotes && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEditNotes(stop.id, stop.notes || '');
                                }}
                                className="text-xs text-primary-600 hover:text-primary-700"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                          {isEditingNotes ? (
                            <div className="space-y-2">
                              <textarea
                                value={editingNotesText}
                                onChange={(e) => setEditingNotesText(e.target.value)}
                                rows={3}
                                className="w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                                placeholder="Add notes..."
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleSaveNotes}
                                  className="rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-600 transition-colors"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelEditNotes}
                                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              {stop.notes ? (
                                <p className="text-xs text-gray-500 italic">{stop.notes}</p>
                              ) : (
                                <p className="text-xs text-gray-400">No notes</p>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {/* ---- In-progress controls for pending stops ---- */}
                      {activeRoute.status === 'in_progress' && stop.status === 'pending' && (
                        <div className="mt-3 space-y-2">
                          <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={stopNotes[stop.id] || ''}
                            onChange={(e) =>
                              setStopNotes((prev) => ({ ...prev, [stop.id]: e.target.value }))
                            }
                            className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleStopVisited(stop.id)}
                              className="flex-1 rounded-md bg-green-500 px-2 py-1 text-xs font-medium text-white hover:bg-green-600 transition-colors"
                            >
                              Visited
                            </button>
                            <button
                              onClick={() => handleStopSkipped(stop.id)}
                              className="flex-1 rounded-md border border-orange-200 px-2 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50 transition-colors"
                            >
                              Skip
                            </button>
                          </div>
                        </div>
                      )}

                      {/* ---- Contact linking section ---- */}
                      <div className="mt-3">
                        <span className="mb-1 block text-xs font-medium text-gray-600">Contact</span>
                        {hasContact ? (
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/contacts/${stop.contact_id}`}
                              className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-colors"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                              </svg>
                              {contactName || 'View Contact'}
                            </Link>
                            {contactData?.phone && (
                              <span className="text-xs text-gray-400">{contactData.phone}</span>
                            )}
                          </div>
                        ) : (
                          <>
                            {isLinkingContact ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  placeholder="Search contacts by name or address..."
                                  value={contactSearchQuery}
                                  onChange={(e) => setContactSearchQuery(e.target.value)}
                                  className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                                  autoFocus
                                />
                                {filteredContacts.length > 0 ? (
                                  <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                                    {filteredContacts.map((c) => (
                                      <button
                                        key={c.id}
                                        type="button"
                                        onClick={() => handleLinkContact(stop.id, c.id)}
                                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-gray-50 transition-colors"
                                      >
                                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500">
                                          {(c.first_name?.[0] || '?').toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <p className="truncate text-xs font-medium text-gray-800">
                                            {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                                          </p>
                                          {c.address && (
                                            <p className="truncate text-[10px] text-gray-400">{c.address}</p>
                                          )}
                                        </div>
                                      </button>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400">No contacts found</p>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setLinkingContactId(null);
                                    setContactSearchQuery('');
                                  }}
                                  className="text-xs text-gray-500 hover:text-gray-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => setLinkingContactId(stop.id)}
                                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  Link Contact
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setCreateContactForStop(stop.id)}
                                  className="rounded-md border border-primary-200 px-2.5 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 transition-colors"
                                >
                                  Create Contact
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* ---- Activity timeline for linked contacts ---- */}
                      {hasContact && stop.contact_id && (
                        <div className="mt-3">
                          <span className="mb-1 block text-xs font-medium text-gray-600">Recent Activity</span>
                          {activities.length > 0 ? (
                            <div className="space-y-1.5">
                              {activities.slice(0, 5).map((activity: Activity) => (
                                <div
                                  key={activity.id}
                                  className="flex items-start gap-2 rounded-md bg-gray-50 px-2.5 py-1.5"
                                >
                                  <span className="shrink-0 text-xs" title={ACTIVITY_TYPE_LABELS[activity.type] || activity.type}>
                                    {ACTIVITY_TYPE_ICONS[activity.type] || ''}
                                  </span>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs text-gray-700">
                                      {activity.content || `${ACTIVITY_TYPE_LABELS[activity.type] || activity.type} logged`}
                                    </p>
                                    <p className="text-[10px] text-gray-400">
                                      {formatActivityTime(activity.created_at)}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No activity yet</p>
                          )}

                          {/* Quick-add note */}
                          {quickNoteStopId === stop.id ? (
                            <div className="mt-2 space-y-1.5">
                              <textarea
                                value={quickNoteText}
                                onChange={(e) => setQuickNoteText(e.target.value)}
                                rows={2}
                                placeholder="Write a note..."
                                className="w-full rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 placeholder-gray-400 focus:border-primary-300 focus:outline-none focus:ring-1 focus:ring-primary-300"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={addingNote || !quickNoteText.trim()}
                                  onClick={() => handleQuickAddNote(stop.contact_id!)}
                                  className="rounded-md bg-primary-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
                                >
                                  {addingNote ? 'Adding...' : 'Add Note'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setQuickNoteStopId(null);
                                    setQuickNoteText('');
                                  }}
                                  className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setQuickNoteStopId(stop.id)}
                              className="mt-2 text-xs text-primary-600 hover:text-primary-700"
                            >
                              + Add Note
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right panel -- Map */}
      <div className="flex-1">
        <RouteMap stops={activeStops} polylinePoints={polylinePoints} />
      </div>

      {/* Contact creation dialog */}
      {createContactForStop && (() => {
        const stop = activeStops.find((s) => s.id === createContactForStop);
        if (!stop) return null;
        return (
          <ContactFormDialog
            contact={null}
            onClose={handleContactCreated}
            prefillAddress={stop.address}
            prefillCoords={
              stop.latitude && stop.longitude
                ? { lat: stop.latitude, lng: stop.longitude }
                : undefined
            }
          />
        );
      })()}
    </div>
  );
}
