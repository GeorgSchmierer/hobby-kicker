import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { TeamDot, teamColor, teamName } from '@/components/team';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { useGroup, type Player } from '@/lib/group';
import { formatRating } from '@/lib/ratings';
import {
  deleteSession,
  formatDate,
  latestResultId,
  loadSession,
  undoLastResult,
  type Result,
  type SessionDetail,
} from '@/lib/sessions';
import { errorMessage } from '@/lib/supabase';
import { teamStats } from '@/lib/teams';

export default function SessionScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session: auth } = useAuth();
  const { current, isAdmin, players, refreshPlayers } = useGroup();
  const [detail, setDetail] = useState<SessionDetail | null | undefined>(undefined);
  const [latestId, setLatestId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [loaded, latest] = await Promise.all([
        loadSession(id),
        current ? latestResultId(current.id) : Promise.resolve(null),
      ]);
      setDetail(loaded);
      setLatestId(latest);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, current]);

  useFocusEffect(
    useCallback(() => {
      reload();
      refreshPlayers().catch(() => {});
    }, [reload, refreshPlayers])
  );

  if (detail === undefined) {
    return (
      <ThemedView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={theme.primary} />
        <ErrorText message={error} />
      </ThemedView>
    );
  }
  if (detail === null || detail.group_id !== current?.id) {
    return (
      <ThemedView style={[styles.screen, styles.center]}>
        <ThemedText>Diesen Spieltag gibt es nicht (mehr).</ThemedText>
      </ThemedView>
    );
  }

  const lookup = new Map(players.map((p) => [p.id, p]));
  const teamIdx = new Map(detail.teams.map((t) => [t.id, t.idx]));
  const newestFirst = [...detail.results].reverse();
  const shownExpanded = expanded ?? newestFirst[0]?.id ?? null;
  const canDelete =
    detail.results.length === 0 && (isAdmin || detail.created_by === auth?.user.id);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const undo = async (result: Result) => {
    const ok = await confirmAction(
      'Ergebnis rückgängig machen?',
      'Das Ergebnis wird gelöscht und die Stärkewerte aller beteiligten Spieler auf den Stand davor zurückgesetzt.',
      'Rückgängig'
    );
    if (!ok) return;
    run(async () => {
      await undoLastResult(detail.group_id, result.id);
      setExpanded(null);
      await Promise.all([reload(), refreshPlayers()]);
    });
  };

  const removeSession = async () => {
    const ok = await confirmAction(
      'Spieltag löschen?',
      'Der Spieltag hat noch keine Ergebnisse. Die Teams werden verworfen.',
      'Löschen'
    );
    if (!ok) return;
    run(async () => {
      await deleteSession(detail.id);
      router.back();
    });
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: `Spieltag ${formatDate(detail.played_on)}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorText message={error} />

        <BigButton
          title="⚽ Ergebnis eintragen"
          disabled={busy}
          onPress={() =>
            router.push({ pathname: '/spieltag/[id]/ergebnis', params: { id: detail.id } })
          }
        />

        {/* Ergebnisse, neueste zuerst */}
        {newestFirst.length > 0 && (
          <View style={styles.section}>
            <ThemedText type="smallBold">Ergebnisse</ThemedText>
            {newestFirst.map((result) => (
              <ResultCard
                key={result.id}
                result={result}
                teamIdx={teamIdx}
                lookup={lookup}
                expanded={shownExpanded === result.id}
                onToggle={() => setExpanded(shownExpanded === result.id ? '' : result.id)}
                canUndo={isAdmin && result.id === latestId}
                busy={busy}
                onUndo={() => undo(result)}
              />
            ))}
          </View>
        )}

        {/* Teams */}
        <View style={styles.section}>
          <ThemedText type="smallBold">Teams</ThemedText>
          {detail.teams.map((team) => {
            const members = team.playerIds
              .map((pid) => lookup.get(pid))
              .filter((p): p is Player => p !== undefined);
            const stats = teamStats(members);
            return (
              <ThemedView
                key={team.id}
                type="backgroundElement"
                style={[styles.teamCard, { borderLeftColor: teamColor(team.idx).color }]}>
                <View style={styles.row}>
                  <TeamDot idx={team.idx} />
                  <ThemedText style={[styles.teamName, styles.flex]}>
                    {teamName(team.idx)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Stärke jetzt {formatRating(stats.total)}
                  </ThemedText>
                </View>
                <ThemedText themeColor="textSecondary">
                  {members.map((p) => p.name).join(', ')}
                </ThemedText>
              </ThemedView>
            );
          })}
        </View>

        {canDelete && (
          <BigButton
            title="Spieltag löschen"
            variant="danger"
            disabled={busy}
            onPress={removeSession}
          />
        )}
      </ScrollView>
    </ThemedView>
  );
}

function ResultCard({
  result,
  teamIdx,
  lookup,
  expanded,
  onToggle,
  canUndo,
  busy,
  onUndo,
}: {
  result: Result;
  teamIdx: Map<string, number>;
  lookup: Map<string, Player>;
  expanded: boolean;
  onToggle: () => void;
  canUndo: boolean;
  busy: boolean;
  onUndo: () => void;
}) {
  const theme = useTheme();
  const changes = [...result.changes].sort(
    (a, b) =>
      b.defense_after - b.defense_before - (a.defense_after - a.defense_before) ||
      (lookup.get(a.player_id)?.name ?? '').localeCompare(lookup.get(b.player_id)?.name ?? '', 'de')
  );

  return (
    <ThemedView type="backgroundElement" style={styles.resultCard}>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.resultHeader}>
        <View style={styles.flex}>
          <ResultTitle result={result} teamIdx={teamIdx} />
        </View>
        <ThemedText themeColor="textSecondary">{expanded ? '▲' : '▼'}</ThemedText>
      </Pressable>

      {expanded && (
        <View style={styles.changes}>
          <ThemedText type="small" themeColor="textSecondary">
            So haben sich die Stärkewerte verändert:
          </ThemedText>
          {changes.map((c) => {
            const diff = c.defense_after - c.defense_before;
            const sign = diff > 0.004 ? '+' : diff < -0.004 ? '−' : '±';
            return (
              <View key={c.player_id} style={styles.changeRow}>
                <ThemedText style={[styles.flex, styles.changeName]}>
                  {lookup.get(c.player_id)?.name ?? '?'}
                </ThemedText>
                <View style={styles.changeValues}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Abwehr {formatRating(c.defense_before)} → {formatRating(c.defense_after)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    Angriff {formatRating(c.attack_before)} → {formatRating(c.attack_after)}
                  </ThemedText>
                </View>
                <ThemedText
                  style={[
                    styles.changeDiff,
                    { color: diff > 0.004 ? theme.primary : diff < -0.004 ? theme.danger : theme.textSecondary },
                  ]}>
                  {sign}
                  {formatDiff(Math.abs(diff))}
                </ThemedText>
              </View>
            );
          })}
          {canUndo && (
            <BigButton
              title="↩ Rückgängig machen"
              variant="secondary"
              style={[styles.undo, { borderColor: theme.border }]}
              disabled={busy}
              onPress={onUndo}
            />
          )}
        </View>
      )}
    </ThemedView>
  );
}

function ResultTitle({ result, teamIdx }: { result: Result; teamIdx: Map<string, number> }) {
  if (result.kind === 'tournament') {
    const winner = teamIdx.get(result.matches[0]?.team_a) ?? 0;
    return (
      <View style={styles.row}>
        <ThemedText style={styles.resultText}>🏆 Turniersieger:</ThemedText>
        <TeamDot idx={winner} />
        <ThemedText style={styles.resultText}>{teamColor(winner).name}</ThemedText>
      </View>
    );
  }
  const m = result.matches[0];
  const a = teamIdx.get(m.team_a) ?? 0;
  const b = teamIdx.get(m.team_b) ?? 1;
  const team = (idx: number, bold: boolean) => (
    <>
      <TeamDot idx={idx} />
      <ThemedText style={[styles.resultText, bold && styles.winner]}>{teamColor(idx).name}</ThemedText>
    </>
  );

  if (m.goals_a !== null) {
    return (
      <View style={styles.row}>
        {team(a, m.score_a === 1)}
        <ThemedText style={styles.resultText}>
          {m.goals_a} : {m.goals_b}
        </ThemedText>
        {team(b, m.score_a === 0)}
      </View>
    );
  }
  if (m.score_a === 0.5) {
    return (
      <View style={styles.row}>
        {team(a, false)}
        <ThemedText style={styles.resultText}>und</ThemedText>
        {team(b, false)}
        <ThemedText style={styles.resultText}>unentschieden</ThemedText>
      </View>
    );
  }
  const [winner, loser] = m.score_a === 1 ? [a, b] : [b, a];
  return (
    <View style={styles.row}>
      {team(winner, true)}
      <ThemedText style={styles.resultText}>gewinnt gegen</ThemedText>
      {team(loser, false)}
    </View>
  );
}

/** Kleine Änderungen mit zwei Nachkommastellen, damit man sie überhaupt sieht */
function formatDiff(value: number): string {
  return (value < 0.1 ? value.toFixed(2) : value.toFixed(1)).replace('.', ',');
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  section: { gap: Spacing.two },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  teamCard: { borderRadius: 14, borderLeftWidth: 8, padding: Spacing.three, gap: Spacing.one },
  teamName: { fontSize: 18, fontWeight: 700 },
  resultCard: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 40 },
  resultText: { fontSize: 18, fontWeight: 600 },
  winner: { fontWeight: 800, textDecorationLine: 'underline' },
  changes: { gap: Spacing.two },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  changeName: { fontSize: 16, fontWeight: 600 },
  changeValues: { alignItems: 'flex-end' },
  changeDiff: { width: 56, textAlign: 'right', fontSize: 16, fontWeight: 700 },
  undo: { marginTop: Spacing.two, borderWidth: 1 },
});
