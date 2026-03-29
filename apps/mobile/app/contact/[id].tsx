import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform, Linking, AppState, Pressable, TouchableOpacity } from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Surface,
  Chip,
  Divider,
  IconButton,
  Menu,
  Portal,
  Dialog,
  ActivityIndicator,
  TextInput,
  SegmentedButtons,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore, useEmailCampaignStore, useBuyerMatchStore, usePropertyStore, useInspectionStore, useCustomFieldStore } from '@realestate-crm/hooks';
import type {
  Contact, ContactFormData, ContactSource, ContactType as CType,
  ContactStatus, PreferredContactMethod, ContactRequirement, Property,
} from '@realestate-crm/types';
import { Switch } from 'react-native';
import { ContactForm } from '@realestate-crm/ui';
import { ActivityFeed } from '@realestate-crm/ui';
import { AddActivityDialog } from '@realestate-crm/ui';
import { CustomFieldRenderer } from '@realestate-crm/ui';

// --- Constants ---

const SOURCE_OPTIONS: { label: string; value: ContactSource }[] = [
  { label: 'Referral', value: 'referral' },
  { label: 'Web', value: 'web' },
  { label: 'Walk-in', value: 'walk_in' },
  { label: 'Portal', value: 'portal' },
  { label: 'Phone', value: 'phone' },
  { label: 'Import', value: 'import' },
  { label: 'Other', value: 'other' },
];

const CONTACT_TYPE_OPTIONS: { label: string; value: CType }[] = [
  { label: 'Buyer', value: 'buyer' },
  { label: 'Seller', value: 'seller' },
  { label: 'Tenant', value: 'tenant' },
  { label: 'Landlord', value: 'landlord' },
  { label: 'Investor', value: 'investor' },
  { label: 'Other', value: 'other' },
];

const STATUS_OPTIONS: { label: string; value: ContactStatus }[] = [
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Archived', value: 'archived' },
];

const PREFERRED_METHOD_OPTIONS: { label: string; value: PreferredContactMethod }[] = [
  { label: 'Phone', value: 'phone' },
  { label: 'Email', value: 'email' },
  { label: 'SMS', value: 'sms' },
  { label: 'Other', value: 'other' },
];

const REQUIREMENT_CATEGORIES = ['house', 'apartment', 'townhouse', 'land', 'unit', 'villa', 'other'] as const;

// --- Helpers ---

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getLeadScoreColor(score: number, theme: { colors: { error: string; tertiary: string; primary: string; onSurfaceVariant: string } }): string {
  if (score <= 33) return theme.colors.error;
  if (score <= 66) return theme.colors.tertiary;
  return theme.colors.primary;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

// --- Collapsible Card ---

function CollapsibleCard({
  title,
  defaultExpanded = false,
  children,
  rightAction,
}: {
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  rightAction?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const theme = useTheme();
  return (
    <Surface style={cardStyles.surface} elevation={1}>
      <Pressable
        style={cardStyles.header}
        onPress={() => setExpanded(prev => !prev)}
      >
        <Text variant="titleMedium" style={{ flex: 1 }}>{title}</Text>
        {rightAction}
        <Icon
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={theme.colors.onSurfaceVariant}
        />
      </Pressable>
      {expanded && <View style={cardStyles.body}>{children}</View>}
    </Surface>
  );
}

const cardStyles = StyleSheet.create({
  surface: { borderRadius: 12, marginTop: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 },
  body: { paddingHorizontal: 16, paddingBottom: 16 },
});

// --- Edit Dialog ---

interface EditFormState {
  source: ContactSource | '';
  contact_type: CType | '';
  company_name: string;
  title: string;
  preferred_contact_method: PreferredContactMethod | '';
  do_not_contact: boolean;
  notes: string;
  status: ContactStatus | '';
  next_follow_up_at: string;
}

function initialEditState(contact: Contact): EditFormState {
  return {
    source: contact.source ?? '',
    contact_type: contact.contact_type ?? '',
    company_name: contact.company_name ?? '',
    title: contact.title ?? '',
    preferred_contact_method: contact.preferred_contact_method ?? '',
    do_not_contact: contact.do_not_contact ?? false,
    notes: contact.notes ?? '',
    status: contact.status ?? '',
    next_follow_up_at: contact.next_follow_up_at ?? '',
  };
}

// --- Requirement Form Dialog ---

interface RequirementFormState {
  for_type: 'buy' | 'rent';
  suburbs: string;
  price_min: string;
  price_max: string;
  beds_min: string;
  baths_min: string;
  cars_min: string;
  categories: string[];
  features: string;
  active: boolean;
}

const DEFAULT_REQ_FORM: RequirementFormState = {
  for_type: 'buy',
  suburbs: '',
  price_min: '',
  price_max: '',
  beds_min: '',
  baths_min: '',
  cars_min: '',
  categories: [],
  features: '',
  active: true,
};

// --- Main Screen ---

export default function ContactDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  // CRM store
  const contacts = useCRMStore(state => state.contacts);
  const updateContact = useCRMStore(state => state.updateContact);
  const deleteContact = useCRMStore(state => state.deleteContact);
  const addActivity = useCRMStore(state => state.addActivity);
  const updateActivity = useCRMStore(state => state.updateActivity);
  const fetchActivities = useCRMStore(state => state.fetchActivities);
  const isLoading = useCRMStore(state => state.isLoading);

  // Email campaign
  const fetchSubscription = useEmailCampaignStore(state => state.fetchSubscription);
  const updateSubscription = useEmailCampaignStore(state => state.updateSubscription);
  const [emailSubscribed, setEmailSubscribed] = useState(true);

  // Buyer match store
  const requirements = useBuyerMatchStore(state => state.requirements);
  const fetchRequirements = useBuyerMatchStore(state => state.fetchRequirements);
  const createRequirement = useBuyerMatchStore(state => state.createRequirement);
  const deleteRequirement = useBuyerMatchStore(state => state.deleteRequirement);
  const findMatchingProperties = useBuyerMatchStore(state => state.findMatchingProperties);

  // Property store
  const properties = usePropertyStore(state => state.properties);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);

  // Inspection store
  const inspections = useInspectionStore(state => state.inspections);
  const fetchInspections = useInspectionStore(state => state.fetchInspections);

  // Contact state
  const [contact, setContact] = useState<Contact | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [activityDialogVisible, setActivityDialogVisible] = useState(false);

  // Edit enrichment dialog
  const [editEnrichmentVisible, setEditEnrichmentVisible] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>(initialEditState({} as Contact));

  // Custom fields for requirements
  const reqFieldDefs = useCustomFieldStore(s => s.definitions).filter(d => d.entity_type === 'contact_requirement');
  const fetchCustomFieldDefs = useCustomFieldStore(s => s.fetchDefinitions);
  const setCustomFieldValue = useCustomFieldStore(s => s.setFieldValue);
  const createFieldDefinition = useCustomFieldStore(s => s.createDefinition);

  // Requirement dialog
  const [reqDialogVisible, setReqDialogVisible] = useState(false);
  const [reqForm, setReqForm] = useState<RequirementFormState>(DEFAULT_REQ_FORM);
  const [reqCustomValues, setReqCustomValues] = useState<Record<string, string | number | boolean | string[]>>({});
  const [addFieldDialogVisible, setAddFieldDialogVisible] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<'text' | 'number' | 'boolean' | 'date' | 'single_select' | 'multi_select'>('text');
  const [newFieldOptions, setNewFieldOptions] = useState('');

  // Matching properties per requirement
  const [matchResults, setMatchResults] = useState<Record<string, Property[]>>({});

  // Call tracking state
  const [callNotesVisible, setCallNotesVisible] = useState(false);
  const [callNotes, setCallNotes] = useState('');
  const pendingCallActivityId = useRef<string | null>(null);

  useEffect(() => {
    const found = contacts.find(c => c.id === id);
    setContact(found || null);

    if (id) {
      fetchActivities(id);
      fetchSubscription(id).then((sub) => {
        if (sub) setEmailSubscribed(sub.subscribed);
      });
      fetchRequirements(id);
      fetchProperties();
      fetchInspections(undefined, true);
      fetchCustomFieldDefs('contact_requirement');
    }
  }, [id, contacts]);

  // Listen for app returning to foreground after a call
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && pendingCallActivityId.current) {
        setCallNotesVisible(true);
      }
    });
    return () => sub.remove();
  }, []);

  // --- Linked properties for this contact ---
  const linkedProperties = useMemo(() => {
    if (!id) return [];
    return properties.filter(p =>
      p.property_contacts?.some(pc => pc.contact_id === id)
    );
  }, [properties, id]);

  // --- Inspections where this contact is an attendee ---
  const contactInspections = useMemo(() => {
    if (!id) return [];
    return inspections.filter(insp =>
      insp.attendees?.some(a => a.contact_id === id)
    );
  }, [inspections, id]);

  // --- Handlers ---

  const handleCall = useCallback(async () => {
    if (!contact?.phone || !id) return;
    const activity = await addActivity({
      contact_id: id,
      type: 'call',
      content: 'Outgoing call',
    });
    if (activity) {
      pendingCallActivityId.current = activity.id;
    }
    Linking.openURL(`tel:${contact.phone}`);
  }, [contact, id, addActivity]);

  const handleSaveCallNotes = useCallback(async () => {
    if (pendingCallActivityId.current && callNotes.trim()) {
      await updateActivity(pendingCallActivityId.current, { content: callNotes.trim() });
      if (id) await fetchActivities(id);
    }
    pendingCallActivityId.current = null;
    setCallNotes('');
    setCallNotesVisible(false);
  }, [callNotes, id, updateActivity, fetchActivities]);

  const handleSkipCallNotes = useCallback(() => {
    pendingCallActivityId.current = null;
    setCallNotes('');
    setCallNotesVisible(false);
  }, []);

  const handleUpdate = async (data: ContactFormData) => {
    if (!id) return;
    // Strip form-only fields that aren't DB columns
    const { tag_ids, initial_note, ...contactData } = data as any;
    await updateContact(id, contactData);
    // Check if store reported an error
    const storeError = useCRMStore.getState().error;
    if (storeError) {
      Alert.alert('Error', 'Failed to save changes. Please try again.');
      return;
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteContact(id);
    router.back();
  };

  const confirmDelete = () => {
    setMenuVisible(false);
    setDeleteDialogVisible(true);
  };

  const handleOpenEditEnrichment = () => {
    if (contact) {
      setEditForm(initialEditState(contact));
    }
    setMenuVisible(false);
    setEditEnrichmentVisible(true);
  };

  const handleSaveEnrichment = async () => {
    if (!id) return;
    const updates: Partial<Contact> = {
      source: editForm.source || undefined,
      contact_type: editForm.contact_type || undefined,
      company_name: editForm.company_name || undefined,
      title: editForm.title || undefined,
      preferred_contact_method: editForm.preferred_contact_method || undefined,
      do_not_contact: editForm.do_not_contact,
      notes: editForm.notes || undefined,
      status: editForm.status || undefined,
      next_follow_up_at: editForm.next_follow_up_at || undefined,
    };
    await updateContact(id, updates);
    setEditEnrichmentVisible(false);
  };

  // --- Requirement handlers ---

  const handleOpenReqDialog = () => {
    setReqForm(DEFAULT_REQ_FORM);
    setReqCustomValues({});
    setReqDialogVisible(true);
  };

  const handleAddCustomField = async () => {
    if (!newFieldLabel.trim()) return;
    const fieldName = newFieldLabel.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const needsOpts = newFieldType === 'single_select' || newFieldType === 'multi_select';
    const options = needsOpts ? newFieldOptions.split(',').map(o => o.trim()).filter(Boolean) : undefined;
    await createFieldDefinition({
      entity_type: 'contact_requirement',
      field_name: fieldName,
      field_label: newFieldLabel.trim(),
      field_type: newFieldType,
      options,
      is_required: false,
      display_order: reqFieldDefs.length,
    });
    setNewFieldLabel('');
    setNewFieldType('text');
    setNewFieldOptions('');
    setAddFieldDialogVisible(false);
  };

  const handleSaveRequirement = async () => {
    if (!id) return;
    const suburbsList = reqForm.suburbs
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    const featuresList = reqForm.features
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const newReq = await createRequirement({
      contact_id: id,
      for_type: reqForm.for_type,
      property_types: ['residential'],
      categories: reqForm.categories,
      suburbs: suburbsList,
      price_min: reqForm.price_min ? Number(reqForm.price_min) : undefined,
      price_max: reqForm.price_max ? Number(reqForm.price_max) : undefined,
      beds_min: reqForm.beds_min ? Number(reqForm.beds_min) : undefined,
      baths_min: reqForm.baths_min ? Number(reqForm.baths_min) : undefined,
      cars_min: reqForm.cars_min ? Number(reqForm.cars_min) : undefined,
      features: featuresList,
      active: reqForm.active,
    });

    // Save custom field values for the new requirement
    if (newReq) {
      for (const [defId, val] of Object.entries(reqCustomValues)) {
        if (val !== '' && val !== null && val !== undefined) {
          await setCustomFieldValue(defId, newReq.id, 'contact_requirement', val);
        }
      }
    }

    setReqDialogVisible(false);
  };

  const handleDeleteRequirement = (reqId: string) => {
    Alert.alert('Delete Requirement', 'Remove this requirement?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteRequirement(reqId) },
    ]);
  };

  const handleFindProperties = (requirement: ContactRequirement) => {
    const matched = findMatchingProperties(requirement, properties);
    setMatchResults(prev => ({ ...prev, [requirement.id]: matched }));
  };

  // --- Render ---

  if (!contact) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const fullName = `${contact.first_name} ${contact.last_name || ''}`.trim();

  return (
    <>
      <Stack.Screen
        options={{
          title: fullName,
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
                  setIsEditing(true);
                }}
                title="Edit Contact"
              />
              <Menu.Item
                leadingIcon="account-details"
                onPress={handleOpenEditEnrichment}
                title="Edit Details"
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
            <ContactForm
              initialData={{
                first_name: contact.first_name,
                last_name: contact.last_name || '',
                email: contact.email || '',
                phone: contact.phone || '',
                address: contact.address || '',
                unit_number: contact.unit_number || '',
                latitude: contact.latitude,
                longitude: contact.longitude,
                tag_id: contact.tag_id,
                tag_ids: (contact.tags || []).map(t => t.id),
              }}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isLoading={isLoading}
              submitLabel="Update"
            />
          ) : (
            <>
              {/* ===== HEADER CARD ===== */}
              <Surface style={styles.headerCard} elevation={1}>
                <Text variant="headlineSmall" style={styles.name}>{fullName}</Text>

                {/* Type + Status chips */}
                <View style={styles.chipRow}>
                  {contact.contact_type && (
                    <Chip compact icon="account">{capitalizeFirst(contact.contact_type)}</Chip>
                  )}
                  {contact.status && (
                    <Chip
                      compact
                      icon="circle"
                      style={
                        contact.status === 'active'
                          ? { backgroundColor: theme.colors.primaryContainer }
                          : contact.status === 'archived'
                            ? { backgroundColor: theme.colors.surfaceVariant }
                            : undefined
                      }
                    >
                      {capitalizeFirst(contact.status)}
                    </Chip>
                  )}
                </View>

                {/* Do-not-contact banner */}
                {contact.do_not_contact && (
                  <Surface style={[styles.dncBanner, { backgroundColor: theme.colors.errorContainer }]} elevation={0}>
                    <Icon name="cancel" size={18} color={theme.colors.error} />
                    <Text variant="labelLarge" style={{ color: theme.colors.error, marginLeft: 8 }}>
                      Do Not Contact
                    </Text>
                  </Surface>
                )}

                {/* Tags */}
                {(contact.tags && contact.tags.length > 0) ? (
                  <View style={styles.tagChips}>
                    {contact.tags.map(tag => (
                      <Chip
                        key={tag.id}
                        style={[styles.tagChip, { backgroundColor: tag.color }]}
                        textStyle={{ color: '#fff' }}
                        compact
                      >
                        {tag.name}
                      </Chip>
                    ))}
                  </View>
                ) : contact.tag ? (
                  <View style={styles.tagChips}>
                    <Chip
                      style={[styles.tagChip, { backgroundColor: contact.tag.color }]}
                      textStyle={{ color: '#fff' }}
                    >
                      {contact.tag.name}
                    </Chip>
                  </View>
                ) : null}

                {/* Quick action row */}
                <View style={styles.quickActions}>
                  {contact.phone && (
                    <Button
                      mode="contained"
                      icon="phone"
                      onPress={handleCall}
                      buttonColor="#16a34a"
                      textColor="#fff"
                      compact
                      style={styles.quickActionBtn}
                    >
                      Call
                    </Button>
                  )}
                  {contact.email && (
                    <Button
                      mode="contained-tonal"
                      icon="email"
                      onPress={() => Linking.openURL(`mailto:${contact.email}`)}
                      compact
                      style={styles.quickActionBtn}
                    >
                      Email
                    </Button>
                  )}
                  {contact.phone && (
                    <Button
                      mode="contained-tonal"
                      icon="message-text"
                      onPress={() => Linking.openURL(`sms:${contact.phone}`)}
                      compact
                      style={styles.quickActionBtn}
                    >
                      SMS
                    </Button>
                  )}
                </View>
              </Surface>

              {/* ===== INFO CARD ===== */}
              <CollapsibleCard title="Info" defaultExpanded>
                {/* Two-column info rows */}
                {contact.phone && (
                  <View style={styles.infoRow}>
                    <Icon name="phone" size={18} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.infoText}>{contact.phone}</Text>
                  </View>
                )}
                {contact.email && (
                  <View style={styles.infoRow}>
                    <Icon name="email" size={18} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.infoText}>{contact.email}</Text>
                  </View>
                )}
                {contact.address && (
                  <View style={styles.infoRow}>
                    <Icon name="map-marker" size={18} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.infoText}>
                      {contact.unit_number ? `${contact.unit_number} / ` : ''}{contact.address}
                    </Text>
                  </View>
                )}
                {contact.company_name && (
                  <View style={styles.infoRow}>
                    <Icon name="office-building" size={18} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.infoText}>{contact.company_name}</Text>
                  </View>
                )}
                {contact.title && (
                  <View style={styles.infoRow}>
                    <Icon name="badge-account" size={18} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyMedium" style={styles.infoText}>{contact.title}</Text>
                  </View>
                )}

                {/* Two-column grid for source + preferred method */}
                <View style={styles.twoCol}>
                  {contact.source && (
                    <View style={styles.colItem}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Source</Text>
                      <Text variant="bodyMedium">{capitalizeFirst(contact.source)}</Text>
                    </View>
                  )}
                  {contact.preferred_contact_method && (
                    <View style={styles.colItem}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Preferred Method</Text>
                      <Text variant="bodyMedium">{capitalizeFirst(contact.preferred_contact_method)}</Text>
                    </View>
                  )}
                </View>

                {/* Lead score */}
                {contact.lead_score != null && (
                  <View style={styles.infoRow}>
                    <Icon name="star" size={18} color={getLeadScoreColor(contact.lead_score, theme)} />
                    <Text
                      variant="bodyMedium"
                      style={[styles.infoText, { color: getLeadScoreColor(contact.lead_score, theme) }]}
                    >
                      Lead Score: {contact.lead_score}/100
                    </Text>
                  </View>
                )}

                {/* Dates */}
                <View style={styles.twoCol}>
                  {contact.last_contacted_at && (
                    <View style={styles.colItem}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Last Contacted</Text>
                      <Text variant="bodyMedium">{formatRelativeTime(contact.last_contacted_at)}</Text>
                    </View>
                  )}
                  {contact.next_follow_up_at && (
                    <View style={styles.colItem}>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Next Follow-up</Text>
                      <Text variant="bodyMedium">{formatDate(contact.next_follow_up_at)}</Text>
                    </View>
                  )}
                </View>

                {/* Notes */}
                {contact.notes && (
                  <View style={{ marginTop: 8 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>Notes</Text>
                    <Text variant="bodyMedium">{contact.notes}</Text>
                  </View>
                )}

                {/* Coordinates + View on Map */}
                {contact.latitude != null && contact.longitude != null && (
                  <TouchableOpacity
                    style={styles.coordinatesRow}
                    onPress={() => router.push(`/(tabs)/map?lat=${contact.latitude}&lng=${contact.longitude}&zoom=0.005&layer=contacts&label=${encodeURIComponent(contact.first_name)}` as never)}
                    activeOpacity={0.7}
                  >
                    <Icon name="map-marker-radius" size={16} color={theme.colors.primary} />
                    <Text variant="bodySmall" style={{ color: theme.colors.primary, marginLeft: 4 }}>
                      View on Map
                    </Text>
                  </TouchableOpacity>
                )}

                {/* Inline custom fields for this contact */}
                <CustomFieldRenderer entityType="contact" entityId={id!} inline />
              </CollapsibleCard>

              {/* ===== EMAIL SUBSCRIPTION ===== */}
              {contact.email && (
                <Surface style={styles.subscriptionRow} elevation={1}>
                  <View style={styles.subscriptionContent}>
                    <Icon name="email-newsletter" size={20} color={theme.colors.onSurfaceVariant} />
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium">Email Campaigns</Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {emailSubscribed ? 'Subscribed to campaigns' : 'Unsubscribed from campaigns'}
                      </Text>
                    </View>
                    <Switch
                      value={emailSubscribed}
                      onValueChange={async (val) => {
                        setEmailSubscribed(val);
                        if (id) await updateSubscription(id, val);
                      }}
                    />
                  </View>
                </Surface>
              )}

              {/* ===== REQUIREMENTS CARD ===== */}
              <CollapsibleCard
                title="Requirements"
                defaultExpanded={requirements.length > 0}
                rightAction={
                  <IconButton icon="plus" size={18} onPress={handleOpenReqDialog} />
                }
              >
                {requirements.length === 0 ? (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    No requirements yet
                  </Text>
                ) : (
                  requirements.map(req => (
                    <View key={req.id} style={styles.reqItem}>
                      <View style={styles.reqHeader}>
                        <Chip compact icon={req.for_type === 'buy' ? 'home' : 'key'}>
                          {req.for_type === 'buy' ? 'Buy' : 'Rent'}
                        </Chip>
                        <View style={{ flex: 1 }} />
                        <IconButton
                          icon="delete-outline"
                          size={18}
                          onPress={() => handleDeleteRequirement(req.id)}
                        />
                      </View>

                      {/* Suburbs */}
                      {req.suburbs.length > 0 && (
                        <View style={styles.chipRow}>
                          {req.suburbs.map(s => (
                            <Chip key={s} compact style={styles.smallChip}>{s}</Chip>
                          ))}
                        </View>
                      )}

                      {/* Price range */}
                      {(req.price_min != null || req.price_max != null) && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          Price: {req.price_min != null ? `$${req.price_min.toLocaleString()}` : 'Any'} - {req.price_max != null ? `$${req.price_max.toLocaleString()}` : 'Any'}
                        </Text>
                      )}

                      {/* Beds/Baths/Cars */}
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {[
                          req.beds_min != null ? `${req.beds_min}+ beds` : null,
                          req.baths_min != null ? `${req.baths_min}+ baths` : null,
                          req.cars_min != null ? `${req.cars_min}+ cars` : null,
                        ].filter(Boolean).join(' | ') || 'No bed/bath/car requirements'}
                      </Text>

                      {/* Categories */}
                      {req.categories.length > 0 && (
                        <View style={styles.chipRow}>
                          {req.categories.map(c => (
                            <Chip key={c} compact style={styles.smallChip}>{capitalizeFirst(c)}</Chip>
                          ))}
                        </View>
                      )}

                      {/* Inline custom fields for this requirement */}
                      <CustomFieldRenderer entityType="contact_requirement" entityId={req.id} inline />

                      <Button
                        mode="outlined"
                        icon="magnify"
                        compact
                        onPress={() => handleFindProperties(req)}
                        style={{ alignSelf: 'flex-start', marginTop: 8 }}
                      >
                        Find Properties
                      </Button>

                      {/* Matching properties results */}
                      {matchResults[req.id] && matchResults[req.id].length > 0 && (
                        <View style={styles.matchResults}>
                          <Text variant="labelMedium" style={{ marginBottom: 4 }}>
                            {matchResults[req.id].length} matching {matchResults[req.id].length === 1 ? 'property' : 'properties'}
                          </Text>
                          {matchResults[req.id].map(prop => (
                            <Pressable
                              key={prop.id}
                              style={styles.matchRow}
                              onPress={() => router.push(`/property/${prop.id}`)}
                            >
                              <Text variant="bodySmall" style={{ flex: 1 }}>{prop.address}</Text>
                              <Chip compact style={styles.smallChip}>{capitalizeFirst(prop.status)}</Chip>
                            </Pressable>
                          ))}
                        </View>
                      )}
                      {matchResults[req.id] && matchResults[req.id].length === 0 && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                          No matching properties found
                        </Text>
                      )}

                      <Divider style={{ marginTop: 12 }} />
                    </View>
                  ))
                )}
              </CollapsibleCard>

              {/* ===== LINKED PROPERTIES CARD ===== */}
              <CollapsibleCard title="Properties" defaultExpanded={linkedProperties.length > 0}>
                {linkedProperties.length === 0 ? (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    No linked properties
                  </Text>
                ) : (
                  linkedProperties.map(prop => {
                    const pc = prop.property_contacts?.find(pc => pc.contact_id === id);
                    return (
                      <Pressable
                        key={prop.id}
                        style={styles.listRow}
                        onPress={() => router.push(`/property/${prop.id}`)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyMedium">{prop.address}</Text>
                        </View>
                        {pc && <Chip compact style={styles.smallChip}>{capitalizeFirst(pc.role)}</Chip>}
                        <Chip compact style={styles.smallChip}>{capitalizeFirst(prop.status)}</Chip>
                      </Pressable>
                    );
                  })
                )}
              </CollapsibleCard>

              {/* ===== INSPECTIONS CARD ===== */}
              <CollapsibleCard title="Inspections" defaultExpanded={contactInspections.length > 0}>
                {contactInspections.length === 0 ? (
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    No inspection history
                  </Text>
                ) : (
                  contactInspections.map(insp => {
                    const attendee = insp.attendees?.find(a => a.contact_id === id);
                    return (
                      <Pressable
                        key={insp.id}
                        style={styles.listRow}
                        onPress={() => router.push(`/inspection/${insp.id}`)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyMedium">
                            {insp.property?.address ?? 'Unknown property'}
                          </Text>
                          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                            {formatDate(insp.scheduled_at)}
                          </Text>
                        </View>
                        {attendee?.interest_level && (
                          <Chip
                            compact
                            style={[
                              styles.smallChip,
                              attendee.interest_level === 'hot'
                                ? { backgroundColor: theme.colors.errorContainer }
                                : attendee.interest_level === 'warm'
                                  ? { backgroundColor: theme.colors.tertiaryContainer }
                                  : undefined,
                            ]}
                          >
                            {capitalizeFirst(attendee.interest_level)}
                          </Chip>
                        )}
                      </Pressable>
                    );
                  })
                )}
              </CollapsibleCard>

              {/* ===== ACTIVITY CARD ===== */}
              <CollapsibleCard
                title="Activity"
                defaultExpanded
                rightAction={
                  <Button
                    mode="contained-tonal"
                    icon="plus"
                    onPress={() => setActivityDialogVisible(true)}
                    compact
                  >
                    Add
                  </Button>
                }
              >
                <ActivityFeed contactId={id!} />
              </CollapsibleCard>

            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        {/* Delete dialog */}
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Contact</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to delete {fullName}? This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleDelete} textColor={theme.colors.error}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        <AddActivityDialog
          visible={activityDialogVisible}
          onDismiss={() => setActivityDialogVisible(false)}
          contactId={id!}
        />

        {/* Call notes dialog */}
        <Dialog visible={callNotesVisible} onDismiss={handleSkipCallNotes}>
          <Dialog.Title>How did the call go?</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              placeholder="Add call notes..."
              value={callNotes}
              onChangeText={setCallNotes}
              multiline
              numberOfLines={4}
              style={styles.callNotesInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleSkipCallNotes}>Skip</Button>
            <Button onPress={handleSaveCallNotes} mode="contained">Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Edit enrichment dialog */}
        <Dialog
          visible={editEnrichmentVisible}
          onDismiss={() => setEditEnrichmentVisible(false)}
          style={styles.wideDialog}
        >
          <Dialog.Title>Edit Details</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <View style={styles.dialogInner}>
                {/* Source */}
                <Text variant="labelLarge" style={styles.fieldLabel}>Source</Text>
                <View style={styles.chipRow}>
                  {SOURCE_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={editForm.source === opt.value}
                      onPress={() => setEditForm(prev => ({
                        ...prev,
                        source: prev.source === opt.value ? '' : opt.value,
                      }))}
                      compact
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Contact type */}
                <Text variant="labelLarge" style={styles.fieldLabel}>Contact Type</Text>
                <View style={styles.chipRow}>
                  {CONTACT_TYPE_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={editForm.contact_type === opt.value}
                      onPress={() => setEditForm(prev => ({
                        ...prev,
                        contact_type: prev.contact_type === opt.value ? '' : opt.value,
                      }))}
                      compact
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Company name */}
                <TextInput
                  label="Company Name"
                  value={editForm.company_name}
                  onChangeText={v => setEditForm(prev => ({ ...prev, company_name: v }))}
                  mode="outlined"
                  dense
                  style={styles.dialogInput}
                />

                {/* Title */}
                <TextInput
                  label="Title / Role"
                  value={editForm.title}
                  onChangeText={v => setEditForm(prev => ({ ...prev, title: v }))}
                  mode="outlined"
                  dense
                  style={styles.dialogInput}
                />

                {/* Preferred contact method */}
                <Text variant="labelLarge" style={styles.fieldLabel}>Preferred Contact Method</Text>
                <View style={styles.chipRow}>
                  {PREFERRED_METHOD_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={editForm.preferred_contact_method === opt.value}
                      onPress={() => setEditForm(prev => ({
                        ...prev,
                        preferred_contact_method: prev.preferred_contact_method === opt.value ? '' : opt.value,
                      }))}
                      compact
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Do not contact */}
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Do Not Contact</Text>
                  <Switch
                    value={editForm.do_not_contact}
                    onValueChange={v => setEditForm(prev => ({ ...prev, do_not_contact: v }))}
                  />
                </View>

                {/* Status */}
                <Text variant="labelLarge" style={styles.fieldLabel}>Status</Text>
                <View style={styles.chipRow}>
                  {STATUS_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={editForm.status === opt.value}
                      onPress={() => setEditForm(prev => ({
                        ...prev,
                        status: prev.status === opt.value ? '' : opt.value,
                      }))}
                      compact
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Next follow-up */}
                <TextInput
                  label="Next Follow-up (YYYY-MM-DD)"
                  value={editForm.next_follow_up_at}
                  onChangeText={v => setEditForm(prev => ({ ...prev, next_follow_up_at: v }))}
                  mode="outlined"
                  dense
                  placeholder="e.g. 2026-03-15"
                  style={styles.dialogInput}
                />

                {/* Notes */}
                <TextInput
                  label="Notes"
                  value={editForm.notes}
                  onChangeText={v => setEditForm(prev => ({ ...prev, notes: v }))}
                  mode="outlined"
                  multiline
                  numberOfLines={4}
                  style={styles.dialogInput}
                />
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setEditEnrichmentVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSaveEnrichment}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Requirement form dialog */}
        <Dialog
          visible={reqDialogVisible}
          onDismiss={() => setReqDialogVisible(false)}
          style={styles.wideDialog}
        >
          <Dialog.Title>Add Requirement</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScroll}>
            <ScrollView>
              <View style={styles.dialogInner}>
                {/* Buy / Rent */}
                <SegmentedButtons
                  value={reqForm.for_type}
                  onValueChange={v => setReqForm(prev => ({ ...prev, for_type: v as 'buy' | 'rent' }))}
                  buttons={[
                    { value: 'buy', label: 'Buy' },
                    { value: 'rent', label: 'Rent' },
                  ]}
                  style={{ marginBottom: 12 }}
                />

                {/* Suburbs */}
                <TextInput
                  label="Suburbs (comma-separated)"
                  value={reqForm.suburbs}
                  onChangeText={v => setReqForm(prev => ({ ...prev, suburbs: v }))}
                  mode="outlined"
                  dense
                  placeholder="e.g. Bondi, Surry Hills"
                  style={styles.dialogInput}
                />

                {/* Price */}
                <View style={styles.twoCol}>
                  <TextInput
                    label="Price Min"
                    value={reqForm.price_min}
                    onChangeText={v => setReqForm(prev => ({ ...prev, price_min: v }))}
                    mode="outlined"
                    dense
                    keyboardType="numeric"
                    style={[styles.dialogInput, { flex: 1 }]}
                  />
                  <TextInput
                    label="Price Max"
                    value={reqForm.price_max}
                    onChangeText={v => setReqForm(prev => ({ ...prev, price_max: v }))}
                    mode="outlined"
                    dense
                    keyboardType="numeric"
                    style={[styles.dialogInput, { flex: 1 }]}
                  />
                </View>

                {/* Beds, Baths, Cars */}
                <View style={[styles.twoCol, { gap: 8 }]}>
                  <TextInput
                    label="Beds Min"
                    value={reqForm.beds_min}
                    onChangeText={v => setReqForm(prev => ({ ...prev, beds_min: v }))}
                    mode="outlined"
                    dense
                    keyboardType="numeric"
                    style={[styles.dialogInput, { flex: 1 }]}
                  />
                  <TextInput
                    label="Baths Min"
                    value={reqForm.baths_min}
                    onChangeText={v => setReqForm(prev => ({ ...prev, baths_min: v }))}
                    mode="outlined"
                    dense
                    keyboardType="numeric"
                    style={[styles.dialogInput, { flex: 1 }]}
                  />
                  <TextInput
                    label="Cars Min"
                    value={reqForm.cars_min}
                    onChangeText={v => setReqForm(prev => ({ ...prev, cars_min: v }))}
                    mode="outlined"
                    dense
                    keyboardType="numeric"
                    style={[styles.dialogInput, { flex: 1 }]}
                  />
                </View>

                {/* Categories */}
                <Text variant="labelLarge" style={styles.fieldLabel}>Categories</Text>
                <View style={styles.chipRow}>
                  {REQUIREMENT_CATEGORIES.map(cat => (
                    <Chip
                      key={cat}
                      selected={reqForm.categories.includes(cat)}
                      onPress={() =>
                        setReqForm(prev => ({
                          ...prev,
                          categories: prev.categories.includes(cat)
                            ? prev.categories.filter(c => c !== cat)
                            : [...prev.categories, cat],
                        }))
                      }
                      compact
                    >
                      {capitalizeFirst(cat)}
                    </Chip>
                  ))}
                </View>

                {/* Features */}
                <TextInput
                  label="Features (comma-separated)"
                  value={reqForm.features}
                  onChangeText={v => setReqForm(prev => ({ ...prev, features: v }))}
                  mode="outlined"
                  dense
                  placeholder="e.g. pool, garage"
                  style={styles.dialogInput}
                />

                {/* Active */}
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Active</Text>
                  <Switch
                    value={reqForm.active}
                    onValueChange={v => setReqForm(prev => ({ ...prev, active: v }))}
                  />
                </View>

                {/* Custom fields for requirements */}
                {reqFieldDefs.length > 0 && (
                  <>
                    <Divider style={{ marginVertical: 12 }} />
                    <Text variant="labelLarge" style={styles.fieldLabel}>Custom Fields</Text>
                    {reqFieldDefs.map(def => {
                      const val = reqCustomValues[def.id];
                      switch (def.field_type) {
                        case 'text':
                          return (
                            <TextInput
                              key={def.id}
                              label={def.field_label}
                              value={(val as string) ?? ''}
                              onChangeText={v => setReqCustomValues(prev => ({ ...prev, [def.id]: v }))}
                              mode="outlined"
                              dense
                              style={styles.dialogInput}
                            />
                          );
                        case 'number':
                          return (
                            <TextInput
                              key={def.id}
                              label={def.field_label}
                              value={val != null ? String(val) : ''}
                              onChangeText={v => {
                                const n = parseFloat(v);
                                setReqCustomValues(prev => ({ ...prev, [def.id]: isNaN(n) ? 0 : n }));
                              }}
                              mode="outlined"
                              dense
                              keyboardType="numeric"
                              style={styles.dialogInput}
                            />
                          );
                        case 'boolean':
                          return (
                            <View key={def.id} style={styles.switchRow}>
                              <Text variant="bodyMedium">{def.field_label}</Text>
                              <Switch
                                value={(val as boolean) ?? false}
                                onValueChange={v => setReqCustomValues(prev => ({ ...prev, [def.id]: v }))}
                              />
                            </View>
                          );
                        case 'single_select': {
                          const options = def.options ?? [];
                          const selected = (val as string) ?? '';
                          return (
                            <View key={def.id}>
                              <Text variant="labelMedium" style={styles.fieldLabel}>{def.field_label}</Text>
                              <View style={styles.chipRow}>
                                {options.map(opt => (
                                  <Chip
                                    key={opt}
                                    selected={selected === opt}
                                    onPress={() => setReqCustomValues(prev => ({ ...prev, [def.id]: selected === opt ? '' : opt }))}
                                    compact
                                  >
                                    {opt}
                                  </Chip>
                                ))}
                              </View>
                            </View>
                          );
                        }
                        case 'multi_select': {
                          const options = def.options ?? [];
                          const selectedArr = Array.isArray(val) ? val : [];
                          return (
                            <View key={def.id}>
                              <Text variant="labelMedium" style={styles.fieldLabel}>{def.field_label}</Text>
                              <View style={styles.chipRow}>
                                {options.map(opt => (
                                  <Chip
                                    key={opt}
                                    selected={selectedArr.includes(opt)}
                                    onPress={() => {
                                      const newArr = selectedArr.includes(opt)
                                        ? selectedArr.filter(s => s !== opt)
                                        : [...selectedArr, opt];
                                      setReqCustomValues(prev => ({ ...prev, [def.id]: newArr }));
                                    }}
                                    compact
                                  >
                                    {opt}
                                  </Chip>
                                ))}
                              </View>
                            </View>
                          );
                        }
                        case 'date':
                          return (
                            <TextInput
                              key={def.id}
                              label={def.field_label}
                              value={(val as string) ?? ''}
                              onChangeText={v => setReqCustomValues(prev => ({ ...prev, [def.id]: v }))}
                              mode="outlined"
                              dense
                              placeholder="YYYY-MM-DD"
                              style={styles.dialogInput}
                            />
                          );
                        default:
                          return null;
                      }
                    })}
                  </>
                )}

                {/* Add Custom Field button */}
                <Divider style={{ marginVertical: 12 }} />
                <Chip
                  icon="plus"
                  onPress={() => setAddFieldDialogVisible(true)}
                  compact
                >
                  Add Custom
                </Chip>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setReqDialogVisible(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSaveRequirement}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        {/* Add custom field definition dialog */}
        <Dialog visible={addFieldDialogVisible} onDismiss={() => setAddFieldDialogVisible(false)}>
          <Dialog.Title>Add Custom Field</Dialog.Title>
          <Dialog.Content style={{ gap: 12 }}>
            <TextInput
              label="Field Label"
              value={newFieldLabel}
              onChangeText={setNewFieldLabel}
              mode="outlined"
              dense
              autoFocus
            />
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>Field Type</Text>
            <View style={styles.chipRow}>
              {(['text', 'number', 'boolean', 'date', 'single_select', 'multi_select'] as const).map(t => (
                <Chip
                  key={t}
                  selected={newFieldType === t}
                  onPress={() => setNewFieldType(t)}
                  compact
                >
                  {t === 'single_select' ? 'Select' : t === 'multi_select' ? 'Multi' : t === 'boolean' ? 'Yes/No' : capitalizeFirst(t)}
                </Chip>
              ))}
            </View>
            {(newFieldType === 'single_select' || newFieldType === 'multi_select') && (
              <TextInput
                label="Options (comma-separated)"
                value={newFieldOptions}
                onChangeText={setNewFieldOptions}
                mode="outlined"
                dense
                placeholder="Option 1, Option 2"
              />
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAddFieldDialogVisible(false)}>Cancel</Button>
            <Button
              onPress={handleAddCustomField}
              disabled={!newFieldLabel.trim()}
            >
              Add
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
    paddingBottom: 32,
  },
  // Header card
  headerCard: {
    padding: 16,
    borderRadius: 12,
  },
  name: {
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  dncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
  },
  tagChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tagChip: {
    alignSelf: 'flex-start',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  quickActionBtn: {
    borderRadius: 8,
  },
  // Info card content
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 8,
  },
  colItem: {
    flex: 1,
  },
  coordinatesRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  // Subscription
  subscriptionRow: {
    marginTop: 12,
    borderRadius: 12,
    padding: 12,
  },
  subscriptionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Requirements
  reqItem: {
    marginBottom: 4,
  },
  reqHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  smallChip: {
    marginRight: 0,
  },
  matchResults: {
    marginTop: 8,
    paddingLeft: 8,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: 8,
  },
  // Properties + Inspections
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  // Dialogs
  callNotesInput: {
    minHeight: 80,
  },
  wideDialog: {
    maxHeight: '85%',
  },
  dialogScroll: {
    paddingHorizontal: 0,
  },
  dialogInner: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 4,
  },
  dialogInput: {
    marginBottom: 8,
  },
  fieldLabel: {
    marginTop: 8,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
});
