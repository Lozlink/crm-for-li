'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCRMStore, useSavedSearchStore, useLeadScoringEngine } from '@realestate-crm/hooks';
import { parseContactNameField } from '@realestate-crm/utils';
import type { ParsedContactName } from '@realestate-crm/utils';
import type {
  Contact,
  ContactSource,
  ContactType,
  ContactStatus,
  LeadTier,
} from '@realestate-crm/types';
import ContactFormDialog from './ContactFormDialog';
import CSVImport from './CSVImport';
import TagManager from './TagManager';
import LeadScoreBadge from './LeadScoreBadge';

type SortField = 'name' | 'email' | 'address' | 'created_at' | 'source' | 'status' | 'contact_type' | 'last_contacted_at';
type SortDir = 'asc' | 'desc';

const SOURCE_VALUES: ContactSource[] = ['referral', 'web', 'walk_in', 'portal', 'phone', 'import'];
const TYPE_VALUES: ContactType[] = ['buyer', 'seller', 'tenant', 'landlord', 'investor', 'other'];
const STATUS_VALUES: ContactStatus[] = ['active', 'inactive', 'archived'];

interface ContactAdvancedFilters {
  hasEmail: boolean;
  hasPhone: boolean;
  createdAfter: string;
  createdBefore: string;
  sources: ContactSource[];
  contactTypes: ContactType[];
  status: ContactStatus | '';
}

const DEFAULT_CONTACT_FILTERS: ContactAdvancedFilters = {
  hasEmail: false,
  hasPhone: false,
  createdAfter: '',
  createdBefore: '',
  sources: [],
  contactTypes: [],
  status: 'active',
};

export default function ContactsTable() {
  const contacts = useCRMStore((s) => s.contacts);
  const tags = useCRMStore((s) => s.tags);
  const deleteContact = useCRMStore((s) => s.deleteContact);
  const bulkDeleteContacts = useCRMStore((s) => s.bulkDeleteContacts);
  const updateContact = useCRMStore((s) => s.updateContact);
  const { getScore, getTier } = useLeadScoringEngine();
  const router = useRouter();

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Cleanup imports state
  const [showCleanup, setShowCleanup] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const [cleanupPreviews, setCleanupPreviews] = useState<Array<{ contact: Contact; parsed: ParsedContactName }>>([]);

  const savedSearches = useSavedSearchStore((s) => s.savedSearches);
  const fetchSavedSearches = useSavedSearchStore((s) => s.fetchSavedSearches);
  const createSavedSearch = useSavedSearchStore((s) => s.createSavedSearch);
  const deleteSavedSearch = useSavedSearchStore((s) => s.deleteSavedSearch);

  const [search, setSearch] = useState('');
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showForm, setShowForm] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [advanced, setAdvanced] = useState<ContactAdvancedFilters>(DEFAULT_CONTACT_FILTERS);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');

  const contactSavedSearches = useMemo(
    () => savedSearches.filter((s) => s.entity_type === 'contact'),
    [savedSearches]
  );

  useEffect(() => {
    fetchSavedSearches('contact');
  }, [fetchSavedSearches]);

  const hasActiveAdvanced =
    advanced.hasEmail ||
    advanced.hasPhone ||
    advanced.createdAfter !== '' ||
    advanced.createdBefore !== '' ||
    advanced.sources.length > 0 ||
    advanced.contactTypes.length > 0 ||
    (advanced.status !== '' && advanced.status !== 'active');
  const hasAnyActiveFilters = selectedTagIds.length > 0 || hasActiveAdvanced;

  const collectFiltersRecord = (): Record<string, unknown> => {
    const record: Record<string, unknown> = {};
    if (selectedTagIds.length > 0) record.tagIds = selectedTagIds;
    if (advanced.hasEmail) record.hasEmail = true;
    if (advanced.hasPhone) record.hasPhone = true;
    if (advanced.createdAfter) record.createdAfter = advanced.createdAfter;
    if (advanced.createdBefore) record.createdBefore = advanced.createdBefore;
    if (advanced.sources.length > 0) record.sources = advanced.sources;
    if (advanced.contactTypes.length > 0) record.contactTypes = advanced.contactTypes;
    if (advanced.status) record.status = advanced.status;
    return record;
  };

  const applyFromRecord = (record: Record<string, unknown>) => {
    setSelectedTagIds((record.tagIds as string[]) || []);
    setAdvanced({
      hasEmail: !!record.hasEmail,
      hasPhone: !!record.hasPhone,
      createdAfter: (record.createdAfter as string) || '',
      createdBefore: (record.createdBefore as string) || '',
      sources: (record.sources as ContactSource[]) || [],
      contactTypes: (record.contactTypes as ContactType[]) || [],
      status: (record.status as ContactStatus) || '',
    });
  };

  const clearAllFilters = () => {
    setSelectedTagIds([]);
    setAdvanced({ ...DEFAULT_CONTACT_FILTERS });
  };

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) return;
    await createSavedSearch({
      name: saveSearchName.trim(),
      entity_type: 'contact',
      filters: collectFiltersRecord(),
      is_shared: false,
    });
    setSaveSearchName('');
    setShowSaveInput(false);
  };

  const handleDeleteSavedSearch = async (id: string) => {
    if (window.confirm('Delete this saved search?')) {
      await deleteSavedSearch(id);
    }
  };

  const activeFilterPills = useMemo(() => {
    const pills: string[] = [];
    if (selectedTagIds.length > 0) pills.push(`${selectedTagIds.length} tag(s)`);
    if (advanced.hasEmail) pills.push('Has email');
    if (advanced.hasPhone) pills.push('Has phone');
    if (advanced.createdAfter) pills.push(`After ${advanced.createdAfter}`);
    if (advanced.createdBefore) pills.push(`Before ${advanced.createdBefore}`);
    if (advanced.sources.length > 0) pills.push(`Source: ${advanced.sources.join(', ')}`);
    if (advanced.contactTypes.length > 0) pills.push(`Type: ${advanced.contactTypes.join(', ')}`);
    if (advanced.status && advanced.status !== 'active') pills.push(`Status: ${advanced.status}`);
    return pills;
  }, [selectedTagIds, advanced]);

  const toggleTag = useCallback((tagId: string) => {
    setSelectedTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  }, []);

  const toggleSource = useCallback((source: ContactSource) => {
    setAdvanced((prev) => ({
      ...prev,
      sources: prev.sources.includes(source)
        ? prev.sources.filter((s) => s !== source)
        : [...prev.sources, source],
    }));
  }, []);

  const toggleContactType = useCallback((type: ContactType) => {
    setAdvanced((prev) => ({
      ...prev,
      contactTypes: prev.contactTypes.includes(type)
        ? prev.contactTypes.filter((t) => t !== type)
        : [...prev.contactTypes, type],
    }));
  }, []);

  const handleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDir('asc');
      }
    },
    [sortField]
  );

  const filtered = useMemo(() => {
    let result = [...contacts];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (c) =>
          c.first_name?.toLowerCase().includes(q) ||
          c.last_name?.toLowerCase().includes(q) ||
          c.email?.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.address?.toLowerCase().includes(q)
      );
    }

    // Tag filter
    if (selectedTagIds.length > 0) {
      result = result.filter((c) => {
        const contactTagIds = c.tags?.map((t) => t.id) || (c.tag_id ? [c.tag_id] : []);
        return contactTagIds.some((id) => selectedTagIds.includes(id));
      });
    }

    // Advanced filters
    if (advanced.hasEmail) {
      result = result.filter((c) => !!c.email);
    }
    if (advanced.hasPhone) {
      result = result.filter((c) => !!c.phone);
    }
    if (advanced.createdAfter) {
      result = result.filter((c) => (c.created_at || '') >= advanced.createdAfter);
    }
    if (advanced.createdBefore) {
      result = result.filter((c) => (c.created_at || '') <= advanced.createdBefore);
    }

    // Source filter
    if (advanced.sources.length > 0) {
      result = result.filter((c) => c.source && advanced.sources.includes(c.source));
    }

    // Contact type filter
    if (advanced.contactTypes.length > 0) {
      result = result.filter((c) => c.contact_type && advanced.contactTypes.includes(c.contact_type));
    }

    // Status filter
    if (advanced.status) {
      result = result.filter((c) => (c.status || 'active') === advanced.status);
    }

    // Sort
    result.sort((a, b) => {
      let aVal: string;
      let bVal: string;

      switch (sortField) {
        case 'name':
          aVal = `${a.first_name || ''} ${a.last_name || ''}`.toLowerCase();
          bVal = `${b.first_name || ''} ${b.last_name || ''}`.toLowerCase();
          break;
        case 'email':
          aVal = (a.email || '').toLowerCase();
          bVal = (b.email || '').toLowerCase();
          break;
        case 'address':
          aVal = (a.address || '').toLowerCase();
          bVal = (b.address || '').toLowerCase();
          break;
        case 'source':
          aVal = (a.source || '').toLowerCase();
          bVal = (b.source || '').toLowerCase();
          break;
        case 'status':
          aVal = (a.status || 'active').toLowerCase();
          bVal = (b.status || 'active').toLowerCase();
          break;
        case 'contact_type':
          aVal = (a.contact_type || '').toLowerCase();
          bVal = (b.contact_type || '').toLowerCase();
          break;
        case 'last_contacted_at':
          aVal = a.last_contacted_at || '';
          bVal = b.last_contacted_at || '';
          break;
        case 'created_at':
        default:
          aVal = a.created_at || '';
          bVal = b.created_at || '';
          break;
      }

      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [contacts, search, selectedTagIds, advanced, sortField, sortDir]);

  const handleDelete = useCallback(
    async (id: string, name: string) => {
      if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
        await deleteContact(id);
      }
    },
    [deleteContact]
  );

  // Multi-select handlers
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allVisible = filtered.map((c) => c.id);
      const allSelected = allVisible.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allVisible);
    });
  }, [filtered]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    const count = selectedIds.size;
    if (window.confirm(`Delete ${count} contact${count === 1 ? '' : 's'}? This cannot be undone.`)) {
      await bulkDeleteContacts([...selectedIds]);
      setSelectedIds(new Set());
    }
  }, [selectedIds, bulkDeleteContacts]);

  // Cleanup imports handlers
  const handleScanCleanup = useCallback(() => {
    const previews: Array<{ contact: Contact; parsed: ParsedContactName }> = [];
    for (const contact of contacts) {
      if (!contact.address) {
        const raw = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
        const parsed = parseContactNameField(raw);
        if (parsed) {
          previews.push({ contact, parsed });
        }
      }
    }
    if (previews.length === 0) {
      window.alert('No contacts need cleanup');
      return;
    }
    setCleanupPreviews(previews);
    setShowCleanup(true);
  }, [contacts]);

  const handleApplyCleanup = useCallback(async () => {
    for (const { contact, parsed } of cleanupPreviews) {
      await updateContact(contact.id, {
        first_name: parsed.first_name,
        last_name: parsed.last_name,
        address: parsed.address,
        unit_number: parsed.unit_number,
      });
    }
    setShowCleanup(false);
    setCleanupPreviews([]);
  }, [cleanupPreviews, updateContact]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} of {contacts.length} contacts
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCSVImport(true)}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Import CSV
          </button>
          <button
            onClick={handleScanCleanup}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clean Up Imports
          </button>
          <button
            onClick={() => {
              setEditingContact(null);
              setShowForm(true);
            }}
            className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
          >
            + Add Contact
          </button>
        </div>
      </div>

      {/* Saved Searches */}
      {contactSavedSearches.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase">Saved:</span>
          {contactSavedSearches.map((s) => (
            <div key={s.id} className="inline-flex items-center gap-1">
              <button
                onClick={() => applyFromRecord(s.filters)}
                className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
              >
                {s.name}
              </button>
              <button
                onClick={() => handleDeleteSavedSearch(s.id)}
                className="rounded-full p-0.5 text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Delete saved search"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
            />
          </svg>
        </div>

        {/* Tag filter dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setTagDropdownOpen((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedTagIds.length > 0
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
            </svg>
            Tags
            {selectedTagIds.length > 0 && (
              <span className="ml-0.5 rounded-full bg-primary-500 px-1.5 text-xs font-medium text-white">
                {selectedTagIds.length}
              </span>
            )}
            <svg className={`h-3.5 w-3.5 transition-transform ${tagDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
            </svg>
          </button>

          {tagDropdownOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setTagDropdownOpen(false)} />
              <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {tags.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-400">No tags yet</p>
                ) : (
                  tags.map((tag) => (
                    <label
                      key={tag.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedTagIds.includes(tag.id)}
                        onChange={() => toggleTag(tag.id)}
                        className="rounded border-gray-300"
                      />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="text-sm text-gray-700">{tag.name}</span>
                    </label>
                  ))
                )}
                {selectedTagIds.length > 0 && (
                  <div className="border-t mt-1 pt-1">
                    <button
                      onClick={() => { setSelectedTagIds([]); setTagDropdownOpen(false); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:text-gray-600"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Manage Tags button */}
        <button
          onClick={() => setShowTagManager(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Manage Tags
        </button>

        {/* Filters toggle */}
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            showFilterPanel || hasActiveAdvanced
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          Filters
        </button>

        {/* Save search */}
        {hasAnyActiveFilters && (
          <>
            {showSaveInput ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={saveSearchName}
                  onChange={(e) => setSaveSearchName(e.target.value)}
                  placeholder="Search name..."
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveSearch();
                    if (e.key === 'Escape') setShowSaveInput(false);
                  }}
                  autoFocus
                />
                <button onClick={handleSaveSearch} disabled={!saveSearchName.trim()} className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50">Save</button>
                <button onClick={() => setShowSaveInput(false)} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setShowSaveInput(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                </svg>
                Save Search
              </button>
            )}
          </>
        )}
      </div>

      {/* Advanced filter panel */}
      {showFilterPanel && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={advanced.hasEmail} onChange={(e) => setAdvanced((p) => ({ ...p, hasEmail: e.target.checked }))} className="rounded border-gray-300" />
              Has email
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={advanced.hasPhone} onChange={(e) => setAdvanced((p) => ({ ...p, hasPhone: e.target.checked }))} className="rounded border-gray-300" />
              Has phone
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Created after</label>
              <input type="date" value={advanced.createdAfter} onChange={(e) => setAdvanced((p) => ({ ...p, createdAfter: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Created before</label>
              <input type="date" value={advanced.createdBefore} onChange={(e) => setAdvanced((p) => ({ ...p, createdBefore: e.target.value }))} className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500" />
            </div>
          </div>

          {/* Source filter */}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Source</label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_VALUES.map((src) => (
                <label key={src} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={advanced.sources.includes(src)}
                    onChange={() => toggleSource(src)}
                    className="rounded border-gray-300"
                  />
                  <span className="capitalize">{src.replace(/_/g, ' ')}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Contact type filter */}
          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Contact Type</label>
            <div className="flex flex-wrap gap-2">
              {TYPE_VALUES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={advanced.contactTypes.includes(type)}
                    onChange={() => toggleContactType(type)}
                    className="rounded border-gray-300"
                  />
                  <span className="capitalize">{type}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Status filter */}
          <div className="mt-4">
            <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
            <select
              value={advanced.status}
              onChange={(e) => setAdvanced((p) => ({ ...p, status: e.target.value as ContactStatus | '' }))}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            >
              <option value="">All</option>
              {STATUS_VALUES.map((s) => (
                <option key={s} value={s} className="capitalize">{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="mt-3 flex justify-end">
            <button onClick={() => setAdvanced({ ...DEFAULT_CONTACT_FILTERS })} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-white">Clear</button>
          </div>
        </div>
      )}

      {/* Active filter pills */}
      {activeFilterPills.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeFilterPills.map((pill, idx) => (
            <span key={idx} className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700">{pill}</span>
          ))}
          <button onClick={clearAllFilters} className="rounded-full px-2 py-0.5 text-xs text-gray-400 hover:text-red-500">Clear all</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-sm font-medium text-gray-700">
            {selectedIds.size} selected
          </span>
          <button
            onClick={handleBulkDelete}
            className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          >
            Delete Selected
          </button>
          <button
            onClick={clearSelection}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && filtered.every((c) => selectedIds.has(c.id))}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </th>
              <SortHeader
                label="Name"
                field="name"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Email"
                field="email"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Phone
              </th>
              <SortHeader
                label="Type"
                field="contact_type"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Source"
                field="source"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <SortHeader
                label="Status"
                field="status"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Score
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">
                Tag
              </th>
              <SortHeader
                label="Added"
                field="created_at"
                current={sortField}
                dir={sortDir}
                onSort={handleSort}
              />
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  className="py-12 text-center text-sm text-gray-400"
                >
                  {contacts.length === 0
                    ? 'No contacts yet. Add your first contact to get started.'
                    : 'No contacts match your search.'}
                </td>
              </tr>
            ) : (
              filtered.map((contact) => {
                const score = getScore(contact.id);
                return (
                  <ContactRow
                    key={contact.id}
                    contact={contact}
                    score={score?.total ?? null}
                    tier={getTier(contact.id)}
                    isSelected={selectedIds.has(contact.id)}
                    onToggleSelect={() => toggleSelect(contact.id)}
                    onEdit={() => {
                      setEditingContact(contact);
                      setShowForm(true);
                    }}
                    onDelete={() =>
                      handleDelete(
                        contact.id,
                        `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
                      )
                    }
                    onClick={() => router.push(`/contacts/${contact.id}`)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Form dialog */}
      {showForm && (
        <ContactFormDialog
          contact={editingContact}
          onClose={() => {
            setShowForm(false);
            setEditingContact(null);
          }}
        />
      )}

      {/* CSV Import dialog */}
      {showCSVImport && (
        <CSVImport onClose={() => setShowCSVImport(false)} />
      )}

      {/* Tag Manager dialog */}
      {showTagManager && (
        <TagManager onClose={() => setShowTagManager(false)} />
      )}

      {/* Cleanup dialog */}
      {showCleanup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="relative mx-4 max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Clean Up Imports</h2>
              <button
                onClick={() => setShowCleanup(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="max-h-[calc(85vh-128px)] overflow-y-auto p-6">
              <p className="mb-4 text-sm text-gray-500">
                {cleanupPreviews.length} contact{cleanupPreviews.length === 1 ? '' : 's'} will be updated with parsed name and address:
              </p>
              <div className="space-y-3">
                {cleanupPreviews.map(({ contact, parsed }) => (
                  <div key={contact.id} className="rounded-lg border border-gray-200 p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase text-gray-400">Before</p>
                        <p className="text-sm text-gray-700">
                          {[contact.first_name, contact.last_name].filter(Boolean).join(' ') || 'Unnamed'}
                        </p>
                      </div>
                      <svg className="mt-3 h-4 w-4 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                      </svg>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium uppercase text-gray-400">After</p>
                        <p className="text-sm font-medium text-gray-900">
                          {[parsed.first_name, parsed.last_name].filter(Boolean).join(' ')}
                        </p>
                        <p className="text-xs text-gray-500">
                          {parsed.unit_number ? `${parsed.unit_number} / ` : ''}{parsed.address}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t px-6 py-4">
              <button
                onClick={() => setShowCleanup(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCleanup}
                className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600"
              >
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  field,
  current,
  dir,
  onSort,
}: {
  label: string;
  field: SortField;
  current: SortField;
  dir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = current === field;
  return (
    <th
      className="cursor-pointer px-4 py-3 text-left text-xs font-medium uppercase text-gray-500 hover:text-gray-700"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-primary-500">
            {dir === 'asc' ? '\u2191' : '\u2193'}
          </span>
        )}
      </span>
    </th>
  );
}

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  inactive: 'bg-gray-100 text-gray-600',
  archived: 'bg-red-100 text-red-700',
};

const TYPE_COLORS: Record<string, string> = {
  buyer: 'bg-blue-100 text-blue-700',
  seller: 'bg-green-100 text-green-700',
  tenant: 'bg-purple-100 text-purple-700',
  landlord: 'bg-amber-100 text-amber-700',
  investor: 'bg-cyan-100 text-cyan-700',
  other: 'bg-gray-100 text-gray-700',
};

function ContactRow({
  contact,
  score,
  tier,
  isSelected,
  onToggleSelect,
  onEdit,
  onDelete,
  onClick,
}: {
  contact: Contact;
  score: number | null;
  tier: LeadTier;
  isSelected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
}) {
  const displayName = [contact.first_name, contact.last_name]
    .filter(Boolean)
    .join(' ');

  return (
    <tr
      className="cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          className="rounded border-gray-300"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: contact.tag?.color || '#9CA3AF' }}
          >
            {(contact.first_name?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-900">
              {displayName || 'Unnamed'}
            </span>
            {contact.address && (
              <p className="truncate text-xs text-gray-400">
                {contact.unit_number ? `${contact.unit_number} / ` : ''}{contact.address}
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {contact.email || '-'}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {contact.phone ? (
          <a
            href={`tel:${contact.phone}`}
            className="text-primary-500 hover:text-primary-600"
            onClick={(e) => e.stopPropagation()}
          >
            {contact.phone}
          </a>
        ) : (
          '-'
        )}
      </td>
      <td className="px-4 py-3">
        {contact.contact_type ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${TYPE_COLORS[contact.contact_type] || 'bg-gray-100 text-gray-700'}`}>
            {contact.contact_type}
          </span>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 capitalize">
        {contact.source ? contact.source.replace(/_/g, ' ') : '-'}
      </td>
      <td className="px-4 py-3">
        {contact.status ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[contact.status] || 'bg-gray-100 text-gray-600'}`}>
            {contact.status}
          </span>
        ) : (
          <span className="text-sm text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        {score !== null ? (
          <LeadScoreBadge score={score} tier={tier} />
        ) : (
          <span className="text-sm text-gray-400">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(contact.tags && contact.tags.length > 0
            ? contact.tags
            : contact.tag
              ? [contact.tag]
              : []
          ).map((tag) => (
            <span
              key={tag.id}
              className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: tag.color + '20', color: tag.color }}
            >
              {tag.name}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {new Date(contact.created_at || '').toLocaleDateString()}
      </td>
      <td className="px-4 py-3 text-right">
        <div
          className="inline-flex gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onEdit}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Edit"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
            title="Delete"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
