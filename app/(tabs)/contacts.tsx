import { useState, useCallback, useMemo } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import { Searchbar, FAB, useTheme, Text, ActivityIndicator } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useCRMStore } from '../../lib/store';
import ContactCard from '../../components/ContactCard';
import { Contact } from '../../lib/types';

export default function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const allContacts = useCRMStore(state => state.contacts);
  const selectedTagIds = useCRMStore(state => state.selectedTagIds);
  const isLoading = useCRMStore(state => state.isLoading);
  const searchQuery = useCRMStore(state => state.searchQuery);
  const setSearchQuery = useCRMStore(state => state.setSearchQuery);

  // Filter contacts in component to avoid selector issues
  const contacts = useMemo(() => {
    return allContacts.filter(contact => {
      if (selectedTagIds.length > 0 && !selectedTagIds.includes(contact.tag_id || '')) {
        return false;
      }
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const fullName = `${contact.first_name} ${contact.last_name || ''}`.toLowerCase();
        const email = (contact.email || '').toLowerCase();
        const address = (contact.address || '').toLowerCase();
        if (!fullName.includes(query) && !email.includes(query) && !address.includes(query)) {
          return false;
        }
      }
      return true;
    });
  }, [allContacts, selectedTagIds, searchQuery]);

  const handleContactPress = useCallback((contact: Contact) => {
    router.push(`/contact/${contact.id}`);
  }, [router]);

  const handleAddContact = () => {
    router.push('/contact/new');
  };

  const renderItem = useCallback(({ item }: { item: Contact }) => (
    <ContactCard contact={item} onPress={handleContactPress} />
  ), [handleContactPress]);

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
        {searchQuery ? 'No contacts found' : 'No contacts yet'}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
        {searchQuery ? 'Try a different search term' : 'Tap + to add your first contact'}
      </Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search contacts..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchbar}
        />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListEmptyComponent={renderEmpty}
          contentContainerStyle={contacts.length === 0 ? styles.emptyList : styles.list}
        />
      )}

      <FAB
        icon="plus"
        style={[styles.fab, { backgroundColor: theme.colors.primary }]}
        color={theme.colors.onPrimary}
        onPress={handleAddContact}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 24,
  },
});
