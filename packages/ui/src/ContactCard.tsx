import { memo } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, Surface, useTheme, Avatar } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { Contact } from '@realestate-crm/types';

interface ContactCardProps {
  contact: Contact;
  onPress: (contact: Contact) => void;
}

function ContactCard({ contact, onPress }: ContactCardProps) {
  const theme = useTheme();
  const fullName = `${contact.first_name} ${contact.last_name || ''}`.trim();
  const initials = `${contact.first_name[0]}${contact.last_name?.[0] || ''}`.toUpperCase();

  return (
    <TouchableOpacity onPress={() => onPress(contact)} activeOpacity={0.7}>
      <Surface style={styles.card} elevation={1}>
        <Avatar.Text
          size={48}
          label={initials}
          style={[
            styles.avatar,
            { backgroundColor: contact.tag?.color || theme.colors.primary },
          ]}
        />

        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.name}>
              {fullName}
            </Text>
            {contact.tag && (
              <View style={[styles.tagDot, { backgroundColor: contact.tag.color }]} />
            )}
          </View>

          {contact.address && (
            <View style={styles.infoRow}>
              <Icon name="map-marker-outline" size={14} color={theme.colors.onSurfaceVariant} />
              <Text
                variant="bodySmall"
                numberOfLines={1}
                style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}
              >
                {contact.address}
              </Text>
            </View>
          )}

          {contact.email && (
            <View style={styles.infoRow}>
              <Icon name="email-outline" size={14} color={theme.colors.onSurfaceVariant} />
              <Text
                variant="bodySmall"
                numberOfLines={1}
                style={[styles.infoText, { color: theme.colors.onSurfaceVariant }]}
              >
                {contact.email}
              </Text>
            </View>
          )}
        </View>

        <Icon name="chevron-right" size={24} color={theme.colors.onSurfaceVariant} />
      </Surface>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  avatar: {
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    flex: 1,
  },
  tagDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  infoText: {
    marginLeft: 4,
    flex: 1,
  },
});

export default memo(ContactCard);
