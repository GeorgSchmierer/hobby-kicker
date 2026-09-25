import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton, Chip } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { deleteSchedule, loadSchedule, saveSchedule, setEventCancelled, type ScheduleInfo } from '@/lib/events';
import { useGroup } from '@/lib/group';
import { berlinToday, formatEventDate, formatTime, parseTime, upcomingDates, WEEKDAYS } from '@/lib/schedule';
import { errorMessage } from '@/lib/supabase';

/** Wie viele kommende Termine zum Absagen angezeigt werden */
const UPCOMING_SHOWN = 8;

/** Fester Termin der Gruppe: festlegen, ändern, einzelne Termine absagen (nur Admins) */
export default function ScheduleScreen() {
  const { current, isAdmin } = useGroup();
  const groupId = current!.id;
  const [info, setInfo] = useState<{ groupId: string; value: ScheduleInfo | null } | null>(null);

  const reload = useCallback(async () => {
    setInfo({ groupId, value: await loadSchedule(groupId) });
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
    }, [reload])
  );

  if (!isAdmin) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.missing}>Den Termin festlegen können nur Admins.</ThemedText>
      </ThemedView>
    );
  }
  if (!info || info.groupId !== groupId) return <ThemedView style={styles.screen} />;
  // key: Formular startet neu, wenn die Serie gespeichert wurde
  return (
    <ScheduleForm
      key={info.value ? `${info.value.schedule.weekday}-${info.value.schedule.start_time}` : 'neu'}
      groupId={groupId}
      info={info.value}
      reload={reload}
    />
  );
}

function ScheduleForm({
  groupId,
  info,
  reload,
}: {
  groupId: string;
  info: ScheduleInfo | null;
  reload: () => Promise<void>;
}) {
  const theme = useTheme();
  const existing = info?.schedule;
  const [weekday, setWeekday] = useState(existing?.weekday ?? 2);
  const [time, setTime] = useState(existing ? formatTime(existing.start_time) : '19:00');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [max, setMax] = useState(existing?.max_players ? String(existing.max_players) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const parsedTime = parseTime(time);
  const parsedMax = max.trim() === '' ? null : Number(max);
  const maxValid = parsedMax === null || (Number.isInteger(parsedMax) && parsedMax >= 2 && parsedMax <= 99);
  const changed =
    !existing ||
    existing.weekday !== weekday ||
    formatTime(existing.start_time) !== parsedTime ||
    (existing.location ?? '') !== location.trim() ||
    existing.max_players !== parsedMax;

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (existing && existing.weekday !== weekday) {
      const ok = await confirmAction(
        'Wochentag ändern?',
        'Bisherige Zu- und Absagen für kommende Termine verfallen.',
        'Ändern'
      );
      if (!ok) return;
    }
    run(async () => {
      await saveSchedule(groupId, {
        weekday,
        start_time: parsedTime!,
        location: location.trim() || null,
        max_players: parsedMax,
      });
      await reload();
      setSaved(true);
    });
  };

  const remove = async () => {
    const ok = await confirmAction(
      'Festen Termin löschen?',
      'Die Serie und alle Zusagen für kommende Termine werden gelöscht. Vergangene Spieltage bleiben.',
      'Löschen'
    );
    if (ok)
      run(async () => {
        await deleteSchedule(groupId);
        router.back();
      });
  };

  const toggleCancelled = (date: string, cancelled: boolean) =>
    run(async () => {
      await setEventCancelled(groupId, date, cancelled);
      await reload();
    });

  const dates = existing ? upcomingDates(existing.weekday, berlinToday(), UPCOMING_SHOWN) : [];

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="smallBold">Wochentag</ThemedText>
        <View style={styles.chips}>
          {WEEKDAYS.map((name, i) => (
            <Chip key={name} title={name} selected={weekday === i + 1} onPress={() => setWeekday(i + 1)} />
          ))}
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">Uhrzeit</ThemedText>
          <Field value={time} onChangeText={setTime} placeholder="19:00" maxLength={5} inputMode="numeric" />
          {!parsedTime && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              Bitte so eingeben: 19:00
            </ThemedText>
          )}
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">Ort (optional)</ThemedText>
          <Field value={location} onChangeText={setLocation} placeholder="z. B. Soccerhalle Nord" maxLength={80} />
        </View>

        <View style={styles.field}>
          <ThemedText type="smallBold">Höchstens so viele Spieler (optional)</ThemedText>
          <Field value={max} onChangeText={setMax} placeholder="z. B. 14" maxLength={2} inputMode="numeric" />
          <ThemedText type="small" themeColor="textSecondary">
            {maxValid
              ? 'Wer später zusagt, kommt auf die Warteliste und rückt nach, wenn jemand absagt.'
              : 'Bitte eine Zahl von 2 bis 99 eingeben oder leer lassen.'}
          </ThemedText>
        </View>

        <ErrorText message={error} />
        {saved && <ThemedText style={{ color: theme.primary, fontWeight: 700 }}>Gespeichert ✓</ThemedText>}
        <BigButton
          title={existing ? 'Änderungen speichern' : 'Termin festlegen'}
          disabled={busy || !parsedTime || !maxValid || !changed}
          onPress={save}
        />

        {existing && (
          <>
            <ThemedText type="subtitle" style={styles.section}>
              Kommende Termine
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Fällt ein Termin aus (Feiertag, Halle belegt …), hier absagen. Die Serie bleibt.
            </ThemedText>
            {dates.map((date) => {
              const cancelled = info!.cancelled.includes(date);
              return (
                <View key={date} style={[styles.dateRow, { borderColor: theme.border }]}>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.flex}
                    onPress={() => router.push({ pathname: '/termin/[date]', params: { date } })}>
                    <ThemedText
                      style={[
                        styles.dateText,
                        cancelled && { color: theme.danger, textDecorationLine: 'line-through' },
                      ]}>
                      {formatEventDate(date)}
                    </ThemedText>
                    {cancelled && (
                      <ThemedText type="small" style={{ color: theme.danger }}>
                        fällt aus
                      </ThemedText>
                    )}
                  </Pressable>
                  <Chip
                    title={cancelled ? 'Findet doch statt' : 'Fällt aus'}
                    selected={false}
                    disabled={busy}
                    onPress={() => toggleCancelled(date, !cancelled)}
                  />
                </View>
              );
            })}

            <BigButton
              title="Festen Termin löschen"
              variant="danger"
              disabled={busy}
              onPress={remove}
              style={styles.section}
            />
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
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  missing: { padding: Spacing.four, textAlign: 'center' },
  flex: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  field: { gap: Spacing.two },
  section: { marginTop: Spacing.three },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  dateText: { fontSize: 18, fontWeight: 700 },
});
