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
import { searchGnafBuildings } from '@realestate-crm/api';
import type { GnafBuilding } from '@realestate-crm/types';

export interface BuildingActivityDialogProps {
  visible: boolean;
  onDismiss: () => void;
  initialAddress?: string;
  initialLatitude: number | null;
  initialLongitude: number | null;
  sessionId?: string | null;
  initialMode?: 'declare' | 'log_visits';
  /** Registered unit numbers from G-NAF. When provided, declare mode creates
   *  contacts for the real register (e.g. 1A, G01) instead of a generated
   *  sequential range, and prefills the building's total units. */
  knownUnitNumbers?: string[];
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
  knownUnitNumbers,
}: BuildingActivityDialogProps) {
  const theme = useTheme();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [address, setAddress] = useState(initialAddress ?? '');

  // ── Declare mode state ──
  const [startingUnit, setStartingUnit] = useState('1');
  const [unitCount, setUnitCount] = useState('');
  const [estimatedUnitsInput, setEstimatedUnitsInput] = useState('');
  // Units the user has tapped OFF in the G-NAF register — default none, so
  // the whole register is selected until they choose otherwise.
  const [deselectedUnits, setDeselectedUnits] = useState<Set<string>>(new Set());
  // G-NAF address search: lets a building be selected from anywhere — the
  // GPS snap only helps when physically within ~60 m of the building.
  const [gnafMatches, setGnafMatches] = useState<GnafBuilding[]>([]);
  const [gnafPick, setGnafPick] = useState<GnafBuilding | null>(null);
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
      // Prefill the building total from the G-NAF register when we have it.
      setEstimatedUnitsInput(
        knownUnitNumbers && knownUnitNumbers.length > 0 ? String(knownUnitNumbers.length) : '',
      );
      setDeselectedUnits(new Set());
      setGnafMatches([]);
      setGnafPick(null);
      setIsCreating(false);
      setCreatedCount(null);
      setLoggedUnits([]);
      setCurrentUnit('');
      setCurrentOutcome('spoke');
      setCurrentUnitNote('');
      setIsSavingUnit(false);
    }
  }, [visible, initialAddress, initialMode, knownUnitNumbers]);

  // Debounced G-NAF lookup as the user types an address. Skipped when a
  // register was passed in (building already identified) or after a pick
  // (until the user edits the address again).
  useEffect(() => {
    if (!visible) return;
    const q = address.trim();
    const pickLabel = gnafPick ? `${gnafPick.address}, ${gnafPick.locality}` : null;
    if (
      q.length < 3 ||
      (knownUnitNumbers && knownUnitNumbers.length > 0) ||
      (pickLabel && q === pickLabel)
    ) {
      setGnafMatches([]);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchGnafBuildings(q);
      setGnafMatches(results);
    }, 300);
    return () => clearTimeout(timer);
  }, [visible, address, knownUnitNumbers, gnafPick]);

  const handlePickGnaf = useCallback((b: GnafBuilding) => {
    setGnafPick(b);
    setAddress(`${b.address}, ${b.locality}`);
    setGnafMatches([]);
    setEstimatedUnitsInput(String(b.unit_count));
    setDeselectedUnits(new Set());
    setCreatedCount(null);
  }, []);

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

  // Register can arrive via prop (GPS snap / building badge press) or via
  // the in-dialog address search. Coords likewise prefer the picked building.
  const effectiveRegister = (knownUnitNumbers && knownUnitNumbers.length > 0)
    ? knownUnitNumbers
    : (gnafPick?.unit_numbers && gnafPick.unit_numbers.length > 0 ? gnafPick.unit_numbers : null);
  const hasRegister = !!effectiveRegister;
  const effectiveLatitude = gnafPick?.latitude ?? initialLatitude;
  const effectiveLongitude = gnafPick?.longitude ?? initialLongitude;

  const unitsToCreate = useMemo<string[]>(() => {
    // G-NAF register available: create the real units (1A, G01, ...) rather
    // than a generated sequential range. Only the units the user has left
    // selected — tapping a chip toggles it out.
    if (effectiveRegister) {
      return effectiveRegister.filter(u => !existingUnitNumbers.has(u) && !deselectedUnits.has(u));
    }
    if (count <= 0 || count > 200) return [];
    const units: string[] = [];
    for (let i = 0; i < count; i++) {
      const unitNum = String(startNum + i);
      if (!existingUnitNumbers.has(unitNum)) {
        units.push(unitNum);
      }
    }
    return units;
  }, [effectiveRegister, deselectedUnits, startNum, count, existingUnitNumbers]);

  const toggleRegisterUnit = useCallback((unit: string) => {
    setCreatedCount(null);
    setDeselectedUnits(prev => {
      const next = new Set(prev);
      if (next.has(unit)) {
        next.delete(unit);
      } else {
        next.add(unit);
      }
      return next;
    });
  }, []);

  const handleCreate = async () => {
    if (unitsToCreate.length === 0 || !address.trim()) return;
    setIsCreating(true);
    setCreatedCount(null);

    const parsedEstimate = parseInt(estimatedUnitsInput, 10);
    const finalEstimate =
      Number.isFinite(parsedEstimate) && parsedEstimate > 0
        ? parsedEstimate
        : (effectiveRegister?.length || unitsToCreate.length);

    if (effectiveLatitude != null && effectiveLongitude != null) {
      await upsertDeclaredBuilding({
        address: address.trim(),
        latitude: effectiveLatitude,
        longitude: effectiveLongitude,
        estimatedUnits: finalEstimate,
      });
    }

    const contacts = unitsToCreate.map(unitNum => ({
      first_name: `Unit ${unitNum}`,
      address: address.trim(),
      unit_number: unitNum,
      source: 'walk_in' as const,
      ...(effectiveLatitude != null && effectiveLongitude != null
        ? { latitude: effectiveLatitude, longitude: effectiveLongitude }
        : {}),
    }));

    const created = await bulkAddContacts(contacts);
    setCreatedCount(created.length);
    setIsCreating(false);
  };

  const handleDeclareReset = () => {
    setStartingUnit('1');
    setUnitCount('');
    setEstimatedUnitsInput(
      knownUnitNumbers && knownUnitNumbers.length > 0 ? String(knownUnitNumbers.length) : '',
    );
    setDeselectedUnits(new Set());
    setGnafPick(null);
    setGnafMatches([]);
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

      // Prefer the picked G-NAF building's coords — annotations land on the
      // building rather than wherever the user happens to be standing.
      const lat = effectiveLatitude ?? 0;
      const lng = effectiveLongitude ?? 0;

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
      if (effectiveLatitude != null && effectiveLongitude != null) {
        const matchingBuilding = declaredBuildings.find(b =>
          coordsNear(effectiveLatitude, effectiveLongitude, b.latitude, b.longitude),
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
    effectiveLatitude,
    effectiveLongitude,
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

      {hasRegister ? (
        // G-NAF register known — pick units instead of entering a range.
        // All units start selected; tap chips to exclude, or use All/None.
        <View style={styles.fieldGap}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="database-check" size={16} color="#16a34a" />
            <Text variant="bodyMedium" style={{ fontWeight: '600', flex: 1 }}>
              {effectiveRegister!.length} registered units (G-NAF)
            </Text>
            <Button
              compact
              onPress={() => { setCreatedCount(null); setDeselectedUnits(new Set()); }}
            >
              All
            </Button>
            <Button
              compact
              onPress={() => {
                setCreatedCount(null);
                setDeselectedUnits(new Set(
                  effectiveRegister!.filter(u => !existingUnitNumbers.has(u)),
                ));
              }}
            >
              None
            </Button>
          </View>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
            Tap units to include or exclude them
          </Text>
          <View style={[styles.chipsRow, { marginTop: 6 }]}>
            {effectiveRegister!.map(u => {
              const exists = existingUnitNumbers.has(u);
              const isSelected = !exists && !deselectedUnits.has(u);
              return (
                <Chip
                  key={u}
                  compact
                  disabled={exists}
                  selected={isSelected}
                  mode={isSelected ? 'flat' : 'outlined'}
                  onPress={exists ? undefined : () => toggleRegisterUnit(u)}
                  style={isSelected ? { backgroundColor: theme.colors.secondaryContainer } : undefined}
                  textStyle={{ fontSize: 10 }}
                >
                  {u}
                </Chip>
              );
            })}
          </View>
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
            {unitsToCreate.length} of {effectiveRegister!.length} unit{effectiveRegister!.length === 1 ? '' : 's'} selected
            {existingUnitNumbers.size > 0
              ? ` — ${[...existingUnitNumbers].filter(u => effectiveRegister!.includes(u)).length} already have contacts`
              : ''}
          </Text>
        </View>
      ) : (
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
      )}

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
          {hasRegister
            ? 'Prefilled from the G-NAF register. Used for coverage %.'
            : 'Optional — defaults to units created. Used for coverage %.'}
        </Text>
      </View>

      {!hasRegister && count > 0 && existingUnitNumbers.size > 0 && (
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

  // Register-aware logging: chips double as the unit picker and the progress
  // board — tap to prefill, logged units wear their outcome.
  const loggedByUnit = useMemo(() => {
    const m = new Map<string, UnitEntry>();
    // Last log wins for display when a unit is logged twice (re-knock).
    for (const e of loggedUnits) m.set(e.unit, e);
    return m;
  }, [loggedUnits]);

  const offRegisterLogs = useMemo(
    () => (hasRegister ? loggedUnits.filter(e => !effectiveRegister!.includes(e.unit)) : loggedUnits),
    [hasRegister, effectiveRegister, loggedUnits],
  );

  const registerLoggedCount = useMemo(
    () => (hasRegister ? effectiveRegister!.filter(u => loggedByUnit.has(u)).length : 0),
    [hasRegister, effectiveRegister, loggedByUnit],
  );

  const logVisitsContent = (
    <View style={styles.content}>
      {hasRegister && (
        <View style={styles.chipSection}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Icon name="database-check" size={14} color="#16a34a" />
            <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Units (G-NAF) — {registerLoggedCount} of {effectiveRegister!.length} logged
            </Text>
          </View>
          <View style={[styles.chipsRow, { marginTop: 6 }]}>
            {effectiveRegister!.map(u => {
              const entry = loggedByUnit.get(u);
              const opt = entry ? OUTCOME_OPTIONS.find(o => o.value === entry.outcome) : null;
              const isCurrent = currentUnit.trim() === u;
              return (
                <Chip
                  key={u}
                  compact
                  selected={isCurrent}
                  mode={entry || isCurrent ? 'flat' : 'outlined'}
                  icon={entry ? () => (
                    <Icon name={opt?.icon ?? 'check'} size={12} color={opt?.color ?? '#6b7280'} />
                  ) : undefined}
                  onPress={() => setCurrentUnit(u)}
                  style={[
                    isCurrent ? { backgroundColor: theme.colors.secondaryContainer } : undefined,
                    entry && !isCurrent ? { borderColor: opt?.color ?? '#6b7280' } : undefined,
                  ]}
                  textStyle={{ fontSize: 10 }}
                >
                  {u}
                </Chip>
              );
            })}
          </View>
        </View>
      )}

      {offRegisterLogs.length > 0 && (
        <View style={styles.chipSection}>
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 6 }}>
            {hasRegister ? `Logged off-register (${offRegisterLogs.length})` : `Logged (${offRegisterLogs.length})`}
          </Text>
          <View style={styles.chipsRow}>
            {offRegisterLogs.map((entry, idx) => {
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
        autoFocus={mode === 'log_visits' && !hasRegister}
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
        <Dialog.Title numberOfLines={2}>{dialogTitle}</Dialog.Title>

        <View style={styles.sharedFields}>
          <TextInput
            label="Building address"
            value={address}
            onChangeText={(t) => {
              setAddress(t);
              // Editing the address invalidates a previous pick — its coords
              // and register no longer describe what the user is typing.
              if (gnafPick && t !== `${gnafPick.address}, ${gnafPick.locality}`) {
                setGnafPick(null);
              }
            }}
            mode="outlined"
            dense
            left={<TextInput.Icon icon="map-marker" />}
          />
          {/* G-NAF matches as-you-type — works from anywhere, unlike the GPS
              snap which needs the user within ~60 m of the building. */}
          {gnafMatches.length > 0 && (
            <View style={[styles.gnafResults, { backgroundColor: theme.colors.surfaceVariant }]}>
              {gnafMatches.map(b => (
                <TouchableOpacity
                  key={b.id}
                  style={styles.gnafResultRow}
                  onPress={() => handlePickGnaf(b)}
                  activeOpacity={0.7}
                >
                  <Icon name="office-building" size={16} color={theme.colors.primary} />
                  <Text variant="bodySmall" numberOfLines={1} style={{ flex: 1, marginLeft: 8 }}>
                    {b.address}, {b.locality}
                  </Text>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {b.unit_count} units
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
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
  gnafResults: {
    borderRadius: 8,
    marginTop: 4,
    overflow: 'hidden',
  },
  gnafResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
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
