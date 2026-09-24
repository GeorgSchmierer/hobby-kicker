import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { currentDevice, isInstalled } from '@/lib/install';

const DISMISSED_KEY = 'hobby-kicker/v1/install-hint-dismissed';

/**
 * Hinweis „App auf den Home-Bildschirm legen“ – nur auf dem Handy im Browser,
 * nicht in der installierten App. `dismissible`: mit ✕ dauerhaft ausblendbar.
 */
export function InstallHint({ dismissible = true }: { dismissible?: boolean }) {
  const theme = useTheme();
  const relevant = Platform.OS === 'web' && currentDevice() !== 'desktop' && !isInstalled();
  const [hidden, setHidden] = useState(dismissible);

  useEffect(() => {
    if (!relevant || !dismissible) return;
    AsyncStorage.getItem(DISMISSED_KEY)
      .then((value) => setHidden(value === '1'))
      .catch(() => setHidden(false));
  }, [relevant, dismissible]);

  if (!relevant || hidden) return null;

  const dismiss = () => {
    setHidden(true);
    AsyncStorage.setItem(DISMISSED_KEY, '1').catch(() => {});
  };

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/hilfe')}
      style={({ pressed }) => [
        styles.box,
        { borderColor: theme.primary, backgroundColor: theme.backgroundElement, opacity: pressed ? 0.8 : 1 },
      ]}>
      <ThemedText style={styles.icon}>📲</ThemedText>
      <View style={styles.flex}>
        <ThemedText style={styles.title}>App auf den Home-Bildschirm legen</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Eigenes Symbol, kein Link merken – so geht&apos;s in 1 Minute
        </ThemedText>
      </View>
      {dismissible && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hinweis ausblenden"
          hitSlop={12}
          onPress={dismiss}
          style={styles.close}>
          <ThemedText themeColor="textSecondary" style={styles.closeText}>
            ✕
          </ThemedText>
        </Pressable>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    borderWidth: 2,
    padding: Spacing.three,
  },
  flex: { flex: 1 },
  icon: { fontSize: 28, lineHeight: 34 },
  title: { fontSize: 16, fontWeight: 800 },
  close: { padding: Spacing.one },
  closeText: { fontSize: 18 },
});
