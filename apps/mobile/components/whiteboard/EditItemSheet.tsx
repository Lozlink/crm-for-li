import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  IconButton,
  Portal,
  TextInput,
  Text,
  Checkbox,
  useTheme,
} from 'react-native-paper';
import type {
  WhiteboardChecklistContent,
  WhiteboardChecklistEntry,
  WhiteboardItem,
  WhiteboardPhotoContent,
  WhiteboardStickyContent,
} from '@realestate-crm/types';
import { generateUUID } from '@realestate-crm/api';
import { STICKY_COLOR_DEFS, stickyColorKey } from './whiteboardColors';
import { useColorScheme } from 'react-native';
import { stickyColorForScheme } from './whiteboardColors';

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

  const titleByType = {
    sticky: 'Edit quick note',
    checklist: 'Edit to-do',
    photo: 'Edit photo',
  } as const;

  return (
    <Portal>
      <Dialog visible={!!item} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{titleByType[item.type]}</Dialog.Title>

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
  helper: {
    marginTop: 4,
    marginBottom: 8,
    opacity: 0.7,
  },
});
