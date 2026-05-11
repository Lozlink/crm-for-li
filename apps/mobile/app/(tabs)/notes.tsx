import { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, FlatList, Pressable } from 'react-native';
import { Searchbar, FAB, useTheme, Text, Card, Chip, Surface, SegmentedButtons, Portal, Dialog, Button, ActivityIndicator, Snackbar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCRMStore, useTrackingStore, useWhiteboardStore, useGeocodedAddress } from '@realestate-crm/hooks';
import { reverseGeocode } from '@realestate-crm/api';
import { formatRelativeDate } from '@realestate-crm/utils';
import { Contact, Activity, TrackingAnnotation, ActivitySource } from '@realestate-crm/types';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const SOURCE_BADGE_CONFIG: Record<string, { label: string; color: string }> = {
  tracking: { label: 'Field', color: '#F59E0B' },
  field: { label: 'Field', color: '#F59E0B' },
  office: { label: 'Office', color: '#3B82F6' },
  call: { label: 'Call', color: '#10B981' },
  inspection: { label: 'Inspection', color: '#8B5CF6' },
  import: { label: 'Import', color: '#6B7280' },
};

interface NoteEntry {
  contact: Contact;
  notes: Activity[];
  latestNote: Activity | null;
}

/**
 * Inline label that reverse-geocodes lat/lng to a street address with raw
 * coordinates as fallback. Extracted as a component because the geocode
 * lookup is per-row and hooks can't live inside a `renderItem` callback.
 */
function AnnotationLocationLabel({
  latitude,
  longitude,
  color,
}: {
  latitude: number;
  longitude: number;
  color: string;
}) {
  const { address } = useGeocodedAddress(latitude, longitude);
  const text = address ?? `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  return (
    <Text
      variant="labelSmall"
      numberOfLines={1}
      style={{ color, marginLeft: 4, flexShrink: 1 }}
    >
      {text}
    </Text>
  );
}

export default function NotesScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const contacts = useCRMStore(state => state.contacts);
  const recentActivities = useCRMStore(state => state.activities);
  const fetchRecentActivities = useCRMStore(state => state.fetchActivities);
  const tags = useCRMStore(state => state.tags);
  const createWhiteboardItem = useWhiteboardStore(state => state.createItem);
  const whiteboardItemsCount = useWhiteboardStore(state => state.items.length);

  const allAnnotations = useTrackingStore(state => state.allAnnotations);
  const fetchAllAnnotations = useTrackingStore(state => state.fetchAllAnnotations);
  const linkAnnotationContact = useTrackingStore(state => state.linkAnnotationContact);

  const [searchQuery, setSearchQuery] = useState('');
  const [tab, setTab] = useState('all');

  // Contact picker for linking
  const [linkDialogVisible, setLinkDialogVisible] = useState(false);
  const [linkingAnnotationId, setLinkingAnnotationId] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [pinSnackbarVisible, setPinSnackbarVisible] = useState(false);
  const [pinningKey, setPinningKey] = useState<string | null>(null);

  useEffect(() => {
    void fetchRecentActivities(200);
    void fetchAllAnnotations();
  }, [fetchRecentActivities, fetchAllAnnotations]);

  // Unlinked field notes (tracking annotations without contact_id), filtered
  // by the current search query.
  const unlinkedAnnotations = useMemo(() => {
    const items = allAnnotations.filter(a => !a.contact_id);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return items.filter(a => a.note.toLowerCase().includes(q));
    }
    return items;
  }, [allAnnotations, searchQuery]);

  // Total unlinked count, search-independent — used for the tab badge so
  // typing in the search box doesn't make the "Unlinked (N)" number drop
  // (which read as if notes had disappeared from the store rather than been
  // hidden by filtering).
  const unlinkedTotal = useMemo(
    () => allAnnotations.filter(a => !a.contact_id).length,
    [allAnnotations],
  );

  // Filtered contacts for the link dialog
  const filteredContacts = useMemo(() => {
    if (!contactSearch) return contacts.slice(0, 20);
    const q = contactSearch.toLowerCase();
    return contacts.filter(c => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase();
      const addr = (c.address || '').toLowerCase();
      return name.includes(q) || addr.includes(q);
    }).slice(0, 20);
  }, [contacts, contactSearch]);

  const noteEntries = useMemo(() => {
    const entries: NoteEntry[] = contacts
      .filter(c => c.address)
      .map(contact => {
        const contactNotes = recentActivities.filter(
          a => a.contact_id === contact.id && a.type === 'note'
        );
        const latestNote = contactNotes.length > 0
          ? contactNotes.sort((a, b) =>
              new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            )[0]
          : null;
        return { contact, notes: contactNotes, latestNote };
      })
      .filter(entry => entry.notes.length > 0 || !entry.contact.first_name)
      .sort((a, b) => {
        const aDate = a.latestNote?.created_at || a.contact.created_at || '';
        const bDate = b.latestNote?.created_at || b.contact.created_at || '';
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return entries.filter(entry => {
        const address = (entry.contact.address || '').toLowerCase();
        const noteContent = entry.notes.map(n => n.content).join(' ').toLowerCase();
        const name = `${entry.contact.first_name || ''} ${entry.contact.last_name || ''}`.toLowerCase();
        return address.includes(query) || noteContent.includes(query) || name.includes(query);
      });
    }

    return entries;
  }, [contacts, recentActivities, searchQuery]);

  const handleEntryPress = useCallback((contact: Contact) => {
    router.push(`/contact/${contact.id}`);
  }, [router]);

  const handleAddNote = () => {
    router.push({
      pathname: '/contact/new',
      params: { quickNote: 'true' },
    });
  };

  const handleLinkAnnotation = (annotationId: string) => {
    setLinkingAnnotationId(annotationId);
    setContactSearch('');
    setLinkDialogVisible(true);
  };

  const handleSelectContact = async (contactId: string) => {
    if (!linkingAnnotationId) return;
    setIsLinking(true);
    await linkAnnotationContact(linkingAnnotationId, contactId);
    setIsLinking(false);
    setLinkDialogVisible(false);
    setLinkingAnnotationId(null);
    // Refresh data
    void fetchRecentActivities(200);
    void fetchAllAnnotations();
  };

  // Use the shared formatter so notes, map annotation pins, and contact
  // detail all show the same relative date for the same timestamp.
  const formatDate = formatRelativeDate;

  const getNextWhiteboardPosition = useCallback(() => {
    const offset = (whiteboardItemsCount % 6) * 24;
    return {
      x: 24 + offset,
      y: 24 + offset,
    };
  }, [whiteboardItemsCount]);

  const buildPinnedContactNoteText = useCallback((contact: Contact, note: Activity) => {
    const lines = [contact.address || 'No address'];
    const name = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
    if (name && name !== 'Quick Note') {
      lines.push(name);
    }
    if (note.created_at) {
      lines.push(formatDate(note.created_at));
    }
    lines.push('', (note.content || '').trim());
    return lines.join('\n');
  }, []);

  const buildPinnedFieldNoteText = useCallback(async (annotation: TrackingAnnotation) => {
    // Reverse-geocode the pin location so the sticky reads as a street
    // address ("Field note @ 7/46 Coronation Rd, Baulkham Hills") rather
    // than raw coords. `reverseGeocode` is in-memory cached so this is
    // essentially free on the second pin of the same point. Falls back to
    // coords when geocoding fails (rate-limit, no result, offline).
    const geocoded = await reverseGeocode(annotation.latitude, annotation.longitude).catch(() => null);
    const locationText =
      geocoded?.address ??
      `${annotation.latitude.toFixed(4)}, ${annotation.longitude.toFixed(4)}`;
    const lines = [`Field note @ ${locationText}`];
    if (annotation.created_at) {
      lines.push(formatDate(annotation.created_at));
    }
    lines.push('', annotation.note.trim());
    return lines.join('\n');
  }, []);

  const handlePinLatestNote = useCallback(async (entry: NoteEntry) => {
    if (!entry.latestNote) return;

    const pinKey = `note-${entry.latestNote.id}`;
    setPinningKey(pinKey);
    try {
      const { x, y } = getNextWhiteboardPosition();
      const created = await createWhiteboardItem({
        type: 'sticky',
        position_x: x,
        position_y: y,
        width: 240,
        height: 180,
        content: { text: buildPinnedContactNoteText(entry.contact, entry.latestNote) },
        ref_id: entry.contact.id,
      });
      if (created) {
        setPinSnackbarVisible(true);
      }
    } finally {
      setPinningKey(current => (current === pinKey ? null : current));
    }
  }, [buildPinnedContactNoteText, createWhiteboardItem, getNextWhiteboardPosition]);

  const handlePinAnnotationNote = useCallback(async (annotation: TrackingAnnotation) => {
    const pinKey = `annotation-${annotation.id}`;
    setPinningKey(pinKey);
    try {
      const { x, y } = getNextWhiteboardPosition();
      // buildPinnedFieldNoteText is now async — it reverse-geocodes the
      // pin location so the sticky shows an address rather than raw coords.
      const text = await buildPinnedFieldNoteText(annotation);
      const created = await createWhiteboardItem({
        type: 'sticky',
        position_x: x,
        position_y: y,
        width: 240,
        height: 180,
        content: { text },
      });
      if (created) {
        setPinSnackbarVisible(true);
      }
    } finally {
      setPinningKey(current => (current === pinKey ? null : current));
    }
  }, [buildPinnedFieldNoteText, createWhiteboardItem, getNextWhiteboardPosition]);

  const handleOpenAnnotationOnMap = useCallback((annotation: TrackingAnnotation) => {
    router.push(`/(tabs)/map?lat=${annotation.latitude}&lng=${annotation.longitude}&zoom=0.005&layer=fieldActivity` as never);
  }, [router]);

  const getSourceBadge = (source?: ActivitySource) => {
    if (!source) return null;
    const config = SOURCE_BADGE_CONFIG[source];
    if (!config) return null;
    return (
      <Chip
        compact
        style={[styles.sourceBadge, { backgroundColor: config.color }]}
        textStyle={{ color: '#fff', fontSize: 9 }}
      >
        {config.label}
      </Chip>
    );
  };

  const renderNoteItem = useCallback(({ item }: { item: NoteEntry }) => {
    const { contact, notes, latestNote } = item;
    const contactTags = contact.tags && contact.tags.length > 0
      ? contact.tags
      : contact.tag_id ? [tags.find(t => t.id === contact.tag_id)].filter(Boolean) : [];

    return (
      <Card
        style={styles.card}
        onPress={() => handleEntryPress(contact)}
        mode="elevated"
      >
        <Card.Content>
          <View style={styles.cardHeader}>
            <View style={styles.addressContainer}>
              <Text variant="titleMedium" numberOfLines={1} style={styles.address}>
                {contact.address || 'No address'}
              </Text>
              {contact.first_name && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {contact.first_name} {contact.last_name}
                </Text>
              )}
            </View>
            {contactTags.length > 0 && (
              <View style={styles.noteTagChips}>
                {contactTags.map(tag => (
                  <Chip
                    key={tag!.id}
                    compact
                    style={{ backgroundColor: tag!.color + '30' }}
                    textStyle={{ color: tag!.color, fontSize: 11 }}
                  >
                    {tag!.name}
                  </Chip>
                ))}
              </View>
            )}
          </View>

          {latestNote && (
            <Surface style={[styles.notePreview, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
              <View style={styles.notePreviewHeader}>
                <Text variant="bodyMedium" numberOfLines={2} style={[styles.noteText, { flex: 1 }]}>
                  {latestNote.content}
                </Text>
                {getSourceBadge(latestNote.source)}
              </View>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                {latestNote.created_at ? formatDate(latestNote.created_at) : ''}
              </Text>
            </Surface>
          )}

          {notes.length > 1 && (
            <Text variant="labelSmall" style={{ color: theme.colors.primary, marginTop: 8 }}>
              +{notes.length - 1} more note{notes.length > 2 ? 's' : ''}
            </Text>
          )}

          <View style={styles.actionRow}>
            <Button
              mode="text"
              icon="account-outline"
              compact
              onPress={() => handleEntryPress(contact)}
            >
              Open Contact
            </Button>
            <Button
              mode="contained-tonal"
              icon="view-dashboard-outline"
              compact
              onPress={() => void handlePinLatestNote(item)}
              disabled={!latestNote || pinningKey === `note-${latestNote?.id}`}
              loading={!!latestNote && pinningKey === `note-${latestNote.id}`}
            >
              To Whiteboard
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  }, [tags, theme.colors, handleEntryPress, handlePinLatestNote, pinningKey]);

  const renderUnlinkedItem = useCallback(({ item }: { item: TrackingAnnotation }) => (
    <Card style={styles.card} mode="elevated">
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={styles.addressContainer}>
            <View style={styles.unlinkedHeader}>
              <Icon name="map-marker" size={16} color="#F59E0B" />
              <AnnotationLocationLabel
                latitude={item.latitude}
                longitude={item.longitude}
                color={theme.colors.onSurfaceVariant}
              />
            </View>
          </View>
          <Chip
            compact
            style={[styles.sourceBadge, { backgroundColor: '#F59E0B' }]}
            textStyle={{ color: '#fff', fontSize: 9 }}
          >
            Field
          </Chip>
        </View>

        <Surface style={[styles.notePreview, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
          <Text variant="bodyMedium" style={styles.noteText}>
            {item.note}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
            {item.created_at ? formatDate(item.created_at) : ''}
          </Text>
        </Surface>

        <View style={styles.actionRow}>
          <Button
            mode="text"
            icon="map-search-outline"
            compact
            onPress={() => handleOpenAnnotationOnMap(item)}
          >
            View on Map
          </Button>
          <Button
            mode="contained-tonal"
            icon="view-dashboard-outline"
            compact
            onPress={() => void handlePinAnnotationNote(item)}
            disabled={pinningKey === `annotation-${item.id}`}
            loading={pinningKey === `annotation-${item.id}`}
          >
            To Whiteboard
          </Button>
          <Button
            mode="contained-tonal"
            icon="link-variant"
            compact
            onPress={() => handleLinkAnnotation(item.id)}
            disabled={isLinking}
          >
            Link to Contact
          </Button>
        </View>
      </Card.Content>
    </Card>
  ), [theme.colors, handleOpenAnnotationOnMap, handlePinAnnotationNote, isLinking, pinningKey]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text variant="headlineSmall" style={{ color: theme.colors.onSurfaceVariant }}>
        {tab === 'all' ? 'No notes yet' : 'No unlinked field notes'}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
        {tab === 'all'
          ? 'Long-press on the map or tap + to add property notes'
          : 'Field notes dropped during tracking will appear here until linked to a contact'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search notes..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      <View style={styles.segmentContainer}>
        <SegmentedButtons
          value={tab}
          onValueChange={setTab}
          buttons={[
            { value: 'all', label: 'All Notes' },
            { value: 'unlinked', label: `Unlinked (${unlinkedTotal})` },
          ]}
          density="small"
        />
      </View>

      {tab === 'all' ? (
        <FlatList
          data={noteEntries}
          keyExtractor={(item) => item.contact.id}
          renderItem={renderNoteItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={noteEntries.length === 0 ? styles.emptyList : styles.list}
        />
      ) : (
        <FlatList
          data={unlinkedAnnotations}
          keyExtractor={(item) => item.id}
          renderItem={renderUnlinkedItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={unlinkedAnnotations.length === 0 ? styles.emptyList : styles.list}
        />
      )}

      <FAB
        icon="note-plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary, bottom: insets.bottom + 24 }]}
        color={theme.colors.onPrimary}
        onPress={handleAddNote}
      />

      {/* Contact picker dialog for linking annotations */}
      <Portal>
        <Dialog visible={linkDialogVisible} onDismiss={() => setLinkDialogVisible(false)}>
          <Dialog.Title>Link to Contact</Dialog.Title>
          <Dialog.Content>
            <Searchbar
              placeholder="Search contacts..."
              onChangeText={setContactSearch}
              value={contactSearch}
              style={styles.dialogSearch}
              elevation={0}
            />
            <View style={styles.contactList}>
              {filteredContacts.map(c => (
                <Pressable
                  key={c.id}
                  style={styles.contactOption}
                  onPress={() => handleSelectContact(c.id)}
                  disabled={isLinking}
                >
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyMedium">
                      {c.first_name} {c.last_name || ''}
                    </Text>
                    {c.address && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                        {c.address}
                      </Text>
                    )}
                  </View>
                  <Icon name="chevron-right" size={20} color={theme.colors.onSurfaceVariant} />
                </Pressable>
              ))}
              {filteredContacts.length === 0 && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center', marginTop: 16 }}>
                  No contacts found
                </Text>
              )}
            </View>
            {isLinking && <ActivityIndicator style={{ marginTop: 12 }} />}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setLinkDialogVisible(false)} disabled={isLinking}>Cancel</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar
        visible={pinSnackbarVisible}
        onDismiss={() => setPinSnackbarVisible(false)}
        duration={3500}
        action={{ label: 'Open', onPress: () => router.push('/whiteboard' as never) }}
      >
        Added to whiteboard
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchbar: {
    elevation: 0,
  },
  segmentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
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
  card: {
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  noteTagChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    maxWidth: '40%',
    justifyContent: 'flex-end',
  },
  addressContainer: {
    flex: 1,
    marginRight: 8,
  },
  address: {
    fontWeight: '600',
  },
  notePreview: {
    padding: 12,
    borderRadius: 8,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  notePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteText: {
    lineHeight: 20,
  },
  sourceBadge: {
    // No explicit height — Paper's Chip with `compact` sizes to content;
    // `height: 20` was clipping the text descenders on labels like "Field"
    // and "Inspection".
  },
  unlinkedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
  },
  dialogSearch: {
    marginBottom: 12,
  },
  contactList: {
    maxHeight: 300,
  },
  contactOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
});
