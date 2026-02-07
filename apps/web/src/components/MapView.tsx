'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCRMStore } from '@realestate-crm/hooks';
import { DEFAULT_MAP_REGION } from '@realestate-crm/config';
import type { Contact } from '@realestate-crm/types';

// Leaflet must be loaded client-side only
const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

export default function MapView() {
  const contacts = useCRMStore((s) => s.contacts);
  const tags = useCRMStore((s) => s.tags);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const mappableContacts = useMemo(() => {
    let result = contacts.filter((c) => c.latitude && c.longitude);
    if (selectedTagIds.length > 0) {
      result = result.filter(
        (c) => c.tag_id && selectedTagIds.includes(c.tag_id)
      );
    }
    return result;
  }, [contacts, selectedTagIds]);

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-gray-900">Map</h1>
        <span className="text-sm text-gray-500">
          {mappableContacts.length} contacts with location
        </span>
        <div className="flex-1" />
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedTagIds.includes(tag.id)
                  ? 'border-transparent text-white'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}
              style={
                selectedTagIds.includes(tag.id)
                  ? { backgroundColor: tag.color }
                  : {}
              }
            >
              {tag.name}
            </button>
          ))}
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
      <div className="flex flex-1">
        <div className="flex-1">
          <LeafletMap
            contacts={mappableContacts}
            center={[DEFAULT_MAP_REGION.latitude, DEFAULT_MAP_REGION.longitude]}
            zoom={13}
            onSelectContact={setSelectedContact}
          />
        </div>

        {/* Contact sidebar */}
        {selectedContact && (
          <div className="w-72 border-l border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    backgroundColor:
                      selectedContact.tag?.color || '#9CA3AF',
                  }}
                >
                  {(selectedContact.first_name?.[0] || '?').toUpperCase()}
                </div>
                <div>
                  <p className="font-medium text-gray-900">
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
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mt-4 space-y-2 text-sm">
              {selectedContact.email && (
                <p className="text-gray-600">{selectedContact.email}</p>
              )}
              {selectedContact.phone && (
                <p className="text-gray-600">{selectedContact.phone}</p>
              )}
              {selectedContact.address && (
                <p className="text-gray-500">{selectedContact.address}</p>
              )}
            </div>

            <Link
              href={`/contacts/${selectedContact.id}`}
              className="mt-4 block rounded-lg bg-primary-500 px-3 py-2 text-center text-sm font-medium text-white hover:bg-primary-600"
            >
              View Details
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
