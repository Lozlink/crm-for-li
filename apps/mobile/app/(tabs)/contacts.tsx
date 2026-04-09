import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, FlatList, ScrollView, Alert, Linking, Platform, Pressable } from 'react-native';
import {
  Searchbar, FAB, useTheme, Text, ActivityIndicator, Button,
  IconButton, Portal, Dialog, Chip, TextInput, Switch, Checkbox, Modal, Surface,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useCRMStore, useSavedSearchStore, useLeadScoringEngine } from '@realestate-crm/hooks';
import { ContactCard } from '@realestate-crm/ui';
import type { Contact, ContactSource, ContactType, ContactStatus } from '@realestate-crm/types';

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

function sanitizePhone(phone: string): string {
  return phone.replace(/[^\d+]/g, '');
}

export default function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
  const [bulkSmsModalVisible, setBulkSmsModalVisible] = useState(false);
  const [bulkSmsMessage, setBulkSmsMessage] = useState('');
  const [bulkSmsCurrentIndex, setBulkSmsCurrentIndex] = useState(0);
  const [bulkSmsSentCount, setBulkSmsSentCount] = useState(0);
  const [bulkSmsSkippedCount, setBulkSmsSkippedCount] = useState(0);
  const [bulkSmsPhase, setBulkSmsPhase] = useState<'compose' | 'sending' | 'done'>('compose');

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
    setBulkSmsMessage('Hi {name}, just touching base. Would love to catch up when you have a moment.');
    setBulkSmsPhase('compose');
    setBulkSmsCurrentIndex(0);
    setBulkSmsSentCount(0);
    setBulkSmsSkippedCount(0);
    setBulkSmsModalVisible(true);
  }, [bulkSmsEligibleContacts]);

  const handleStartBulkSmsSend = useCallback(() => {
    setBulkSmsPhase('sending');
    setBulkSmsCurrentIndex(0);
    setBulkSmsSentCount(0);
    setBulkSmsSkippedCount(0);
  }, []);

  const currentBulkContact = bulkSmsEligibleContacts[bulkSmsCurrentIndex] as Contact | undefined;

  const handleSendCurrentContactSms = useCallback(() => {
    if (!currentBulkContact?.phone) return;
    const phone = sanitizePhone(currentBulkContact.phone);
    const contactName = getContactDisplayName(currentBulkContact);
    const personalizedMessage = bulkSmsMessage.replace(/\{name\}/g, contactName);
    const body = encodeURIComponent(personalizedMessage);
    const separator = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${phone}${separator}body=${body}`).catch(() => {});
    if (currentBulkContact.id) {
      const preview = personalizedMessage.length > 200 ? `${personalizedMessage.slice(0, 200)}…` : personalizedMessage;
      addActivity({
        contact_id: currentBulkContact.id,
        type: 'sms',
        content: `SMS initiated: ${preview}`,
      }).catch((e) => console.warn('SMS activity log failed:', e));
    }
    setBulkSmsSentCount(prev => prev + 1);
    const nextIdx = bulkSmsCurrentIndex + 1;
    if (nextIdx >= bulkSmsEligibleContacts.length) {
      setBulkSmsPhase('done');
    } else {
      setBulkSmsCurrentIndex(nextIdx);
    }
  }, [currentBulkContact, bulkSmsMessage, bulkSmsCurrentIndex, bulkSmsEligibleContacts.length, addActivity]);

  const handleSkipCurrentContactSms = useCallback(() => {
    setBulkSmsSkippedCount(prev => prev + 1);
    const nextIdx = bulkSmsCurrentIndex + 1;
    if (nextIdx >= bulkSmsEligibleContacts.length) {
      setBulkSmsPhase('done');
    } else {
      setBulkSmsCurrentIndex(nextIdx);
    }
  }, [bulkSmsCurrentIndex, bulkSmsEligibleContacts.length]);

  const handleStopBulkSmsSend = useCallback(() => {
    setBulkSmsPhase('done');
  }, []);

  const handleCloseBulkSms = useCallback(() => {
    setBulkSmsModalVisible(false);
    exitSelectMode();
  }, [exitSelectMode]);

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

      {/* Bulk SMS Modal */}
      <Portal>
        <Modal
          visible={bulkSmsModalVisible}
          onDismiss={handleCloseBulkSms}
          contentContainerStyle={[
            styles.bulkSmsModal,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          {bulkSmsPhase === 'compose' && (
            <View style={styles.bulkSmsContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="message-text-outline" size={24} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>Bulk SMS</Text>
              </View>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
                Will send to {bulkSmsEligibleContacts.length} contact{bulkSmsEligibleContacts.length !== 1 ? 's' : ''}
                {bulkSmsSkippedContacts.length > 0
                  ? ` (${bulkSmsSkippedContacts.length} skipped — no phone)`
                  : ''}
              </Text>

              <Text variant="labelMedium" style={{ marginBottom: 4, color: theme.colors.onSurfaceVariant }}>
                Message template (use {'{name}'} for contact name)
              </Text>
              <TextInput
                value={bulkSmsMessage}
                onChangeText={setBulkSmsMessage}
                mode="outlined"
                multiline
                numberOfLines={4}
                style={{ marginBottom: 16 }}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <Button onPress={handleCloseBulkSms}>Cancel</Button>
                <Button
                  mode="contained"
                  icon="send"
                  onPress={handleStartBulkSmsSend}
                  disabled={bulkSmsEligibleContacts.length === 0 || !bulkSmsMessage.trim()}
                >
                  Start Sending
                </Button>
              </View>
            </View>
          )}

          {bulkSmsPhase === 'sending' && currentBulkContact && (
            <View style={styles.bulkSmsContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="message-text-outline" size={24} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>
                  Sending {bulkSmsCurrentIndex + 1} of {bulkSmsEligibleContacts.length}
                </Text>
              </View>

              <Surface style={[styles.bulkSmsRecipient, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
                <Icon name="account" size={18} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodyMedium" style={{ fontWeight: '600', marginLeft: 8, flex: 1 }}>
                  {getContactDisplayName(currentBulkContact)}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {currentBulkContact.phone}
                </Text>
              </Surface>

              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, marginBottom: 16 }}>
                Tapping "Send" will open the native SMS app for this contact.
              </Text>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                <Button onPress={handleStopBulkSmsSend} textColor={theme.colors.error}>
                  Stop
                </Button>
                <Button onPress={handleSkipCurrentContactSms}>
                  Skip
                </Button>
                <Button mode="contained" icon="message-text" onPress={handleSendCurrentContactSms}>
                  Send
                </Button>
              </View>
            </View>
          )}

          {bulkSmsPhase === 'done' && (
            <View style={styles.bulkSmsContent}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Icon name="check-circle" size={24} color="#16a34a" />
                <Text variant="titleMedium" style={{ fontWeight: '700' }}>Bulk SMS Complete</Text>
              </View>

              <View style={{ gap: 4, marginBottom: 16 }}>
                <Text variant="bodyMedium">
                  {bulkSmsSentCount} sent, {bulkSmsSkippedCount} skipped
                </Text>
                {bulkSmsSkippedContacts.length > 0 && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {bulkSmsSkippedContacts.length} had no phone number
                  </Text>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <Button mode="contained" onPress={handleCloseBulkSms}>
                  Done
                </Button>
              </View>
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
    margin: 20,
    borderRadius: 16,
    overflow: 'hidden',
  },
  bulkSmsContent: {
    padding: 20,
  },
  bulkSmsRecipient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
  },
});
