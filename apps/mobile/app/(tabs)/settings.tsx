import { StyleSheet, View, ScrollView } from 'react-native';
import { List, Divider, useTheme, Text, Surface } from 'react-native-paper';
import { useCRMStore } from '@realestate-crm/hooks';
import { isDemoMode } from '@realestate-crm/api';
import { TagManager } from '@realestate-crm/ui';

export default function SettingsScreen() {
  const theme = useTheme();
  const contacts = useCRMStore(state => state.contacts);
  const tags = useCRMStore(state => state.tags);

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Surface style={styles.statsCard} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Statistics</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text variant="headlineMedium" style={{ color: theme.colors.primary }}>
              {contacts.length}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Contacts
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="headlineMedium" style={{ color: theme.colors.primary }}>
              {tags.length}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Tags
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text variant="headlineMedium" style={{ color: theme.colors.primary }}>
              {contacts.filter(c => c.latitude && c.longitude).length}
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Mapped
            </Text>
          </View>
        </View>
      </Surface>

      <Divider style={styles.divider} />

      <TagManager />

      <Divider style={styles.divider} />

      <Surface style={styles.infoCard} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>About</Text>
        <List.Item
          title="Mode"
          description={isDemoMode ? 'Demo (Local Storage)' : 'Connected to Supabase'}
          left={props => <List.Icon {...props} icon="database" />}
        />
        <List.Item
          title="Version"
          description="1.0.0"
          left={props => <List.Icon {...props} icon="information" />}
        />
        {isDemoMode && (
          <View style={styles.demoNote}>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              Running in demo mode. Configure Supabase environment variables for full functionality.
            </Text>
          </View>
        )}
      </Surface>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  statsCard: {
    margin: 16,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  divider: {
    marginVertical: 8,
  },
  infoCard: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  demoNote: {
    marginTop: 8,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    borderRadius: 8,
  },
});
