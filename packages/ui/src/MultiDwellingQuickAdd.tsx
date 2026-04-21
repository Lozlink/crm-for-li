// No props-to-state sync: parent must remount (e.g. via `key`) to reset initial* props.
import { useMemo, useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { useTheme, Text, Surface, TextInput, Button, Chip } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCRMStore, useProspectingMatcher, useDeclaredBuildingsStore } from '@realestate-crm/hooks';

export interface MultiDwellingQuickAddProps {
  /** Pre-fill the address input (typically from a map pin handoff) */
  initialAddress?: string;
  /** Pre-fill coords that will be attached to each created contact */
  initialLatitude?: number | null;
  initialLongitude?: number | null;
  /** When true (default), wraps in collapsible Surface card. When false, renders form body only — use inside a Dialog.Content. */
  collapsible?: boolean;
  /** Fired after bulkAddContacts completes, with the number of contacts actually created */
  onCreated?: (createdCount: number) => void;
}

export default function MultiDwellingQuickAdd({
  initialAddress,
  initialLatitude,
  initialLongitude,
  collapsible = true,
  onCreated,
}: MultiDwellingQuickAddProps) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(() => !collapsible || !!(initialAddress && initialAddress.length > 0));
  const [address, setAddress] = useState(() => initialAddress ?? '');
  const [startingUnit, setStartingUnit] = useState('1');
  const [unitCount, setUnitCount] = useState('');
  const [estimatedUnitsInput, setEstimatedUnitsInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const [pinLat] = useState<number | null>(() => initialLatitude ?? null);
  const [pinLng] = useState<number | null>(() => initialLongitude ?? null);

  const bulkAddContacts = useCRMStore(s => s.bulkAddContacts);
  const upsertDeclaredBuilding = useDeclaredBuildingsStore(s => s.upsertDeclaredBuilding);
  const { matchContactByAddress } = useProspectingMatcher(null, null);

  const existingContacts = useMemo(() => {
    if (address.trim().length < 3) return [];
    return matchContactByAddress(address);
  }, [address, matchContactByAddress]);

  const existingUnitNumbers = useMemo(() => {
    return new Set(
      existingContacts
        .map(c => c.unit_number)
        .filter((u): u is string => !!u),
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

    // Persist the declared building first so coverage metrics/map overlays pick it up
    // even if some contact inserts fail. Coords-less addresses can't be rendered.
    const parsedEstimate = parseInt(estimatedUnitsInput, 10);
    const finalEstimate = Number.isFinite(parsedEstimate) && parsedEstimate > 0
      ? parsedEstimate
      : unitsToCreate.length;

    if (pinLat != null && pinLng != null) {
      await upsertDeclaredBuilding({
        address: address.trim(),
        latitude: pinLat,
        longitude: pinLng,
        estimatedUnits: finalEstimate,
      });
    }

    const contacts = unitsToCreate.map(unitNum => ({
      first_name: `Unit ${unitNum}`,
      address: address.trim(),
      unit_number: String(unitNum),
      source: 'walk_in' as const,
      ...(pinLat != null && pinLng != null ? { latitude: pinLat, longitude: pinLng } : {}),
    }));

    const created = await bulkAddContacts(contacts);
    setCreatedCount(created.length);
    onCreated?.(created.length);
    setIsCreating(false);
  };

  const handleReset = () => {
    setAddress('');
    setStartingUnit('1');
    setUnitCount('');
    setEstimatedUnitsInput('');
    setCreatedCount(null);
  };

  const body = (
    <View style={collapsible ? styles.multiDwellingBody : undefined}>
      <TextInput
        label="Building address"
        value={address}
        onChangeText={(text) => { setAddress(text); setCreatedCount(null); }}
        mode="outlined"
        dense
        left={<TextInput.Icon icon="map-marker" />}
      />

      {existingContacts.length > 0 && (
        <View style={{ marginTop: 8 }}>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginBottom: 4 }}>
            Existing contacts at this address ({existingContacts.length})
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
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

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TextInput
          label="Starting unit"
          value={startingUnit}
          onChangeText={(text) => { setStartingUnit(text); setCreatedCount(null); }}
          mode="outlined"
          dense
          keyboardType="number-pad"
          style={{ flex: 1 }}
        />
        <TextInput
          label="Number of units"
          value={unitCount}
          onChangeText={(text) => { setUnitCount(text); setCreatedCount(null); }}
          mode="outlined"
          dense
          keyboardType="number-pad"
          style={{ flex: 1 }}
          placeholder="e.g. 12"
        />
      </View>

      <View style={{ marginTop: 8 }}>
        <TextInput
          label="Total units in building"
          value={estimatedUnitsInput}
          onChangeText={(text) => setEstimatedUnitsInput(text)}
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
        <View style={[styles.multiDwellingSuccess, { backgroundColor: '#16a34a14' }]}>
          <Icon name="check-circle" size={16} color="#16a34a" />
          <Text variant="bodySmall" style={{ color: '#16a34a', fontWeight: '600', marginLeft: 6 }}>
            Created {createdCount} contacts
          </Text>
        </View>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
        {(address || unitCount) && (
          <Button compact onPress={handleReset}>
            Reset
          </Button>
        )}
        <Button
          mode="contained"
          compact
          onPress={handleCreate}
          disabled={unitsToCreate.length === 0 || !address.trim() || isCreating}
          loading={isCreating}
          icon="account-multiple-plus"
        >
          Create {unitsToCreate.length} Contact{unitsToCreate.length !== 1 ? 's' : ''}
        </Button>
      </View>
    </View>
  );

  if (!collapsible) {
    return body;
  }

  return (
    <Surface style={[styles.card, { backgroundColor: theme.colors.surface }]} elevation={1}>
      <TouchableOpacity
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
        style={styles.cardInner}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Icon name="office-building-marker" size={18} color={theme.colors.primary} />
          <Text variant="titleSmall" style={{ fontWeight: '700', flex: 1 }}>
            Quick Add Multi-Dwelling
          </Text>
          <Icon
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={20}
            color={theme.colors.onSurfaceVariant}
          />
        </View>
      </TouchableOpacity>

      {expanded && body}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 14,
  },
  multiDwellingBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 0,
  },
  multiDwellingSuccess: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    marginTop: 8,
  },
});
