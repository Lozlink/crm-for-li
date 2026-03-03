import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Dialog, Text, TextInput, Button, useTheme, Portal } from 'react-native-paper';
import * as Location from 'expo-location';
import { useTrackingStore } from '@realestate-crm/hooks';

interface DropNoteDialogProps {
  visible: boolean;
  onDismiss: () => void;
  sessionId: string;
}

export default function DropNoteDialog({
  visible,
  onDismiss,
  sessionId,
}: DropNoteDialogProps) {
  const theme = useTheme();
  const createAnnotation = useTrackingStore(state => state.createAnnotation);

  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCancel = () => {
    setNoteText('');
    onDismiss();
  };

  const handleSave = async () => {
    if (!noteText.trim()) return;

    setSaving(true);
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      await createAnnotation({
        session_id: sessionId,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        note: noteText.trim(),
      });

      setNoteText('');
      onDismiss();
    } catch (error) {
      console.error('Error dropping note:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleCancel}>
        <Dialog.Title>Drop Note</Dialog.Title>
        <Dialog.Content>
          <Text
            variant="bodySmall"
            style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
          >
            Pin a note at your current location.
          </Text>
          <TextInput
            mode="outlined"
            label="Note"
            placeholder="What did you observe here?"
            value={noteText}
            onChangeText={setNoteText}
            multiline
            numberOfLines={3}
            autoFocus
            style={styles.input}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleCancel} disabled={saving}>
            Cancel
          </Button>
          <Button
            mode="contained"
            buttonColor="#F59E0B"
            textColor="#FFFFFF"
            onPress={handleSave}
            loading={saving}
            disabled={!noteText.trim() || saving}
          >
            Save
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  hint: {
    marginBottom: 12,
  },
  input: {
    maxHeight: 120,
  },
});
