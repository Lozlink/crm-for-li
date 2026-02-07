'use client';

import { useState, useCallback } from 'react';
import { useCRMStore } from '@realestate-crm/hooks';
import type { Contact } from '@realestate-crm/types';
import AddressAutocomplete from './AddressAutocomplete';

interface ContactFormDialogProps {
  contact: Contact | null;
  onClose: () => void;
  prefillAddress?: string;
  prefillCoords?: { lat: number; lng: number };
}

export default function ContactFormDialog({
  contact,
  onClose,
  prefillAddress,
  prefillCoords,
}: ContactFormDialogProps) {
  const tags = useCRMStore((s) => s.tags);
  const addContact = useCRMStore((s) => s.addContact);
  const updateContact = useCRMStore((s) => s.updateContact);
  const addActivity = useCRMStore((s) => s.addActivity);

  const [firstName, setFirstName] = useState(contact?.first_name || '');
  const [lastName, setLastName] = useState(contact?.last_name || '');
  const [email, setEmail] = useState(contact?.email || '');
  const [phone, setPhone] = useState(contact?.phone || '');
  const [address, setAddress] = useState(contact?.address || prefillAddress || '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>(prefillCoords);
  const [tagId, setTagId] = useState(contact?.tag_id || '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEditing = !!contact;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!firstName.trim()) {
        setError('First name is required');
        return;
      }

      setSaving(true);
      setError('');

      try {
        if (isEditing) {
          await updateContact(contact.id, {
            first_name: firstName.trim(),
            last_name: lastName.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            tag_id: tagId || undefined,
          });
        } else {
          const newContact = await addContact({
            first_name: firstName.trim(),
            last_name: lastName.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            tag_id: tagId || undefined,
            latitude: coords?.lat,
            longitude: coords?.lng,
          });
          if (newContact && note.trim()) {
            await addActivity({
              contact_id: newContact.id,
              type: 'note',
              content: note.trim(),
            });
          }
        }
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to save contact');
      } finally {
        setSaving(false);
      }
    },
    [
      firstName,
      lastName,
      email,
      phone,
      address,
      tagId,
      isEditing,
      contact,
      note,
      addContact,
      addActivity,
      updateContact,
      onClose,
      coords,
    ]
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEditing ? 'Edit Contact' : 'New Contact'}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6">
          <div className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  First Name *
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Last Name
                </label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Email & Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Phone
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Address
              </label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                onSelect={(addr, lat, lng) => {
                  setAddress(addr);
                  if (lat !== 0 || lng !== 0) setCoords({ lat, lng });
                }}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Street address, suburb, state"
              />
            </div>

            {/* Tag */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tag
              </label>
              <select
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                <option value="">No tag</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Note */}
            {!isEditing && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Note
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Add an initial note..."
                />
              </div>
            )}

          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Contact'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
