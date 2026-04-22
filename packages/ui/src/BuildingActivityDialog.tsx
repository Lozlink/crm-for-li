import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import {
  Dialog, Text, TextInput, Button, useTheme, Portal, Chip, SegmentedButtons,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  useCRMStore,
  useProspectingMatcher,
  useDeclaredBuildingsStore,
  useTrackingStore,
} from '@realestate-crm/hooks';

export interface BuildingActivityDialogProps {
  visible: boolean;
  onDismiss: () => void;
  initialAddress?: string;
  initialLatitude: number | null;
  initialLongitude: number | null;
  sessionId?: string | null;
  initialMode?: 'declare' | 'log_visits';
}

type Mode = 'declare' | 'log_visits';
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

// ~50m proximity in degrees — same threshold as useProspectingMetrics
const PROXIMITY_THRESHOLD = 0.00045;

function coordsNear(aLat: number, aLng: number, bLat: number, bLng: number): boolean {
  return Math.abs(aLat - bLat) < PROXIMITY_THRESHOLD && Math.abs(aLng - bLng) < PROXIMITY_THRESHOLD;
}

interface UnitEntry {
  unit: string;
  outcome: UnitOutcome;
  note: string;
}

export default function BuildingActivityDialog({
  visible,
  onDismiss,
  initialAddress,
  initialLatitude,
  initialLongitude,
  sessionId,
  initialMode = 'declare',
}: BuildingActivityDialogProps) {
  const theme = useTheme();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [address, setAddress] = useState(initialAddress ?? '');

  // ── Declare mode state ──
  const [startingUnit, setStartingUnit] = useState('1');
  const [unitCount, setUnitCount] = useState('');
  const [estimatedUnitsInput, setEstimatedUnitsInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Log visits mode state ──
  const [loggedUnits, setLoggedUnits] = useState<UnitEntry[]>([]);
  const [currentUnit, setCurrentUnit] = useState('');
  const [currentOutcome, setCurrentOutcome] = useState<UnitOutcome>('spoke');
  const [currentUnitNote, setCurrentUnitNote] = useState('');
  const [isSavingUnit, setIsSavingUnit] = useState(false);

  const bulkAddContacts = useCRMStore(s => s.bulkAddContacts);
  const upsertDeclaredBuilding = useDeclaredBuildingsStore(s => s.upsertDeclaredBuilding);
  const declaredBuildings = useDeclaredBuildingsStore(s => s.declaredBuildings);
  const createAnnotation = useTrackingStore(s => s.createAnnotation);
  const { matchContactByAddress } = useProspectingMatcher(null, null);

  // Reset all state when dialog opens/closes or initialAddress changes
  useEffect(() => {
    if (visible) {
      setAddress(initialAddress ?? '');
      setMode(initialMode);
      setStartingUnit('1');
      setUnitCount('');
      setEstimatedUnitsInput('');
      setIsCreating(false);
      setCreatedCount(null);
      setLoggedUnits([]);
      setCurrentUnit('');
      setCurrentOutcome('spoke');
      setCurrentUnitNote('');
      setIsSavingUnit(false);
    }
  }, [visible, initialAddress, initialMode]);

  // Clear success chip after 3s
  useEffect(() => {
    if (createdCount !== null) {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setCreatedCount(null), 3000);
    }
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, [createdCount]);

  // ── Declare mode logic ──
  const existingContacts = useMemo(() => {
    if (address.trim().length < 3) return [];
    return matchContactByAddress(address);
  }, [address, matchContactByAddress]);

  const existingUnitNumbers = useMemo(() => {
    return new Set(
      existingContacts.map(c => c.unit_number).filter((u): u is string => !!u),
    );
  }, [existingContacts]);

  const startNum = parseInt(startingUnit, 10) || 1;
  const count = parseInt(unitCount, 10) || 0;

  const unitsToCreate = useMemo(() => {
    if (count <= 0 || count > 200) return [];
    const units: number[] = [];
    for (let i = 0; i < count; i++) {
      const unitNum = startNum + i;
      if (!existingUnitNumbers.has(String(unitNum))) {
        units.push(unitNum);
      }
    }
    return units;
  }, [startNum, count, existingUnitNumbers]);

  const handleCreate = async () => {
    if (unitsToCreate.length === 0 || !address.trim()) return;
    setIsCreating(true);
    setCreatedCount(null);

    const parsedEstimate = parseInt(estimatedUnitsInput, 10);
    const finalEstimate =
      Number.isFinite(parsedEstimate) && parsedEstimate > 0
        ? parsedEstimate
        : unitsToCreate.length;

    if (initialLatitude != null && initialLongitude != null) {
      await upsertDeclaredBuilding({
        address: address.trim(),
        latitude: initialLatitude,
        longitude: initialLongitude,
        estimatedUnits: finalEstimate,
      });
    }

    const contacts = unitsToCreate.map(unitNum => ({
      first_name: `Unit ${unitNum}`,
      address: address.trim(),
      unit_number: String(unitNum),
      source: 'walk_in' as const,
      ...(initialLatitude != null && initialLongitude != null
        ? { latitude: initialLatitude, longitude: initialLongitude }
        : {}),
    }));

    const created = await bulkAddContacts(contacts);
    setCreatedCount(created.length);
    setIsCreating(false);
  };

  const handleDeclareReset = () => {
    setStartingUnit('1');
    setUnitCount('');
    setEstimatedUnitsInput('');
    setCreatedCount(null);
  };

  // ── Log visits mode logic ──
  const handleLogUnit = useCallback(async () => {
    if (!currentUnit.trim() || !sessionId) return;
    setIsSavingUnit(true);
    try {
      const notePrefix = `[Unit ${currentUnit.trim()}] ${OUTCOME_LABELS[currentOutcome]}`;
      const fullNote = currentUnitNote.trim()
        ? `${notePrefix} — ${currentUnitNote.trim()}`
        : notePrefix;

      // Requires lat/lng — dialog won't reach this path without them when sessionId is set
      const lat = initialLatitude ?? 0;
      const lng = initialLongitude ?? 0;

      await createAnnotation({
        session_id: sessionId,
        latitude: lat,
        longitude: lng,
        note: fullNote,
      });

      const newLoggedUnits: UnitEntry[] = [
        ...loggedUnits,
        { unit: currentUnit.trim(), outcome: currentOutcome, note: currentUnitNote.trim() },
      ];
      setLoggedUnits(newLoggedUnits);

      // Auto-bump declared_building.estimated_units if we've logged more distinct units than declared
      if (initialLatitude != null && initialLongitude != null) {
        const matchingBuilding = declaredBuildings.find(b =>
          coordsNear(initialLatitude, initialLongitude, b.latitude, b.longitude),
        );
        if (matchingBuilding) {
          const distinctUnitCount = new Set(newLoggedUnits.map(u => u.unit)).size;
          if (distinctUnitCount > matchingBuilding.estimated_units) {
            await upsertDeclaredBuilding({
              address: matchingBuilding.address,
              latitude: matchingBuilding.latitude,
              longitude: matchingBuilding.longitude,
              estimatedUnits: distinctUnitCount,
            });
          }
        }
      }

      setCurrentUnit('');
      setCurrentUnitNote('');
      setCurrentOutcome('spoke');
    } catch (error) {
      console.error('Error logging unit annotation:', error);
    } finally {
      setIsSavingUnit(false);
    }
  }, [
    currentUnit,
    currentOutcome,
    currentUnitNote,
    sessionId,
    initialLatitude,
    initialLongitude,
    loggedUnits,
    declaredBuildings,
    createAnnotation,
    upsertDeclaredBuilding,
  ]);

  const dialogTitle = address.trim().length > 0 ? address.trim() : 'Building Activity';

  const declareContent = (
    <View style={styles.content}>
      {existingContacts.length > 0 && (
        <View style={styles.chipSection}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            Existing contacts at this address ({existingContacts.length})
          </Text>
          <View style={styles.chipsRow}>
            {existingContacts.map(c => (
              <Chip
                key={c.id}
                compact
                style={{ backgroundColor: theme.colors.secondaryContainer }}
                textStyle={{ fontSize: 10 }}
              >
                {c.unit_number ? `Unit ${c.unit_number}` : c.first_name}
              </Chip>
            ))}
          </View>
        </View>
      )}

      <View style={styles.row}>
        <TextInput
          label="Starting unit"
          value={startingUnit}
          onChangeText={(t) => { setStartingUnit(t); setCreatedCount(null); }}
          mode="outlined"
          dense
          keyboardType="number-pad"
          style={styles.flex}
        />
        <TextInput
          label="Number of units"
          value={unitCount}
          onChangeText={(t) => { setUnitCount(t); setCreatedCount(null); }}
          mode="outlined"
          dense
          keyboardType="number-pad"
          style={styles.flex}
          placeholder="e.g. 12"
        />
      </View>

      <View style={styles.fieldGap}>
        <TextInput
          label="Total units in building"
          value={estimatedUnitsInput}
          onChangeText={setEstimatedUnitsInput}
          mode="outlined"
          dense
          keyboardType="number-pad"
          placeholder="e.g. 24"
        />
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          Optional — defaults to units created. Used for coverage %.
        </Text>
      </View>

      {count > 0 && existingUnitNumbers.size > 0 && (
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
          {count - unitsToCreate.length} of {count} units already have contacts (will be skipped)
        </Text>
      )}

      {createdCount !== null && (
        <View style={[styles.successRow, { backgroundColor: '#16a34a14' }]}>
          <Icon name="check-circle" size={16} color="#16a34a" />
          <Text variant="bodySmall" style={{ color: '#16a34a', fontWeight: '600', marginLeft: 6 }}>
            Created {createdCount} contacts
          </Text>
        </View>
      )}
    </View>
  );

  const logVisitsContent = (
    <View style={styles.content}>
      {loggedUnits.length > 0 && (
        <View style={styles.chipSection}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
            Logged ({loggedUnits.length})
          </Text>
          <View style={styles.chipsRow}>
            {loggedUnits.map((entry, idx) => {
              const opt = OUTCOME_OPTIONS.find(o => o.value === entry.outcome);
              return (
                <Chip
                  key={idx}
                  compact
                  icon={() => (
                    <Icon name={opt?.icon ?? 'help'} size={14} color={opt?.color ?? '#6b7280'} />
                  )}
                  style={[styles.unitChip, { borderColor: opt?.color ?? '#6b7280' }]}
                  textStyle={{ fontSize: 12 }}
                >
                  {entry.unit}
                </Chip>
              );
            })}
          </View>
        </View>
      )}

      <TextInput
        mode="outlined"
        label="Unit / Apt #"
        placeholder="e.g., 3, 2B, G01"
        value={currentUnit}
        onChangeText={setCurrentUnit}
        autoFocus={mode === 'log_visits'}
        dense
      />

      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 10, marginBottom: 6 }}>
        Outcome
      </Text>
      <View style={styles.outcomeRow}>
        {OUTCOME_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.outcomeButton,
              {
                backgroundColor:
                  currentOutcome === opt.value ? opt.color + '18' : theme.colors.surfaceVariant,
                borderColor: currentOutcome === opt.value ? opt.color : 'transparent',
              },
            ]}
            onPress={() => setCurrentOutcome(opt.value)}
            activeOpacity={0.7}
          >
            <Icon name={opt.icon} size={18} color={opt.color} />
            <Text
              variant="labelSmall"
              numberOfLines={1}
              style={{ color: opt.color, marginTop: 2, fontSize: 10 }}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ marginTop: 8 }}>
        <TextInput
          mode="outlined"
          label="Note (optional)"
          placeholder="Owner name, details..."
          value={currentUnitNote}
          onChangeText={setCurrentUnitNote}
          dense
        />
      </View>

      {!sessionId && (
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, fontStyle: 'italic' }}
        >
          Start a tracking session to log visits
        </Text>
      )}
    </View>
  );

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{dialogTitle}</Dialog.Title>

        <View style={styles.sharedFields}>
          <TextInput
            label="Building address"
            value={address}
            onChangeText={setAddress}
            mode="outlined"
            dense
            left={<TextInput.Icon icon="map-marker" />}
          />
          <View style={styles.segmentGap}>
            <SegmentedButtons
              value={mode}
              onValueChange={(val) => setMode(val as Mode)}
              buttons={[
                { value: 'declare', label: 'Declare', icon: 'office-building-marker' },
                { value: 'log_visits', label: 'Log visits', icon: 'clipboard-list-outline' },
              ]}
            />
          </View>
        </View>

        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView>
            {mode === 'declare' ? declareContent : logVisitsContent}
          </ScrollView>
        </Dialog.ScrollArea>

        {mode === 'declare' && (
          <Dialog.Actions>
            {(address || unitCount) && (
              <Button onPress={handleDeclareReset}>
                Reset
              </Button>
            )}
            <Button
              mode="contained"
              onPress={handleCreate}
              disabled={unitsToCreate.length === 0 || !address.trim() || isCreating}
              loading={isCreating}
              icon="account-multiple-plus"
            >
              Create {unitsToCreate.length} Contact{unitsToCreate.length !== 1 ? 's' : ''}
            </Button>
            <Button onPress={onDismiss}>
              Close
            </Button>
          </Dialog.Actions>
        )}

        {mode === 'log_visits' && (
          <Dialog.Actions>
            <Button
              mode="contained"
              buttonColor="#F59E0B"
              textColor="#FFFFFF"
              icon="plus"
              onPress={handleLogUnit}
              loading={isSavingUnit}
              disabled={!currentUnit.trim() || isSavingUnit || !sessionId}
            >
              Log Unit {currentUnit.trim()}
            </Button>
            <Button onPress={onDismiss}>
              Close
            </Button>
          </Dialog.Actions>
        )}
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '90%',
  },
  sharedFields: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  segmentGap: {
    marginTop: 12,
  },
  scrollArea: {
    paddingHorizontal: 0,
    maxHeight: 400,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 0,
  },
  chipSection: {
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  flex: {
    flex: 1,
  },
  fieldGap: {
    marginTop: 8,
  },
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
  unitChip: {
    borderWidth: 1,
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
