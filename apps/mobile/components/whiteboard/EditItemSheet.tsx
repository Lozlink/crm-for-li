import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  IconButton,
  Portal,
  TextInput,
  Text,
  Checkbox,
  Chip,
  useTheme,
} from 'react-native-paper';
import type {
  WhiteboardChecklistContent,
  WhiteboardChecklistEntry,
  WhiteboardContactContent,
  WhiteboardGoalContent,
  WhiteboardGoalMetric,
  WhiteboardGoalPeriod,
  WhiteboardItem,
  WhiteboardMapContent,
  WhiteboardPhotoContent,
  WhiteboardPropertyContent,
  WhiteboardStickyContent,
} from '@realestate-crm/types';
import { generateUUID } from '@realestate-crm/api';
import { useCRMStore, usePropertyStore } from '@realestate-crm/hooks';
import { STICKY_COLOR_DEFS, stickyColorKey } from './whiteboardColors';
import { useColorScheme } from 'react-native';
import { stickyColorForScheme } from './whiteboardColors';

const GOAL_METRICS: { value: WhiteboardGoalMetric; label: string; icon: string }[] = [
  { value: 'commission', label: 'Commission', icon: 'cash-multiple' },
  { value: 'listings', label: 'Listings', icon: 'home-plus-outline' },
  { value: 'leads', label: 'Leads', icon: 'account-plus-outline' },
  { value: 'calls', label: 'Calls', icon: 'phone-outline' },
];

const GOAL_PERIODS: { value: WhiteboardGoalPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
];

interface Props {
  item: WhiteboardItem | null;
  onDismiss: () => void;
  onSave: (id: string, patch: { content: WhiteboardItem['content']; color?: string | null }) => void;
}

/**
 * Modal editor for sticky / checklist / photo items.
 *
 * IMPORTANT: Paper's Dialog.Actions does not tolerate Fragment children
 * (project-known gotcha — see session-2026-04-22-declared-buildings).
 * Always pass plain Buttons, never wrap in <></>.
 */
export function EditItemSheet({ item, onDismiss, onSave }: Props) {
  const theme = useTheme();
  const colorScheme = useColorScheme();

  // Sticky local state
  const [stickyText, setStickyText] = useState('');
  const [stickyColor, setStickyColor] = useState<string | null>(null);

  // Checklist local state
  const [checklistTitle, setChecklistTitle] = useState('');
  const [checklistEntries, setChecklistEntries] = useState<WhiteboardChecklistEntry[]>([]);
  const [newEntryText, setNewEntryText] = useState('');

  // Photo local state
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');

  // Contact picker state
  const [contactId, setContactId] = useState<string>('');
  const [contactSearch, setContactSearch] = useState('');

  // Property picker state
  const [propertyId, setPropertyId] = useState<string>('');
  const [propertySearch, setPropertySearch] = useState('');

  // Goal state
  const [goalMetric, setGoalMetric] = useState<WhiteboardGoalMetric>('commission');
  const [goalTarget, setGoalTarget] = useState<string>('5000');
  const [goalPeriod, setGoalPeriod] = useState<WhiteboardGoalPeriod>('month');

  // Map state
  const [mapLat, setMapLat] = useState<string>('-33.8688');
  const [mapLng, setMapLng] = useState<string>('151.2093');
  const [mapZoom, setMapZoom] = useState<string>('13');

  // Live data for pickers — read at hook level so we don't break the rules.
  const allContacts = useCRMStore((s) => s.contacts);
  const allProperties = usePropertyStore((s) => s.properties);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const list = allContacts.slice(0, 50); // bound for perf
    if (!q) return list;
    return allContacts.filter((c) => {
      const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
      const addr = (c.address ?? '').toLowerCase();
      return name.includes(q) || addr.includes(q);
    }).slice(0, 50);
  }, [allContacts, contactSearch]);

  const filteredProperties = useMemo(() => {
    const q = propertySearch.trim().toLowerCase();
    const list = allProperties.slice(0, 50);
    if (!q) return list;
    return allProperties.filter((p) => {
      return p.address.toLowerCase().includes(q) || (p.suburb ?? '').toLowerCase().includes(q);
    }).slice(0, 50);
  }, [allProperties, propertySearch]);

  // Hydrate local state when item changes.
  useEffect(() => {
    if (!item) return;
    if (item.type === 'sticky') {
      const c = item.content as WhiteboardStickyContent;
      setStickyText(c?.text || '');
      setStickyColor(item.color);
    } else if (item.type === 'checklist') {
      const c = item.content as WhiteboardChecklistContent;
      setChecklistTitle(c?.title || '');
      setChecklistEntries(c?.items ? [...c.items] : []);
      setNewEntryText('');
    } else if (item.type === 'photo') {
      const c = item.content as WhiteboardPhotoContent;
      setPhotoUrl(c?.url || '');
      setPhotoCaption(c?.caption || '');
    } else if (item.type === 'contact') {
      const c = item.content as WhiteboardContactContent;
      setContactId(c?.contactId || '');
      setContactSearch('');
    } else if (item.type === 'property') {
      const c = item.content as WhiteboardPropertyContent;
      setPropertyId(c?.propertyId || '');
      setPropertySearch('');
    } else if (item.type === 'goal') {
      const c = item.content as WhiteboardGoalContent;
      setGoalMetric(c?.metric ?? 'commission');
      setGoalTarget(String(c?.target ?? 5000));
      setGoalPeriod(c?.period ?? 'month');
    } else if (item.type === 'map') {
      const c = item.content as WhiteboardMapContent;
      setMapLat(String(c?.viewport?.lat ?? -33.8688));
      setMapLng(String(c?.viewport?.lng ?? 151.2093));
      setMapZoom(String(c?.viewport?.zoom ?? 13));
    }
  }, [item]);

  if (!item) return null;

  const handleSave = () => {
    if (item.type === 'sticky') {
      onSave(item.id, {
        content: { text: stickyText } as WhiteboardStickyContent,
        color: stickyColor,
      });
    } else if (item.type === 'checklist') {
      onSave(item.id, {
        content: {
          title: checklistTitle.trim() || undefined,
          items: checklistEntries,
        } as WhiteboardChecklistContent,
      });
    } else if (item.type === 'photo') {
      const trimmedUrl = photoUrl.trim();
      onSave(item.id, {
        content: {
          url: trimmedUrl,
          caption: photoCaption.trim() || undefined,
        } as WhiteboardPhotoContent,
      });
    } else if (item.type === 'contact') {
      const c = allContacts.find((x) => x.id === contactId);
      onSave(item.id, {
        content: {
          contactId,
          snapshotName: c
            ? [c.first_name, c.last_name].filter(Boolean).join(' ') || undefined
            : undefined,
        } as WhiteboardContactContent,
      });
    } else if (item.type === 'property') {
      const p = allProperties.find((x) => x.id === propertyId);
      onSave(item.id, {
        content: {
          propertyId,
          snapshotAddress: p?.address,
        } as WhiteboardPropertyContent,
      });
    } else if (item.type === 'goal') {
      onSave(item.id, {
        content: {
          metric: goalMetric,
          target: parseFloat(goalTarget) || 0,
          period: goalPeriod,
        } as WhiteboardGoalContent,
      });
    } else if (item.type === 'map') {
      onSave(item.id, {
        content: {
          viewport: {
            lat: parseFloat(mapLat) || 0,
            lng: parseFloat(mapLng) || 0,
            zoom: parseInt(mapZoom, 10) || 13,
          },
        } as WhiteboardMapContent,
      });
    }
    onDismiss();
  };

  const addChecklistEntry = () => {
    const t = newEntryText.trim();
    if (!t) return;
    setChecklistEntries((prev) => [...prev, { id: generateUUID(), text: t, checked: false }]);
    setNewEntryText('');
  };

  const toggleEntry = (id: string) => {
    setChecklistEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, checked: !e.checked } : e)),
    );
  };

  const updateEntryText = (id: string, text: string) => {
    setChecklistEntries((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const removeEntry = (id: string) => {
    setChecklistEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // Suggestion cards are read-only — they're snapshots from the Intelligence
  // sidebar at the moment of "Add to board".
  const titleByType: Partial<Record<typeof item.type, string>> = {
    sticky: 'Edit quick note',
    checklist: 'Edit to-do',
    photo: 'Edit photo',
    contact: 'Pick a contact',
    property: 'Pick a property',
    goal: 'Set your goal',
    map: 'Set map pin',
  };

  return (
    <Portal>
      <Dialog visible={!!item} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{titleByType[item.type] ?? 'Edit'}</Dialog.Title>

        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {item.type === 'sticky' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Text"
                  multiline
                  numberOfLines={6}
                  value={stickyText}
                  onChangeText={setStickyText}
                />
                <Text variant="labelMedium" style={styles.swatchLabel}>
                  Color
                </Text>
                <View style={styles.swatchRow}>
                  {STICKY_COLOR_DEFS.map((def) => {
                    const key = stickyColorKey(def);
                    const displayColor = stickyColorForScheme(def, colorScheme);
                    const selected = stickyColor === key;
                    return (
                      <View
                        key={key}
                        style={[
                          styles.swatchWrap,
                          selected && { borderColor: theme.colors.primary, borderWidth: 2 },
                        ]}
                      >
                        <IconButton
                          accessibilityLabel={def.name}
                          icon={selected ? 'check' : 'circle'}
                          iconColor={selected ? '#1A1A1A' : displayColor}
                          size={20}
                          containerColor={displayColor}
                          onPress={() => setStickyColor(key)}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {item.type === 'checklist' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Title"
                  value={checklistTitle}
                  onChangeText={setChecklistTitle}
                />
                <View style={{ marginTop: 12 }}>
                  {checklistEntries.map((entry) => (
                    <View key={entry.id} style={styles.entryRow}>
                      <Checkbox.Android
                        status={entry.checked ? 'checked' : 'unchecked'}
                        onPress={() => toggleEntry(entry.id)}
                      />
                      <TextInput
                        mode="flat"
                        dense
                        style={styles.entryInput}
                        value={entry.text}
                        onChangeText={(t) => updateEntryText(entry.id, t)}
                      />
                      <IconButton
                        icon="close"
                        size={18}
                        onPress={() => removeEntry(entry.id)}
                        accessibilityLabel="Remove item"
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.addRow}>
                  <TextInput
                    mode="outlined"
                    dense
                    label="Add item"
                    value={newEntryText}
                    onChangeText={setNewEntryText}
                    onSubmitEditing={addChecklistEntry}
                    returnKeyType="done"
                    style={{ flex: 1 }}
                  />
                  <IconButton
                    icon="plus"
                    mode="contained-tonal"
                    onPress={addChecklistEntry}
                    disabled={!newEntryText.trim()}
                    accessibilityLabel="Add"
                  />
                </View>
              </View>
            )}

            {item.type === 'photo' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Image URL"
                  autoCapitalize="none"
                  autoCorrect={false}
                  value={photoUrl}
                  onChangeText={setPhotoUrl}
                />
                <Text variant="bodySmall" style={styles.helper}>
                  Paste an image URL. Camera/library capture coming soon.
                </Text>
                <TextInput
                  mode="outlined"
                  label="Caption"
                  value={photoCaption}
                  onChangeText={setPhotoCaption}
                  style={{ marginTop: 8 }}
                />
              </View>
            )}

            {item.type === 'contact' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Search contacts"
                  value={contactSearch}
                  onChangeText={setContactSearch}
                  autoCapitalize="words"
                />
                <View style={styles.pickerList}>
                  {filteredContacts.length === 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, padding: 8 }}>
                      No contacts match. Try a different search.
                    </Text>
                  )}
                  {filteredContacts.map((c) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed';
                    const selected = c.id === contactId;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setContactId(c.id)}
                        style={({ pressed }) => [
                          styles.pickerRow,
                          {
                            backgroundColor: selected
                              ? theme.colors.primaryContainer
                              : pressed
                                ? theme.colors.surfaceVariant
                                : 'transparent',
                          },
                        ]}
                      >
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                          {name}
                        </Text>
                        {!!c.address && (
                          <Text
                            variant="bodySmall"
                            numberOfLines={1}
                            style={{ color: theme.colors.onSurfaceVariant }}
                          >
                            {c.address}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {item.type === 'property' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Search properties"
                  value={propertySearch}
                  onChangeText={setPropertySearch}
                />
                <View style={styles.pickerList}>
                  {filteredProperties.length === 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, padding: 8 }}>
                      No properties match. Try a different search.
                    </Text>
                  )}
                  {filteredProperties.map((p) => {
                    const selected = p.id === propertyId;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setPropertyId(p.id)}
                        style={({ pressed }) => [
                          styles.pickerRow,
                          {
                            backgroundColor: selected
                              ? theme.colors.primaryContainer
                              : pressed
                                ? theme.colors.surfaceVariant
                                : 'transparent',
                          },
                        ]}
                      >
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                          {p.address}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          {p.suburb}{p.state ? `, ${p.state}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {item.type === 'goal' && (
              <View>
                <Text variant="labelMedium" style={styles.swatchLabel}>Metric</Text>
                <View style={styles.chipRow}>
                  {GOAL_METRICS.map((m) => (
                    <Chip
                      key={m.value}
                      icon={m.icon}
                      selected={goalMetric === m.value}
                      onPress={() => setGoalMetric(m.value)}
                      compact
                    >
                      {m.label}
                    </Chip>
                  ))}
                </View>
                <TextInput
                  mode="outlined"
                  label={`Target${goalMetric === 'commission' ? ' ($)' : ''}`}
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  keyboardType="numeric"
                  style={{ marginTop: 12 }}
                />
                <Text variant="labelMedium" style={styles.swatchLabel}>Period</Text>
                <View style={styles.chipRow}>
                  {GOAL_PERIODS.map((p) => (
                    <Chip
                      key={p.value}
                      selected={goalPeriod === p.value}
                      onPress={() => setGoalPeriod(p.value)}
                      compact
                    >
                      {p.label}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            {item.type === 'map' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Latitude"
                  value={mapLat}
                  onChangeText={setMapLat}
                  keyboardType="numbers-and-punctuation"
                />
                <TextInput
                  mode="outlined"
                  label="Longitude"
                  value={mapLng}
                  onChangeText={setMapLng}
                  keyboardType="numbers-and-punctuation"
                  style={{ marginTop: 8 }}
                />
                <TextInput
                  mode="outlined"
                  label="Zoom"
                  value={mapZoom}
                  onChangeText={setMapZoom}
                  keyboardType="number-pad"
                  style={{ marginTop: 8 }}
                />
                <Text variant="bodySmall" style={styles.helper}>
                  Tip: long-press the territory map to copy a pin's coordinates.
                </Text>
              </View>
            )}
          </ScrollView>
        </Dialog.ScrollArea>

        {/* Dialog.Actions: NO fragment wrappers — Paper crashes on them. */}
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button mode="contained" onPress={handleSave}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '88%',
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  body: {
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  swatchLabel: {
    marginTop: 12,
    marginBottom: 6,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  swatchWrap: {
    borderRadius: 999,
    borderColor: 'transparent',
    borderWidth: 2,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryInput: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  pickerList: {
    marginTop: 8,
    maxHeight: 280,
  },
  pickerRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  helper: {
    marginTop: 4,
    marginBottom: 8,
    opacity: 0.7,
  },
});
