'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCRMStore } from '@realestate-crm/hooks';
import type { Contact, ActivityWithContact } from '@realestate-crm/types';

interface ContactNoteGroup {
  contact: Contact;
  notes: ActivityWithContact[];
  latestNote: string;
  latestDate: string;
  noteCount: number;
}

export default function NotesView() {
  const contacts = useCRMStore((s) => s.contacts);
  const recentActivities = useCRMStore((s) => s.recentActivities);
  const fetchRecentActivities = useCRMStore((s) => s.fetchRecentActivities);
  const findContactByAddress = useCRMStore((s) => s.findContactByAddress);
  const addActivity = useCRMStore((s) => s.addActivity);
  const router = useRouter();

  const [search, setSearch] = useState('');

  // Quick-add note state
  const [showAddNote, setShowAddNote] = useState(false);
  const [noteAddress, setNoteAddress] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteContactId, setNoteContactId] = useState<string | null>(null);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');

  // Auto-suggest contact when address typed
  const suggestedContact = useMemo(() => {
    if (!noteAddress.trim()) return undefined;
    return findContactByAddress(noteAddress);
  }, [noteAddress, findContactByAddress]);

  // When a suggestion appears and no explicit contact selected, use it
  useEffect(() => {
    if (suggestedContact && noteContactId === null) {
      setNoteContactId(suggestedContact.id);
    } else if (!suggestedContact && noteContactId !== null) {
      setNoteContactId(null);
    }
  }, [suggestedContact, noteContactId]);

  const handleAddNote = useCallback(async () => {
    if (!noteContent.trim()) {
      setNoteError('Note content is required');
      return;
    }
    if (!noteContactId) {
      setNoteError('No matching contact found for that address');
      return;
    }
    setNoteSaving(true);
    setNoteError('');
    try {
      await addActivity({ contact_id: noteContactId, type: 'note', content: noteContent.trim() });
      await fetchRecentActivities(500);
      setShowAddNote(false);
      setNoteAddress('');
      setNoteContent('');
      setNoteContactId(null);
    } catch {
      setNoteError('Failed to save note');
    } finally {
      setNoteSaving(false);
    }
  }, [noteContent, noteContactId, addActivity, fetchRecentActivities]);

  useEffect(() => {
    fetchRecentActivities(500);
  }, [fetchRecentActivities]);

  const contactMap = useMemo(() => {
    const map = new Map<string, Contact>();
    for (const c of contacts) {
      map.set(c.id, c);
    }
    return map;
  }, [contacts]);

  const noteGroups = useMemo(() => {
    // Filter to only note-type activities
    const noteActivities = recentActivities.filter((a) => a.type === 'note');

    // Group by contact_id
    const grouped = new Map<string, ActivityWithContact[]>();
    for (const activity of noteActivities) {
      const existing = grouped.get(activity.contact_id) || [];
      existing.push(activity);
      grouped.set(activity.contact_id, existing);
    }

    // Build groups
    const groups: ContactNoteGroup[] = [];
    for (const [contactId, notes] of Array.from(grouped.entries())) {
      const contact = contactMap.get(contactId);
      if (!contact) continue;

      // Sort notes by date descending
      notes.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

      groups.push({
        contact,
        notes,
        latestNote: notes[0]?.content || '',
        latestDate: notes[0]?.created_at || '',
        noteCount: notes.length,
      });
    }

    // Sort by latest date descending
    groups.sort((a, b) => b.latestDate.localeCompare(a.latestDate));

    return groups;
  }, [recentActivities, contactMap]);

  const filtered = useMemo(() => {
    if (!search) return noteGroups;
    const q = search.toLowerCase();
    return noteGroups.filter((g) => {
      const address = (g.contact.address || '').toLowerCase();
      const name = `${g.contact.first_name || ''} ${g.contact.last_name || ''}`.toLowerCase();
      const noteContent = g.notes.some((n) => (n.content || '').toLowerCase().includes(q));
      return address.includes(q) || name.includes(q) || noteContent;
    });
  }, [noteGroups, search]);

  const totalNotes = noteGroups.reduce((sum, g) => sum + g.noteCount, 0);

  function getContactTags(contact: Contact) {
    if (contact.tags && contact.tags.length > 0) return contact.tags;
    if (contact.tag) return [contact.tag];
    return [];
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notes</h1>
          <p className="text-sm text-gray-500">
            {totalNotes} notes across {noteGroups.length} contacts
          </p>
        </div>
        <button
          onClick={() => setShowAddNote((v) => !v)}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
        >
          {showAddNote ? 'Cancel' : 'Add Note'}
        </button>
      </div>

      {/* Quick-add note panel */}
      {showAddNote && (
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">New Note</h3>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Address (auto-matches contact)
              </label>
              <input
                type="text"
                value={noteAddress}
                onChange={(e) => setNoteAddress(e.target.value)}
                placeholder="e.g. 45 Smith St, Parramatta"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              {noteAddress.trim() && (
                <p className="mt-1 text-xs">
                  {suggestedContact ? (
                    <span className="text-green-600">
                      Matched: {suggestedContact.first_name} {suggestedContact.last_name || ''}
                    </span>
                  ) : (
                    <span className="text-amber-600">No contact found at this address</span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Note</label>
              <textarea
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={3}
                placeholder="Enter note..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            {noteError && (
              <p className="text-xs text-red-600">{noteError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowAddNote(false); setNoteAddress(''); setNoteContent(''); setNoteError(''); }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleAddNote}
                disabled={noteSaving || !noteContactId || !noteContent.trim()}
                className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
              >
                {noteSaving ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by address, name, or note content..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-md rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Address</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500 max-w-xs">Latest Note</th>
                <th className="px-4 py-3 text-center font-medium text-gray-500">Notes</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Tags</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Last Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    {search
                      ? 'No notes match your search.'
                      : 'No notes yet. Add notes to contacts to see them here.'}
                  </td>
                </tr>
              ) : (
                filtered.map((group) => {
                  const tags = getContactTags(group.contact);
                  const isQuickNote = !group.contact.first_name;
                  const displayName = isQuickNote
                    ? null
                    : [group.contact.first_name, group.contact.last_name].filter(Boolean).join(' ');

                  return (
                    <tr
                      key={group.contact.id}
                      onClick={() => router.push(`/contacts/${group.contact.id}`)}
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <div className="font-medium text-gray-900">
                            {group.contact.address || 'No address'}
                          </div>
                          {isQuickNote ? (
                            <div className="text-xs italic text-gray-400">Quick note</div>
                          ) : (
                            <div className="text-xs text-gray-500">{displayName}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <span className="block truncate text-gray-600">
                          {group.latestNote || '\u2014'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-primary-50 px-2 text-xs font-medium text-primary-700">
                          {group.noteCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {tags.length > 0 ? (
                            tags.map((tag) => (
                              <span
                                key={tag.id}
                                className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                                style={{
                                  backgroundColor: tag.color + '20',
                                  color: tag.color,
                                }}
                              >
                                {tag.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {group.latestDate
                          ? new Date(group.latestDate).toLocaleDateString('en-AU', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : '\u2014'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
