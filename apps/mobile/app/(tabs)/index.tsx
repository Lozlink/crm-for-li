import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useTheme, Text, Surface, ProgressBar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import {
  useTaskStore, usePropertyStore, useCRMStore, useAuthStore, useInspectionStore, useTrackingStore,
  useProspectingMetrics,
} from '@realestate-crm/hooks';
import type { Task, Property, Contact, Inspection, TrackingSession } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// ── Helpers ──────────────────────────────────────────────────────────

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function isOverdue(dueAt: string | undefined, status: string): boolean {
  if (!dueAt || status === 'completed') return false;
  return new Date(dueAt) < new Date();
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(price: number): string {
  if (price >= 1_000_000) return `$${(price / 1_000_000).toFixed(1)}M`;
  if (price >= 1_000) return `$${(price / 1_000).toFixed(0)}K`;
  return `$${price}`;
}

function getContactName(contact: { first_name: string; last_name?: string } | undefined): string {
  if (!contact) return '';
  return [contact.first_name, contact.last_name].filter(Boolean).join(' ');
}

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

// ── Quick Actions ────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  { key: 'contact', icon: 'account-plus', label: 'Add Contact', route: '/contact/new', color: '#6366f1' },
  { key: 'route', icon: 'map-marker-path', label: 'Go Prospect', route: '/(tabs)/prospecting', color: '#10b981' },
  { key: 'task', icon: 'checkbox-marked-circle-plus-outline', label: 'New Task', route: '/(tabs)/tasks', color: '#f59e0b' },
  { key: 'property', icon: 'home-plus', label: 'Add Listing', route: '/property/new', color: '#3b82f6' },
] as const;

// ── Component ────────────────────────────────────────────────────────

export default function TodayScreen() {
  const theme = useTheme();
  const router = useRouter();

  const currentUserId = useAuthStore(s => s.user?.id);
  const profile = useAuthStore(s => s.profile);
  const isDemoMode = useAuthStore(s => s.isDemoMode);

  const tasks = useTaskStore(s => s.tasks);
  const fetchTasks = useTaskStore(s => s.fetchTasks);
  const completeTask = useTaskStore(s => s.completeTask);

  const properties = usePropertyStore(s => s.properties);
  const fetchProperties = usePropertyStore(s => s.fetchProperties);

  const contacts = useCRMStore(s => s.contacts);
  const fetchContacts = useCRMStore(s => s.fetchContacts);

  const inspections = useInspectionStore(s => s.inspections);
  const fetchInspections = useInspectionStore(s => s.fetchInspections);

  const activeSession = useTrackingStore(s => s.activeSession);
  const sessions = useTrackingStore(s => s.sessions);
  const fetchSessions = useTrackingStore(s => s.fetchSessions);
  const startSession = useTrackingStore(s => s.startSession);

  // Staleness guard: skip re-fetching on every focus if data is less than 30 s old.
  // Pull-to-refresh resets the timer so manual overrides always go through.
  const lastFetchAt = useRef<number>(0);

  // Pull-to-refresh
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    lastFetchAt.current = 0; // force re-fetch on next focus too
    setRefreshing(true);
    await Promise.all([fetchTasks(), fetchProperties(), fetchContacts(), fetchInspections(), fetchSessions()]);
    lastFetchAt.current = Date.now();
    setRefreshing(false);
  }, [fetchTasks, fetchProperties, fetchContacts, fetchInspections, fetchSessions]);

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - lastFetchAt.current < 30_000) return;
      lastFetchAt.current = Date.now();
      fetchTasks();
      fetchProperties();
      fetchContacts();
      fetchInspections();
      fetchSessions();
    }, [fetchTasks, fetchProperties, fetchContacts, fetchInspections, fetchSessions])
  );

  // ── Derived data ──────────────────────────────────────────────────

  const displayName = isDemoMode
    ? 'Demo'
    : profile?.display_name?.split(' ')[0] || 'there';

  const overdueTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== 'completed' && isOverdue(t.due_at, t.status))
      .filter(t => !currentUserId || t.assigned_to === currentUserId)
      .sort((a, b) => {
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
      })
      .slice(0, 5);
  }, [tasks, currentUserId]);

  const todayTasks = useMemo(() => {
    return tasks
      .filter(t => t.status !== 'completed' && t.due_at && isToday(t.due_at) && !isOverdue(t.due_at, t.status))
      .filter(t => !currentUserId || t.assigned_to === currentUserId)
      .sort((a, b) => new Date(a.due_at!).getTime() - new Date(b.due_at!).getTime())
      .slice(0, 5);
  }, [tasks, currentUserId]);

  const todayInspections = useMemo(() => {
    return inspections
      .filter(i => i.status !== 'cancelled' && isToday(i.scheduled_at))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [inspections]);

  const pipelineStats = useMemo(() => {
    const active = properties.filter(p => p.status !== 'withdrawn' && p.status !== 'settled' && p.status !== 'leased');
    const appraisals = active.filter(p => p.status === 'appraisal').length;
    const listed = active.filter(p => p.status === 'available').length;
    const underOffer = active.filter(p => p.status === 'under_offer' || p.status === 'exchanged').length;
    const totalValue = active.reduce((sum, p) => sum + (p.advertised_price ?? p.appraisal_price ?? 0), 0);
    return { appraisals, listed, underOffer, totalValue, total: active.length };
  }, [properties]);

  const recentContacts = useMemo(() => {
    return [...contacts]
      .filter(c => c.first_name)
      .sort((a, b) => {
        const aDate = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bDate = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bDate - aDate;
      })
      .slice(0, 4);
  }, [contacts]);

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => {
        const aTime = a.started_at ? new Date(a.started_at).getTime() : 0;
        const bTime = b.started_at ? new Date(b.started_at).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 3);
  }, [sessions]);

  const urgentCount = overdueTasks.length;

  const prospecting = useProspectingMetrics();

  // ── Render ────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Greeting */}
      <Text variant="headlineSmall" style={[styles.greeting, { color: theme.colors.onBackground }]}>
        Hey {displayName}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 20, marginHorizontal: 16 }}>
        {urgentCount > 0
          ? `You have ${urgentCount} overdue item${urgentCount > 1 ? 's' : ''} that need${urgentCount === 1 ? 's' : ''} attention.`
          : 'You\'re all caught up. Time to prospect!'}
      </Text>

      {/* Streak Banner */}
      <View style={styles.section}>
        {prospecting.streak.currentDays > 0 || prospecting.streak.isActiveToday ? (
          <Surface
            style={[
              styles.streakBanner,
              {
                backgroundColor: prospecting.streak.currentDays > 3
                  ? theme.colors.primaryContainer
                  : theme.colors.surfaceVariant,
              },
            ]}
            elevation={1}
          >
            <View style={styles.streakBannerInner}>
              <Icon name="fire" size={28} color="#f59e0b" />
              <View style={styles.streakBannerCenter}>
                <Text variant="titleSmall" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                  {prospecting.streak.currentDays}-day streak
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Best: {prospecting.streak.longestDays} days
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text variant="labelMedium" style={{ fontWeight: '700', color: theme.colors.onSurface }}>
                  {prospecting.thisWeek.doors}/50
                </Text>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  this week
                </Text>
              </View>
            </View>
          </Surface>
        ) : (
          <Surface
            style={[styles.streakBanner, { backgroundColor: theme.colors.surfaceVariant }]}
            elevation={1}
          >
            <View style={styles.streakBannerInner}>
              <Icon name="fire" size={28} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
              <View style={styles.streakBannerCenter}>
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                  Start a streak! Prospect today to begin.
                </Text>
              </View>
            </View>
          </Surface>
        )}
      </View>

      {/* Today's Prospecting */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Icon name="chart-timeline-variant" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ color: theme.colors.onBackground, fontWeight: '700', marginLeft: 6 }}>
              Today's Prospecting
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/prospecting' as never)}>
            <Text variant="labelMedium" style={{ color: theme.colors.primary }}>Details</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.prospectingGrid}>
          <View style={styles.prospectingRow}>
            <ProspectingStatCell
              icon="door-open"
              label="Doors"
              value={String(prospecting.today.doors)}
              color="#6366f1"
              trend={prospecting.trends.doors}
            />
            <ProspectingStatCell
              icon="walk"
              label="Sessions"
              value={String(prospecting.today.sessions)}
              color="#0d9488"
              trend={null}
            />
          </View>
          <View style={styles.prospectingRow}>
            <ProspectingStatCell
              icon="map-marker-distance"
              label="Distance"
              value={`${(prospecting.today.distanceMeters / 1000).toFixed(1)} km`}
              color="#f59e0b"
              trend={prospecting.trends.distance}
            />
            <ProspectingStatCell
              icon="account-plus-outline"
              label="Contacts"
              value={String(prospecting.today.contactsCreated)}
              color="#16a34a"
              trend={prospecting.trends.contacts}
            />
          </View>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActionsRow}>
        {QUICK_ACTIONS.map(action => (
          <TouchableOpacity
            key={action.key}
            style={styles.quickAction}
            onPress={() => router.push(action.route as never)}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIcon, { backgroundColor: action.color + '14' }]}>
              <Icon name={action.icon} size={22} color={action.color} />
            </View>
            <Text variant="labelSmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, marginTop: 6, textAlign: 'center' }}>
              {action.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tracking / Field Activity */}
      {!activeSession && (
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.startTrackingCard, { backgroundColor: theme.colors.primaryContainer }]}
            onPress={() => {
              Alert.alert(
                'Start Tracking',
                'This will record your location in the background for field prospecting. Continue?',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Start', onPress: () => startSession() },
                ],
              );
            }}
            activeOpacity={0.8}
          >
            <View style={styles.startTrackingLeft}>
              <Icon name="walk" size={28} color={theme.colors.onPrimaryContainer} />
              <View style={{ marginLeft: 12 }}>
                <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700' }}>
                  Start Prospecting
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer, opacity: 0.7 }}>
                  Track your field activity, drop notes, add contacts
                </Text>
              </View>
            </View>
            <Icon name="play-circle" size={32} color={theme.colors.onPrimaryContainer} />
          </TouchableOpacity>
          {recentSessions.length > 0 && (
            <View style={styles.recentSessionsRow}>
              {recentSessions.map(session => (
                <TouchableOpacity
                  key={session.id}
                  style={[styles.sessionChip, { backgroundColor: theme.colors.surfaceVariant }]}
                  onPress={() => router.push(`/tracking/${session.id}` as never)}
                  activeOpacity={0.7}
                >
                  <Icon name="map-marker-path" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                    {formatDistance(session.total_distance_meters)} · {formatDuration(session.duration_seconds)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Overdue Tasks */}
      {overdueTasks.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Icon name="alert-circle" size={18} color="#dc2626" />
              <Text variant="titleSmall" style={{ color: '#dc2626', fontWeight: '700', marginLeft: 6 }}>
                Overdue ({overdueTasks.length})
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/tasks' as never)}>
              <Text variant="labelMedium" style={{ color: theme.colors.primary }}>See All</Text>
            </TouchableOpacity>
          </View>
          {overdueTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isOverdue
              onPress={() => router.push('/(tabs)/tasks' as never)}
              onComplete={() => completeTask(task.id)}
            />
          ))}
        </View>
      )}

      {/* Today's Schedule */}
      {(todayTasks.length > 0 || todayInspections.length > 0) && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Icon name="calendar-today" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall" style={{ color: theme.colors.onBackground, fontWeight: '700', marginLeft: 6 }}>
                Today
              </Text>
            </View>
          </View>
          {todayInspections.map(inspection => (
            <InspectionCard
              key={inspection.id}
              inspection={inspection}
              onPress={() => router.push(`/inspection/${inspection.id}` as never)}
            />
          ))}
          {todayTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onPress={() => router.push('/(tabs)/tasks' as never)}
              onComplete={() => completeTask(task.id)}
            />
          ))}
        </View>
      )}

      {/* Pipeline Snapshot */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Icon name="chart-timeline-variant-shimmer" size={18} color={theme.colors.primary} />
            <Text variant="titleSmall" style={{ color: theme.colors.onBackground, fontWeight: '700', marginLeft: 6 }}>
              Pipeline
            </Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/(tabs)/pipeline' as never)}>
            <Text variant="labelMedium" style={{ color: theme.colors.primary }}>View Board</Text>
          </TouchableOpacity>
        </View>
        <Surface style={[styles.pipelineCard, { backgroundColor: theme.colors.surface }]} elevation={1}>
          <View style={styles.pipelineStages}>
            <PipelineStat label="Appraisals" count={pipelineStats.appraisals} color="#6366f1" />
            <View style={[styles.pipelineDivider, { backgroundColor: theme.colors.outlineVariant }]} />
            <PipelineStat label="Listed" count={pipelineStats.listed} color="#16a34a" />
            <View style={[styles.pipelineDivider, { backgroundColor: theme.colors.outlineVariant }]} />
            <PipelineStat label="Under Offer" count={pipelineStats.underOffer} color="#f59e0b" />
          </View>
          <View style={[styles.pipelineTotal, { borderTopColor: theme.colors.outlineVariant }]}>
            <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Total Pipeline Value
            </Text>
            <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              {pipelineStats.totalValue > 0 ? formatPrice(pipelineStats.totalValue) : '$0'}
            </Text>
          </View>
        </Surface>
      </View>

      {/* Where to Go Next */}
      {prospecting.recommendedAreas.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Icon name="map-marker-star" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall" style={{ color: theme.colors.onBackground, fontWeight: '700', marginLeft: 6 }}>
                Where to Go Next
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/prospecting' as never)}>
              <Text variant="labelMedium" style={{ color: theme.colors.primary }}>See All</Text>
            </TouchableOpacity>
          </View>
          {prospecting.recommendedAreas.slice(0, 3).map((area, idx) => {
            const scoreBg = area.score > 70 ? '#16a34a' : area.score >= 40 ? '#f59e0b' : '#9ca3af';
            return (
              <TouchableOpacity
                key={`${area.streetName}-${area.suburb}-${idx}`}
                activeOpacity={0.7}
                onPress={() => router.push(`/(tabs)/map?lat=${area.averageLatitude}&lng=${area.averageLongitude}&zoom=0.01&layer=contacts` as never)}
              >
                <Surface style={[styles.recommendedAreaRow, { backgroundColor: theme.colors.surface }]} elevation={1}>
                  <View style={styles.recommendedAreaInner}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyMedium" style={{ fontWeight: '600' }} numberOfLines={1}>
                        {area.streetName}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {area.suburb}
                      </Text>
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                        {area.reason}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'center', gap: 4 }}>
                      <View style={[styles.scoreBadge, { backgroundColor: scoreBg }]}>
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

      {/* Recent Contacts */}
      {recentContacts.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Icon name="account-clock" size={18} color={theme.colors.primary} />
              <Text variant="titleSmall" style={{ color: theme.colors.onBackground, fontWeight: '700', marginLeft: 6 }}>
                Recent Contacts
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push('/(tabs)/contacts' as never)}>
              <Text variant="labelMedium" style={{ color: theme.colors.primary }}>All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.recentContactsRow}>
            {recentContacts.map(contact => (
              <TouchableOpacity
                key={contact.id}
                style={styles.recentContact}
                onPress={() => router.push(`/contact/${contact.id}`)}
                activeOpacity={0.7}
              >
                <View style={[styles.contactAvatar, { backgroundColor: theme.colors.primaryContainer }]}>
                  <Text style={{ color: theme.colors.onPrimaryContainer, fontWeight: '700', fontSize: 14 }}>
                    {contact.first_name?.[0]?.toUpperCase() || '?'}
                  </Text>
                </View>
                <Text
                  variant="labelSmall"
                  numberOfLines={1}
                  style={{ color: theme.colors.onSurface, marginTop: 4, textAlign: 'center', maxWidth: 72 }}
                >
                  {contact.first_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

function TaskCard({
  task,
  isOverdue,
  onPress,
  onComplete,
}: {
  task: Task;
  isOverdue?: boolean;
  onPress: () => void;
  onComplete: () => void;
}) {
  const theme = useTheme();
  const contactName = getContactName(task.contact);

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <Surface
        style={[
          styles.taskCard,
          isOverdue && { borderLeftColor: '#dc2626', borderLeftWidth: 3 },
        ]}
        elevation={1}
      >
        <View style={styles.taskCardInner}>
          <View style={{ flex: 1 }}>
            <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '600' }}>
              {task.title}
            </Text>
            <View style={styles.taskMeta}>
              {task.due_at && (
                <Text variant="bodySmall" style={{ color: isOverdue ? '#dc2626' : theme.colors.onSurfaceVariant }}>
                  {formatTime(task.due_at)}
                </Text>
              )}
              {contactName ? (
                <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant }}>
                  {contactName}
                </Text>
              ) : null}
            </View>
          </View>
          <TouchableOpacity onPress={onComplete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Icon name="check-circle-outline" size={24} color="#16a34a" />
          </TouchableOpacity>
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

function InspectionCard({
  inspection,
  onPress,
}: {
  inspection: Inspection;
  onPress: () => void;
}) {
  const theme = useTheme();
  const address = inspection.property?.address || 'Unknown property';

  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
      <Surface
        style={[styles.taskCard, { borderLeftColor: '#6366f1', borderLeftWidth: 3 }]}
        elevation={1}
      >
        <View style={styles.taskCardInner}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Icon name="home-search" size={16} color="#6366f1" />
              <Text variant="bodyMedium" numberOfLines={1} style={{ fontWeight: '600', flex: 1 }}>
                {address}
              </Text>
            </View>
            <View style={styles.taskMeta}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {formatTime(inspection.scheduled_at)} · {inspection.type === 'open_home' ? 'Open Home' : 'Private'} · {inspection.duration_minutes}min
              </Text>
            </View>
          </View>
          <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
        </View>
      </Surface>
    </TouchableOpacity>
  );
}

function ProspectingStatCell({
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
    <Surface style={[styles.prospectingCell, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <View style={styles.prospectingCellInner}>
        <View style={[styles.prospectingIconBg, { backgroundColor: color + '14' }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
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

function PipelineStat({ label, count, color }: { label: string; count: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={styles.pipelineStatItem}>
      <Text variant="headlineSmall" style={{ color, fontWeight: '700' }}>
        {count}
      </Text>
      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
        {label}
      </Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  greeting: {
    fontWeight: '700',
    marginHorizontal: 16,
    marginBottom: 2,
  },

  // Quick actions
  quickActionsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 20,
    gap: 12,
  },
  quickAction: {
    flex: 1,
    alignItems: 'center',
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sections
  section: {
    marginBottom: 20,
    paddingHorizontal: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Task cards
  taskCard: {
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  taskCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 12,
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },

  // Pipeline
  pipelineCard: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  pipelineStages: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 8,
  },
  pipelineStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  pipelineDivider: {
    width: 1,
    alignSelf: 'stretch',
  },
  pipelineTotal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Tracking
  startTrackingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
  },
  startTrackingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  recentSessionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  sessionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },

  // Prospecting grid
  prospectingGrid: {
    gap: 8,
  },
  prospectingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  prospectingCell: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  prospectingCellInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
  },
  prospectingIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Streak banner
  streakBanner: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  streakBannerInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  streakBannerCenter: {
    flex: 1,
  },

  // Recommended areas
  recommendedAreaRow: {
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  recommendedAreaInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  scoreBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 32,
    alignItems: 'center',
  },

  // Recent contacts
  recentContactsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  recentContact: {
    alignItems: 'center',
  },
  contactAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
