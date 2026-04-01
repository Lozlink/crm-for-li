import { useState, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, View, FlatList, Pressable } from 'react-native';
import {
  Text,
  Button,
  Searchbar,
  Checkbox,
  useTheme,
  ActivityIndicator,
  Surface,
  Chip,
  Divider,
  TextInput,
  IconButton,
  Switch,
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import * as Contacts from 'expo-contacts';
import * as Linking from 'expo-linking';
import { useCRMStore, syncContactTags } from '@realestate-crm/hooks';
import { useAuthStore } from '@realestate-crm/hooks';
import { findDuplicates, parseContactNameField, batchGeocodeAddresses } from '@realestate-crm/utils';
import type { Contact as CRMContact } from '@realestate-crm/types';

type Step = 'select' | 'preview' | 'importing' | 'done';

interface MappedContact {
  first_name: string;
  last_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  unit_number?: string;
  latitude?: number;
  longitude?: number;
  addressExtracted?: boolean;
}

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY || '';

export default function ImportContactsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const existingContacts = useCRMStore((s) => s.contacts);
  const bulkAddContacts = useCRMStore((s) => s.bulkAddContacts);
  const tags = useCRMStore((s) => s.tags);
  const addTag = useCRMStore((s) => s.addTag);

  const [step, setStep] = useState<Step>('select');
  const [selectedImportTagIds, setSelectedImportTagIds] = useState<Set<string>>(new Set());
  const [showNewTag, setShowNewTag] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<Contacts.ExistingContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Preview state
  const [mapped, setMapped] = useState<MappedContact[]>([]);
  const [dupeMap, setDupeMap] = useState<Map<number, CRMContact>>(new Map());
  const [skipIndices, setSkipIndices] = useState<Set<number>>(new Set());

  // Preview filters
  const [filterSkipNoPhone, setFilterSkipNoPhone] = useState(false);
  const [filterSkipNoEmail, setFilterSkipNoEmail] = useState(false);
  const [filterSkipDuplicates, setFilterSkipDuplicates] = useState(true);
  const [previewSearch, setPreviewSearch] = useState('');

  // Results
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);

  // Load device contacts
  useEffect(() => {
    (async () => {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        setLoading(false);
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.FirstName,
          Contacts.Fields.LastName,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Emails,
          Contacts.Fields.Addresses,
        ],
      });
      // Filter out contacts without a name
      setDeviceContacts(data.filter((c) => c.firstName || c.lastName));
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    if (!search) return deviceContacts;
    const q = search.toLowerCase();
    return deviceContacts.filter((c) => {
      const name = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase();
      return name.includes(q);
    });
  }, [deviceContacts, search]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filtered.map((c) => c.id!)));
  }, [filtered]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handlePreview = useCallback(async () => {
    const selected = deviceContacts.filter((c) => selectedIds.has(c.id!));
    const mappedList: MappedContact[] = selected.map((c) => {
      // Build address from phone's structured address fields
      let phoneAddress: string | undefined;
      if (c.addresses && c.addresses.length > 0) {
        const addr = c.addresses[0];
        const parts = [addr.street, addr.city, addr.region, addr.postalCode].filter(Boolean);
        if (parts.length > 0) phoneAddress = parts.join(', ');
      }

      const contact: MappedContact = {
        first_name: c.firstName || c.lastName || 'Unknown',
        last_name: c.lastName && c.firstName ? c.lastName : undefined,
        phone: c.phoneNumbers?.[0]?.number,
        email: c.emails?.[0]?.email,
        address: phoneAddress,
      };

      // Fallback: if still no address, try smart parsing from name field
      if (!contact.address) {
        const fullName = `${contact.first_name} ${contact.last_name || ''}`.trim();
        const parsed = parseContactNameField(fullName);
        if (parsed && parsed.address) {
          contact.first_name = parsed.first_name ?? contact.first_name;
          contact.last_name = parsed.last_name ?? contact.last_name;
          contact.address = parsed.address;
          contact.unit_number = parsed.unit_number;
          contact.addressExtracted = true;
        }
      }

      return contact;
    });

    // Geocode addresses to get lat/lng for map display
    if (GOOGLE_API_KEY) {
      const toGeocode = mappedList
        .map((c, i) => (c.address ? { index: i, address: c.address } : null))
        .filter((x): x is { index: number; address: string } => x !== null);

      if (toGeocode.length > 0) {
        const coords = await batchGeocodeAddresses(toGeocode, GOOGLE_API_KEY);
        for (const [idx, { lat, lng }] of coords) {
          mappedList[idx].latitude = lat;
          mappedList[idx].longitude = lng;
        }
      }
    }

    setMapped(mappedList);
    const dupes = findDuplicates(mappedList, existingContacts);
    setDupeMap(dupes);

    // Reset manual skip indices (filter-driven skips are computed via effectiveSkipIndices)
    setSkipIndices(new Set());
    setFilterSkipDuplicates(true);
    setPreviewSearch('');
    setStep('preview');
  }, [deviceContacts, selectedIds, existingContacts]);

  // Compute effective skip indices: merge manual skips + filter-driven skips
  const effectiveSkipIndices = useMemo(() => {
    const effective = new Set(skipIndices);
    mapped.forEach((c, i) => {
      if (filterSkipNoPhone && !c.phone) effective.add(i);
      if (filterSkipNoEmail && !c.email) effective.add(i);
      if (filterSkipDuplicates && dupeMap.has(i)) effective.add(i);
    });
    return effective;
  }, [skipIndices, mapped, filterSkipNoPhone, filterSkipNoEmail, filterSkipDuplicates, dupeMap]);

  // Filter preview list by search
  const filteredPreview = useMemo(() => {
    if (!previewSearch) return mapped.map((item, index) => ({ item, index }));
    const q = previewSearch.toLowerCase();
    return mapped
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => {
        const name = `${item.first_name} ${item.last_name || ''}`.toLowerCase();
        return name.includes(q);
      });
  }, [mapped, previewSearch]);

  const toggleImportTag = useCallback((tagId: string) => {
    setSelectedImportTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  }, []);

  const TAG_PRESET_COLORS = ['#6366f1', '#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#0d9488'];

  const handleCreateTag = useCallback(async () => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    const created = await addTag({ name: trimmed, color: newTagColor });
    if (created) {
      setSelectedImportTagIds((prev) => new Set(prev).add(created.id));
      setNewTagName('');
      setShowNewTag(false);
    }
  }, [newTagName, newTagColor, addTag]);

  const toggleSkip = useCallback((idx: number) => {
    setSkipIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const handleImport = useCallback(async () => {
    setStep('importing');
    setImportError(null);
    const toImport = mapped
      .filter((_, i) => !effectiveSkipIndices.has(i))
      .map(({ addressExtracted: _ae, ...c }) => ({ ...c, source: 'import' as const }));
    const created = await bulkAddContacts(toImport);
    if (created.length === 0 && toImport.length > 0) {
      // bulkAddContacts returns [] on error — check the store for details
      const storeError = useCRMStore.getState().error;
      setImportError(storeError || 'Import failed. Please try again.');
    }

    // Apply selected tags to all newly created contacts
    if (created.length > 0 && selectedImportTagIds.size > 0) {
      const tagIds = Array.from(selectedImportTagIds);
      const teamId = useAuthStore.getState().activeTeam?.id || null;
      for (const contact of created) {
        try {
          await syncContactTags(contact.id, tagIds, teamId);
        } catch (err) {
          console.error('Failed to sync tags for contact', contact.id, err);
        }
      }
      // Refresh contacts to pick up the new tag associations
      await useCRMStore.getState().fetchContacts();
    }

    setImportedCount(created.length);
    setSkippedCount(mapped.length - toImport.length);
    setStep('done');
  }, [mapped, effectiveSkipIndices, bulkAddContacts, selectedImportTagIds]);

  // Permission denied
  if (permissionDenied) {
    return (
      <>
        <Stack.Screen options={{ title: 'Import Contacts' }} />
        <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
          <Text variant="bodyLarge" style={{ textAlign: 'center', margin: 32 }}>
            Contact permission is required to import phone contacts.
          </Text>
          <Button mode="contained" onPress={() => Linking.openSettings()} style={{ marginBottom: 12 }}>
            Open Settings
          </Button>
          <Button mode="outlined" onPress={() => router.back()}>
            Go Back
          </Button>
        </View>
      </>
    );
  }

  // Loading
  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: 'Import Contacts' }} />
        <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" />
          <Text variant="bodyMedium" style={{ marginTop: 16 }}>
            Loading contacts...
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Import Contacts' }} />

      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {step === 'select' && (
          <>
            <View style={styles.header}>
              <Searchbar
                placeholder="Search phone contacts..."
                value={search}
                onChangeText={setSearch}
                style={styles.searchbar}
              />
              <View style={styles.selectActions}>
                <Button compact onPress={selectAll}>
                  Select All
                </Button>
                <Button compact onPress={deselectAll}>
                  Deselect All
                </Button>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {selectedIds.size} selected
                </Text>
                <View style={{ flex: 1 }} />
                <Button
                  compact
                  onPress={() => Linking.openSettings()}
                  icon="cog-outline"
                  textColor={theme.colors.onSurfaceVariant}
                >
                  Permissions
                </Button>
              </View>
            </View>

            <FlatList
              data={filtered}
              keyExtractor={(item) => item.id!}
              renderItem={({ item }) => (
                <Surface style={styles.contactRow} elevation={0}>
                  <Checkbox
                    status={selectedIds.has(item.id!) ? 'checked' : 'unchecked'}
                    onPress={() => toggleSelect(item.id!)}
                  />
                  <View style={styles.contactInfo}>
                    <Text variant="bodyLarge">
                      {item.firstName || ''} {item.lastName || ''}
                    </Text>
                    {item.phoneNumbers?.[0] && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {item.phoneNumbers[0].number}
                      </Text>
                    )}
                  </View>
                </Surface>
              )}
              contentContainerStyle={styles.list}
            />

            <View style={styles.footer}>
              <Button
                mode="contained"
                onPress={handlePreview}
                disabled={selectedIds.size === 0}
              >
                Preview ({selectedIds.size})
              </Button>
            </View>
          </>
        )}

        {step === 'preview' && (
          <>
            <View style={styles.previewHeader}>
              <Text variant="titleMedium">Preview Import</Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {mapped.length - effectiveSkipIndices.size} will be imported, {effectiveSkipIndices.size} skipped
              </Text>
            </View>

            <Surface style={styles.tagSection} elevation={0}>
              <Text variant="labelLarge" style={{ marginBottom: 8 }}>Tags</Text>
              <View style={styles.tagChipRow}>
                {tags.map((tag) => (
                  <Chip
                    key={tag.id}
                    selected={selectedImportTagIds.has(tag.id)}
                    onPress={() => toggleImportTag(tag.id)}
                    style={[
                      styles.tagChip,
                      selectedImportTagIds.has(tag.id) && { backgroundColor: tag.color + '30' },
                    ]}
                    textStyle={selectedImportTagIds.has(tag.id) ? { color: tag.color } : undefined}
                    showSelectedOverlay={false}
                    compact
                  >
                    {tag.name}
                  </Chip>
                ))}
                <Chip
                  icon="plus"
                  onPress={() => setShowNewTag(true)}
                  style={styles.tagChip}
                  compact
                >
                  New Tag
                </Chip>
              </View>

              {showNewTag && (
                <View style={styles.newTagRow}>
                  <TextInput
                    mode="outlined"
                    placeholder="Tag name"
                    value={newTagName}
                    onChangeText={setNewTagName}
                    dense
                    style={{ flex: 1 }}
                  />
                  <View style={styles.colorDots}>
                    {TAG_PRESET_COLORS.map((c) => (
                      <Pressable
                        key={c}
                        onPress={() => setNewTagColor(c)}
                        style={[
                          styles.colorDot,
                          { backgroundColor: c },
                          newTagColor === c && styles.colorDotSelected,
                        ]}
                      />
                    ))}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    <IconButton icon="check" size={20} onPress={handleCreateTag} disabled={!newTagName.trim()} />
                    <IconButton icon="close" size={20} onPress={() => { setShowNewTag(false); setNewTagName(''); }} />
                  </View>
                </View>
              )}

              {selectedImportTagIds.size > 0 && (
                <Text variant="bodySmall" style={{ color: theme.colors.primary, marginTop: 6 }}>
                  {selectedImportTagIds.size} {selectedImportTagIds.size === 1 ? 'tag' : 'tags'} will be applied to all imported contacts
                </Text>
              )}
            </Surface>

            {/* Filters */}
            <Surface style={styles.filterSection} elevation={0}>
              <Text variant="labelLarge" style={{ marginBottom: 8 }}>Filters</Text>
              <View style={styles.filterRow}>
                <Text variant="bodySmall" style={{ flex: 1 }}>Skip without phone</Text>
                <Switch value={filterSkipNoPhone} onValueChange={setFilterSkipNoPhone} />
              </View>
              <View style={styles.filterRow}>
                <Text variant="bodySmall" style={{ flex: 1 }}>Skip without email</Text>
                <Switch value={filterSkipNoEmail} onValueChange={setFilterSkipNoEmail} />
              </View>
              <View style={styles.filterRow}>
                <Text variant="bodySmall" style={{ flex: 1 }}>Skip duplicates</Text>
                <Switch value={filterSkipDuplicates} onValueChange={setFilterSkipDuplicates} />
              </View>
              <Searchbar
                placeholder="Search preview by name..."
                value={previewSearch}
                onChangeText={setPreviewSearch}
                style={styles.previewSearchbar}
                inputStyle={{ fontSize: 13 }}
              />
            </Surface>

            <FlatList
              data={filteredPreview}
              keyExtractor={({ index }) => String(index)}
              renderItem={({ item: { item, index } }) => {
                const isDupe = dupeMap.has(index);
                const isSkipped = effectiveSkipIndices.has(index);
                const dupeOf = dupeMap.get(index);
                return (
                  <Surface style={[styles.previewRow, isSkipped && { opacity: 0.45 }]} elevation={0}>
                    <Checkbox
                      status={isSkipped ? 'unchecked' : 'checked'}
                      onPress={() => toggleSkip(index)}
                    />
                    <View style={styles.contactInfo}>
                      <Text variant="bodyLarge">
                        {item.first_name} {item.last_name || ''}
                      </Text>
                      {item.phone && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {item.phone}
                        </Text>
                      )}
                      {item.address && (
                        <Text variant="bodySmall" style={{ color: theme.colors.primary }} numberOfLines={1}>
                          {item.unit_number ? `${item.unit_number}/` : ''}{item.address}
                        </Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 4 }}>
                      {isDupe ? (
                        <Chip compact style={{ backgroundColor: '#fef3c7' }} textStyle={{ fontSize: 11 }}>
                          Duplicate of {dupeOf?.first_name}
                        </Chip>
                      ) : (
                        <Chip compact style={{ backgroundColor: '#d1fae5' }} textStyle={{ fontSize: 11 }}>
                          New
                        </Chip>
                      )}
                      {item.addressExtracted && (
                        <Chip compact style={{ backgroundColor: '#dbeafe' }} textStyle={{ fontSize: 11 }}>
                          Address extracted
                        </Chip>
                      )}
                    </View>
                  </Surface>
                );
              }}
              contentContainerStyle={styles.list}
            />

            <View style={styles.footer}>
              <Button mode="outlined" onPress={() => setStep('select')} style={{ marginRight: 12 }}>
                Back
              </Button>
              <Button mode="contained" onPress={handleImport}>
                Import {mapped.length - effectiveSkipIndices.size} Contacts
              </Button>
            </View>
          </>
        )}

        {step === 'importing' && (
          <View style={styles.centered}>
            <ActivityIndicator size="large" />
            <Text variant="bodyLarge" style={{ marginTop: 16 }}>
              Importing contacts...
            </Text>
          </View>
        )}

        {step === 'done' && (
          <View style={styles.centered}>
            <Text variant="headlineSmall" style={{ marginBottom: 16 }}>
              {importError ? 'Import Failed' : 'Import Complete'}
            </Text>
            {importError ? (
              <Text variant="bodyLarge" style={{ color: theme.colors.error, textAlign: 'center', marginHorizontal: 16 }}>
                {importError}
              </Text>
            ) : (
              <Text variant="bodyLarge">
                Imported {importedCount}, Skipped {skippedCount}
              </Text>
            )}
            {importError && (
              <Button mode="outlined" onPress={() => setStep('preview')} style={{ marginTop: 16 }}>
                Try Again
              </Button>
            )}
            <Button mode="contained" onPress={() => router.back()} style={{ marginTop: importError ? 8 : 24 }}>
              {importError ? 'Go Back' : 'Done'}
            </Button>
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  header: {
    padding: 16,
    paddingBottom: 8,
  },
  searchbar: {
    elevation: 0,
  },
  selectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  list: {
    padding: 16,
    paddingTop: 0,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  contactInfo: {
    flex: 1,
    marginLeft: 8,
  },
  previewHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  tagSection: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
  },
  filterSection: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  previewSearchbar: {
    elevation: 0,
    marginTop: 8,
    height: 40,
  },
  tagChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tagChip: {
    marginBottom: 2,
  },
  newTagRow: {
    marginTop: 10,
    gap: 8,
  },
  colorDots: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  colorDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  colorDotSelected: {
    borderWidth: 2,
    borderColor: '#000',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
});
