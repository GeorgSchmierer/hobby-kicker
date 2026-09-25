import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { SmallButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing } from '@/constants/theme';
import type { Player } from '@/lib/group';
import { berlinToday } from '@/lib/schedule';
import {
  loadSeasons,
  loadStandings,
  MIN_GAMES_PER_GAME_RANKING,
  periodOptions,
  sortByPointsPerGame,
  type Period,
  type Season,
  type StandingRow,
} from '@/lib/standings';
import { errorMessage } from '@/lib/supabase';

const MEDALS = ['🥇', '🥈', '🥉'];

type Sort = 'points' | 'perGame';

/** Saison-Tabelle (TODO C2): Platz, Spieler, Spiele, S/U/N, Punkte, Punkte pro Spiel */
export function SeasonTable({
  groupId,
  players,
  isAdmin,
  playedYears,
}: {
  groupId: string;
  players: Player[];
  isAdmin: boolean;
  playedYears: string[];
}) {
  const theme = useTheme();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [rows, setRows] = useState<{ key: string; list: StandingRow[] } | null>(null);
  const [sort, setSort] = useState<Sort>('points');
  const [error, setError] = useState<string | null>(null);

  const { options, defaultKey } = periodOptions(seasons ?? [], playedYears, berlinToday());
  const period: Period = options.find((o) => o.key === (chosen ?? defaultKey)) ?? options[0];

  useFocusEffect(
    useCallback(() => {
      loadSeasons(groupId)
        .then(setSeasons)
        .catch(() => setSeasons([]));
    }, [groupId])
  );

  useFocusEffect(
    useCallback(() => {
      if (seasons === null) return;
      loadStandings(groupId, period)
        .then((list) => {
          setRows({ key: period.key, list });
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)));
      // period ergibt sich aus seasons + Auswahl
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [groupId, seasons, period.key])
  );

  const byId = new Map(players.map((p) => [p.id, p]));
  const current = rows?.key === period.key ? rows.list : null;
  const shown = current ? (sort === 'points' ? current : sortByPointsPerGame(current)) : [];

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {options.map((o) => {
          const selected = o.key === period.key;
          return (
            <Pressable
              key={o.key}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => setChosen(o.key)}
              style={[
                styles.chip,
                {
                  borderColor: selected ? theme.primary : theme.border,
                  backgroundColor: selected ? theme.backgroundSelected : 'transparent',
                },
              ]}>
              <ThemedText style={styles.chipText}>{o.label}</ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.toolbar}>
        <View style={styles.sortRow}>
          {(
            [
              ['points', 'Punkte'],
              ['perGame', 'Pkt. pro Spiel'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: sort === value }}
              onPress={() => setSort(value)}
              hitSlop={8}>
              <ThemedText
                type={sort === value ? 'smallBold' : 'small'}
                style={{ color: sort === value ? theme.primary : theme.textSecondary }}>
                {label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
        {isAdmin && <SmallButton title="Saisons" onPress={() => router.push('/saisons')} />}
      </View>

      <ErrorText message={error} />

      {current && shown.length === 0 && (
        <ThemedText themeColor="textSecondary" style={styles.center}>
          {sort === 'perGame'
            ? `„Punkte pro Spiel“ zeigt Spieler ab ${MIN_GAMES_PER_GAME_RANKING} Spielen.`
            : 'In diesem Zeitraum gibt es noch keine Ergebnisse.'}
        </ThemedText>
      )}

      {shown.length > 0 && (
        <View style={[styles.head, { borderColor: theme.border }]}>
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
          <ThemedText type="small" themeColor="textSecondary" style={styles.perGameCol}>
            Ø
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.pointsCol}>
            Pkt
          </ThemedText>
        </View>
      )}

      {shown.map((row, i) => {
        const p = byId.get(row.playerId);
        const name = p?.name ?? '?';
        const perGame = (row.points / row.played).toFixed(1).replace('.', ',');
        return (
          <Pressable
            key={row.playerId}
            accessibilityRole="button"
            accessibilityLabel={`${name}: ${row.points} Punkte aus ${row.played} Spielen`}
            onPress={() => router.push({ pathname: '/profil/[id]', params: { id: row.playerId } })}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <ThemedText style={styles.rank}>{MEDALS[i] ?? `${i + 1}.`}</ThemedText>
            <Avatar name={name} path={p?.avatar_path} size={26} />
            <ThemedText style={[styles.name, styles.flex]} numberOfLines={1}>
              {name}
            </ThemedText>
            <ThemedText style={styles.col}>{row.played}</ThemedText>
            <ThemedText style={styles.col}>{row.wins}</ThemedText>
            <ThemedText style={styles.col}>{row.draws}</ThemedText>
            <ThemedText style={styles.col}>{row.losses}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.perGameCol}>
              {perGame}
            </ThemedText>
            <ThemedText style={[styles.pointsCol, styles.points, { color: theme.primary }]}>
              {row.points}
            </ThemedText>
          </Pressable>
        );
      })}

      {shown.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          Sieg 3 Punkte, Unentschieden 1, Niederlage 0. Ein Turniersieg zählt als ein Sieg. Ø =
          Punkte pro Spiel.
        </ThemedText>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sortRow: { flexDirection: 'row', gap: Spacing.three },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingBottom: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 52,
    paddingHorizontal: Spacing.two,
    borderRadius: 12,
  },
  rank: { width: 30, fontSize: 16, fontWeight: 700 },
  name: { fontSize: 16, fontWeight: 600, marginLeft: Spacing.one },
  col: { width: 26, textAlign: 'center', fontVariant: ['tabular-nums'] },
  perGameCol: { width: 30, textAlign: 'center', fontVariant: ['tabular-nums'] },
  pointsCol: { width: 38, textAlign: 'right', fontVariant: ['tabular-nums'] },
  points: { fontSize: 18, fontWeight: 800 },
});
