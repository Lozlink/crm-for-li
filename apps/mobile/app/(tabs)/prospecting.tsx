import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, RefreshControl, FlatList } from 'react-native';
import { useTheme, Text, Surface, SegmentedButtons, ProgressBar, ActivityIndicator, Button, Chip } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  useTrackingStore,
  useCRMStore,
  usePropertyStore,
  useProspectingMetrics,
  useDataEnrichmentStore,
  useLeadScoringEngine,
  useRouteStore,
  useGuidedProspectingStore,
} from '@realestate-crm/hooks';
import type { Route } from '@realestate-crm/types';
import type { TrackingSession } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { BuildingActivityDialog } from '@realestate-crm/ui';
import { TIER_COLORS } from '../../components/LeadScoreBadge';

// ── Helpers ──────────────────────────────────────────────────────────

function formatDuration(seconds: number | undefined): string {
  if (!seconds) return '0m';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${mins}m`;
}

function formatDistance(meters: number | undefined): string {
  if (!meters) return '0 km';
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function isToday(dateStr: string | undefined): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatSalePrice(price: number | undefined | null): string {
  if (price == null) return '-';
  if (price >= 1_000_000) {
    const millions = price / 1_000_000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}M`;
  }
  if (price >= 1_000) {
    const thousands = Math.round(price / 1_000);
    return `$${thousands}K`;
  }
  return `$${price.toLocaleString()}`;
}

type ViewMode = 'daily' | 'weekly' | 'funnel' | 'territory' | 'sessions';

// ── Funnel colors ────────────────────────────────────────────────────

const FUNNEL_STAGES = [
  { key: 'fieldContacts', label: 'Field Contacts', color: '#6366f1' },
  { key: 'withPhone', label: 'With Phone', color: '#16a34a' },
  { key: 'appraisals', label: 'Appraisals', color: '#f59e0b' },
  { key: 'listed', label: 'Listed', color: '#2563eb' },
  { key: 'settled', label: 'Settled', color: '#059669' },
] as const;

// ── Component ────────────────────────────────────────────────────────

export default function ProspectingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<ViewMode>('daily');
  const [refreshing, setRefreshing] = useState(false);
  const [isStartingTracking, setIsStartingTracking] = useState(false);
  const [buildingDialogVisible, setBuildingDialogVisible] = useState(false);

  const fetchSessions = useTrackingStore(s => s.fetchSessions);
  const fetchAllAnnotations = useTrackingStore(s => s.fetchAllAnnotations);
  const activeSession = useTrackingStore(s => s.activeSession);
  const startSession = useTrackingStore(s => s.startSession);
  const fetchContacts = useCRMStore(s => s.fetchContacts);
  const fetchRecentActivities = useCRMStore(s => s.fetchActivities);
  const contacts = useCRMStore(s => s.contacts);
  const fetchProperties = usePropertyStore(s => s.fetchProperties);
  const sessions = useTrackingStore(s => s.sessions);

  // Routes store (for Sessions view)
  const routes = useRouteStore(s => s.routes);
  const fetchRoutes = useRouteStore(s => s.fetchRoutes);

  // Guided session state (for active status display)
  const guidedIsActive = useGuidedProspectingStore(s => s.isActive);
  const guidedStops = useGuidedProspectingStore(s => s.stops);
  const guidedVisitedCount = useMemo(
    () => guidedStops.filter(s => s.status === 'visited').length,
    [guidedStops],
  );

  // Data enrichment
  const suburbStats = useDataEnrichmentStore(s => s.suburbStats);
  const suburbStatsLoading = useDataEnrichmentStore(s => s.suburbStatsLoading);
  const fetchSuburbStats = useDataEnrichmentStore(s => s.fetchSuburbStats);
  const getSuburbPenetration = useDataEnrichmentStore(s => s.getSuburbPenetration);

  const metrics = useProspectingMetrics();
  const { scores: leadScores } = useLeadScoringEngine();

  const tierCounts = useMemo(() => {
    const counts = { hot: 0, warm: 0, cold: 0, dormant: 0 };
    leadScores.forEach(s => { counts[s.tier]++; });
    return counts;
  }, [leadScores]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchSessions(), fetchAllAnnotations(), fetchContacts(), fetchProperties(), fetchSuburbStats(), fetchRecentActivities(), fetchRoutes()]);
    setRefreshing(false);
  }, [fetchSessions, fetchAllAnnotations, fetchContacts, fetchProperties, fetchSuburbStats, fetchRecentActivities, fetchRoutes]);

  useFocusEffect(
    useCallback(() => {
      fetchSessions();
      fetchAllAnnotations();
      fetchContacts();
      fetchProperties();
      fetchSuburbStats();
      fetchRecentActivities();
      fetchRoutes();
    }, [fetchSessions, fetchAllAnnotations, fetchContacts, fetchProperties, fetchSuburbStats, fetchRecentActivities, fetchRoutes])
  );

  // Use pre-computed suburb contact counts from the hook (covers ALL contacts, not just stale streets)
  const suburbContactCounts = metrics.suburbContactCounts;

  // Build suburb intelligence rows
  const suburbIntelligence = useMemo(() => {
    if (suburbStats.length === 0) return [];

    const rows: {
      suburb: string;
      totalDwellings: number;
      contactCount: number;
      penetration: number | null;
      medianSalePrice: number | undefined;
      housePct: number;
      unitPct: number;
    }[] = [];

    for (const stat of suburbStats) {
      const contactCount = suburbContactCounts.get(stat.suburb.toLowerCase()) || 0;
      if (contactCount === 0) continue;

      const penetration = getSuburbPenetration(stat.suburb, contactCount);
      const totalDwellings = stat.total_dwellings || 0;
      const houses = stat.separate_houses || 0;
      const units = (stat.flats_units || 0) + (stat.semi_detached || 0);
      const dwellingTotal = houses + units + (stat.other_dwellings || 0);
      const housePct = dwellingTotal > 0 ? Math.round((houses / dwellingTotal) * 100) : 0;
      const unitPct = dwellingTotal > 0 ? Math.round((units / dwellingTotal) * 100) : 0;

      rows.push({
        suburb: stat.suburb,
        totalDwellings,
        contactCount,
        penetration,
        medianSalePrice: stat.median_sale_price,
        housePct,
        unitPct,
      });
    }

    // Sort by penetration ascending (lowest = biggest opportunity)
    rows.sort((a, b) => (a.penetration ?? 0) - (b.penetration ?? 0));
    return rows.slice(0, 10);
  }, [suburbStats, suburbContactCounts, getSuburbPenetration]);

  // Today's sessions for daily view
  const todaySessions = useMemo(() => {
    return sessions
      .filter(s => isToday(s.started_at))
      .sort((a, b) => {
        const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
        const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
        return bTime - aTime;
      });
  }, [sessions]);

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* View Selector */}
        <View style={styles.segmentContainer}>
          <SegmentedButtons
            value={view}
            onValueChange={(val) => setView(val as ViewMode)}
            buttons={[
              { value: 'daily', label: 'Daily' },
              { value: 'weekly', label: 'Weekly' },
              { value: 'funnel', label: 'Funnel' },
              { value: 'territory', label: 'Territory' },
              { value: 'sessions', label: 'Sessions' },
            ]}
            density="small"
          />
        </View>

        {/* Start actions or active session status */}
        {activeSession || guidedIsActive ? (
          <Surface style={[styles.activeSessionCard, { backgroundColor: theme.colors.primaryContainer }]} elevation={1}>
            <View style={styles.activeSessionInner}>
              <Icon
                name={guidedIsActive ? 'walk' : 'record-circle-outline'}
                size={22}
                color={theme.colors.onPrimaryContainer}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onPrimaryContainer }}>
                  {guidedIsActive
                    ? `Guided session active`
                    : 'Tracking in progress'}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.8 }}>
                  {guidedIsActive
                    ? `${guidedVisitedCount}/${guidedStops.length} stops visited`
                    : activeSession?.started_at
                      ? `Started ${formatTime(activeSession.started_at)}`
                      : 'Recording GPS...'}
                </Text>
              </View>
              <Button
                mode="contained-tonal"
                compact
                onPress={() => {
                  if (guidedIsActive) {
                    router.push('/prospecting/guided' as never);
                  } else {
                    router.push('/(tabs)/map' as never);
                  }
                }}
              >
                Resume
              </Button>
            </View>
          </Surface>
        ) : (
          <View style={styles.startActionsContainer}>
            {/* Primary: Start Guided Session */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/prospecting/guided' as never)}
            >
              <Surface style={[styles.startActionCard, { backgroundColor: theme.colors.primary }]} elevation={2}>
                <View style={styles.startActionInner}>
                  <View style={styles.startActionIconBg}>
                    <Icon name="navigation-variant" size={22} color={theme.colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onPrimary }}>
                      Start Guided Session
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onPrimary, opacity: 0.85 }}>
                      Scored route with door-knock tracking
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={22} color={theme.colors.onPrimary} />
                </View>
                {/* Tier chips as context */}
                {(tierCounts.hot > 0 || tierCounts.warm > 0 || tierCounts.cold > 0) && (
                  <View style={styles.tierChipsRow}>
                    {tierCounts.hot > 0 && (
                      <Chip compact style={[styles.tierChipOnPrimary]} textStyle={{ color: TIER_COLORS.hot, fontSize: 11, fontWeight: '700' }}>
                        {tierCounts.hot} Hot
                      </Chip>
                    )}
                    {tierCounts.warm > 0 && (
                      <Chip compact style={[styles.tierChipOnPrimary]} textStyle={{ color: TIER_COLORS.warm, fontSize: 11, fontWeight: '700' }}>
                        {tierCounts.warm} Warm
                      </Chip>
                    )}
                    {tierCounts.cold > 0 && (
                      <Chip compact style={[styles.tierChipOnPrimary]} textStyle={{ color: TIER_COLORS.cold, fontSize: 11, fontWeight: '700' }}>
                        {tierCounts.cold} Cold
                      </Chip>
                    )}
                  </View>
                )}
              </Surface>
            </TouchableOpacity>

            {/* Secondary: Start Tracking */}
            <TouchableOpacity
              activeOpacity={0.7}
              disabled={isStartingTracking}
              onPress={async () => {
                setIsStartingTracking(true);
                await startSession();
                setIsStartingTracking(false);
                router.push('/(tabs)/map' as never);
              }}
            >
              <Surface style={[styles.startActionCardSecondary, { backgroundColor: theme.colors.surfaceVariant }]} elevation={1}>
                <View style={styles.startActionInner}>
                  <Icon name="map-marker-path" size={20} color={theme.colors.onSurfaceVariant} />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text variant="titleSmall" style={{ fontWeight: '600', color: theme.colors.onSurface }}>
                      Start Tracking
                    </Text>
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      GPS recording only
                    </Text>
                  </View>
                  {isStartingTracking ? (
                    <ActivityIndicator size={18} />
                  ) : (
                    <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                  )}
                </View>
              </Surface>
            </TouchableOpacity>
          </View>
        )}

        {view === 'daily' && (
          <DailyView
            metrics={metrics}
            todaySessions={todaySessions}
            onSessionPress={(id: string) => router.push(`/tracking/${id}` as never)}
          />
        )}

        {view === 'weekly' && (
          <WeeklyView metrics={metrics} />
        )}

        {view === 'funnel' && (
          <FunnelView
            metrics={metrics}
            onStreetPress={(lat: number, lng: number) => {
              router.push(`/(tabs)/map?lat=${lat}&lng=${lng}&zoom=0.01&layer=contacts` as never);
            }}
          />
        )}

        {view === 'territory' && (
          <TerritoryView
            metrics={metrics}
            onAreaPress={(lat: number, lng: number) => {
              router.push(`/(tabs)/map?lat=${lat}&lng=${lng}&zoom=0.01&layer=contacts` as never);
            }}
            suburbIntelligence={suburbIntelligence}
            suburbStatsLoading={suburbStatsLoading}
          />
        )}

        {view === 'sessions' && (
          <SessionsView
            sessions={sessions}
            routes={routes}
            onSessionPress={(id: string) => router.push(`/tracking/${id}` as never)}
            onRoutePress={(id: string) => router.push(`/route/${id}` as never)}
          />
        )}
      </ScrollView>

    </View>
  );
}

// ── Daily View ───────────────────────────────────────────────────────

function DailyView({
  metrics,
  todaySessions,
  onSessionPress,
}: {
  metrics: ReturnType<typeof useProspectingMetrics>;
  todaySessions: { id: string; started_at?: string; duration_seconds?: number; total_distance_meters?: number; annotation_count?: number }[];
  onSessionPress: (id: string) => void;
}) {
  const theme = useTheme();

  return (
    <View>
      {/* Streak Card */}
      {metrics.streak.currentDays > 0 || metrics.streak.isActiveToday ? (
        <Surface
          style={[
            styles.card,
            {
              backgroundColor: metrics.streak.currentDays > 3
                ? theme.colors.primaryContainer
                : theme.colors.surfaceVariant,
            },
          ]}
          elevation={1}
        >
          <View style={styles.cardInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <Icon name="fire" size={28} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                  {metrics.streak.currentDays}-day streak
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Best: {metrics.streak.longestDays} days
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="labelMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                  {metrics.thisWeek.doors}/50 doors
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  this week
                </Text>
              </View>
            </View>
            <ProgressBar
              progress={metrics.streak.weeklyProgressPercent / 100}
              color={metrics.streak.weeklyProgressPercent >= 100 ? '#16a34a' : theme.colors.primary}
              style={styles.progressBar}
            />
          </View>
        </Surface>
      ) : (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surfaceVariant }]} elevation={1}>
          <View style={[styles.cardInner, { flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
            <Icon name="fire" size={28} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}>
              Start a streak! Prospect today to begin.
            </Text>
          </View>
        </Surface>
      )}

      {/* 2x2 Stat Grid */}
      <View style={styles.statGrid}>
        <View style={styles.statRow}>
          <StatCell icon="door-open" label="Doors" value={String(metrics.today.doors)} color="#6366f1" trend={metrics.trends.doors} />
          <StatCell icon="walk" label="Sessions" value={String(metrics.today.sessions)} color="#0d9488" trend={null} />
        </View>
        <View style={styles.statRow}>
          <StatCell icon="map-marker-distance" label="Distance" value={formatDistance(metrics.today.distanceMeters)} color="#f59e0b" trend={metrics.trends.distance} />
          <StatCell icon="account-plus-outline" label="Contacts" value={String(metrics.today.contactsCreated)} color="#16a34a" trend={metrics.trends.contacts} />
        </View>
      </View>

      {/* Phone Capture Rate */}
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.cardInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="phone-check" size={18} color="#16a34a" />
              <Text variant="titleSmall" style={{ fontWeight: '600' }}>Phone Capture Rate</Text>
            </View>
            <Text variant="titleMedium" style={{ fontWeight: '700', color: '#16a34a' }}>
              {metrics.today.phoneCaptureRate}%
            </Text>
          </View>
          <ProgressBar
            progress={metrics.today.phoneCaptureRate / 100}
            color="#16a34a"
            style={styles.progressBar}
          />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {metrics.today.phoneCaptures} of {metrics.today.contactsCreated} contacts have a phone number
          </Text>
        </View>
      </Surface>

      {/* Call Connect Rate */}
      {metrics.callMetrics.totalCalls > 0 && (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.cardInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon name="phone-in-talk" size={18} color="#2563eb" />
                <Text variant="titleSmall" style={{ fontWeight: '600' }}>Call Connect Rate</Text>
              </View>
              <Text variant="titleMedium" style={{ fontWeight: '700', color: '#2563eb' }}>
                {metrics.callMetrics.connectRate}%
              </Text>
            </View>
            <ProgressBar
              progress={metrics.callMetrics.connectRate / 100}
              color="#2563eb"
              style={styles.progressBar}
            />
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              {metrics.callMetrics.connected} connected / {metrics.callMetrics.totalCalls} total calls
            </Text>

            {/* WoW Trend */}
            {metrics.callMetrics.trend.changePercent !== null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
                <Icon
                  name={metrics.callMetrics.trend.changePercent >= 0 ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={metrics.callMetrics.trend.changePercent >= 0 ? '#16a34a' : '#dc2626'}
                />
                <Text
                  variant="labelSmall"
                  style={{
                    fontWeight: '700',
                    color: metrics.callMetrics.trend.changePercent >= 0 ? '#16a34a' : '#dc2626',
                  }}
                >
                  {metrics.callMetrics.trend.changePercent >= 0 ? '+' : ''}{metrics.callMetrics.trend.changePercent}% WoW
                </Text>
              </View>
            )}

            {/* Breakdown */}
            {metrics.callMetrics.notConnected > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {metrics.callMetrics.reasons.no_answer > 0 && (
                  <View style={[styles.callReasonChip, { backgroundColor: '#f59e0b14' }]}>
                    <Text variant="labelSmall" style={{ color: '#f59e0b', fontWeight: '600', fontSize: 10 }}>
                      No Answer: {metrics.callMetrics.reasons.no_answer}
                    </Text>
                  </View>
                )}
                {metrics.callMetrics.reasons.voicemail > 0 && (
                  <View style={[styles.callReasonChip, { backgroundColor: '#6366f114' }]}>
                    <Text variant="labelSmall" style={{ color: '#6366f1', fontWeight: '600', fontSize: 10 }}>
                      Voicemail: {metrics.callMetrics.reasons.voicemail}
                    </Text>
                  </View>
                )}
                {metrics.callMetrics.reasons.wrong_number > 0 && (
                  <View style={[styles.callReasonChip, { backgroundColor: '#dc262614' }]}>
                    <Text variant="labelSmall" style={{ color: '#dc2626', fontWeight: '600', fontSize: 10 }}>
                      Wrong Number: {metrics.callMetrics.reasons.wrong_number}
                    </Text>
                  </View>
                )}
                {metrics.callMetrics.reasons.busy > 0 && (
                  <View style={[styles.callReasonChip, { backgroundColor: '#9ca3af14' }]}>
                    <Text variant="labelSmall" style={{ color: '#9ca3af', fontWeight: '600', fontSize: 10 }}>
                      Busy: {metrics.callMetrics.reasons.busy}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </Surface>
      )}

      {/* Today's Sessions */}
      {todaySessions.length > 0 && (
        <View style={styles.sectionBlock}>
          <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 8 }}>
            Today's Sessions
          </Text>
          {todaySessions.map(session => (
            <TouchableOpacity
              key={session.id}
              onPress={() => onSessionPress(session.id)}
              activeOpacity={0.7}
            >
              <Surface style={[styles.sessionRow, { backgroundColor: theme.colors.surface }]} elevation={1}>
                <View style={styles.sessionRowInner}>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                      {session.started_at ? formatTime(session.started_at) : 'Unknown'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {formatDuration(session.duration_seconds)}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {formatDistance(session.total_distance_meters)}
                      </Text>
                      {session.annotation_count != null && session.annotation_count > 0 && (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {session.annotation_count} notes
                        </Text>
                      )}
                    </View>
                  </View>
                  <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                </View>
              </Surface>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {todaySessions.length === 0 && (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={[styles.cardInner, { alignItems: 'center', paddingVertical: 24 }]}>
            <Icon name="walk" size={32} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              No sessions today. Start prospecting!
            </Text>
          </View>
        </Surface>
      )}

      {/* Inspection Summary */}
      {metrics.inspectionMetrics.totalCompleted > 0 && (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.cardInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon name="home-search" size={18} color="#6366f1" />
              <Text variant="titleSmall" style={{ fontWeight: '600' }}>Inspections</Text>
            </View>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
              {metrics.inspectionMetrics.totalCompleted} completed, avg {metrics.inspectionMetrics.avgAttendees} attendees
            </Text>
          </View>
        </Surface>
      )}
    </View>
  );
}

// ── Weekly View ──────────────────────────────────────────────────────

function WeeklyView({ metrics }: { metrics: ReturnType<typeof useProspectingMetrics> }) {
  const theme = useTheme();

  const wowCards: { label: string; icon: string; color: string; current: number; previous: number; changePercent: number | null; formatFn?: (v: number) => string }[] = [
    {
      label: 'Doors Knocked',
      icon: 'door-open',
      color: '#6366f1',
      current: metrics.thisWeek.doors,
      previous: metrics.lastWeek.doors,
      changePercent: metrics.trends.doors.changePercent,
    },
    {
      label: 'Contacts Created',
      icon: 'account-plus-outline',
      color: '#16a34a',
      current: metrics.thisWeek.contactsCreated,
      previous: metrics.lastWeek.contactsCreated,
      changePercent: metrics.trends.contacts.changePercent,
    },
    {
      label: 'Phone Capture Rate',
      icon: 'phone-check',
      color: '#0d9488',
      current: metrics.thisWeek.phoneCaptureRate,
      previous: metrics.lastWeek.phoneCaptureRate,
      changePercent: metrics.trends.phoneCaptureRate.changePercent,
      formatFn: (v: number) => `${v}%`,
    },
    {
      label: 'Distance Walked',
      icon: 'map-marker-distance',
      color: '#f59e0b',
      current: metrics.thisWeek.distanceMeters,
      previous: metrics.lastWeek.distanceMeters,
      changePercent: metrics.trends.distance.changePercent,
      formatFn: (v: number) => `${(v / 1000).toFixed(1)} km`,
    },
  ];

  // Bar chart data
  const maxDoorsValue = Math.max(...metrics.weeklyDoorsTrend.map(p => p.value), 1);
  const maxBarHeight = 100;

  return (
    <View>
      {/* WoW Comparison Cards */}
      {wowCards.map(card => {
        const displayCurrent = card.formatFn ? card.formatFn(card.current) : String(card.current);
        const displayPrevious = card.formatFn ? card.formatFn(card.previous) : String(card.previous);
        let trendColor = theme.colors.onSurfaceVariant;
        let trendIcon = '';
        let trendText = '\u2014';
        if (card.changePercent !== null) {
          if (card.changePercent >= 0) {
            trendColor = '#16a34a';
            trendIcon = 'trending-up';
            trendText = `+${card.changePercent}%`;
          } else {
            trendColor = '#dc2626';
            trendIcon = 'trending-down';
            trendText = `${card.changePercent}%`;
          }
        }

        return (
          <Surface key={card.label} style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
            <View style={styles.cardInner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <View style={[styles.wowIcon, { backgroundColor: card.color + '14' }]}>
                  <Icon name={card.icon} size={18} color={card.color} />
                </View>
                <Text variant="titleSmall" style={{ fontWeight: '600', flex: 1 }}>{card.label}</Text>
                {trendIcon !== '' && <Icon name={trendIcon} size={18} color={trendColor} />}
                <Text variant="labelMedium" style={{ color: trendColor, fontWeight: '700' }}>{trendText}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <View>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>This Week</Text>
                  <Text variant="titleLarge" style={{ fontWeight: '700', color: card.color }}>{displayCurrent}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Last Week</Text>
                  <Text variant="titleLarge" style={{ fontWeight: '700', color: theme.colors.onSurfaceVariant }}>{displayPrevious}</Text>
                </View>
              </View>
            </View>
          </Surface>
        );
      })}

      {/* 4-Week Doors Trend Bar Chart */}
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.cardInner}>
          <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 12 }}>
            4-Week Doors Trend
          </Text>
          <View style={styles.barChartContainer}>
            {metrics.weeklyDoorsTrend.map((point, idx) => (
              <View key={idx} style={styles.barColumn}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
                  {point.value}
                </Text>
                <View
                  style={{
                    height: maxBarHeight * (point.value / maxDoorsValue) || 2,
                    width: 24,
                    backgroundColor: '#6366f1',
                    borderRadius: 4,
                  }}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, fontSize: 10 }}>
                  {point.weekLabel}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Surface>
    </View>
  );
}

// ── Funnel View ──────────────────────────────────────────────────────

function FunnelView({
  metrics,
  onStreetPress,
}: {
  metrics: ReturnType<typeof useProspectingMetrics>;
  onStreetPress: (lat: number, lng: number) => void;
}) {
  const theme = useTheme();
  const funnel = metrics.funnel;

  const funnelData = [
    { label: 'Field Contacts', value: funnel.fieldContacts, color: '#6366f1', rate: null },
    { label: 'With Phone', value: funnel.withPhone, color: '#16a34a', rate: funnel.rates.phoneCapture },
    { label: 'Appraisals', value: funnel.appraisals, color: '#f59e0b', rate: funnel.rates.contactToAppraisal },
    { label: 'Listed', value: funnel.listed, color: '#2563eb', rate: funnel.rates.appraisalToListed },
    { label: 'Settled', value: funnel.settled, color: '#059669', rate: funnel.rates.listedToSettled },
  ];

  const maxFunnelValue = Math.max(funnel.fieldContacts, 1);

  return (
    <View>
      {/* Conversion Funnel */}
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.cardInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Icon name="filter-variant" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>Conversion Funnel</Text>
          </View>
          {funnelData.map((stage, idx) => {
            const barWidth = Math.max((stage.value / maxFunnelValue) * 100, 8);
            return (
              <View key={stage.label} style={styles.funnelRow}>
                <View style={styles.funnelLabelCol}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }} numberOfLines={1}>
                    {stage.label}
                  </Text>
                </View>
                <View style={styles.funnelBarCol}>
                  <View
                    style={[
                      styles.funnelBar,
                      { width: `${barWidth}%`, backgroundColor: stage.color },
                    ]}
                  >
                    <Text variant="labelSmall" style={styles.funnelBarText}>
                      {stage.value}
                    </Text>
                  </View>
                </View>
                <View style={styles.funnelRateCol}>
                  {stage.rate !== null && (
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      {stage.rate}%
                    </Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      </Surface>

      {/* Inspection Performance */}
      {metrics.inspectionMetrics.totalCompleted > 0 && (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.cardInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <Icon name="home-search" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall" style={{ fontWeight: '700' }}>Inspection Performance</Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
              <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Completed</Text>
                <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                  {metrics.inspectionMetrics.totalCompleted}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Avg Attendees</Text>
                <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                  {metrics.inspectionMetrics.avgAttendees}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <View style={[styles.interestChip, { backgroundColor: '#dc262614' }]}>
                <Text variant="labelSmall" style={{ color: '#dc2626', fontWeight: '700' }}>
                  Hot: {metrics.inspectionMetrics.interestDistribution.hot}
                </Text>
              </View>
              <View style={[styles.interestChip, { backgroundColor: '#f59e0b14' }]}>
                <Text variant="labelSmall" style={{ color: '#f59e0b', fontWeight: '700' }}>
                  Warm: {metrics.inspectionMetrics.interestDistribution.warm}
                </Text>
              </View>
              <View style={[styles.interestChip, { backgroundColor: '#3b82f614' }]}>
                <Text variant="labelSmall" style={{ color: '#3b82f6', fontWeight: '700' }}>
                  Cold: {metrics.inspectionMetrics.interestDistribution.cold}
                </Text>
              </View>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {metrics.inspectionMetrics.attendeeToContactRate}% became contacts
            </Text>
          </View>
        </Surface>
      )}

      {/* Streets to Revisit */}
      {metrics.staleStreets.length > 0 && (
        <View style={styles.sectionBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="road-variant" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>Streets to Revisit</Text>
          </View>
          {metrics.staleStreets.map((street, idx) => {
            let daysColor = theme.colors.onSurfaceVariant;
            let daysLabel = 'Never visited';
            if (street.daysSinceLastContact !== null) {
              if (street.daysSinceLastContact > 30) {
                daysColor = '#dc2626';
              } else if (street.daysSinceLastContact > 7) {
                daysColor = '#f59e0b';
              }
              daysLabel = `${street.daysSinceLastContact}d ago`;
            }

            return (
              <TouchableOpacity
                key={`${street.streetName}-${street.suburb}-${idx}`}
                onPress={() => onStreetPress(street.averageLatitude, street.averageLongitude)}
                activeOpacity={0.7}
              >
                <Surface style={[styles.staleStreetRow, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <View style={styles.staleStreetInner}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {street.streetName}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {street.suburb} - {street.contactCount} contact{street.contactCount !== 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text variant="labelSmall" style={{ color: daysColor, fontWeight: '700' }}>
                        {daysLabel}
                      </Text>
                      <Icon name="map-marker-right" size={16} color={theme.colors.onSurfaceVariant} style={{ marginTop: 2 }} />
                    </View>
                  </View>
                </Surface>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {metrics.staleStreets.length === 0 && (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={[styles.cardInner, { alignItems: 'center', paddingVertical: 24 }]}>
            <Icon name="check-circle-outline" size={32} color="#16a34a" style={{ opacity: 0.6 }} />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              No stale streets. Great coverage!
            </Text>
          </View>
        </Surface>
      )}
    </View>
  );
}

// ── Territory View ───────────────────────────────────────────────────

interface SuburbIntelRow {
  suburb: string;
  totalDwellings: number;
  contactCount: number;
  penetration: number | null;
  medianSalePrice: number | undefined;
  housePct: number;
  unitPct: number;
}

function TerritoryView({
  metrics,
  onAreaPress,
  suburbIntelligence,
  suburbStatsLoading,
}: {
  metrics: ReturnType<typeof useProspectingMetrics>;
  onAreaPress: (lat: number, lng: number) => void;
  suburbIntelligence: SuburbIntelRow[];
  suburbStatsLoading: boolean;
}) {
  const theme = useTheme();
  const [buildingDialogVisible, setBuildingDialogVisible] = useState(false);

  // 12-week trend bar chart
  const maxTrendValue = Math.max(...metrics.monthlyDoorsTrend.map(p => p.value), 1);
  const maxBarHeight = 100;

  return (
    <View>
      {/* Recommended Areas */}
      {metrics.recommendedAreas.length > 0 && (
        <View style={styles.sectionBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="map-marker-star" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>Recommended Areas</Text>
          </View>
          {metrics.recommendedAreas.map((area, idx) => {
            const scoreBg = area.score > 70 ? '#16a34a' : area.score >= 40 ? '#f59e0b' : '#9ca3af';
            let daysLabel = 'Never visited';
            if (area.daysSinceLastContact !== null) {
              daysLabel = `${area.daysSinceLastContact}d ago`;
            }

            return (
              <TouchableOpacity
                key={`${area.streetName}-${area.suburb}-${idx}`}
                onPress={() => onAreaPress(area.averageLatitude, area.averageLongitude)}
                activeOpacity={0.7}
              >
                <Surface style={[styles.staleStreetRow, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <View style={styles.staleStreetInner}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {area.streetName}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {area.suburb} - {area.contactCount} contact{area.contactCount !== 1 ? 's' : ''} - {daysLabel}
                      </Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                        {area.reason}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <View style={[styles.territoryScoreBadge, { backgroundColor: scoreBg }]}>
                        <Text variant="labelSmall" style={{ color: '#ffffff', fontWeight: '700' }}>
                          {area.score}
                        </Text>
                      </View>
                      <Icon name="chevron-right" size={16} color={theme.colors.onSurfaceVariant} />
                    </View>
                  </View>
                </Surface>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {metrics.recommendedAreas.length === 0 && (
        <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={[styles.cardInner, { alignItems: 'center', paddingVertical: 24 }]}>
            <Icon name="map-marker-check" size={32} color="#16a34a" style={{ opacity: 0.6 }} />
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
              No recommended areas yet. Keep prospecting!
            </Text>
          </View>
        </Surface>
      )}

      {/* Suburb Intelligence */}
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.cardInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <Icon name="chart-box-outline" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>Suburb Intelligence</Text>
          </View>

          {suburbStatsLoading && (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <ActivityIndicator size="small" />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                Loading suburb data...
              </Text>
            </View>
          )}

          {!suburbStatsLoading && suburbIntelligence.length === 0 && (
            <View style={{ alignItems: 'center', paddingVertical: 16 }}>
              <Icon name="database-off-outline" size={28} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
                No suburb data available for your contacts yet.
              </Text>
            </View>
          )}

          {!suburbStatsLoading && suburbIntelligence.length > 0 && (
            <>
              {/* Table header */}
              <View style={styles.suburbHeaderRow}>
                <Text variant="labelSmall" style={[styles.suburbCol, { flex: 2, color: theme.colors.onSurfaceVariant }]}>
                  Suburb
                </Text>
                <Text variant="labelSmall" style={[styles.suburbCol, { color: theme.colors.onSurfaceVariant, textAlign: 'right' }]}>
                  Dwellings
                </Text>
                <Text variant="labelSmall" style={[styles.suburbCol, { color: theme.colors.onSurfaceVariant, textAlign: 'right' }]}>
                  Contacts
                </Text>
                <Text variant="labelSmall" style={[styles.suburbCol, { color: theme.colors.onSurfaceVariant, textAlign: 'right' }]}>
                  Penetration
                </Text>
              </View>

              {suburbIntelligence.map((row) => {
                let penColor = '#dc2626'; // red < 1%
                if (row.penetration != null) {
                  if (row.penetration > 5) penColor = '#16a34a'; // green
                  else if (row.penetration >= 1) penColor = '#f59e0b'; // amber
                }

                return (
                  <View key={row.suburb} style={styles.suburbDataRow}>
                    <View style={[styles.suburbCol, { flex: 2 }]}>
                      <Text variant="bodySmall" style={{ fontWeight: '600', color: theme.colors.onSurface }} numberOfLines={1}>
                        {row.suburb}
                      </Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 1 }}>
                        {formatSalePrice(row.medianSalePrice)} med. | {row.housePct}% houses, {row.unitPct}% units
                      </Text>
                    </View>
                    <Text variant="bodySmall" style={[styles.suburbCol, { textAlign: 'right', color: theme.colors.onSurface }]}>
                      {row.totalDwellings.toLocaleString()}
                    </Text>
                    <Text variant="bodySmall" style={[styles.suburbCol, { textAlign: 'right', fontWeight: '600', color: theme.colors.onSurface }]}>
                      {row.contactCount}
                    </Text>
                    <Text variant="bodySmall" style={[styles.suburbCol, { textAlign: 'right', fontWeight: '700', color: penColor }]}>
                      {row.penetration != null ? `${row.penetration}%` : '-'}
                    </Text>
                  </View>
                );
              })}
            </>
          )}
        </View>
      </Surface>

      {/* Building Coverage */}
      {metrics.multiDwellingBuildings.length > 0 && (
        <View style={styles.sectionBlock}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="office-building" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: '700' }}>Building Coverage</Text>
          </View>
          {metrics.multiDwellingBuildings.map((building, idx) => (
            <Surface
              key={`building-${idx}`}
              style={[styles.staleStreetRow, { backgroundColor: theme.colors.surface }]}
              elevation={1}
            >
              <View style={styles.staleStreetInner}>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyMedium" style={{ fontWeight: '600' }} numberOfLines={1}>
                    {building.address}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                    {building.uniqueUnits.map(unit => (
                      <View key={unit} style={[styles.unitChip, { backgroundColor: theme.colors.primaryContainer }]}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onPrimaryContainer, fontSize: 10 }}>
                          {unit}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                    {/* Show `visited / total` to match the map's
                        BuildingActivityDialog. Earlier this just showed a
                        bare "12 units" with no denominator, so the same
                        building looked like 12/12 here but "12/80 (15%)" on
                        the map. When the declared total is unknown, fall
                        back to the previous bare-number presentation. */}
                    {building.estimatedUnits != null
                      ? `${building.totalUnitsVisited}/${building.estimatedUnits} units`
                      : `${building.totalUnitsVisited} units`}
                  </Text>
                  {building.lastVisited && (
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}>
                      {/* Match the format used by BuildingActivityDialog on the
                          map (`day numeric, month short, year numeric`) so the
                          same building displays "5 May 2026" everywhere
                          instead of "5 May" here and "5 May 2026" there. */}
                      {new Date(building.lastVisited).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </Text>
                  )}
                </View>
              </View>
            </Surface>
          ))}
        </View>
      )}

      {/* Multi-Dwelling Quick Add */}
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.cardInner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Icon name="office-building-marker" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ fontWeight: '700', flex: 1 }}>
              Quick Add Multi-Dwelling
            </Text>
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
            Declare a building and bulk-create unit contacts.
          </Text>
          <Button
            mode="contained"
            icon="office-building-plus"
            onPress={() => setBuildingDialogVisible(true)}
          >
            Add multi-dwelling building
          </Button>
        </View>
      </Surface>

      <BuildingActivityDialog
        visible={buildingDialogVisible}
        onDismiss={() => setBuildingDialogVisible(false)}
        initialAddress=""
        initialLatitude={null}
        initialLongitude={null}
        sessionId={null}
        initialMode="declare"
      />

      {/* 12-Week Trend */}
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={styles.cardInner}>
          <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 12 }}>
            12-Week Doors Trend
          </Text>
          <View style={styles.barChartContainer}>
            {metrics.monthlyDoorsTrend.map((point, idx) => (
              <View key={idx} style={styles.barColumn}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4, fontSize: 9 }}>
                  {point.value}
                </Text>
                <View
                  style={{
                    height: maxBarHeight * (point.value / maxTrendValue) || 2,
                    width: 16,
                    backgroundColor: '#6366f1',
                    borderRadius: 3,
                  }}
                />
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, fontSize: 8 }}>
                  {point.weekLabel}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </Surface>
    </View>
  );
}

// ── Sessions View ────────────────────────────────────────────────────

interface SessionItem {
  id: string;
  type: 'tracking' | 'guided';
  date: string;
  durationSeconds: number | undefined;
  distanceMeters: number | undefined;
  stopCount: number;
  name?: string;
  status?: string;
}

function SessionsView({
  sessions,
  routes,
  onSessionPress,
  onRoutePress,
}: {
  sessions: TrackingSession[];
  routes: Route[];
  onSessionPress: (id: string) => void;
  onRoutePress: (id: string) => void;
}) {
  const theme = useTheme();

  const combinedSessions = useMemo(() => {
    const items: SessionItem[] = [];

    // Add completed tracking sessions
    for (const s of sessions) {
      if (!s.completed_at) continue;
      items.push({
        id: s.id,
        type: 'tracking',
        date: s.started_at,
        durationSeconds: s.duration_seconds,
        distanceMeters: s.total_distance_meters,
        stopCount: 0,
      });
    }

    // Add completed routes
    for (const r of routes) {
      // route_stops(count) from Supabase returns [{ count: N }]
      const stopsAgg = (r as any).route_stops;
      let stopCount = 0;
      if (Array.isArray(stopsAgg) && stopsAgg.length > 0 && typeof stopsAgg[0].count === 'number') {
        stopCount = stopsAgg[0].count;
      } else if (r.stops && r.stops.length > 0) {
        stopCount = r.stops.length;
      }

      items.push({
        id: r.id,
        type: 'guided',
        date: r.created_at || r.started_at || '',
        durationSeconds: r.estimated_duration_minutes ? r.estimated_duration_minutes * 60 : undefined,
        distanceMeters: undefined,
        stopCount,
        name: r.name,
        status: r.status,
      });
    }

    // Sort by date descending
    items.sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });

    return items;
  }, [sessions, routes]);

  const formatSessionDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  const renderItem = useCallback(({ item }: { item: SessionItem }) => {
    const isTracking = item.type === 'tracking';
    const badgeColor = isTracking ? theme.colors.tertiaryContainer : theme.colors.primaryContainer;
    const badgeTextColor = isTracking ? theme.colors.onTertiaryContainer : theme.colors.onPrimaryContainer;

    return (
      <TouchableOpacity
        onPress={() => isTracking ? onSessionPress(item.id) : onRoutePress(item.id)}
        activeOpacity={0.7}
      >
        <Surface style={styles.sessionRow} elevation={1}>
          <View style={styles.sessionRowInner}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Text variant="bodyMedium" style={{ fontWeight: '600' }}>
                  {item.name || formatSessionDate(item.date)}
                </Text>
                <Chip
                  compact
                  style={{ backgroundColor: badgeColor, height: 24 }}
                  textStyle={{ color: badgeTextColor, fontSize: 10 }}
                >
                  {isTracking ? 'Tracking' : 'Guided'}
                </Chip>
                {item.status && item.status !== 'completed' && (
                  <Chip
                    compact
                    style={{ backgroundColor: theme.colors.surfaceVariant, height: 24 }}
                    textStyle={{ color: theme.colors.onSurfaceVariant, fontSize: 10 }}
                  >
                    {item.status === 'planned' ? 'Planned' : 'In Progress'}
                  </Chip>
                )}
              </View>
              {item.name && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}>
                  {formatSessionDate(item.date)}
                </Text>
              )}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 2 }}>
                {item.durationSeconds != null && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {formatDuration(item.durationSeconds)}
                  </Text>
                )}
                {item.distanceMeters != null && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {formatDistance(item.distanceMeters)}
                  </Text>
                )}
                {item.stopCount > 0 && (
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {item.stopCount} stop{item.stopCount !== 1 ? 's' : ''}
                  </Text>
                )}
              </View>
            </View>
            <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
          </View>
        </Surface>
      </TouchableOpacity>
    );
  }, [theme, onSessionPress, onRoutePress]);

  if (combinedSessions.length === 0) {
    return (
      <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
        <View style={[styles.cardInner, { alignItems: 'center', paddingVertical: 32 }]}>
          <Icon name="history" size={40} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
          <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
            No sessions yet
          </Text>
          <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}>
            Start tracking or create a guided route to see your session history here.
          </Text>
        </View>
      </Surface>
    );
  }

  return (
    <View>
      <Text variant="titleSmall" style={{ fontWeight: '700', marginBottom: 8 }}>
        All Sessions ({combinedSessions.length})
      </Text>
      <FlatList
        data={combinedSessions}
        keyExtractor={(item) => `${item.type}-${item.id}`}
        renderItem={renderItem}
        scrollEnabled={false}
      />
    </View>
  );
}

// ── Shared Stat Cell ─────────────────────────────────────────────────

function StatCell({
  icon,
  label,
  value,
  color,
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
  trend: { changePercent: number | null } | null;
}) {
  const theme = useTheme();

  let trendText = '';
  let trendColor = theme.colors.onSurfaceVariant;
  if (trend && trend.changePercent !== null) {
    if (trend.changePercent >= 0) {
      trendText = `\u25B2 +${trend.changePercent}%`;
      trendColor = '#16a34a';
    } else {
      trendText = `\u25BC ${trend.changePercent}%`;
      trendColor = '#dc2626';
    }
  } else if (trend) {
    trendText = '\u2014';
  }

  return (
    <Surface style={[styles.statCell, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.statCellInner}>
        <View style={[styles.statIconBg, { backgroundColor: color + '14' }]}>
          <Icon name={icon} size={20} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{label}</Text>
          <Text variant="titleMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>{value}</Text>
          {trendText !== '' && (
            <Text variant="labelSmall" style={{ color: trendColor, fontWeight: '600', marginTop: 1 }}>
              {trendText}
            </Text>
          )}
        </View>
      </View>
    </Surface>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 80,
  },
  // Start actions
  startActionsContainer: {
    marginBottom: 16,
    gap: 8,
  },
  startActionCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  startActionCardSecondary: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  startActionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  startActionIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  tierChipOnPrimary: {
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  // Active session card
  activeSessionCard: {
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
  },
  activeSessionInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  segmentContainer: {
    marginBottom: 16,
  },

  // Stat grid (shared by Daily)
  statGrid: {
    gap: 8,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCell: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  statCellInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Cards
  card: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 14,
  },

  // Progress bar
  progressBar: {
    height: 6,
    borderRadius: 3,
  },

  // Sessions
  sectionBlock: {
    marginTop: 4,
    marginBottom: 12,
  },
  sessionRow: {
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  sessionRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },

  // Weekly WoW
  wowIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Bar chart
  barChartContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 140,
    paddingTop: 16,
  },
  barColumn: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'flex-end',
  },

  // Funnel
  funnelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  funnelLabelCol: {
    width: 90,
  },
  funnelBarCol: {
    flex: 1,
    marginHorizontal: 8,
  },
  funnelBar: {
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    paddingHorizontal: 8,
    minWidth: 32,
  },
  funnelBarText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 11,
  },
  funnelRateCol: {
    width: 36,
    alignItems: 'flex-end',
  },

  // Call reason chips
  callReasonChip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },

  // Interest chips (inspection performance)
  interestChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    flex: 1,
    alignItems: 'center',
  },

  // Territory view
  territoryScoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 32,
    alignItems: 'center',
  },
  unitChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  // Stale streets
  staleStreetRow: {
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  staleStreetInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },

  // Suburb Intelligence table
  suburbHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.12)',
    marginBottom: 4,
  },
  suburbDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  suburbCol: {
    flex: 1,
    paddingHorizontal: 2,
  },
});
