import { StyleSheet, View, Linking } from 'react-native';
import { Modal, Text, Button, useTheme, Surface, Chip, IconButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { Contact, ContactRequirement, ActivityWithContact } from '@realestate-crm/types';
import { useBottomSheetPadding } from './useBottomSheetPadding';

interface ContactPreviewProps {
  contact: Contact | null;
  visible: boolean;
  onDismiss: () => void;
  onViewDetails: () => void;
  requirements?: ContactRequirement[];
  lastActivity?: ActivityWithContact | null;
  onAddNote?: () => void;
  onNavigate?: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ContactPreview({
  contact,
  visible,
  onDismiss,
  onViewDetails,
  requirements,
  lastActivity,
  onAddNote,
  onNavigate,
}: ContactPreviewProps) {
  const theme = useTheme();
  // Bottom-anchored sheet: clear the Android nav bar / home indicator. Keep the
  // prior 100px gap as the floor so non-inset platforms are unchanged.
  const bottomGap = useBottomSheetPadding(100);

  if (!contact) return null;

  const fullName = `${contact.first_name} ${contact.last_name || ''}`.trim();

  const handleCall = () => {
    if (contact.phone) {
      Linking.openURL(`tel:${contact.phone}`);
    }
  };

  const handleNavigateTo = () => {
    if (onNavigate) {
      onNavigate();
    } else if (contact.latitude != null && contact.longitude != null) {
      Linking.openURL(`maps:?daddr=${contact.latitude},${contact.longitude}`);
    }
  };

  // Summarize buyer requirements
  const reqSummary = requirements && requirements.length > 0
    ? requirements.filter(r => r.active).map(r => {
        const parts: string[] = [];
        if (r.suburbs.length > 0) parts.push(r.suburbs.slice(0, 2).join(', '));
        if (r.price_min || r.price_max) {
          const min = r.price_min ? `$${(r.price_min / 1000).toFixed(0)}K` : '';
          const max = r.price_max ? `$${(r.price_max / 1000).toFixed(0)}K` : '';
          parts.push(min && max ? `${min}-${max}` : min || max);
        }
        if (r.beds_min) parts.push(`${r.beds_min}+ bed`);
        return parts.join(' | ');
      })
    : null;

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
        {(contact.tags && contact.tags.length > 0) ? (
          <View style={styles.tagChips}>
            {contact.tags.map(tag => (
              <Chip
                key={tag.id}
                style={[styles.tagChip, { backgroundColor: tag.color }]}
                textStyle={{ color: '#fff' }}
                compact
              >
                {tag.name}
              </Chip>
            ))}
          </View>
        ) : contact.tag ? (
          <Chip
            style={[styles.tagChip, { backgroundColor: contact.tag.color }]}
            textStyle={{ color: '#fff' }}
            compact
          >
            {contact.tag.name}
          </Chip>
        ) : null}

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

        {/* Buyer requirements summary */}
        {reqSummary && reqSummary.length > 0 && (
          <View style={[styles.summarySection, { backgroundColor: theme.colors.surfaceVariant }]}>
            <View style={styles.summaryHeader}>
              <Icon name="magnify" size={14} color={theme.colors.onSurfaceVariant} />
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                Buyer Requirements
              </Text>
            </View>
            {reqSummary.map((summary, idx) => (
              <Text key={idx} variant="bodySmall" numberOfLines={1} style={{ marginTop: 2 }}>
                {summary}
              </Text>
            ))}
          </View>
        )}

        {/* Last activity */}
        {lastActivity?.created_at && (
          <View style={styles.activityRow}>
            <Icon name="clock-outline" size={14} color={theme.colors.onSurfaceVariant} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
              Last activity: {formatTimeAgo(lastActivity.created_at)}
            </Text>
          </View>
        )}

        {/* Quick action buttons */}
        <View style={styles.quickActions}>
          {contact.phone && (
            <IconButton
              icon="phone"
              mode="contained-tonal"
              size={20}
              onPress={handleCall}
              containerColor={theme.colors.primaryContainer}
              iconColor={theme.colors.onPrimaryContainer}
            />
          )}
          {onAddNote && (
            <IconButton
              icon="note-plus"
              mode="contained-tonal"
              size={20}
              onPress={onAddNote}
              containerColor={theme.colors.secondaryContainer}
              iconColor={theme.colors.onSecondaryContainer}
            />
          )}
          {(contact.latitude != null && contact.longitude != null) && (
            <IconButton
              icon="navigation-variant"
              mode="contained-tonal"
              size={20}
              onPress={handleNavigateTo}
              containerColor={theme.colors.tertiaryContainer}
              iconColor={theme.colors.onTertiaryContainer}
            />
          )}
        </View>

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
  tagChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  tagChip: {
    alignSelf: 'flex-start',
    marginBottom: 0,
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
  summarySection: {
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
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
