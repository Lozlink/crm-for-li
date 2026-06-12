import { StyleSheet, View } from 'react-native';
import { Modal, Text, Button, useTheme, Surface, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Contact } from '@realestate-crm/types';
import { useBottomSheetPadding } from '@realestate-crm/ui';

interface ContactPreviewProps {
  contact: Contact | null;
  visible: boolean;
  onDismiss: () => void;
  onViewDetails: () => void;
}

export default function ContactPreview({
  contact,
  visible,
  onDismiss,
  onViewDetails,
}: ContactPreviewProps) {
  const theme = useTheme();
  // Bottom-anchored sheet: clear the Android nav bar / home indicator. Keep the
  // prior 100px gap as the floor so non-inset platforms are unchanged.
  const bottomGap = useBottomSheetPadding(100);

  if (!contact) return null;

  const fullName = `${contact.first_name} ${contact.last_name || ''}`.trim();

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={[
        styles.container,
        { backgroundColor: theme.colors.surface, marginBottom: bottomGap },
      ]}
    >
      <Surface style={styles.card} elevation={0}>
        {contact.tag && (
          <Chip
            style={[styles.tagChip, { backgroundColor: contact.tag.color }]}
            textStyle={{ color: '#fff' }}
            compact
          >
            {contact.tag.name}
          </Chip>
        )}

        <Text variant="titleLarge" style={styles.name}>{fullName}</Text>

        {contact.email && (
          <View style={styles.infoRow}>
            <Icon name="email-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyMedium" style={styles.infoText}>{contact.email}</Text>
          </View>
        )}

        {contact.phone && (
          <View style={styles.infoRow}>
            <Icon name="phone-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyMedium" style={styles.infoText}>{contact.phone}</Text>
          </View>
        )}

        {contact.address && (
          <View style={styles.infoRow}>
            <Icon name="map-marker-outline" size={18} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyMedium" style={styles.infoText} numberOfLines={2}>
              {contact.address}
            </Text>
          </View>
        )}

        <View style={styles.actions}>
          <Button mode="outlined" onPress={onDismiss} style={styles.button}>
            Close
          </Button>
          <Button mode="contained" onPress={onViewDetails} style={styles.button}>
            View Details
          </Button>
        </View>
      </Surface>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    margin: 20,
    marginTop: 'auto',
    // marginBottom is set inline (insets-aware) — see useBottomSheetPadding.
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    padding: 20,
  },
  tagChip: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  name: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  infoText: {
    marginLeft: 8,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
  },
});
