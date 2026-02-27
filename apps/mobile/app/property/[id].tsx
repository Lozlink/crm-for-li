import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import {
  useTheme,
  Text,
  Button,
  Surface,
  Chip,
  Divider,
  IconButton,
  Menu,
  Portal,
  Dialog,
  ActivityIndicator,
  TextInput,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { usePropertyStore, useCRMStore, useBuyerMatchStore, useInspectionStore } from '@realestate-crm/hooks';
import type {
  Property,
  PropertyStatus,
  PropertyContactRole,
  PropertyContact,
  BuyerMatch,
  MatchStrength,
  Inspection,
  InspectionType,
} from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const STATUS_LABELS: Record<PropertyStatus, string> = {
  appraisal: 'Appraisal',
  available: 'Listed',
  under_offer: 'Under Offer',
  exchanged: 'Exchanged',
  settled: 'Settled',
  leased: 'Leased',
  withdrawn: 'Withdrawn',
};

const ROLE_LABELS: Record<PropertyContactRole, string> = {
  vendor: 'Vendor',
  buyer: 'Buyer',
  tenant: 'Tenant',
  landlord: 'Landlord',
  solicitor: 'Solicitor',
};

const ROLE_COLORS: Record<PropertyContactRole, string> = {
  vendor: '#6366f1',
  buyer: '#16a34a',
  tenant: '#0d9488',
  landlord: '#2563eb',
  solicitor: '#9333ea',
};

function getStatusColor(status: PropertyStatus): string {
  switch (status) {
    case 'appraisal':
      return '#6366f1';
    case 'available':
      return '#16a34a';
    case 'under_offer':
      return '#f59e0b';
    case 'exchanged':
      return '#2563eb';
    case 'settled':
      return '#059669';
    case 'leased':
      return '#0d9488';
    case 'withdrawn':
      return '#9ca3af';
  }
}

/** Returns the next logical pipeline status based on current status and for_type. */
function getNextStatuses(property: Property): { status: PropertyStatus; label: string }[] {
  const isSale = property.for_type === 'sale';
  switch (property.status) {
    case 'appraisal':
      return [{ status: 'available', label: 'Mark as Listed' }];
    case 'available':
      return isSale
        ? [
            { status: 'under_offer', label: 'Mark Under Offer' },
            { status: 'withdrawn', label: 'Withdraw' },
          ]
        : [
            { status: 'leased', label: 'Mark as Leased' },
            { status: 'withdrawn', label: 'Withdraw' },
          ];
    case 'under_offer':
      return [
        { status: 'exchanged', label: 'Mark as Exchanged' },
        { status: 'available', label: 'Back to Listed' },
        { status: 'withdrawn', label: 'Withdraw' },
      ];
    case 'exchanged':
      return [
        { status: 'settled', label: 'Mark as Settled' },
        { status: 'available', label: 'Back to Listed' },
      ];
    case 'settled':
    case 'leased':
      return [];
    case 'withdrawn':
      return [{ status: 'available', label: 'Re-list' }];
  }
}

function formatPrice(price: number | undefined): string {
  if (price == null) return '-';
  return `$${price.toLocaleString()}`;
}

function formatSqm(val: number | undefined): string {
  if (val == null) return '-';
  return `${val.toLocaleString()} sqm`;
}

const MATCH_STRENGTH_COLORS: Record<MatchStrength, string> = {
  strong: '#16a34a',
  partial: '#f59e0b',
  weak: '#9ca3af',
};

const MATCH_STRENGTH_LABELS: Record<MatchStrength, string> = {
  strong: 'Strong',
  partial: 'Partial',
  weak: 'Weak',
};

const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  open_home: 'Open Home',
  private: 'Private',
};

const INSPECTION_STATUS_COLORS: Record<string, string> = {
  scheduled: '#2563eb',
  in_progress: '#f59e0b',
  completed: '#16a34a',
  cancelled: '#9ca3af',
};

const INSPECTION_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

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

export default function PropertyDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const activeProperty = usePropertyStore(state => state.activeProperty);
  const isLoading = usePropertyStore(state => state.isLoading);
  const fetchProperty = usePropertyStore(state => state.fetchProperty);
  const updateProperty = usePropertyStore(state => state.updateProperty);
  const updatePropertyStatus = usePropertyStore(state => state.updatePropertyStatus);
  const deleteProperty = usePropertyStore(state => state.deleteProperty);
  const addPropertyContact = usePropertyStore(state => state.addPropertyContact);
  const removePropertyContact = usePropertyStore(state => state.removePropertyContact);
  const clearActiveProperty = usePropertyStore(state => state.clearActiveProperty);

  const contacts = useCRMStore(state => state.contacts);

  // Buyer matching
  const buyerMatches = useBuyerMatchStore(state => state.matches);
  const isBuyerMatchLoading = useBuyerMatchStore(state => state.isLoading);
  const findMatchingBuyers = useBuyerMatchStore(state => state.findMatchingBuyers);
  const [hasSearchedBuyers, setHasSearchedBuyers] = useState(false);

  // Inspections
  const inspections = useInspectionStore(state => state.inspections);
  const isInspectionsLoading = useInspectionStore(state => state.isLoading);
  const fetchInspections = useInspectionStore(state => state.fetchInspections);
  const createInspection = useInspectionStore(state => state.createInspection);
  const [scheduleDialogVisible, setScheduleDialogVisible] = useState(false);
  const [inspectionDate, setInspectionDate] = useState('');
  const [inspectionTime, setInspectionTime] = useState('');
  const [inspectionType, setInspectionType] = useState<InspectionType>('open_home');
  const [inspectionDuration, setInspectionDuration] = useState('30');
  const [isScheduling, setIsScheduling] = useState(false);

  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [addContactDialogVisible, setAddContactDialogVisible] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [selectedRole, setSelectedRole] = useState<PropertyContactRole>('vendor');
  const [isEditing, setIsEditing] = useState(false);

  // Editable fields
  const [editAddress, setEditAddress] = useState('');
  const [editSuburb, setEditSuburb] = useState('');
  const [editAppraisalPrice, setEditAppraisalPrice] = useState('');
  const [editAdvertisedPrice, setEditAdvertisedPrice] = useState('');
  const [editBeds, setEditBeds] = useState('');
  const [editBaths, setEditBaths] = useState('');
  const [editCars, setEditCars] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  useEffect(() => {
    if (id) {
      fetchProperty(id);
      fetchInspections(id);
    }
    return () => {
      clearActiveProperty();
    };
  }, [id]);

  // Populate edit fields when entering edit mode
  const startEditing = useCallback(() => {
    if (!activeProperty) return;
    setEditAddress(activeProperty.address);
    setEditSuburb(activeProperty.suburb || '');
    setEditAppraisalPrice(activeProperty.appraisal_price?.toString() || '');
    setEditAdvertisedPrice(activeProperty.advertised_price?.toString() || '');
    setEditBeds(activeProperty.beds?.toString() || '');
    setEditBaths(activeProperty.baths?.toString() || '');
    setEditCars(activeProperty.cars?.toString() || '');
    setEditDescription(activeProperty.description || '');
    setIsEditing(true);
  }, [activeProperty]);

  const handleSaveEdit = useCallback(async () => {
    if (!activeProperty || !id) return;
    setIsSavingEdit(true);
    try {
      const parseNum = (val: string): number | undefined => {
        const n = parseFloat(val);
        return isNaN(n) ? undefined : n;
      };
      const parseInt_ = (val: string): number | undefined => {
        const n = parseInt(val, 10);
        return isNaN(n) ? undefined : n;
      };
      await updateProperty(id, {
        address: editAddress.trim(),
        suburb: editSuburb.trim() || undefined,
        appraisal_price: parseNum(editAppraisalPrice),
        advertised_price: parseNum(editAdvertisedPrice),
        beds: parseInt_(editBeds),
        baths: parseInt_(editBaths),
        cars: parseInt_(editCars),
        description: editDescription.trim() || undefined,
      });
      setIsEditing(false);
      // Refetch to get fresh data
      await fetchProperty(id);
    } catch (error) {
      console.error('Update error:', error);
      Alert.alert('Error', 'Failed to update property.');
    } finally {
      setIsSavingEdit(false);
    }
  }, [activeProperty, id, editAddress, editSuburb, editAppraisalPrice, editAdvertisedPrice, editBeds, editBaths, editCars, editDescription, updateProperty, fetchProperty]);

  const handleDelete = async () => {
    if (!id) return;
    await deleteProperty(id);
    router.back();
  };

  const confirmDelete = () => {
    setMenuVisible(false);
    setDeleteDialogVisible(true);
  };

  const handleStatusChange = useCallback(async (newStatus: PropertyStatus) => {
    if (!id) return;
    await updatePropertyStatus(id, newStatus);
    await fetchProperty(id);
  }, [id, updatePropertyStatus, fetchProperty]);

  const handleAddContact = useCallback(async () => {
    if (!id || !selectedContactId) return;
    await addPropertyContact(id, selectedContactId, selectedRole);
    setAddContactDialogVisible(false);
    setSelectedContactId('');
    setSelectedRole('vendor');
  }, [id, selectedContactId, selectedRole, addPropertyContact]);

  const handleRemoveContact = useCallback(async (propertyContact: PropertyContact) => {
    Alert.alert(
      'Remove Contact',
      `Remove ${propertyContact.contact?.first_name || 'this contact'} from this property?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => removePropertyContact(propertyContact.id),
        },
      ]
    );
  }, [removePropertyContact]);

  const handleFindMatchingBuyers = useCallback(async () => {
    if (!activeProperty) return;
    await findMatchingBuyers(activeProperty);
    setHasSearchedBuyers(true);
  }, [activeProperty, findMatchingBuyers]);

  const handleScheduleInspection = useCallback(async () => {
    if (!id || !inspectionDate || !inspectionTime) return;
    setIsScheduling(true);
    try {
      const scheduledAt = new Date(`${inspectionDate}T${inspectionTime}:00`).toISOString();
      const duration = parseInt(inspectionDuration, 10) || 30;
      await createInspection({
        property_id: id,
        scheduled_at: scheduledAt,
        type: inspectionType,
        duration_minutes: duration,
        status: 'scheduled',
      });
      setScheduleDialogVisible(false);
      setInspectionDate('');
      setInspectionTime('');
      setInspectionType('open_home');
      setInspectionDuration('30');
      await fetchInspections(id);
    } catch (error) {
      console.error('Schedule inspection error:', error);
      Alert.alert('Error', 'Failed to schedule inspection.');
    } finally {
      setIsScheduling(false);
    }
  }, [id, inspectionDate, inspectionTime, inspectionType, inspectionDuration, createInspection, fetchInspections]);

  const nextStatuses = useMemo(() => {
    if (!activeProperty) return [];
    return getNextStatuses(activeProperty);
  }, [activeProperty]);

  // Available contacts not already linked
  const availableContacts = useMemo(() => {
    if (!activeProperty) return contacts;
    const linkedIds = new Set(
      (activeProperty.property_contacts || []).map(pc => pc.contact_id)
    );
    return contacts.filter(c => !linkedIds.has(c.id));
  }, [contacts, activeProperty]);

  if (isLoading || !activeProperty) {
    return (
      <>
        <Stack.Screen options={{ title: 'Property' }} />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  const property = activeProperty;
  const statusColor = getStatusColor(property.status);

  return (
    <>
      <Stack.Screen
        options={{
          title: property.address,
          headerRight: () => (
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  onPress={() => setMenuVisible(true)}
                />
              }
            >
              <Menu.Item
                leadingIcon="pencil"
                onPress={() => {
                  setMenuVisible(false);
                  startEditing();
                }}
                title="Edit"
              />
              <Menu.Item
                leadingIcon="delete"
                onPress={confirmDelete}
                title="Delete"
              />
            </Menu>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {isEditing ? (
            /* ---- EDIT MODE ---- */
            <Surface style={styles.sectionCard} elevation={1}>
              <View style={styles.sectionHeader}>
                <Icon name="pencil" size={20} color={theme.colors.primary} />
                <Text variant="titleSmall" style={styles.sectionTitleText}>Edit Property</Text>
              </View>
              <TextInput
                mode="outlined"
                label="Address"
                value={editAddress}
                onChangeText={setEditAddress}
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Suburb"
                value={editSuburb}
                onChangeText={setEditSuburb}
                style={styles.input}
              />
              <View style={styles.rowInputs}>
                <TextInput
                  mode="outlined"
                  label="Appraisal $"
                  value={editAppraisalPrice}
                  onChangeText={setEditAppraisalPrice}
                  keyboardType="numeric"
                  style={[styles.input, styles.halfInput]}
                />
                <TextInput
                  mode="outlined"
                  label="Advertised $"
                  value={editAdvertisedPrice}
                  onChangeText={setEditAdvertisedPrice}
                  keyboardType="numeric"
                  style={[styles.input, styles.halfInput]}
                />
              </View>
              <View style={styles.rowInputs}>
                <TextInput
                  mode="outlined"
                  label="Beds"
                  value={editBeds}
                  onChangeText={setEditBeds}
                  keyboardType="number-pad"
                  style={[styles.input, styles.thirdInput]}
                />
                <TextInput
                  mode="outlined"
                  label="Baths"
                  value={editBaths}
                  onChangeText={setEditBaths}
                  keyboardType="number-pad"
                  style={[styles.input, styles.thirdInput]}
                />
                <TextInput
                  mode="outlined"
                  label="Cars"
                  value={editCars}
                  onChangeText={setEditCars}
                  keyboardType="number-pad"
                  style={[styles.input, styles.thirdInput]}
                />
              </View>
              <TextInput
                mode="outlined"
                label="Description"
                value={editDescription}
                onChangeText={setEditDescription}
                multiline
                numberOfLines={3}
                style={[styles.input, { minHeight: 80 }]}
              />
              <View style={styles.editActions}>
                <Button
                  mode="outlined"
                  onPress={() => setIsEditing(false)}
                  style={styles.editButton}
                  disabled={isSavingEdit}
                >
                  Cancel
                </Button>
                <Button
                  mode="contained"
                  onPress={handleSaveEdit}
                  loading={isSavingEdit}
                  disabled={isSavingEdit}
                  style={styles.editButton}
                >
                  Save
                </Button>
              </View>
            </Surface>
          ) : (
            /* ---- VIEW MODE ---- */
            <>
              {/* Header Card */}
              <Surface style={styles.sectionCard} elevation={1}>
                <Text variant="headlineSmall" style={styles.propertyAddress}>
                  {property.address}
                </Text>
                {property.suburb && (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                    {property.suburb}{property.state ? `, ${property.state}` : ''}{property.postcode ? ` ${property.postcode}` : ''}
                  </Text>
                )}

                <View style={styles.badgeRow}>
                  <Chip
                    compact
                    style={{ backgroundColor: statusColor }}
                    textStyle={{ color: '#fff', fontSize: 11 }}
                  >
                    {STATUS_LABELS[property.status]}
                  </Chip>
                  <Chip
                    compact
                    style={{ backgroundColor: theme.colors.secondaryContainer }}
                    textStyle={{ color: theme.colors.onSecondaryContainer, fontSize: 11 }}
                  >
                    {property.for_type === 'sale' ? 'For Sale' : 'For Lease'}
                  </Chip>
                  <Chip
                    compact
                    style={{ backgroundColor: theme.colors.surfaceVariant }}
                    textStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}
                  >
                    {CATEGORY_LABELS[property.category] || property.category}
                  </Chip>
                </View>
              </Surface>

              {/* Details Card */}
              <Surface style={styles.sectionCard} elevation={1}>
                <View style={styles.sectionHeader}>
                  <Icon name="information" size={20} color={theme.colors.primary} />
                  <Text variant="titleSmall" style={styles.sectionTitleText}>Details</Text>
                </View>

                {/* Beds/Baths/Cars row */}
                {(property.beds != null || property.baths != null || property.cars != null) && (
                  <View style={styles.specRow}>
                    {property.beds != null && (
                      <View style={styles.specItem}>
                        <Icon name="bed" size={24} color={theme.colors.primary} />
                        <Text variant="titleMedium" style={{ marginTop: 2 }}>{property.beds}</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Beds</Text>
                      </View>
                    )}
                    {property.baths != null && (
                      <View style={styles.specItem}>
                        <Icon name="shower" size={24} color={theme.colors.primary} />
                        <Text variant="titleMedium" style={{ marginTop: 2 }}>{property.baths}</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Baths</Text>
                      </View>
                    )}
                    {property.cars != null && (
                      <View style={styles.specItem}>
                        <Icon name="car" size={24} color={theme.colors.primary} />
                        <Text variant="titleMedium" style={{ marginTop: 2 }}>{property.cars}</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Cars</Text>
                      </View>
                    )}
                  </View>
                )}

                <Divider style={styles.divider} />

                {/* Price info */}
                <View style={styles.infoRow}>
                  <Icon name="cash" size={20} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyMedium" style={styles.infoLabel}>Appraisal</Text>
                  <Text variant="bodyMedium" style={styles.infoValue}>{formatPrice(property.appraisal_price)}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Icon name="cash-multiple" size={20} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyMedium" style={styles.infoLabel}>Advertised</Text>
                  <Text variant="bodyMedium" style={styles.infoValue}>{formatPrice(property.advertised_price)}</Text>
                </View>
                {property.sale_price != null && (
                  <View style={styles.infoRow}>
                    <Icon name="cash-check" size={20} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.infoLabel}>Sale Price</Text>
                    <Text variant="bodyMedium" style={styles.infoValue}>{formatPrice(property.sale_price)}</Text>
                  </View>
                )}
                {property.commission_percent != null && (
                  <View style={styles.infoRow}>
                    <Icon name="percent" size={20} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.infoLabel}>Commission</Text>
                    <Text variant="bodyMedium" style={styles.infoValue}>{property.commission_percent}%</Text>
                  </View>
                )}

                <Divider style={styles.divider} />

                {/* Size info */}
                {(property.land_size_sqm != null || property.building_size_sqm != null) && (
                  <>
                    {property.land_size_sqm != null && (
                      <View style={styles.infoRow}>
                        <Icon name="texture-box" size={20} color={theme.colors.onSurfaceVariant} />
                        <Text variant="bodyMedium" style={styles.infoLabel}>Land Size</Text>
                        <Text variant="bodyMedium" style={styles.infoValue}>{formatSqm(property.land_size_sqm)}</Text>
                      </View>
                    )}
                    {property.building_size_sqm != null && (
                      <View style={styles.infoRow}>
                        <Icon name="home-floor-1" size={20} color={theme.colors.onSurfaceVariant} />
                        <Text variant="bodyMedium" style={styles.infoLabel}>Building</Text>
                        <Text variant="bodyMedium" style={styles.infoValue}>{formatSqm(property.building_size_sqm)}</Text>
                      </View>
                    )}
                    <Divider style={styles.divider} />
                  </>
                )}

                {/* Description */}
                {property.description && (
                  <View>
                    <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                      Description
                    </Text>
                    <Text variant="bodyMedium">{property.description}</Text>
                  </View>
                )}

                {/* Features */}
                {property.features && property.features.length > 0 && (
                  <View style={{ marginTop: 12 }}>
                    <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                      Features
                    </Text>
                    <View style={styles.chipGrid}>
                      {property.features.map(feature => (
                        <Chip key={feature} compact style={styles.featureChip}>
                          {feature}
                        </Chip>
                      ))}
                    </View>
                  </View>
                )}
              </Surface>

              {/* Contacts Card */}
              <Surface style={styles.sectionCard} elevation={1}>
                <View style={styles.sectionHeaderWithAction}>
                  <View style={styles.sectionHeader}>
                    <Icon name="account-group" size={20} color={theme.colors.primary} />
                    <Text variant="titleSmall" style={styles.sectionTitleText}>Contacts</Text>
                  </View>
                  <Button
                    mode="contained-tonal"
                    icon="plus"
                    onPress={() => setAddContactDialogVisible(true)}
                    compact
                  >
                    Add
                  </Button>
                </View>

                {(!property.property_contacts || property.property_contacts.length === 0) ? (
                  <View style={styles.emptyContacts}>
                    <Icon name="account-question" size={32} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                      No contacts linked yet
                    </Text>
                  </View>
                ) : (
                  property.property_contacts.map(pc => (
                    <View key={pc.id} style={styles.contactRow}>
                      <View style={styles.contactInfo}>
                        <Text variant="bodyMedium">
                          {pc.contact
                            ? `${pc.contact.first_name} ${pc.contact.last_name || ''}`.trim()
                            : 'Unknown Contact'}
                        </Text>
                        {pc.contact?.phone && (
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {pc.contact.phone}
                          </Text>
                        )}
                      </View>
                      <Chip
                        compact
                        style={{ backgroundColor: ROLE_COLORS[pc.role] }}
                        textStyle={{ color: '#fff', fontSize: 11 }}
                      >
                        {ROLE_LABELS[pc.role]}
                      </Chip>
                      <IconButton
                        icon="close-circle"
                        size={20}
                        iconColor={theme.colors.error}
                        onPress={() => handleRemoveContact(pc)}
                        accessibilityLabel={`Remove ${pc.contact?.first_name || 'contact'}`}
                      />
                    </View>
                  ))
                )}
              </Surface>

              {/* Matched Buyers */}
              <Surface style={styles.sectionCard} elevation={1}>
                <View style={styles.sectionHeaderWithAction}>
                  <View style={styles.sectionHeader}>
                    <Icon name="account-search" size={20} color={theme.colors.primary} />
                    <Text variant="titleSmall" style={styles.sectionTitleText}>Matched Buyers</Text>
                  </View>
                  <Button
                    mode="contained-tonal"
                    icon="magnify"
                    onPress={handleFindMatchingBuyers}
                    loading={isBuyerMatchLoading}
                    disabled={isBuyerMatchLoading}
                    compact
                  >
                    Find Matching Buyers
                  </Button>
                </View>

                {isBuyerMatchLoading && (
                  <View style={styles.emptyContacts}>
                    <ActivityIndicator size="small" />
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                      Searching for matching buyers...
                    </Text>
                  </View>
                )}

                {!isBuyerMatchLoading && hasSearchedBuyers && buyerMatches.length === 0 && (
                  <View style={styles.emptyContacts}>
                    <Icon name="account-off" size={32} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                      No matching buyers found
                    </Text>
                  </View>
                )}

                {!isBuyerMatchLoading && buyerMatches.length > 0 && buyerMatches.map((match, index) => (
                  <Surface
                    key={`${match.contact.id}-${index}`}
                    style={styles.matchCard}
                    elevation={0}
                  >
                    <View
                      style={styles.contactOptionTouchable}
                      onTouchEnd={() => router.push(`/contact/${match.contact.id}`)}
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={`View ${match.contact.first_name}`}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.matchNameRow}>
                          <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                            {`${match.contact.first_name} ${match.contact.last_name || ''}`.trim()}
                          </Text>
                          <Chip
                            compact
                            style={{ backgroundColor: MATCH_STRENGTH_COLORS[match.strength] }}
                            textStyle={{ color: '#fff', fontSize: 10 }}
                          >
                            {MATCH_STRENGTH_LABELS[match.strength]}
                          </Chip>
                        </View>
                        {match.contact.phone && (
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                            {match.contact.phone}
                          </Text>
                        )}
                        <View style={styles.matchFieldChips}>
                          {match.matchingFields.map(field => (
                            <Chip
                              key={field}
                              compact
                              style={styles.matchFieldChip}
                              textStyle={{ fontSize: 10 }}
                            >
                              {field}
                            </Chip>
                          ))}
                        </View>
                      </View>
                      <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                    </View>
                  </Surface>
                ))}
              </Surface>

              {/* Inspections */}
              <Surface style={styles.sectionCard} elevation={1}>
                <View style={styles.sectionHeaderWithAction}>
                  <View style={styles.sectionHeader}>
                    <Icon name="clipboard-check" size={20} color={theme.colors.primary} />
                    <Text variant="titleSmall" style={styles.sectionTitleText}>Inspections</Text>
                  </View>
                  <Button
                    mode="contained-tonal"
                    icon="plus"
                    onPress={() => setScheduleDialogVisible(true)}
                    compact
                  >
                    Schedule
                  </Button>
                </View>

                {isInspectionsLoading && (
                  <View style={styles.emptyContacts}>
                    <ActivityIndicator size="small" />
                  </View>
                )}

                {!isInspectionsLoading && inspections.length === 0 && (
                  <View style={styles.emptyContacts}>
                    <Icon name="calendar-blank" size={32} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                      No inspections scheduled
                    </Text>
                  </View>
                )}

                {!isInspectionsLoading && inspections.map(inspection => (
                  <Surface
                    key={inspection.id}
                    style={styles.matchCard}
                    elevation={0}
                  >
                    <View
                      style={styles.contactOptionTouchable}
                      onTouchEnd={() => router.push(`/inspection/${inspection.id}`)}
                      accessible
                      accessibilityRole="button"
                      accessibilityLabel={`View inspection on ${formatDateTime(inspection.scheduled_at)}`}
                    >
                      <View style={{ flex: 1 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                          {formatDateTime(inspection.scheduled_at)}
                        </Text>
                        <View style={[styles.badgeRow, { marginTop: 4 }]}>
                          <Chip
                            compact
                            style={{ backgroundColor: theme.colors.secondaryContainer }}
                            textStyle={{ color: theme.colors.onSecondaryContainer, fontSize: 10 }}
                          >
                            {INSPECTION_TYPE_LABELS[inspection.type]}
                          </Chip>
                          <Chip
                            compact
                            style={{ backgroundColor: INSPECTION_STATUS_COLORS[inspection.status] }}
                            textStyle={{ color: '#fff', fontSize: 10 }}
                          >
                            {INSPECTION_STATUS_LABELS[inspection.status]}
                          </Chip>
                          {inspection.attendees && (
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {(inspection.attendees as unknown as { count: number }[])[0]?.count ?? 0} attendees
                            </Text>
                          )}
                        </View>
                      </View>
                      <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                    </View>
                  </Surface>
                ))}
              </Surface>

              {/* Status Controls */}
              {nextStatuses.length > 0 && (
                <Surface style={styles.sectionCard} elevation={1}>
                  <View style={styles.sectionHeader}>
                    <Icon name="arrow-right-circle" size={20} color={theme.colors.primary} />
                    <Text variant="titleSmall" style={styles.sectionTitleText}>Pipeline</Text>
                  </View>
                  <View style={styles.statusActions}>
                    {nextStatuses.map(ns => {
                      const nextColor = getStatusColor(ns.status);
                      const isWithdraw = ns.status === 'withdrawn';
                      return (
                        <Button
                          key={ns.status}
                          mode={isWithdraw ? 'outlined' : 'contained'}
                          buttonColor={isWithdraw ? undefined : nextColor}
                          textColor={isWithdraw ? theme.colors.error : '#fff'}
                          style={[styles.statusButton, isWithdraw && { borderColor: theme.colors.error }]}
                          onPress={() => handleStatusChange(ns.status)}
                          icon={isWithdraw ? 'close-circle-outline' : 'arrow-right'}
                        >
                          {ns.label}
                        </Button>
                      );
                    })}
                  </View>
                </Surface>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        {/* Delete dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Property</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to delete {property.address}? This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleDelete} textColor={theme.colors.error}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Add contact dialog */}
        <Dialog visible={addContactDialogVisible} onDismiss={() => setAddContactDialogVisible(false)}>
          <Dialog.Title>Add Contact</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Link a contact to this property with a role.
            </Text>

            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Role
            </Text>
            <View style={styles.roleChipGrid}>
              {(Object.keys(ROLE_LABELS) as PropertyContactRole[]).map(role => (
                <Chip
                  key={role}
                  selected={selectedRole === role}
                  onPress={() => setSelectedRole(role)}
                  compact
                >
                  {ROLE_LABELS[role]}
                </Chip>
              ))}
            </View>

            <Divider style={{ marginVertical: 12 }} />

            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Contact
            </Text>
            {availableContacts.length === 0 ? (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                No available contacts to link.
              </Text>
            ) : (
              <ScrollView style={{ maxHeight: 200 }}>
                {availableContacts.map(contact => {
                  const name = `${contact.first_name} ${contact.last_name || ''}`.trim();
                  const isSelected = selectedContactId === contact.id;
                  return (
                    <Surface
                      key={contact.id}
                      style={[
                        styles.contactOption,
                        isSelected && { backgroundColor: theme.colors.primaryContainer },
                      ]}
                      elevation={isSelected ? 1 : 0}
                    >
                      <View
                        style={styles.contactOptionTouchable}
                        onTouchEnd={() => setSelectedContactId(contact.id)}
                        accessible
                        accessibilityRole="button"
                      >
                        <Icon
                          name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                          size={20}
                          color={isSelected ? theme.colors.primary : theme.colors.onSurfaceVariant}
                        />
                        <View style={{ marginLeft: 12, flex: 1 }}>
                          <Text variant="bodyMedium">{name}</Text>
                          {contact.phone && (
                            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                              {contact.phone}
                            </Text>
                          )}
                        </View>
                      </View>
                    </Surface>
                  );
                })}
              </ScrollView>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddContactDialogVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleAddContact}
              disabled={!selectedContactId}
            >
              Add
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Schedule Inspection dialog */}
        <Dialog visible={scheduleDialogVisible} onDismiss={() => setScheduleDialogVisible(false)}>
          <Dialog.Title>Schedule Inspection</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              label="Date (YYYY-MM-DD)"
              value={inspectionDate}
              onChangeText={setInspectionDate}
              placeholder="2025-06-15"
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Time (HH:MM)"
              value={inspectionTime}
              onChangeText={setInspectionTime}
              placeholder="10:00"
              style={styles.input}
            />
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
              Type
            </Text>
            <View style={styles.roleChipGrid}>
              <Chip
                selected={inspectionType === 'open_home'}
                onPress={() => setInspectionType('open_home')}
                compact
              >
                Open Home
              </Chip>
              <Chip
                selected={inspectionType === 'private'}
                onPress={() => setInspectionType('private')}
                compact
              >
                Private
              </Chip>
            </View>
            <TextInput
              mode="outlined"
              label="Duration (minutes)"
              value={inspectionDuration}
              onChangeText={setInspectionDuration}
              keyboardType="number-pad"
              style={[styles.input, { marginTop: 12 }]}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setScheduleDialogVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleScheduleInspection}
              loading={isScheduling}
              disabled={isScheduling || !inspectionDate || !inspectionTime}
            >
              Schedule
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
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
  sectionHeaderWithAction: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleText: {
    marginLeft: 8,
    fontWeight: '600',
  },
  propertyAddress: {
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  specItem: {
    alignItems: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoLabel: {
    marginLeft: 12,
    flex: 1,
    color: '#666',
  },
  infoValue: {
    fontWeight: '600',
  },
  divider: {
    marginVertical: 12,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  featureChip: {
    marginBottom: 0,
  },
  emptyContacts: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  contactInfo: {
    flex: 1,
  },
  statusActions: {
    gap: 8,
  },
  statusButton: {
    borderRadius: 8,
  },
  roleChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contactOption: {
    borderRadius: 8,
    marginBottom: 4,
    overflow: 'hidden',
  },
  contactOptionTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
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
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  editButton: {
    minWidth: 100,
  },
  matchCard: {
    borderRadius: 8,
    marginBottom: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.02)',
  },
  matchNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  matchFieldChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
  },
  matchFieldChip: {
    height: 24,
  },
});
