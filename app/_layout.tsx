import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useCRMStore } from '../lib/store';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  const hydrate = useCRMStore(state => state.hydrate);
  const fetchContacts = useCRMStore(state => state.fetchContacts);
  const fetchTags = useCRMStore(state => state.fetchTags);

  useEffect(() => {
    const init = async () => {
      await hydrate();
      await fetchTags();
      await fetchContacts();
    };
    init();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerStyle: {
              backgroundColor: theme.colors.surface,
            },
            headerTintColor: theme.colors.onSurface,
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="contact/new"
            options={{
              title: 'New Contact',
              presentation: 'modal',
            }}
          />
          <Stack.Screen
            name="contact/[id]"
            options={{
              title: 'Contact Details',
            }}
          />
        </Stack>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
