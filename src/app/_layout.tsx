import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { StoreProvider } from '@/lib/store';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StoreProvider>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerBackTitle: 'Zurück' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="teams" options={{ title: 'Teams' }} />
          <Stack.Screen name="spieler/[id]" options={{ title: 'Spieler' }} />
        </Stack>
      </StoreProvider>
    </ThemeProvider>
  );
}
