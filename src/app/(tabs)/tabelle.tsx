import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ErrorText } from '@/components/form';
import { FormChips } from '@/components/stats';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup } from '@/lib/group';
import { todayIso, useGroupStats } from '@/lib/group-stats';
import { formatRating } from '@/lib/ratings';
import { awards, summarize } from '@/lib/stats';
import { errorMessage } from '@/lib/supabase';
import { strength } from '@/lib/teams';

type SortBy = 'strength' | 'winRate';
/** Für die Siegquoten-Tabelle braucht es ein paar Spiele, sonst führt jeder mit 1 Sieg aus 1 Spiel */
const MIN_GAMES_FOR_RATE = 3;
const MEDALS = ['🥇', '🥈', '🥉'];

export default function TableScreen() {
  const theme = useTheme();
  const { current, players } = useGroup();
  const { stats, error } = useGroupStats(current?.id);
  const [sortBy, setSortBy] = useState<SortBy>('strength');

  const active = players.filter((p) => p.active);
  const rows = active.map((p) => ({
    player: p,
    strength: strength(p),
    summary: stats ? summarize(stats.games, p.id) : null,
  }));
  const sorted =
    sortBy === 'strength'
      ? [...rows].sort((a, b) => b.strength - a.strength)
      : rows
          .filter((r) => (r.summary?.played ?? 0) >= MIN_GAMES_FOR_RATE)
          .sort(
            (a, b) =>
              (b.summary!.winRate ?? 0) - (a.summary!.winRate ?? 0) ||
              b.summary!.played - a.summary!.played
          );

  const groupAwards = stats
    ? awards(
        stats.games,
        active.map((p) => p.id),
        stats.changes.map((c) => ({ playerId: c.playerId, playedOn: c.playedOn, delta: c.after - c.before })),
        todayIso(),
        stats.mvp
      )
    : [];
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const openProfile = (id: string) => router.push({ pathname: '/profil/[id]', params: { id } });

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorText message={error ? errorMessage(error) : null} />

        {groupAwards.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="smallBold">Auszeichnungen</ThemedText>
            <View style={styles.awards}>
              {groupAwards.map((a) => (
                <Pressable
                  key={a.title}
                  accessibilityRole="button"
                  onPress={() => openProfile(a.playerId)}
                  style={({ pressed }) => [
                    styles.award,
                    { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <ThemedText style={styles.awardEmoji}>{a.emoji}</ThemedText>
                  <View style={styles.flex}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {a.title}
                    </ThemedText>
                    <ThemedText style={styles.awardName}>{nameOf(a.playerId)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {a.detail}
                    </ThemedText>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.segment}>
          {(
            [
              ['strength', 'Nach Stärke'],
              ['winRate', 'Nach Siegquote'],
            ] as const
          ).map(([value, label]) => {
            const selected = sortBy === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setSortBy(value)}
                style={[
                  styles.segmentButton,
                  { backgroundColor: selected ? theme.primary : theme.backgroundElement },
                ]}>
                <ThemedText
                  style={[styles.segmentText, { color: selected ? theme.onPrimary : theme.text }]}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        {sorted.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            {sortBy === 'winRate'
              ? `Die Siegquoten-Tabelle zeigt Spieler ab ${MIN_GAMES_FOR_RATE} Spielen.`
              : 'Noch keine Spieler.'}
          </ThemedText>
        )}

        {sorted.map((row, i) => (
          <Pressable
            key={row.player.id}
            accessibilityRole="button"
            onPress={() => openProfile(row.player.id)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText style={styles.rank}>{MEDALS[i] ?? `${i + 1}.`}</ThemedText>
            <View style={styles.flex}>
              <ThemedText style={styles.name}>{row.player.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {row.summary?.played
                  ? `${row.summary.played} Spiele · ${row.summary.wins} S / ${row.summary.draws} U / ${row.summary.losses} N`
                  : 'noch keine Spiele'}
              </ThemedText>
              {row.summary && row.summary.form.length > 0 && (
                <View style={styles.formRow}>
                  <FormChips form={row.summary.form} size={20} />
                </View>
              )}
            </View>
            <ThemedText style={[styles.value, { color: theme.primary }]}>
              {sortBy === 'strength'
                ? formatRating(row.strength)
                : `${Math.round((row.summary?.winRate ?? 0) * 100)} %`}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.six,
  },
  flex: { flex: 1 },
  centerText: { textAlign: 'center', marginTop: Spacing.four },
  section: { gap: Spacing.two, marginBottom: Spacing.two },
  awards: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  award: {
    flexGrow: 1,
    flexBasis: 150,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    padding: Spacing.two,
  },
  awardEmoji: { fontSize: 30, lineHeight: 36 },
  awardName: { fontSize: 17, fontWeight: 800 },
  segment: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.one },
  segmentButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 16, fontWeight: 700 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 14,
  },
  rank: { width: 34, fontSize: 22, lineHeight: 28, fontWeight: 800, textAlign: 'center' },
  name: { fontSize: 18, fontWeight: 700 },
  formRow: { marginTop: Spacing.one },
  value: { fontSize: 22, fontWeight: 800 },
});
