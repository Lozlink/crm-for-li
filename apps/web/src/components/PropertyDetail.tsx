'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import {
  usePropertyStore,
  useCRMStore,
  useBuyerMatchStore,
  useInspectionStore,
} from '@realestate-crm/hooks';
import type {
  Property,
  PropertyStatus,
  PropertyContactRole,
  PropertyContact,
  MatchStrength,
  InspectionType,
  InterestLevel,
} from '@realestate-crm/types';
import type { BuyerPin } from './PropertyMap';

const PropertyMap = dynamic(() => import('./PropertyMap'), { ssr: false });

const STATUS_STYLES: Record<PropertyStatus, string> = {
  appraisal: 'bg-gray-100 text-gray-700',
  available: 'bg-green-50 text-green-700',
  under_offer: 'bg-yellow-50 text-yellow-700',
  exchanged: 'bg-blue-50 text-blue-700',
  settled: 'bg-purple-50 text-purple-700',
  leased: 'bg-indigo-50 text-indigo-700',
  withdrawn: 'bg-red-50 text-red-700',
};

const STATUS_LABELS: Record<PropertyStatus, string> = {
  appraisal: 'Appraisal',
  available: 'Available',
  under_offer: 'Under Offer',
  exchanged: 'Exchanged',
  settled: 'Settled',
  leased: 'Leased',
  withdrawn: 'Withdrawn',
};

const CATEGORY_LABELS: Record<string, string> = {
  house: 'House',
  apartment: 'Apartment',
  townhouse: 'Townhouse',
  land: 'Land',
  unit: 'Unit',
  villa: 'Villa',
  acreage: 'Acreage',
  block_of_units: 'Block of Units',
  commercial_office: 'Office',
  commercial_retail: 'Retail',
  commercial_industrial: 'Industrial',
  commercial_other: 'Commercial Other',
};

const ROLE_LABELS: Record<PropertyContactRole, string> = {
  vendor: 'Vendor',
  buyer: 'Buyer',
  tenant: 'Tenant',
  landlord: 'Landlord',
  solicitor: 'Solicitor',
};

const ROLE_COLORS: Record<PropertyContactRole, string> = {
  vendor: 'bg-purple-50 text-purple-700',
  buyer: 'bg-green-50 text-green-700',
  tenant: 'bg-blue-50 text-blue-700',
  landlord: 'bg-orange-50 text-orange-700',
  solicitor: 'bg-gray-100 text-gray-700',
};

const MATCH_STRENGTH_STYLES: Record<MatchStrength, string> = {
  strong: 'bg-green-50 text-green-700 border-green-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  weak: 'bg-gray-100 text-gray-500 border-gray-200',
};

const MATCH_STRENGTH_LABELS: Record<MatchStrength, string> = {
  strong: 'Strong',
  partial: 'Partial',
  weak: 'Weak',
};

const INSPECTION_STATUS_STYLES: Record<string, string> = {
  scheduled: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-yellow-50 text-yellow-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-700',
};

const INSPECTION_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  open_home: 'Open Home',
  private: 'Private',
};

const INTEREST_LEVEL_STYLES: Record<InterestLevel, string> = {
  hot: 'text-red-600',
  warm: 'text-amber-600',
  cold: 'text-blue-600',
};

// Pipeline stages for sale properties
const SALE_PIPELINE: PropertyStatus[] = ['appraisal', 'available', 'under_offer', 'exchanged', 'settled'];
const LEASE_PIPELINE: PropertyStatus[] = ['appraisal', 'available', 'under_offer', 'leased'];

function formatPrice(value?: number): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

interface PropertyDetailProps {
  propertyId: string;
}

export default function PropertyDetail({ propertyId }: PropertyDetailProps) {
  const router = useRouter();

  // Property store
  const activeProperty = usePropertyStore((s) => s.activeProperty);
  const isLoading = usePropertyStore((s) => s.isLoading);
  const fetchProperty = usePropertyStore((s) => s.fetchProperty);
  const updateProperty = usePropertyStore((s) => s.updatePropertyStatus);
  const deleteProperty = usePropertyStore((s) => s.deleteProperty);
  const addPropertyContact = usePropertyStore((s) => s.addPropertyContact);
  const removePropertyContact = usePropertyStore((s) => s.removePropertyContact);
  const updatePropertyFields = usePropertyStore((s) => s.updateProperty);
  const clearActiveProperty = usePropertyStore((s) => s.clearActiveProperty);

  // CRM store
  const contacts = useCRMStore((s) => s.contacts);
  const fetchContacts = useCRMStore((s) => s.fetchContacts);

  // Buyer match store
  const buyerMatches = useBuyerMatchStore((s) => s.matches);
  const findMatchingBuyers = useBuyerMatchStore((s) => s.findMatchingBuyers);
  const isBuyerMatchLoading = useBuyerMatchStore((s) => s.isLoading);

  // Inspection store
  const inspections = useInspectionStore((s) => s.inspections);
  const fetchInspections = useInspectionStore((s) => s.fetchInspections);
  const createInspection = useInspectionStore((s) => s.createInspection);
  const fetchInspection = useInspectionStore((s) => s.fetchInspection);
  const activeInspection = useInspectionStore((s) => s.activeInspection);
  const attendees = useInspectionStore((s) => s.attendees);
  const updateAttendee = useInspectionStore((s) => s.updateAttendee);
  const linkAttendeeToContact = useInspectionStore((s) => s.linkAttendeeToContact);
  const isInspectionLoading = useInspectionStore((s) => s.isLoading);
  const addContact = useCRMStore((s) => s.addContact);

  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [linkingContact, setLinkingContact] = useState(false);
  const [contactSearchQuery, setContactSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<PropertyContactRole>('vendor');

  // Edit form state
  const [editDescription, setEditDescription] = useState('');
  const [editBeds, setEditBeds] = useState('');
  const [editBaths, setEditBaths] = useState('');
  const [editCars, setEditCars] = useState('');
  const [editLandSize, setEditLandSize] = useState('');
  const [editBuildingSize, setEditBuildingSize] = useState('');
  const [editAppraisalPrice, setEditAppraisalPrice] = useState('');
  const [editAdvertisedPrice, setEditAdvertisedPrice] = useState('');
  const [editCommission, setEditCommission] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Buyer matching state
  const [buyerSearchDone, setBuyerSearchDone] = useState(false);

  // Inspections state
  const [showNewInspectionForm, setShowNewInspectionForm] = useState(false);
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionTime, setInspectionTime] = useState('10:00');
  const [inspectionType, setInspectionType] = useState<InspectionType>('open_home');
  const [inspectionDuration, setInspectionDuration] = useState('30');
  const [creatingInspection, setCreatingInspection] = useState(false);
  const [expandedInspectionId, setExpandedInspectionId] = useState<string | null>(null);
  const [convertingAttendeeId, setConvertingAttendeeId] = useState<string | null>(null);

  useEffect(() => {
    fetchProperty(propertyId);
    return () => clearActiveProperty();
  }, [propertyId, fetchProperty, clearActiveProperty]);

  useEffect(() => {
    if (contacts.length === 0) {
      fetchContacts();
    }
  }, [contacts.length, fetchContacts]);

  // Fetch inspections for this property on mount
  useEffect(() => {
    fetchInspections(propertyId);
  }, [propertyId, fetchInspections]);

  // Populate edit form when property loads
  useEffect(() => {
    if (activeProperty) {
      setEditDescription(activeProperty.description || '');
      setEditBeds(activeProperty.beds != null ? String(activeProperty.beds) : '');
      setEditBaths(activeProperty.baths != null ? String(activeProperty.baths) : '');
      setEditCars(activeProperty.cars != null ? String(activeProperty.cars) : '');
      setEditLandSize(activeProperty.land_size_sqm != null ? String(activeProperty.land_size_sqm) : '');
      setEditBuildingSize(activeProperty.building_size_sqm != null ? String(activeProperty.building_size_sqm) : '');
      setEditAppraisalPrice(activeProperty.appraisal_price != null ? String(activeProperty.appraisal_price) : '');
      setEditAdvertisedPrice(activeProperty.advertised_price != null ? String(activeProperty.advertised_price) : '');
      setEditCommission(activeProperty.commission_percent != null ? String(activeProperty.commission_percent) : '');
    }
  }, [activeProperty]);

  const pipeline = useMemo(() => {
    if (!activeProperty) return SALE_PIPELINE;
    return activeProperty.for_type === 'lease' ? LEASE_PIPELINE : SALE_PIPELINE;
  }, [activeProperty]);

  const currentStageIndex = useMemo(() => {
    if (!activeProperty) return -1;
    return pipeline.indexOf(activeProperty.status);
  }, [activeProperty, pipeline]);

  const filteredContacts = useMemo(() => {
    if (!contactSearchQuery.trim()) return contacts.slice(0, 10);
    const q = contactSearchQuery.toLowerCase();
    return contacts
      .filter((c) => {
        const name = [c.first_name, c.last_name].filter(Boolean).join(' ').toLowerCase();
        const addr = (c.address || '').toLowerCase();
        return name.includes(q) || addr.includes(q) || (c.email || '').toLowerCase().includes(q);
      })
      .slice(0, 10);
  }, [contacts, contactSearchQuery]);

  // Build buyer pins for the map
  const buyerPins: BuyerPin[] = useMemo(() => {
    return buyerMatches
      .filter((m) => {
        const contact = Array.isArray(m.contact) ? m.contact[0] : m.contact;
        return contact?.latitude && contact?.longitude;
      })
      .map((m) => {
        const contact = Array.isArray(m.contact) ? m.contact[0] : m.contact;
        const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
        return {
          latitude: contact.latitude!,
          longitude: contact.longitude!,
          name,
          strength: m.strength,
        };
      });
  }, [buyerMatches]);

  const handleStatusChange = useCallback(async (status: PropertyStatus) => {
    if (!activeProperty) return;
    await updateProperty(activeProperty.id, status);
  }, [activeProperty, updateProperty]);

  const handleDelete = useCallback(async () => {
    if (!activeProperty) return;
    if (!window.confirm(`Delete property at "${activeProperty.address}"? This cannot be undone.`)) return;
    setDeleting(true);
    await deleteProperty(activeProperty.id);
    router.push('/properties');
  }, [activeProperty, deleteProperty, router]);

  const handleLinkContact = useCallback(async (contactId: string) => {
    if (!activeProperty) return;
    await addPropertyContact(activeProperty.id, contactId, selectedRole);
    setLinkingContact(false);
    setContactSearchQuery('');
  }, [activeProperty, addPropertyContact, selectedRole]);

  const handleRemoveContact = useCallback(async (propertyContactId: string) => {
    if (!window.confirm('Remove this contact from the property?')) return;
    await removePropertyContact(propertyContactId);
  }, [removePropertyContact]);

  const handleSaveEdit = useCallback(async () => {
    if (!activeProperty) return;
    setSavingEdit(true);
    const updates: Partial<Property> = {
      description: editDescription || undefined,
      beds: editBeds ? Number(editBeds) : undefined,
      baths: editBaths ? Number(editBaths) : undefined,
      cars: editCars ? Number(editCars) : undefined,
      land_size_sqm: editLandSize ? Number(editLandSize) : undefined,
      building_size_sqm: editBuildingSize ? Number(editBuildingSize) : undefined,
      appraisal_price: editAppraisalPrice ? Number(editAppraisalPrice) : undefined,
      advertised_price: editAdvertisedPrice ? Number(editAdvertisedPrice) : undefined,
      commission_percent: editCommission ? Number(editCommission) : undefined,
    };
    await updatePropertyFields(activeProperty.id, updates);
    setEditing(false);
    setSavingEdit(false);
  }, [activeProperty, editDescription, editBeds, editBaths, editCars, editLandSize, editBuildingSize, editAppraisalPrice, editAdvertisedPrice, editCommission, updatePropertyFields]);

  // Buyer matching handler
  const handleFindBuyers = useCallback(async () => {
    if (!activeProperty) return;
    await findMatchingBuyers(activeProperty);
    setBuyerSearchDone(true);
  }, [activeProperty, findMatchingBuyers]);

  // Inspection handlers
  const handleCreateInspection = useCallback(async () => {
    if (!activeProperty || !inspectionDate || !inspectionTime) return;
    setCreatingInspection(true);
    const scheduledAt = new Date(`${inspectionDate}T${inspectionTime}`).toISOString();
    await createInspection({
      property_id: activeProperty.id,
      scheduled_at: scheduledAt,
      type: inspectionType,
      duration_minutes: Number(inspectionDuration) || 30,
      status: 'scheduled',
    });
    setShowNewInspectionForm(false);
    setInspectionDate('');
    setInspectionTime('10:00');
    setInspectionType('open_home');
    setInspectionDuration('30');
    setCreatingInspection(false);
  }, [activeProperty, inspectionDate, inspectionTime, inspectionType, inspectionDuration, createInspection]);

  const handleExpandInspection = useCallback(async (inspectionId: string) => {
    if (expandedInspectionId === inspectionId) {
      setExpandedInspectionId(null);
      return;
    }
    setExpandedInspectionId(inspectionId);
    await fetchInspection(inspectionId);
  }, [expandedInspectionId, fetchInspection]);

  const handleInterestLevelChange = useCallback(async (attendeeId: string, level: InterestLevel) => {
    await updateAttendee(attendeeId, { interest_level: level });
  }, [updateAttendee]);

  const handleConvertAttendeeToContact = useCallback(async (att: { id: string; first_name?: string; last_name?: string; phone?: string; email?: string }) => {
    setConvertingAttendeeId(att.id);
    try {
      const newContact = await addContact({
        first_name: att.first_name || '',
        last_name: att.last_name || '',
        phone: att.phone || '',
        email: att.email || '',
        address: '',
      });
      if (newContact) {
        await linkAttendeeToContact(att.id, newContact.id);
      }
    } finally {
      setConvertingAttendeeId(null);
    }
  }, [addContact, linkAttendeeToContact]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!activeProperty) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-gray-500">Property not found.</p>
        <Link href="/properties" className="text-sm text-primary-600 hover:underline">
          Back to Properties
        </Link>
      </div>
    );
  }

  const propertyContacts = activeProperty.property_contacts || [];

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link
          href="/properties"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          &larr; Back to Properties
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column -- Property info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Header card */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-bold text-gray-900">{activeProperty.address}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                  {activeProperty.suburb && <span>{activeProperty.suburb}</span>}
                  {activeProperty.state && (
                    <>
                      <span className="text-gray-300">|</span>
                      <span>{activeProperty.state} {activeProperty.postcode}</span>
                    </>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[activeProperty.status]}`}>
                    {STATUS_LABELS[activeProperty.status]}
                  </span>
                  <span className="text-xs capitalize text-gray-500">{activeProperty.property_type}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs text-gray-500">{CATEGORY_LABELS[activeProperty.category] || activeProperty.category}</span>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs capitalize text-gray-500">For {activeProperty.for_type}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(!editing)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {editing ? 'Cancel' : 'Edit'}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>

            {/* Pipeline status bar */}
            <div className="mt-6">
              <p className="mb-2 text-xs font-medium uppercase text-gray-400">Pipeline</p>
              <div className="flex gap-1">
                {pipeline.map((stage, i) => {
                  const isCompleted = i <= currentStageIndex;
                  const isCurrent = i === currentStageIndex;
                  const isNext = i === currentStageIndex + 1;
                  return (
                    <button
                      key={stage}
                      onClick={() => isNext ? handleStatusChange(stage) : undefined}
                      disabled={!isNext}
                      className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${
                        isCurrent
                          ? 'bg-primary-500 text-white'
                          : isCompleted
                            ? 'bg-primary-100 text-primary-700'
                            : isNext
                              ? 'border border-dashed border-primary-300 text-primary-500 hover:bg-primary-50 cursor-pointer'
                              : 'bg-gray-50 text-gray-400'
                      }`}
                      title={isNext ? `Advance to ${STATUS_LABELS[stage]}` : STATUS_LABELS[stage]}
                    >
                      {STATUS_LABELS[stage]}
                    </button>
                  );
                })}
                {/* Withdrawn button */}
                {activeProperty.status !== 'withdrawn' && activeProperty.status !== 'settled' && activeProperty.status !== 'leased' && (
                  <button
                    onClick={() => handleStatusChange('withdrawn')}
                    className="rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 transition-colors"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Details card (read-only or edit) */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Details</h2>
            {editing ? (
              <div className="space-y-4">
                {/* Pricing */}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Appraisal Price</label>
                    <input
                      type="number"
                      value={editAppraisalPrice}
                      onChange={(e) => setEditAppraisalPrice(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Advertised Price</label>
                    <input
                      type="number"
                      value={editAdvertisedPrice}
                      onChange={(e) => setEditAdvertisedPrice(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Commission %</label>
                    <input
                      type="number"
                      step="0.1"
                      value={editCommission}
                      onChange={(e) => setEditCommission(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Physical attributes */}
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Beds</label>
                    <input
                      type="number"
                      value={editBeds}
                      onChange={(e) => setEditBeds(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Baths</label>
                    <input
                      type="number"
                      value={editBaths}
                      onChange={(e) => setEditBaths(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Cars</label>
                    <input
                      type="number"
                      value={editCars}
                      onChange={(e) => setEditCars(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Land (sqm)</label>
                    <input
                      type="number"
                      value={editLandSize}
                      onChange={(e) => setEditLandSize(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Building (sqm)</label>
                    <input
                      type="number"
                      value={editBuildingSize}
                      onChange={(e) => setEditBuildingSize(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={savingEdit}
                    className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                  >
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Pricing section */}
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">Pricing</p>
                  <div className="mt-1 grid grid-cols-3 gap-4">
                    <DetailItem label="Appraisal" value={formatPrice(activeProperty.appraisal_price)} />
                    <DetailItem label="Advertised" value={formatPrice(activeProperty.advertised_price)} />
                    <DetailItem label="Sale Price" value={formatPrice(activeProperty.sale_price)} />
                  </div>
                  {activeProperty.commission_percent != null && (
                    <p className="mt-1 text-xs text-gray-500">
                      Commission: {activeProperty.commission_percent}%
                    </p>
                  )}
                </div>

                {/* Physical attributes */}
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">Physical Attributes</p>
                  <div className="mt-1 grid grid-cols-5 gap-4">
                    <DetailItem label="Beds" value={activeProperty.beds != null ? String(activeProperty.beds) : '\u2014'} />
                    <DetailItem label="Baths" value={activeProperty.baths != null ? String(activeProperty.baths) : '\u2014'} />
                    <DetailItem label="Cars" value={activeProperty.cars != null ? String(activeProperty.cars) : '\u2014'} />
                    <DetailItem label="Land" value={activeProperty.land_size_sqm != null ? `${activeProperty.land_size_sqm} sqm` : '\u2014'} />
                    <DetailItem label="Building" value={activeProperty.building_size_sqm != null ? `${activeProperty.building_size_sqm} sqm` : '\u2014'} />
                  </div>
                </div>

                {/* Features */}
                {activeProperty.features && activeProperty.features.length > 0 && (
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-400">Features</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {activeProperty.features.map((feature, i) => (
                        <span
                          key={i}
                          className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Description */}
                {activeProperty.description && (
                  <div>
                    <p className="text-xs font-medium uppercase text-gray-400">Description</p>
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{activeProperty.description}</p>
                  </div>
                )}

                {/* Dates */}
                <div>
                  <p className="text-xs font-medium uppercase text-gray-400">Dates</p>
                  <div className="mt-1 grid grid-cols-3 gap-4">
                    <DetailItem
                      label="Listed"
                      value={activeProperty.listed_at ? formatDate(activeProperty.listed_at) : '\u2014'}
                    />
                    <DetailItem
                      label="Exchanged"
                      value={activeProperty.exchanged_at ? formatDate(activeProperty.exchanged_at) : '\u2014'}
                    />
                    <DetailItem
                      label="Settled"
                      value={activeProperty.settled_at ? formatDate(activeProperty.settled_at) : '\u2014'}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Linked Contacts */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Contacts</h2>
              <button
                onClick={() => setLinkingContact(!linkingContact)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Link Contact
              </button>
            </div>

            {/* Link contact panel */}
            {linkingContact && (
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <div className="flex gap-2">
                  <select
                    value={selectedRole}
                    onChange={(e) => setSelectedRole(e.target.value as PropertyContactRole)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {(Object.keys(ROLE_LABELS) as PropertyContactRole[]).map((role) => (
                      <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Search contacts..."
                    value={contactSearchQuery}
                    onChange={(e) => setContactSearchQuery(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    autoFocus
                  />
                </div>
                {filteredContacts.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white">
                    {filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => handleLinkContact(c.id)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                          {(c.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {[c.first_name, c.last_name].filter(Boolean).join(' ')}
                          </p>
                        </div>
                        {c.email && <span className="text-xs text-gray-400">{c.email}</span>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400">No contacts found</p>
                )}
                <button
                  type="button"
                  onClick={() => { setLinkingContact(false); setContactSearchQuery(''); }}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Contact list */}
            {propertyContacts.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-400">
                No contacts linked to this property yet.
              </p>
            ) : (
              <div className="space-y-2">
                {propertyContacts.map((pc: PropertyContact) => {
                  const contact = pc.contact;
                  // Supabase joins return arrays even for 1:1 relations
                  const c = Array.isArray(contact) ? contact[0] : contact;
                  const name = c ? [c.first_name, c.last_name].filter(Boolean).join(' ') : 'Unknown';
                  return (
                    <div key={pc.id} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-500">
                        {(c?.first_name?.[0] || '?').toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/contacts/${pc.contact_id}`}
                          className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                        >
                          {name}
                        </Link>
                        {c?.phone && (
                          <p className="text-xs text-gray-400">{c.phone}</p>
                        )}
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[pc.role]}`}>
                        {ROLE_LABELS[pc.role]}
                      </span>
                      <button
                        onClick={() => handleRemoveContact(pc.id)}
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        title="Remove contact"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ============================================ */}
          {/* Matched Buyers Section                       */}
          {/* ============================================ */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Matched Buyers</h2>
              <button
                onClick={handleFindBuyers}
                disabled={isBuyerMatchLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {isBuyerMatchLoading ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Searching...
                  </>
                ) : (
                  <>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                    </svg>
                    Find Matching Buyers
                  </>
                )}
              </button>
            </div>

            {isBuyerMatchLoading && (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
              </div>
            )}

            {!isBuyerMatchLoading && buyerSearchDone && buyerMatches.length === 0 && (
              <div className="py-8 text-center">
                <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                <p className="mt-2 text-sm text-gray-500">No matching buyers found</p>
                <p className="text-xs text-gray-400">Buyers need active requirements that overlap with this property&apos;s attributes.</p>
              </div>
            )}

            {!isBuyerMatchLoading && buyerMatches.length > 0 && (
              <div className="space-y-3">
                {buyerMatches.map((match, idx) => {
                  // Supabase joins return arrays even for 1:1 relations
                  const contact = Array.isArray(match.contact) ? match.contact[0] : match.contact;
                  if (!contact) return null;
                  const name = [contact.first_name, contact.last_name].filter(Boolean).join(' ');
                  return (
                    <div
                      key={`${contact.id}-${idx}`}
                      className="rounded-lg border border-gray-100 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold text-gray-500">
                          {(contact.first_name?.[0] || '?').toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/contacts/${contact.id}`}
                              className="text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                            >
                              {name}
                            </Link>
                            <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${MATCH_STRENGTH_STYLES[match.strength]}`}>
                              {MATCH_STRENGTH_LABELS[match.strength]}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                            {contact.phone && <span>{contact.phone}</span>}
                            {contact.phone && contact.email && <span className="text-gray-300">|</span>}
                            {contact.email && <span>{contact.email}</span>}
                          </div>
                        </div>
                      </div>
                      {/* Matching fields pills */}
                      <div className="mt-2 flex flex-wrap gap-1.5 pl-12">
                        {match.matchingFields.map((field) => (
                          <span
                            key={field}
                            className="rounded-full bg-primary-50 px-2 py-0.5 text-xs font-medium capitalize text-primary-700"
                          >
                            {field}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!buyerSearchDone && !isBuyerMatchLoading && (
              <p className="py-4 text-center text-sm text-gray-400">
                Click &quot;Find Matching Buyers&quot; to search for buyers whose requirements match this property.
              </p>
            )}
          </div>

          {/* ============================================ */}
          {/* Inspections Section                          */}
          {/* ============================================ */}
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Inspections</h2>
              <button
                onClick={() => setShowNewInspectionForm(!showNewInspectionForm)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Schedule Inspection
              </button>
            </div>

            {/* New inspection form */}
            {showNewInspectionForm && (
              <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">New Inspection</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
                    <input
                      type="date"
                      value={inspectionDate}
                      onChange={(e) => setInspectionDate(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Time</label>
                    <input
                      type="time"
                      value={inspectionTime}
                      onChange={(e) => setInspectionTime(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
                    <select
                      value={inspectionType}
                      onChange={(e) => setInspectionType(e.target.value as InspectionType)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="open_home">Open Home</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">Duration (min)</label>
                    <input
                      type="number"
                      value={inspectionDuration}
                      onChange={(e) => setInspectionDuration(e.target.value)}
                      min={10}
                      max={240}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowNewInspectionForm(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateInspection}
                    disabled={creatingInspection || !inspectionDate}
                    className="rounded-lg bg-primary-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                  >
                    {creatingInspection ? 'Scheduling...' : 'Schedule'}
                  </button>
                </div>
              </div>
            )}

            {/* Inspection list */}
            {isInspectionLoading && inspections.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary-500 border-t-transparent" />
              </div>
            )}

            {inspections.length === 0 && !isInspectionLoading && (
              <p className="py-4 text-center text-sm text-gray-400">
                No inspections scheduled for this property.
              </p>
            )}

            {inspections.length > 0 && (
              <div className="space-y-2">
                {inspections.map((inspection) => {
                  const isExpanded = expandedInspectionId === inspection.id;
                  // Supabase joins: attendees count comes back as array
                  const attendeeCountRaw = (inspection as unknown as Record<string, unknown>).attendees;
                  let attendeeCount = 0;
                  if (Array.isArray(attendeeCountRaw) && attendeeCountRaw.length > 0) {
                    const first = attendeeCountRaw[0];
                    attendeeCount = typeof first === 'object' && first !== null && 'count' in first
                      ? (first as { count: number }).count
                      : attendeeCountRaw.length;
                  }

                  return (
                    <div key={inspection.id} className="rounded-lg border border-gray-100 overflow-hidden">
                      {/* Inspection row */}
                      <button
                        type="button"
                        onClick={() => handleExpandInspection(inspection.id)}
                        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-900">
                              {formatDateTime(inspection.scheduled_at)}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${INSPECTION_STATUS_STYLES[inspection.status] || 'bg-gray-100 text-gray-600'}`}>
                              {INSPECTION_STATUS_LABELS[inspection.status] || inspection.status}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
                            <span>{INSPECTION_TYPE_LABELS[inspection.type] || inspection.type}</span>
                            <span className="text-gray-300">|</span>
                            <span>{inspection.duration_minutes} min</span>
                            <span className="text-gray-300">|</span>
                            <span>{attendeeCount} attendee{attendeeCount !== 1 ? 's' : ''}</span>
                          </div>
                        </div>
                        <svg
                          className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth={1.5}
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </button>

                      {/* Expanded attendee table */}
                      {isExpanded && (
                        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
                          {isInspectionLoading && activeInspection?.id !== inspection.id && (
                            <div className="flex items-center justify-center py-4">
                              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                            </div>
                          )}

                          {activeInspection?.id === inspection.id && attendees.length === 0 && (
                            <p className="py-3 text-center text-xs text-gray-400">
                              No attendees recorded for this inspection.
                            </p>
                          )}

                          {activeInspection?.id === inspection.id && attendees.length > 0 && (
                            <div className="overflow-x-auto">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="pb-2 pr-3 text-left text-xs font-medium uppercase text-gray-400">Name</th>
                                    <th className="pb-2 pr-3 text-left text-xs font-medium uppercase text-gray-400">Phone</th>
                                    <th className="pb-2 pr-3 text-left text-xs font-medium uppercase text-gray-400">Email</th>
                                    <th className="pb-2 pr-3 text-left text-xs font-medium uppercase text-gray-400">Source</th>
                                    <th className="pb-2 pr-3 text-left text-xs font-medium uppercase text-gray-400">Interest</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {attendees.map((att) => {
                                    // Supabase joins return arrays even for 1:1 relations
                                    const attContact = Array.isArray(att.contact) ? att.contact[0] : att.contact;
                                    const attName = [att.first_name, att.last_name].filter(Boolean).join(' ') ||
                                      (attContact ? [attContact.first_name, attContact.last_name].filter(Boolean).join(' ') : 'Unknown');
                                    const attPhone = att.phone || attContact?.phone || '\u2014';
                                    const attEmail = att.email || attContact?.email || '\u2014';

                                    return (
                                      <tr key={att.id} className="hover:bg-white transition-colors">
                                        <td className="py-2 pr-3">
                                          {att.contact_id ? (
                                            <Link
                                              href={`/contacts/${att.contact_id}`}
                                              className="font-medium text-primary-600 hover:text-primary-700 hover:underline"
                                            >
                                              {attName}
                                            </Link>
                                          ) : (
                                            <div className="flex items-center gap-2">
                                              <span className="font-medium text-gray-700">{attName}</span>
                                              <button
                                                onClick={() => handleConvertAttendeeToContact(att)}
                                                disabled={convertingAttendeeId === att.id}
                                                className="rounded bg-primary-50 px-1.5 py-0.5 text-[10px] font-medium text-primary-600 hover:bg-primary-100 disabled:opacity-50"
                                              >
                                                {convertingAttendeeId === att.id ? 'Creating...' : 'Create Contact'}
                                              </button>
                                            </div>
                                          )}
                                        </td>
                                        <td className="py-2 pr-3 text-gray-600">{attPhone}</td>
                                        <td className="py-2 pr-3 text-gray-600">{attEmail}</td>
                                        <td className="py-2 pr-3">
                                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs capitalize text-gray-600">
                                            {att.source?.replace('_', ' ') || '\u2014'}
                                          </span>
                                        </td>
                                        <td className="py-2 pr-3">
                                          <select
                                            value={att.interest_level || ''}
                                            onChange={(e) => {
                                              const value = e.target.value as InterestLevel;
                                              if (value) handleInterestLevelChange(att.id, value);
                                            }}
                                            className={`rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 ${
                                              att.interest_level ? INTEREST_LEVEL_STYLES[att.interest_level] : 'text-gray-500'
                                            }`}
                                          >
                                            <option value="">Set level</option>
                                            <option value="hot">Hot</option>
                                            <option value="warm">Warm</option>
                                            <option value="cold">Cold</option>
                                          </select>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column -- Map */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 rounded-xl border border-gray-200 bg-white overflow-hidden" style={{ height: '400px' }}>
            {activeProperty.latitude && activeProperty.longitude ? (
              <PropertyMap
                latitude={activeProperty.latitude}
                longitude={activeProperty.longitude}
                address={activeProperty.address}
                buyerPins={buyerPins}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">
                No location data available
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-700">{value}</p>
    </div>
  );
}
