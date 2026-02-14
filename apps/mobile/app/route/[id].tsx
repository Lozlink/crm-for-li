import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Dimensions, ScrollView, Linking } from 'react-native';
import {
  useTheme,
  Text,
  Button,
  Surface,
  Chip,
  IconButton,
  ProgressBar,
  TextInput,
  FAB,
  ActivityIndicator,
  Portal,
  Dialog,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, Stack } from 'expo-router';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouteStore } from '@realestate-crm/hooks';
import { decodePolyline } from '@realestate-crm/api';
import type { RouteStop } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { width } = Dimensions.get('window');
const MAP_HEIGHT = Dimensions.get('window').height * 0.45;

type StopMarkerColor = {
  background: string;
  text: string;
};

function getStopMarkerColors(stop: RouteStop, isCurrent: boolean, routeStatus: string): StopMarkerColor {
  if (routeStatus === 'completed') {
    if (stop.status === 'visited') return { background: '#16a34a', text: '#fff' };
    if (stop.status === 'skipped') return { background: '#9ca3af', text: '#fff' };
    return { background: '#6b7280', text: '#fff' };
  }
  if (isCurrent && routeStatus === 'in_progress') {
    return { background: '#2563eb', text: '#fff' };
  }
  if (stop.status === 'visited') return { background: '#16a34a', text: '#fff' };
  if (stop.status === 'skipped') return { background: '#9ca3af', text: '#fff' };
  return { background: '#ef4444', text: '#fff' };
}

function getStopStatusIcon(status: RouteStop['status']): string {
  switch (status) {
    case 'visited':
      return 'check-circle';
    case 'skipped':
      return 'skip-next-circle';
    default:
      return 'circle-outline';
  }
}

function getStopStatusColor(status: RouteStop['status']): string {
  switch (status) {
    case 'visited':
      return '#16a34a';
    case 'skipped':
      return '#9ca3af';
    default:
      return '#ef4444';
  }
}

function formatDuration(startedAt: string, completedAt: string): string {
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const diffMs = end - start;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getStopDisplayName(stop: RouteStop): string {
  if (stop.contact) {
    const firstName = stop.contact.first_name || '';
    const lastName = stop.contact.last_name || '';
    return `${firstName} ${lastName}`.trim();
  }
  return stop.address || 'Unknown stop';
}

export default function RouteDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const mapRef = useRef<MapView>(null);

  const activeRoute = useRouteStore(state => state.activeRoute);
  const activeStops = useRouteStore(state => state.activeStops);
  const isLoading = useRouteStore(state => state.isLoading);
  const fetchRouteWithStops = useRouteStore(state => state.fetchRouteWithStops);
  const updateRouteStatus = useRouteStore(state => state.updateRouteStatus);
  const updateStopStatus = useRouteStore(state => state.updateStopStatus);
  const clearActiveRoute = useRouteStore(state => state.clearActiveRoute);

  const [noteDialogVisible, setNoteDialogVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteStopId, setNoteStopId] = useState<string | null>(null);
  const [endRouteDialogVisible, setEndRouteDialogVisible] = useState(false);

  // Load route data on mount
  useEffect(() => {
    if (id) {
      fetchRouteWithStops(id);
    }
    return () => {
      clearActiveRoute();
    };
  }, [id]);

  // Decode polyline points
  const polylineCoords = useMemo(() => {
    if (!activeRoute?.polyline) return [];
    try {
      return decodePolyline(activeRoute.polyline);
    } catch {
      return [];
    }
  }, [activeRoute?.polyline]);

  // Current stop = first unvisited/unskipped stop
  const currentStop = useMemo(() => {
    if (activeRoute?.status !== 'in_progress') return null;
    return activeStops.find(s => s.status === 'pending') || null;
  }, [activeRoute?.status, activeStops]);

  // Progress calculation
  const progress = useMemo(() => {
    if (activeStops.length === 0) return 0;
    const completed = activeStops.filter(s => s.status === 'visited' || s.status === 'skipped').length;
    return completed / activeStops.length;
  }, [activeStops]);

  // Summary stats for completed routes
  const completedStats = useMemo(() => {
    if (activeRoute?.status !== 'completed') return null;
    const visited = activeStops.filter(s => s.status === 'visited').length;
    const skipped = activeStops.filter(s => s.status === 'skipped').length;
    const duration =
      activeRoute.started_at && activeRoute.completed_at
        ? formatDuration(activeRoute.started_at, activeRoute.completed_at)
        : 'N/A';
    return { visited, skipped, total: activeStops.length, duration };
  }, [activeRoute, activeStops]);

  // Auto-complete: when all stops are visited/skipped during in_progress
  useEffect(() => {
    if (
      activeRoute?.status === 'in_progress' &&
      activeStops.length > 0 &&
      activeStops.every(s => s.status === 'visited' || s.status === 'skipped')
    ) {
      updateRouteStatus(activeRoute.id, 'completed');
    }
  }, [activeStops, activeRoute?.status, activeRoute?.id]);

  // Fit map to show all markers once data loads
  useEffect(() => {
    if (activeStops.length > 0 && mapRef.current) {
      const coords = activeStops.map(s => ({
        latitude: s.latitude,
        longitude: s.longitude,
      }));
      // Include polyline points for better fit
      if (polylineCoords.length > 0) {
        coords.push(...polylineCoords);
      }
      setTimeout(() => {
        mapRef.current?.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
          animated: true,
        });
      }, 300);
    }
  }, [activeStops, polylineCoords]);

  const handleStartRoute = useCallback(() => {
    if (!activeRoute) return;
    updateRouteStatus(activeRoute.id, 'in_progress');
  }, [activeRoute, updateRouteStatus]);

  const handleEndRoute = useCallback(() => {
    setEndRouteDialogVisible(true);
  }, []);

  const confirmEndRoute = useCallback(() => {
    if (!activeRoute) return;
    setEndRouteDialogVisible(false);
    updateRouteStatus(activeRoute.id, 'completed');
  }, [activeRoute, updateRouteStatus]);

  const handleVisited = useCallback(() => {
    if (!currentStop) return;
    updateStopStatus(currentStop.id, 'visited');
  }, [currentStop, updateStopStatus]);

  const handleSkip = useCallback(() => {
    if (!currentStop) return;
    updateStopStatus(currentStop.id, 'skipped');
  }, [currentStop, updateStopStatus]);

  const handleCall = useCallback(() => {
    if (!currentStop?.contact?.phone) return;
    Linking.openURL(`tel:${currentStop.contact.phone}`);
  }, [currentStop]);

  const handleOpenNoteDialog = useCallback(() => {
    if (!currentStop) return;
    setNoteStopId(currentStop.id);
    setNoteText(currentStop.notes || '');
    setNoteDialogVisible(true);
  }, [currentStop]);

  const handleSaveNote = useCallback(() => {
    if (!noteStopId) return;
    const stop = activeStops.find(s => s.id === noteStopId);
    if (!stop) return;
    updateStopStatus(noteStopId, stop.status, noteText.trim());
    setNoteDialogVisible(false);
    setNoteText('');
    setNoteStopId(null);
  }, [noteStopId, noteText, activeStops, updateStopStatus]);

  const handleDismissNote = useCallback(() => {
    setNoteDialogVisible(false);
    setNoteText('');
    setNoteStopId(null);
  }, []);

  // Loading state
  if (isLoading || !activeRoute) {
    return (
      <>
        <Stack.Screen options={{ title: 'Route' }} />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  const routeStatus = activeRoute.status;

  return (
    <>
      <Stack.Screen
        options={{
          title: activeRoute.name,
          headerRight: () =>
            routeStatus === 'in_progress' ? (
              <IconButton
                icon="stop-circle-outline"
                iconColor={theme.colors.error}
                onPress={handleEndRoute}
              />
            ) : null,
        }}
      />

      <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
        {/* Map Section */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            provider={PROVIDER_GOOGLE}
            showsUserLocation
            showsMyLocationButton={false}
          >
            {/* Route polyline */}
            {polylineCoords.length > 0 && (
              <Polyline
                coordinates={polylineCoords}
                strokeColor={theme.colors.primary}
                strokeWidth={4}
              />
            )}

            {/* Stop markers */}
            {activeStops.map((stop, index) => {
              const isCurrent = currentStop?.id === stop.id;
              const colors = getStopMarkerColors(stop, isCurrent, routeStatus);
              return (
                <Marker
                  key={stop.id}
                  coordinate={{
                    latitude: stop.latitude,
                    longitude: stop.longitude,
                  }}
                  title={getStopDisplayName(stop)}
                  description={stop.address}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View
                    style={[
                      styles.markerContainer,
                      { backgroundColor: colors.background },
                      isCurrent && styles.currentMarkerContainer,
                    ]}
                  >
                    <Text style={[styles.markerText, { color: colors.text }]}>
                      {index + 1}
                    </Text>
                  </View>
                </Marker>
              );
            })}
          </MapView>
        </View>

        {/* Bottom Section */}
        <ScrollView
          style={styles.bottomSection}
          contentContainerStyle={[styles.bottomContent, { paddingBottom: insets.bottom + 80 }]}
          keyboardShouldPersistTaps="handled"
        >
          {/* Route header info */}
          <View style={styles.routeHeader}>
            <View style={styles.routeHeaderLeft}>
              <Icon
                name={activeRoute.mode === 'driving' ? 'car' : 'walk'}
                size={20}
                color={theme.colors.onSurfaceVariant}
              />
              <Text variant="titleMedium" style={styles.routeTitle} numberOfLines={1}>
                {activeRoute.name}
              </Text>
            </View>
            <Chip
              compact
              style={[styles.statusChip, { backgroundColor: getStatusChipBg(routeStatus, theme) }]}
              textStyle={{ color: getStatusChipText(routeStatus, theme), fontSize: 11 }}
            >
              {routeStatus === 'planned' ? 'Planned' : routeStatus === 'in_progress' ? 'In Progress' : 'Completed'}
            </Chip>
          </View>

          {activeRoute.estimated_duration_minutes != null && (
            <View style={styles.metaRow}>
              <Icon name="clock-outline" size={16} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 4 }}>
                Est. {activeRoute.estimated_duration_minutes} min
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginLeft: 16 }}>
                {activeStops.length} stop{activeStops.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}

          {/* ----- PLANNED state ----- */}
          {routeStatus === 'planned' && (
            <>
              <Surface style={styles.sectionCard} elevation={1}>
                <Text variant="titleSmall" style={styles.sectionTitle}>
                  Stops
                </Text>
                {activeStops.map((stop, index) => (
                  <View key={stop.id} style={styles.stopRow}>
                    <View style={[styles.stopNumber, { backgroundColor: '#ef4444' }]}>
                      <Text style={styles.stopNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopInfo}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {getStopDisplayName(stop)}
                      </Text>
                      {stop.address && (
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant }}
                          numberOfLines={1}
                        >
                          {stop.address}
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </Surface>

              <Button
                mode="contained"
                icon="play"
                onPress={handleStartRoute}
                style={styles.actionButton}
                contentStyle={styles.actionButtonContent}
              >
                Start Route
              </Button>
            </>
          )}

          {/* ----- IN PROGRESS state ----- */}
          {routeStatus === 'in_progress' && (
            <>
              {/* Progress bar */}
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    Progress
                  </Text>
                  <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                    {activeStops.filter(s => s.status !== 'pending').length} / {activeStops.length}
                  </Text>
                </View>
                <ProgressBar
                  progress={progress}
                  color={theme.colors.primary}
                  style={styles.progressBar}
                />
              </View>

              {/* Current stop details */}
              {currentStop && (
                <Surface style={styles.currentStopCard} elevation={2}>
                  <Text variant="labelMedium" style={{ color: theme.colors.primary, marginBottom: 4 }}>
                    CURRENT STOP
                  </Text>
                  <Text variant="titleMedium" style={{ marginBottom: 2 }}>
                    {getStopDisplayName(currentStop)}
                  </Text>
                  {currentStop.address && (
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}
                    >
                      {currentStop.address}
                    </Text>
                  )}

                  {/* Action buttons */}
                  <View style={styles.actionRow}>
                    <Button
                      mode="contained"
                      icon="check"
                      onPress={handleVisited}
                      buttonColor="#16a34a"
                      textColor="#fff"
                      compact
                      style={styles.stopActionButton}
                    >
                      Visited
                    </Button>
                    <Button
                      mode="contained"
                      icon="skip-next"
                      onPress={handleSkip}
                      buttonColor="#f59e0b"
                      textColor="#fff"
                      compact
                      style={styles.stopActionButton}
                    >
                      Skip
                    </Button>
                    <IconButton
                      icon="phone"
                      mode="contained"
                      containerColor={theme.colors.primaryContainer}
                      iconColor={theme.colors.onPrimaryContainer}
                      onPress={handleCall}
                      disabled={!currentStop.contact?.phone}
                      size={20}
                    />
                    <IconButton
                      icon="note-edit"
                      mode="contained"
                      containerColor={theme.colors.secondaryContainer}
                      iconColor={theme.colors.onSecondaryContainer}
                      onPress={handleOpenNoteDialog}
                      size={20}
                    />
                  </View>
                </Surface>
              )}

              {/* All stops list */}
              <Surface style={styles.sectionCard} elevation={1}>
                <Text variant="titleSmall" style={styles.sectionTitle}>
                  All Stops
                </Text>
                {activeStops.map((stop, index) => {
                  const isCurrent = currentStop?.id === stop.id;
                  return (
                    <View
                      key={stop.id}
                      style={[
                        styles.stopRow,
                        isCurrent && { backgroundColor: theme.colors.primaryContainer, borderRadius: 8, padding: 8 },
                      ]}
                    >
                      <View
                        style={[
                          styles.stopNumber,
                          {
                            backgroundColor: getStopMarkerColors(stop, isCurrent, routeStatus).background,
                          },
                        ]}
                      >
                        <Text style={styles.stopNumberText}>{index + 1}</Text>
                      </View>
                      <View style={styles.stopInfo}>
                        <Text variant="bodyMedium" numberOfLines={1}>
                          {getStopDisplayName(stop)}
                        </Text>
                        {stop.address && (
                          <Text
                            variant="bodySmall"
                            style={{ color: theme.colors.onSurfaceVariant }}
                            numberOfLines={1}
                          >
                            {stop.address}
                          </Text>
                        )}
                      </View>
                      <Icon
                        name={getStopStatusIcon(stop.status)}
                        size={20}
                        color={getStopStatusColor(stop.status)}
                      />
                    </View>
                  );
                })}
              </Surface>

              <Button
                mode="outlined"
                icon="stop-circle-outline"
                onPress={handleEndRoute}
                textColor={theme.colors.error}
                style={[styles.actionButton, { borderColor: theme.colors.error }]}
                contentStyle={styles.actionButtonContent}
              >
                End Route
              </Button>
            </>
          )}

          {/* ----- COMPLETED state ----- */}
          {routeStatus === 'completed' && completedStats && (
            <>
              {/* Summary stats */}
              <Surface style={styles.sectionCard} elevation={1}>
                <Text variant="titleSmall" style={styles.sectionTitle}>
                  Summary
                </Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statItem}>
                    <Icon name="check-circle" size={24} color="#16a34a" />
                    <Text variant="headlineSmall" style={{ marginTop: 4 }}>
                      {completedStats.visited}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Visited
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="skip-next-circle" size={24} color="#9ca3af" />
                    <Text variant="headlineSmall" style={{ marginTop: 4 }}>
                      {completedStats.skipped}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Skipped
                    </Text>
                  </View>
                  <View style={styles.statItem}>
                    <Icon name="clock-outline" size={24} color={theme.colors.primary} />
                    <Text variant="headlineSmall" style={{ marginTop: 4 }}>
                      {completedStats.duration}
                    </Text>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Duration
                    </Text>
                  </View>
                </View>
              </Surface>

              {/* Stops list with status */}
              <Surface style={styles.sectionCard} elevation={1}>
                <Text variant="titleSmall" style={styles.sectionTitle}>
                  Stops
                </Text>
                {activeStops.map((stop, index) => (
                  <View key={stop.id} style={styles.stopRow}>
                    <View
                      style={[
                        styles.stopNumber,
                        {
                          backgroundColor: getStopMarkerColors(stop, false, routeStatus).background,
                        },
                      ]}
                    >
                      <Text style={styles.stopNumberText}>{index + 1}</Text>
                    </View>
                    <View style={styles.stopInfo}>
                      <Text variant="bodyMedium" numberOfLines={1}>
                        {getStopDisplayName(stop)}
                      </Text>
                      {stop.address && (
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant }}
                          numberOfLines={1}
                        >
                          {stop.address}
                        </Text>
                      )}
                      {stop.notes && (
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', marginTop: 2 }}
                          numberOfLines={2}
                        >
                          {stop.notes}
                        </Text>
                      )}
                    </View>
                    <Icon
                      name={getStopStatusIcon(stop.status)}
                      size={20}
                      color={getStopStatusColor(stop.status)}
                    />
                  </View>
                ))}
              </Surface>
            </>
          )}
        </ScrollView>
      </View>

      {/* Note dialog */}
      <Portal>
        <Dialog visible={noteDialogVisible} onDismiss={handleDismissNote}>
          <Dialog.Title>Add Note</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              placeholder="Enter a note for this stop..."
              value={noteText}
              onChangeText={setNoteText}
              multiline
              numberOfLines={4}
              style={styles.noteInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={handleDismissNote}>Cancel</Button>
            <Button onPress={handleSaveNote} mode="contained">
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={endRouteDialogVisible} onDismiss={() => setEndRouteDialogVisible(false)}>
          <Dialog.Title>End Route</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              Are you sure you want to end this route? Any remaining stops will not be marked as visited.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEndRouteDialogVisible(false)}>Cancel</Button>
            <Button onPress={confirmEndRoute} textColor={theme.colors.error}>
              End Route
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

function getStatusChipBg(status: string, theme: any): string {
  switch (status) {
    case 'planned':
      return theme.colors.surfaceVariant;
    case 'in_progress':
      return theme.colors.primaryContainer;
    case 'completed':
      return theme.colors.tertiaryContainer;
    default:
      return theme.colors.surfaceVariant;
  }
}

function getStatusChipText(status: string, theme: any): string {
  switch (status) {
    case 'planned':
      return theme.colors.onSurfaceVariant;
    case 'in_progress':
      return theme.colors.onPrimaryContainer;
    case 'completed':
      return theme.colors.onTertiaryContainer;
    default:
      return theme.colors.onSurfaceVariant;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapContainer: {
    height: MAP_HEIGHT,
    width: '100%',
  },
  map: {
    flex: 1,
  },
  markerContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  currentMarkerContainer: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  markerText: {
    fontSize: 12,
    fontWeight: '700',
  },
  bottomSection: {
    flex: 1,
  },
  bottomContent: {
    padding: 16,
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  routeHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  routeTitle: {
    marginLeft: 8,
    fontWeight: '600',
    flex: 1,
  },
  statusChip: {
    alignSelf: 'flex-start',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
  },
  currentStopCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stopActionButton: {
    flex: 1,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    fontWeight: '600',
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopNumberText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  stopInfo: {
    flex: 1,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  actionButton: {
    marginTop: 8,
    borderRadius: 8,
  },
  actionButtonContent: {
    paddingVertical: 6,
  },
  noteInput: {
    minHeight: 80,
  },
});
