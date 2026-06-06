import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, FlatList, ScrollView, TouchableOpacity } from 'react-native';
import { useTheme, Text, Surface, SegmentedButtons, Chip, ActivityIndicator, Button } from 'react-native-paper';
import { useRouter, useFocusEffect } from 'expo-router';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useComplianceStore } from '@realestate-crm/hooks';
import { formatRelativeDate } from '@realestate-crm/utils';
import type {
  ComplianceAlert,
  ComplianceAlertSeverity,
  ComplianceAlertStatus,
  ComplianceAnalytics,
} from '@realestate-crm/types';

// ── Helpers ──────────────────────────────────────────────────────────

/** Severity → accent color (left border band + tinted icons). Hex constants
 *  follow the STATUS_COLORS idiom in stats.tsx. */
const SEVERITY_COLORS: Record<ComplianceAlertSeverity, string> = {
  info: '#6366f1',
  low: '#16a34a',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#dc2626',
};

/** Statuses that count as "open" in the triage queue. */
const OPEN_STATUSES: readonly ComplianceAlertStatus[] = [
  'new',
  'acknowledged',
  'investigating',
  'escalated',
];

const STATUS_LABELS: Record<ComplianceAlertStatus, string> = {
  new: 'New',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  escalated: 'Escalated',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
  false_positive: 'False positive',
};

/** Time remaining until an SLA deadline ("3h left"), or null when past/invalid. */
function formatSlaCountdown(deadline: string): string | null {
  const diffMs = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(diffMs) || diffMs <= 0) return null;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

// ── Component ────────────────────────────────────────────────────────

export default function ComplianceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState<'dashboard' | 'alerts'>('dashboard');
  const [statusFilter, setStatusFilter] = useState<'open' | 'closed'>('open');

  const suiteEnabled = useComplianceStore(s => s.suiteEnabled);
  const mode = useComplianceStore(s => s.mode);
  const analytics = useComplianceStore(s => s.analytics);
  const analyticsLoading = useComplianceStore(s => s.analyticsLoading);
  const alerts = useComplianceStore(s => s.alerts);
  const alertsLoading = useComplianceStore(s => s.alertsLoading);
  const fetchAnalytics = useComplianceStore(s => s.fetchAnalytics);
  const fetchAlerts = useComplianceStore(s => s.fetchAlerts);

  // Staleness guard — same pattern as Today: skip the refetch when data is
  // less than 60 s old so tab-hopping doesn't spam the API.
  const lastFetchAt = useRef<number>(0);
  useFocusEffect(
    useCallback(() => {
      if (!suiteEnabled) return;
      if (Date.now() - lastFetchAt.current < 60_000) return;
      lastFetchAt.current = Date.now();
      void fetchAnalytics();
      void fetchAlerts();
    }, [suiteEnabled, fetchAnalytics, fetchAlerts])
  );

  const filteredAlerts = useMemo(() => {
    const wantOpen = statusFilter === 'open';
    return alerts.filter(a => OPEN_STATUSES.includes(a.status) === wantOpen);
  }, [alerts, statusFilter]);

  const handleAlertPress = useCallback((alertId: string) => {
    router.push(`/compliance/alert/${alertId}` as never);
  }, [router]);

  // Deep-link fallback: the tab is hidden everywhere while the suite is off,
  // but the route stays mounted — render a pointer to Settings instead.
  if (!suiteEnabled) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
        <Icon name="shield-off-outline" size={40} color={theme.colors.onSurfaceVariant} />
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, marginTop: 12 }}>
          Compliance Suite is off
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center', marginHorizontal: 32 }}
        >
          Turn it on in Settings to screen contacts and triage alerts.
        </Text>
        <Button
          mode="contained-tonal"
          style={{ marginTop: 16 }}
          onPress={() => router.push('/(tabs)/settings' as never)}
        >
          Open Settings
        </Button>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <SegmentedButtons
        value={segment}
        onValueChange={(value) => setSegment(value as 'dashboard' | 'alerts')}
        buttons={[
          { value: 'dashboard', label: 'Dashboard', icon: 'view-dashboard-outline' },
          { value: 'alerts', label: 'Alerts', icon: 'bell-alert-outline' },
        ]}
        style={styles.segments}
      />

      {segment === 'dashboard' ? (
        <DashboardView analytics={analytics} loading={analyticsLoading} mode={mode} />
      ) : (
        <View style={styles.alertsContainer}>
          {/* Open vs closed triage filter */}
          <View style={styles.filterRow}>
            <Chip
              compact
              selected={statusFilter === 'open'}
              onPress={() => setStatusFilter('open')}
            >
              Open
            </Chip>
            <Chip
              compact
              selected={statusFilter === 'closed'}
              onPress={() => setStatusFilter('closed')}
            >
              Closed
            </Chip>
          </View>

          {alertsLoading && alerts.length === 0 ? (
            <View style={[styles.centered, { flex: 1 }]}>
              <ActivityIndicator size="large" />
            </View>
          ) : (
            <FlatList
              data={filteredAlerts}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <AlertRow alert={item} onPress={() => handleAlertPress(item.id)} />
              )}
              contentContainerStyle={filteredAlerts.length === 0 ? styles.emptyList : styles.list}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Icon name="shield-check-outline" size={32} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                    {statusFilter === 'open' ? 'No open alerts' : 'No closed alerts'}
                  </Text>
                </View>
              }
            />
          )}
        </View>
      )}
    </View>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function DashboardView({
  analytics,
  loading,
  mode,
}: {
  analytics: ComplianceAnalytics | null;
  loading: boolean;
  mode: 'live' | 'mock';
}) {
  const theme = useTheme();

  // Mode chip pinned to the dashboard header so the partner always knows
  // whether they're looking at demo data or the live IntelliCompli tenant.
  const modeChip = (
    <View style={styles.dashboardHeader}>
      <Chip
        compact
        icon={mode === 'live' ? 'cloud-check-outline' : 'database-outline'}
        style={mode === 'live' ? { backgroundColor: theme.colors.primaryContainer } : undefined}
      >
        {mode === 'live' ? 'Connected' : 'Demo data'}
      </Chip>
    </View>
  );

  if (!analytics) {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.dashboardHeaderStandalone}>{modeChip}</View>
        <View style={[styles.centered, { flex: 1 }]}>
          {loading ? (
            <ActivityIndicator size="large" />
          ) : (
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              No compliance data yet
            </Text>
          )}
        </View>
      </View>
    );
  }

  // verificationRate comes back as a 0–1 fraction from the API client.
  const verificationPercent = `${Math.round(analytics.customers.verificationRate * 100)}%`;

  return (
    <ScrollView contentContainerStyle={styles.dashboardContent}>
      {modeChip}
      <View style={styles.statGrid}>
        <View style={styles.statRow}>
          <StatTile
            icon="bell-alert-outline"
            label="Open alerts"
            value={String(analytics.alerts.open)}
            color="#6366f1"
          />
          <StatTile
            icon="alert-decagram"
            label="Critical"
            value={String(analytics.alerts.critical)}
            color="#dc2626"
          />
        </View>
        <View style={styles.statRow}>
          <StatTile
            icon="clock-alert-outline"
            label="SLA breached"
            value={String(analytics.alerts.slaBreached)}
            color="#dc2626"
          />
          <StatTile
            icon="calendar-alert"
            label="OCDD overdue"
            value={String(analytics.ocdd.overdue)}
            color="#f59e0b"
          />
        </View>
        <View style={styles.statRow}>
          <StatTile
            icon="check-decagram"
            label="Verification rate"
            value={verificationPercent}
            color="#16a34a"
          />
          <View style={styles.statSpacer} />
        </View>
      </View>

      {/* Risk distribution */}
      <Surface style={styles.riskCard} elevation={1}>
        <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 12 }}>
          Risk distribution
        </Text>
        <RiskDistributionBar
          low={analytics.riskDistribution.low}
          medium={analytics.riskDistribution.medium}
          high={analytics.riskDistribution.high}
        />
      </Surface>
    </ScrollView>
  );
}

function StatTile({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  const theme = useTheme();
  return (
    <Surface style={[styles.statTile, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.statTileInner}>
        <View style={[styles.statIconBg, { backgroundColor: color + '14' }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
          <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{value}</Text>
        </View>
      </View>
    </Surface>
  );
}

function RiskDistributionBar({ low, medium, high }: { low: number; medium: number; high: number }) {
  const theme = useTheme();
  const total = low + medium + high;

  if (total === 0) {
    return (
      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
        No screened customers yet
      </Text>
    );
  }

  const segments = [
    { key: 'low', count: low, color: '#16a34a', label: 'Low' },
    { key: 'medium', count: medium, color: '#f59e0b', label: 'Medium' },
    { key: 'high', count: high, color: theme.colors.error, label: 'High' },
  ];

  return (
    <View>
      <View style={styles.riskBar}>
        {segments.map(seg =>
          seg.count > 0 ? (
            <View key={seg.key} style={{ flex: seg.count, backgroundColor: seg.color }} />
          ) : null,
        )}
      </View>
      <View style={styles.riskLegend}>
        {segments.map(seg => (
          <View key={seg.key} style={styles.riskLegendItem}>
            <View style={[styles.riskLegendDot, { backgroundColor: seg.color }]} />
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {seg.label} {seg.count}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AlertRow({ alert, onPress }: { alert: ComplianceAlert; onPress: () => void }) {
  const theme = useTheme();
  const severityColor = SEVERITY_COLORS[alert.severity];
  const slaCountdown =
    alert.slaDeadline && !alert.slaBreached ? formatSlaCountdown(alert.slaDeadline) : null;

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <Surface style={[styles.alertCard, { borderLeftColor: severityColor }]} elevation={1}>
        <View style={styles.alertCardInner}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" numberOfLines={2} style={{ fontWeight: '600' }}>
              {alert.title}
            </Text>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {alert.alertNumber} · {formatRelativeDate(alert.createdAt)}
            </Text>
            <View style={styles.alertChipRow}>
              <Chip compact textStyle={styles.alertChipText}>
                {STATUS_LABELS[alert.status]}
              </Chip>
              {alert.slaBreached ? (
                <Chip
                  compact
                  icon="clock-alert-outline"
                  style={{ backgroundColor: theme.colors.errorContainer }}
                  textStyle={[styles.alertChipText, { color: theme.colors.error }]}
                >
                  SLA breached
                </Chip>
              ) : slaCountdown ? (
                <Chip compact icon="clock-outline" textStyle={styles.alertChipText}>
                  {slaCountdown}
                </Chip>
              ) : null}
            </View>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  segments: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },

  // Dashboard
  dashboardContent: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  dashboardHeaderStandalone: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  statGrid: {
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statTileInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  statIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statSpacer: {
    flex: 1,
  },
  riskCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
  },
  riskBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  riskLegend: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 8,
  },
  riskLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  riskLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Alerts
  alertsContainer: {
    flex: 1,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  list: {
    padding: 16,
    paddingTop: 4,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  alertCard: {
    borderRadius: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    overflow: 'hidden',
  },
  alertCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  alertChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  alertChipText: {
    fontSize: 11,
  },
});
