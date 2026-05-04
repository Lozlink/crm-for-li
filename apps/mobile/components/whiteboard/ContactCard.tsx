import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { Text, Avatar, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';
import { useCRMStore, useLeadScoringEngine } from '@realestate-crm/hooks';
import type { LeadTier, WhiteboardContactContent, WhiteboardItem } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
}

const TIER_COLORS: Record<LeadTier, string> = {
  hot: '#EF4444',
  warm: '#F59E0B',
  cold: '#3B82F6',
  dormant: '#6B7280',
};

function initials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
}

function timeAgo(iso?: string | null): string {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'Just now';
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function ContactCard({ item }: Props) {
  const theme = useTheme();
  const router = useRouter();
  const content = item.content as WhiteboardContactContent;
  const contactId = content.contactId;

  const contact = useCRMStore((s) => s.contacts.find((c) => c.id === contactId));
  const { getScore, getTier } = useLeadScoringEngine();

  // Tombstone — contact deleted or never set
  if (!contact) {
    return (
      <View
        style={[
          styles.root,
          {
            backgroundColor: theme.colors.surfaceVariant,
            borderColor: theme.colors.outlineVariant,
            opacity: 0.7,
          },
        ]}
      >
        <View style={styles.tombstone}>
          <Icon name="account-question-outline" size={28} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
            {content.snapshotName || 'Contact unavailable'}
          </Text>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, opacity: 0.7 }}>
            {contactId ? 'Contact removed' : 'Tap edit to link a contact'}
          </Text>
        </View>
      </View>
    );
  }

  const fullName = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || 'Unnamed';
  const breakdown = getScore(contact.id);
  const score = breakdown?.total ?? 0;
  const tier: LeadTier = getTier(contact.id);
  const tierColor = TIER_COLORS[tier];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/contact/${contact.id}`)}
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
          borderLeftColor: tierColor,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${fullName}`}
    >
      <View style={styles.row}>
        <Avatar.Text size={36} label={initials(fullName)} />
        <View style={styles.body}>
          <Text variant="titleSmall" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
            {fullName}
          </Text>
          <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
            Last contact {timeAgo(contact.last_contacted_at)}
          </Text>
        </View>
      </View>

      <View style={styles.scoreRow}>
        <View style={[styles.tierChip, { backgroundColor: tierColor + '22' }]}>
          <Text variant="labelSmall" style={{ color: tierColor, fontWeight: '700' }}>
            {tier.toUpperCase()} · {score}
          </Text>
        </View>
        <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 4,
    paddingLeft: 8,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    justifyContent: 'space-between',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  body: {
    flex: 1,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tierChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tombstone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    padding: 8,
  },
});
