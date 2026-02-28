import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, ScrollView, Alert, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import {
  useTheme,
  Text,
  Button,
  Surface,
  Chip,
  Divider,
  Portal,
  Dialog,
  ActivityIndicator,
  TextInput,
} from 'react-native-paper';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useInspectionStore, useTaskStore, useCRMStore } from '@realestate-crm/hooks';
import type {
  InspectionType,
  InspectionStatus,
  AttendeeSource,
  InterestLevel,
  InspectionAttendee,
} from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const TYPE_LABELS: Record<InspectionType, string> = {
  open_home: 'Open Home',
  private: 'Private',
};

const STATUS_COLORS: Record<InspectionStatus, string> = {
  scheduled: '#2563eb',
  in_progress: '#f59e0b',
  completed: '#16a34a',
  cancelled: '#9ca3af',
};

const STATUS_LABELS: Record<InspectionStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const SOURCE_LABELS: Record<AttendeeSource, string> = {
  walk_in: 'Walk-in',
  registered: 'Registered',
  invited: 'Invited',
};

const INTEREST_COLORS: Record<InterestLevel, string> = {
  hot: '#dc2626',
  warm: '#f59e0b',
  cold: '#6b7280',
};

const INTEREST_LABELS: Record<InterestLevel, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
};

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(startIso: string): string {
  const startMs = new Date(startIso).getTime();
  const elapsed = Math.max(0, Date.now() - startMs);
  const minutes = Math.floor(elapsed / 60000);
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function InspectionDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const activeInspection = useInspectionStore(state => state.activeInspection);
  const attendees = useInspectionStore(state => state.attendees);
  const isLoading = useInspectionStore(state => state.isLoading);
  const fetchInspection = useInspectionStore(state => state.fetchInspection);
  const startInspection = useInspectionStore(state => state.startInspection);
  const completeInspection = useInspectionStore(state => state.completeInspection);
  const addAttendee = useInspectionStore(state => state.addAttendee);
  const updateAttendee = useInspectionStore(state => state.updateAttendee);
  const clearActiveInspection = useInspectionStore(state => state.clearActiveInspection);
  const linkAttendeeToContact = useInspectionStore(state => state.linkAttendeeToContact);

  const addContact = useCRMStore(state => state.addContact);
  const createFollowUpTasks = useTaskStore(state => state.createFollowUpTasks);

  // Check-in form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [source, setSource] = useState<AttendeeSource>('walk_in');
  const [isCheckingIn, setIsCheckingIn] = useState(false);

  // Attendee-to-contact conversion
  const [convertingAttendeeId, setConvertingAttendeeId] = useState<string | null>(null);

  // End inspection dialog
  const [endDialogVisible, setEndDialogVisible] = useState(false);
  const [attendeeRatings, setAttendeeRatings] = useState<Record<string, InterestLevel>>({});
  const [isEnding, setIsEnding] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  // Timer
  const [elapsed, setElapsed] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (id) {
      fetchInspection(id);
    }
    return () => {
      clearActiveInspection();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [id]);

  // Start elapsed timer when inspection is in progress
  useEffect(() => {
    if (activeInspection?.status === 'in_progress') {
      const updateElapsed = () => {
        if (activeInspection.scheduled_at) {
          setElapsed(formatElapsed(activeInspection.scheduled_at));
        }
      };
      updateElapsed();
      timerRef.current = setInterval(updateElapsed, 30000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return undefined;
  }, [activeInspection?.status, activeInspection?.scheduled_at]);

  const handleStart = useCallback(async () => {
    if (!id) return;
    await startInspection(id);
    await fetchInspection(id);
  }, [id, startInspection, fetchInspection]);

  const handleCheckIn = useCallback(async () => {
    if (!id || !firstName.trim()) return;
    setIsCheckingIn(true);
    try {
      await addAttendee(id, {
        first_name: firstName.trim(),
        last_name: lastName.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        source,
      });
      // Clear form
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setSource('walk_in');
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to check in attendee.');
    } finally {
      setIsCheckingIn(false);
    }
  }, [id, firstName, lastName, phone, email, source, addAttendee]);

  const handleAttendeePress = useCallback(async (attendee: InspectionAttendee) => {
    if (attendee.contact_id) {
      router.push(`/contact/${attendee.contact_id}`);
      return;
    }

    // No linked contact — create one and link
    setConvertingAttendeeId(attendee.id);
    try {
      const newContact = await addContact({
        first_name: attendee.first_name || '',
        last_name: attendee.last_name || '',
        phone: attendee.phone || '',
        email: attendee.email || '',
        address: '',
      });
      if (newContact) {
        await linkAttendeeToContact(attendee.id, newContact.id);
        router.push(`/contact/${newContact.id}`);
      }
    } catch (error) {
      console.error('Convert attendee error:', error);
      Alert.alert('Error', 'Failed to create contact from attendee.');
    } finally {
      setConvertingAttendeeId(null);
    }
  }, [addContact, linkAttendeeToContact, router]);

  const handleOpenEndDialog = useCallback(() => {
    // Initialize ratings for all attendees without one
    const initial: Record<string, InterestLevel> = {};
    attendees.forEach(a => {
      initial[a.id] = a.interest_level || 'warm';
    });
    setAttendeeRatings(initial);
    setEndDialogVisible(true);
  }, [attendees]);

  const handleEndInspection = useCallback(async () => {
    if (!id || !activeInspection) return;
    setIsEnding(true);
    try {
      // Update each attendee's interest level
      for (const [attendeeId, level] of Object.entries(attendeeRatings)) {
        await updateAttendee(attendeeId, { interest_level: level });
      }

      await completeInspection(id);

      // Create follow-up tasks for hot attendees
      const propertyAddress =
        (activeInspection.property as { address?: string } | undefined)?.address || 'Unknown property';
      const updatedAttendees = attendees.map(a => ({
        ...a,
        interest_level: attendeeRatings[a.id] || a.interest_level,
      }));
      await createFollowUpTasks(activeInspection.property_id, propertyAddress, updatedAttendees);

      setEndDialogVisible(false);
      setIsCompleted(true);
      await fetchInspection(id);
    } catch (error) {
      console.error('End inspection error:', error);
      Alert.alert('Error', 'Failed to end inspection.');
    } finally {
      setIsEnding(false);
    }
  }, [id, activeInspection, attendeeRatings, updateAttendee, completeInspection, createFollowUpTasks, attendees, fetchInspection]);

  // Summary counts
  const summary = useMemo(() => {
    const total = attendees.length;
    const hot = attendees.filter(a => (attendeeRatings[a.id] || a.interest_level) === 'hot').length;
    const warm = attendees.filter(a => (attendeeRatings[a.id] || a.interest_level) === 'warm').length;
    const cold = attendees.filter(a => (attendeeRatings[a.id] || a.interest_level) === 'cold').length;
    return { total, hot, warm, cold };
  }, [attendees, attendeeRatings]);

  if (isLoading || !activeInspection) {
    return (
      <>
        <Stack.Screen options={{ title: 'Inspection' }} />
        <View style={[styles.container, styles.centered, { backgroundColor: theme.colors.background }]}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  const inspection = activeInspection;
  const propertyAddress =
    (inspection.property as { address?: string; suburb?: string } | undefined)?.address || 'Unknown property';
  const propertySuburb =
    (inspection.property as { address?: string; suburb?: string } | undefined)?.suburb || '';
  const showCompleted = inspection.status === 'completed' || isCompleted;

  return (
    <>
      <Stack.Screen options={{ title: propertyAddress }} />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={[styles.scrollView, { backgroundColor: theme.colors.background }]}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <Surface style={styles.sectionCard} elevation={1}>
            <Text variant="headlineSmall" style={styles.headerAddress}>
              {propertyAddress}
            </Text>
            {propertySuburb !== '' && (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                {propertySuburb}
              </Text>
            )}
            <View style={styles.badgeRow}>
              <Chip
                compact
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                textStyle={{ color: theme.colors.onSecondaryContainer, fontSize: 11 }}
              >
                {TYPE_LABELS[inspection.type]}
              </Chip>
              <Chip
                compact
                style={{ backgroundColor: STATUS_COLORS[inspection.status] }}
                textStyle={{ color: '#fff', fontSize: 11 }}
              >
                {STATUS_LABELS[inspection.status]}
              </Chip>
            </View>
            {inspection.status === 'in_progress' && elapsed !== '' && (
              <View style={styles.timerRow}>
                <Icon name="timer" size={18} color={theme.colors.primary} />
                <Text variant="titleMedium" style={{ marginLeft: 6, color: theme.colors.primary }}>
                  {elapsed} elapsed
                </Text>
              </View>
            )}
          </Surface>

          {/* Scheduled state: Start button */}
          {inspection.status === 'scheduled' && (
            <Surface style={styles.sectionCard} elevation={1}>
              <View style={styles.centered}>
                <Icon name="clock-start" size={48} color={theme.colors.primary} />
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12, marginBottom: 16, textAlign: 'center' }}>
                  Inspection scheduled for{'\n'}{formatTime(inspection.scheduled_at)}
                </Text>
                <Button
                  mode="contained"
                  icon="play"
                  onPress={handleStart}
                  style={styles.fullWidthButton}
                  contentStyle={styles.bigButtonContent}
                >
                  Start Inspection
                </Button>
              </View>
            </Surface>
          )}

          {/* In progress: Check-in form */}
          {inspection.status === 'in_progress' && (
            <Surface style={styles.sectionCard} elevation={1}>
              <View style={styles.sectionHeader}>
                <Icon name="account-plus" size={20} color={theme.colors.primary} />
                <Text variant="titleSmall" style={styles.sectionTitleText}>Check In Attendee</Text>
              </View>

              <View style={styles.rowInputs}>
                <TextInput
                  mode="outlined"
                  label="First Name *"
                  value={firstName}
                  onChangeText={setFirstName}
                  style={[styles.input, styles.halfInput]}
                />
                <TextInput
                  mode="outlined"
                  label="Last Name"
                  value={lastName}
                  onChangeText={setLastName}
                  style={[styles.input, styles.halfInput]}
                />
              </View>
              <TextInput
                mode="outlined"
                label="Phone"
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                style={styles.input}
              />
              <TextInput
                mode="outlined"
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                style={styles.input}
              />

              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 8 }}>
                Source
              </Text>
              <View style={styles.chipGrid}>
                {(Object.keys(SOURCE_LABELS) as AttendeeSource[]).map(s => (
                  <Chip
                    key={s}
                    selected={source === s}
                    onPress={() => setSource(s)}
                    compact
                  >
                    {SOURCE_LABELS[s]}
                  </Chip>
                ))}
              </View>

              <Button
                mode="contained"
                icon="check"
                onPress={handleCheckIn}
                loading={isCheckingIn}
                disabled={isCheckingIn || !firstName.trim()}
                style={[styles.fullWidthButton, { marginTop: 16 }]}
                contentStyle={styles.bigButtonContent}
              >
                CHECK IN
              </Button>
            </Surface>
          )}

          {/* Completed summary */}
          {showCompleted && (
            <Surface style={styles.sectionCard} elevation={1}>
              <View style={styles.sectionHeader}>
                <Icon name="check-circle" size={20} color="#16a34a" />
                <Text variant="titleSmall" style={styles.sectionTitleText}>Inspection Complete</Text>
              </View>
              <View style={styles.summaryRow}>
                <View style={styles.summaryItem}>
                  <Text variant="headlineMedium" style={{ fontWeight: '700' }}>{summary.total}</Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Total</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text variant="headlineMedium" style={{ fontWeight: '700', color: INTEREST_COLORS.hot }}>{summary.hot}</Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Hot</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text variant="headlineMedium" style={{ fontWeight: '700', color: INTEREST_COLORS.warm }}>{summary.warm}</Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Warm</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text variant="headlineMedium" style={{ fontWeight: '700', color: INTEREST_COLORS.cold }}>{summary.cold}</Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Cold</Text>
                </View>
              </View>
            </Surface>
          )}

          {/* Attendee list */}
          {attendees.length > 0 && (
            <Surface style={styles.sectionCard} elevation={1}>
              <View style={styles.sectionHeader}>
                <Icon name="account-group" size={20} color={theme.colors.primary} />
                <Text variant="titleSmall" style={styles.sectionTitleText}>
                  Attendees ({attendees.length})
                </Text>
              </View>

              {attendees.map(attendee => {
                const name = [attendee.first_name, attendee.last_name].filter(Boolean).join(' ');
                const checkedInTime = attendee.created_at ? formatTime(attendee.created_at) : '';
                const interestLevel = attendee.interest_level;
                const isConverting = convertingAttendeeId === attendee.id;

                return (
                  <TouchableOpacity
                    key={attendee.id}
                    style={styles.attendeeRow}
                    onPress={() => handleAttendeePress(attendee)}
                    disabled={isConverting}
                  >
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text variant="bodyMedium" style={{ fontWeight: '600', color: attendee.contact_id ? theme.colors.primary : theme.colors.onSurface }}>
                          {name}
                        </Text>
                        {!attendee.contact_id && !isConverting && (
                          <Icon name="account-plus-outline" size={14} color={theme.colors.onSurfaceVariant} />
                        )}
                        {isConverting && (
                          <ActivityIndicator size={14} />
                        )}
                      </View>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {attendee.contact_id ? 'View contact' : 'Tap to create contact'}
                        {checkedInTime ? ` · ${checkedInTime}` : ''}
                      </Text>
                    </View>
                    {interestLevel && (
                      <Chip
                        compact
                        style={{ backgroundColor: INTEREST_COLORS[interestLevel] }}
                        textStyle={{ color: '#fff', fontSize: 10 }}
                      >
                        {INTEREST_LABELS[interestLevel]}
                      </Chip>
                    )}
                    <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                  </TouchableOpacity>
                );
              })}
            </Surface>
          )}

          {/* End inspection button */}
          {inspection.status === 'in_progress' && (
            <Button
              mode="outlined"
              icon="stop"
              onPress={handleOpenEndDialog}
              style={[styles.fullWidthButton, { borderColor: theme.colors.error, marginBottom: 32 }]}
              textColor={theme.colors.error}
              contentStyle={styles.bigButtonContent}
            >
              End Inspection
            </Button>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <Portal>
        {/* End Inspection dialog with ratings */}
        <Dialog visible={endDialogVisible} onDismiss={() => setEndDialogVisible(false)}>
          <Dialog.Title>Rate Attendees</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}>
              Rate each attendee's interest level before completing the inspection.
            </Text>
            <ScrollView style={{ maxHeight: 400 }}>
              {attendees.map(attendee => {
                const name = [attendee.first_name, attendee.last_name].filter(Boolean).join(' ');
                const currentRating = attendeeRatings[attendee.id] || 'warm';
                return (
                  <View key={attendee.id} style={styles.ratingRow}>
                    <Text variant="bodyMedium" style={{ marginBottom: 6, fontWeight: '600' }}>{name}</Text>
                    <View style={styles.chipGrid}>
                      {(Object.keys(INTEREST_LABELS) as InterestLevel[]).map(level => (
                        <Chip
                          key={level}
                          selected={currentRating === level}
                          onPress={() => setAttendeeRatings(prev => ({ ...prev, [attendee.id]: level }))}
                          compact
                          style={currentRating === level ? { backgroundColor: INTEREST_COLORS[level] } : undefined}
                          textStyle={currentRating === level ? { color: '#fff' } : undefined}
                        >
                          {INTEREST_LABELS[level]}
                        </Chip>
                      ))}
                    </View>
                    <Divider style={{ marginTop: 12 }} />
                  </View>
                );
              })}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEndDialogVisible(false)}>Cancel</Button>
            <Button
              mode="contained"
              onPress={handleEndInspection}
              loading={isEnding}
              disabled={isEnding}
            >
              Complete Inspection
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitleText: {
    marginLeft: 8,
    fontWeight: '600',
  },
  headerAddress: {
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  fullWidthButton: {
    borderRadius: 8,
  },
  bigButtonContent: {
    paddingVertical: 8,
  },
  input: {
    marginBottom: 8,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attendeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 8,
  },
  summaryItem: {
    alignItems: 'center',
  },
  ratingRow: {
    paddingVertical: 10,
  },
});
