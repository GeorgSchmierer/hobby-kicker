import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Outcome, RatingPoint } from '@/lib/stats';

const OUTCOME = {
  W: { letter: 'S', color: '#2E7D32', label: 'Sieg' },
  D: { letter: 'U', color: '#F9A825', label: 'Unentschieden' },
  L: { letter: 'N', color: '#C62828', label: 'Niederlage' },
} as const;

/** Formkurve: farbige Kreise S / U / N, ältestes links */
export function FormChips({ form, size = 30 }: { form: Outcome[]; size?: number }) {
  if (form.length === 0) return null;
  return (
    <View
      style={styles.form}
      accessibilityLabel={`Letzte Spiele: ${form.map((o) => OUTCOME[o].label).join(', ')}`}>
      {form.map((o, i) => (
        <View
          key={i}
          style={[
            styles.chip,
            { width: size, height: size, borderRadius: size / 2, backgroundColor: OUTCOME[o].color },
          ]}>
          <ThemedText style={[styles.chipText, { fontSize: size * 0.5, lineHeight: size * 0.62 }]}>
            {OUTCOME[o].letter}
          </ThemedText>
        </View>
      ))}
    </View>
  );
}

/** Kleines Balkendiagramm des Stärke-Verlaufs (letzte bis zu 20 Punkte) */
export function StrengthChart({ points }: { points: RatingPoint[] }) {
  const theme = useTheme();
  const shown = points.slice(-20);
  if (shown.length < 2) {
    return (
      <ThemedText type="small" themeColor="textSecondary">
        Der Verlauf erscheint nach den ersten Ergebnissen.
      </ThemedText>
    );
  }
  const values = shown.map((p) => p.strength);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.2);
  const fmt = (v: number) => v.toFixed(1).replace('.', ',');
  return (
    <View style={styles.chartWrap}>
      <View style={styles.chartScale}>
        <ThemedText type="small" themeColor="textSecondary">
          {fmt(max)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {fmt(min)}
        </ThemedText>
      </View>
      <View style={[styles.chart, { borderColor: theme.border }]}>
        {shown.map((p, i) => {
          const up = i > 0 && p.strength > shown[i - 1].strength;
          const down = i > 0 && p.strength < shown[i - 1].strength;
          return (
            <View key={`${p.seq}-${i}`} style={styles.barSlot}>
              <View
                style={{
                  height: `${15 + ((p.strength - min) / span) * 85}%`,
                  backgroundColor: up ? theme.primary : down ? theme.danger : theme.textSecondary,
                  borderRadius: 3,
                  opacity: i === shown.length - 1 ? 1 : 0.75,
                }}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { flexDirection: 'row', gap: Spacing.one },
  chip: { alignItems: 'center', justifyContent: 'center' },
  chipText: { color: '#fff', fontWeight: 800 },
  chartWrap: { flexDirection: 'row', gap: Spacing.two, height: 110 },
  chartScale: { justifyContent: 'space-between' },
  chart: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    paddingLeft: 3,
  },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
});
