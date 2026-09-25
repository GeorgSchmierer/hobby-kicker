import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BigButton, SmallButton } from '@/components/controls';
import { AnswerButtons } from '@/components/event-card';
import { ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { confirmAction } from '@/lib/confirm';
import { loadRsvps, loadSchedule, setEventCancelled, setRsvp, type ScheduleInfo } from '@/lib/events';
import { useGroup, type Player } from '@/lib/group';
import {
  addDays,
  berlinToday,
  formatEventDate,
  formatTime,
  isoWeekday,
  rsvpOverview,
  type Rsvp,
} from '@/lib/schedule';
import { useStore } from '@/lib/store';
import { errorMessage } from '@/lib/supabase';

type Loaded = { key: string; info: ScheduleInfo | null; rsvps: Rsvp[] };

/** Ein Termin: wer kommt, wer nicht, wer fehlt noch – zusagen auch für andere */
export default function EventScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const theme = useTheme();
  const { current, isAdmin, players } = useGroup();
  const store = useStore();
  const myId = useAuth().session?.user.id;
  const groupId = current!.id;
  const key = `${groupId}/${date}`;

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [info, rsvps] = await Promise.all([loadSchedule(groupId), loadRsvps(groupId, date)]);
    setLoaded({ key, info, rsvps });
  }, [groupId, date, key]);

  useFocusEffect(
    useCallback(() => {
      reload().catch((e) => setError(errorMessage(e)));
    }, [reload])
  );

  if (!loaded || loaded.key !== key) return <ThemedView style={styles.screen} />;
  const { info, rsvps } = loaded;
  const today = berlinToday();
  if (!info || isoWeekday(date) !== info.schedule.weekday || date < today) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.missing}>An diesem Tag ist kein Termin.</ThemedText>
      </ThemedView>
    );
  }

  const { schedule } = info;
  const cancelled = info.cancelled.includes(date);
  const active = players.filter((p) => p.active && !p.is_guest).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const byId = new Map(active.map((p) => [p.id, p]));
  const overview = rsvpOverview(
    active.map((p) => p.id),
    rsvps,
    schedule.max_players
  );
  const answerOf = (id: string) => rsvps.find((r) => r.player_id === id)?.attending ?? null;
  const myPlayer = active.find((p) => !!myId && p.user_id === myId);
  const canAnswerFor = (p: Player) => isAdmin || !p.user_id || p.user_id === myId;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const answer = (playerId: string, attending: boolean | null) =>
    run(() => setRsvp(groupId, date, playerId, attending));

  const toggleCancelled = async () => {
    if (!cancelled) {
      const ok = await confirmAction(
        `${formatEventDate(date)} absagen?`,
        'Der Termin fällt aus. Die Serie bleibt, und du kannst ihn wieder stattfinden lassen.',
        'Absagen'
      );
      if (!ok) return;
    }
    run(() => setEventCancelled(groupId, date, !cancelled));
  };

  const takeOver = () => {
    store.prefillFromRsvps(groupId, date, overview.attending);
    router.navigate('/');
  };

  const section = (title: string, ids: string[], note?: (id: string, i: number) => string) =>
    ids.length > 0 && (
      <View style={styles.sectionBox}>
        <ThemedText type="smallBold">
          {title} ({ids.length})
        </ThemedText>
        {ids.map((id, i) => {
          const p = byId.get(id)!;
          return (
            <View key={id} style={[styles.row, { borderColor: theme.border }]}>
              <View style={styles.flex}>
                <ThemedText style={styles.name}>
                  {p.name}
                  {p.user_id === myId ? ' (du)' : ''}
                </ThemedText>
                {note && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {note(id, i)}
                  </ThemedText>
                )}
              </View>
              {!cancelled &&
                (canAnswerFor(p) ? (
                  <AnswerButtons
                    compact
                    answer={answerOf(id)}
                    disabled={busy}
                    onAnswer={(a) => answer(id, a)}
                  />
                ) : (
                  <ThemedText type="small" themeColor="textSecondary">
                    antwortet selbst
                  </ThemedText>
                ))}
            </View>
          );
        })}
      </View>
    );

  const previous = addDays(date, -7);

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: formatEventDate(date) }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.navRow}>
          {previous >= today ? (
            <SmallButton
              title="‹ Woche davor"
              onPress={() => router.setParams({ date: previous })}
            />
          ) : (
            <View />
          )}
          <SmallButton title="Woche danach ›" onPress={() => router.setParams({ date: addDays(date, 7) })} />
        </View>

        <ThemedText type="subtitle">
          {formatEventDate(date)} · {formatTime(schedule.start_time)}
        </ThemedText>
        {schedule.location && <ThemedText themeColor="textSecondary">📍 {schedule.location}</ThemedText>}

        {cancelled ? (
          <ThemedText style={[styles.banner, { color: theme.danger, borderColor: theme.danger }]}>
            Dieser Termin fällt aus.
          </ThemedText>
        ) : (
          <ThemedText themeColor="textSecondary">
            {overview.attending.length}
            {schedule.max_players ? ` von ${schedule.max_players}` : ''} dabei
            {overview.waitlist.length > 0 ? ` · ${overview.waitlist.length} auf der Warteliste` : ''}
            {` · ${overview.declined.length} können nicht · ${overview.open.length} offen`}
          </ThemedText>
        )}

        <ErrorText message={error} />

        {!cancelled && myPlayer && (
          <View style={styles.sectionBox}>
            <ThemedText type="smallBold">Und du?</ThemedText>
            <AnswerButtons
              answer={answerOf(myPlayer.id)}
              disabled={busy}
              onAnswer={(a) => answer(myPlayer.id, a)}
            />
          </View>
        )}

        {!cancelled && date === today && overview.attending.length > 0 && (
          <BigButton title="📋 Zusagen als Anwesenheit übernehmen" onPress={takeOver} />
        )}

        {!cancelled && (
          <ThemedText type="small" themeColor="textSecondary">
            Du kannst auch für Mitspieler ohne App antworten: einfach ✓ oder ✗ antippen.
          </ThemedText>
        )}

        {section('Dabei', overview.attending)}
        {section('Warteliste', overview.waitlist, (_, i) => `Platz ${i + 1} – rückt nach, wenn jemand absagt`)}
        {section('Noch offen', overview.open)}
        {section('Kann nicht', overview.declined)}

        {isAdmin && (
          <BigButton
            title={cancelled ? 'Termin findet doch statt' : 'Diesen Termin absagen'}
            variant={cancelled ? 'primary' : 'danger'}
            disabled={busy}
            onPress={toggleCancelled}
            style={styles.spaced}
          />
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
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  missing: { padding: Spacing.four, textAlign: 'center' },
  flex: { flex: 1 },
  navRow: { flexDirection: 'row', justifyContent: 'space-between' },
  banner: {
    fontWeight: 700,
    fontSize: 18,
    borderWidth: 2,
    borderRadius: 12,
    padding: Spacing.three,
    textAlign: 'center',
  },
  sectionBox: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 17, fontWeight: 700 },
  spaced: { marginTop: Spacing.three },
});
