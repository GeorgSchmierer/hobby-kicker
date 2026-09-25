import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { ChanceBar, TeamChip, teamColor } from '@/components/team';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { winChance } from '@/lib/fun';
import { useGroup } from '@/lib/group';
import {
  loadSession,
  recordMatch,
  recordTournamentWinner,
  type Outcome,
  type SessionDetail,
  type SessionTeam,
} from '@/lib/sessions';
import { useScaleD } from '@/lib/settings';
import { useStore } from '@/lib/store';
import { errorMessage } from '@/lib/supabase';

type Mode = 'match' | 'tournament';

export default function RecordResultScreen() {
  // a/b: vorausgewählte Teams (z. B. aus dem Spielplan)
  const { id, a, b } = useLocalSearchParams<{ id: string; a?: string; b?: string }>();
  const [loaded, setLoaded] = useState<SessionDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSession(id)
      .then((s) => {
        if (s) setLoaded(s);
        else setError('Diesen Spieltag gibt es nicht (mehr).');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  if (!loaded) {
    return (
      <ThemedView style={[styles.screen, styles.center]}>
        <ActivityIndicator />
        <ErrorText message={error} />
      </ThemedView>
    );
  }
  return (
    <ResultForm
      groupId={loaded.group_id}
      sessionId={id}
      teams={loaded.teams}
      matchNo={loaded.results.length + 1}
      initialA={a}
      initialB={b}
    />
  );
}

function ResultForm({
  groupId,
  sessionId,
  teams,
  matchNo,
  initialA,
  initialB,
}: {
  groupId: string;
  sessionId: string;
  teams: SessionTeam[];
  /** laufende Nummer dieser Partie am Spieltag (erkennt doppelte Einträge) */
  matchNo: number;
  initialA?: string;
  initialB?: string;
}) {
  const theme = useTheme();
  const { setCelebration } = useStore();
  const { players } = useGroup();
  const scaleD = useScaleD();
  const strengthOf = (team: SessionTeam) =>
    team.playerIds.reduce((sum, id) => {
      const p = players.find((x) => x.id === id);
      return sum + (p ? (p.defense + p.attack) / 2 : 0);
    }, 0);
  const [mode, setMode] = useState<Mode>('match');
  const presetA = teams.find((t) => t.id === initialA);
  const presetB = teams.find((t) => t.id === initialB && t.id !== presetA?.id);
  const [teamA, setTeamA] = useState<SessionTeam | null>(presetA ?? teams[0] ?? null);
  const [teamB, setTeamB] = useState<SessionTeam | null>(
    presetB ?? (teams.length === 2 ? teams[1] : null)
  );
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [withGoals, setWithGoals] = useState(false);
  const [goalsA, setGoalsA] = useState(0);
  const [goalsB, setGoalsB] = useState(0);
  const [winner, setWinner] = useState<SessionTeam | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mit Torstand ergibt sich der Sieger aus den Toren
  const effectiveOutcome: Outcome | null = withGoals
    ? goalsA > goalsB
      ? 'a'
      : goalsA < goalsB
        ? 'b'
        : 'draw'
    : outcome;

  const canSave =
    mode === 'match'
      ? teamA !== null && teamB !== null && teamA.id !== teamB.id && effectiveOutcome !== null
      : winner !== null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'match') {
        await recordMatch({
          groupId,
          sessionId,
          matchNo,
          teamA: teamA!.id,
          teamB: teamB!.id,
          outcome: effectiveOutcome!,
          goals: withGoals ? { a: goalsA, b: goalsB } : null,
        });
        setCelebration({
          sessionId,
          winnerIdx:
            effectiveOutcome === 'a' ? teamA!.idx : effectiveOutcome === 'b' ? teamB!.idx : null,
        });
      } else {
        await recordTournamentWinner({ groupId, sessionId, matchNo, winnerTeam: winner!.id });
        setCelebration({ sessionId, winnerIdx: winner!.idx });
      }
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const pickA = (team: SessionTeam) => {
    setTeamA(team);
    if (teamB?.id === team.id) setTeamB(null);
  };
  const pickB = (team: SessionTeam) => {
    setTeamB(team);
    if (teamA?.id === team.id) setTeamA(null);
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Art des Ergebnisses */}
        <View style={styles.segment}>
          {(
            [
              ['match', 'Eine Partie'],
              ['tournament', 'Nur Turniersieger'],
            ] as const
          ).map(([value, label]) => {
            const selected = mode === value;
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setMode(value)}
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

        {mode === 'match' ? (
          <>
            {teams.length > 2 && (
              <>
                <View style={styles.section}>
                  <ThemedText type="smallBold">Erstes Team</ThemedText>
                  <View style={styles.chips}>
                    {teams.map((t) => (
                      <TeamChip
                        key={t.id}
                        idx={t.idx}
                        selected={teamA?.id === t.id}
                        onPress={() => pickA(t)}
                      />
                    ))}
                  </View>
                </View>
                <View style={styles.section}>
                  <ThemedText type="smallBold">Gegen</ThemedText>
                  <View style={styles.chips}>
                    {teams.map((t) => (
                      <TeamChip
                        key={t.id}
                        idx={t.idx}
                        selected={teamB?.id === t.id}
                        disabled={teamA?.id === t.id}
                        onPress={() => pickB(t)}
                      />
                    ))}
                  </View>
                </View>
              </>
            )}

            {teamA && teamB && (
              <>
                <ChanceBar
                  idxA={teamA.idx}
                  idxB={teamB.idx}
                  chanceA={winChance(strengthOf(teamA), strengthOf(teamB), scaleD)}
                />
                <View style={styles.section}>
                  <ThemedText type="smallBold">Wie ist es ausgegangen?</ThemedText>
                  <View style={styles.chips}>
                    <TeamChip
                      idx={teamA.idx}
                      label={`${teamColor(teamA.idx).name} gewinnt`}
                      selected={effectiveOutcome === 'a'}
                      disabled={withGoals}
                      onPress={() => setOutcome('a')}
                    />
                    <TeamChip
                      idx={teamB.idx}
                      label={`${teamColor(teamB.idx).name} gewinnt`}
                      selected={effectiveOutcome === 'b'}
                      disabled={withGoals}
                      onPress={() => setOutcome('b')}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: effectiveOutcome === 'draw' }}
                    disabled={withGoals}
                    onPress={() => setOutcome('draw')}
                    style={[
                      styles.draw,
                      {
                        borderColor: effectiveOutcome === 'draw' ? theme.primary : theme.border,
                        backgroundColor:
                          effectiveOutcome === 'draw' ? theme.backgroundSelected : theme.backgroundElement,
                        opacity: withGoals ? 0.35 : 1,
                      },
                    ]}>
                    <ThemedText style={styles.segmentText}>Unentschieden</ThemedText>
                  </Pressable>
                </View>

                <ThemedView type="backgroundElement" style={styles.goalsCard}>
                  <View style={styles.switchRow}>
                    <View style={styles.flex}>
                      <ThemedText style={styles.switchLabel}>Torstand eintragen</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        Freiwillig. Ein deutlicher Sieg verändert die Werte etwas stärker.
                      </ThemedText>
                    </View>
                    <Switch
                      value={withGoals}
                      onValueChange={setWithGoals}
                      trackColor={{ true: theme.primary, false: theme.border }}
                    />
                  </View>
                  {withGoals && (
                    <View style={styles.goalsRow}>
                      <GoalStepper idx={teamA.idx} value={goalsA} onChange={setGoalsA} />
                      <ThemedText style={styles.colon}>:</ThemedText>
                      <GoalStepper idx={teamB.idx} value={goalsB} onChange={setGoalsB} />
                    </View>
                  )}
                </ThemedView>
              </>
            )}
          </>
        ) : (
          <View style={styles.section}>
            <ThemedText type="smallBold">Welches Team hat das Turnier gewonnen?</ThemedText>
            <View style={styles.chips}>
              {teams.map((t) => (
                <TeamChip
                  key={t.id}
                  idx={t.idx}
                  selected={winner?.id === t.id}
                  onPress={() => setWinner(t)}
                />
              ))}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Zählt wie ein Sieg gegen jedes andere Team. Die übrigen Teams werden untereinander
              nicht gewertet.
            </ThemedText>
          </View>
        )}

        <ErrorText message={error} />
        <BigButton
          title={busy ? 'Wird gespeichert …' : 'Ergebnis speichern'}
          disabled={busy || !canSave}
          onPress={save}
        />
      </ScrollView>
    </ThemedView>
  );
}

function GoalStepper({
  idx,
  value,
  onChange,
}: {
  idx: number;
  value: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();
  const button = (label: string, delta: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Tore ${teamColor(idx).name} ${delta > 0 ? 'erhöhen' : 'verringern'}`}
      disabled={disabled}
      onPress={() => onChange(value + delta)}
      style={({ pressed }) => [
        styles.goalButton,
        { backgroundColor: theme.background, opacity: disabled ? 0.3 : pressed ? 0.6 : 1 },
      ]}>
      <ThemedText style={styles.goalSymbol}>{label}</ThemedText>
    </Pressable>
  );
  return (
    <View style={styles.goalStepper}>
      <ThemedText type="small" style={{ color: teamColor(idx).color, fontWeight: 700 }}>
        {teamColor(idx).name}
      </ThemedText>
      {button('+', 1, value >= 99)}
      <ThemedText style={styles.goalValue}>{value}</ThemedText>
      {button('−', -1, value <= 0)}
    </View>
  );
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
  flex: { flex: 1 },
  section: { gap: Spacing.two },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segmentButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  segmentText: { fontSize: 17, fontWeight: 700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  draw: {
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalsCard: { borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  switchLabel: { fontSize: 18, fontWeight: 700 },
  goalsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.four },
  colon: { fontSize: 40, lineHeight: 48, fontWeight: 700 },
  goalStepper: { alignItems: 'center', gap: Spacing.two },
  goalButton: {
    width: 64,
    height: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalSymbol: { fontSize: 28, lineHeight: 32, fontWeight: 700 },
  goalValue: { fontSize: 40, lineHeight: 48, fontWeight: 800 },
});
