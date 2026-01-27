import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { Text, useTheme, Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '../lib/store';

interface TagPickerProps {
  selectedTagId?: string;
  onTagSelect: (tagId?: string) => void;
  style?: object;
}

export default function TagPicker({ selectedTagId, onTagSelect, style }: TagPickerProps) {
  const theme = useTheme();
  const tags = useCRMStore(state => state.tags);

  return (
    <View style={[styles.container, style]}>
      <Text variant="labelLarge" style={styles.label}>Tag</Text>

      {tags.length === 0 ? (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          No tags available. Create tags in Settings.
        </Text>
      ) : (
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
        </ScrollView>
      )}
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
});
