import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { FAB, useTheme, Text, Chip, ActivityIndicator, Surface, Button, Portal, Dialog, TextInput } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useRouteStore, useTrackingStore } from '@realestate-crm/hooks';
import type { Route } from '@realestate-crm/types';
import type { TrackingSession } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const STATUS_LABELS: Record<Route['status'], string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export default function RoutesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const routes = useRouteStore(state => state.routes);
  const isLoading = useRouteStore(state => state.isLoading);
  const fetchRoutes = useRouteStore(state => state.fetchRoutes);

  const activeSession = useTrackingStore(state => state.activeSession);
  const sessions = useTrackingStore(state => state.sessions);
  const startSession = useTrackingStore(state => state.startSession);
  const stopSession = useTrackingStore(state => state.stopSession);
  const fetchSessions = useTrackingStore(state => state.fetchSessions);
  const createAnnotation = useTrackingStore(state => state.createAnnotation);

  const [refreshing, setRefreshing] = useState(false);
  const [elapsed, setElapsed] = useState('00:00');
  const [stoppingSession, setStoppingSession] = useState(false);

  // Drop Note dialog state
  const [noteDialogVisible, setNoteDialogVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      fetchRoutes();
      fetchSessions();
    }, [fetchRoutes, fetchSessions])
  );

  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => {
      const diff = Math.floor(
        (Date.now() - new Date(activeSession.started_at).getTime()) / 1000
      );
      const hrs = Math.floor(diff / 3600);
      const mins = Math.floor((diff % 3600) / 60);
      const secs = diff % 60;
      setElapsed(
        hrs > 0
          ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
          : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchRoutes(), fetchSessions()]);
    setRefreshing(false);
  }, [fetchRoutes, fetchSessions]);

  const handleRoutePress = useCallback((route: Route) => {
    router.push(`/route/${route.id}`);
  }, [router]);

  const handleAddRoute = () => {
    router.push('/route/new');
  };

  const handleStartTracking = async () => {
    await startSession();
  };

  const handleStopTracking = async () => {
    setStoppingSession(true);
    const session = await stopSession();
    setStoppingSession(false);
    if (session) {
      router.push(`/tracking/${session.id}`);
    }
  };

  const handleDropNote = () => {
    setNoteText('');
    setNoteDialogVisible(true);
  };

  const handleNoteCancel = () => {
    setNoteText('');
    setNoteDialogVisible(false);
  };

  const handleNoteSave = async () => {
    if (!noteText.trim() || !activeSession) return;

    setNoteSaving(true);
    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      await createAnnotation({
        session_id: activeSession.id,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        note: noteText.trim(),
      });

      setNoteText('');
      setNoteDialogVisible(false);
    } catch (error) {
      console.error('Error dropping note:', error);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleSessionPress = (session: TrackingSession) => {
    router.push(`/tracking/${session.id}`);
  };

  const getStatusChipStyle = (status: Route['status']) => {
    switch (status) {
      case 'planned':
        return { backgroundColor: theme.colors.surfaceVariant };
      case 'in_progress':
        return { backgroundColor: theme.colors.primaryContainer };
      case 'completed':
        return { backgroundColor: theme.colors.tertiaryContainer };
    }
  };

  const getStatusTextColor = (status: Route['status']) => {
    switch (status) {
      case 'planned':
        return theme.colors.onSurfaceVariant;
      case 'in_progress':
        return theme.colors.onPrimaryContainer;
      case 'completed':
        return theme.colors.onTertiaryContainer;
    }
  };

  const getStopCount = (route: Route): number => {
    // route_stops(count) from Supabase returns [{ count: N }]
    const stopsAgg = (route as any).route_stops;
    if (Array.isArray(stopsAgg) && stopsAgg.length > 0 && typeof stopsAgg[0].count === 'number') {
      return stopsAgg[0].count;
    }
    // Fallback to stops array length if populated
    if (route.stops && route.stops.length > 0) {
      return route.stops.length;
    }
    return 0;
  };

  const renderItem = useCallback(({ item }: { item: Route }) => {
    const stopCount = getStopCount(item);
    const modeIcon = item.mode === 'driving' ? 'car' : 'walk';

    return (
      <Surface style={styles.card} elevation={1}>
        <View
          style={styles.cardTouchable}
          onTouchEnd={() => handleRoutePress(item)}
          accessible
          accessibilityRole="button"
          accessibilityLabel={`Route: ${item.name}, ${STATUS_LABELS[item.status]}`}
        >
          <View style={styles.cardContent}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Icon
                  name={modeIcon}
                  size={20}
                  color={theme.colors.onSurfaceVariant}
                  style={styles.modeIcon}
                />
                <Text variant="titleMedium" numberOfLines={1} style={styles.routeName}>
                  {item.name}
                </Text>
              </View>
              <Chip
                compact
                style={getStatusChipStyle(item.status)}
                textStyle={{ color: getStatusTextColor(item.status), fontSize: 11 }}
              >
                {STATUS_LABELS[item.status]}
              </Chip>
            </View>

            <View style={styles.metaRow}>
              {stopCount > 0 && (
                <View style={styles.metaItem}>
                  <Icon name="map-marker" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                    {stopCount} stop{stopCount !== 1 ? 's' : ''}
                  </Text>
                </View>
              )}
              {item.estimated_duration_minutes != null && (
                <View style={styles.metaItem}>
                  <Icon name="clock-outline" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                    {item.estimated_duration_minutes} min
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </Surface>
    );
  }, [theme.colors, handleRoutePress]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        No routes yet
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
        Tap + to plan your first door-knock route
      </Text>
    </View>
  );

  const formatSessionDuration = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  };

  const formatSessionDistance = (meters: number): string => {
    if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
    return `${Math.round(meters)} m`;
  };

  const formatSessionDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
  };

  const renderTrackingBanner = () => (
    <Surface
      style={[
        styles.trackingBanner,
        activeSession
          ? { backgroundColor: theme.colors.primaryContainer }
          : undefined,
      ]}
      elevation={activeSession ? 2 : 1}
    >
      {activeSession ? (
        <View style={styles.trackingBannerContent}>
          <View style={styles.trackingInfo}>
            <Icon name="record-circle-outline" size={20} color={theme.colors.error} style={{ marginRight: 8 }} />
            <View>
              <Text variant="titleSmall" style={{ color: theme.colors.onPrimaryContainer }}>
                Tracking Active
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onPrimaryContainer }}>
                {elapsed}
              </Text>
            </View>
          </View>
          <View style={styles.trackingActions}>
            <Button
              mode="contained"
              buttonColor="#F59E0B"
              textColor="#FFFFFF"
              onPress={handleDropNote}
              compact
              icon="note-edit-outline"
            >
              Note
            </Button>
            <Button
              mode="contained"
              buttonColor={theme.colors.error}
              textColor={theme.colors.onError}
              onPress={handleStopTracking}
              loading={stoppingSession}
              disabled={stoppingSession}
              compact
            >
              Stop
            </Button>
          </View>
        </View>
      ) : (
        <Button
          mode="contained-tonal"
          icon="map-marker-path"
          onPress={handleStartTracking}
          style={{ alignSelf: 'stretch' }}
        >
          Start Tracking
        </Button>
      )}
    </Surface>
  );

  const renderSessionHistory = () => {
    const completedSessions = sessions
      .filter(s => s.completed_at != null)
      .slice(0, 5);

    if (completedSessions.length === 0) return null;

    return (
      <View style={{ marginTop: 16 }}>
        <Text
          variant="titleSmall"
          style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}
        >
          Recent Sessions
        </Text>
        {completedSessions.map(session => (
          <Surface key={session.id} style={styles.card} elevation={1}>
            <View
              style={styles.cardTouchable}
              onTouchEnd={() => handleSessionPress(session)}
              accessible
              accessibilityRole="button"
              accessibilityLabel={`Session: ${formatSessionDate(session.started_at)}`}
            >
              <View style={styles.cardContent}>
                <View style={styles.cardHeader}>
                  <View style={styles.titleRow}>
                    <Icon
                      name="map-marker-path"
                      size={20}
                      color={theme.colors.onSurfaceVariant}
                      style={styles.modeIcon}
                    />
                    <Text variant="titleMedium" numberOfLines={1} style={styles.routeName}>
                      {formatSessionDate(session.started_at)}
                    </Text>
                  </View>
                  <Chip
                    compact
                    style={{ backgroundColor: theme.colors.tertiaryContainer }}
                    textStyle={{ color: theme.colors.onTertiaryContainer, fontSize: 11 }}
                  >
                    Session
                  </Chip>
                </View>

                <View style={styles.metaRow}>
                  {session.duration_seconds != null && (
                    <View style={styles.metaItem}>
                      <Icon name="clock-outline" size={14} color={theme.colors.onSurfaceVariant} />
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                        {formatSessionDuration(session.duration_seconds)}
                      </Text>
                    </View>
                  )}
                  {session.total_distance_meters != null && (
                    <View style={styles.metaItem}>
                      <Icon name="map-marker-distance" size={14} color={theme.colors.onSurfaceVariant} />
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                        {formatSessionDistance(session.total_distance_meters)}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </Surface>
        ))}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={routes}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderTrackingBanner}
          ListFooterComponent={renderSessionHistory}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={routes.length === 0 ? styles.emptyList : styles.list}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        />
      )}

      {activeSession && (
        <FAB
          icon="note-edit-outline"
          label="Drop Note"
          style={[styles.dropNoteFab, { bottom: insets.bottom + 88 }]}
          color="#FFFFFF"
          onPress={handleDropNote}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: insets.bottom + 24 }]}
        color={theme.colors.onPrimary}
        onPress={handleAddRoute}
      />

      <Portal>
        <Dialog visible={noteDialogVisible} onDismiss={handleNoteCancel}>
          <Dialog.Title>Drop Note</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Pin a note at your current location.
            </Text>
            <TextInput
              mode="outlined"
              label="Note"
              placeholder="What did you observe here?"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={3}
              autoFocus
              style={{ maxHeight: 120 }}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleNoteCancel} disabled={noteSaving}>Cancel</Button>
            <Button
              mode="contained"
              buttonColor="#F59E0B"
              textColor="#FFFFFF"
              onPress={handleNoteSave}
              loading={noteSaving}
              disabled={!noteText.trim() || noteSaving}
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingTop: 8,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 32,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    marginBottom: 12,
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardTouchable: {
    padding: 16,
  },
  cardContent: {
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  modeIcon: {
    marginRight: 8,
  },
  routeName: {
    fontWeight: '600',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
  trackingBanner: {
    marginBottom: 12,
    borderRadius: 12,
    padding: 12,
  },
  trackingBannerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trackingActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dropNoteFab: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#F59E0B',
  },
});
