import { StyleSheet, View } from 'react-native';
import { Text, ProgressBar, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import type { WhiteboardItem, WhiteboardGoalContent, WhiteboardGoalMetric } from '@realestate-crm/types';

interface Props {
  item: WhiteboardItem;
}

const METRIC_LABEL: Record<WhiteboardGoalMetric, string> = {
  commission: 'Commission',
  listings: 'Listings won',
  leads: 'New leads',
  calls: 'Calls made',
};

const METRIC_ICON: Record<WhiteboardGoalMetric, string> = {
  commission: 'cash-multiple',
  listings: 'home-plus-outline',
  leads: 'account-plus-outline',
  calls: 'phone-outline',
};

const METRIC_PREFIX: Record<WhiteboardGoalMetric, string> = {
  commission: '$',
  listings: '',
  leads: '',
  calls: '',
};

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function daysUntil(iso?: string): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function GoalCard({ item }: Props) {
  const theme = useTheme();
  const content = item.content as WhiteboardGoalContent;
  const current = content.current ?? 0;
  const target = content.target || 1;
  const ratio = Math.max(0, Math.min(1, current / target));
  const days = daysUntil(content.deadlineIso);
  const prefix = METRIC_PREFIX[content.metric] ?? '';
  const label = METRIC_LABEL[content.metric] ?? 'Goal';
  const icon = METRIC_ICON[content.metric] ?? 'flag-outline';

  return (
    <View
      style={[
        styles.root,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
      ]}
    >
      <View style={styles.header}>
        <Icon name={icon} size={18} color={theme.colors.primary} />
        <Text variant="labelMedium" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {label} this {content.period}
        </Text>
      </View>

      <Text variant="titleMedium" style={[styles.target, { color: theme.colors.onSurface }]}>
        {prefix}{formatNumber(current)}
        <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
          {' / '}{prefix}{formatNumber(target)}
        </Text>
      </Text>

      <ProgressBar
        progress={ratio}
        color={ratio >= 1 ? '#10b981' : theme.colors.primary}
        style={styles.bar}
      />

      <View style={styles.footer}>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {Math.round(ratio * 100)}%
        </Text>
        {days != null && (
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {days === 0 ? 'Today' : `${days}d left`}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  label: { fontWeight: '600' },
  target: { fontWeight: '700', marginVertical: 2 },
  bar: {
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
});
