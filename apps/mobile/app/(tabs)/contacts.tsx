import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { StyleSheet, View, FlatList, ScrollView, Alert, Linking, Platform, Pressable, useWindowDimensions } from 'react-native';
import {
  Searchbar, FAB, useTheme, Text, ActivityIndicator, Button,
  IconButton, Portal, Dialog, Chip, TextInput, Switch, Checkbox, Modal, Surface,
} from 'react-native-paper';
import * as SMS from 'expo-sms';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Lazy-import CallerID native module (not available in Expo Go)
let CallerIdModule: {
  hasSmsPermission(): Promise<boolean>;
  requestSmsPermission(): Promise<boolean>;
  sendDirectSms(phone: string, message: string): Promise<{ success: boolean; error: string | null }>;
} | null = null;
try { CallerIdModule = require('caller-id').default; } catch { /* Expo Go / web */ }
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCRMStore, useSavedSearchStore, useLeadScoringEngine, useSmsTemplateStore } from '@realestate-crm/hooks';
import { ContactCard } from '@realestate-crm/ui';
import type { Contact, ContactSource, ContactType, ContactStatus } from '@realestate-crm/types';

const DEFAULT_BULK_SMS_MESSAGE =
  'Hi {name}, just touching base. Would love to catch up when you have a moment.';

const SOURCE_OPTIONS: { label: string; value: ContactSource }[] = [
  { label: 'Referral', value: 'referral' },
  { label: 'Web', value: 'web' },
  { label: 'Walk-in', value: 'walk_in' },
  { label: 'Portal', value: 'portal' },
  { label: 'Phone', value: 'phone' },
  { label: 'Import', value: 'import' },
  { label: 'Other', value: 'other' },
];

const CONTACT_TYPE_OPTIONS: { label: string; value: ContactType }[] = [
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

interface ContactFilters {
  tagIds: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  createdAfter: string;
  createdBefore: string;
  sources: ContactSource[];
  contactTypes: ContactType[];
  statuses: ContactStatus[];
}

const DEFAULT_FILTERS: ContactFilters = {
  tagIds: [],
  hasEmail: false,
  hasPhone: false,
  createdAfter: '',
  createdBefore: '',
  sources: [],
  contactTypes: [],
  statuses: ['active'],
};

function hasActiveFilters(filters: ContactFilters): boolean {
  return (
    filters.tagIds.length > 0 ||
    filters.hasEmail ||
    filters.hasPhone ||
    filters.createdAfter !== '' ||
    filters.createdBefore !== '' ||
    filters.sources.length > 0 ||
    filters.contactTypes.length > 0 ||
    // Default status is ['active'], so only "active" if it differs from that
    !(filters.statuses.length === 1 && filters.statuses[0] === 'active')
  );
}

function filtersToRecord(filters: ContactFilters): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  if (filters.tagIds.length > 0) record.tagIds = filters.tagIds;
  if (filters.hasEmail) record.hasEmail = true;
  if (filters.hasPhone) record.hasPhone = true;
  if (filters.createdAfter) record.createdAfter = filters.createdAfter;
  if (filters.createdBefore) record.createdBefore = filters.createdBefore;
  if (filters.sources.length > 0) record.sources = filters.sources;
  if (filters.contactTypes.length > 0) record.contactTypes = filters.contactTypes;
  if (filters.statuses.length > 0) record.statuses = filters.statuses;
  return record;
}

function recordToFilters(record: Record<string, unknown>): ContactFilters {
  return {
    tagIds: (record.tagIds as string[]) || [],
    hasEmail: (record.hasEmail as boolean) || false,
    hasPhone: (record.hasPhone as boolean) || false,
    createdAfter: (record.createdAfter as string) || '',
    createdBefore: (record.createdBefore as string) || '',
    sources: (record.sources as ContactSource[]) || [],
    contactTypes: (record.contactTypes as ContactType[]) || [],
    statuses: (record.statuses as ContactStatus[]) || ['active'],
  };
}

function getContactDisplayName(contact: Contact): string {
  const parts = [contact.first_name, contact.last_name].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : 'there';
}

function getContactFirstName(contact: Contact): string {
  return contact.first_name || 'there';
}

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

const AVATAR_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0', '#F44336', '#00BCD4'];

function getAvatarColor(name: string): string {
  const idx = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function RecipientAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: getAvatarColor(name),
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontSize: size * 0.38, fontWeight: '600' }}>{initials}</Text>
    </View>
  );
}

export default function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const allContacts = useCRMStore(state => state.contacts);
  const tags = useCRMStore(state => state.tags);
  const isLoading = useCRMStore(state => state.isLoading);
  const searchQuery = useCRMStore(state => state.searchQuery);
  const setSearchQuery = useCRMStore(state => state.setSearchQuery);
  const fetchContacts = useCRMStore(state => state.fetchContacts);
  const fetchTags = useCRMStore(state => state.fetchTags);
  const bulkDeleteContacts = useCRMStore((s) => s.bulkDeleteContacts);
  const addActivity = useCRMStore((s) => s.addActivity);

  const { scores: leadScores } = useLeadScoringEngine();

  const savedSearches = useSavedSearchStore(state => state.savedSearches);
  const fetchSavedSearches = useSavedSearchStore(state => state.fetchSavedSearches);
  const createSavedSearch = useSavedSearchStore(state => state.createSavedSearch);
  const deleteSavedSearch = useSavedSearchStore(state => state.deleteSavedSearch);

  const [filters, setFilters] = useState<ContactFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<ContactFilters>(DEFAULT_FILTERS);
  const [showFilterDialog, setShowFilterDialog] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveSearchName, setSaveSearchName] = useState('');

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk SMS state
  // Default seed for the bulk SMS message — used only when there's no preserved draft.
  // Hoisted so the open + close handlers compare against the same value.

  // SMS templates / labels (sibling entities — labels live in their own store slice)
  const smsTemplates = useSmsTemplateStore((s) => s.templates);
  const smsLabels = useSmsTemplateStore((s) => s.labels);
  const fetchSmsAll = useSmsTemplateStore((s) => s.fetchAll);
  const createSmsTemplate = useSmsTemplateStore((s) => s.createTemplate);

  // Selected label filter (null = all). Save-as-template dialog state.
  const [smsLabelFilter, setSmsLabelFilter] = useState<string | null>(null);
  const [saveTemplateVisible, setSaveTemplateVisible] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveTemplateLabelIds, setSaveTemplateLabelIds] = useState<Set<string>>(new Set());
  const [saveTemplateBusy, setSaveTemplateBusy] = useState(false);

  const [bulkSmsModalVisible, setBulkSmsModalVisible] = useState(false);
  const [bulkSmsMessage, setBulkSmsMessage] = useState('');
  const [bulkSmsCurrentIndex, setBulkSmsCurrentIndex] = useState(0);
  const [bulkSmsSentCount, setBulkSmsSentCount] = useState(0);
  const [bulkSmsSkippedCount, setBulkSmsSkippedCount] = useState(0);
  const [bulkSmsPhase, setBulkSmsPhase] = useState<'compose' | 'sending' | 'done'>('compose');
  const [isSendingCurrentSms, setIsSendingCurrentSms] = useState(false);
  const isSendingRef = useRef(false);

  const contactSavedSearches = useMemo(
    () => savedSearches.filter(s => s.entity_type === 'contact'),
    [savedSearches]
  );

  useFocusEffect(
    useCallback(() => {
      fetchContacts();
      fetchTags();
      fetchSavedSearches('contact');
    }, [fetchContacts, fetchTags, fetchSavedSearches])
  );

  // Filter contacts in component to avoid selector issues
  // Exclude quick notes (contacts without first_name) - they show in Notes tab
  const contacts = useMemo(() => {
    return allContacts.filter(contact => {
      // Must have a first name (not a quick note)
      if (!contact.first_name) {
        return false;
      }

      // Tag filter (from advanced filters)
      if (filters.tagIds.length > 0) {
        const contactTagIds = (contact.tags || []).map(t => t.id);
        const hasMatchingTag = contactTagIds.some(id => filters.tagIds.includes(id));
        if (!hasMatchingTag && !filters.tagIds.includes(contact.tag_id || '')) {
          return false;
        }
      }

      // Has email filter
      if (filters.hasEmail && !contact.email) {
        return false;
      }

      // Has phone filter
      if (filters.hasPhone && !contact.phone) {
        return false;
      }

      // Created after filter
      if (filters.createdAfter && contact.created_at) {
        if (contact.created_at < filters.createdAfter) {
          return false;
        }
      }

      // Created before filter
      if (filters.createdBefore && contact.created_at) {
        if (contact.created_at > filters.createdBefore) {
          return false;
        }
      }

      // Source filter
      if (filters.sources.length > 0) {
        if (!contact.source || !filters.sources.includes(contact.source)) {
          return false;
        }
      }

      // Contact type filter
      if (filters.contactTypes.length > 0) {
        if (!contact.contact_type || !filters.contactTypes.includes(contact.contact_type)) {
          return false;
        }
      }

      // Status filter
      if (filters.statuses.length > 0) {
        const contactStatus = contact.status ?? 'active';
        if (!filters.statuses.includes(contactStatus)) {
          return false;
        }
      }

      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const fullName = `${contact.first_name} ${contact.last_name || ''}`.toLowerCase();
        const email = (contact.email || '').toLowerCase();
        const address = (contact.address || '').toLowerCase();
        if (!fullName.includes(query) && !email.includes(query) && !address.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [allContacts, filters, searchQuery]);

  const handleLongPress = useCallback((id: string) => {
    setSelectMode(true);
    setSelectedIds(prev => new Set([...prev, id]));
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(contacts.map(c => c.id)));
  }, [contacts]);

  const exitSelectMode = useCallback(() => {
    setSelectedIds(new Set());
    setSelectMode(false);
  }, []);

  const handleBulkDelete = useCallback(() => {
    Alert.alert(
      'Delete Contacts',
      `Delete ${selectedIds.size} contact${selectedIds.size !== 1 ? 's' : ''}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await bulkDeleteContacts([...selectedIds]);
            setSelectedIds(new Set());
            setSelectMode(false);
          },
        },
      ]
    );
  }, [selectedIds, bulkDeleteContacts]);

  // ── Bulk SMS helpers ─────────────────────────────────────────────
  const bulkSmsEligibleContacts = useMemo(() => {
    return contacts.filter(c => selectedIds.has(c.id) && c.phone);
  }, [contacts, selectedIds]);

  const bulkSmsSkippedContacts = useMemo(() => {
    return contacts.filter(c => selectedIds.has(c.id) && !c.phone);
  }, [contacts, selectedIds]);

  const handleOpenBulkSms = useCallback(() => {
    if (bulkSmsEligibleContacts.length === 0) return;
    // Only seed the default message when there's no draft to preserve — protects
    // users who closed the modal mid-edit. (User feedback: "lol fk I lost my message".)
    setBulkSmsMessage((curr) => (curr.trim() ? curr : DEFAULT_BULK_SMS_MESSAGE));
    setBulkSmsPhase('compose');
    setBulkSmsCurrentIndex(0);
    setBulkSmsSentCount(0);
    setBulkSmsSkippedCount(0);
    setSmsLabelFilter(null);
    setBulkSmsModalVisible(true);
    // Lazy-fetch templates the first time the modal opens
    if (smsTemplates.length === 0) {
      fetchSmsAll();
    }
  }, [bulkSmsEligibleContacts, smsTemplates.length, fetchSmsAll]);

  const filteredSmsTemplates = useMemo(() => {
    if (!smsLabelFilter) return smsTemplates;
    return smsTemplates.filter((t) => (t.labels || []).some((l) => l.id === smsLabelFilter));
  }, [smsTemplates, smsLabelFilter]);

  const handleApplyTemplate = useCallback((message: string) => {
    setBulkSmsMessage(message);
  }, []);

  const handleOpenSaveTemplate = useCallback(() => {
    if (!bulkSmsMessage.trim()) return;
    setSaveTemplateName('');
    setSaveTemplateLabelIds(new Set());
    setSaveTemplateVisible(true);
  }, [bulkSmsMessage]);

  const handleSaveTemplate = useCallback(async () => {
    if (!saveTemplateName.trim() || !bulkSmsMessage.trim()) return;
    setSaveTemplateBusy(true);
    try {
      await createSmsTemplate({
        name: saveTemplateName.trim(),
        message: bulkSmsMessage,
        labelIds: Array.from(saveTemplateLabelIds),
      });
      setSaveTemplateVisible(false);
      setSaveTemplateName('');
      setSaveTemplateLabelIds(new Set());
    } finally {
      setSaveTemplateBusy(false);
    }
  }, [saveTemplateName, bulkSmsMessage, saveTemplateLabelIds, createSmsTemplate]);

  const toggleSaveLabelId = useCallback((id: string) => {
    setSaveTemplateLabelIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Auto-send ref: triggers sendSMSAsync automatically when index advances
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const useDirectSend = Platform.OS === 'android' && CallerIdModule != null;

  const handleStartBulkSmsSend = useCallback(async () => {
    if (useDirectSend) {
      // Request SEND_SMS permission for direct sending on Android
      const hasPermission = await CallerIdModule!.hasSmsPermission();
      if (!hasPermission) {
        const granted = await CallerIdModule!.requestSmsPermission();
        if (!granted) {
          Alert.alert('SMS Permission Required', 'Please grant SMS permission to send messages directly from the app.');
          return;
        }
      }
    } else {
      const available = await SMS.isAvailableAsync();
      if (!available) {
        Alert.alert('SMS Not Available', 'SMS is not supported on this device.');
        return;
      }
    }
    setBulkSmsPhase('sending');
    setBulkSmsCurrentIndex(0);
    setBulkSmsSentCount(0);
    setBulkSmsSkippedCount(0);
  }, [useDirectSend]);

  const currentBulkContact = bulkSmsEligibleContacts[bulkSmsCurrentIndex] as Contact | undefined;

  const advanceBulkSms = useCallback((nextIdx: number) => {
    if (nextIdx >= bulkSmsEligibleContacts.length) {
      setBulkSmsPhase('done');
    } else {
      setBulkSmsCurrentIndex(nextIdx);
    }
  }, [bulkSmsEligibleContacts.length]);

  const logSmsActivity = useCallback((contactId: string, message: string, status: 'sent' | 'initiated') => {
    const preview = message.length > 200 ? `${message.slice(0, 200)}…` : message;
    addActivity({
      contact_id: contactId,
      type: 'sms',
      content: `SMS ${status}: ${preview}`,
    }).catch((e: unknown) => console.warn('SMS activity log failed:', e));
  }, [addActivity]);

  const handleSendCurrentContactSms = useCallback(async () => {
    if (!currentBulkContact?.phone || isSendingRef.current) return;
    isSendingRef.current = true;
    setIsSendingCurrentSms(true);

    const phone = sanitizePhone(currentBulkContact.phone);
    const contactFirstName = getContactFirstName(currentBulkContact);
    const personalizedMessage = bulkSmsMessage.replace(/\{name\}/g, contactFirstName);

    try {
      if (useDirectSend) {
        // Direct send on Android — no app switching
        const { success, error } = await CallerIdModule!.sendDirectSms(phone, personalizedMessage);
        if (success) {
          if (currentBulkContact.id) logSmsActivity(currentBulkContact.id, personalizedMessage, 'sent');
          setBulkSmsSentCount(prev => prev + 1);
          advanceBulkSms(bulkSmsCurrentIndex + 1);
        } else {
          Alert.alert('SMS Failed', error || 'Could not send SMS. Please try again.');
        }
      } else {
        // iOS — use expo-sms modal overlay
        const { result } = await SMS.sendSMSAsync([phone], personalizedMessage);
        if (result === 'sent') {
          if (currentBulkContact.id) logSmsActivity(currentBulkContact.id, personalizedMessage, 'sent');
          setBulkSmsSentCount(prev => prev + 1);
          advanceBulkSms(bulkSmsCurrentIndex + 1);
        } else if (result === 'unknown') {
          if (currentBulkContact.id) logSmsActivity(currentBulkContact.id, personalizedMessage, 'initiated');
          setBulkSmsSentCount(prev => prev + 1);
          advanceBulkSms(bulkSmsCurrentIndex + 1);
        } else {
          const displayName = getContactDisplayName(currentBulkContact);
          Alert.alert(
            'SMS Interrupted',
            `You cancelled your message to ${displayName}. What would you like to do?`,
            [
              { text: `Skip ${displayName}`, onPress: () => { setBulkSmsSkippedCount(prev => prev + 1); advanceBulkSms(bulkSmsCurrentIndex + 1); } },
              { text: `Retry ${displayName}`, onPress: () => {} },
              { text: 'Cancel Bulk SMS', style: 'destructive', onPress: () => { setBulkSmsPhase('done'); } },
            ],
          );
        }
      }
    } catch {
      Alert.alert('SMS Error', 'Could not send SMS. Please try again.');
    } finally {
      isSendingRef.current = false;
      setIsSendingCurrentSms(false);
    }
  }, [currentBulkContact, bulkSmsMessage, bulkSmsCurrentIndex, advanceBulkSms, logSmsActivity]);

  const handleSkipCurrentContactSms = useCallback(() => {
    setBulkSmsSkippedCount(prev => prev + 1);
    advanceBulkSms(bulkSmsCurrentIndex + 1);
  }, [bulkSmsCurrentIndex, advanceBulkSms]);

  const handleStopBulkSmsSend = useCallback(() => {
    setBulkSmsPhase('done');
  }, []);

  // Auto-advance: when phase is 'sending' and index changes, auto-trigger next SMS after a brief delay
  useEffect(() => {
    if (bulkSmsPhase !== 'sending' || !currentBulkContact?.phone || isSendingRef.current) return;
    if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    autoSendTimerRef.current = setTimeout(() => {
      handleSendCurrentContactSms();
    }, 800);
    return () => {
      if (autoSendTimerRef.current) clearTimeout(autoSendTimerRef.current);
    };
  }, [bulkSmsPhase, bulkSmsCurrentIndex, currentBulkContact, handleSendCurrentContactSms]);

  const closeBulkSmsModalNow = useCallback((opts?: { clearDraft?: boolean }) => {
    setBulkSmsModalVisible(false);
    if (opts?.clearDraft) setBulkSmsMessage('');
    exitSelectMode();
  }, [exitSelectMode]);

  const handleCloseBulkSms = useCallback(() => {
    // In compose phase with a non-trivial draft (user-edited away from the seed) — confirm.
    // (User feedback: "lol fk I lost my message".)
    const trimmed = bulkSmsMessage.trim();
    const isDirty =
      bulkSmsPhase === 'compose' &&
      trimmed.length > 0 &&
      trimmed !== DEFAULT_BULK_SMS_MESSAGE.trim();

    if (!isDirty) {
      closeBulkSmsModalNow();
      return;
    }

    Alert.alert(
      'Discard message?',
      'Your drafted message will be lost.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Save & close', onPress: () => closeBulkSmsModalNow() }, // preserves draft for next open
        { text: 'Discard', style: 'destructive', onPress: () => closeBulkSmsModalNow({ clearDraft: true }) },
      ],
    );
  }, [bulkSmsMessage, bulkSmsPhase, closeBulkSmsModalNow]);

  const handleContactPress = useCallback((contact: Contact) => {
    if (selectMode) {
      toggleSelect(contact.id);
      return;
    }
    router.push(`/contact/${contact.id}`);
  }, [router, selectMode, toggleSelect]);

  const handleAddContact = () => {
    router.push('/contact/new');
  };

  const openFilterDialog = () => {
    setDraftFilters({ ...filters });
    setShowFilterDialog(true);
  };

  const applyFilters = () => {
    setFilters({ ...draftFilters });
    setShowFilterDialog(false);
  };

  const clearAllFilters = () => {
    setDraftFilters({ ...DEFAULT_FILTERS });
  };

  const handleSaveSearch = async () => {
    if (!saveSearchName.trim()) return;
    await createSavedSearch({
      name: saveSearchName.trim(),
      entity_type: 'contact',
      filters: filtersToRecord(filters),
      is_shared: false,
    });
    setSaveSearchName('');
    setShowSaveDialog(false);
  };

  const handleApplySavedSearch = (searchFilters: Record<string, unknown>) => {
    setFilters(recordToFilters(searchFilters));
  };

  const handleDeleteSavedSearch = (id: string, name: string) => {
    Alert.alert('Delete Saved Search', `Delete "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSavedSearch(id) },
    ]);
  };

  const toggleDraftTag = (tagId: string) => {
    setDraftFilters(prev => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter(id => id !== tagId)
        : [...prev.tagIds, tagId],
    }));
  };

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];
    if (filters.tagIds.length > 0) {
      const tagNames = filters.tagIds
        .map(id => tags.find(t => t.id === id)?.name)
        .filter(Boolean);
      if (tagNames.length > 0) labels.push(`Tags: ${tagNames.join(', ')}`);
    }
    if (filters.hasEmail) labels.push('Has Email');
    if (filters.hasPhone) labels.push('Has Phone');
    if (filters.createdAfter) labels.push(`After ${filters.createdAfter}`);
    if (filters.createdBefore) labels.push(`Before ${filters.createdBefore}`);
    if (filters.sources.length > 0) {
      const sourceLabels = filters.sources.map(s => {
        const found = SOURCE_OPTIONS.find(o => o.value === s);
        return found ? found.label : s;
      });
      labels.push(`Source: ${sourceLabels.join(', ')}`);
    }
    if (filters.contactTypes.length > 0) {
      const typeLabels = filters.contactTypes.map(t => {
        const found = CONTACT_TYPE_OPTIONS.find(o => o.value === t);
        return found ? found.label : t;
      });
      labels.push(`Type: ${typeLabels.join(', ')}`);
    }
    if (filters.statuses.length > 0 && !(filters.statuses.length === 1 && filters.statuses[0] === 'active')) {
      const statusLabels = filters.statuses.map(s => {
        const found = STATUS_OPTIONS.find(o => o.value === s);
        return found ? found.label : s;
      });
      labels.push(`Status: ${statusLabels.join(', ')}`);
    }
    return labels;
  }, [filters, tags]);

  const handleMapPress = useCallback((contact: Contact) => {
    if (contact.latitude != null && contact.longitude != null) {
      router.push(`/(tabs)/map?lat=${contact.latitude}&lng=${contact.longitude}&zoom=0.005&layer=contacts&label=${encodeURIComponent(contact.first_name)}` as never);
    }
  }, [router]);

  const renderItem = useCallback(({ item }: { item: Contact }) => {
    if (selectMode) {
      return (
        <View style={styles.selectableRow}>
          <Checkbox
            status={selectedIds.has(item.id) ? 'checked' : 'unchecked'}
            onPress={() => toggleSelect(item.id)}
          />
          <View style={styles.selectableCardWrapper}>
            <ContactCard
              contact={item}
              onPress={() => toggleSelect(item.id)}
              onLongPress={() => handleLongPress(item.id)}
              onMapPress={handleMapPress}
              scoreBreakdown={leadScores.get(item.id)}
            />
          </View>
        </View>
      );
    }
    return (
      <ContactCard
        contact={item}
        onPress={handleContactPress}
        onLongPress={() => handleLongPress(item.id)}
        onMapPress={handleMapPress}
        scoreBreakdown={leadScores.get(item.id)}
      />
    );
  }, [handleContactPress, handleLongPress, handleMapPress, selectMode, selectedIds, toggleSelect, leadScores]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        {searchQuery ? 'No contacts found' : 'No contacts yet'}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
        {searchQuery ? 'Try a different search term' : 'Tap + to add your first contact'}
      </Text>
    </View>
  );

  const renderListHeader = () => (
    <View style={styles.listHeader}>
      {/* Saved searches */}
      {contactSavedSearches.length > 0 && (
        <View style={styles.savedSearchContainer}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            Saved Searches
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.savedSearchRow}>
              {contactSavedSearches.map(s => (
                <Chip
                  key={s.id}
                  mode="outlined"
                  onPress={() => handleApplySavedSearch(s.filters)}
                  onLongPress={() => handleDeleteSavedSearch(s.id, s.name)}
                  compact
                  icon="magnify"
                  style={styles.savedSearchChip}
                >
                  {s.name}
                </Chip>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Active filter chips */}
      {activeFilterLabels.length > 0 && (
        <View style={styles.activeFiltersRow}>
          {activeFilterLabels.map((label, idx) => (
            <Chip
              key={idx}
              compact
              style={{ backgroundColor: theme.colors.primaryContainer }}
              textStyle={{ color: theme.colors.onPrimaryContainer, fontSize: 11 }}
            >
              {label}
            </Chip>
          ))}
          <Chip
            compact
            onPress={() => setFilters({ ...DEFAULT_FILTERS })}
            icon="close"
            style={{ backgroundColor: theme.colors.errorContainer }}
            textStyle={{ color: theme.colors.onErrorContainer, fontSize: 11 }}
          >
            Clear All
          </Chip>
        </View>
      )}

      {/* Save search button */}
      {hasActiveFilters(filters) && (
        <Button
          mode="outlined"
          icon="content-save"
          compact
          onPress={() => setShowSaveDialog(true)}
          style={styles.saveSearchButton}
        >
          Save Search
        </Button>
      )}
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <Searchbar
            placeholder="Search contacts..."
            onChangeText={setSearchQuery}
            value={searchQuery}
            style={styles.searchbar}
          />
          <IconButton
            icon="filter-variant"
            mode={hasActiveFilters(filters) ? 'contained' : 'outlined'}
            onPress={openFilterDialog}
            size={20}
          />
        </View>
        <Button
          mode="outlined"
          icon="import"
          compact
          onPress={() => router.push('/contacts/import')}
          style={styles.importButton}
        >
          Import from Phone
        </Button>
      </View>

      {selectMode && selectedIds.size > 0 && (
        <View style={[styles.selectBar, { backgroundColor: theme.colors.primaryContainer }]}>
          <Text variant="labelLarge" style={{ color: theme.colors.onPrimaryContainer, flex: 1 }}>
            {selectedIds.size} selected
          </Text>
          <Button compact onPress={handleSelectAll} textColor={theme.colors.onPrimaryContainer}>
            Select All
          </Button>
          {selectedIds.size >= 2 && (
            <Button
              compact
              icon="message-text-outline"
              onPress={handleOpenBulkSms}
              textColor={theme.colors.primary}
            >
              Bulk SMS
            </Button>
          )}
          <Button compact onPress={handleBulkDelete} textColor={theme.colors.error}>
            Delete
          </Button>
          <Button compact onPress={() => setSelectedIds(new Set())} textColor={theme.colors.onPrimaryContainer}>
            Clear
          </Button>
          <Button compact onPress={exitSelectMode} textColor={theme.colors.onPrimaryContainer}>
            Cancel
          </Button>
        </View>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderListHeader}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={contacts.length === 0 ? styles.emptyList : styles.list}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: insets.bottom + 24 }]}
        color={theme.colors.onPrimary}
        onPress={handleAddContact}
      />

      {/* Filter Dialog */}
      <Portal>
        <Dialog visible={showFilterDialog} onDismiss={() => setShowFilterDialog(false)} style={styles.dialog}>
          <Dialog.Title>Filter Contacts</Dialog.Title>
          <Dialog.ScrollArea style={styles.dialogScrollArea}>
            <ScrollView>
              <View style={styles.dialogContent}>
                {/* Tags */}
                {tags.length > 0 && (
                  <>
                    <Text variant="labelLarge" style={styles.sectionLabel}>Tags</Text>
                    <View style={styles.filterRow}>
                      {tags.map(tag => (
                        <Chip
                          key={tag.id}
                          selected={draftFilters.tagIds.includes(tag.id)}
                          onPress={() => toggleDraftTag(tag.id)}
                          style={[
                            styles.filterChip,
                            draftFilters.tagIds.includes(tag.id)
                              ? { backgroundColor: tag.color + '30' }
                              : {},
                          ]}
                          compact
                        >
                          {tag.name}
                        </Chip>
                      ))}
                    </View>
                  </>
                )}

                {/* Has Email */}
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Has Email</Text>
                  <Switch
                    value={draftFilters.hasEmail}
                    onValueChange={val =>
                      setDraftFilters(prev => ({ ...prev, hasEmail: val }))
                    }
                  />
                </View>

                {/* Has Phone */}
                <View style={styles.switchRow}>
                  <Text variant="bodyMedium">Has Phone</Text>
                  <Switch
                    value={draftFilters.hasPhone}
                    onValueChange={val =>
                      setDraftFilters(prev => ({ ...prev, hasPhone: val }))
                    }
                  />
                </View>

                {/* Date range */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Date Range</Text>
                <TextInput
                  label="Created After (YYYY-MM-DD)"
                  value={draftFilters.createdAfter}
                  onChangeText={val =>
                    setDraftFilters(prev => ({ ...prev, createdAfter: val }))
                  }
                  mode="outlined"
                  dense
                  placeholder="e.g. 2024-01-01"
                />
                <TextInput
                  label="Created Before (YYYY-MM-DD)"
                  value={draftFilters.createdBefore}
                  onChangeText={val =>
                    setDraftFilters(prev => ({ ...prev, createdBefore: val }))
                  }
                  mode="outlined"
                  dense
                  placeholder="e.g. 2025-12-31"
                  style={{ marginTop: 8 }}
                />

                {/* Source */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Source</Text>
                <View style={styles.filterRow}>
                  {SOURCE_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={draftFilters.sources.includes(opt.value)}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          sources: prev.sources.includes(opt.value)
                            ? prev.sources.filter(s => s !== opt.value)
                            : [...prev.sources, opt.value],
                        }))
                      }
                      compact
                      style={styles.filterChip}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Contact Type */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Contact Type</Text>
                <View style={styles.filterRow}>
                  {CONTACT_TYPE_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={draftFilters.contactTypes.includes(opt.value)}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          contactTypes: prev.contactTypes.includes(opt.value)
                            ? prev.contactTypes.filter(t => t !== opt.value)
                            : [...prev.contactTypes, opt.value],
                        }))
                      }
                      compact
                      style={styles.filterChip}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>

                {/* Status */}
                <Text variant="labelLarge" style={styles.sectionLabel}>Status</Text>
                <View style={styles.filterRow}>
                  {STATUS_OPTIONS.map(opt => (
                    <Chip
                      key={opt.value}
                      selected={draftFilters.statuses.includes(opt.value)}
                      onPress={() =>
                        setDraftFilters(prev => ({
                          ...prev,
                          statuses: prev.statuses.includes(opt.value)
                            ? prev.statuses.filter(s => s !== opt.value)
                            : [...prev.statuses, opt.value],
                        }))
                      }
                      compact
                      style={styles.filterChip}
                    >
                      {opt.label}
                    </Chip>
                  ))}
                </View>
              </View>
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={clearAllFilters}>Clear</Button>
            <Button onPress={() => setShowFilterDialog(false)}>Cancel</Button>
            <Button mode="contained" onPress={applyFilters}>Apply</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Save Search Dialog */}
      <Portal>
        <Dialog visible={showSaveDialog} onDismiss={() => setShowSaveDialog(false)}>
          <Dialog.Title>Save Search</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Search Name"
              value={saveSearchName}
              onChangeText={setSaveSearchName}
              mode="outlined"
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button mode="contained" onPress={handleSaveSearch} disabled={!saveSearchName.trim()}>
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Save SMS Template Dialog */}
      <Portal>
        <Dialog visible={saveTemplateVisible} onDismiss={() => setSaveTemplateVisible(false)}>
          <Dialog.Title>Save as template</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Template name"
              value={saveTemplateName}
              onChangeText={setSaveTemplateName}
              mode="outlined"
              dense
              autoFocus
              placeholder="e.g. Open Home Saturday"
            />
            {smsLabels.length > 0 && (
              <View style={{ marginTop: 12 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                  Labels (optional — select any that fit)
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {smsLabels.map((label) => {
                    const selected = saveTemplateLabelIds.has(label.id);
                    return (
                      <Chip
                        key={label.id}
                        compact
                        selected={selected}
                        onPress={() => toggleSaveLabelId(label.id)}
                        style={selected ? { backgroundColor: `${label.color}33` } : undefined}
                        textStyle={selected ? { color: label.color } : undefined}
                      >
                        {label.name}
                      </Chip>
                    );
                  })}
                </View>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSaveTemplateVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleSaveTemplate}
              loading={saveTemplateBusy}
              disabled={!saveTemplateName.trim() || saveTemplateBusy}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Bulk SMS Modal */}
      <Portal>
        <Modal
          visible={bulkSmsModalVisible}
          onDismiss={bulkSmsPhase !== 'sending' ? handleCloseBulkSms : undefined}
          contentContainerStyle={[
            styles.bulkSmsModal,
            { backgroundColor: theme.colors.surface, height: windowHeight - 48 },
          ]}
        >
          {/* ── Header ── */}
          <View style={[styles.broadcastHeader, { borderBottomColor: theme.colors.outlineVariant }]}>
            <Button
              compact
              onPress={handleCloseBulkSms}
              textColor={theme.colors.onSurface}
              disabled={bulkSmsPhase === 'sending' && isSendingCurrentSms}
            >
              Cancel
            </Button>
            <View style={{ alignItems: 'center', flex: 1 }}>
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>Bulk SMS</Text>
              {bulkSmsPhase === 'sending' && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Sending {bulkSmsCurrentIndex + 1} of {bulkSmsEligibleContacts.length}
                </Text>
              )}
            </View>
            {bulkSmsPhase === 'compose' ? (
              <Button
                compact
                mode="contained"
                onPress={handleStartBulkSmsSend}
                disabled={bulkSmsEligibleContacts.length === 0 || !bulkSmsMessage.trim()}
              >
                Send
              </Button>
            ) : bulkSmsPhase === 'sending' ? (
              <Button
                compact
                onPress={handleSkipCurrentContactSms}
                textColor={theme.colors.onSurfaceVariant}
                disabled={isSendingCurrentSms}
              >
                Skip
              </Button>
            ) : (
              <Button compact mode="contained" onPress={handleCloseBulkSms}>
                Done
              </Button>
            )}
          </View>

          <ScrollView style={styles.broadcastBody} keyboardShouldPersistTaps="handled">
            {/* ── Recipients row ── */}
            <View style={[styles.recipientsRow, { backgroundColor: theme.colors.surfaceVariant }]}>
              <View style={styles.recipientAvatarRow}>
                {bulkSmsEligibleContacts.slice(0, 4).map((c, idx) => {
                  const name = getContactDisplayName(c);
                  const isCurrentInSending = bulkSmsPhase === 'sending' && idx === bulkSmsCurrentIndex;
                  return (
                    <View
                      key={c.id}
                      style={[
                        styles.avatarWrapper,
                        isCurrentInSending && {
                          borderWidth: 2,
                          borderColor: theme.colors.primary,
                          borderRadius: 22,
                          padding: 2,
                        },
                      ]}
                    >
                      <RecipientAvatar name={name} size={36} />
                    </View>
                  );
                })}
                {bulkSmsEligibleContacts.length > 4 && (
                  <View style={[styles.overflowBadge, { backgroundColor: theme.colors.primary }]}>
                    <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                      +{bulkSmsEligibleContacts.length - 4}
                    </Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurface }}>
                  {bulkSmsEligibleContacts.length} recipient{bulkSmsEligibleContacts.length !== 1 ? 's' : ''}
                </Text>
                {bulkSmsSkippedContacts.length > 0 && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {bulkSmsSkippedContacts.length} skipped (no phone)
                  </Text>
                )}
                {bulkSmsPhase === 'sending' && currentBulkContact && (
                  <Text variant="bodySmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                    Now: {getContactDisplayName(currentBulkContact)}
                  </Text>
                )}
              </View>
              <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
            </View>

            {/* ── Current recipient card (sending phase) ── */}
            {bulkSmsPhase === 'sending' && currentBulkContact && (
              <Surface
                style={[styles.currentRecipientCard, { backgroundColor: theme.colors.primaryContainer }]}
                elevation={0}
              >
                <RecipientAvatar name={getContactDisplayName(currentBulkContact)} size={44} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text variant="bodyLarge" style={{ fontWeight: '700', color: theme.colors.onPrimaryContainer }}>
                    {getContactDisplayName(currentBulkContact)}
                  </Text>
                  <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}>
                    {currentBulkContact.phone}
                  </Text>
                </View>
                {isSendingCurrentSms && (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                )}
              </Surface>
            )}

            {/* ── Templates + Labels (compose phase only) ── */}
            {bulkSmsPhase === 'compose' && (
              <View style={styles.templatesSection}>
                {/* Labels row — labels live alongside templates as a sibling concept */}
                {smsLabels.length > 0 && (
                  <View style={styles.templatesHeaderRow}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginRight: 8 }}>
                      Labels
                    </Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipScrollContent}
                    >
                      <Chip
                        compact
                        selected={smsLabelFilter === null}
                        onPress={() => setSmsLabelFilter(null)}
                        style={styles.labelChip}
                      >
                        All
                      </Chip>
                      {smsLabels.map((label) => (
                        <Chip
                          key={label.id}
                          compact
                          selected={smsLabelFilter === label.id}
                          onPress={() =>
                            setSmsLabelFilter((curr) => (curr === label.id ? null : label.id))
                          }
                          style={[
                            styles.labelChip,
                            smsLabelFilter === label.id && { backgroundColor: `${label.color}33` },
                          ]}
                          textStyle={{
                            color: smsLabelFilter === label.id ? label.color : undefined,
                          }}
                        >
                          {label.name}
                        </Chip>
                      ))}
                    </ScrollView>
                  </View>
                )}

                {/* Templates row */}
                <View style={styles.templatesHeaderRow}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginRight: 8 }}>
                    Templates
                  </Text>
                  <View style={{ flex: 1 }} />
                  <Button
                    compact
                    icon="plus"
                    onPress={handleOpenSaveTemplate}
                    disabled={!bulkSmsMessage.trim()}
                  >
                    Save current
                  </Button>
                </View>
                {filteredSmsTemplates.length === 0 ? (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, paddingVertical: 6 }}>
                    {smsTemplates.length === 0
                      ? 'No templates yet. Edit your message and tap "Save current" to make one.'
                      : 'No templates with this label. Pick another or clear the filter.'}
                  </Text>
                ) : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipScrollContent}
                  >
                    {filteredSmsTemplates.map((tmpl) => (
                      <Chip
                        key={tmpl.id}
                        compact
                        icon="message-text-outline"
                        onPress={() => handleApplyTemplate(tmpl.message)}
                        style={styles.templateChip}
                      >
                        {tmpl.name}
                      </Chip>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* ── Message template editor ── */}
            <View style={styles.messageSection}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                Message (use {'{name}'} for first name)
              </Text>
              <TextInput
                value={bulkSmsMessage}
                onChangeText={setBulkSmsMessage}
                mode="outlined"
                multiline
                numberOfLines={6}
                editable={bulkSmsPhase !== 'sending'}
                style={styles.messageInput}
              />
              {bulkSmsPhase === 'compose' && bulkSmsMessage.includes('{name}') && (
                <Text variant="bodySmall" style={{ color: theme.colors.primary, marginTop: 4 }}>
                  Preview: {bulkSmsMessage.replace(/\{name\}/g, bulkSmsEligibleContacts[0]
                    ? getContactFirstName(bulkSmsEligibleContacts[0])
                    : 'there')}
                </Text>
              )}
            </View>

            {/* ── Done summary ── */}
            {bulkSmsPhase === 'done' && (
              <Surface
                style={[styles.doneSummary, { backgroundColor: theme.colors.secondaryContainer }]}
                elevation={0}
              >
                <Icon name="check-circle" size={28} color="#16a34a" />
                <View style={{ marginLeft: 12 }}>
                  <Text variant="titleSmall" style={{ fontWeight: '700' }}>Bulk SMS Complete</Text>
                  <Text variant="bodyMedium" style={{ marginTop: 2 }}>
                    {bulkSmsSentCount} sent
                    {bulkSmsSkippedCount > 0 ? `, ${bulkSmsSkippedCount} skipped` : ''}
                    {bulkSmsSkippedContacts.length > 0 ? `, ${bulkSmsSkippedContacts.length} had no phone` : ''}
                  </Text>
                </View>
              </Surface>
            )}

            {/* ── Send action (sending phase) ── */}
            {bulkSmsPhase === 'sending' && currentBulkContact && (
              <View style={styles.sendActionRow}>
                <Button
                  mode="contained"
                  icon={isSendingCurrentSms ? undefined : 'message-text'}
                  onPress={handleSendCurrentContactSms}
                  loading={isSendingCurrentSms}
                  disabled={isSendingCurrentSms}
                  style={{ flex: 1 }}
                >
                  {isSendingCurrentSms ? 'Opening SMS...' : `Opening SMS for ${getContactDisplayName(currentBulkContact).split(' ')[0]}...`}
                </Button>
              </View>
            )}
          </ScrollView>

          {/* Sticky bottom Send action (compose phase only).
              User feedback: "Hard to press send" — the header Send button gets hidden
              behind the keyboard when editing a multiline message. This footer button
              sits above the system keyboard via Modal's keyboard avoidance. */}
          {bulkSmsPhase === 'compose' && (
            <View
              style={[
                styles.bulkSmsFooter,
                { borderTopColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surface },
              ]}
            >
              <Button
                mode="contained"
                icon="send"
                onPress={handleStartBulkSmsSend}
                disabled={bulkSmsEligibleContacts.length === 0 || !bulkSmsMessage.trim()}
                style={{ flex: 1 }}
                contentStyle={{ paddingVertical: 4 }}
              >
                Send to {bulkSmsEligibleContacts.length} recipient{bulkSmsEligibleContacts.length !== 1 ? 's' : ''}
              </Button>
            </View>
          )}
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  searchbar: {
    elevation: 0,
    flex: 1,
  },
  importButton: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listHeader: {
    gap: 8,
    marginBottom: 8,
  },
  savedSearchContainer: {
    marginBottom: 4,
  },
  savedSearchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  savedSearchChip: {
    marginRight: 0,
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  saveSearchButton: {
    alignSelf: 'flex-start',
  },
  dialog: {
    maxHeight: '80%',
  },
  dialogScrollArea: {
    paddingHorizontal: 0,
  },
  dialogContent: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 8,
  },
  sectionLabel: {
    marginTop: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    marginBottom: 0,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
  selectBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
  },
  selectableCardWrapper: {
    flex: 1,
  },
  bulkSmsModal: {
    marginHorizontal: 0,
    marginTop: 48,
    marginBottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  broadcastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  broadcastBody: {
    flex: 1,
  },
  recipientsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  recipientAvatarRow: {
    flexDirection: 'row',
    gap: 6,
  },
  avatarWrapper: {},
  overflowBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  currentRecipientCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
  },
  messageSection: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  messageInput: {
    minHeight: 120,
  },
  templatesSection: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  templatesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  chipScrollContent: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 4,
    paddingRight: 8,
  },
  labelChip: {
    marginRight: 6,
  },
  templateChip: {
    marginRight: 6,
  },
  bulkSmsFooter: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  sendActionRow: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 24,
    flexDirection: 'row',
  },
});
