import { useState, useEffect } from 'react';
import { StyleSheet, View, Alert } from 'react-native';
import { TextInput, Button, HelperText, useTheme } from 'react-native-paper';
import * as Contacts from 'expo-contacts';
import { ContactFormData } from '../lib/types';
import TagPicker from './TagPicker';
import AddressAutocomplete from './AddressAutocomplete';

interface ContactFormProps {
  initialData?: ContactFormData;
  onSubmit: (data: ContactFormData) => void;
  onCancel: () => void;
  isLoading?: boolean;
  submitLabel?: string;
  showNotes?: boolean;
  minimalMode?: boolean; // For quick notes - only show address + notes
}

export default function ContactForm({
  initialData,
  onSubmit,
  onCancel,
  isLoading = false,
  submitLabel = 'Save',
  showNotes = false,
  minimalMode = false,
}: ContactFormProps) {
  const theme = useTheme();

  const [formData, setFormData] = useState<ContactFormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    address: '',
    latitude: undefined,
    longitude: undefined,
    tag_id: undefined,
    initial_note: '',
  });

  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const updateField = <K extends keyof ContactFormData>(key: K, value: ContactFormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (errors[key]) {
      setErrors(prev => ({ ...prev, [key]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof ContactFormData, string>> = {};

    // In minimal mode, we don't require first_name - address is enough
    if (!minimalMode && !formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }

    // In minimal mode, require either address or a note
    if (minimalMode && !formData.address?.trim() && !formData.initial_note?.trim()) {
      newErrors.address = 'Address or note is required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (validate()) {
      onSubmit(formData);
    }
  };

  const handleAddressSelect = (address: string, lat: number, lng: number) => {
    setFormData(prev => ({
      ...prev,
      address,
      latitude: lat,
      longitude: lng,
    }));
  };

  const handleImportContact = async () => {
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please allow contact access to use this feature.');
        return;
      }

      const contact = await Contacts.presentContactPickerAsync();
      
      if (contact) {
        setFormData(prev => ({
          ...prev,
          first_name: contact.firstName || '',
          last_name: contact.lastName || '',
          email: contact.emails?.[0]?.email || '',
          phone: contact.phoneNumbers?.[0]?.number || '',
        }));
      }
    } catch (error) {
      console.error('Error importing contact:', error);
      Alert.alert('Error', 'Failed to import contact.');
    }
  };

  return (
    <View style={styles.container}>
      {!minimalMode && (
        <Button 
          mode="outlined" 
          onPress={handleImportContact} 
          icon="account-import"
          style={styles.importButton}
        >
          Import from Contacts
        </Button>
      )}

      {/* Show address first in minimal mode, and always show notes */}
      {minimalMode && (
        <>
          <AddressAutocomplete
            value={formData.address}
            onAddressSelect={handleAddressSelect}
            style={styles.input}
          />
          {errors.address && (
            <HelperText type="error">{errors.address}</HelperText>
          )}
          {formData.latitude && formData.longitude && (
            <HelperText type="info" style={styles.coordsHelper}>
              Coordinates: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
            </HelperText>
          )}

          <TextInput
            label="Notes *"
            value={formData.initial_note || ''}
            onChangeText={(v) => updateField('initial_note', v)}
            mode="outlined"
            multiline
            numberOfLines={4}
            placeholder="e.g., For sale sign, owner interested, nice yard..."
            style={styles.notesInput}
          />

          <TagPicker
            selectedTagId={formData.tag_id}
            onTagSelect={(tagId) => updateField('tag_id', tagId)}
            style={styles.tagPicker}
          />
        </>
      )}

      {/* Full form for regular contact creation */}
      {!minimalMode && (
        <>
          <TextInput
            label="First Name *"
            value={formData.first_name}
            onChangeText={(v) => updateField('first_name', v)}
            mode="outlined"
            error={!!errors.first_name}
            style={styles.input}
          />
          {errors.first_name && (
            <HelperText type="error">{errors.first_name}</HelperText>
          )}

          <TextInput
            label="Last Name"
            value={formData.last_name}
            onChangeText={(v) => updateField('last_name', v)}
            mode="outlined"
            style={styles.input}
          />

          <TextInput
            label="Email"
            value={formData.email}
            onChangeText={(v) => updateField('email', v)}
            mode="outlined"
            keyboardType="email-address"
            autoCapitalize="none"
            error={!!errors.email}
            style={styles.input}
          />
          {errors.email && (
            <HelperText type="error">{errors.email}</HelperText>
          )}

          <TextInput
            label="Phone"
            value={formData.phone}
            onChangeText={(v) => updateField('phone', v)}
            mode="outlined"
            keyboardType="phone-pad"
            style={styles.input}
          />

          <AddressAutocomplete
            value={formData.address}
            onAddressSelect={handleAddressSelect}
            style={styles.input}
          />

          {formData.latitude && formData.longitude && (
            <HelperText type="info" style={styles.coordsHelper}>
              Coordinates: {formData.latitude.toFixed(6)}, {formData.longitude.toFixed(6)}
            </HelperText>
          )}

          <TagPicker
            selectedTagId={formData.tag_id}
            onTagSelect={(tagId) => updateField('tag_id', tagId)}
            style={styles.tagPicker}
          />

          {showNotes && (
            <TextInput
              label="Notes"
              value={formData.initial_note || ''}
              onChangeText={(v) => updateField('initial_note', v)}
              mode="outlined"
              multiline
              numberOfLines={3}
              placeholder="e.g., For sale sign, owner interested, nice yard..."
              style={styles.notesInput}
            />
          )}
        </>
      )}

      <View style={styles.buttonRow}>
        <Button
          mode="outlined"
          onPress={onCancel}
          style={styles.button}
          disabled={isLoading}
        >
          Cancel
        </Button>
        <Button
          mode="contained"
          onPress={handleSubmit}
          style={styles.button}
          loading={isLoading}
          disabled={isLoading}
        >
          {submitLabel}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  input: {
    marginBottom: 8,
  },
  importButton: {
    marginBottom: 16,
  },
  coordsHelper: {
    marginTop: -4,
    marginBottom: 8,
  },
  tagPicker: {
    marginTop: 8,
    marginBottom: 16,
  },
  notesInput: {
    marginBottom: 8,
    minHeight: 80,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  button: {
    minWidth: 100,
  },
});
