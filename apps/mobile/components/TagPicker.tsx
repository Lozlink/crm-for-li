import { useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { Text, useTheme, Surface, Portal, Dialog, TextInput, Button } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '../lib/store';
import { TAG_COLORS } from '@realestate-crm/types';

interface TagPickerSingleProps {
  selectedTagId?: string;
  onTagSelect: (tagId?: string) => void;
  multiSelect?: false;
  selectedTagIds?: never;
  onTagsChange?: never;
  style?: object;
}

interface TagPickerMultiProps {
  multiSelect: true;
  selectedTagIds: string[];
  onTagsChange: (tagIds: string[]) => void;
  selectedTagId?: never;
  onTagSelect?: never;
  style?: object;
}

type TagPickerProps = TagPickerSingleProps | TagPickerMultiProps;

export default function TagPicker(props: TagPickerProps) {
  const { style } = props;
  const isMulti = props.multiSelect === true;

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
      if (isMulti) {
        props.onTagsChange([...props.selectedTagIds, tag.id]);
      } else {
        props.onTagSelect(tag.id);
      }
    }
    setDialogVisible(false);
    setNewTagName('');
    setNewTagColor(TAG_COLORS[0]);
  };

  const handleTagPress = (tagId: string) => {
    if (isMulti) {
      const current = props.selectedTagIds;
      if (current.includes(tagId)) {
        props.onTagsChange(current.filter(id => id !== tagId));
      } else {
        props.onTagsChange([...current, tagId]);
      }
    } else {
      props.onTagSelect(tagId);
    }
  };

  const handleClear = () => {
    if (isMulti) {
      props.onTagsChange([]);
    } else {
      props.onTagSelect(undefined);
    }
  };

  const isTagSelected = (tagId: string): boolean => {
    if (isMulti) return props.selectedTagIds.includes(tagId);
    return props.selectedTagId === tagId;
  };

  const hasNoSelection = isMulti
    ? props.selectedTagIds.length === 0
    : !props.selectedTagId;

  return (
    <View style={[styles.container, style]}>
      <Text variant="labelLarge" style={styles.label}>
        {isMulti ? 'Tags' : 'Tag'}
      </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <TouchableOpacity
          onPress={handleClear}
          activeOpacity={0.7}
        >
          <Surface
            style={[
              styles.tagItem,
              hasNoSelection && styles.tagSelected,
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
          const isSelected = isTagSelected(tag.id);
          return (
            <TouchableOpacity
              key={tag.id}
              onPress={() => handleTagPress(tag.id)}
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
