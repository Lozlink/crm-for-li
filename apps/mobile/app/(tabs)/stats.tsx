import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { useTheme, Text, Chip, ActivityIndicator, Surface } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import {
  usePropertyStore,
  useInspectionStore,
  useTaskStore,
  useCRMStore,
} from '@realestate-crm/hooks';
import { sumPipelineValue } from '@realestate-crm/utils';
import type { PropertyStatus } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

type DateRange = 'week' | 'month' | 'quarter' | 'fy';

const DATE_RANGE_FILTERS: { label: string; value: DateRange }[] = [
  { label: 'This Week', value: 'week' },
  { label: 'This Month', value: 'month' },
  { label: 'This Quarter', value: 'quarter' },
  { label: 'This FY', value: 'fy' },
];

const STATUS_COLORS: Record<PropertyStatus, string> = {
  appraisal: '#6366f1',
  available: '#16a34a',
  under_offer: '#f59e0b',
  exchanged: '#2563eb',
  settled: '#059669',
  leased: '#0d9488',
  withdrawn: '#9ca3af',
};

const STATUS_LABELS: Record<PropertyStatus, string> = {
  appraisal: 'Appraisal',
  available: 'Listed',
  under_offer: 'Under Offer',
  exchanged: 'Exchanged',
  settled: 'Settled',
  leased: 'Leased',
  withdrawn: 'Withdrawn',
};

function getDateRangeBounds(range: DateRange): { start: Date; end: Date } {
  const now = new Date();
  const end = now;
  let start: Date;

  switch (range) {
    case 'week': {
      start = new Date(now);
      const day = start.getDay();
      const diff = day === 0 ? 6 : day - 1;
      start.setDate(start.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    }
    case 'quarter': {
      const qMonth = Math.floor(now.getMonth() / 3) * 3;
      start = new Date(now.getFullYear(), qMonth, 1);
      break;
    }
    case 'fy': {
      const fyYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
      start = new Date(fyYear, 6, 1);
      break;
    }
  }

  return { start, end };
}

function formatCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return `$${Math.round(value)}`;
}

export default function StatsScreen() {
  const theme = useTheme();
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const properties = usePropertyStore(state => state.properties);
  const fetchProperties = usePropertyStore(state => state.fetchProperties);
  const inspections = useInspectionStore(state => state.inspections);
  const fetchInspections = useInspectionStore(state => state.fetchInspections);
  const tasks = useTaskStore(state => state.tasks);
  const fetchTasks = useTaskStore(state => state.fetchTasks);
  const contacts = useCRMStore(state => state.contacts);
  const fetchContacts = useCRMStore(state => state.fetchContacts);
  const fetchRecentActivities = useCRMStore(state => state.fetchActivities);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const refresh = async () => {
        setIsRefreshing(true);
        await Promise.all([
          fetchProperties(),
          fetchInspections(),
          fetchTasks(),
          fetchContacts(),
          fetchRecentActivities(500),
        ]);
        if (!cancelled) setIsRefreshing(false);
      };
      refresh();
      return () => { cancelled = true; };
    }, [fetchProperties, fetchInspections, fetchTasks, fetchContacts, fetchRecentActivities])
  );

  // 1. Active Listings
  const activeListings = useMemo(() => {
    return properties.filter(p =>
      ['available', 'under_offer'].includes(p.status)
    );
  }, [properties]);

  const activeListingsCount = activeListings.length;
  const activeListingsValue = useMemo(() => {
    // Use the shared pipeline-value helper so this total agrees with the
    // Today screen and Pipeline board. Earlier rev used `(p.advertised_price
    // || 0)` which ignored properties whose price came from `appraisal_price`,
    // making this number lower than the Pipeline board's total.
    return sumPipelineValue(activeListings);
  }, [activeListings]);

  // 2. Conversion Rate
  const conversionRate = useMemo(() => {
    if (properties.length === 0) return 0;
    const converted = properties.filter(p =>
      ['exchanged', 'settled', 'leased'].includes(p.status)
    ).length;
    return (converted / properties.length) * 100;
  }, [properties]);

  // 3. Avg Days on Market
  const avgDaysOnMarket = useMemo(() => {
    const relevant = properties.filter(
      p => ['settled', 'leased'].includes(p.status) && p.listed_at && p.settled_at
    );
    if (relevant.length === 0) return null;
    const totalDays = relevant.reduce((sum, p) => {
      const listed = new Date(p.listed_at!).getTime();
      const settled = new Date(p.settled_at!).getTime();
      return sum + (settled - listed) / (1000 * 60 * 60 * 24);
    }, 0);
    return Math.round(totalDays / relevant.length);
  }, [properties]);

  // 4. Commission Forecast
  const commissionForecast = useMemo(() => {
    return activeListings.reduce((sum, p) => {
      const price = p.advertised_price || 0;
      const rate = p.commission_percent || 2;
      return sum + (price * rate) / 100;
    }, 0);
  }, [activeListings]);

  // 5. Inspections Held
  const completedInspections = useMemo(() => {
    return inspections.filter(i => i.status === 'completed');
  }, [inspections]);

  const avgAttendees = useMemo(() => {
    if (completedInspections.length === 0) return 0;
    const total = completedInspections.reduce((sum, i) => {
      const count = Array.isArray(i.attendees)
        ? i.attendees.length
        : (typeof i.attendees === 'object' && i.attendees !== null && 'count' in (i.attendees as Record<string, unknown>))
          ? ((i.attendees as unknown as { count: number }).count || 0)
          : 0;
      return sum + count;
    }, 0);
    return Math.round(total / completedInspections.length * 10) / 10;
  }, [completedInspections]);

  // 6. Tasks Overdue
  const overdueTasks = useMemo(() => {
    const now = new Date();
    return tasks.filter(
      t => t.status === 'pending' && t.due_at && new Date(t.due_at) < now
    );
  }, [tasks]);

  // 7. Pipeline by Stage
  const pipelineByStage = useMemo(() => {
    const counts: Record<PropertyStatus, number> = {
      appraisal: 0,
      available: 0,
      under_offer: 0,
      exchanged: 0,
      settled: 0,
      leased: 0,
      withdrawn: 0,
    };
    for (const p of properties) {
      counts[p.status] = (counts[p.status] || 0) + 1;
    }
    return counts;
  }, [properties]);

  // 8. Contact Activity
  const contactActivity = useMemo(() => {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const thisMonth = contacts.filter(
      c => c.created_at && new Date(c.created_at) >= thisMonthStart
    ).length;
    const lastMonth = contacts.filter(
      c =>
        c.created_at &&
        new Date(c.created_at) >= lastMonthStart &&
        new Date(c.created_at) < thisMonthStart
    ).length;

    return { thisMonth, lastMonth };
  }, [contacts]);

  const renderMetricCard = (
    iconName: string,
    iconColor: string,
    title: string,
    value: string,
    subtitle: string,
    highlight?: boolean,
  ) => (
    <Surface style={styles.metricCard} elevation={1}>
      <View style={styles.metricCardContent}>
        <View style={[styles.iconCircle, { backgroundColor: iconColor + '18' }]}>
          <Icon name={iconName} size={24} color={iconColor} />
        </View>
        <View style={styles.metricText}>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {title}
          </Text>
          <Text
            variant="headlineSmall"
            style={{
              fontWeight: 'bold',
              color: highlight ? '#EF4444' : theme.colors.onSurface,
            }}
          >
            {value}
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
          >
            {subtitle}
          </Text>
        </View>
      </View>
    </Surface>
  );

  if (isRefreshing && properties.length === 0) {
    return (
      <View style={[styles.container, styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Date Range Filter intentionally hidden 2026-05-11: the chip row
            was rendered + stateful but no metric below actually consumed
            `dateRange`, so the UI was lying about what it was showing. The
            state, `DateRange` type, `DATE_RANGE_FILTERS` constant, and
            `getDateRangeBounds()` helper are deliberately retained as the
            scaffolding for when someone wires it through.
            TODO(stats-date-range): thread `dateRange` into each metric's
            useMemo, then re-render this chip row. */}

        {/* Metric Cards */}
        {renderMetricCard(
          'home-city',
          '#16a34a',
          'Active Listings',
          String(activeListingsCount),
          activeListingsValue > 0
            ? `${formatCurrency(activeListingsValue)} total value`
            : 'No listed value',
        )}

        {renderMetricCard(
          'swap-horizontal-bold',
          '#2563eb',
          'Conversion Rate',
          `${conversionRate.toFixed(1)}%`,
          `${properties.filter(p => ['exchanged', 'settled', 'leased'].includes(p.status)).length} of ${properties.length} properties`,
        )}

        {renderMetricCard(
          'clock-outline',
          '#f59e0b',
          'Avg Days on Market',
          // Avoid "\u2014 days" \u2014 the em-dash with a trailing unit reads like a
          // broken render. Show "No data" when there's nothing to average.
          avgDaysOnMarket !== null ? `${avgDaysOnMarket} days` : 'No data',
          avgDaysOnMarket !== null
            ? 'Settled/leased properties'
            : 'No settled properties yet',
        )}

        {renderMetricCard(
          'currency-usd',
          '#059669',
          'Commission Forecast',
          formatCurrency(commissionForecast),
          `From ${activeListingsCount} active listing${activeListingsCount !== 1 ? 's' : ''}`,
        )}

        {renderMetricCard(
          'door-open',
          '#6366f1',
          'Inspections Held',
          String(completedInspections.length),
          completedInspections.length > 0
            ? `Avg ${avgAttendees} attendees per inspection`
            : 'No completed inspections',
        )}

        {renderMetricCard(
          'alert-circle-outline',
          overdueTasks.length > 0 ? '#EF4444' : '#9ca3af',
          'Tasks Overdue',
          String(overdueTasks.length),
          overdueTasks.length > 0
            ? 'Require attention'
            : 'All tasks on track',
          overdueTasks.length > 0,
        )}

        {/* Pipeline by Stage */}
        <Surface style={styles.metricCard} elevation={1}>
          <View style={styles.pipelineContent}>
            <View style={styles.pipelineHeader}>
              <Icon name="chart-bar" size={24} color={theme.colors.primary} />
              <Text variant="titleMedium" style={{ fontWeight: 'bold', marginLeft: 8 }}>
                Pipeline by Stage
              </Text>
            </View>
            <View style={styles.pipelineChips}>
              {(Object.keys(STATUS_COLORS) as PropertyStatus[]).map(status => {
                const count = pipelineByStage[status];
                if (count === 0) return null;
                return (
                  <Chip
                    key={status}
                    compact
                    style={{ backgroundColor: STATUS_COLORS[status], marginRight: 6, marginBottom: 6 }}
                    textStyle={{ color: '#fff', fontSize: 12 }}
                  >
                    {STATUS_LABELS[status]}: {count}
                  </Chip>
                );
              })}
              {properties.length === 0 && (
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                >
                  No properties in pipeline
                </Text>
              )}
            </View>
          </View>
        </Surface>

        {/* Contact Activity */}
        {renderMetricCard(
          'account-plus',
          '#0d9488',
          'Contact Activity',
          String(contactActivity.thisMonth),
          contactActivity.lastMonth > 0
            ? `vs ${contactActivity.lastMonth} last month`
            : 'Contacts added this month',
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    marginBottom: 0,
  },
  metricCard: {
    marginBottom: 12,
    borderRadius: 12,
  },
  metricCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  metricText: {
    flex: 1,
  },
  pipelineContent: {
    padding: 16,
  },
  pipelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  pipelineChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
