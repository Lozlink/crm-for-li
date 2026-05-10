import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, FlatList, RefreshControl, Pressable } from 'react-native';
import { FAB, useTheme, Text, Chip, ActivityIndicator, Surface, SegmentedButtons } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useEmailCampaignStore, useSmsCampaignStore } from '@realestate-crm/hooks';
import type { EmailCampaign, CampaignStatus, SmsCampaign, SmsCampaignStatus } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type Channel = 'email' | 'sms';

const EMAIL_STATUS_CONFIG: Record<CampaignStatus, { color: string; icon: string; label: string }> = {
  draft: { color: '#6b7280', icon: 'file-edit-outline', label: 'Draft' },
  scheduled: { color: '#2563eb', icon: 'clock-outline', label: 'Scheduled' },
  sending: { color: '#f59e0b', icon: 'send-clock', label: 'Sending' },
  sent: { color: '#16a34a', icon: 'check-circle-outline', label: 'Sent' },
};

const SMS_STATUS_CONFIG: Record<SmsCampaignStatus, { color: string; icon: string; label: string }> = {
  draft: { color: '#6b7280', icon: 'file-edit-outline', label: 'Draft' },
  sending: { color: '#f59e0b', icon: 'send-clock', label: 'Sending' },
  sent: { color: '#16a34a', icon: 'check-circle-outline', label: 'Sent' },
  failed: { color: '#ef4444', icon: 'alert-circle-outline', label: 'Failed' },
};

export default function CampaignsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [channel, setChannel] = useState<Channel>('email');

  // Email
  const emailCampaigns = useEmailCampaignStore((s) => s.campaigns);
  const emailIsLoading = useEmailCampaignStore((s) => s.isLoading);
  const fetchEmailCampaigns = useEmailCampaignStore((s) => s.fetchCampaigns);

  // SMS
  const smsCampaigns = useSmsCampaignStore((s) => s.campaigns);
  const smsIsLoading = useSmsCampaignStore((s) => s.isLoading);
  const fetchSmsCampaigns = useSmsCampaignStore((s) => s.fetchCampaigns);

  const [refreshing, setRefreshing] = useState(false);
  const [emailStatusFilter, setEmailStatusFilter] = useState<CampaignStatus | 'all'>('all');
  const [smsStatusFilter, setSmsStatusFilter] = useState<SmsCampaignStatus | 'all'>('all');

  useFocusEffect(
    useCallback(() => {
      void fetchEmailCampaigns();
      void fetchSmsCampaigns();
    }, [fetchEmailCampaigns, fetchSmsCampaigns])
  );

  const filteredEmail = useMemo(() => {
    if (emailStatusFilter === 'all') return emailCampaigns;
    return emailCampaigns.filter((c) => c.status === emailStatusFilter);
  }, [emailCampaigns, emailStatusFilter]);

  const filteredSms = useMemo(() => {
    if (smsStatusFilter === 'all') return smsCampaigns;
    return smsCampaigns.filter((c) => c.status === smsStatusFilter);
  }, [smsCampaigns, smsStatusFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (channel === 'email') {
        await fetchEmailCampaigns();
      } else {
        await fetchSmsCampaigns();
      }
    } finally {
      setRefreshing(false);
    }
  }, [channel, fetchEmailCampaigns, fetchSmsCampaigns]);

  const renderEmailItem = useCallback(
    ({ item }: { item: EmailCampaign }) => {
      const config = EMAIL_STATUS_CONFIG[item.status];
      const openRate =
        item.sent_count && item.opened_count
          ? Math.round((item.opened_count / item.sent_count) * 100)
          : null;
      return (
        <Surface style={styles.card} elevation={1}>
          <Pressable
            style={styles.cardContent}
            onPress={() => router.push(`/campaigns/${item.id}`)}
            accessibilityRole="button"
            accessibilityLabel={`Open email campaign ${item.name}`}
          >
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" numberOfLines={1} style={{ flex: 1 }}>
                {item.name}
              </Text>
              <Chip
                icon={() => <Icon name={config.icon} size={14} color={config.color} />}
                textStyle={{ color: config.color, fontSize: 12 }}
                style={{ backgroundColor: config.color + '15' }}
                compact
              >
                {config.label}
              </Chip>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
              {item.subject}
            </Text>
            <View style={styles.cardMeta}>
              <View style={styles.metaItem}>
                <Icon name="account-group-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {item.recipient_count ?? 0} recipients
                </Text>
              </View>
              {item.status === 'sent' && openRate != null && (
                <View style={styles.metaItem}>
                  <Icon name="email-open-outline" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {openRate}% opened
                  </Text>
                </View>
              )}
              {item.scheduled_at && item.status === 'scheduled' && (
                <View style={styles.metaItem}>
                  <Icon name="calendar-clock" size={14} color="#2563eb" />
                  <Text variant="labelSmall" style={{ color: '#2563eb' }}>
                    {new Date(item.scheduled_at).toLocaleDateString()}
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </Surface>
      );
    },
    [router, theme]
  );

  const renderSmsItem = useCallback(
    ({ item }: { item: SmsCampaign }) => {
      const config = SMS_STATUS_CONFIG[item.status];
      const recipients = item.recipient_count ?? 0;
      const sent = item.sent_count ?? 0;
      const failed = item.failed_count ?? 0;
      return (
        <Surface style={styles.card} elevation={1}>
          <Pressable
            style={styles.cardContent}
            onPress={() => router.push(`/campaigns/sms/${item.id}` as never)}
            accessibilityRole="button"
            accessibilityLabel={`Open SMS campaign ${item.name}`}
          >
            <View style={styles.cardHeader}>
              <Text variant="titleMedium" numberOfLines={1} style={{ flex: 1 }}>
                {item.name}
              </Text>
              <Chip
                icon={() => <Icon name={config.icon} size={14} color={config.color} />}
                textStyle={{ color: config.color, fontSize: 12 }}
                style={{ backgroundColor: config.color + '15' }}
                compact
              >
                {config.label}
              </Chip>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={2}>
              {item.message_template || '(no message yet)'}
            </Text>
            <View style={styles.cardMeta}>
              <View style={styles.metaItem}>
                <Icon name="account-group-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {recipients} recipient{recipients !== 1 ? 's' : ''}
                </Text>
              </View>
              {item.status === 'sent' && (
                <View style={styles.metaItem}>
                  <Icon name="check-circle-outline" size={14} color="#16a34a" />
                  <Text variant="labelSmall" style={{ color: '#16a34a' }}>
                    {sent} sent
                  </Text>
                </View>
              )}
              {failed > 0 && (
                <View style={styles.metaItem}>
                  <Icon name="alert-circle-outline" size={14} color="#ef4444" />
                  <Text variant="labelSmall" style={{ color: '#ef4444' }}>
                    {failed} failed
                  </Text>
                </View>
              )}
            </View>
          </Pressable>
        </Surface>
      );
    },
    [router, theme]
  );

  const isLoading = channel === 'email' ? emailIsLoading : smsIsLoading;
  const dataLength = channel === 'email' ? emailCampaigns.length : smsCampaigns.length;

  if (isLoading && dataLength === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Channel toggle */}
      <View style={styles.channelRow}>
        <SegmentedButtons
          value={channel}
          onValueChange={(v) => setChannel(v as Channel)}
          buttons={[
            { value: 'email', label: 'Email', icon: 'email-outline' },
            { value: 'sms', label: 'SMS', icon: 'message-text-outline' },
          ]}
        />
      </View>

      {/* Status filter chips */}
      {channel === 'email' ? (
        <View style={styles.filterRow}>
          {(['all', 'draft', 'scheduled', 'sending', 'sent'] as const).map((s) => (
            <Chip
              key={s}
              selected={emailStatusFilter === s}
              onPress={() => setEmailStatusFilter(s)}
              style={emailStatusFilter === s ? { backgroundColor: theme.colors.primaryContainer } : undefined}
              compact
            >
              {s === 'all' ? 'All' : EMAIL_STATUS_CONFIG[s].label}
            </Chip>
          ))}
        </View>
      ) : (
        <View style={styles.filterRow}>
          {(['all', 'draft', 'sending', 'sent', 'failed'] as const).map((s) => (
            <Chip
              key={s}
              selected={smsStatusFilter === s}
              onPress={() => setSmsStatusFilter(s)}
              style={smsStatusFilter === s ? { backgroundColor: theme.colors.primaryContainer } : undefined}
              compact
            >
              {s === 'all' ? 'All' : SMS_STATUS_CONFIG[s].label}
            </Chip>
          ))}
        </View>
      )}

      {channel === 'email' ? (
        <FlatList
          data={filteredEmail}
          keyExtractor={(item) => item.id}
          renderItem={renderEmailItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="email-off-outline" size={48} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
                No email campaigns yet
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredSms}
          keyExtractor={(item) => item.id}
          renderItem={renderSmsItem}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Icon name="message-off-outline" size={48} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
                No SMS campaigns yet
              </Text>
            </View>
          }
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() =>
          channel === 'email'
            ? router.push('/campaigns/new' as never)
            : router.push('/campaigns/sms/new' as never)
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  channelRow: { paddingHorizontal: 16, paddingTop: 12 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 12 },
  cardContent: { padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardMeta: { flexDirection: 'row', gap: 16, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fab: { position: 'absolute', right: 16 },
});
