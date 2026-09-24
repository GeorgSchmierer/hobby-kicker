import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { applyUpdate, useUpdateAvailable } from '@/lib/updates';

/** Schmaler Hinweis oben, sobald eine neue Version online ist – ein Tipp lädt sie */
export function UpdateBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const available = useUpdateAvailable();
  if (!available) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.two }]}>
      <Pressable
        accessibilityRole="button"
        onPress={applyUpdate}
        style={({ pressed }) => [
          styles.banner,
          { backgroundColor: theme.primary, opacity: pressed ? 0.85 : 1 },
        ]}>
        <ThemedText style={[styles.text, { color: theme.onPrimary }]}>
          🔄 Neue Version verfügbar – jetzt aktualisieren
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1000 },
  banner: {
    minHeight: 48,
    borderRadius: 24,
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  text: { fontSize: 16, fontWeight: 800 },
});
