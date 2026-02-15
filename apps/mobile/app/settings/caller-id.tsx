import { useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Platform, Linking } from 'react-native';
import {
  Surface,
  Text,
  Switch,
  Button,
  Divider,
  Dialog,
  Portal,
  useTheme,
  ActivityIndicator,
} from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCRMStore } from '@realestate-crm/hooks';

// Lazy-import the native module — it may not be available in Expo Go or on web
let CallerIdModule: {
  syncContacts(contacts: { phone: string; label: string }[]): Promise<void>;
  isCallerIdEnabled(): Promise<boolean>;
  enableCallerId(): Promise<boolean>;
} | null = null;

try {
  CallerIdModule = require('caller-id').default;
} catch {
  // Native module not available (e.g. Expo Go, web)
}

const APP_NAME = 'Real Estate CRM';

export default function CallerIdSettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const contacts = useCRMStore(state => state.contacts);

  const [isEnabled, setIsEnabled] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showPermissionDialog, setShowPermissionDialog] = useState(false);
  const [syncCount, setSyncCount] = useState(0);

  // Count contacts that have phone numbers
  const contactsWithPhone = contacts.filter(c => c.phone && c.phone.trim().length > 0);

  useEffect(() => {
    checkEnabled();
  }, []);

  useEffect(() => {
    setSyncCount(contactsWithPhone.length);
  }, [contactsWithPhone.length]);

  const checkEnabled = useCallback(async () => {
    if (!CallerIdModule) {
      setIsLoading(false);
      return;
    }
    try {
      const enabled = await CallerIdModule.isCallerIdEnabled();
      setIsEnabled(enabled);
    } catch (error) {
      console.warn('Failed to check caller ID status:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleSync = useCallback(async () => {
    if (!CallerIdModule) return;
    setIsSyncing(true);
    try {
      const callerIdContacts = contactsWithPhone.map(c => ({
        phone: c.phone!,
        label: [c.first_name, c.last_name].filter(Boolean).join(' '),
      }));
      await CallerIdModule.syncContacts(callerIdContacts);
      setSyncCount(callerIdContacts.length);
    } catch (error) {
      console.warn('Failed to sync contacts for caller ID:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [contactsWithPhone]);

  const handleToggle = useCallback(async (value: boolean) => {
    if (!CallerIdModule) return;

    if (!value) {
      // Turning off -- just update UI state. The user must disable via system settings.
      setIsEnabled(false);
      return;
    }

    try {
      const success = await CallerIdModule.enableCallerId();
      if (success) {
        setIsEnabled(true);
        // Auto-sync contacts when enabling
        handleSync();
      } else {
        setShowPermissionDialog(true);
      }
    } catch (error) {
      console.warn('Failed to enable caller ID:', error);
      setShowPermissionDialog(true);
    }
  }, [handleSync]);

  const openSystemSettings = useCallback(() => {
    if (Platform.OS === 'ios') {
      Linking.openURL('app-settings:');
    } else {
      Linking.openSettings();
    }
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!CallerIdModule) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}>
        <Text variant="bodyLarge" style={{ textAlign: 'center', padding: 32 }}>
          Caller ID is not available in this build. Please use a development or production build.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
    >
      {/* iOS-specific setup instructions */}
      {Platform.OS === 'ios' && (
        <Surface style={styles.card} elevation={1}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Step 1: Allow Caller ID
          </Text>
          <Text
            variant="bodyMedium"
            style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
          >
            Your device's settings may need to be updated before you can enable Caller ID.
          </Text>
          <View style={styles.bulletList}>
            <BulletItem>
              Open the <Text style={styles.bold}>Settings</Text> app on your device
            </BulletItem>
            <BulletItem>
              Navigate to <Text style={styles.bold}>Phone</Text> then{' '}
              <Text style={styles.bold}>Call Blocking & Identification</Text>
            </BulletItem>
            <BulletItem>
              Enable <Text style={styles.bold}>{APP_NAME}</Text>
            </BulletItem>
          </View>
          <Button
            mode="text"
            onPress={openSystemSettings}
            icon="open-in-new"
            style={styles.settingsButton}
          >
            Open Settings
          </Button>
        </Surface>
      )}

      {/* Enable toggle */}
      <Surface style={styles.card} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          {Platform.OS === 'ios' ? 'Step 2: Enable Caller ID' : 'Enable Caller ID'}
        </Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleTextContainer}>
            <Text variant="bodyLarge">Caller ID</Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {isEnabled
                ? 'Showing contact names on incoming calls'
                : 'Enable to show contact names on incoming calls'}
            </Text>
          </View>
          <Switch value={isEnabled} onValueChange={handleToggle} />
        </View>
        {Platform.OS === 'android' && (
          <Text
            variant="bodySmall"
            style={[styles.statusText, {
              color: isEnabled ? theme.colors.primary : theme.colors.onSurfaceVariant,
            }]}
          >
            Status: {isEnabled ? 'Enabled' : 'Disabled'}
          </Text>
        )}
      </Surface>

      <Divider style={styles.divider} />

      {/* Synced contacts section */}
      <Surface style={styles.card} elevation={1}>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Synced Contacts
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.description, { color: theme.colors.onSurfaceVariant }]}
        >
          {syncCount} {syncCount === 1 ? 'contact' : 'contacts'} with phone numbers synced for
          caller ID
        </Text>
        <Button
          mode="outlined"
          onPress={handleSync}
          loading={isSyncing}
          disabled={isSyncing || !isEnabled}
          icon="sync"
          style={styles.syncButton}
        >
          {isSyncing ? 'Syncing...' : 'Re-sync'}
        </Button>
      </Surface>

      {/* Permission dialog */}
      <Portal>
        <Dialog
          visible={showPermissionDialog}
          onDismiss={() => setShowPermissionDialog(false)}
        >
          <Dialog.Title>Additional Permissions Needed</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium">
              {Platform.OS === 'ios'
                ? `Please allow ${APP_NAME} to provide Caller ID via Settings > Phone > Call Blocking & Identification.`
                : `Please grant the required permissions to enable Caller ID for ${APP_NAME}.`}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            {Platform.OS === 'ios' && (
              <Button onPress={openSystemSettings}>Open Settings</Button>
            )}
            <Button onPress={() => setShowPermissionDialog(false)}>Close</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </ScrollView>
  );
}

function BulletItem({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={styles.bulletRow}>
      <Text
        variant="bodyMedium"
        style={[styles.bullet, { color: theme.colors.onSurfaceVariant }]}
      >
        {'\u2022'}
      </Text>
      <Text variant="bodyMedium" style={styles.bulletText}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    marginBottom: 12,
  },
  description: {
    marginBottom: 12,
    lineHeight: 20,
  },
  bulletList: {
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
    paddingLeft: 4,
  },
  bullet: {
    marginRight: 10,
    fontSize: 16,
    lineHeight: 22,
  },
  bulletText: {
    flex: 1,
    lineHeight: 22,
  },
  bold: {
    fontWeight: '700',
  },
  settingsButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  statusText: {
    marginTop: 8,
  },
  divider: {
    marginVertical: 4,
  },
  syncButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
});
