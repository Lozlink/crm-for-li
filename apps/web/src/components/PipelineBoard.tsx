'use client';

import { useEffect, useState, useMemo, useCallback, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { usePropertyStore } from '@realestate-crm/hooks';
import type { Property, PropertyType, PropertyStatus } from '@realestate-crm/types';

/* -------------------------------------------------------------------------- */
/*  Pipeline stage definitions                                                 */
/* -------------------------------------------------------------------------- */

type PipelineStage = {
  status: PropertyStatus;
  label: string;
};

const SALE_STAGES: PipelineStage[] = [
  { status: 'appraisal', label: 'Appraisal' },
  { status: 'available', label: 'Listed' },
  { status: 'under_offer', label: 'Under Offer' },
  { status: 'exchanged', label: 'Exchanged' },
  { status: 'settled', label: 'Settled' },
];

const LEASE_STAGES: PipelineStage[] = [
  { status: 'appraisal', label: 'Appraisal' },
  { status: 'available', label: 'Listed' },
  { status: 'leased', label: 'Leased' },
];

const TYPE_FILTER_OPTIONS: { label: string; value: PropertyType | 'all' }[] = [
  { label: 'All', value: 'all' },
  { label: 'Residential', value: 'residential' },
  { label: 'Commercial', value: 'commercial' },
];

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function formatPrice(value?: number): string {
  if (value == null) return '--';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(value);
}

function getDisplayPrice(property: Property): number | undefined {
  return property.sale_price ?? property.advertised_price ?? property.appraisal_price;
}

/**
 * Compute days in the current stage.
 * Uses the most relevant timestamp for the current status,
 * falling back to created_at.
 */
function getDaysInStage(property: Property): number {
  let stageDate: string | undefined;

  switch (property.status) {
    case 'available':
      stageDate = property.listed_at;
      break;
    case 'exchanged':
      stageDate = property.exchanged_at;
      break;
    case 'settled':
    case 'leased':
      stageDate = property.settled_at;
      break;
    default:
      stageDate = undefined;
  }

  const ref = stageDate || property.created_at;
  if (!ref) return 0;

  const diffMs = Date.now() - new Date(ref).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/** Border color class based on days in stage */
function stageBorderColor(days: number): string {
  if (days >= 30) return 'border-l-red-500';
  if (days >= 7) return 'border-l-amber-500';
  return 'border-l-emerald-500';
}

/** Badge background for the days-in-stage chip */
function stageBadgeBg(days: number): string {
  if (days >= 30) return 'bg-red-100 text-red-700';
  if (days >= 7) return 'bg-amber-100 text-amber-700';
  return 'bg-emerald-100 text-emerald-700';
}

/* -------------------------------------------------------------------------- */
/*  Main Component                                                             */
/* -------------------------------------------------------------------------- */

export default function PipelineBoard() {
  const properties = usePropertyStore((s) => s.properties);
  const isLoading = usePropertyStore((s) => s.isLoading);
  const fetchProperties = usePropertyStore((s) => s.fetchProperties);
  const updatePropertyStatus = usePropertyStore((s) => s.updatePropertyStatus);
  const router = useRouter();

  const [forType, setForType] = useState<'sale' | 'lease'>('sale');
  const [typeFilter, setTypeFilter] = useState<PropertyType | 'all'>('all');
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  const stages = forType === 'sale' ? SALE_STAGES : LEASE_STAGES;

  /** Properties filtered by for_type and property_type */
  const filtered = useMemo(() => {
    let result = properties.filter((p) => p.for_type === forType);
    if (typeFilter !== 'all') {
      result = result.filter((p) => p.property_type === typeFilter);
    }
    return result;
  }, [properties, forType, typeFilter]);

  /** Group filtered properties by status */
  const grouped = useMemo(() => {
    const map = new Map<PropertyStatus, Property[]>();
    for (const stage of stages) {
      map.set(stage.status, []);
    }
    for (const prop of filtered) {
      const bucket = map.get(prop.status);
      if (bucket) {
        bucket.push(prop);
      }
    }
    return map;
  }, [filtered, stages]);

  /* ---- Drag-and-drop handlers ---- */

  const handleDragStart = useCallback(
    (e: DragEvent<HTMLDivElement>, propertyId: string) => {
      e.dataTransfer.setData('text/plain', propertyId);
      e.dataTransfer.effectAllowed = 'move';
      setDraggingId(propertyId);
    },
    [],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
  }, []);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent<HTMLDivElement>, targetStatus: PropertyStatus) => {
      e.preventDefault();
      const propertyId = e.dataTransfer.getData('text/plain');
      if (!propertyId) return;

      // Don't update if dropped on the same column
      const property = properties.find((p) => p.id === propertyId);
      if (!property || property.status === targetStatus) {
        setDraggingId(null);
        return;
      }

      setDraggingId(null);
      await updatePropertyStatus(propertyId, targetStatus);
    },
    [properties, updatePropertyStatus],
  );

  /* ---- Metrics per column ---- */

  function columnMetrics(status: PropertyStatus) {
    const items = grouped.get(status) || [];
    const totalValue = items.reduce((sum, p) => sum + (getDisplayPrice(p) ?? 0), 0);
    return { count: items.length, totalValue };
  }

  /* ---- Render ---- */

  return (
    <div className="flex h-full flex-col overflow-hidden p-6">
      {/* ---------- Header ---------- */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
          <p className="text-sm text-gray-500">
            {filtered.length} {forType === 'sale' ? 'sale' : 'lease'} properties
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Type filter */}
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

          {/* Sale / Lease toggle */}
          <div className="flex rounded-lg border border-gray-200 bg-gray-100 p-0.5">
            <button
              onClick={() => setForType('sale')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                forType === 'sale'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Sale
            </button>
            <button
              onClick={() => setForType('lease')}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                forType === 'lease'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Lease
            </button>
          </div>
        </div>
      </div>

      {/* ---------- Loading state ---------- */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        </div>
      ) : (
        /* ---------- Kanban columns ---------- */
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {stages.map((stage) => {
            const items = grouped.get(stage.status) || [];
            const { count, totalValue } = columnMetrics(stage.status);

            return (
              <div
                key={stage.status}
                className="flex min-w-[280px] flex-shrink-0 flex-col rounded-xl bg-gray-100"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, stage.status)}
              >
                {/* Column header */}
                <div className="border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-gray-700">
                      {stage.label}
                    </h2>
                    <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-gray-300 px-1.5 text-xs font-medium text-gray-700">
                      {count}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatPrice(totalValue)}
                  </p>
                </div>

                {/* Cards area */}
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
                  {items.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center py-8">
                      <p className="text-xs text-gray-400">No properties</p>
                    </div>
                  ) : (
                    items.map((property) => (
                      <PropertyCard
                        key={property.id}
                        property={property}
                        isDragging={draggingId === property.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onClick={() => router.push(`/properties/${property.id}`)}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Property Card                                                              */
/* -------------------------------------------------------------------------- */

function PropertyCard({
  property,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  property: Property;
  isDragging: boolean;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const displayPrice = getDisplayPrice(property);
  const days = getDaysInStage(property);
  const borderColor = stageBorderColor(days);
  const badgeBg = stageBadgeBg(days);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, property.id)}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`cursor-pointer rounded-lg border border-gray-200 border-l-4 bg-white p-3 shadow-sm transition-all hover:shadow-md ${borderColor} ${
        isDragging ? 'opacity-50 ring-2 ring-primary-400' : ''
      }`}
    >
      {/* Address & suburb */}
      <p className="text-sm font-medium text-gray-900 leading-tight">
        {property.address}
      </p>
      {property.suburb && (
        <p className="mt-0.5 text-xs text-gray-500">{property.suburb}</p>
      )}

      {/* Price */}
      <p className="mt-2 text-sm font-semibold text-gray-800">
        {formatPrice(displayPrice)}
      </p>

      {/* Beds / Baths / Cars + Days badge */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {/* Beds */}
          <span className="inline-flex items-center gap-0.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
            {property.beds ?? '-'}
          </span>
          {/* Baths */}
          <span className="inline-flex items-center gap-0.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {property.baths ?? '-'}
          </span>
          {/* Cars */}
          <span className="inline-flex items-center gap-0.5">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.029-.394 1.029-1.014v-1.36a1.72 1.72 0 00-.21-.836l-2.442-4.228a1.5 1.5 0 00-1.3-.75H5.25a1.5 1.5 0 00-1.3.75L1.508 15.04a1.72 1.72 0 00-.21.836v1.36c0 .62.408 1.014 1.029 1.014H3.375" />
            </svg>
            {property.cars ?? '-'}
          </span>
        </div>

        {/* Days-in-stage badge */}
        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${badgeBg}`}>
          {days}d
        </span>
      </div>
    </div>
  );
}
