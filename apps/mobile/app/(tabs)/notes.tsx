import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, FlatList, Pressable } from 'react-native';
import { Searchbar, FAB, useTheme, Text, Card, Chip, IconButton, Surface } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useCRMStore } from '@realestate-crm/hooks';
import { Contact, Activity } from '@realestate-crm/types';

// A note entry is a contact (with address) plus its associated note activities
interface NoteEntry {
  contact: Contact;
  notes: Activity[];
  latestNote: Activity | null;
}

export default function NotesScreen() {
  const theme = useTheme();
  const router = useRouter();

  const contacts = useCRMStore(state => state.contacts);
  const activities = useCRMStore(state => state.activities);
  const tags = useCRMStore(state => state.tags);
  const [searchQuery, setSearchQuery] = useState('');

  // Get all contacts with their notes, sorted by most recent activity
  const noteEntries = useMemo(() => {
    const entries: NoteEntry[] = contacts
      .filter(c => c.address) // Must have an address
      .map(contact => {
        const contactNotes = activities.filter(
          a => a.contact_id === contact.id && a.type === 'note'
        );
        const latestNote = contactNotes.length > 0
          ? contactNotes.sort((a, b) => 
              new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
            )[0]
          : null;
        return { contact, notes: contactNotes, latestNote };
      })
      .filter(entry => entry.notes.length > 0 || !entry.contact.first_name) // Has notes OR is a quick note entry
      .sort((a, b) => {
        const aDate = a.latestNote?.created_at || a.contact.created_at;
        const bDate = b.latestNote?.created_at || b.contact.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

    // Filter by search
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
  }, [contacts, activities, searchQuery]);

  const handleEntryPress = useCallback((contact: Contact) => {
    router.push(`/contact/${contact.id}`);
  }, [router]);

  const handleAddNote = () => {
    router.push({
      pathname: '/contact/new',
      params: { quickNote: 'true' },
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Today';
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  const renderItem = useCallback(({ item }: { item: NoteEntry }) => {
    const { contact, notes, latestNote } = item;
    const tag = tags.find(t => t.id === contact.tag_id);
    const isQuickNote = !contact.first_name;

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
              {!isQuickNote && (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {contact.first_name} {contact.last_name}
                </Text>
              )}
            </View>
            {tag && (
              <Chip 
                compact 
                style={{ backgroundColor: tag.color + '30' }}
                textStyle={{ color: tag.color, fontSize: 11 }}
              >
                {tag.name}
              </Chip>
            )}
          </View>

          {latestNote && (
            <Surface style={[styles.notePreview, { backgroundColor: theme.colors.surfaceVariant }]} elevation={0}>
              <Text variant="bodyMedium" numberOfLines={2} style={styles.noteText}>
                {latestNote.content}
              </Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                {formatDate(latestNote.created_at)}
              </Text>
            </Surface>
          )}

          {notes.length > 1 && (
            <Text variant="labelSmall" style={{ color: theme.colors.primary, marginTop: 8 }}>
              +{notes.length - 1} more note{notes.length > 2 ? 's' : ''}
            </Text>
          )}
        </Card.Content>
      </Card>
    );
  }, [tags, theme.colors, handleEntryPress]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text variant="headlineSmall" style={{ color: theme.colors.onSurfaceVariant }}>
        No notes yet
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8, textAlign: 'center' }}>
        Long-press on the map or tap + to add property notes
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

      <FlatList
        data={noteEntries}
        keyExtractor={(item) => item.contact.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={noteEntries.length === 0 ? styles.emptyList : styles.list}
      />

      <FAB
        icon="note-plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={handleAddNote}
      />
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
  noteText: {
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
});
