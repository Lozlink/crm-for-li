'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useCRMStore,
  useEmailCampaignStore,
  useBuyerMatchStore,
  usePropertyStore,
  useInspectionStore,
} from '@realestate-crm/hooks';
import { ACTIVITY_TYPES } from '@realestate-crm/config';
import type {
  Activity,
  Contact,
  ContactRequirement,
  Property,
  PropertyContactRole,
  Inspection,
  InspectionAttendee,
} from '@realestate-crm/types';
import ContactFormDialog from './ContactFormDialog';

// --- Helper constants ---

const CONTACT_TYPE_COLORS: Record<string, string> = {
  buyer: 'bg-blue-100 text-blue-700',
  seller: 'bg-green-100 text-green-700',
  tenant: 'bg-purple-100 text-purple-700',
  landlord: 'bg-amber-100 text-amber-700',
  investor: 'bg-cyan-100 text-cyan-700',
  other: 'bg-gray-100 text-gray-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  archived: 'bg-red-100 text-red-700',
};

const INTEREST_COLORS: Record<string, string> = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-amber-100 text-amber-700',
  cold: 'bg-blue-100 text-blue-700',
};

const PROPERTY_STATUS_COLORS: Record<string, string> = {
  appraisal: 'bg-gray-100 text-gray-700',
  available: 'bg-green-100 text-green-700',
  under_offer: 'bg-amber-100 text-amber-700',
  exchanged: 'bg-blue-100 text-blue-700',
  settled: 'bg-purple-100 text-purple-700',
  leased: 'bg-cyan-100 text-cyan-700',
  withdrawn: 'bg-red-100 text-red-700',
};

const ROLE_COLORS: Record<string, string> = {
  vendor: 'bg-green-100 text-green-700',
  buyer: 'bg-blue-100 text-blue-700',
  tenant: 'bg-purple-100 text-purple-700',
  landlord: 'bg-amber-100 text-amber-700',
  solicitor: 'bg-gray-100 text-gray-700',
};

const CATEGORY_OPTIONS = [
  'house', 'apartment', 'townhouse', 'land', 'unit', 'villa', 'acreage', 'block_of_units',
] as const;

type TabKey = 'activity' | 'requirements' | 'properties' | 'inspections' | 'subscription';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'activity', label: 'Activity' },
  { key: 'requirements', label: 'Requirements' },
  { key: 'properties', label: 'Properties' },
  { key: 'inspections', label: 'Inspections' },
  { key: 'subscription', label: 'Subscription' },
];

// --- Helpers ---

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

function formatPrice(n: number | undefined | null): string {
  if (n == null) return '-';
  return '$' + n.toLocaleString();
}

// --- Main component ---

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

  const fetchSubscription = useEmailCampaignStore((s) => s.fetchSubscription);
  const updateSubscription = useEmailCampaignStore((s) => s.updateSubscription);
  const [emailSubscribed, setEmailSubscribed] = useState(true);

  // Buyer match store
  const requirements = useBuyerMatchStore((s) => s.requirements);
  const fetchRequirements = useBuyerMatchStore((s) => s.fetchRequirements);
  const createRequirement = useBuyerMatchStore((s) => s.createRequirement);
  const updateRequirement = useBuyerMatchStore((s) => s.updateRequirement);
  const deleteRequirement = useBuyerMatchStore((s) => s.deleteRequirement);
  const findMatchingProperties = useBuyerMatchStore((s) => s.findMatchingProperties);

  // Property store
  const properties = usePropertyStore((s) => s.properties);
  const fetchProperties = usePropertyStore((s) => s.fetchProperties);
  const addPropertyContact = usePropertyStore((s) => s.addPropertyContact);

  // Inspection store
  const inspections = useInspectionStore((s) => s.inspections);
  const fetchInspections = useInspectionStore((s) => s.fetchInspections);

  const [showEditForm, setShowEditForm] = useState(false);
  const [newActivityType, setNewActivityType] = useState<string>('note');
  const [newActivityContent, setNewActivityContent] = useState('');
  const [addingActivity, setAddingActivity] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('activity');

  // Requirements tab state
  const [showReqForm, setShowReqForm] = useState(false);
  const [editingReqId, setEditingReqId] = useState<string | null>(null);
  const [reqMatches, setReqMatches] = useState<Record<string, Property[]>>({});

  // Properties tab state
  const [linkPropertyId, setLinkPropertyId] = useState('');
  const [linkRole, setLinkRole] = useState<PropertyContactRole>('buyer');

  const contact = useMemo(
    () => contacts.find((c) => c.id === contactId),
    [contacts, contactId]
  );

  // Initial fetch
  useEffect(() => {
    if (contactId) {
      fetchActivities(contactId);
      fetchSubscription(contactId).then((sub) => {
        if (sub) setEmailSubscribed(sub.subscribed);
      });
      fetchRequirements(contactId);
      fetchProperties();
      fetchInspections();
    }
  }, [contactId, fetchActivities, fetchSubscription, fetchRequirements, fetchProperties, fetchInspections]);

  const contactActivities = useMemo(
    () => activities.filter((a) => a.contact_id === contactId),
    [activities, contactId]
  );

  // Properties linked to this contact
  const linkedProperties = useMemo(() => {
    return properties
      .filter((p) =>
        p.property_contacts?.some((pc) => pc.contact_id === contactId)
      )
      .map((p) => ({
        ...p,
        role: p.property_contacts?.find((pc) => pc.contact_id === contactId)?.role,
      }));
  }, [properties, contactId]);

  // Inspections where this contact is an attendee
  const contactInspections = useMemo(() => {
    const result: { inspection: Inspection; attendee: InspectionAttendee }[] = [];
    for (const insp of inspections) {
      if (insp.attendees) {
        for (const att of insp.attendees) {
          if (att.contact_id === contactId) {
            result.push({ inspection: insp, attendee: att });
          }
        }
      }
    }
    return result;
  }, [inspections, contactId]);

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
    await fetchActivities(contactId);
  }, [contactId, newActivityType, newActivityContent, addActivity, fetchActivities]);

  const handleCall = useCallback(async () => {
    if (!contact?.phone) return;
    await addActivity({
      contact_id: contactId,
      type: 'call',
      content: 'Outgoing call',
    });
    window.open(`tel:${contact.phone}`, '_self');
    await fetchActivities(contactId);
  }, [contact, contactId, addActivity, fetchActivities]);

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

  const handleFindMatches = useCallback(
    (req: ContactRequirement) => {
      const matched = findMatchingProperties(req, properties);
      setReqMatches((prev) => ({ ...prev, [req.id]: matched }));
    },
    [findMatchingProperties, properties]
  );

  const handleDeleteRequirement = useCallback(
    async (id: string) => {
      if (window.confirm('Delete this requirement?')) {
        await deleteRequirement(id);
      }
    },
    [deleteRequirement]
  );

  const handleLinkProperty = useCallback(async () => {
    if (!linkPropertyId) return;
    await addPropertyContact(linkPropertyId, contactId, linkRole);
    setLinkPropertyId('');
    await fetchProperties();
  }, [linkPropertyId, linkRole, contactId, addPropertyContact, fetchProperties]);

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
        {/* LEFT COLUMN: Header + Info Card */}
        <div className="lg:col-span-1 space-y-4">
          {/* Contact Header Card */}
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
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-gray-900 truncate">
                  {displayName || 'Unnamed'}
                </h1>
                <div className="mt-1 flex flex-wrap gap-1">
                  {contact.contact_type && (
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CONTACT_TYPE_COLORS[contact.contact_type] || 'bg-gray-100 text-gray-700'}`}>
                      {contact.contact_type.charAt(0).toUpperCase() + contact.contact_type.slice(1)}
                    </span>
                  )}
                  {contact.status && (
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[contact.status] || 'bg-gray-100 text-gray-600'}`}>
                      {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="mb-3 flex flex-wrap gap-1">
              {(contact.tags && contact.tags.length > 0
                ? contact.tags
                : contact.tag
                  ? [contact.tag]
                  : []
              ).map((tag) => (
                <span
                  key={tag.id}
                  className="inline-block rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: tag.color + '20', color: tag.color }}
                >
                  {tag.name}
                </span>
              ))}
            </div>

            {/* Do Not Contact warning */}
            {contact.do_not_contact && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                <p className="text-sm font-medium text-red-700">Do Not Contact</p>
                <p className="text-xs text-red-600">This contact has been flagged as do-not-contact.</p>
              </div>
            )}

            {/* Quick action buttons */}
            <div className="mb-4 flex gap-2">
              {contact.phone && (
                <button
                  onClick={handleCall}
                  className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700"
                >
                  Call
                </button>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
                >
                  Email
                </a>
              )}
              {contact.phone && (
                <a
                  href={`sms:${contact.phone}`}
                  className="flex-1 rounded-lg bg-purple-600 px-3 py-2 text-center text-sm font-medium text-white hover:bg-purple-700"
                >
                  SMS
                </a>
              )}
            </div>

            {/* Edit / Delete */}
            <div className="flex gap-2">
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

          {/* Info Card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">Contact Info</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {contact.email && (
                <div className="col-span-2">
                  <InfoLabel label="Email" />
                  <a href={`mailto:${contact.email}`} className="text-sm text-primary-500 hover:text-primary-600 break-all">{contact.email}</a>
                </div>
              )}
              {contact.phone && (
                <div className="col-span-2">
                  <InfoLabel label="Phone" />
                  <a href={`tel:${contact.phone}`} className="text-sm text-primary-500 hover:text-primary-600">{contact.phone}</a>
                </div>
              )}
              {contact.address && (
                <div className="col-span-2">
                  <InfoLabel label="Address" />
                  <p className="text-sm text-gray-700">{contact.address}</p>
                </div>
              )}
              {(contact.company_name || contact.title) && (
                <>
                  {contact.company_name && (
                    <div>
                      <InfoLabel label="Company" />
                      <p className="text-sm text-gray-700">{contact.company_name}</p>
                    </div>
                  )}
                  {contact.title && (
                    <div>
                      <InfoLabel label="Title" />
                      <p className="text-sm text-gray-700">{contact.title}</p>
                    </div>
                  )}
                </>
              )}
              {contact.source && (
                <div>
                  <InfoLabel label="Source" />
                  <p className="text-sm text-gray-700 capitalize">{contact.source.replace(/_/g, ' ')}</p>
                </div>
              )}
              {contact.preferred_contact_method && (
                <div>
                  <InfoLabel label="Preferred Contact" />
                  <p className="text-sm text-gray-700 capitalize">{contact.preferred_contact_method}</p>
                </div>
              )}

              {/* Lead Score */}
              <div className="col-span-2">
                <InfoLabel label="Lead Score" />
                <LeadScoreBar score={contact.lead_score} />
              </div>

              {contact.last_contacted_at && (
                <div>
                  <InfoLabel label="Last Contacted" />
                  <p className="text-sm text-gray-700">{relativeTime(contact.last_contacted_at)}</p>
                </div>
              )}
              {contact.next_follow_up_at && (
                <div>
                  <InfoLabel label="Next Follow-up" />
                  <p className="text-sm text-gray-700">
                    {new Date(contact.next_follow_up_at).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
              <div className="col-span-2">
                <InfoLabel label="Added" />
                <p className="text-sm text-gray-700">
                  {new Date(contact.created_at || '').toLocaleDateString('en-AU', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>
              {contact.notes && (
                <div className="col-span-2">
                  <InfoLabel label="Notes" />
                  <p className="text-sm text-gray-700 whitespace-pre-wrap bg-gray-50 rounded-lg p-2 mt-1">{contact.notes}</p>
                </div>
              )}
            </div>

            {/* Email subscription */}
            {contact.email && (
              <div className="mt-4 flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-700">Email Campaigns</p>
                  <p className="text-xs text-gray-500">
                    {emailSubscribed ? 'Subscribed' : 'Unsubscribed'}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const next = !emailSubscribed;
                    setEmailSubscribed(next);
                    await updateSubscription(contactId, next);
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    emailSubscribed ? 'bg-green-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      emailSubscribed ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: Tabs */}
        <div className="lg:col-span-2">
          {/* Tab buttons */}
          <div className="mb-4 flex gap-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-1">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-md px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            {activeTab === 'activity' && (
              <ActivityTab
                contactActivities={contactActivities}
                newActivityType={newActivityType}
                setNewActivityType={setNewActivityType}
                newActivityContent={newActivityContent}
                setNewActivityContent={setNewActivityContent}
                addingActivity={addingActivity}
                handleAddActivity={handleAddActivity}
              />
            )}

            {activeTab === 'requirements' && (
              <RequirementsTab
                requirements={requirements}
                contactId={contactId}
                showReqForm={showReqForm}
                setShowReqForm={setShowReqForm}
                editingReqId={editingReqId}
                setEditingReqId={setEditingReqId}
                reqMatches={reqMatches}
                createRequirement={createRequirement}
                updateRequirement={updateRequirement}
                handleDeleteRequirement={handleDeleteRequirement}
                handleFindMatches={handleFindMatches}
              />
            )}

            {activeTab === 'properties' && (
              <PropertiesTab
                linkedProperties={linkedProperties}
                properties={properties}
                contactId={contactId}
                linkPropertyId={linkPropertyId}
                setLinkPropertyId={setLinkPropertyId}
                linkRole={linkRole}
                setLinkRole={setLinkRole}
                handleLinkProperty={handleLinkProperty}
              />
            )}

            {activeTab === 'inspections' && (
              <InspectionsTab contactInspections={contactInspections} />
            )}

            {activeTab === 'subscription' && (
              <SubscriptionTab
                contact={contact}
                emailSubscribed={emailSubscribed}
                setEmailSubscribed={setEmailSubscribed}
                updateSubscription={updateSubscription}
                contactId={contactId}
              />
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

// --- Sub-components ---

function InfoLabel({ label }: { label: string }) {
  return <p className="text-xs font-medium uppercase text-gray-400">{label}</p>;
}

function LeadScoreBar({ score }: { score: number | undefined | null }) {
  if (score == null) {
    return <p className="text-sm text-gray-400">Not scored</p>;
  }
  const color = score >= 67 ? 'bg-green-500' : score >= 34 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className="text-sm font-medium text-gray-700">{score}</span>
    </div>
  );
}

// --- Activity Tab ---

function ActivityTab({
  contactActivities,
  newActivityType,
  setNewActivityType,
  newActivityContent,
  setNewActivityContent,
  addingActivity,
  handleAddActivity,
}: {
  contactActivities: Activity[];
  newActivityType: string;
  setNewActivityType: (t: string) => void;
  newActivityContent: string;
  setNewActivityContent: (c: string) => void;
  addingActivity: boolean;
  handleAddActivity: () => void;
}) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Activity</h2>
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
    </>
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

// --- Requirements Tab ---

interface RequirementsTabProps {
  requirements: ContactRequirement[];
  contactId: string;
  showReqForm: boolean;
  setShowReqForm: (v: boolean) => void;
  editingReqId: string | null;
  setEditingReqId: (v: string | null) => void;
  reqMatches: Record<string, Property[]>;
  createRequirement: (req: Omit<ContactRequirement, 'id' | 'created_at' | 'updated_at'>) => Promise<ContactRequirement | null>;
  updateRequirement: (id: string, updates: Partial<ContactRequirement>) => Promise<void>;
  handleDeleteRequirement: (id: string) => void;
  handleFindMatches: (req: ContactRequirement) => void;
}

function RequirementsTab({
  requirements,
  contactId,
  showReqForm,
  setShowReqForm,
  editingReqId,
  setEditingReqId,
  reqMatches,
  createRequirement,
  updateRequirement,
  handleDeleteRequirement,
  handleFindMatches,
}: RequirementsTabProps) {
  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Requirements</h2>
        {!showReqForm && !editingReqId && (
          <button
            onClick={() => setShowReqForm(true)}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            + Add Requirement
          </button>
        )}
      </div>

      {/* Inline form for adding */}
      {showReqForm && (
        <RequirementForm
          contactId={contactId}
          onSave={async (data) => {
            await createRequirement(data);
            setShowReqForm(false);
          }}
          onCancel={() => setShowReqForm(false)}
        />
      )}

      {/* Existing requirements */}
      {requirements.length === 0 && !showReqForm ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No requirements yet. Add one to start matching properties.
        </p>
      ) : (
        <div className="space-y-4">
          {requirements.map((req) => (
            <div key={req.id}>
              {editingReqId === req.id ? (
                <RequirementForm
                  contactId={contactId}
                  existing={req}
                  onSave={async (data) => {
                    await updateRequirement(req.id, data);
                    setEditingReqId(null);
                  }}
                  onCancel={() => setEditingReqId(null)}
                />
              ) : (
                <RequirementCard
                  req={req}
                  matches={reqMatches[req.id]}
                  onEdit={() => setEditingReqId(req.id)}
                  onDelete={() => handleDeleteRequirement(req.id)}
                  onFindMatches={() => handleFindMatches(req)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function RequirementCard({
  req,
  matches,
  onEdit,
  onDelete,
  onFindMatches,
}: {
  req: ContactRequirement;
  matches: Property[] | undefined;
  onEdit: () => void;
  onDelete: () => void;
  onFindMatches: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
            req.for_type === 'buy' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
          }`}>
            {req.for_type === 'buy' ? 'Buy' : 'Rent'}
          </span>
          {!req.active && (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">Inactive</span>
          )}
        </div>
        <div className="flex gap-1">
          <button onClick={onEdit} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Edit">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button onClick={onDelete} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500" title="Delete">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </div>

      {/* Suburb chips */}
      {req.suburbs.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {req.suburbs.map((s) => (
            <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{s}</span>
          ))}
        </div>
      )}

      {/* Details row */}
      <div className="mb-2 flex flex-wrap gap-3 text-sm text-gray-600">
        {(req.price_min != null || req.price_max != null) && (
          <span>{formatPrice(req.price_min)} - {formatPrice(req.price_max)}</span>
        )}
        {req.beds_min != null && <span>{req.beds_min}+ beds</span>}
        {req.baths_min != null && <span>{req.baths_min}+ baths</span>}
        {req.cars_min != null && <span>{req.cars_min}+ cars</span>}
      </div>

      {/* Category chips */}
      {req.categories.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-1">
          {req.categories.map((c) => (
            <span key={c} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 capitalize">
              {c.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      )}

      {/* Find matching button */}
      <button
        onClick={onFindMatches}
        className="rounded-lg border border-primary-300 px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50"
      >
        Find Matching Properties
      </button>

      {/* Match results */}
      {matches && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-2 text-xs font-medium uppercase text-gray-500">
            {matches.length} match{matches.length !== 1 ? 'es' : ''} found
          </p>
          {matches.length === 0 ? (
            <p className="text-sm text-gray-400">No matching properties.</p>
          ) : (
            <div className="space-y-2">
              {matches.map((prop) => (
                <Link
                  key={prop.id}
                  href={`/properties/${prop.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-2 hover:bg-gray-50 transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{prop.address}</p>
                    <p className="text-xs text-gray-500">
                      {prop.suburb} {prop.beds != null && <>{prop.beds}bd</>} {prop.baths != null && <>{prop.baths}ba</>}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROPERTY_STATUS_COLORS[prop.status] || 'bg-gray-100 text-gray-700'}`}>
                    {prop.status.replace(/_/g, ' ')}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Requirement Form ---

interface ReqFormState {
  for_type: 'buy' | 'rent';
  suburbs: string;
  price_min: string;
  price_max: string;
  beds_min: string;
  baths_min: string;
  cars_min: string;
  property_types: 'residential' | 'commercial';
  categories: string[];
  land_size_min: string;
  building_size_min: string;
  features: string;
  active: boolean;
}

function RequirementForm({
  contactId,
  existing,
  onSave,
  onCancel,
}: {
  contactId: string;
  existing?: ContactRequirement;
  onSave: (data: Omit<ContactRequirement, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<ReqFormState>({
    for_type: existing?.for_type || 'buy',
    suburbs: existing?.suburbs.join(', ') || '',
    price_min: existing?.price_min?.toString() || '',
    price_max: existing?.price_max?.toString() || '',
    beds_min: existing?.beds_min?.toString() || '',
    baths_min: existing?.baths_min?.toString() || '',
    cars_min: existing?.cars_min?.toString() || '',
    property_types: (existing?.property_types[0] as 'residential' | 'commercial') || 'residential',
    categories: existing?.categories || [],
    land_size_min: existing?.land_size_min?.toString() || '',
    building_size_min: existing?.building_size_min?.toString() || '',
    features: existing?.features.join(', ') || '',
    active: existing?.active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const toggleCategory = (cat: string) => {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...prev.categories, cat],
    }));
  };

  const handleSubmit = async () => {
    setSaving(true);
    const suburbs = form.suburbs
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const features = form.features
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    await onSave({
      contact_id: contactId,
      for_type: form.for_type,
      suburbs,
      price_min: form.price_min ? Number(form.price_min) : undefined,
      price_max: form.price_max ? Number(form.price_max) : undefined,
      beds_min: form.beds_min ? Number(form.beds_min) : undefined,
      baths_min: form.baths_min ? Number(form.baths_min) : undefined,
      cars_min: form.cars_min ? Number(form.cars_min) : undefined,
      property_types: [form.property_types],
      categories: form.categories,
      land_size_min: form.land_size_min ? Number(form.land_size_min) : undefined,
      building_size_min: form.building_size_min ? Number(form.building_size_min) : undefined,
      features,
      active: form.active,
    });
    setSaving(false);
  };

  return (
    <div className="mb-4 rounded-lg border border-primary-200 bg-primary-50/30 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">
        {existing ? 'Edit Requirement' : 'New Requirement'}
      </h3>

      {/* Buy/Rent */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
        <div className="flex gap-2">
          {(['buy', 'rent'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((p) => ({ ...p, for_type: t }))}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium ${
                form.for_type === t
                  ? 'bg-primary-500 text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t === 'buy' ? 'Buy' : 'Rent'}
            </button>
          ))}
        </div>
      </div>

      {/* Suburbs */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">Suburbs (comma-separated)</label>
        <input
          type="text"
          value={form.suburbs}
          onChange={(e) => setForm((p) => ({ ...p, suburbs: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="e.g. Sydney, Surry Hills"
        />
        {form.suburbs && (
          <div className="mt-1 flex flex-wrap gap-1">
            {form.suburbs.split(',').map((s) => s.trim()).filter(Boolean).map((s) => (
              <span key={s} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">{s}</span>
            ))}
          </div>
        )}
      </div>

      {/* Price range */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Min Price ($)</label>
          <input
            type="number"
            value={form.price_min}
            onChange={(e) => setForm((p) => ({ ...p, price_min: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Max Price ($)</label>
          <input
            type="number"
            value={form.price_max}
            onChange={(e) => setForm((p) => ({ ...p, price_max: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Beds / Baths / Cars */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Min Beds</label>
          <input
            type="number"
            value={form.beds_min}
            onChange={(e) => setForm((p) => ({ ...p, beds_min: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Min Baths</label>
          <input
            type="number"
            value={form.baths_min}
            onChange={(e) => setForm((p) => ({ ...p, baths_min: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Min Cars</label>
          <input
            type="number"
            value={form.cars_min}
            onChange={(e) => setForm((p) => ({ ...p, cars_min: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Property type */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">Property Type</label>
        <div className="flex gap-2">
          {(['residential', 'commercial'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((p) => ({ ...p, property_types: t }))}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize ${
                form.property_types === t
                  ? 'bg-primary-500 text-white'
                  : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Categories (checkboxes) */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">Categories</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_OPTIONS.map((cat) => (
            <label key={cat} className="flex items-center gap-1.5 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.categories.includes(cat)}
                onChange={() => toggleCategory(cat)}
                className="rounded border-gray-300"
              />
              <span className="capitalize">{cat.replace(/_/g, ' ')}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Land/Building size */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Min Land Size (sqm)</label>
          <input
            type="number"
            value={form.land_size_min}
            onChange={(e) => setForm((p) => ({ ...p, land_size_min: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Min Building Size (sqm)</label>
          <input
            type="number"
            value={form.building_size_min}
            onChange={(e) => setForm((p) => ({ ...p, building_size_min: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
      </div>

      {/* Features */}
      <div className="mb-3">
        <label className="mb-1 block text-xs font-medium text-gray-500">Features (comma-separated)</label>
        <input
          type="text"
          value={form.features}
          onChange={(e) => setForm((p) => ({ ...p, features: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="e.g. pool, garage"
        />
      </div>

      {/* Active toggle */}
      <div className="mb-4 flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.active}
          onChange={(e) => setForm((p) => ({ ...p, active: e.target.checked }))}
          className="rounded border-gray-300"
          id="req-active"
        />
        <label htmlFor="req-active" className="text-sm text-gray-700">Active</label>
      </div>

      {/* Save/Cancel */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
        >
          {saving ? 'Saving...' : existing ? 'Update' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// --- Properties Tab ---

function PropertiesTab({
  linkedProperties,
  properties,
  contactId,
  linkPropertyId,
  setLinkPropertyId,
  linkRole,
  setLinkRole,
  handleLinkProperty,
}: {
  linkedProperties: (Property & { role?: PropertyContactRole })[];
  properties: Property[];
  contactId: string;
  linkPropertyId: string;
  setLinkPropertyId: (v: string) => void;
  linkRole: PropertyContactRole;
  setLinkRole: (v: PropertyContactRole) => void;
  handleLinkProperty: () => void;
}) {
  // Properties not yet linked to this contact
  const availableProperties = useMemo(() => {
    const linkedIds = new Set(linkedProperties.map((p) => p.id));
    return properties.filter((p) => !linkedIds.has(p.id));
  }, [properties, linkedProperties]);

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Properties</h2>
      </div>

      {/* Link property */}
      <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="mb-2 text-xs font-medium uppercase text-gray-500">Link Property</p>
        <div className="flex flex-wrap gap-2">
          <select
            value={linkPropertyId}
            onChange={(e) => setLinkPropertyId(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select a property...</option>
            {availableProperties.map((p) => (
              <option key={p.id} value={p.id}>{p.address}</option>
            ))}
          </select>
          <select
            value={linkRole}
            onChange={(e) => setLinkRole(e.target.value as PropertyContactRole)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="buyer">Buyer</option>
            <option value="vendor">Vendor</option>
            <option value="tenant">Tenant</option>
            <option value="landlord">Landlord</option>
            <option value="solicitor">Solicitor</option>
          </select>
          <button
            onClick={handleLinkProperty}
            disabled={!linkPropertyId}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
          >
            Link
          </button>
        </div>
      </div>

      {/* Linked properties list */}
      {linkedProperties.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No properties linked to this contact.
        </p>
      ) : (
        <div className="space-y-2">
          {linkedProperties.map((prop) => (
            <Link
              key={prop.id}
              href={`/properties/${prop.id}`}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors"
            >
              <div>
                <p className="text-sm font-medium text-gray-900">{prop.address}</p>
                <p className="text-xs text-gray-500">{prop.suburb}</p>
              </div>
              <div className="flex gap-2">
                {prop.role && (
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${ROLE_COLORS[prop.role] || 'bg-gray-100 text-gray-700'}`}>
                    {prop.role}
                  </span>
                )}
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROPERTY_STATUS_COLORS[prop.status] || 'bg-gray-100 text-gray-700'}`}>
                  {prop.status.replace(/_/g, ' ')}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

// --- Inspections Tab ---

function InspectionsTab({
  contactInspections,
}: {
  contactInspections: { inspection: Inspection; attendee: InspectionAttendee }[];
}) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Inspections</h2>
      {contactInspections.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-400">
          No inspections found for this contact.
        </p>
      ) : (
        <div className="space-y-2">
          {contactInspections.map(({ inspection, attendee }) => {
            const property = inspection.property;
            const address = property?.address || 'Unknown property';
            const suburb = property?.suburb || '';
            const date = new Date(inspection.scheduled_at);

            return (
              <Link
                key={`${inspection.id}-${attendee.id}`}
                href={`/properties/${inspection.property_id}`}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-3 hover:bg-gray-50 transition-colors"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">{address}</p>
                  <p className="text-xs text-gray-500">
                    {suburb && <>{suburb} - </>}
                    {date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
                    {date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    inspection.type === 'open_home' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {inspection.type === 'open_home' ? 'Open Home' : 'Private'}
                  </span>
                  {attendee.interest_level && (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INTEREST_COLORS[attendee.interest_level] || 'bg-gray-100 text-gray-700'}`}>
                      {attendee.interest_level}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

// --- Subscription Tab ---

function SubscriptionTab({
  contact,
  emailSubscribed,
  setEmailSubscribed,
  updateSubscription,
  contactId,
}: {
  contact: Contact;
  emailSubscribed: boolean;
  setEmailSubscribed: (v: boolean) => void;
  updateSubscription: (contactId: string, subscribed: boolean) => Promise<void>;
  contactId: string;
}) {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Email Subscription</h2>
      {contact.email ? (
        <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Email Campaigns</p>
            <p className="text-xs text-gray-500">
              {emailSubscribed ? 'Currently subscribed to email campaigns' : 'Currently unsubscribed from email campaigns'}
            </p>
          </div>
          <button
            onClick={async () => {
              const next = !emailSubscribed;
              setEmailSubscribed(next);
              await updateSubscription(contactId, next);
            }}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              emailSubscribed ? 'bg-green-500' : 'bg-gray-300'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                emailSubscribed ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-gray-400">
          No email address on file. Add an email to manage subscription.
        </p>
      )}
    </>
  );
}
