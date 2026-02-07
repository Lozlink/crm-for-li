'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCRMStore } from '@realestate-crm/hooks';
import { ACTIVITY_TYPES } from '@realestate-crm/config';
import type { Activity } from '@realestate-crm/types';
import ContactFormDialog from './ContactFormDialog';

interface ContactDetailProps {
  contactId: string;
}

export default function ContactDetail({ contactId }: ContactDetailProps) {
  const contacts = useCRMStore((s) => s.contacts);
  const activities = useCRMStore((s) => s.activities);
  const fetchActivities = useCRMStore((s) => s.fetchActivities);
  const addActivity = useCRMStore((s) => s.addActivity);
  const deleteContact = useCRMStore((s) => s.deleteContact);
  const router = useRouter();

  const [showEditForm, setShowEditForm] = useState(false);
  const [newActivityType, setNewActivityType] = useState<string>('note');
  const [newActivityContent, setNewActivityContent] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);

  const contact = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contacts, contactId]
  );

  useEffect(() => {
    if (contactId) {
      fetchActivities(contactId);
    }
  }, [contactId, fetchActivities]);

  const contactActivities = useMemo(
    () => activities.filter((a) => a.contact_id === contactId),
    [activities, contactId]
  );

  const handleAddActivity = useCallback(async () => {
    if (!newActivityContent.trim()) return;
    setAddingActivity(true);
    await addActivity({
      contact_id: contactId,
      type: newActivityType as Activity['type'],
      content: newActivityContent.trim(),
    });
    setNewActivityContent('');
    setAddingActivity(false);
    // Refresh activities
    await fetchActivities(contactId);
  }, [contactId, newActivityType, newActivityContent, addActivity, fetchActivities]);

  const handleDelete = useCallback(async () => {
    if (
      window.confirm(
        `Delete "${contact?.first_name || ''} ${contact?.last_name || ''}"? This cannot be undone.`
      )
    ) {
      await deleteContact(contactId);
      router.push('/contacts');
    }
  }, [contact, contactId, deleteContact, router]);

  if (!contact) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">Contact not found</p>
          <Link
            href="/contacts"
            className="mt-2 inline-block text-sm text-primary-500 hover:text-primary-600"
          >
            Back to contacts
          </Link>
        </div>
      </div>
    );
  }

  const displayName = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/contacts"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Contacts
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Contact info panel */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            {/* Avatar & name */}
            <div className="mb-4 flex items-center gap-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold text-white"
                style={{
                  backgroundColor: contact.tag?.color || '#9CA3AF',
                }}
              >
                {(contact.first_name?.[0] || '?').toUpperCase()}
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {displayName || 'Unnamed'}
                </h1>
                {contact.tag && (
                  <span
                    className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                    style={{
                      backgroundColor: contact.tag.color + '20',
                      color: contact.tag.color,
                    }}
                  >
                    {contact.tag.name}
                  </span>
                )}
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              {contact.email && (
                <DetailRow
                  label="Email"
                  value={contact.email}
                  href={`mailto:${contact.email}`}
                />
              )}
              {contact.phone && (
                <DetailRow
                  label="Phone"
                  value={contact.phone}
                  href={`tel:${contact.phone}`}
                />
              )}
              {contact.address && (
                <DetailRow label="Address" value={contact.address} />
              )}
              <DetailRow
                label="Added"
                value={new Date(contact.created_at || '').toLocaleDateString(
                  'en-AU',
                  { year: 'numeric', month: 'long', day: 'numeric' }
                )}
              />
            </div>

            {/* Actions */}
            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setShowEditForm(true)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Edit
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        {/* Activity section */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              Activity
            </h2>

            {/* Add activity form */}
            <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="mb-3 flex gap-2">
                {ACTIVITY_TYPES.map((config) => (
                  <button
                    key={config.value}
                    onClick={() => setNewActivityType(config.value)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      newActivityType === config.value
                        ? 'bg-primary-500 text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {config.label}
                  </button>
                ))}
              </div>
              <textarea
                value={newActivityContent}
                onChange={(e) => setNewActivityContent(e.target.value)}
                placeholder={`Add a ${newActivityType}...`}
                rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <div className="mt-2 flex justify-end">
                <button
                  onClick={handleAddActivity}
                  disabled={!newActivityContent.trim() || addingActivity}
                  className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  {addingActivity ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>

            {/* Activity timeline */}
            {contactActivities.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                No activity yet. Add a note, call, meeting, or email above.
              </p>
            ) : (
              <div className="space-y-4">
                {contactActivities.map((activity) => (
                  <ActivityItem key={activity.id} activity={activity} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Edit form dialog */}
      {showEditForm && (
        <ContactFormDialog
          contact={contact}
          onClose={() => setShowEditForm(false)}
        />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase text-gray-400">{label}</p>
      {href ? (
        <a
          href={href}
          className="text-sm text-primary-500 hover:text-primary-600"
        >
          {value}
        </a>
      ) : (
        <p className="text-sm text-gray-700">{value}</p>
      )}
    </div>
  );
}

function ActivityItem({ activity }: { activity: Activity }) {
  const typeConfig = ACTIVITY_TYPES.find((t) => t.value === activity.type);
  const date = new Date(activity.created_at || '');

  const typeColors: Record<string, string> = {
    note: 'bg-blue-100 text-blue-600',
    call: 'bg-green-100 text-green-600',
    meeting: 'bg-purple-100 text-purple-600',
    email: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="flex gap-3">
      <div
        className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-xs ${typeColors[activity.type] || 'bg-gray-100 text-gray-500'}`}
      >
        {(typeConfig?.label?.[0] || activity.type[0]).toUpperCase()}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium text-gray-900">
            {typeConfig?.label || activity.type}
          </span>
          <span className="text-xs text-gray-400">
            {date.toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}{' '}
            {date.toLocaleTimeString('en-AU', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
        <p className="mt-0.5 text-sm text-gray-600 whitespace-pre-wrap">
          {activity.content}
        </p>
      </div>
    </div>
  );
}
