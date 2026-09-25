import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Player } from '@/lib/group';
import { attendance, playedMonths, type PlayedSession } from '@/lib/stats';

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Anwesenheitsquote aller Spieler (TODO C6), wählbar nach Jahr und Monat */
export function AttendanceTable({
  sessions,
  players,
  years,
}: {
  sessions: PlayedSession[];
  players: Player[];
  years: string[];
}) {
  const theme = useTheme();
  const [year, setYear] = useState(years[0] ?? '');
  const [month, setMonth] = useState('');
  const months = year ? playedMonths(sessions, year) : [];
  const period = month || year;
  const rows = attendance(
    sessions,
    players.map((p) => p.id),
    period
  ).filter((r) => r.present > 0 || players.find((p) => p.id === r.playerId)?.active);
  const byId = new Map(players.map((p) => [p.id, p]));

  const chip = (key: string, label: string, selected: boolean, onPress: () => void) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          borderColor: selected ? theme.primary : theme.border,
          backgroundColor: selected ? theme.backgroundSelected : 'transparent',
        },
      ]}>
      <ThemedText style={styles.chipText}>{label}</ThemedText>
    </Pressable>
  );

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {years.map((y) =>
          chip(y, y, y === year, () => {
            setYear(y);
            setMonth('');
          })
        )}
        {chip('all', 'Gesamt', year === '', () => {
          setYear('');
          setMonth('');
        })}
      </ScrollView>
      {months.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {chip('year', 'ganzes Jahr', month === '', () => setMonth(''))}
          {months.map((m) => chip(m, MONTHS[Number(m.slice(5, 7)) - 1], m === month, () => setMonth(m)))}
        </ScrollView>
      )}

      {rows.length === 0 || rows[0].total === 0 ? (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          In diesem Zeitraum gab es noch keinen Spieltag.
        </ThemedText>
      ) : (
        rows.map((r) => {
          const p = byId.get(r.playerId)!;
          return (
            <Pressable
              key={r.playerId}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/profil/[id]', params: { id: r.playerId } })}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Avatar name={p.name} path={p.avatar_path} size={32} />
              <View style={styles.flex}>
                <ThemedText style={styles.name}>{p.name}</ThemedText>
                <View style={[styles.bar, { backgroundColor: theme.backgroundSelected }]}>
                  <View
                    style={[styles.fill, { width: `${Math.round(r.rate * 100)}%`, backgroundColor: theme.primary }]}
                  />
                </View>
              </View>
              <View style={styles.numbers}>
                <ThemedText style={styles.rate}>{Math.round(r.rate * 100)} %</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.present} von {r.total}
                </ThemedText>
              </View>
            </Pressable>
          );
        })
      )}
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        Gezählt werden Spieltage, an denen gespielt wurde. Abgesagte Termine zählen nicht.
      </ThemedText>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: Spacing.one },
  center: { textAlign: 'center' },
  chips: { gap: Spacing.two, paddingVertical: Spacing.one },
  chip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
  },
  chipText: { fontWeight: 700 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
  },
  name: { fontSize: 17, fontWeight: 600 },
  bar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  numbers: { alignItems: 'flex-end' },
  rate: { fontSize: 18, fontWeight: 800 },
});
