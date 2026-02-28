'use client';

import { useState, useCallback } from 'react';
import { useCRMStore } from '@realestate-crm/hooks';
import type {
  Contact,
  ContactSource,
  ContactType,
  ContactStatus,
  PreferredContactMethod,
} from '@realestate-crm/types';
import AddressAutocomplete from './AddressAutocomplete';

interface ContactFormDialogProps {
  contact: Contact | null;
  onClose: () => void;
  prefillAddress?: string;
  prefillCoords?: { lat: number; lng: number };
}

const SOURCE_OPTIONS: { value: ContactSource; label: string }[] = [
  { value: 'referral', label: 'Referral' },
  { value: 'web', label: 'Web' },
  { value: 'walk_in', label: 'Walk In' },
  { value: 'portal', label: 'Portal' },
  { value: 'phone', label: 'Phone' },
  { value: 'import', label: 'Import' },
];

const TYPE_OPTIONS: { value: ContactType; label: string }[] = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'seller', label: 'Seller' },
  { value: 'tenant', label: 'Tenant' },
  { value: 'landlord', label: 'Landlord' },
  { value: 'investor', label: 'Investor' },
  { value: 'other', label: 'Other' },
];

const STATUS_OPTIONS: { value: ContactStatus; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'archived', label: 'Archived' },
];

const CONTACT_METHOD_OPTIONS: { value: PreferredContactMethod; label: string }[] = [
  { value: 'phone', label: 'Phone' },
  { value: 'email', label: 'Email' },
  { value: 'sms', label: 'SMS' },
];

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
  const [selectedTags, setSelectedTags] = useState<string[]>(
    contact?.tags?.map((t) => t.id) || (contact?.tag_id ? [contact.tag_id] : [])
  );
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // New enrichment fields
  const [source, setSource] = useState<ContactSource | ''>(contact?.source || '');
  const [contactType, setContactType] = useState<ContactType | ''>(contact?.contact_type || '');
  const [companyName, setCompanyName] = useState(contact?.company_name || '');
  const [title, setTitle] = useState(contact?.title || '');
  const [preferredContactMethod, setPreferredContactMethod] = useState<PreferredContactMethod | ''>(contact?.preferred_contact_method || '');
  const [doNotContact, setDoNotContact] = useState(contact?.do_not_contact || false);
  const [notes, setNotes] = useState(contact?.notes || '');
  const [status, setStatus] = useState<ContactStatus | ''>(contact?.status || '');
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    contact?.next_follow_up_at ? contact.next_follow_up_at.split('T')[0] : ''
  );

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
        const enrichmentFields: Partial<Contact> = {
          source: source || undefined,
          contact_type: contactType || undefined,
          company_name: companyName.trim() || undefined,
          title: title.trim() || undefined,
          preferred_contact_method: preferredContactMethod || undefined,
          do_not_contact: doNotContact,
          notes: notes.trim() || undefined,
          status: status || undefined,
          next_follow_up_at: nextFollowUpAt ? new Date(nextFollowUpAt + 'T00:00:00').toISOString() : undefined,
        };

        if (isEditing) {
          await updateContact(contact.id, {
            first_name: firstName.trim(),
            last_name: lastName.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            tag_id: selectedTags[0] || undefined,
            tags: tags.filter((t) => selectedTags.includes(t.id)),
            ...enrichmentFields,
          });
        } else {
          const newContact = await addContact({
            first_name: firstName.trim(),
            last_name: lastName.trim() || undefined,
            email: email.trim() || undefined,
            phone: phone.trim() || undefined,
            address: address.trim() || undefined,
            tag_id: selectedTags[0] || undefined,
            tags: tags.filter((t) => selectedTags.includes(t.id)),
            latitude: coords?.lat,
            longitude: coords?.lng,
            ...enrichmentFields,
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
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to save contact';
        setError(message);
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
      selectedTags,
      tags,
      isEditing,
      contact,
      note,
      addContact,
      addActivity,
      updateContact,
      onClose,
      coords,
      source,
      contactType,
      companyName,
      title,
      preferredContactMethod,
      doNotContact,
      notes,
      status,
      nextFollowUpAt,
    ]
  );

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 rounded-t-xl">
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

            {/* Company & Title */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Company
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Source & Contact Type */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Source
                </label>
                <select
                  value={source}
                  onChange={(e) => setSource(e.target.value as ContactSource | '')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select...</option>
                  {SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Contact Type
                </label>
                <select
                  value={contactType}
                  onChange={(e) => setContactType(e.target.value as ContactType | '')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select...</option>
                  {TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preferred Contact Method & Status */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Preferred Contact
                </label>
                <select
                  value={preferredContactMethod}
                  onChange={(e) => setPreferredContactMethod(e.target.value as PreferredContactMethod | '')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select...</option>
                  {CONTACT_METHOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as ContactStatus | '')}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select...</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Next Follow-up & Do Not Contact */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Next Follow-up
                </label>
                <input
                  type="date"
                  value={nextFollowUpAt}
                  onChange={(e) => setNextFollowUpAt(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <div className="flex items-end pb-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={doNotContact}
                    onChange={(e) => setDoNotContact(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  Do Not Contact
                </label>
              </div>
            </div>

            {/* Tags (multi-select) */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Tags
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setTagDropdownOpen(!tagDropdownOpen)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <span className="flex flex-wrap gap-1">
                    {selectedTags.length === 0 ? (
                      <span className="text-gray-400">No tags</span>
                    ) : (
                      selectedTags.map((id) => {
                        const tag = tags.find((t) => t.id === id);
                        return tag ? (
                          <span
                            key={id}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: tag.color + '20', color: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ) : null;
                      })
                    )}
                  </span>
                  <svg className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>
                {tagDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setTagDropdownOpen(false)} />
                    <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                      {tags.map((tag) => (
                        <label
                          key={tag.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTags.includes(tag.id)}
                            onChange={() =>
                              setSelectedTags((prev) =>
                                prev.includes(tag.id)
                                  ? prev.filter((id) => id !== tag.id)
                                  : [...prev, tag.id]
                              )
                            }
                            className="rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                          />
                          <span
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-sm text-gray-700">{tag.name}</span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Contact notes..."
              />
            </div>

            {/* Initial note for new contacts */}
            {!isEditing && (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Initial Activity Note
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
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
