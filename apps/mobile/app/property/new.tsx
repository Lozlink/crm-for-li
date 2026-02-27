import { useState, useMemo } from 'react';
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import {
  useTheme,
  Text,
  Button,
  TextInput,
  Surface,
  Chip,
  Divider,
  SegmentedButtons,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePropertyStore } from '@realestate-crm/hooks';
import type { PropertyType, PropertyCategory, PropertyForType } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import type { AddressComponents } from '../../components/AddressAutocomplete';

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
  'Air Conditioning',
  'Garage',
  'Pool',
  'Garden',
  'Balcony',
  'Study',
  'Ensuite',
  'Dishwasher',
  'Built-in Wardrobes',
  'Alarm System',
  'Solar Panels',
  'Fireplace',
  'Courtyard',
  'Outdoor Entertainment',
  'Internal Laundry',
];

export default function NewPropertyScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createProperty = usePropertyStore(state => state.createProperty);

  const [isSaving, setIsSaving] = useState(false);

  // Address fields
  const [address, setAddress] = useState('');
  const [suburb, setSuburb] = useState('');
  const [state, setState] = useState('');
  const [postcode, setPostcode] = useState('');
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();

  const handleAddressSelect = (addr: string, lat: number, lng: number, components?: AddressComponents) => {
    setAddress(addr);
    setLatitude(lat || undefined);
    setLongitude(lng || undefined);
    if (components) {
      if (components.suburb) setSuburb(components.suburb);
      if (components.state) setState(components.state);
      if (components.postcode) setPostcode(components.postcode);
    }
  };

  // Property classification
  const [propertyType, setPropertyType] = useState<PropertyType>('residential');
  const [category, setCategory] = useState<PropertyCategory>('house');
  const [forType, setForType] = useState<PropertyForType>('sale');

  // Price fields
  const [appraisalPrice, setAppraisalPrice] = useState('');
  const [advertisedPrice, setAdvertisedPrice] = useState('');

  // Details
  const [beds, setBeds] = useState('');
  const [baths, setBaths] = useState('');
  const [cars, setCars] = useState('');
  const [landSize, setLandSize] = useState('');
  const [buildingSize, setBuildingSize] = useState('');
  const [description, setDescription] = useState('');
  const [commissionPercent, setCommissionPercent] = useState('');

  // Features
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);

  const categoryOptions = useMemo(() => {
    return propertyType === 'residential' ? RESIDENTIAL_CATEGORIES : COMMERCIAL_CATEGORIES;
  }, [propertyType]);

  const handlePropertyTypeChange = (value: string) => {
    const newType = value as PropertyType;
    setPropertyType(newType);
    // Reset category to first option of new type
    if (newType === 'residential') {
      setCategory('house');
    } else {
      setCategory('commercial_office');
    }
  };

  const toggleFeature = (feature: string) => {
    setSelectedFeatures(prev =>
      prev.includes(feature)
        ? prev.filter(f => f !== feature)
        : [...prev, feature]
    );
  };

  const parseOptionalNumber = (val: string): number | undefined => {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? undefined : parsed;
  };

  const parseOptionalInt = (val: string): number | undefined => {
    const parsed = parseInt(val, 10);
    return isNaN(parsed) ? undefined : parsed;
  };

  const handleSave = async () => {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
      Alert.alert('Address Required', 'Please enter a property address.');
      return;
    }

    setIsSaving(true);

    try {
      const result = await createProperty({
        address: trimmedAddress,
        suburb: suburb.trim() || undefined,
        state: state.trim() || undefined,
        postcode: postcode.trim() || undefined,
        property_type: propertyType,
        category,
        for_type: forType,
        status: 'appraisal',
        appraisal_price: parseOptionalNumber(appraisalPrice),
        advertised_price: parseOptionalNumber(advertisedPrice),
        commission_percent: parseOptionalNumber(commissionPercent),
        beds: parseOptionalInt(beds),
        baths: parseOptionalInt(baths),
        cars: parseOptionalInt(cars),
        land_size_sqm: parseOptionalNumber(landSize),
        building_size_sqm: parseOptionalNumber(buildingSize),
        features: selectedFeatures,
        latitude,
        longitude,
        photos: [],
        description: description.trim() || undefined,
        assigned_agents: [],
      });

      if (result) {
        router.back();
      } else {
        Alert.alert('Save Failed', 'Could not create the property. Please try again.');
      }
    } catch (error) {
      console.error('Property save error:', error);
      Alert.alert('Error', 'An unexpected error occurred while saving the property.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Address Section */}
        <Surface style={styles.sectionCard} elevation={1}>
          <View style={styles.sectionHeader}>
            <Icon name="map-marker" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={styles.sectionTitle}>Address</Text>
          </View>
          <AddressAutocomplete
            value={address}
            onAddressSelect={handleAddressSelect}
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            label="Suburb"
            placeholder="e.g. Bondi"
            value={suburb}
            onChangeText={setSuburb}
            style={styles.input}
          />
          <View style={styles.rowInputs}>
            <TextInput
              mode="outlined"
              label="State"
              placeholder="e.g. NSW"
              value={state}
              onChangeText={setState}
              style={[styles.input, styles.halfInput]}
            />
            <TextInput
              mode="outlined"
              label="Postcode"
              placeholder="e.g. 2026"
              value={postcode}
              onChangeText={setPostcode}
              keyboardType="number-pad"
              style={[styles.input, styles.halfInput]}
            />
          </View>
        </Surface>

        {/* Classification Section */}
        <Surface style={styles.sectionCard} elevation={1}>
          <View style={styles.sectionHeader}>
            <Icon name="tag" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={styles.sectionTitle}>Classification</Text>
          </View>

          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
            Property Type
          </Text>
          <SegmentedButtons
            value={propertyType}
            onValueChange={handlePropertyTypeChange}
            buttons={[
              { value: 'residential', label: 'Residential', icon: 'home' },
              { value: 'commercial', label: 'Commercial', icon: 'office-building' },
            ]}
            style={styles.segmented}
          />

          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, marginTop: 16 }}>
            Category
          </Text>
          <View style={styles.chipGrid}>
            {categoryOptions.map(opt => (
              <Chip
                key={opt.value}
                selected={category === opt.value}
                onPress={() => setCategory(opt.value)}
                style={styles.categoryChip}
                compact
              >
                {opt.label}
              </Chip>
            ))}
          </View>

          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8, marginTop: 16 }}>
            Listing Type
          </Text>
          <SegmentedButtons
            value={forType}
            onValueChange={(val) => setForType(val as PropertyForType)}
            buttons={[
              { value: 'sale', label: 'For Sale', icon: 'currency-usd' },
              { value: 'lease', label: 'For Lease', icon: 'key' },
            ]}
            style={styles.segmented}
          />
        </Surface>

        {/* Pricing Section */}
        <Surface style={styles.sectionCard} elevation={1}>
          <View style={styles.sectionHeader}>
            <Icon name="currency-usd" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={styles.sectionTitle}>Pricing</Text>
          </View>
          <TextInput
            mode="outlined"
            label="Appraisal Price"
            placeholder="e.g. 850000"
            value={appraisalPrice}
            onChangeText={setAppraisalPrice}
            keyboardType="numeric"
            style={styles.input}
            left={<TextInput.Icon icon="cash" />}
          />
          <TextInput
            mode="outlined"
            label="Advertised Price"
            placeholder="e.g. 900000"
            value={advertisedPrice}
            onChangeText={setAdvertisedPrice}
            keyboardType="numeric"
            style={styles.input}
            left={<TextInput.Icon icon="cash-multiple" />}
          />
          <TextInput
            mode="outlined"
            label="Commission %"
            placeholder="e.g. 2.5"
            value={commissionPercent}
            onChangeText={setCommissionPercent}
            keyboardType="decimal-pad"
            style={styles.input}
            left={<TextInput.Icon icon="percent" />}
          />
        </Surface>

        {/* Details Section */}
        <Surface style={styles.sectionCard} elevation={1}>
          <View style={styles.sectionHeader}>
            <Icon name="information" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={styles.sectionTitle}>Details</Text>
          </View>
          <View style={styles.rowInputs}>
            <TextInput
              mode="outlined"
              label="Beds"
              value={beds}
              onChangeText={setBeds}
              keyboardType="number-pad"
              style={[styles.input, styles.thirdInput]}
              left={<TextInput.Icon icon="bed" />}
            />
            <TextInput
              mode="outlined"
              label="Baths"
              value={baths}
              onChangeText={setBaths}
              keyboardType="number-pad"
              style={[styles.input, styles.thirdInput]}
              left={<TextInput.Icon icon="shower" />}
            />
            <TextInput
              mode="outlined"
              label="Cars"
              value={cars}
              onChangeText={setCars}
              keyboardType="number-pad"
              style={[styles.input, styles.thirdInput]}
              left={<TextInput.Icon icon="car" />}
            />
          </View>
          <View style={styles.rowInputs}>
            <TextInput
              mode="outlined"
              label="Land (sqm)"
              value={landSize}
              onChangeText={setLandSize}
              keyboardType="numeric"
              style={[styles.input, styles.halfInput]}
            />
            <TextInput
              mode="outlined"
              label="Building (sqm)"
              value={buildingSize}
              onChangeText={setBuildingSize}
              keyboardType="numeric"
              style={[styles.input, styles.halfInput]}
            />
          </View>
          <TextInput
            mode="outlined"
            label="Description"
            placeholder="Property description..."
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            style={[styles.input, { minHeight: 100 }]}
          />
        </Surface>

        {/* Features Section */}
        <Surface style={styles.sectionCard} elevation={1}>
          <View style={styles.sectionHeader}>
            <Icon name="star" size={20} color={theme.colors.primary} />
            <Text variant="titleSmall" style={styles.sectionTitle}>Features</Text>
          </View>
          <View style={styles.chipGrid}>
            {COMMON_FEATURES.map(feature => (
              <Chip
                key={feature}
                selected={selectedFeatures.includes(feature)}
                onPress={() => toggleFeature(feature)}
                style={styles.featureChip}
                compact
              >
                {feature}
              </Chip>
            ))}
          </View>
        </Surface>

        <Divider style={styles.divider} />

        {/* Save Button */}
        <Button
          mode="contained"
          icon="content-save"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving || !address.trim()}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
        >
          {isSaving ? 'Creating...' : 'Create Property'}
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    marginLeft: 8,
    fontWeight: '600',
  },
  input: {
    marginBottom: 8,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  thirdInput: {
    flex: 1,
  },
  segmented: {
    marginBottom: 0,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    marginBottom: 0,
  },
  featureChip: {
    marginBottom: 0,
  },
  divider: {
    marginBottom: 16,
  },
  saveButton: {
    borderRadius: 8,
  },
  saveButtonContent: {
    paddingVertical: 6,
  },
});
