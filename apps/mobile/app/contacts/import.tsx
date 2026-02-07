import { useState, useEffect, useMemo, useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
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
} from 'react-native-paper';
import { Stack, useRouter } from 'expo-router';
import * as Contacts from 'expo-contacts';
import { useCRMStore } from '@realestate-crm/hooks';
import { findDuplicates } from '@realestate-crm/utils';
import type { Contact as CRMContact } from '@realestate-crm/types';

type Step = 'select' | 'preview' | 'importing' | 'done';

interface MappedContact {
  first_name: string;
  last_name?: string;
  phone?: string;
  email?: string;
}

export default function ImportContactsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const existingContacts = useCRMStore((s) => s.contacts);
  const bulkAddContacts = useCRMStore((s) => s.bulkAddContacts);

  const [step, setStep] = useState<Step>('select');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [deviceContacts, setDeviceContacts] = useState<Contacts.ExistingContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Preview state
  const [mapped, setMapped] = useState<MappedContact[]>([]);
  const [dupeMap, setDupeMap] = useState<Map<number, CRMContact>>(new Map());
  const [skipIndices, setSkipIndices] = useState<Set<number>>(new Set());

  // Results
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);

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

  const handlePreview = useCallback(() => {
    const selected = deviceContacts.filter((c) => selectedIds.has(c.id!));
    const mappedList: MappedContact[] = selected.map((c) => ({
      first_name: c.firstName || c.lastName || 'Unknown',
      last_name: c.lastName && c.firstName ? c.lastName : undefined,
      phone: c.phoneNumbers?.[0]?.number,
      email: c.emails?.[0]?.email,
    }));

    setMapped(mappedList);
    const dupes = findDuplicates(mappedList, existingContacts);
    setDupeMap(dupes);

    // Default skip duplicates
    setSkipIndices(new Set(dupes.keys()));
    setStep('preview');
  }, [deviceContacts, selectedIds, existingContacts]);

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
    const toImport = mapped.filter((_, i) => !skipIndices.has(i));
    const created = await bulkAddContacts(toImport);
    setImportedCount(created.length);
    setSkippedCount(mapped.length - toImport.length);
    setStep('done');
  }, [mapped, skipIndices, bulkAddContacts]);

  // Permission denied
  if (permissionDenied) {
    return (
      <>
        <Stack.Screen options={{ title: 'Import Contacts' }} />
        <View style={[styles.centered, { backgroundColor: theme.colors.background }]}>
          <Text variant="bodyLarge" style={{ textAlign: 'center', margin: 32 }}>
            Contact permission is required to import phone contacts.
          </Text>
          <Button mode="contained" onPress={() => router.back()}>
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
                {mapped.length - skipIndices.size} will be imported, {skipIndices.size} skipped
              </Text>
            </View>

            <FlatList
              data={mapped}
              keyExtractor={(_, i) => String(i)}
              renderItem={({ item, index }) => {
                const isDupe = dupeMap.has(index);
                const isSkipped = skipIndices.has(index);
                const dupeOf = dupeMap.get(index);
                return (
                  <Surface style={styles.previewRow} elevation={0}>
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
                    </View>
                    {isDupe ? (
                      <Chip compact style={{ backgroundColor: '#fef3c7' }} textStyle={{ fontSize: 11 }}>
                        Duplicate of {dupeOf?.first_name}
                      </Chip>
                    ) : (
                      <Chip compact style={{ backgroundColor: '#d1fae5' }} textStyle={{ fontSize: 11 }}>
                        New
                      </Chip>
                    )}
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
                Import {mapped.length - skipIndices.size} Contacts
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
              Import Complete
            </Text>
            <Text variant="bodyLarge">
              Imported {importedCount}, Skipped {skippedCount}
            </Text>
            <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 24 }}>
              Done
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
