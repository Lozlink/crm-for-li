import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { Text, useTheme, Surface, Portal, Dialog, TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '@realestate-crm/hooks';
import { TAG_COLORS } from '@realestate-crm/types';

interface TagPickerProps {
  selectedTagId?: string;
  onTagSelect: (tagId?: string) => void;
  style?: object;
}

export default function TagPicker({ selectedTagId, onTagSelect, style }: TagPickerProps) {
  const theme = useTheme();
  const tags = useCRMStore(state => state.tags);
  const addTag = useCRMStore(state => state.addTag);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    const tag = await addTag({ name: newTagName.trim(), color: newTagColor });
    if (tag) {
      onTagSelect(tag.id); // Auto-select the new tag
    }
    setDialogVisible(false);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0]);
  };

  return (
    <View style={[styles.container, style]}>
      <Text variant="labelLarge" style={styles.label}>Tag</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          onPress={() => onTagSelect(undefined)}
          activeOpacity={0.7}
        >
          <Surface
            style={[
              styles.tagItem,
              !selectedTagId && styles.tagSelected,
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

        {tags.map(tag => {
          const isSelected = selectedTagId === tag.id;
          return (
            <TouchableOpacity
              key={tag.id}
              onPress={() => onTagSelect(tag.id)}
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
