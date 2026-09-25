import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { ActivityIndicator, useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
// früh laden, damit Android den „Installieren“-Dialog rechtzeitig anbieten kann
import '@/lib/install';
import { ThemedView } from '@/components/themed-view';
import { OfflineBanner } from '@/components/offline-banner';
import { UpdateBanner } from '@/components/update-banner';
import { useTheme } from '@/hooks/use-theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { GroupProvider, useGroup } from '@/lib/group';
import { StoreProvider } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <GroupProvider>
          <StoreProvider>
            <AnimatedSplashOverlay />
            <RootNavigator />
            <UpdateBanner />
            <OfflineBanner />
          </StoreProvider>
        </GroupProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Welche Bildschirme erreichbar sind, hängt vom Stand ab:
 * nicht angemeldet → Anmelden; ohne Namen → Willkommen; ohne Gruppe → Gruppen; sonst die App.
 */
function RootNavigator() {
  const theme = useTheme();
  const { loading, session, profile } = useAuth();
  const { groups } = useGroup();

  const signedIn = !!session;
  const named = signedIn && !!profile?.display_name;
  const hasGroup = named && (groups?.length ?? 0) > 0;

  if (loading || (named && groups === null)) {
    return (
      <ThemedView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <Stack screenOptions={{ headerBackTitle: 'Zurück' }}>
      <Stack.Protected guard={hasGroup}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="teams" options={{ title: 'Teams' }} />
        <Stack.Screen name="spieler/[id]" options={{ title: 'Spieler' }} />
        <Stack.Screen name="spieltag/[id]/index" options={{ title: 'Spieltag' }} />
        <Stack.Screen name="spieltag/[id]/ergebnis" options={{ title: 'Ergebnis eintragen' }} />
        <Stack.Screen name="spieltag/[id]/nachzuegler" options={{ title: 'Nachzügler' }} />
        <Stack.Screen name="gast" options={{ title: 'Gast hinzufügen' }} />
        <Stack.Screen name="saisons" options={{ title: 'Saisons' }} />
        <Stack.Screen name="rueckblick/[year]" options={{ title: 'Jahresrückblick' }} />
        <Stack.Screen name="stoppuhr" options={{ title: 'Stoppuhr' }} />
        <Stack.Screen name="profil/[id]" options={{ title: 'Profil' }} />
        <Stack.Screen name="termin/index" options={{ title: 'Fester Termin' }} />
        <Stack.Screen name="termin/[date]" options={{ title: 'Termin' }} />
      </Stack.Protected>
      <Stack.Protected guard={named}>
        <Stack.Screen name="gruppen" options={{ title: 'Gruppen' }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && !named}>
        <Stack.Screen name="willkommen" options={{ title: 'Willkommen' }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="anmelden" options={{ title: 'Anmelden', headerShown: false }} />
      </Stack.Protected>
      {/* Immer erreichbar – auch vor der Anmeldung */}
      <Stack.Screen name="hilfe" options={{ title: 'App installieren' }} />
    </Stack>
  );
}
