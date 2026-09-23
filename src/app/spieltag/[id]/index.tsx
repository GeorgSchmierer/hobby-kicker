import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { Confetti } from '@/components/confetti';
import { ChanceBar, TeamDot, teamColor, teamName } from '@/components/team';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { averageWinChances, formatPercent, funTeamNames, teamsShareText } from '@/lib/fun';
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
import { APP_URL } from '@/lib/params';
import { useScaleD } from '@/lib/settings';
import { shareText } from '@/lib/share';
import { useStore, type Celebration } from '@/lib/store';
import { errorMessage } from '@/lib/supabase';
import { splitKey, teamStats } from '@/lib/teams';

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
  const [shareInfo, setShareInfo] = useState<string | null>(null);
  const [party, setParty] = useState<Celebration | null>(null);
  const { celebration, setCelebration } = useStore();
  const scaleD = useScaleD();

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

  // Frisch eingetragenes Ergebnis feiern (Konfetti + Banner), danach wieder ausblenden
  useFocusEffect(
    useCallback(() => {
      if (celebration?.sessionId !== id) return;
      setParty(celebration);
      setCelebration(null);
      const timer = setTimeout(() => setParty(null), 5000);
      return () => clearTimeout(timer);
    }, [celebration, id, setCelebration])
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
  const teamMembers = detail.teams.map((team) =>
    team.playerIds.map((pid) => lookup.get(pid)).filter((p): p is Player => p !== undefined)
  );
  const totals = teamMembers.map((m) => teamStats(m).total);
  const chances = averageWinChances(totals, scaleD);
  const funNames = funTeamNames(splitKey(detail.teams.map((t) => t.playerIds)), detail.teams.length);

  const share = async () => {
    const text = teamsShareText({
      groupName: current.name,
      dateLabel: formatDate(detail.played_on),
      teams: detail.teams.map((t, i) => ({
        colorName: teamColor(t.idx).name,
        emoji: teamColor(t.idx).emoji,
        funName: funNames[i],
        total: totals[i],
        players: teamMembers[i].map((p) => p.name),
      })),
      chances,
      appUrl: APP_URL,
    });
    const outcome = await shareText(text);
    setShareInfo(outcome === 'copied' ? 'Teams kopiert – jetzt z. B. in WhatsApp einfügen.' : null);
  };

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

        {party && (
          <ThemedView
            type="backgroundSelected"
            style={[
              styles.banner,
              { borderColor: party.winnerIdx === null ? theme.primary : teamColor(party.winnerIdx).color },
            ]}>
            <ThemedText style={styles.bannerText}>
              {party.winnerIdx === null
                ? '🤝 Unentschieden – gut gekämpft!'
                : `🎉 ${teamName(party.winnerIdx)} gewinnt!`}
            </ThemedText>
          </ThemedView>
        )}

        <BigButton
          title="⚽ Ergebnis eintragen"
          disabled={busy}
          onPress={() =>
            router.push({ pathname: '/spieltag/[id]/ergebnis', params: { id: detail.id } })
          }
        />
        <View style={styles.buttonRow}>
          <BigButton
            title="⏱ Stoppuhr"
            variant="secondary"
            style={[styles.flex, styles.outlined, { borderColor: theme.border }]}
            onPress={() => router.push('/stoppuhr')}
          />
          <BigButton
            title="📤 Teilen"
            variant="secondary"
            style={[styles.flex, styles.outlined, { borderColor: theme.border }]}
            onPress={share}
          />
        </View>
        {shareInfo && <ThemedText type="small">{shareInfo}</ThemedText>}

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
          {detail.teams.length === 2 && (
            <ChanceBar idxA={detail.teams[0].idx} idxB={detail.teams[1].idx} chanceA={chances[0]} />
          )}
          {detail.teams.map((team, i) => {
            const members = teamMembers[i];
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
                    Stärke jetzt {formatRating(totals[i])}
                    {detail.teams.length > 2 ? ` · Ø ${formatPercent(chances[i])}` : ''}
                  </ThemedText>
                </View>
                <ThemedText style={[styles.funName, { color: teamColor(team.idx).color }]}>
                  „{funNames[i]}“
                </ThemedText>
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
      {party && party.winnerIdx !== null && (
        <Confetti colors={[teamColor(party.winnerIdx).color, '#FFD54F', '#FFFFFF', '#66BB6A']} />
      )}
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
  funName: { fontSize: 15, fontWeight: 700, fontStyle: 'italic' },
  banner: { borderRadius: 14, borderWidth: 3, padding: Spacing.three, alignItems: 'center' },
  bannerText: { fontSize: 22, lineHeight: 30, fontWeight: 800, textAlign: 'center' },
  buttonRow: { flexDirection: 'row', gap: Spacing.two },
  outlined: { borderWidth: 1 },
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
