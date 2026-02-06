import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider, MD3DarkTheme, MD3LightTheme, ActivityIndicator } from 'react-native-paper';
import { useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@realestate-crm/hooks';
import { useCRMStore } from '@realestate-crm/hooks';

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const isAuthenticated = useAuthStore(s => s.isAuthenticated);
  const isLoading = useAuthStore(s => s.isLoading);
  const isDemoMode = useAuthStore(s => s.isDemoMode);
  const memberships = useAuthStore(s => s.memberships);
  const activeTeam = useAuthStore(s => s.activeTeam);

  const hydrate = useCRMStore(s => s.hydrate);
  const fetchContacts = useCRMStore(s => s.fetchContacts);
  const fetchTags = useCRMStore(s => s.fetchTags);
  const clearData = useCRMStore(s => s.clearData);

  const [dataLoaded, setDataLoaded] = useState(false);

  // Clear CRM data when user signs out (not authenticated and not demo)
  useEffect(() => {
    if (!isLoading && !isAuthenticated && !isDemoMode) {
      clearData();
      setDataLoaded(false);
    }
  }, [isAuthenticated, isDemoMode, isLoading]);

  // Load CRM data once auth + team are resolved
  useEffect(() => {
    if (dataLoaded) return;
    if (isDemoMode || (isAuthenticated && activeTeam)) {
      const loadData = async () => {
        await hydrate();
        await fetchTags();
        await fetchContacts();
        setDataLoaded(true);
      };
      loadData();
    }
  }, [isDemoMode, isAuthenticated, activeTeam]);

  // Reset data loaded flag when team changes
  useEffect(() => {
    if (dataLoaded && activeTeam) {
      setDataLoaded(false);
    }
  }, [activeTeam?.id]);

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inTeamCreate = segments[0] === 'team' && (segments as string[])[1] === 'create';

    if (!isAuthenticated && !isDemoMode) {
      // Not authed, not demo — must be on auth screen
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (isAuthenticated && memberships.length === 0 && !isDemoMode) {
      // Authed but no teams — go create one
      if (!inTeamCreate) {
        router.replace('/team/create');
      }
    } else if (inAuthGroup || inTeamCreate) {
      // Already authed/demo with teams, or on stale team create screen — redirect to app
      router.replace('/(tabs)');
    }
  }, [isAuthenticated, isDemoMode, isLoading, memberships.length, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  const initialize = useAuthStore(s => s.initialize);

  useEffect(() => {
    initialize();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <AuthGate>
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: theme.colors.surface,
              },
              headerTintColor: theme.colors.onSurface,
            }}
          >
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
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
            <Stack.Screen
              name="team/create"
              options={{
                title: 'Create Team',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="team/switcher"
              options={{
                title: 'Switch Team',
                presentation: 'modal',
              }}
            />
            <Stack.Screen
              name="team/[teamId]/members"
              options={{ title: 'Team Members' }}
            />
            <Stack.Screen
              name="team/[teamId]/invite"
              options={{ title: 'Invite Member' }}
            />
            <Stack.Screen
              name="team/[teamId]/settings"
              options={{ title: 'Team Settings' }}
            />
          </Stack>
        </AuthGate>
      </PaperProvider>
    </GestureHandlerRootView>
  );
}
