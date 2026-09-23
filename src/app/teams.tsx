import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TeamColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup, type Player } from '@/lib/group';
import { formatRating } from '@/lib/ratings';
import { useStore } from '@/lib/store';
import { pickSplit, splitKey, teamStats } from '@/lib/teams';

export default function TeamsScreen() {
  const theme = useTheme();
  const { draw, setDraw } = useStore();
  const { players, current } = useGroup();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (!draw || draw.groupId !== current?.id) {
    return (
      <ThemedView style={[styles.screen, styles.emptyScreen]}>
        <ThemedText style={styles.center}>Es wurden noch keine Teams gewürfelt.</ThemedText>
        <BigButton title="Zum Spieltag" onPress={() => router.replace('/')} />
      </ThemedView>
    );
  }

  const lookup = new Map(players.map((p) => [p.id, p]));
  const teams = draw.teams.map((ids) =>
    ids.map((id) => lookup.get(id)).filter((p): p is Player => p !== undefined)
  );
  const stats = teams.map(teamStats);
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
  const handEdited = splitKey(draw.teams) !== draw.key;
  const selectedTeam = draw.teams.findIndex((t) => t.includes(selectedId ?? ''));

  const reroll = () => {
    const split = pickSplit(draw.candidates, splitKey(draw.teams));
    if (split) setDraw({ ...draw, teams: split.teams, key: split.key });
    setSelectedId(null);
  };

  const updateTeams = (next: string[][]) => {
    setDraw({ ...draw, teams: next });
    setSelectedId(null);
  };

  const tapPlayer = (id: string, teamIndex: number) => {
    if (selectedId === null || selectedId === id) {
      setSelectedId(selectedId === id ? null : id);
      return;
    }
    if (teamIndex === selectedTeam) {
      setSelectedId(id);
      return;
    }
    // Zwei Spieler aus verschiedenen Teams tauschen
    updateTeams(
      draw.teams.map((team) =>
        team.map((p) => (p === selectedId ? id : p === id ? selectedId : p))
      )
    );
  };

  const moveHere = (teamIndex: number) => {
    if (selectedId === null) return;
    updateTeams(
      draw.teams.map((team, i) =>
        i === teamIndex ? [...team, selectedId] : team.filter((p) => p !== selectedId)
      )
    );
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedView type="backgroundElement" style={styles.summary}>
          <ThemedText type="smallBold">
            Unterschied Gesamtstärke: {formatRating(spread(stats.map((s) => s.total)))}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Abwehr {formatRating(spread(stats.map((s) => s.defense)))} · Angriff{' '}
            {formatRating(spread(stats.map((s) => s.attack)))}
            {handEdited ? ' · von Hand geändert' : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {selectedId
              ? 'Jetzt einen Spieler aus einem anderen Team antippen (tauschen) oder „Hierher verschieben“.'
              : 'Tipp: Spieler antippen, um ihn zu tauschen oder zu verschieben.'}
          </ThemedText>
        </ThemedView>

        {teams.map((team, teamIndex) => {
          const colors = TeamColors[teamIndex % TeamColors.length];
          const s = stats[teamIndex];
          return (
            <ThemedView
              key={teamIndex}
              type="backgroundElement"
              style={[styles.card, { borderLeftColor: colors.color }]}>
              <View style={styles.cardHeader}>
                <View style={[styles.dot, { backgroundColor: colors.color }]} />
                <ThemedText style={[styles.teamName, styles.flex]}>
                  Team {colors.name} ({s.size})
                </ThemedText>
                <ThemedText style={styles.teamTotal}>{formatRating(s.total)}</ThemedText>
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                Abwehr {formatRating(s.defense)} · Angriff {formatRating(s.attack)}
              </ThemedText>

              {team.map((player) => {
                const selected = player.id === selectedId;
                return (
                  <Pressable
                    key={player.id}
                    accessibilityRole="button"
                    onPress={() => tapPlayer(player.id, teamIndex)}
                    style={[
                      styles.playerRow,
                      {
                        backgroundColor: selected ? theme.backgroundSelected : 'transparent',
                        borderColor: selected ? theme.primary : 'transparent',
                      },
                    ]}>
                    <ThemedText style={[styles.playerName, styles.flex]}>{player.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      A {formatRating(player.defense)} · S {formatRating(player.attack)}
                    </ThemedText>
                  </Pressable>
                );
              })}

              {selectedId !== null && selectedTeam !== teamIndex && (
                <BigButton
                  title="Hierher verschieben"
                  variant="secondary"
                  onPress={() => moveHere(teamIndex)}
                  style={[styles.moveButton, { borderColor: theme.border }]}
                />
              )}
            </ThemedView>
          );
        })}

        <BigButton title="🎲 Neu würfeln" onPress={reroll} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          A = Abwehr · S = Sturm (Angriff)
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  emptyScreen: { justifyContent: 'center', padding: Spacing.four, gap: Spacing.four },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  summary: { borderRadius: 14, padding: Spacing.three, gap: Spacing.one },
  card: {
    borderRadius: 14,
    borderLeftWidth: 8,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 16, height: 16, borderRadius: 8 },
  teamName: { fontSize: 20, fontWeight: 700 },
  teamTotal: { fontSize: 22, fontWeight: 700 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: 2,
  },
  playerName: { fontSize: 18, fontWeight: 600 },
  moveButton: { marginTop: Spacing.two, borderWidth: 1 },
});
