import { useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import {
  Dialog, Text, TextInput, Button, useTheme, Portal, Chip, IconButton, Surface,
} from 'react-native-paper';
import * as Location from 'expo-location';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTrackingStore } from '@realestate-crm/hooks';

interface DropNoteDialogProps {
  visible: boolean;
  onDismiss: () => void;
  sessionId: string;
}

type UnitOutcome = 'not_home' | 'spoke' | 'callback' | 'not_interested' | 'skip';

const OUTCOME_OPTIONS: { value: UnitOutcome; label: string; icon: string; color: string }[] = [
  { value: 'not_home', label: 'Not Home', icon: 'home-off-outline', color: '#9ca3af' },
  { value: 'spoke', label: 'Spoke', icon: 'chat-outline', color: '#16a34a' },
  { value: 'callback', label: 'Callback', icon: 'phone-return', color: '#f59e0b' },
  { value: 'not_interested', label: 'Not Interested', icon: 'close-circle-outline', color: '#ef4444' },
  { value: 'skip', label: 'Skip', icon: 'skip-next', color: '#6b7280' },
];

const OUTCOME_LABELS: Record<UnitOutcome, string> = {
  not_home: 'Not Home',
  spoke: 'Spoke',
  callback: 'Callback',
  not_interested: 'Not Interested',
  skip: 'Skip',
};

interface UnitEntry {
  unit: string;
  outcome: UnitOutcome;
  note: string;
  saved: boolean;
}

export default function DropNoteDialog({
  visible,
  onDismiss,
  sessionId,
}: DropNoteDialogProps) {
  const theme = useTheme();
  const createAnnotation = useTrackingStore(state => state.createAnnotation);

  // Single note mode
  const [noteText, setNoteText] = useState('');
  const [saving, setSaving] = useState(false);

  // Multi-dwelling mode
  const [multiMode, setMultiMode] = useState(false);
  const [units, setUnits] = useState<UnitEntry[]>([]);
  const [currentUnit, setCurrentUnit] = useState('');
  const [currentOutcome, setCurrentOutcome] = useState<UnitOutcome>('spoke');
  const [currentUnitNote, setCurrentUnitNote] = useState('');
  const [cachedPosition, setCachedPosition] = useState<{ latitude: number; longitude: number } | null>(null);

  const resetState = useCallback(() => {
    setNoteText('');
    setMultiMode(false);
    setUnits([]);
    setCurrentUnit('');
    setCurrentOutcome('spoke');
    setCurrentUnitNote('');
    setCachedPosition(null);
  }, []);

  const handleCancel = () => {
    resetState();
    onDismiss();
  };

  // Get position (cached for multi-dwelling — same building)
  const getPosition = async () => {
    if (cachedPosition) return cachedPosition;
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    const coords = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    setCachedPosition(coords);
    return coords;
  };

  // ── Single note save ──
  const handleSaveSingle = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      const coords = await getPosition();
      await createAnnotation({
        session_id: sessionId,
        ...coords,
        note: noteText.trim(),
      });
      resetState();
      onDismiss();
    } catch (error) {
      console.error('Error dropping note:', error);
    } finally {
      setSaving(false);
    }
  };

  // ── Multi-dwelling: add unit entry ──
  const handleAddUnit = async () => {
    if (!currentUnit.trim()) return;
    setSaving(true);
    try {
      const coords = await getPosition();
      const notePrefix = `[Unit ${currentUnit.trim()}] ${OUTCOME_LABELS[currentOutcome]}`;
      const fullNote = currentUnitNote.trim()
        ? `${notePrefix} — ${currentUnitNote.trim()}`
        : notePrefix;

      await createAnnotation({
        session_id: sessionId,
        ...coords,
        note: fullNote,
      });

      setUnits(prev => [...prev, {
        unit: currentUnit.trim(),
        outcome: currentOutcome,
        note: currentUnitNote.trim(),
        saved: true,
      }]);
      setCurrentUnit('');
      setCurrentUnitNote('');
      setCurrentOutcome('spoke');
    } catch (error) {
      console.error('Error saving unit annotation:', error);
    } finally {
      setSaving(false);
    }
  };

  // ── Multi-dwelling: finish ──
  const handleFinishMulti = () => {
    resetState();
    onDismiss();
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleCancel}
        style={multiMode ? styles.wideDialog : undefined}
      >
        <Dialog.Title>
          {multiMode ? 'Multi-Dwelling Note' : 'Drop Note'}
        </Dialog.Title>

        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            {!multiMode ? (
              /* ── Single note mode ── */
              <View style={styles.content}>
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant, marginBottom: 12 }}
                >
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
                  style={styles.input}
                />

                {/* Toggle to multi-dwelling */}
                <TouchableOpacity
                  style={[styles.multiToggle, { borderColor: theme.colors.outlineVariant }]}
                  onPress={() => setMultiMode(true)}
                  activeOpacity={0.7}
                >
                  <Icon name="office-building" size={20} color={theme.colors.primary} />
                  <Text variant="labelMedium" style={{ color: theme.colors.primary, marginLeft: 8 }}>
                    Multi-dwelling? Log units individually
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* ── Multi-dwelling mode ── */
              <View style={styles.content}>
                {/* Logged units summary */}
                {units.length > 0 && (
                  <View style={styles.loggedUnits}>
                    <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
                      Logged ({units.length})
                    </Text>
                    <View style={styles.unitChipsRow}>
                      {units.map((entry, idx) => {
                        const opt = OUTCOME_OPTIONS.find(o => o.value === entry.outcome);
                        return (
                          <Chip
                            key={idx}
                            compact
                            icon={() => (
                              <Icon
                                name={opt?.icon || 'help'}
                                size={14}
                                color={opt?.color || '#6b7280'}
                              />
                            )}
                            style={[styles.unitChip, { borderColor: opt?.color || '#6b7280' }]}
                            textStyle={{ fontSize: 12 }}
                          >
                            {entry.unit}
                          </Chip>
                        );
                      })}
                    </View>
                  </View>
                )}

                {/* Current unit input */}
                <TextInput
                  mode="outlined"
                  label="Unit / Apt #"
                  placeholder="e.g., 3, 2B, G01"
                  value={currentUnit}
                  onChangeText={setCurrentUnit}
                  autoFocus
                  dense
                  style={styles.unitInput}
                />

                {/* Outcome quick-select */}
                <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, marginBottom: 6 }}>
                  Outcome
                </Text>
                <View style={styles.outcomeRow}>
                  {OUTCOME_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.outcomeButton,
                        {
                          backgroundColor: currentOutcome === opt.value ? opt.color + '18' : theme.colors.surfaceVariant,
                          borderColor: currentOutcome === opt.value ? opt.color : 'transparent',
                        },
                      ]}
                      onPress={() => setCurrentOutcome(opt.value)}
                      activeOpacity={0.7}
                    >
                      <Icon name={opt.icon} size={18} color={opt.color} />
                      <Text variant="labelSmall" numberOfLines={1} style={{ color: opt.color, marginTop: 2, fontSize: 10 }}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Optional note for this unit */}
                <TextInput
                  mode="outlined"
                  label="Note (optional)"
                  placeholder="Owner name, details..."
                  value={currentUnitNote}
                  onChangeText={setCurrentUnitNote}
                  dense
                  style={{ marginTop: 8 }}
                />

                {/* Add unit button */}
                <Button
                  mode="contained"
                  buttonColor="#F59E0B"
                  textColor="#FFFFFF"
                  icon="plus"
                  onPress={handleAddUnit}
                  loading={saving}
                  disabled={!currentUnit.trim() || saving}
                  style={{ marginTop: 12 }}
                >
                  Log Unit {currentUnit.trim() || ''}
                </Button>
              </View>
            )}
          </ScrollView>
        </Dialog.ScrollArea>

        <Dialog.Actions>
          <Button onPress={handleCancel} disabled={saving}>
            Cancel
          </Button>
          {!multiMode && (
            <Button
              mode="contained"
              buttonColor="#F59E0B"
              textColor="#FFFFFF"
              onPress={handleSaveSingle}
              loading={saving}
              disabled={!noteText.trim() || saving}
            >
              Save
            </Button>
          )}
          {multiMode && (
            <Button
              mode="contained"
              onPress={handleFinishMulti}
              disabled={saving}
            >
              Done ({units.length} logged)
            </Button>
          )}
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  wideDialog: {
    maxHeight: '85%',
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  content: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  input: {
    maxHeight: 120,
  },
  multiToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  loggedUnits: {
    marginBottom: 12,
  },
  unitChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  unitChip: {
    borderWidth: 1,
  },
  unitInput: {
    marginBottom: 0,
  },
  outcomeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  outcomeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRadius: 8,
    borderWidth: 1.5,
  },
});
