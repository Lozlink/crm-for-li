import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  IconButton,
  Portal,
  TextInput,
  Text,
  Checkbox,
  Chip,
  useTheme,
  ActivityIndicator,
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type {
  WhiteboardChecklistContent,
  WhiteboardChecklistEntry,
  WhiteboardContactContent,
  WhiteboardGoalContent,
  WhiteboardGoalMetric,
  WhiteboardGoalPeriod,
  WhiteboardItem,
  WhiteboardMapContent,
  WhiteboardPhotoContent,
  WhiteboardPropertyContent,
  WhiteboardStickyContent,
} from '@realestate-crm/types';
import { generateUUID, isDemoMode, reverseGeocode, uploadWhiteboardPhotoFile } from '@realestate-crm/api';
import { useCRMStore, usePropertyStore } from '@realestate-crm/hooks';
import { STICKY_COLOR_DEFS, stickyColorKey } from './whiteboardColors';
import { useColorScheme } from 'react-native';
import { stickyColorForScheme } from './whiteboardColors';

const GOAL_METRICS: { value: WhiteboardGoalMetric; label: string; icon: string }[] = [
  { value: 'commission', label: 'Commission', icon: 'cash-multiple' },
  { value: 'listings', label: 'Listings', icon: 'home-plus-outline' },
  { value: 'leads', label: 'Leads', icon: 'account-plus-outline' },
  { value: 'calls', label: 'Calls', icon: 'phone-outline' },
];

const GOAL_PERIODS: { value: WhiteboardGoalPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'quarter', label: 'This quarter' },
];

/**
 * Per-entry editor for checklist rows.
 *
 * Why a separate component: when the TextInput's `value` is sourced directly
 * from a parent array, every keystroke triggers a parent re-render that
 * passes a new `value` prop to the input. On RN-Paper's `mode="flat" dense`
 * wrapper this races the native cursor sync and resets the caret to position
 * 0 — the user-visible symptom is "text writes backwards when prepending"
 * because each typed char then lands at index 0 of the next render's value.
 *
 * Sourcing `value` from local state breaks that race: parent re-renders no
 * longer change the input's `value` prop, so the cursor stays where the user
 * puts it. We still commit on every change so Save sees the latest text
 * without depending on blur-then-tap event ordering.
 */
function ChecklistEntryEditor({
  initialText,
  onCommit,
}: {
  initialText: string;
  onCommit: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);

  // Re-hydrate when the parent's notion of initialText changes for an external
  // reason (modal re-opens for a different entry, entry reordered, etc).
  // The functional updater short-circuits the no-op case where the parent is
  // just echoing back our own commit, avoiding a redundant render.
  useEffect(() => {
    setText((curr) => (curr === initialText ? curr : initialText));
  }, [initialText]);

  return (
    <TextInput
      mode="flat"
      dense
      style={styles.entryInput}
      value={text}
      onChangeText={(t) => {
        setText(t);
        onCommit(t);
      }}
    />
  );
}

interface Props {
  item: WhiteboardItem | null;
  onDismiss: () => void;
  onSave: (id: string, patch: { content: WhiteboardItem['content']; color?: string | null }) => void;
}

/**
 * Modal editor for sticky / checklist / photo items.
 *
 * IMPORTANT: Paper's Dialog.Actions does not tolerate Fragment children
 * (project-known gotcha — see session-2026-04-22-declared-buildings).
 * Always pass plain Buttons, never wrap in <></>.
 */
export function EditItemSheet({ item, onDismiss, onSave }: Props) {
  const theme = useTheme();
  const colorScheme = useColorScheme();

  // Sticky local state
  const [stickyText, setStickyText] = useState('');
  const [stickyColor, setStickyColor] = useState<string | null>(null);

  // Checklist local state
  const [checklistTitle, setChecklistTitle] = useState('');
  const [checklistEntries, setChecklistEntries] = useState<WhiteboardChecklistEntry[]>([]);
  const [newEntryText, setNewEntryText] = useState('');

  // Photo local state
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoCaption, setPhotoCaption] = useState('');
  const [photoLocalUri, setPhotoLocalUri] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  // Contact picker state
  const [contactId, setContactId] = useState<string>('');
  const [contactSearch, setContactSearch] = useState('');

  // Property picker state
  const [propertyId, setPropertyId] = useState<string>('');
  const [propertySearch, setPropertySearch] = useState('');

  // Goal state
  const [goalMetric, setGoalMetric] = useState<WhiteboardGoalMetric>('commission');
  const [goalTarget, setGoalTarget] = useState<string>('5000');
  const [goalPeriod, setGoalPeriod] = useState<WhiteboardGoalPeriod>('month');

  // Map state — region drives the picker MapView; pickedAddress shows resolved name.
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: -33.8688,
    longitude: 151.2093,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
  });
  const [mapPickedAddress, setMapPickedAddress] = useState<string | null>(null);
  const mapRef = useRef<MapView>(null);
  const geocodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live data for pickers — read at hook level so we don't break the rules.
  const allContacts = useCRMStore((s) => s.contacts);
  const allProperties = usePropertyStore((s) => s.properties);

  const filteredContacts = useMemo(() => {
    const q = contactSearch.trim().toLowerCase();
    const list = allContacts.slice(0, 50); // bound for perf
    if (!q) return list;
    return allContacts.filter((c) => {
      const name = `${c.first_name ?? ''} ${c.last_name ?? ''}`.toLowerCase();
      const addr = (c.address ?? '').toLowerCase();
      return name.includes(q) || addr.includes(q);
    }).slice(0, 50);
  }, [allContacts, contactSearch]);

  const filteredProperties = useMemo(() => {
    const q = propertySearch.trim().toLowerCase();
    const list = allProperties.slice(0, 50);
    if (!q) return list;
    return allProperties.filter((p) => {
      return p.address.toLowerCase().includes(q) || (p.suburb ?? '').toLowerCase().includes(q);
    }).slice(0, 50);
  }, [allProperties, propertySearch]);

  // Hydrate local state when item changes.
  useEffect(() => {
    if (!item) return;
    if (item.type === 'sticky') {
      const c = item.content as WhiteboardStickyContent;
      setStickyText(c?.text || '');
      setStickyColor(item.color);
    } else if (item.type === 'checklist') {
      const c = item.content as WhiteboardChecklistContent;
      setChecklistTitle(c?.title || '');
      setChecklistEntries(c?.items ? [...c.items] : []);
      setNewEntryText('');
    } else if (item.type === 'photo') {
      const c = item.content as WhiteboardPhotoContent;
      setPhotoUrl(c?.url || '');
      setPhotoCaption(c?.caption || '');
      setPhotoLocalUri(null);
      setPhotoUploading(false);
      setPhotoError(null);
    } else if (item.type === 'contact') {
      const c = item.content as WhiteboardContactContent;
      setContactId(c?.contactId || '');
      setContactSearch('');
    } else if (item.type === 'property') {
      const c = item.content as WhiteboardPropertyContent;
      setPropertyId(c?.propertyId || '');
      setPropertySearch('');
    } else if (item.type === 'goal') {
      const c = item.content as WhiteboardGoalContent;
      setGoalMetric(c?.metric ?? 'commission');
      setGoalTarget(String(c?.target ?? 5000));
      setGoalPeriod(c?.period ?? 'month');
    } else if (item.type === 'map') {
      const c = item.content as WhiteboardMapContent;
      const lat = c?.viewport?.lat ?? -33.8688;
      const lng = c?.viewport?.lng ?? 151.2093;
      const zoom = c?.viewport?.zoom ?? 13;
      const latDelta = 360 / Math.pow(2, zoom);
      setMapRegion({
        latitude: lat,
        longitude: lng,
        latitudeDelta: latDelta,
        longitudeDelta: latDelta,
      });
      setMapPickedAddress(c?.address ?? null);
    }
  }, [item]);

  // Reverse-geocode the picker's current coords whenever they change. Centralized
  // here so every input path (camera pan, marker drag, long-press) reliably
  // resolves a fresh address — earlier inlined-handler versions skipped marker
  // drag and persisted the stale default-coords address ("25 Martin Place").
  // 600ms debounce so dragging across the map doesn't hammer Nominatim.
  useEffect(() => {
    if (!item || item.type !== 'map') return;
    if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    geocodeTimerRef.current = setTimeout(async () => {
      const result = await reverseGeocode(mapRegion.latitude, mapRegion.longitude);
      setMapPickedAddress(result?.address ?? null);
    }, 600);
    return () => {
      if (geocodeTimerRef.current) clearTimeout(geocodeTimerRef.current);
    };
  }, [mapRegion.latitude, mapRegion.longitude, item]);

  if (!item) return null;

  const photoUploadLocked = item.type === 'photo' && photoUploading;
  const photoPreviewUri = photoLocalUri || photoUrl;

  const handleDialogDismiss = () => {
    if (photoUploadLocked) return;
    onDismiss();
  };

  const handleSave = () => {
    if (item.type === 'photo' && photoUploadLocked) return;

    if (item.type === 'sticky') {
      onSave(item.id, {
        content: { text: stickyText } as WhiteboardStickyContent,
        color: stickyColor,
      });
    } else if (item.type === 'checklist') {
      onSave(item.id, {
        content: {
          title: checklistTitle.trim() || undefined,
          items: checklistEntries,
        } as WhiteboardChecklistContent,
      });
    } else if (item.type === 'photo') {
      const trimmedUrl = photoUrl.trim();
      onSave(item.id, {
        content: {
          url: trimmedUrl,
          caption: photoCaption.trim() || undefined,
        } as WhiteboardPhotoContent,
      });
    } else if (item.type === 'contact') {
      const c = allContacts.find((x) => x.id === contactId);
      onSave(item.id, {
        content: {
          contactId,
          snapshotName: c
            ? [c.first_name, c.last_name].filter(Boolean).join(' ') || undefined
            : undefined,
        } as WhiteboardContactContent,
      });
    } else if (item.type === 'property') {
      const p = allProperties.find((x) => x.id === propertyId);
      onSave(item.id, {
        content: {
          propertyId,
          snapshotAddress: p?.address,
        } as WhiteboardPropertyContent,
      });
    } else if (item.type === 'goal') {
      onSave(item.id, {
        content: {
          metric: goalMetric,
          target: parseFloat(goalTarget) || 0,
          period: goalPeriod,
        } as WhiteboardGoalContent,
      });
    } else if (item.type === 'map') {
      const lat = mapRegion.latitude;
      const lng = mapRegion.longitude;
      const zoom = Math.round(Math.log2(360 / mapRegion.latitudeDelta));
      const clampedZoom = Math.max(1, Math.min(21, zoom));
      const prevContent = item.content as WhiteboardMapContent;
      const coordsChanged =
        prevContent.viewport.lat !== lat || prevContent.viewport.lng !== lng;
      const mapContent: WhiteboardMapContent = {
        ...prevContent,
        viewport: { lat, lng, zoom: clampedZoom },
        // Keep the address the picker resolved; clear if coords moved significantly.
        address: coordsChanged ? (mapPickedAddress ?? undefined) : prevContent.address,
        suburb: coordsChanged ? undefined : prevContent.suburb,
      };
      onSave(item.id, { content: mapContent });
    }
    onDismiss();
  };

  const addChecklistEntry = () => {
    const t = newEntryText.trim();
    if (!t) return;
    setChecklistEntries((prev) => [...prev, { id: generateUUID(), text: t, checked: false }]);
    setNewEntryText('');
  };

  const toggleEntry = (id: string) => {
    setChecklistEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, checked: !e.checked } : e)),
    );
  };

  const updateEntryText = (id: string, text: string) => {
    setChecklistEntries((prev) => prev.map((e) => (e.id === id ? { ...e, text } : e)));
  };

  const removeEntry = (id: string) => {
    setChecklistEntries((prev) => prev.filter((e) => e.id !== id));
  };

  // ── Photo picker helpers ──────────────────────────────────────────────────

  const uploadPhoto = async (asset: ImagePicker.ImagePickerAsset): Promise<string | null> => {
    if (isDemoMode) {
      // Demo mode: use a placeholder so the card renders without Supabase.
      return `https://picsum.photos/seed/${Math.floor(Math.random() * 1000)}/400/300`;
    }
    try {
      // 2026-05-11: switched from ArrayBuffer upload to FormData/file-URI
      // upload because `supabase.storage.upload(buffer, ...)` silently fails
      // on production Android (RN OkHttp ArrayBuffer body issue). The new
      // path uploads from `asset.uri` directly via multipart fetch — works
      // identically on iOS and Android. See uploadWhiteboardPhotoFile.
      if (!asset.uri) {
        setPhotoError('Selected photo had no local URI. Please try a different image.');
        return null;
      }

      const mimeType = asset.mimeType || 'image/jpeg';
      // Surface a size hint when available so users don't think the upload
      // is stuck (picker's `fileSize` is in bytes, optional).
      const sizeHint =
        typeof asset.fileSize === 'number' && asset.fileSize > 0
          ? ` (${(asset.fileSize / 1024).toFixed(0)} KB)`
          : '';
      setPhotoError(`Uploading ${mimeType}${sizeHint}…`);

      const publicUrl = await uploadWhiteboardPhotoFile({
        uri: asset.uri,
        mimeType: asset.mimeType,
        fileName: asset.fileName,
      });

      console.log('Photo uploaded:', publicUrl);
      // Clear the diagnostic on success so the UI returns to the normal state.
      setPhotoError(null);
      return publicUrl;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setPhotoError(`Photo upload threw: ${msg}`);
      console.error('Photo upload threw:', e);
      return null;
    }
  };

  const handlePickedPhoto = async (asset: ImagePicker.ImagePickerAsset) => {
    setPhotoLocalUri(asset.uri);
    setPhotoUploading(true);

    try {
      const url = await uploadPhoto(asset);
      if (url) {
        setPhotoUrl(url);
        return;
      }

      // Upload failed silently — surface it. Clear the local preview so the
      // user isn't tricked into thinking their photo is saved (the unsaved
      // local URI looks identical to a saved remote URL on screen).
      setPhotoLocalUri(null);
      setPhotoError('Upload failed. Check your connection and try again.');
    } finally {
      setPhotoUploading(false);
    }
  };

  const pickFromCamera = async () => {
    setPhotoError(null);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      setPhotoError('Camera permission denied. Enable it in Settings to take photos.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      // base64=false: we upload via file URI now (FormData multipart), so the
      // base64 payload is no longer needed. Skipping it saves ~5MB of JS-heap
      // memory per photo on Android (used to OOM on big captures).
      base64: false,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    await handlePickedPhoto(result.assets[0]);
  };

  const pickFromLibrary = async () => {
    setPhotoError(null);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setPhotoError('Photo library permission denied. Enable it in Settings to choose photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsEditing: true,
      // base64=false: we upload via file URI now (FormData multipart), so the
      // base64 payload is no longer needed. Skipping it saves ~5MB of JS-heap
      // memory per photo on Android (used to OOM on big captures).
      base64: false,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    await handlePickedPhoto(result.assets[0]);
  };

  // Suggestion cards are read-only — they're snapshots from the Intelligence
  // sidebar at the moment of "Add to board".
  const titleByType: Partial<Record<typeof item.type, string>> = {
    sticky: 'Edit quick note',
    checklist: 'Edit to-do',
    photo: 'Edit photo',
    contact: 'Pick a contact',
    property: 'Pick a property',
    goal: 'Set your goal',
    map: 'Set map pin',
  };

  return (
    <Portal>
      <Dialog
        visible={!!item}
        onDismiss={handleDialogDismiss}
        dismissable={!photoUploadLocked}
        dismissableBackButton={!photoUploadLocked}
        style={styles.dialog}
      >
        <Dialog.Title>{titleByType[item.type] ?? 'Edit'}</Dialog.Title>

        <Dialog.ScrollArea style={styles.scrollArea}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
            {item.type === 'sticky' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Text"
                  multiline
                  numberOfLines={6}
                  value={stickyText}
                  onChangeText={setStickyText}
                />
                <Text variant="labelMedium" style={styles.swatchLabel}>
                  Color
                </Text>
                <View style={styles.swatchRow}>
                  {STICKY_COLOR_DEFS.map((def) => {
                    const key = stickyColorKey(def);
                    const displayColor = stickyColorForScheme(def, colorScheme);
                    const selected = stickyColor === key;
                    return (
                      <View
                        key={key}
                        style={[
                          styles.swatchWrap,
                          selected && { borderColor: theme.colors.primary, borderWidth: 2 },
                        ]}
                      >
                        <IconButton
                          accessibilityLabel={def.name}
                          icon={selected ? 'check' : 'circle'}
                          iconColor={selected ? '#1A1A1A' : displayColor}
                          size={20}
                          containerColor={displayColor}
                          onPress={() => setStickyColor(key)}
                        />
                      </View>
                    );
                  })}
                </View>
              </View>
            )}

            {item.type === 'checklist' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Title"
                  value={checklistTitle}
                  onChangeText={setChecklistTitle}
                />
                <View style={{ marginTop: 12 }}>
                  {checklistEntries.map((entry) => (
                    <View key={entry.id} style={styles.entryRow}>
                      <Checkbox.Android
                        status={entry.checked ? 'checked' : 'unchecked'}
                        onPress={() => toggleEntry(entry.id)}
                      />
                      <ChecklistEntryEditor
                        initialText={entry.text}
                        onCommit={(t) => updateEntryText(entry.id, t)}
                      />
                      <IconButton
                        icon="close"
                        size={18}
                        onPress={() => removeEntry(entry.id)}
                        accessibilityLabel="Remove item"
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.addRow}>
                  <TextInput
                    mode="outlined"
                    dense
                    label="Add item"
                    value={newEntryText}
                    onChangeText={setNewEntryText}
                    onSubmitEditing={addChecklistEntry}
                    returnKeyType="done"
                    style={{ flex: 1 }}
                  />
                  <IconButton
                    icon="plus"
                    mode="contained-tonal"
                    onPress={addChecklistEntry}
                    disabled={!newEntryText.trim()}
                    accessibilityLabel="Add"
                  />
                </View>
              </View>
            )}

            {item.type === 'photo' && (
              <View>
                <View style={styles.photoButtonRow}>
                  <Button
                    mode="outlined"
                    icon="camera"
                    onPress={pickFromCamera}
                    style={styles.photoButton}
                    disabled={photoUploading}
                  >
                    Take photo
                  </Button>
                  <Button
                    mode="outlined"
                    icon="image"
                    onPress={pickFromLibrary}
                    style={styles.photoButton}
                    disabled={photoUploading}
                  >
                    Choose from library
                  </Button>
                </View>
                {photoUploading && (
                  <View style={styles.photoUploadingRow}>
                    <ActivityIndicator size="small" />
                    <Text variant="bodySmall" style={styles.photoUploadingText}>
                      Uploading...
                    </Text>
                  </View>
                )}
                {photoError && !photoUploading && (
                  <Text
                    variant="bodySmall"
                    style={[styles.photoUploadingText, { color: theme.colors.error, marginTop: 6 }]}
                  >
                    {photoError}
                  </Text>
                )}
                {photoPreviewUri && (
                  <Image
                    source={{ uri: photoPreviewUri }}
                    style={styles.photoPreview}
                    resizeMode="cover"
                  />
                )}
                <TextInput
                  mode="outlined"
                  label="Caption"
                  value={photoCaption}
                  onChangeText={setPhotoCaption}
                  style={{ marginTop: 8 }}
                />
              </View>
            )}

            {item.type === 'contact' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Search contacts"
                  value={contactSearch}
                  onChangeText={setContactSearch}
                  autoCapitalize="words"
                />
                <View style={styles.pickerList}>
                  {filteredContacts.length === 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, padding: 8 }}>
                      No contacts match. Try a different search.
                    </Text>
                  )}
                  {filteredContacts.map((c) => {
                    const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim() || 'Unnamed';
                    const selected = c.id === contactId;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => setContactId(c.id)}
                        style={({ pressed }) => [
                          styles.pickerRow,
                          {
                            backgroundColor: selected
                              ? theme.colors.primaryContainer
                              : pressed
                                ? theme.colors.surfaceVariant
                                : 'transparent',
                          },
                        ]}
                      >
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                          {name}
                        </Text>
                        {!!c.address && (
                          <Text
                            variant="bodySmall"
                            numberOfLines={1}
                            style={{ color: theme.colors.onSurfaceVariant }}
                          >
                            {c.address}
                          </Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {item.type === 'property' && (
              <View>
                <TextInput
                  mode="outlined"
                  label="Search properties"
                  value={propertySearch}
                  onChangeText={setPropertySearch}
                />
                <View style={styles.pickerList}>
                  {filteredProperties.length === 0 && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, padding: 8 }}>
                      No properties match. Try a different search.
                    </Text>
                  )}
                  {filteredProperties.map((p) => {
                    const selected = p.id === propertyId;
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setPropertyId(p.id)}
                        style={({ pressed }) => [
                          styles.pickerRow,
                          {
                            backgroundColor: selected
                              ? theme.colors.primaryContainer
                              : pressed
                                ? theme.colors.surfaceVariant
                                : 'transparent',
                          },
                        ]}
                      >
                        <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                          {p.address}
                        </Text>
                        <Text
                          variant="bodySmall"
                          style={{ color: theme.colors.onSurfaceVariant }}
                        >
                          {p.suburb}{p.state ? `, ${p.state}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {item.type === 'goal' && (
              <View>
                <Text variant="labelMedium" style={styles.swatchLabel}>Metric</Text>
                <View style={styles.chipRow}>
                  {GOAL_METRICS.map((m) => (
                    <Chip
                      key={m.value}
                      icon={m.icon}
                      selected={goalMetric === m.value}
                      onPress={() => setGoalMetric(m.value)}
                      compact
                    >
                      {m.label}
                    </Chip>
                  ))}
                </View>
                <TextInput
                  mode="outlined"
                  label={`Target${goalMetric === 'commission' ? ' ($)' : ''}`}
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  keyboardType="numeric"
                  style={{ marginTop: 12 }}
                />
                <Text variant="labelMedium" style={styles.swatchLabel}>Period</Text>
                <View style={styles.chipRow}>
                  {GOAL_PERIODS.map((p) => (
                    <Chip
                      key={p.value}
                      selected={goalPeriod === p.value}
                      onPress={() => setGoalPeriod(p.value)}
                      compact
                    >
                      {p.label}
                    </Chip>
                  ))}
                </View>
              </View>
            )}

            {item.type === 'map' && (
              <View>
                <Text variant="labelMedium" style={styles.swatchLabel}>Pick location</Text>
                <View style={styles.mapPickerContainer}>
                  <MapView
                    ref={mapRef}
                    provider={PROVIDER_GOOGLE}
                    style={styles.mapPicker}
                    region={mapRegion}
                    // Geocoding happens in a useEffect on [mapRegion.latitude,
                    // mapRegion.longitude] so ALL input paths (camera pan, marker
                    // drag, long-press) automatically resolve to a fresh address.
                    // Earlier versions inlined the geocode here, which silently
                    // skipped marker drags and persisted a stale "default coords"
                    // address.
                    onRegionChangeComplete={setMapRegion}
                    onLongPress={(e) => {
                      const { latitude, longitude } = e.nativeEvent.coordinate;
                      const next: Region = {
                        latitude,
                        longitude,
                        latitudeDelta: mapRegion.latitudeDelta,
                        longitudeDelta: mapRegion.longitudeDelta,
                      };
                      setMapRegion(next);
                      mapRef.current?.animateToRegion(next, 300);
                    }}
                  >
                    <Marker
                      coordinate={{ latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                      draggable
                      onDragEnd={(e) => {
                        const { latitude, longitude } = e.nativeEvent.coordinate;
                        setMapRegion((prev) => ({ ...prev, latitude, longitude }));
                      }}
                    />
                  </MapView>
                </View>
                {/* Live zoom indicator — updates as the user pinches so they see
                    exactly what tile-zoom will be persisted on Save. */}
                <Text variant="bodySmall" style={[styles.helper, { marginTop: 6 }]}>
                  Zoom: {Math.max(1, Math.min(21, Math.round(Math.log2(360 / mapRegion.latitudeDelta))))}
                </Text>
                {mapPickedAddress !== null && (
                  <Text
                    variant="bodySmall"
                    style={[styles.helper, { marginTop: 2 }]}
                    numberOfLines={2}
                  >
                    {mapPickedAddress}
                  </Text>
                )}
                <Text variant="bodySmall" style={styles.helper}>
                  Drag the pin or long-press to reposition.
                </Text>
              </View>
            )}
          </ScrollView>
        </Dialog.ScrollArea>

        {/* Dialog.Actions: NO fragment wrappers — Paper crashes on them. */}
        <Dialog.Actions>
          <Button onPress={handleDialogDismiss} disabled={photoUploadLocked}>Cancel</Button>
          <Button mode="contained" onPress={handleSave} disabled={photoUploadLocked}>Save</Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  dialog: {
    maxHeight: '88%',
  },
  scrollArea: {
    paddingHorizontal: 0,
  },
  body: {
    paddingHorizontal: 24,
    paddingVertical: 4,
  },
  swatchLabel: {
    marginTop: 12,
    marginBottom: 6,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  swatchWrap: {
    borderRadius: 999,
    borderColor: 'transparent',
    borderWidth: 2,
  },
  entryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryInput: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 4,
  },
  pickerList: {
    marginTop: 8,
    maxHeight: 280,
  },
  pickerRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  helper: {
    marginTop: 4,
    marginBottom: 8,
    opacity: 0.7,
  },
  photoButtonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  photoButton: {
    flex: 1,
  },
  photoUploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  photoUploadingText: {
    opacity: 0.7,
  },
  photoPreview: {
    width: '100%',
    height: 160,
    borderRadius: 8,
    marginTop: 10,
  },
  mapPickerContainer: {
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 6,
  },
  mapPicker: {
    height: 210,
    width: '100%',
  },
});
