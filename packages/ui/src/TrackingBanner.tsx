import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { Button, Dialog, Portal, Surface, Text, useTheme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore, useTrackingStore } from '@realestate-crm/hooks';
import { fetchGnafBuildings } from '@realestate-crm/api';
import type { Contact } from '@realestate-crm/types';
import DropNoteDialog from './DropNoteDialog';
import BuildingActivityDialog from './BuildingActivityDialog';

/** Radius in meters for "nearby contacts" count */
const NEARBY_RADIUS_M = 200;

function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatElapsed(startedAt: string): string {
  const diff = Math.floor(
    (Date.now() - new Date(startedAt).getTime()) / 1000,
  );
  const hrs = Math.floor(diff / 3600);
  const mins = Math.floor((diff % 3600) / 60);
  const secs = diff % 60;
  return hrs > 0
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function TrackingBanner() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const activeSession = useTrackingStore(s => s.activeSession);
  const stopSession = useTrackingStore(s => s.stopSession);
  const contacts = useCRMStore(s => s.contacts);

  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState('00:00');
  const [stopping, setStopping] = useState(false);
  const [noteDialogVisible, setNoteDialogVisible] = useState(false);
  const [logUnitsDialogVisible, setLogUnitsDialogVisible] = useState(false);
  const [nearbySheetVisible, setNearbySheetVisible] = useState(false);
  // Prefill for the Building dialog — populated from the nearest G-NAF
  // building (address + real unit register) when one is within ~60 m of the
  // user's position; otherwise falls back to bare GPS coords as before.
  const [buildingPrefill, setBuildingPrefill] = useState<{
    address: string;
    latitude: number | null;
    longitude: number | null;
    unitNumbers?: string[];
  }>({ address: '', latitude: null, longitude: null });
  const [currentPosition, setCurrentPosition] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    if (!activeSession) return;
    setElapsed(formatElapsed(activeSession.started_at));
    const interval = setInterval(() => {
      setElapsed(formatElapsed(activeSession.started_at));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    if (!activeSession) return;

    let cancelled = false;

    const fetchPosition = async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!cancelled) {
          setCurrentPosition({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        }
      } catch {
        // Location may not be available yet
      }
    };

    fetchPosition();
    const interval = setInterval(fetchPosition, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [activeSession]);

  const nearbyContacts = useMemo(() => {
    if (!currentPosition) return [];
    return contacts
      .filter((c: Contact) => {
        if (c.latitude == null || c.longitude == null) return false;
        const dist = haversineDistance(
          currentPosition.latitude,
          currentPosition.longitude,
          c.latitude,
          c.longitude,
        );
        return dist <= NEARBY_RADIUS_M;
      })
      .map((c: Contact) => ({
        contact: c,
        distanceMeters: haversineDistance(
          currentPosition.latitude,
          currentPosition.longitude,
          c.latitude!,
          c.longitude!,
        ),
      }))
      .sort((a, b) => a.distanceMeters - b.distanceMeters);
  }, [currentPosition, contacts]);

  const nearbyCount = nearbyContacts.length;

  const handleStop = useCallback(async () => {
    setStopping(true);
    const session = await stopSession();
    setStopping(false);
    if (session) {
      router.push(`/tracking/${session.id}`);
    }
  }, [stopSession, router]);

  const handleToggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleQuickContact = useCallback(async () => {
    let params = '';
    if (currentPosition) {
      params = `?latitude=${currentPosition.latitude}&longitude=${currentPosition.longitude}`;
    }
    router.push(`/contact/new${params}` as never);
  }, [router, currentPosition]);

  const handleViewRoute = useCallback(() => {
    router.push('/(tabs)/prospecting' as never);
  }, [router]);

  /** Max distance at which a G-NAF building counts as "the one I'm standing at". */
  const BUILDING_SNAP_RADIUS_M = 60;

  const handleOpenBuilding = useCallback(async () => {
    let prefill: typeof buildingPrefill = {
      address: '',
      latitude: currentPosition?.latitude ?? null,
      longitude: currentPosition?.longitude ?? null,
    };

    if (currentPosition) {
      try {
        // ~130 m bbox around the user; cached per-bbox so repeat taps are free.
        // Race against a timeout so a slow network can't delay the dialog.
        const d = 0.0012;
        const buildings = await Promise.race([
          fetchGnafBuildings(
            currentPosition.latitude - d,
            currentPosition.longitude - d,
            currentPosition.latitude + d,
            currentPosition.longitude + d,
          ),
          new Promise<[]>(resolve => setTimeout(() => resolve([]), 1500)),
        ]);

        let bestDist = Infinity;
        let best: (typeof buildings)[number] | null = null;
        for (const b of buildings) {
          const dist = haversineDistance(
            currentPosition.latitude,
            currentPosition.longitude,
            b.center.latitude,
            b.center.longitude,
          );
          if (dist < bestDist) {
            bestDist = dist;
            best = b;
          }
        }

        if (best && bestDist <= BUILDING_SNAP_RADIUS_M) {
          prefill = {
            address: best.address || best.name || '',
            // Snap to the building's registered coords so the declared
            // building and annotations land on the building, not the footpath.
            latitude: best.center.latitude,
            longitude: best.center.longitude,
            unitNumbers: best.unitNumbers,
          };
        }
      } catch {
        // Lookup is best-effort — fall through to bare GPS prefill.
      }
    }

    setBuildingPrefill(prefill);
    setLogUnitsDialogVisible(true);
  }, [currentPosition]);

  if (!activeSession) return null;

  const bottomOffset = 49 + insets.bottom;

  return (
    <>
      <Surface
        style={[
          styles.banner,
          {
            backgroundColor: theme.colors.primaryContainer,
            bottom: bottomOffset,
          },
        ]}
        elevation={3}
      >
        <TouchableOpacity
          style={styles.collapsedRow}
          onPress={handleToggleExpand}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Tracking banner, ${elapsed} elapsed. Tap to ${expanded ? 'collapse' : 'expand'}`}
        >
          <View style={styles.trackingInfo}>
            <Animated.View
              style={[styles.pulseDot, { opacity: pulseAnim }]}
            />
            <Text
              variant="titleSmall"
              style={[styles.elapsedText, { color: theme.colors.onPrimaryContainer }]}
            >
              {elapsed}
            </Text>
          </View>

          <View style={styles.collapsedActions}>
            <Button
              mode="contained"
              buttonColor="#F59E0B"
              textColor="#FFFFFF"
              onPress={() => setNoteDialogVisible(true)}
              compact
              icon="note-edit-outline"
              style={styles.actionButton}
            >
              Note
            </Button>
            <Button
              mode="contained"
              buttonColor={theme.colors.error}
              textColor={theme.colors.onError}
              onPress={handleStop}
              loading={stopping}
              disabled={stopping}
              compact
              style={styles.actionButton}
            >
              Stop
            </Button>
          </View>
        </TouchableOpacity>

        {expanded && (
          <View style={styles.expandedRow}>
            <TouchableOpacity
              style={[styles.expandedButton, { backgroundColor: theme.colors.surface }]}
              onPress={handleQuickContact}
              activeOpacity={0.7}
            >
              <Icon
                name="account-plus"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurface }}
                numberOfLines={1}
              >
                Quick Contact
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.expandedButton, { backgroundColor: theme.colors.surface }]}
              onPress={() => { if (nearbyCount > 0) setNearbySheetVisible(true); }}
              activeOpacity={0.7}
              disabled={nearbyCount === 0}
            >
              <Icon
                name="account-group"
                size={20}
                color={nearbyCount > 0 ? theme.colors.primary : theme.colors.onSurfaceVariant}
              />
              <Text
                variant="labelSmall"
                style={{ color: nearbyCount > 0 ? theme.colors.onSurface : theme.colors.onSurfaceVariant }}
                numberOfLines={1}
              >
                Nearby ({nearbyCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.expandedButton, { backgroundColor: theme.colors.surface }]}
              onPress={handleOpenBuilding}
              activeOpacity={0.7}
            >
              <Icon
                name="office-building-marker"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurface }}
                numberOfLines={1}
              >
                Building
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.expandedButton, { backgroundColor: theme.colors.surface }]}
              onPress={handleViewRoute}
              activeOpacity={0.7}
            >
              <Icon
                name="map-marker-path"
                size={20}
                color={theme.colors.primary}
              />
              <Text
                variant="labelSmall"
                style={{ color: theme.colors.onSurface }}
                numberOfLines={1}
              >
                View Route
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </Surface>

      <DropNoteDialog
        visible={noteDialogVisible}
        onDismiss={() => setNoteDialogVisible(false)}
        sessionId={activeSession.id}
      />

      <BuildingActivityDialog
        visible={logUnitsDialogVisible}
        onDismiss={() => setLogUnitsDialogVisible(false)}
        initialAddress={buildingPrefill.address}
        initialLatitude={buildingPrefill.latitude ?? currentPosition?.latitude ?? null}
        initialLongitude={buildingPrefill.longitude ?? currentPosition?.longitude ?? null}
        sessionId={activeSession.id}
        initialMode="log_visits"
        knownUnitNumbers={buildingPrefill.unitNumbers}
      />

      <Portal>
        <Dialog visible={nearbySheetVisible} onDismiss={() => setNearbySheetVisible(false)} style={styles.nearbySheet}>
          <Dialog.Title>Nearby Contacts ({nearbyCount})</Dialog.Title>
          <Dialog.ScrollArea style={styles.nearbySheetScroll}>
            <ScrollView>
              {nearbyContacts.length === 0 && (
                <View style={styles.nearbyEmpty}>
                  <Icon name="account-search-outline" size={28} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                    No contacts within {NEARBY_RADIUS_M} m
                  </Text>
                </View>
              )}
              {nearbyContacts.map(({ contact, distanceMeters }) => (
                <TouchableOpacity
                  key={contact.id}
                  style={styles.nearbyRow}
                  onPress={() => { setNearbySheetVisible(false); router.push(`/contact/${contact.id}` as never); }}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text variant="bodyLarge" numberOfLines={1} style={{ color: theme.colors.onSurface }}>
                      {contact.first_name} {contact.last_name || ''}
                    </Text>
                    <Text variant="bodySmall" numberOfLines={1} style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
                      {contact.unit_number ? `Unit ${contact.unit_number}, ` : ''}{contact.address || 'No address'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text variant="labelMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
                      {Math.round(distanceMeters)}m
                    </Text>
                    {contact.last_contacted_at && (
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {new Date(contact.last_contacted_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Dialog.ScrollArea>
          <Dialog.Actions>
            <Button onPress={() => setNearbySheetVisible(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 8,
    right: 8,
    borderRadius: 16,
    overflow: 'hidden',
  },
  collapsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 56,
  },
  trackingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EF4444',
  },
  elapsedText: {
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  collapsedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    minWidth: 0,
  },
  expandedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  expandedButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    gap: 4,
  },
  nearbySheet: {
    maxHeight: '85%',
  },
  nearbySheetScroll: {
    paddingHorizontal: 0,
    // Explicit pixel cap — an unconstrained ScrollArea inside a Portal'd
    // Dialog collapses to a near-zero height on first layout, clipping rows
    // (the "(2) but only half a row visible" bug). Same pattern as
    // BuildingActivityDialog's scrollArea.
    maxHeight: 400,
  },
  nearbyEmpty: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  nearbyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
});
