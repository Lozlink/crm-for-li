import { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform, Linking, AppState } from 'react-native';
import {
  Text,
  Button,
  useTheme,
  Surface,
  Chip,
  Divider,
  IconButton,
  Menu,
  Portal,
  Dialog,
  ActivityIndicator,
  TextInput,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore } from '@realestate-crm/hooks';
import { Contact, ContactFormData } from '@realestate-crm/types';
import { ContactForm } from '@realestate-crm/ui';
import { ActivityFeed } from '@realestate-crm/ui';
import { AddActivityDialog } from '@realestate-crm/ui';

export default function ContactDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const contacts = useCRMStore(state => state.contacts);
  const updateContact = useCRMStore(state => state.updateContact);
  const deleteContact = useCRMStore(state => state.deleteContact);
  const addActivity = useCRMStore(state => state.addActivity);
  const updateActivity = useCRMStore(state => state.updateActivity);
  const fetchActivities = useCRMStore(state => state.fetchActivities);
  const isLoading = useCRMStore(state => state.isLoading);

  const [contact, setContact] = useState<Contact | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [activityDialogVisible, setActivityDialogVisible] = useState(false);

  // Call tracking state
  const [callNotesVisible, setCallNotesVisible] = useState(false);
  const [callNotes, setCallNotes] = useState('');
  const pendingCallActivityId = useRef<string | null>(null);

  useEffect(() => {
    const found = contacts.find(c => c.id === id);
    setContact(found || null);

    if (id) {
      fetchActivities(id);
    }
  }, [id, contacts]);

  // Listen for app returning to foreground after a call
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && pendingCallActivityId.current) {
        setCallNotesVisible(true);
      }
    });
    return () => sub.remove();
  }, []);

  const handleCall = useCallback(async () => {
    if (!contact?.phone || !id) return;
    const activity = await addActivity({
      contact_id: id,
      type: 'call',
      content: 'Outgoing call',
    });
    if (activity) {
      pendingCallActivityId.current = activity.id;
    }
    Linking.openURL(`tel:${contact.phone}`);
  }, [contact, id, addActivity]);

  const handleSaveCallNotes = useCallback(async () => {
    if (pendingCallActivityId.current && callNotes.trim()) {
      await updateActivity(pendingCallActivityId.current, { content: callNotes.trim() });
      if (id) await fetchActivities(id);
    }
    pendingCallActivityId.current = null;
    setCallNotes('');
    setCallNotesVisible(false);
  }, [callNotes, id, updateActivity, fetchActivities]);

  const handleSkipCallNotes = useCallback(() => {
    pendingCallActivityId.current = null;
    setCallNotes('');
    setCallNotesVisible(false);
  }, []);

  const handleUpdate = async (data: ContactFormData) => {
    if (!id) return;
    await updateContact(id, data);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!id) return;
    await deleteContact(id);
    router.back();
  };

  const confirmDelete = () => {
    setMenuVisible(false);
    setDeleteDialogVisible(true);
  };

  if (!contact) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  const fullName = `${contact.first_name} ${contact.last_name || ''}`.trim();

  return (
    <>
      <Stack.Screen
        options={{
          title: fullName,
          headerRight: () => (
            <Menu
              visible={menuVisible}
              onDismiss={() => setMenuVisible(false)}
              anchor={
                <IconButton
                  icon="dots-vertical"
                  onPress={() => setMenuVisible(true)}
                />
              }
            >
              <Menu.Item
                leadingIcon="pencil"
                onPress={() => {
                  setMenuVisible(false);
                  setIsEditing(true);
                }}
                title="Edit"
              />
              <Menu.Item
                leadingIcon="delete"
                onPress={confirmDelete}
                title="Delete"
              />
            </Menu>
          ),
        }}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {isEditing ? (
            <ContactForm
              initialData={{
                first_name: contact.first_name,
                last_name: contact.last_name || '',
                email: contact.email || '',
                phone: contact.phone || '',
                address: contact.address || '',
                latitude: contact.latitude,
                longitude: contact.longitude,
                tag_id: contact.tag_id,
              }}
              onSubmit={handleUpdate}
              onCancel={() => setIsEditing(false)}
              isLoading={isLoading}
              submitLabel="Update"
            />
          ) : (
            <>
              <Surface style={styles.infoCard} elevation={1}>
                {contact.tag && (
                  <Chip
                    style={[styles.tagChip, { backgroundColor: contact.tag.color }]}
                    textStyle={{ color: '#fff' }}
                  >
                    {contact.tag.name}
                  </Chip>
                )}

                <Text variant="headlineSmall" style={styles.name}>{fullName}</Text>

                {contact.email && (
                  <View style={styles.infoRow}>
                    <Icon name="email" size={20} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyLarge" style={styles.infoText}>{contact.email}</Text>
                  </View>
                )}

                {contact.phone && (
                  <View style={styles.infoRow}>
                    <Icon name="phone" size={20} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyLarge" style={styles.infoText}>{contact.phone}</Text>
                  </View>
                )}

                {contact.address && (
                  <View style={styles.infoRow}>
                    <Icon name="map-marker" size={20} color={theme.colors.onSurfaceVariant} />
                    <Text variant="bodyLarge" style={styles.infoText}>{contact.address}</Text>
                  </View>
                )}

                {contact.latitude && contact.longitude && (
                  <View style={styles.coordinatesRow}>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {contact.latitude.toFixed(6)}, {contact.longitude.toFixed(6)}
                    </Text>
                  </View>
                )}
              </Surface>

              {contact.phone && (
                <Button
                  mode="contained"
                  icon="phone"
                  onPress={handleCall}
                  buttonColor="#16a34a"
                  textColor="#fff"
                  style={styles.callButton}
                >
                  Call {contact.first_name}
                </Button>
              )}

              <Divider style={styles.divider} />

              <View style={styles.activityHeader}>
                <Text variant="titleMedium">Activity</Text>
                <Button
                  mode="contained-tonal"
                  icon="plus"
                  onPress={() => setActivityDialogVisible(true)}
                  compact
                >
                  Add
                </Button>
              </View>

              <ActivityFeed contactId={id!} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Delete Contact</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to delete {fullName}? This action cannot be undone.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Cancel</Button>
            <Button onPress={handleDelete} textColor={theme.colors.error}>Delete</Button>
          </Dialog.Actions>
        </Dialog>

        <AddActivityDialog
          visible={activityDialogVisible}
          onDismiss={() => setActivityDialogVisible(false)}
          contactId={id!}
        />

        <Dialog visible={callNotesVisible} onDismiss={handleSkipCallNotes}>
          <Dialog.Title>How did the call go?</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              placeholder="Add call notes..."
              value={callNotes}
              onChangeText={setCallNotes}
              multiline
              numberOfLines={4}
              style={styles.callNotesInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleSkipCallNotes}>Skip</Button>
            <Button onPress={handleSaveCallNotes} mode="contained">Save</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
  },
  tagChip: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  name: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  coordinatesRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  callButton: {
    marginTop: 16,
    borderRadius: 8,
  },
  callNotesInput: {
    minHeight: 80,
  },
  divider: {
    marginVertical: 16,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
});
