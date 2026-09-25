import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ErrorText } from '@/components/form';
import { FormChips } from '@/components/stats';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup } from '@/lib/group';
import { todayIso, useGroupStats } from '@/lib/group-stats';
import { formatRating } from '@/lib/ratings';
import { awards, eternalTable, seasons, summarize, type EternalRow } from '@/lib/stats';
import { errorMessage } from '@/lib/supabase';
import { strength } from '@/lib/teams';

type SortBy = 'strength' | 'winRate' | 'eternal';
/** Für die Siegquoten-Tabelle braucht es ein paar Spiele, sonst führt jeder mit 1 Sieg aus 1 Spiel */
const MIN_GAMES_FOR_RATE = 3;
const MEDALS = ['🥇', '🥈', '🥉'];

export default function TableScreen() {
  const theme = useTheme();
  const { current, players } = useGroup();
  const { stats, error } = useGroupStats(current?.id);
  const [sortBy, setSortBy] = useState<SortBy>('strength');
  // Ewige Tabelle: '' = alle Jahre, sonst z. B. '2026'
  const [year, setYear] = useState('');

  // Gäste erscheinen nicht in der Tabelle (TODO A6)
  const active = players.filter((p) => p.active && !p.is_guest);
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
  const years = stats ? seasons(stats.games) : [];
  const eternal = stats ? eternalTable(stats.games, year || undefined) : [];
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
              ['strength', 'Stärke'],
              ['winRate', 'Siegquote'],
              ['eternal', 'Ewig'],
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

        {sortBy === 'eternal' ? (
          <EternalTable
            rows={eternal}
            years={years}
            year={year}
            onYear={setYear}
            nameOf={nameOf}
            onOpen={openProfile}
            loading={!stats}
          />
        ) : (
          <>
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
                <Avatar name={row.player.name} path={row.player.avatar_path} size={40} />
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
          </>
        )}
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
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginBottom: Spacing.one },
  yearChip: {
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    borderWidth: 2,
    justifyContent: 'center',
  },
  yearText: { fontSize: 15, fontWeight: 700 },
  eternalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
    borderBottomWidth: 1,
  },
  eternalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 56,
    paddingHorizontal: Spacing.two,
    borderRadius: 14,
  },
  col: { width: 30, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pointsCol: { width: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  points: { fontSize: 20, fontWeight: 800 },
});

/** Ewige Tabelle: Sieg 3 Punkte, Unentschieden 1 Punkt – wahlweise für ein Jahr */
function EternalTable({
  rows,
  years,
  year,
  onYear,
  nameOf,
  onOpen,
  loading,
}: {
  rows: EternalRow[];
  years: string[];
  year: string;
  onYear: (year: string) => void;
  nameOf: (id: string) => string;
  onOpen: (id: string) => void;
  loading: boolean;
}) {
  const theme = useTheme();
  return (
    <>
      {years.length > 0 && (
        <View style={styles.years}>
          {['', ...years].map((y) => {
            const selected = y === year;
            return (
              <Pressable
                key={y || 'all'}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => onYear(y)}
                style={[
                  styles.yearChip,
                  {
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? theme.backgroundSelected : 'transparent',
                  },
                ]}>
                <ThemedText style={styles.yearText}>{y || 'Gesamt'}</ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}

      {!loading && rows.length === 0 && (
        <ThemedText themeColor="textSecondary" style={styles.centerText}>
          Noch keine Ergebnisse. Nach dem ersten eingetragenen Spiel füllt sich die ewige Tabelle.
        </ThemedText>
      )}

      {rows.length > 0 && (
        <View style={[styles.eternalHead, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.rank}>
            #
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            Spieler
          </ThemedText>
          {['Sp', 'S', 'U', 'N'].map((h) => (
            <ThemedText key={h} type="small" themeColor="textSecondary" style={styles.col}>
              {h}
            </ThemedText>
          ))}
          <ThemedText type="small" themeColor="textSecondary" style={styles.pointsCol}>
            Pkt
          </ThemedText>
        </View>
      )}

      {rows.map((row, i) => (
        <Pressable
          key={row.playerId}
          accessibilityRole="button"
          accessibilityLabel={`${nameOf(row.playerId)}: ${row.points} Punkte aus ${row.played} Spielen`}
          onPress={() => onOpen(row.playerId)}
          style={({ pressed }) => [
            styles.eternalRow,
            { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
          ]}>
          <ThemedText style={styles.rank}>{MEDALS[i] ?? `${i + 1}.`}</ThemedText>
          <ThemedText style={[styles.name, styles.flex]} numberOfLines={1}>
            {nameOf(row.playerId)}
          </ThemedText>
          <ThemedText style={styles.col}>{row.played}</ThemedText>
          <ThemedText style={styles.col}>{row.wins}</ThemedText>
          <ThemedText style={styles.col}>{row.draws}</ThemedText>
          <ThemedText style={styles.col}>{row.losses}</ThemedText>
          <ThemedText style={[styles.pointsCol, styles.points, { color: theme.primary }]}>
            {row.points}
          </ThemedText>
        </Pressable>
      ))}

      {rows.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.centerText}>
          Sieg 3 Punkte · Unentschieden 1 Punkt · Niederlage 0 Punkte. Ein Turniersieg zählt als ein
          Sieg.
        </ThemedText>
      )}
    </>
  );
}
