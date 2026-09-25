import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BigButton, SmallButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction } from '@/lib/confirm';
import { useGroup } from '@/lib/group';
import { berlinToday } from '@/lib/schedule';
import {
  addSeason,
  deleteSeason,
  formatGermanDate,
  loadSeasons,
  parseGermanDate,
  type Season,
} from '@/lib/standings';
import { errorMessage } from '@/lib/supabase';

/** Saisons festlegen (TODO C2): Name, Beginn, Ende – nur Admins */
export default function SeasonsScreen() {
  const theme = useTheme();
  const { current, isAdmin } = useGroup();
  const groupId = current!.id;
  const year = berlinToday().slice(0, 4);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [name, setName] = useState(`Saison ${year}`);
  const [from, setFrom] = useState(`01.01.${year}`);
  const [to, setTo] = useState(`31.12.${year}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setSeasons(await loadSeasons(groupId));
  }, [groupId]);

  useFocusEffect(
    useCallback(() => {
      reload().catch((e) => setError(errorMessage(e)));
    }, [reload])
  );

  const start = parseGermanDate(from);
  const end = parseGermanDate(to);
  const valid = !!name.trim() && !!start && !!end && start <= end;

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

  const remove = async (s: Season) => {
    const ok = await confirmAction(
      `„${s.name}“ löschen?`,
      'Nur die Saison wird gelöscht – alle Spiele und Ergebnisse bleiben erhalten.',
      'Löschen'
    );
    if (ok) run(() => deleteSeason(s.id));
  };

  if (!isAdmin) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.missing}>Saisons festlegen können nur Admins.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText themeColor="textSecondary">
          Solange keine Saison festgelegt ist, zeigt die Tabelle die Kalenderjahre. Mit eigenen
          Saisons bestimmst du Beginn und Ende selbst (z. B. nach der Sommerpause).
        </ThemedText>

        {seasons.map((s) => (
          <View key={s.id} style={[styles.row, { borderColor: theme.border }]}>
            <View style={styles.flex}>
              <ThemedText style={styles.name}>{s.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {formatGermanDate(s.starts_on)} – {formatGermanDate(s.ends_on)}
              </ThemedText>
            </View>
            <SmallButton title="Löschen" danger disabled={busy} onPress={() => remove(s)} />
          </View>
        ))}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Neue Saison</ThemedText>
          <ThemedText type="smallBold">Name</ThemedText>
          <Field value={name} onChangeText={setName} maxLength={40} />
          <View style={styles.dates}>
            <View style={styles.flex}>
              <ThemedText type="smallBold">Beginn</ThemedText>
              <Field value={from} onChangeText={setFrom} placeholder="TT.MM.JJJJ" maxLength={10} />
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold">Ende</ThemedText>
              <Field value={to} onChangeText={setTo} placeholder="TT.MM.JJJJ" maxLength={10} />
            </View>
          </View>
          {(!start || !end || start > end) && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              Bitte Datum so eingeben: 01.08.2026 – und das Ende nach dem Beginn.
            </ThemedText>
          )}
          <ErrorText message={error} />
          <BigButton
            title="Saison anlegen"
            disabled={busy || !valid}
            onPress={() =>
              run(() => addSeason(groupId, { name: name.trim(), starts_on: start!, ends_on: end! }))
            }
          />
        </ThemedView>
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
  flex: { flex: 1, gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  name: { fontSize: 17, fontWeight: 700 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  cardTitle: { fontSize: 18, fontWeight: 700 },
  dates: { flexDirection: 'row', gap: Spacing.two },
});
