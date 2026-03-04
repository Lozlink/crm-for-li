import * as Updates from 'expo-updates';
import { useEffect, useCallback } from 'react';
import { Alert } from 'react-native';

export function useAppUpdate() {
  const { isUpdateAvailable, isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (isUpdatePending) {
      Alert.alert(
        'Update Ready',
        'A new version has been downloaded. Restart now to apply it?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Restart', onPress: () => Updates.reloadAsync() },
        ]
      );
    }
  }, [isUpdatePending]);

  useEffect(() => {
    if (isUpdateAvailable) {
      Alert.alert(
        'Update Available',
        'A new version is available. Download now?',
        [
          { text: 'Later', style: 'cancel' },
          { text: 'Update', onPress: () => Updates.fetchUpdateAsync() },
        ]
      );
    }
  }, [isUpdateAvailable]);

  const checkForUpdate = useCallback(async () => {
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        Alert.alert('Up to date', 'You are running the latest version.');
      }
    } catch {
      // Silently fail in dev mode
    }
  }, []);

  return { isUpdateAvailable, checkForUpdate };
}
