import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dismissNotice, flush, useOutbox } from '@/lib/outbox';

/**
 * Unaufdringlicher Hinweis unten (Offline-Modus): „Offline – 2 Ergebnisse warten auf Netz“,
 * danach kurz „Alles gespeichert ✓“. Dazu Hinweise zu verworfenen Einträgen (wegtippbar).
 */
export function OfflineBanner() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { ops, offline, recovered, notices } = useOutbox();

  const results = ops.filter((o) => o.kind === 'result').length;
  const starts = ops.length - results;
  const waiting = [
    results > 0 && `${results} Ergebnis${results === 1 ? '' : 'se'}`,
    starts > 0 && `${starts === 1 ? 'ein Spieltag' : `${starts} Spieltage`}`,
  ]
    .filter(Boolean)
    .join(' und ');
  const status =
    ops.length > 0
      ? offline
        ? `📶 Offline – ${waiting} ${ops.length === 1 ? 'wartet' : 'warten'} auf Netz`
        : `⏳ ${waiting} ${ops.length === 1 ? 'wird' : 'werden'} gesendet …`
      : recovered
        ? 'Alles gespeichert ✓'
        : null;

  if (!status && notices.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 64 }]}>
      {notices.map((n) => (
        <Pressable
          key={n.id}
          accessibilityRole="button"
          accessibilityLabel="Hinweis schließen"
          onPress={() => dismissNotice(n.id)}
          style={[styles.pill, styles.notice, { backgroundColor: theme.backgroundElement, borderColor: theme.danger }]}>
          <ThemedText type="small" style={styles.flex}>
            {n.text}
          </ThemedText>
          <ThemedText style={{ color: theme.textSecondary, fontWeight: 700 }}>✕</ThemedText>
        </Pressable>
      ))}
      {status && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Jetzt erneut senden"
          onPress={() => flush()}
          style={[
            styles.pill,
            {
              backgroundColor: recovered && ops.length === 0 ? theme.primary : theme.backgroundElement,
              borderColor: recovered && ops.length === 0 ? theme.primary : theme.border,
            },
          ]}>
          <ThemedText
            type="smallBold"
            style={{ color: recovered && ops.length === 0 ? theme.onPrimary : theme.text }}>
            {status}
          </ThemedText>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
    zIndex: 900,
  },
  pill: {
    minHeight: 40,
    maxWidth: 560,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  notice: { borderWidth: 2, alignSelf: 'stretch' },
  flex: { flex: 1 },
});
