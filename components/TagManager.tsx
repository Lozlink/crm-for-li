import { useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import {
  Text,
  Surface,
  Button,
  TextInput,
  Portal,
  Dialog,
  IconButton,
  useTheme,
} from 'react-native-paper';
import { useCRMStore } from '../lib/store';
import { TAG_COLORS, Tag } from '../lib/types';

export default function TagManager() {
  const theme = useTheme();
  const tags = useCRMStore(state => state.tags);
  const addTag = useCRMStore(state => state.addTag);
  const updateTag = useCRMStore(state => state.updateTag);
  const deleteTag = useCRMStore(state => state.deleteTag);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(TAG_COLORS[0]);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const openCreateDialog = () => {
    setEditingTag(null);
    setTagName('');
    setTagColor(TAG_COLORS[0]);
    setDialogVisible(true);
  };

  const openEditDialog = (tag: Tag) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setDialogVisible(true);
  };

  const handleSave = async () => {
    if (!tagName.trim()) return;

    if (editingTag) {
      await updateTag(editingTag.id, { name: tagName.trim(), color: tagColor });
    } else {
      await addTag({ name: tagName.trim(), color: tagColor });
    }

    setDialogVisible(false);
    setTagName('');
    setTagColor(TAG_COLORS[0]);
    setEditingTag(null);
  };

  const handleDelete = async () => {
    if (deleteConfirmId) {
      await deleteTag(deleteConfirmId);
      setDeleteConfirmId(null);
    }
  };

  return (
    <Surface style={styles.container} elevation={1}>
      <View style={styles.header}>
        <Text variant="titleMedium">Tags</Text>
        <Button mode="contained-tonal" icon="plus" onPress={openCreateDialog} compact>
          Add
        </Button>
      </View>

      {tags.length === 0 ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          No tags yet. Create one to organize your contacts.
        </Text>
      ) : (
        <View style={styles.tagList}>
          {tags.map(tag => (
            <View key={tag.id} style={styles.tagRow}>
              <View style={[styles.colorDot, { backgroundColor: tag.color }]} />
              <Text variant="bodyMedium" style={styles.tagName}>{tag.name}</Text>
              <IconButton
                icon="pencil"
                size={18}
                onPress={() => openEditDialog(tag)}
              />
              <IconButton
                icon="delete"
                size={18}
                onPress={() => setDeleteConfirmId(tag.id)}
              />
            </View>
          ))}
        </View>
      )}

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>{editingTag ? 'Edit Tag' : 'New Tag'}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Tag Name"
              value={tagName}
              onChangeText={setTagName}
              mode="outlined"
              style={styles.input}
            />

            <Text variant="labelLarge" style={styles.colorLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {TAG_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setTagColor(color)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      tagColor === color && styles.colorSelected,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.preview}>
              <Text variant="labelMedium" style={{ marginRight: 8 }}>Preview:</Text>
              <View style={[styles.previewTag, { backgroundColor: tagColor }]}>
                <Text style={{ color: '#fff' }}>{tagName || 'Tag Name'}</Text>
              </View>
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleSave} disabled={!tagName.trim()}>Save</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={!!deleteConfirmId} onDismiss={() => setDeleteConfirmId(null)}>
          <Dialog.Title>Delete Tag</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to delete this tag? Contacts with this tag will become untagged.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteConfirmId(null)}>Cancel</Button>
            <Button onPress={handleDelete} textColor={theme.colors.error}>Delete</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  tagList: {
    gap: 4,
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  tagName: {
    flex: 1,
  },
  input: {
    marginBottom: 16,
  },
  colorLabel: {
    marginBottom: 8,
  },
  colorGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  colorSelected: {
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewTag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
});
