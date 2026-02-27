import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, FlatList, RefreshControl } from 'react-native';
import { FAB, useTheme, Text, Chip, ActivityIndicator, Surface } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useEmailCampaignStore } from '@realestate-crm/hooks';
import type { EmailCampaign, CampaignStatus } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const STATUS_CONFIG: Record<CampaignStatus, { color: string; icon: string; label: string }> = {
  draft: { color: '#6b7280', icon: 'file-edit-outline', label: 'Draft' },
  scheduled: { color: '#2563eb', icon: 'clock-outline', label: 'Scheduled' },
  sending: { color: '#f59e0b', icon: 'send-clock', label: 'Sending' },
  sent: { color: '#16a34a', icon: 'check-circle-outline', label: 'Sent' },
};

export default function CampaignsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const campaigns = useEmailCampaignStore((s) => s.campaigns);
  const isLoading = useEmailCampaignStore((s) => s.isLoading);
  const fetchCampaigns = useEmailCampaignStore((s) => s.fetchCampaigns);

  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | 'all'>('all');

  useFocusEffect(
    useCallback(() => {
      fetchCampaigns();
    }, [fetchCampaigns])
  );

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return campaigns;
    return campaigns.filter((c) => c.status === statusFilter);
  }, [campaigns, statusFilter]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCampaigns();
    setRefreshing(false);
  }, [fetchCampaigns]);

  const renderItem = useCallback(
    ({ item }: { item: EmailCampaign }) => {
      const config = STATUS_CONFIG[item.status];
      const openRate =
        item.sent_count && item.opened_count
          ? Math.round((item.opened_count / item.sent_count) * 100)
          : null;
      return (
        <Surface style={styles.card} elevation={1}>
          <View
            style={styles.cardContent}
            onTouchEnd={() => router.push(`/campaigns/${item.id}`)}
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
          </View>
        </Surface>
      );
    },
    [router, theme]
  );

  if (isLoading && campaigns.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Status filter chips */}
      <View style={styles.filterRow}>
        {(['all', 'draft', 'scheduled', 'sending', 'sent'] as const).map((s) => (
          <Chip
            key={s}
            selected={statusFilter === s}
            onPress={() => setStatusFilter(s)}
            style={statusFilter === s ? { backgroundColor: theme.colors.primaryContainer } : undefined}
            compact
          >
            {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
          </Chip>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        ListEmptyComponent={
          <View style={styles.center}>
            <Icon name="email-off-outline" size={48} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
              No campaigns yet
            </Text>
          </View>
        }
      />

      <FAB
        icon="plus"
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => router.push('/campaigns/new' as never)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  list: { padding: 16, gap: 12 },
  card: { borderRadius: 12 },
  cardContent: { padding: 16, gap: 6 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardMeta: { flexDirection: 'row', gap: 16, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  fab: { position: 'absolute', right: 16 },
});
