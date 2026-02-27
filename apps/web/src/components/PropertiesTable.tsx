'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePropertyStore, useSavedSearchStore } from '@realestate-crm/hooks';
import type { Property, PropertyType, PropertyForType, PropertyStatus, PropertyCategory } from '@realestate-crm/types';

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

const TYPE_FILTER_OPTIONS: { label: string; value: PropertyType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Residential', value: 'residential' },
  { label: 'Commercial', value: 'commercial' },
];

const FOR_FILTER_OPTIONS: { label: string; value: PropertyForType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Sale', value: 'sale' },
  { label: 'Lease', value: 'lease' },
];

const STATUS_FILTER_OPTIONS: { label: string; value: PropertyStatus | 'all' }[] = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Appraisal', value: 'appraisal' },
  { label: 'Available', value: 'available' },
  { label: 'Under Offer', value: 'under_offer' },
  { label: 'Exchanged', value: 'exchanged' },
  { label: 'Settled', value: 'settled' },
  { label: 'Leased', value: 'leased' },
  { label: 'Withdrawn', value: 'withdrawn' },
];

const CATEGORY_OPTIONS: { label: string; value: PropertyCategory | 'all' }[] = [
  { label: 'All Categories', value: 'all' },
  { label: 'House', value: 'house' },
  { label: 'Apartment', value: 'apartment' },
  { label: 'Townhouse', value: 'townhouse' },
  { label: 'Land', value: 'land' },
  { label: 'Unit', value: 'unit' },
  { label: 'Villa', value: 'villa' },
  { label: 'Acreage', value: 'acreage' },
  { label: 'Block of Units', value: 'block_of_units' },
];

type SortField = 'address' | 'suburb' | 'status' | 'price' | 'listed_at';
type SortDir = 'asc' | 'desc';

interface AdvancedFilters {
  priceMin: string;
  priceMax: string;
  bedsMin: string;
  bathsMin: string;
  carsMin: string;
  category: PropertyCategory | 'all';
}

const DEFAULT_ADVANCED: AdvancedFilters = {
  priceMin: '',
  priceMax: '',
  bedsMin: '',
  bathsMin: '',
  carsMin: '',
  category: 'all',
};

function formatPrice(value?: number): string {
  if (value == null) return '\u2014';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getDisplayPrice(property: Property): number | undefined {
  return property.sale_price ?? property.advertised_price ?? property.appraisal_price;
}

function hasActiveAdvancedFilters(adv: AdvancedFilters): boolean {
  return (
    adv.priceMin !== '' ||
    adv.priceMax !== '' ||
    adv.bedsMin !== '' ||
    adv.bathsMin !== '' ||
    adv.carsMin !== '' ||
    adv.category !== 'all'
  );
}

interface AllFiltersRecord {
  typeFilter?: string;
  forFilter?: string;
  statusFilter?: string;
  category?: string;
  priceMin?: string;
  priceMax?: string;
  bedsMin?: string;
  bathsMin?: string;
  carsMin?: string;
}

export default function PropertiesTable() {
  const properties = usePropertyStore((s) => s.properties);
  const isLoading = usePropertyStore((s) => s.isLoading);
  const fetchProperties = usePropertyStore((s) => s.fetchProperties);

  const savedSearches = useSavedSearchStore((s) => s.savedSearches);
  const fetchSavedSearches = useSavedSearchStore((s) => s.fetchSavedSearches);
  const createSavedSearch = useSavedSearchStore((s) => s.createSavedSearch);
  const deleteSavedSearch = useSavedSearchStore((s) => s.deleteSavedSearch);

  const router = useRouter();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<PropertyType | 'all'>('all');
  const [forFilter, setForFilter] = useState<PropertyForType | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all');
  const [sortField, setSortField] = useState<SortField>('listed_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [advanced, setAdvanced] = useState<AdvancedFilters>(DEFAULT_ADVANCED);
  const [showSaveInput, setShowSaveInput] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');

  const propertySavedSearches = useMemo(
    () => savedSearches.filter((s) => s.entity_type === 'property'),
    [savedSearches]
  );

  useEffect(() => {
    fetchProperties();
    fetchSavedSearches('property');
  }, [fetchProperties, fetchSavedSearches]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const hasAnyActiveFilters =
    typeFilter !== 'all' ||
    forFilter !== 'all' ||
    statusFilter !== 'all' ||
    hasActiveAdvancedFilters(advanced);

  const collectFiltersRecord = (): AllFiltersRecord => {
    const record: AllFiltersRecord = {};
    if (typeFilter !== 'all') record.typeFilter = typeFilter;
    if (forFilter !== 'all') record.forFilter = forFilter;
    if (statusFilter !== 'all') record.statusFilter = statusFilter;
    if (advanced.category !== 'all') record.category = advanced.category;
    if (advanced.priceMin) record.priceMin = advanced.priceMin;
    if (advanced.priceMax) record.priceMax = advanced.priceMax;
    if (advanced.bedsMin) record.bedsMin = advanced.bedsMin;
    if (advanced.bathsMin) record.bathsMin = advanced.bathsMin;
    if (advanced.carsMin) record.carsMin = advanced.carsMin;
    return record;
  };

  const applyFromRecord = (record: Record<string, unknown>) => {
    setTypeFilter((record.typeFilter as PropertyType) || 'all');
    setForFilter((record.forFilter as PropertyForType) || 'all');
    setStatusFilter((record.statusFilter as PropertyStatus) || 'all');
    setAdvanced({
      category: (record.category as PropertyCategory) || 'all',
      priceMin: (record.priceMin as string) || '',
      priceMax: (record.priceMax as string) || '',
      bedsMin: (record.bedsMin as string) || '',
      bathsMin: (record.bathsMin as string) || '',
      carsMin: (record.carsMin as string) || '',
    });
  };

  const clearAllFilters = () => {
    setTypeFilter('all');
    setForFilter('all');
    setStatusFilter('all');
    setAdvanced({ ...DEFAULT_ADVANCED });
  };

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) return;
    await createSavedSearch({
      name: saveSearchName.trim(),
      entity_type: 'property',
      filters: collectFiltersRecord() as Record<string, unknown>,
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
    if (typeFilter !== 'all') pills.push(`Type: ${typeFilter}`);
    if (forFilter !== 'all') pills.push(`For: ${forFilter}`);
    if (statusFilter !== 'all') pills.push(`Status: ${STATUS_LABELS[statusFilter]}`);
    if (advanced.category !== 'all') pills.push(`Category: ${advanced.category.replace(/_/g, ' ')}`);
    if (advanced.priceMin) pills.push(`Min $${advanced.priceMin}`);
    if (advanced.priceMax) pills.push(`Max $${advanced.priceMax}`);
    if (advanced.bedsMin) pills.push(`${advanced.bedsMin}+ beds`);
    if (advanced.bathsMin) pills.push(`${advanced.bathsMin}+ baths`);
    if (advanced.carsMin) pills.push(`${advanced.carsMin}+ cars`);
    return pills;
  }, [typeFilter, forFilter, statusFilter, advanced]);

  const filtered = useMemo(() => {
    let result = [...properties];

    // Search
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (p) =>
          p.address?.toLowerCase().includes(q) ||
          p.suburb?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q)
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((p) => p.property_type === typeFilter);
    }

    // For filter
    if (forFilter !== 'all') {
      result = result.filter((p) => p.for_type === forFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.status === statusFilter);
    }

    // Category filter
    if (advanced.category !== 'all') {
      result = result.filter((p) => p.category === advanced.category);
    }

    // Price min
    if (advanced.priceMin) {
      const min = parseFloat(advanced.priceMin);
      if (!isNaN(min)) {
        result = result.filter((p) => {
          const price = getDisplayPrice(p);
          return price != null && price >= min;
        });
      }
    }

    // Price max
    if (advanced.priceMax) {
      const max = parseFloat(advanced.priceMax);
      if (!isNaN(max)) {
        result = result.filter((p) => {
          const price = getDisplayPrice(p);
          return price != null && price <= max;
        });
      }
    }

    // Beds min
    if (advanced.bedsMin) {
      const min = parseInt(advanced.bedsMin, 10);
      if (!isNaN(min)) {
        result = result.filter((p) => p.beds != null && p.beds >= min);
      }
    }

    // Baths min
    if (advanced.bathsMin) {
      const min = parseInt(advanced.bathsMin, 10);
      if (!isNaN(min)) {
        result = result.filter((p) => p.baths != null && p.baths >= min);
      }
    }

    // Cars min
    if (advanced.carsMin) {
      const min = parseInt(advanced.carsMin, 10);
      if (!isNaN(min)) {
        result = result.filter((p) => p.cars != null && p.cars >= min);
      }
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'address':
          cmp = (a.address || '').localeCompare(b.address || '');
          break;
        case 'suburb':
          cmp = (a.suburb || '').localeCompare(b.suburb || '');
          break;
        case 'status':
          cmp = (a.status || '').localeCompare(b.status || '');
          break;
        case 'price': {
          const aPrice = getDisplayPrice(a) ?? 0;
          const bPrice = getDisplayPrice(b) ?? 0;
          cmp = aPrice - bPrice;
          break;
        }
        case 'listed_at':
        default:
          cmp = (a.listed_at || a.created_at || '').localeCompare(b.listed_at || b.created_at || '');
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [properties, search, typeFilter, forFilter, statusFilter, advanced, sortField, sortDir]);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Properties</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} of {properties.length} properties
          </p>
        </div>
        <Link
          href="/properties/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Property
        </Link>
      </div>

      {/* Saved Searches */}
      {propertySavedSearches.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-gray-500 uppercase">Saved:</span>
          {propertySavedSearches.map((s) => (
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
            placeholder="Search properties..."
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

        {/* Type filter chips */}
        <div className="flex gap-1.5">
          {TYPE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                typeFilter === opt.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* For filter chips */}
        <div className="flex gap-1.5">
          {FOR_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setForFilter(opt.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                forFilter === opt.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Status dropdown */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PropertyStatus | 'all')}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        >
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Filters toggle button */}
        <button
          onClick={() => setShowFilterPanel(!showFilterPanel)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
            showFilterPanel || hasActiveAdvancedFilters(advanced)
              ? 'border-primary-500 bg-primary-50 text-primary-700'
              : 'border-gray-300 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
          Filters
          {hasActiveAdvancedFilters(advanced) && (
            <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary-500 text-[10px] text-white">
              !
            </span>
          )}
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
                <button
                  onClick={handleSaveSearch}
                  disabled={!saveSearchName.trim()}
                  className="rounded-lg bg-primary-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => setShowSaveInput(false)}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {/* Category */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
              <select
                value={advanced.category}
                onChange={(e) => setAdvanced((prev) => ({ ...prev, category: e.target.value as PropertyCategory | 'all' }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {CATEGORY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Price min */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Min Price</label>
              <input
                type="number"
                value={advanced.priceMin}
                onChange={(e) => setAdvanced((prev) => ({ ...prev, priceMin: e.target.value }))}
                placeholder="e.g. 500000"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Price max */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Max Price</label>
              <input
                type="number"
                value={advanced.priceMax}
                onChange={(e) => setAdvanced((prev) => ({ ...prev, priceMax: e.target.value }))}
                placeholder="e.g. 2000000"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Beds min */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Min Beds</label>
              <input
                type="number"
                value={advanced.bedsMin}
                onChange={(e) => setAdvanced((prev) => ({ ...prev, bedsMin: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Baths min */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Min Baths</label>
              <input
                type="number"
                value={advanced.bathsMin}
                onChange={(e) => setAdvanced((prev) => ({ ...prev, bathsMin: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>

            {/* Cars min */}
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Min Cars</label>
              <input
                type="number"
                value={advanced.carsMin}
                onChange={(e) => setAdvanced((prev) => ({ ...prev, carsMin: e.target.value }))}
                placeholder="0"
                min="0"
                className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              onClick={() => setAdvanced({ ...DEFAULT_ADVANCED })}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-white"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Active filter pills */}
      {activeFilterPills.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {activeFilterPills.map((pill, idx) => (
            <span
              key={idx}
              className="inline-flex items-center rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-medium text-primary-700"
            >
              {pill}
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="rounded-full px-2 py-0.5 text-xs text-gray-400 hover:text-red-500"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500">
            {properties.length === 0
              ? 'No properties yet. Add your first property to get started.'
              : 'No properties match your filters.'}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <SortHeader label="Address" field="address" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Suburb" field="suburb" current={sortField} dir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">For</th>
                <SortHeader label="Status" field="status" current={sortField} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Price" field="price" current={sortField} dir={sortDir} onSort={handleSort} />
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Bed/Bath/Car</th>
                <SortHeader label="Listed" field="listed_at" current={sortField} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((property) => (
                <PropertyRow
                  key={property.id}
                  property={property}
                  onClick={() => router.push(`/properties/${property.id}`)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
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

function PropertyRow({
  property,
  onClick,
}: {
  property: Property;
  onClick: () => void;
}) {
  const displayPrice = getDisplayPrice(property);

  return (
    <tr
      className="cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <span className="text-sm font-medium text-gray-900">{property.address}</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {property.suburb || '\u2014'}
      </td>
      <td className="px-4 py-3">
        <span className="text-sm capitalize text-gray-600">{property.property_type}</span>
      </td>
      <td className="px-4 py-3">
        <span className="text-sm capitalize text-gray-600">{property.for_type}</span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[property.status]}`}
        >
          {STATUS_LABELS[property.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatPrice(displayPrice)}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {[
          property.beds != null ? `${property.beds}` : '-',
          property.baths != null ? `${property.baths}` : '-',
          property.cars != null ? `${property.cars}` : '-',
        ].join(' / ')}
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {property.listed_at
          ? new Date(property.listed_at).toLocaleDateString()
          : property.created_at
            ? new Date(property.created_at).toLocaleDateString()
            : '\u2014'}
      </td>
    </tr>
  );
}
