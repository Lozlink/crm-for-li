import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { Text, useTheme, Surface, Portal, Dialog, TextInput, Button, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '@realestate-crm/hooks';
import { TAG_COLORS } from '@realestate-crm/types';

interface TagPickerProps {
  /** @deprecated Use selectedTagIds for multi-tag support */
  selectedTagId?: string;
  /** @deprecated Use onTagsChange for multi-tag support */
  onTagSelect?: (tagId?: string) => void;
  selectedTagIds?: string[];
  onTagsChange?: (tagIds: string[]) => void;
  style?: object;
}

export default function TagPicker({
  selectedTagId,
  onTagSelect,
  selectedTagIds: selectedTagIdsProp,
  onTagsChange,
  style,
}: TagPickerProps) {
  const theme = useTheme();
  const tags = useCRMStore(state => state.tags);
  const addTag = useCRMStore(state => state.addTag);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  // Support both single and multi-select modes
  const isMultiMode = onTagsChange !== undefined;
  const selectedIds: string[] = isMultiMode
    ? (selectedTagIdsProp || [])
    : selectedTagId ? [selectedTagId] : [];

  const handleToggleTag = (tagId: string) => {
    if (isMultiMode) {
      const newIds = selectedIds.includes(tagId)
        ? selectedIds.filter(id => id !== tagId)
        : [...selectedIds, tagId];
      onTagsChange!(newIds);
    } else {
      // Single mode: toggle off if already selected
      onTagSelect?.(selectedTagId === tagId ? undefined : tagId);
    }
  };

  const handleClearAll = () => {
    if (isMultiMode) {
      onTagsChange!([]);
    } else {
      onTagSelect?.(undefined);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const tag = await addTag({ name: newTagName.trim(), color: newTagColor });
    if (tag) {
      if (isMultiMode) {
        onTagsChange!([...selectedIds, tag.id]);
      } else {
        onTagSelect?.(tag.id);
      }
    }
    setDialogVisible(false);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0]);
  };

  return (
    <View style={[styles.container, style]}>
      <Text variant="labelLarge" style={styles.label}>
        {isMultiMode ? 'Tags' : 'Tag'}
      </Text>

      {/* Show selected tags as chips in multi-mode */}
      {isMultiMode && selectedIds.length > 0 && (
        <View style={styles.selectedChips}>
          {selectedIds.map(id => {
            const tag = tags.find(t => t.id === id);
            if (!tag) return null;
            return (
              <Chip
                key={tag.id}
                mode="flat"
                compact
                onClose={() => handleToggleTag(tag.id)}
                style={[styles.selectedChip, { backgroundColor: tag.color }]}
                textStyle={{ color: '#fff', fontSize: 12 }}
                closeIconAccessibilityLabel={`Remove ${tag.name}`}
              >
                {tag.name}
              </Chip>
            );
          })}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {selectedIds.length > 0 && (
          <TouchableOpacity
            onPress={handleClearAll}
            activeOpacity={0.7}
          >
            <Surface
              style={[
                styles.tagItem,
                { borderColor: theme.colors.outline },
              ]}
              elevation={0}
            >
              <Text
                variant="labelMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                None
              </Text>
            </Surface>
          </TouchableOpacity>
        )}

        {tags.map(tag => {
          const isSelected = selectedIds.includes(tag.id);
          return (
            <TouchableOpacity
              key={tag.id}
              onPress={() => handleToggleTag(tag.id)}
              activeOpacity={0.7}
            >
              <Surface
                style={[
                  styles.tagItem,
                  { backgroundColor: isSelected ? tag.color : 'transparent' },
                  { borderColor: tag.color },
                ]}
                elevation={0}
              >
                {isSelected && (
                  <Icon name="check" size={14} color="#fff" style={styles.checkIcon} />
                )}
                <Text
                  variant="labelMedium"
                  style={{ color: isSelected ? '#fff' : tag.color }}
                >
                  {tag.name}
                </Text>
              </Surface>
            </TouchableOpacity>
          );
        })}

        {/* Quick add tag button */}
        <TouchableOpacity
          onPress={() => setDialogVisible(true)}
          activeOpacity={0.7}
        >
          <Surface
            style={[
              styles.tagItem,
              styles.addTagButton,
              { borderColor: theme.colors.primary, borderStyle: 'dashed' },
            ]}
            elevation={0}
          >
            <Icon name="plus" size={16} color={theme.colors.primary} />
            <Text
              variant="labelMedium"
              style={{ color: theme.colors.primary, marginLeft: 4 }}
            >
              New
            </Text>
          </Surface>
        </TouchableOpacity>
      </ScrollView>

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={() => setDialogVisible(false)}>
          <Dialog.Title>Quick Add Tag</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Tag Name"
              value={newTagName}
              onChangeText={setNewTagName}
              mode="outlined"
              style={styles.input}
              autoFocus
            />

            <Text variant="labelMedium" style={styles.colorLabel}>Color</Text>
            <View style={styles.colorGrid}>
              {TAG_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => setNewTagColor(color)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      newTagColor === color && styles.colorSelected,
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleCreateTag} disabled={!newTagName.trim()}>
              Create
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  label: {
    marginBottom: 8,
  },
  selectedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  selectedChip: {
    marginRight: 0,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
  },
  tagSelected: {
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  checkIcon: {
    marginRight: 4,
  },
  addTagButton: {
    borderStyle: 'dashed',
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
  },
  colorOption: {
    width: 32,
    height: 32,
    borderRadius: 16,
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
});
