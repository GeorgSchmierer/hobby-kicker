import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { BigButton, RatingStepper } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup } from '@/lib/group';
import { RATING_LIMITS } from '@/lib/params';
import { formatRating } from '@/lib/ratings';
import { errorMessage } from '@/lib/supabase';

/** Zurück zur Spielerliste – auch wenn die Seite direkt aufgerufen wurde (Web) */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/spieler');
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { players, playersLoaded, isAdmin } = useGroup();
  const existing = players.find((p) => p.id === id);

  if (!playersLoaded) return <ThemedView style={styles.screen} />;
  if (!isAdmin) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.missing}>Spieler bearbeiten können nur Admins.</ThemedText>
      </ThemedView>
    );
  }
  if (id !== 'neu' && !existing) {
    return (
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.missing}>Diesen Spieler gibt es nicht mehr.</ThemedText>
      </ThemedView>
    );
  }
  // key sorgt dafür, dass das Formular beim Wechsel des Spielers neu startet
  return <PlayerForm key={id} playerId={existing?.id} />;
}

function PlayerForm({ playerId }: { playerId?: string }) {
  const theme = useTheme();
  const { players, savePlayer, deletePlayer } = useGroup();
  const existing = players.find((p) => p.id === playerId);

  const [name, setName] = useState(existing?.name ?? '');
  const [defense, setDefense] = useState(existing?.defense ?? RATING_LIMITS.default);
  const [attack, setAttack] = useState(existing?.attack ?? RATING_LIMITS.default);
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const duplicate = players.some(
    (p) => p.id !== playerId && p.name.trim().toLowerCase() === trimmed.toLowerCase()
  );

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const save = () =>
    run(() => savePlayer({ id: playerId, name: trimmed, defense, attack, active }));

  const remove = () => {
    const question = `„${existing?.name}“ wirklich löschen?`;
    const doDelete = () => run(() => deletePlayer(playerId!));
    if (Platform.OS === 'web') {
      if (window.confirm(question)) doDelete();
    } else {
      Alert.alert(question, 'Das kann nicht rückgängig gemacht werden.', [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Löschen', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: existing ? existing.name : 'Neuer Spieler' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <ThemedText type="smallBold">Name oder Spitzname</ThemedText>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="z. B. Tommi"
            autoFocus={!existing}
            maxLength={30}
            returnKeyType="done"
          />
          {duplicate && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              Diesen Namen gibt es schon.
            </ThemedText>
          )}
        </View>

        <RatingStepper label="Abwehr" value={defense} onChange={setDefense} />
        <RatingStepper label="Angriff" value={attack} onChange={setAttack} />
        <ThemedText themeColor="textSecondary">
          Gesamtstärke: {formatRating((defense + attack) / 2)} (von 1 bis 11)
        </ThemedText>

        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <ThemedText style={styles.switchLabel}>Aktiv</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Inaktive Spieler erscheinen nicht beim Spieltag.
            </ThemedText>
          </View>
          <Switch
            value={active}
            onValueChange={setActive}
            trackColor={{ true: theme.primary, false: theme.border }}
          />
        </View>

        <ErrorText message={error} />
        <BigButton
          title={busy ? 'Wird gespeichert …' : 'Speichern'}
          disabled={busy || !trimmed || duplicate}
          onPress={save}
        />
        {existing && (
          <BigButton title="Spieler löschen" variant="danger" disabled={busy} onPress={remove} />
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
    gap: Spacing.four,
  },
  missing: { textAlign: 'center', marginTop: Spacing.five },
  field: { gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 20, fontWeight: 700 },
});
