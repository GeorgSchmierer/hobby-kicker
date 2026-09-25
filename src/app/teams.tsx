import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useReducedMotion } from 'react-native-reanimated';

import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, TeamColors } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ErrorText } from '@/components/form';
import { ChanceBar } from '@/components/team';
import { averageWinChances, formatPercent, funTeamNames, teamsShareText } from '@/lib/fun';
import { useAuth } from '@/lib/auth';
import { useGroup, type Player } from '@/lib/group';
import { formatRating } from '@/lib/ratings';
import { APP_URL } from '@/lib/params';
import { startSession } from '@/lib/sessions';
import { useScaleD } from '@/lib/settings';
import { shareText } from '@/lib/share';
import { useStore } from '@/lib/store';
import { errorMessage } from '@/lib/supabase';
import { pickSplit, splitKey, teamStats } from '@/lib/teams';

/** Gesamtdauer der Einflug-Verzögerungen beim Würfeln (danach federt der Letzte noch kurz nach) */
const FLY_IN_TOTAL_MS = 700;

export default function TeamsScreen() {
  const theme = useTheme();
  const { draw, setDraw } = useStore();
  const { players, current } = useGroup();
  const userId = useAuth().session?.user.id ?? null;
  // Einflug-Animation (TODO B2): entfällt bei „Bewegung reduzieren“, insgesamt höchstens ~1 Sekunde
  const reduceMotion = useReducedMotion();
  const playerCount = draw?.teams.flat().length ?? 0;
  const flyStep = Math.min(45, Math.floor(FLY_IN_TOTAL_MS / Math.max(1, playerCount)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareInfo, setShareInfo] = useState<string | null>(null);
  const scaleD = useScaleD();

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
  const chances = averageWinChances(stats.map((s) => s.total), scaleD);
  // Lustige Namen hängen an der Zusammensetzung – im Spieltag erscheinen dieselben
  const funNames = funTeamNames(splitKey(draw.teams), teams.length);

  const share = async () => {
    const text = teamsShareText({
      groupName: current!.name,
      teams: teams.map((team, i) => ({
        colorName: TeamColors[i].name,
        emoji: TeamColors[i].emoji,
        funName: funNames[i],
        total: stats[i].total,
        players: team.map((p) => p.name),
      })),
      chances,
      appUrl: APP_URL,
    });
    const outcome = await shareText(text);
    setShareInfo(outcome === 'copied' ? 'Teams kopiert – jetzt z. B. in WhatsApp einfügen.' : null);
  };

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

  const play = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await startSession(current!.id, draw.teams, userId);
      setDraw(null);
      router.replace({ pathname: '/spieltag/[id]', params: { id } });
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  const hasEmptyTeam = draw.teams.some((t) => t.length === 0);

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
          {teams.length === 2 && <ChanceBar idxA={0} idxB={1} chanceA={chances[0]} />}
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
              <ThemedText style={[styles.funName, { color: colors.color }]}>„{funNames[teamIndex]}“</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Abwehr {formatRating(s.defense)} · Angriff {formatRating(s.attack)}
                {teams.length > 2 ? ` · Ø Siegchance ${formatPercent(chances[teamIndex])}` : ''}
              </ThemedText>

              {team.map((player, playerIndex) => {
                const selected = player.id === selectedId;
                return (
                  <Animated.View
                    key={`${draw.key}-${player.id}`}
                    entering={
                      reduceMotion
                        ? undefined
                        : FadeInDown.delay((playerIndex * teams.length + teamIndex) * flyStep).springify()
                    }>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => tapPlayer(player.id, teamIndex)}
                    style={[
                      styles.playerRow,
                      {
                        backgroundColor: selected ? theme.backgroundSelected : 'transparent',
                        borderColor: selected ? theme.primary : 'transparent',
                      },
                    ]}>
                    <Avatar name={player.name} path={player.avatar_path} size={28} />
                    <ThemedText style={[styles.playerName, styles.flex]}>{player.name}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      A {formatRating(player.defense)} · S {formatRating(player.attack)}
                    </ThemedText>
                  </Pressable>
                  </Animated.View>
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

        <ErrorText message={error} />
        <BigButton
          title={busy ? 'Wird gespeichert …' : '✅ Mit diesen Teams spielen'}
          disabled={busy || hasEmptyTeam}
          onPress={play}
        />
        {hasEmptyTeam && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Jedes Team braucht mindestens einen Spieler.
          </ThemedText>
        )}
        <BigButton
          title="📤 Teams teilen"
          variant="secondary"
          style={[styles.moveButton, { borderColor: theme.border }]}
          onPress={share}
        />
        {shareInfo && (
          <ThemedText type="small" style={styles.center}>
            {shareInfo}
          </ThemedText>
        )}
        <BigButton
          title="🎲 Neu würfeln"
          variant="secondary"
          style={[styles.moveButton, { borderColor: theme.border }]}
          disabled={busy}
          onPress={reroll}
        />
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
  funName: { fontSize: 15, fontWeight: 700, fontStyle: 'italic' },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 48,
    paddingHorizontal: Spacing.two,
    borderRadius: 10,
    borderWidth: 2,
  },
  playerName: { fontSize: 18, fontWeight: 600 },
  moveButton: { marginTop: Spacing.two, borderWidth: 1 },
});
