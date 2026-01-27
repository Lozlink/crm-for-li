import { useMemo } from 'react';
import { StyleSheet, View, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import ContactForm from '../../components/ContactForm';
import { ContactFormData } from '../../lib/types';
import { useCRMStore } from '../../lib/store';

export default function NewContactScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; address?: string }>();
  const addContact = useCRMStore(state => state.addContact);
  const addActivity = useCRMStore(state => state.addActivity);
  const isLoading = useCRMStore(state => state.isLoading);

  // Check if coming from map (has coordinates)
  const isFromMap = !!(params.lat && params.lng);

  // Pre-fill form if coming from map long-press
  const initialData = useMemo<ContactFormData | undefined>(() => {
    if (isFromMap) {
      return {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        address: params.address || '',
        latitude: parseFloat(params.lat!),
        longitude: parseFloat(params.lng!),
        tag_id: undefined,
        initial_note: '',
      };
    }
    return undefined;
  }, [isFromMap, params.lat, params.lng, params.address]);

  const handleSubmit = async (data: ContactFormData) => {
    const { initial_note, ...contactData } = data;
    const contact = await addContact(contactData);
    
    if (contact) {
      // Create initial note activity if provided
      if (initial_note?.trim()) {
        await addActivity({
          contact_id: contact.id,
          type: 'note',
          content: initial_note.trim(),
        });
      }
      router.back();
    }
  };

  const handleCancel = () => {
    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ContactForm
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          isLoading={isLoading}
          showNotes={isFromMap}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
});
