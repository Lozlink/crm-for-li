import { useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Dialog, Text, TextInput, Button, useTheme, Surface } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '@realestate-crm/hooks';
import { ACTIVITY_TYPES, Activity } from '@realestate-crm/types';

interface AddActivityDialogProps {
  visible: boolean;
  onDismiss: () => void;
  contactId: string;
}

export default function AddActivityDialog({
  visible,
  onDismiss,
  contactId,
}: AddActivityDialogProps) {
  const theme = useTheme();
  const addActivity = useCRMStore(state => state.addActivity);

  const [type, setType] = useState<Activity['type']>('note');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;

    setIsSubmitting(true);
    await addActivity({
      contact_id: contactId,
      type,
      content: content.trim(),
    });
    setIsSubmitting(false);

    // Reset form
    setType('note');
    setContent('');
    onDismiss();
  };

  const handleCancel = () => {
    setType('note');
    setContent('');
    onDismiss();
  };

  return (
    <Dialog visible={visible} onDismiss={handleCancel}>
      <Dialog.Title>Add Activity</Dialog.Title>
      <Dialog.Content>
        <Text variant="labelLarge" style={styles.label}>Type</Text>
        <View style={styles.typeGrid}>
          {ACTIVITY_TYPES.map(activityType => {
            const isSelected = type === activityType.value;
            return (
              <TouchableOpacity
                key={activityType.value}
                onPress={() => setType(activityType.value as Activity['type'])}
                activeOpacity={0.7}
              >
                <Surface
                  style={[
                    styles.typeItem,
                    isSelected && { backgroundColor: theme.colors.primaryContainer },
                  ]}
                  elevation={isSelected ? 1 : 0}
                >
                  <Icon
                    name={activityType.icon}
                    size={24}
                    color={isSelected ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant}
                  />
                  <Text
                    variant="labelSmall"
                    style={{
                      color: isSelected ? theme.colors.onPrimaryContainer : theme.colors.onSurfaceVariant,
                    }}
                  >
                    {activityType.label}
                  </Text>
                </Surface>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          label="Details"
          value={content}
          onChangeText={setContent}
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.input}
          placeholder={`Add ${type} details...`}
        />
      </Dialog.Content>
      <Dialog.Actions>
        <Button onPress={handleCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          onPress={handleSubmit}
          disabled={!content.trim() || isSubmitting}
          loading={isSubmitting}
        >
          Save
        </Button>
      </Dialog.Actions>
    </Dialog>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 8,
  },
  typeGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  typeItem: {
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    minWidth: 64,
  },
  input: {
    marginTop: 8,
  },
});
