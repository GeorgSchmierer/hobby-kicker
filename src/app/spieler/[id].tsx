import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { BigButton, RatingStepper } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { RATING_LIMITS } from '@/lib/params';
import { formatRating, useStore } from '@/lib/store';

/** Zurück zur Spielerliste – auch wenn die Seite direkt aufgerufen wurde (Web) */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/spieler');
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { players, loaded } = useStore();
  const existing = players.find((p) => p.id === id);

  if (!loaded) return <ThemedView style={styles.screen} />;
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
  const { players, savePlayer, deletePlayer } = useStore();
  const existing = players.find((p) => p.id === playerId);

  const [name, setName] = useState(existing?.name ?? '');
  const [defense, setDefense] = useState(existing?.defense ?? RATING_LIMITS.default);
  const [attack, setAttack] = useState(existing?.attack ?? RATING_LIMITS.default);
  const [active, setActive] = useState(existing?.active ?? true);

  const trimmed = name.trim();
  const duplicate = players.some(
    (p) => p.id !== playerId && p.name.trim().toLowerCase() === trimmed.toLowerCase()
  );

  const save = () => {
    savePlayer({ id: playerId, name: trimmed, defense, attack, active });
    close();
  };

  const remove = () => {
    const question = `„${existing?.name}“ wirklich löschen?`;
    const doDelete = () => {
      deletePlayer(playerId!);
      close();
    };
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
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="z. B. Tommi"
            placeholderTextColor={theme.textSecondary}
            autoFocus={!existing}
            maxLength={30}
            returnKeyType="done"
            style={[
              styles.input,
              { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}
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

        <BigButton title="Speichern" disabled={!trimmed || duplicate} onPress={save} />
        {existing && <BigButton title="Spieler löschen" variant="danger" onPress={remove} />}
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
  input: {
    fontSize: 20,
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  switchText: { flex: 1 },
  switchLabel: { fontSize: 20, fontWeight: 700 },
});
