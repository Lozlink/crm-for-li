import { StyleSheet, View, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Modal, Text, Button, useTheme, Surface, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '../lib/store';

const { height } = Dimensions.get('window');

interface FilterSheetProps {
  visible: boolean;
  onDismiss: () => void;
}

export default function FilterSheet({ visible, onDismiss }: FilterSheetProps) {
  const theme = useTheme();
  const tags = useCRMStore(state => state.tags);
  const selectedTagIds = useCRMStore(state => state.selectedTagIds);
  const setSelectedTagIds = useCRMStore(state => state.setSelectedTagIds);
  const contacts = useCRMStore(state => state.contacts);

  const toggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      setSelectedTagIds(selectedTagIds.filter(id => id !== tagId));
    } else {
      setSelectedTagIds([...selectedTagIds, tagId]);
    }
  };

  const clearFilters = () => {
    setSelectedTagIds([]);
  };

  const getContactCount = (tagId: string) => {
    return contacts.filter(c => c.tag_id === tagId && c.latitude && c.longitude).length;
  };

  const totalMappedContacts = contacts.filter(c => c.latitude && c.longitude).length;
  const filteredCount = selectedTagIds.length > 0
    ? contacts.filter(c => selectedTagIds.includes(c.tag_id || '') && c.latitude && c.longitude).length
    : totalMappedContacts;

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={[styles.container, { backgroundColor: theme.colors.surface }]}
    >
      <View style={styles.header}>
        <Text variant="titleLarge">Filter Map</Text>
        <TouchableOpacity onPress={onDismiss}>
          <Icon name="close" size={24} color={theme.colors.onSurface} />
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          Showing {filteredCount} of {totalMappedContacts} mapped contacts
        </Text>
      </View>

      <Text variant="titleMedium" style={styles.sectionTitle}>By Tag</Text>

      {tags.length === 0 ? (
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          No tags available. Create tags in Settings to filter contacts.
        </Text>
      ) : (
        <ScrollView style={styles.tagList} showsVerticalScrollIndicator={false}>
          {tags.map(tag => {
            const isSelected = selectedTagIds.includes(tag.id);
            const count = getContactCount(tag.id);

            return (
              <TouchableOpacity
                key={tag.id}
                onPress={() => toggleTag(tag.id)}
                activeOpacity={0.7}
              >
                <Surface
                  style={[
                    styles.tagItem,
                    isSelected && { backgroundColor: tag.color + '20' },
                  ]}
                  elevation={0}
                >
                  <View style={[styles.colorDot, { backgroundColor: tag.color }]} />
                  <Text variant="bodyLarge" style={styles.tagName}>{tag.name}</Text>
                  <Text
                    variant="bodySmall"
                    style={[styles.count, { color: theme.colors.onSurfaceVariant }]}
                  >
                    {count}
                  </Text>
                  {isSelected && (
                    <Icon name="check" size={20} color={tag.color} />
                  )}
                </Surface>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.actions}>
        {selectedTagIds.length > 0 && (
          <Button mode="outlined" onPress={clearFilters} style={styles.clearButton}>
            Clear Filters
          </Button>
        )}
        <Button mode="contained" onPress={onDismiss} style={styles.doneButton}>
          Done
        </Button>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 20,
    marginTop: height * 0.2,
    padding: 20,
    borderRadius: 16,
    maxHeight: height * 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statsRow: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    marginBottom: 12,
  },
  tagList: {
    maxHeight: height * 0.3,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  colorDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  tagName: {
    flex: 1,
  },
  count: {
    marginRight: 8,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  clearButton: {
    flex: 1,
  },
  doneButton: {
    flex: 1,
  },
});
