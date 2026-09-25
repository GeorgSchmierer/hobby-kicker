import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup } from '@/lib/group';
import { GUEST_DEFAULT_LEVEL, GUEST_LEVELS } from '@/lib/params';
import { useStore } from '@/lib/store';
import { errorMessage } from '@/lib/supabase';

/**
 * Gast in 5 Sekunden (TODO A6): Name + schwach/mittel/stark. Der Gast ist danach als
 * anwesend markiert. Mit ?spieltag=… (aus „Nachzügler“) wird nur angelegt.
 */
export default function GuestScreen() {
  const theme = useTheme();
  const { spieltag } = useLocalSearchParams<{ spieltag?: string }>();
  const { current, players, addGuest } = useGroup();
  const store = useStore();
  const [name, setName] = useState('');
  const [level, setLevel] = useState<string>(GUEST_DEFAULT_LEVEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const same = players.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());
  const taken = !!same && !same.is_guest;
  const returning = !!same && same.is_guest;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const rating = GUEST_LEVELS.find((l) => l.key === level)!.rating;
      const id = await addGuest(trimmed, rating);
      if (!spieltag && current) store.setPresent(current.id, id, true);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.field}>
          <ThemedText type="smallBold">Name</ThemedText>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="z. B. Pauls Kumpel"
            autoFocus
            maxLength={30}
            returnKeyType="done"
          />
          {taken && (
            <ThemedText type="small" style={{ color: theme.danger }}>
              So heißt schon ein fester Spieler.
            </ThemedText>
          )}
          {returning && (
            <ThemedText type="small" themeColor="textSecondary">
              {same!.name} war schon einmal Gast – seine Werte von damals werden übernommen.
            </ThemedText>
          )}
        </View>

        {!returning && (
          <View style={styles.field}>
            <ThemedText type="smallBold">Wie stark ungefähr?</ThemedText>
            <View style={styles.levels}>
              {GUEST_LEVELS.map((l) => {
                const selected = level === l.key;
                return (
                  <Pressable
                    key={l.key}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setLevel(l.key)}
                    style={[
                      styles.level,
                      { backgroundColor: selected ? theme.primary : theme.backgroundElement },
                    ]}>
                    <ThemedText
                      style={[styles.levelText, { color: selected ? theme.onPrimary : theme.text }]}>
                      {l.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <ErrorText message={error} />
        <BigButton
          title={spieltag ? 'Gast anlegen' : 'Gast hinzufügen (ist da)'}
          disabled={busy || !trimmed || taken}
          onPress={save}
        />
        <ThemedText type="small" themeColor="textSecondary">
          Gäste werden fair eingeteilt und ihre Werte passen sich an. In Tabelle und Statistik
          erscheinen sie nicht. Nach dem Spieltag kann ein Admin sie als feste Spieler übernehmen.
        </ThemedText>
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
    paddingBottom: Spacing.six,
  },
  field: { gap: Spacing.two },
  levels: { flexDirection: 'row', gap: Spacing.two },
  level: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelText: { fontSize: 18, fontWeight: 700 },
});
