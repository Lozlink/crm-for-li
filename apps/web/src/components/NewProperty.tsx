'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePropertyStore } from '@realestate-crm/hooks';
import type {
  PropertyType,
  PropertyCategory,
  PropertyForType,
} from '@realestate-crm/types';
import AddressAutocomplete from './AddressAutocomplete';

const RESIDENTIAL_CATEGORIES: { label: string; value: PropertyCategory }[] = [
  { label: 'House', value: 'house' },
  { label: 'Apartment', value: 'apartment' },
  { label: 'Townhouse', value: 'townhouse' },
  { label: 'Unit', value: 'unit' },
  { label: 'Villa', value: 'villa' },
  { label: 'Land', value: 'land' },
  { label: 'Acreage', value: 'acreage' },
  { label: 'Block of Units', value: 'block_of_units' },
];

const COMMERCIAL_CATEGORIES: { label: string; value: PropertyCategory }[] = [
  { label: 'Office', value: 'commercial_office' },
  { label: 'Retail', value: 'commercial_retail' },
  { label: 'Industrial', value: 'commercial_industrial' },
  { label: 'Other', value: 'commercial_other' },
];

const COMMON_FEATURES = [
  'Pool', 'Garage', 'Air Conditioning', 'Balcony', 'Courtyard',
  'Study', 'Ensuite', 'Built-in Wardrobes', 'Fireplace', 'Solar Panels',
  'Security System', 'Dishwasher', 'Gym', 'Pet Friendly', 'Garden',
];

export default function NewProperty() {
  const router = useRouter();
  const createProperty = usePropertyStore((s) => s.createProperty);

  // Address
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | undefined>();

  // Classification
  const [propertyType, setPropertyType] = useState<PropertyType>('residential');
  const [category, setCategory] = useState<PropertyCategory>('house');
  const [forType, setForType] = useState<PropertyForType>('sale');

  // Pricing
  const [appraisalPrice, setAppraisalPrice] = useState('');
  const [advertisedPrice, setAdvertisedPrice] = useState('');
  const [commissionPercent, setCommissionPercent] = useState('');

  // Physical
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [cars, setCars] = useState('');
  const [landSize, setLandSize] = useState('');
  const [buildingSize, setBuildingSize] = useState('');

  // Features & description
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [description, setDescription] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const categories = propertyType === 'residential' ? RESIDENTIAL_CATEGORIES : COMMERCIAL_CATEGORIES;

  // Reset category when type changes
  const handleTypeChange = (type: PropertyType) => {
    setPropertyType(type);
    setCategory(type === 'residential' ? 'house' : 'commercial_office');
  };

  const toggleFeature = (feature: string) => {
    setSelectedFeatures((prev) =>
      prev.includes(feature) ? prev.filter((f) => f !== feature) : [...prev, feature]
    );
  };

  const handleAddressSelect = useCallback(
    (addr: string, lat: number, lng: number) => {
      setAddress(addr);
      if (lat !== 0 || lng !== 0) {
        setCoords({ lat, lng });
      }
    },
    []
  );

  const handleSave = async () => {
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const property = await createProperty({
        address: address.trim(),
        suburb: suburb.trim() || undefined,
        state: state.trim() || undefined,
        postcode: postcode.trim() || undefined,
        latitude: coords?.lat,
        longitude: coords?.lng,
        property_type: propertyType,
        category,
        for_type: forType,
        status: 'appraisal',
        appraisal_price: appraisalPrice ? Number(appraisalPrice) : undefined,
        advertised_price: advertisedPrice ? Number(advertisedPrice) : undefined,
        commission_percent: commissionPercent ? Number(commissionPercent) : undefined,
        beds: beds ? Number(beds) : undefined,
        baths: baths ? Number(baths) : undefined,
        cars: cars ? Number(cars) : undefined,
        land_size_sqm: landSize ? Number(landSize) : undefined,
        building_size_sqm: buildingSize ? Number(buildingSize) : undefined,
        features: selectedFeatures,
        photos: [],
        description: description.trim() || undefined,
        assigned_agents: [],
      });

      if (property) {
        router.push(`/properties/${property.id}`);
      } else {
        setError('Failed to create property. Please try again.');
      }
    } catch (err) {
      setError('An error occurred while creating the property.');
      console.error('Create property error:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <div className="mb-4">
        <Link href="/properties" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
          Properties
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">New Property</h1>

      <div className="mx-auto max-w-3xl">
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="space-y-6">
            {/* --- Address Section --- */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-gray-400">Address</h2>
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Street Address *</label>
                  <AddressAutocomplete
                    value={address}
                    onChange={setAddress}
                    onSelect={handleAddressSelect}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="e.g. 123 Smith Street"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Suburb</label>
                    <input
                      type="text"
                      value={suburb}
                      onChange={(e) => setSuburb(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="e.g. Richmond"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">State</label>
                    <input
                      type="text"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="e.g. VIC"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Postcode</label>
                    <input
                      type="text"
                      value={postcode}
                      onChange={(e) => setPostcode(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="e.g. 3121"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* --- Classification Section --- */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-gray-400">Classification</h2>
              <div className="space-y-3">
                {/* Property Type */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Property Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleTypeChange('residential')}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        propertyType === 'residential'
                          ? 'bg-primary-500 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Residential
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTypeChange('commercial')}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        propertyType === 'commercial'
                          ? 'bg-primary-500 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Commercial
                    </button>
                  </div>
                </div>

                {/* Category */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PropertyCategory)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>{cat.label}</option>
                    ))}
                  </select>
                </div>

                {/* For Type */}
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">For</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForType('sale')}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        forType === 'sale'
                          ? 'bg-primary-500 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Sale
                    </button>
                    <button
                      type="button"
                      onClick={() => setForType('lease')}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        forType === 'lease'
                          ? 'bg-primary-500 text-white'
                          : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      Lease
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* --- Pricing Section --- */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-gray-400">Pricing</h2>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Appraisal Price</label>
                  <input
                    type="number"
                    value={appraisalPrice}
                    onChange={(e) => setAppraisalPrice(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="$0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Advertised Price</label>
                  <input
                    type="number"
                    value={advertisedPrice}
                    onChange={(e) => setAdvertisedPrice(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="$0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Commission %</label>
                  <input
                    type="number"
                    step="0.1"
                    value={commissionPercent}
                    onChange={(e) => setCommissionPercent(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="2.5"
                  />
                </div>
              </div>
            </div>

            {/* --- Physical Details Section --- */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-gray-400">Physical Details</h2>
              <div className="grid grid-cols-5 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Beds</label>
                  <input
                    type="number"
                    value={beds}
                    onChange={(e) => setBeds(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Baths</label>
                  <input
                    type="number"
                    value={baths}
                    onChange={(e) => setBaths(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Cars</label>
                  <input
                    type="number"
                    value={cars}
                    onChange={(e) => setCars(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Land (sqm)</label>
                  <input
                    type="number"
                    value={landSize}
                    onChange={(e) => setLandSize(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Building (sqm)</label>
                  <input
                    type="number"
                    value={buildingSize}
                    onChange={(e) => setBuildingSize(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="0"
                  />
                </div>
              </div>
            </div>

            {/* --- Features Section --- */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-gray-400">Features</h2>
              <div className="flex flex-wrap gap-2">
                {COMMON_FEATURES.map((feature) => (
                  <button
                    key={feature}
                    type="button"
                    onClick={() => toggleFeature(feature)}
                    className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                      selectedFeatures.includes(feature)
                        ? 'bg-primary-500 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {feature}
                  </button>
                ))}
              </div>
            </div>

            {/* --- Description Section --- */}
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase text-gray-400">Description</h2>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Property description..."
              />
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <Link
                href="/properties"
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </Link>
              <button
                onClick={handleSave}
                disabled={saving || !address.trim()}
                className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Creating...' : 'Create Property'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
