import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton, Chip, SmallButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { TeamChip, TeamDot, teamColor } from '@/components/team';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { useGroup, type Player } from '@/lib/group';
import { suggestPlacement, type Placement } from '@/lib/late';
import { formatRating } from '@/lib/ratings';
import { addLatePlayer, loadSession, removeSessionPlayer, type SessionDetail } from '@/lib/sessions';
import { errorMessage } from '@/lib/supabase';
import { splitCost, teamStats } from '@/lib/teams';

/** Nachzügler: Spieler während des Spieltags dazunehmen – die App schlägt das fairste Team vor */
export default function LatePlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<SessionDetail | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setDetail(await loadSession(id));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  if (detail === undefined) {
    return (
      <ThemedView style={[styles.screen, styles.center]}>
        <ActivityIndicator />
        <ErrorText message={error} />
      </ThemedView>
    );
  }
  if (detail === null) {
    return (
      <ThemedView style={[styles.screen, styles.center]}>
        <ThemedText>Diesen Spieltag gibt es nicht (mehr).</ThemedText>
      </ThemedView>
    );
  }
  return <LateForm detail={detail} reload={reload} />;
}

function LateForm({ detail, reload }: { detail: SessionDetail; reload: () => Promise<void> }) {
  const theme = useTheme();
  const { players } = useGroup();
  const [selected, setSelected] = useState<Player | null>(null);
  const [manualTeam, setManualTeam] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = new Map(players.map((p) => [p.id, p]));
  const teams = detail.teams; // nach Farbe sortiert
  const members = teams.map((t) =>
    t.playerIds.map((pid) => lookup.get(pid)).filter((p): p is Player => p !== undefined)
  );
  const inSession = new Set(teams.flatMap((t) => t.playerIds));
  const available = players
    .filter((p) => p.active && !inSession.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  // Wer heute schon eine Partie gespielt hat, kann nicht mehr herausgenommen werden
  const playedToday = new Set(detail.results.flatMap((r) => r.changes.map((c) => c.player_id)));
  const removable = teams.flatMap((t, i) =>
    t.playerIds.length > 1
      ? members[i].filter((p) => !playedToday.has(p.id)).map((p) => ({ player: p, idx: t.idx }))
      : []
  );

  const suggestion = selected ? suggestPlacement(members, selected) : null;

  const run = async (action: () => Promise<void>, back = true) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      if (back) router.back();
      else await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const accept = (placement: Placement) =>
    run(() =>
      addLatePlayer({
        sessionId: detail.id,
        playerId: selected!.id,
        teamId: teams[placement.team].id,
        move: placement.move
          ? { playerId: placement.move.playerId, toTeamId: teams[placement.move.to].id }
          : null,
      })
    );

  const remove = async (player: Player) => {
    const ok = await confirmAction(
      `${player.name} aus dem Spieltag nehmen?`,
      'Geht nur, solange er heute noch nicht mitgespielt hat.',
      'Herausnehmen'
    );
    if (ok) run(() => removeSessionPlayer(detail.id, player.id), false);
  };

  /** Teamstärken nach einer Platzierung, z. B. „Rot 24,5 · Blau 24,0“ */
  const strengthsAfter = (ids: string[][]) =>
    ids
      .map((teamIds, i) => {
        const list = teamIds
          .map((pid) => (pid === selected?.id ? selected : lookup.get(pid)))
          .filter((p): p is Player => !!p);
        return `${teamColor(teams[i].idx).name} ${formatRating(teamStats(list).total)} (${list.length})`;
      })
      .join(' · ');

  const manualPlacement: Placement | null =
    selected && manualTeam !== null
      ? (() => {
          const next = members.map((m, i) => (i === manualTeam ? [...m, selected] : m));
          return {
            team: manualTeam,
            move: null,
            cost: splitCost(next),
            teams: next.map((m) => m.map((p) => p.id)),
          };
        })()
      : null;

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.row}>
          <ThemedText type="smallBold" style={styles.flex}>
            Wer kommt dazu?
          </ThemedText>
          <SmallButton
            title="+ Gast"
            onPress={() => router.push({ pathname: '/gast', params: { spieltag: detail.id } })}
          />
        </View>
        {available.length === 0 ? (
          <ThemedText themeColor="textSecondary">
            Alle aktiven Spieler sind schon in einem Team.
          </ThemedText>
        ) : (
          <View style={styles.chips}>
            {available.map((p) => (
              <Chip
                key={p.id}
                title={p.is_guest ? `${p.name} (Gast)` : p.name}
                selected={selected?.id === p.id}
                onPress={() => {
                  setSelected(selected?.id === p.id ? null : p);
                  setManualTeam(null);
                }}
              />
            ))}
          </View>
        )}

        {selected && suggestion && (
          <>
            <Option
              title={`Vorschlag: ${selected.name} kommt zu`}
              idx={teams[suggestion.direct.team].idx}
              details={strengthsAfter(suggestion.direct.teams)}
              primary={!suggestion.swap}
              busy={busy}
              onPress={() => accept(suggestion.direct)}
            />
            {suggestion.swap && suggestion.swap.move && (
              <Option
                title={`Noch fairer mit Tausch: ${selected.name} kommt zu`}
                idx={teams[suggestion.swap.team].idx}
                extra={`${lookup.get(suggestion.swap.move.playerId)?.name ?? '?'} wechselt dafür zu ${
                  teamColor(teams[suggestion.swap.move.to].idx).name
                }`}
                details={strengthsAfter(suggestion.swap.teams)}
                primary
                busy={busy}
                onPress={() => accept(suggestion.swap!)}
              />
            )}

            <View style={styles.section}>
              <ThemedText type="smallBold">Oder selbst wählen</ThemedText>
              <View style={styles.chips}>
                {teams.map((t, i) => (
                  <TeamChip
                    key={t.id}
                    idx={t.idx}
                    selected={manualTeam === i}
                    onPress={() => setManualTeam(i)}
                  />
                ))}
              </View>
              {manualPlacement && (
                <>
                  <ThemedText type="small" themeColor="textSecondary">
                    Danach: {strengthsAfter(manualPlacement.teams)}
                  </ThemedText>
                  <BigButton
                    title={`Zu ${teamColor(teams[manualTeam!].idx).name} hinzufügen`}
                    variant="secondary"
                    style={[styles.outlined, { borderColor: theme.border }]}
                    disabled={busy}
                    onPress={() => accept(manualPlacement)}
                  />
                </>
              )}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Die Wertung zählt für {selected.name} erst ab der nächsten Partie. Bei einem Tausch
              zählen die bisherigen Partien für das alte Team.
            </ThemedText>
          </>
        )}

        <ErrorText message={error} />

        {removable.length > 0 && (
          <View style={[styles.section, styles.removeSection, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Versehentlich dabei?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Wer heute noch nicht mitgespielt hat, kann wieder herausgenommen werden.
            </ThemedText>
            {removable.map(({ player, idx }) => (
              <View key={player.id} style={styles.row}>
                <TeamDot idx={idx} />
                <ThemedText style={styles.flex}>{player.name}</ThemedText>
                <SmallButton title="Herausnehmen" danger disabled={busy} onPress={() => remove(player)} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function Option({
  title,
  idx,
  extra,
  details,
  primary,
  busy,
  onPress,
}: {
  title: string;
  idx: number;
  extra?: string;
  details: string;
  primary: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: primary ? theme.primary : theme.border,
          opacity: busy ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}>
      <View style={styles.row}>
        <ThemedText style={styles.optionTitle}>{title}</ThemedText>
        <TeamDot idx={idx} />
        <ThemedText style={[styles.optionTitle, { color: teamColor(idx).color }]}>
          {teamColor(idx).name}
        </ThemedText>
      </View>
      {extra && <ThemedText style={styles.optionExtra}>↔ {extra}</ThemedText>}
      <ThemedText type="small" themeColor="textSecondary">
        Danach: {details}
      </ThemedText>
      <ThemedText style={{ color: theme.primary, fontWeight: 700 }}>So machen ›</ThemedText>
    </Pressable>
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
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  flex: { flex: 1 },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  outlined: { borderWidth: 1 },
  option: { borderRadius: 14, borderWidth: 2, padding: Spacing.three, gap: Spacing.one },
  optionTitle: { fontSize: 17, fontWeight: 700 },
  optionExtra: { fontSize: 16, fontWeight: 600 },
  removeSection: { marginTop: Spacing.four, paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth },
});
