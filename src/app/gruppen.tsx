import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { useGroup } from '@/lib/group';
import { errorMessage } from '@/lib/supabase';

/** Gruppe wählen, neu anlegen oder mit Einladungscode beitreten */
export default function GroupsScreen() {
  const theme = useTheme();
  const { signOut } = useAuth();
  const { groups, current, selectGroup, createGroup, joinGroup } = useGroup();
  const [newName, setNewName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ where: 'create' | 'join'; message: string } | null>(null);

  const hasGroups = (groups?.length ?? 0) > 0;

  const goToApp = () => {
    // Ohne Gruppe war dies der einzige Bildschirm – dann leitet das Grundgerüst selbst weiter
    if (!hasGroups) return;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const run = async (where: 'create' | 'join', action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      setNewName('');
      setCode('');
      goToApp();
    } catch (e) {
      setError({ where, message: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {hasGroups ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Deine Gruppen</ThemedText>
            {groups!.map((g) => {
              const selected = g.id === current?.id;
              return (
                <Pressable
                  key={g.id}
                  accessibilityRole="button"
                  onPress={() => {
                    selectGroup(g.id);
                    goToApp();
                  }}
                  style={[
                    styles.groupRow,
                    {
                      backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                      borderColor: selected ? theme.primary : 'transparent',
                    },
                  ]}>
                  <ThemedText style={[styles.groupName, styles.flex]}>{g.name}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {g.role === 'admin' ? 'Admin' : 'Mitglied'}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.section}>
            <ThemedText type="subtitle">Deine Kicker-Runde</ThemedText>
            <ThemedText themeColor="textSecondary">
              Tritt der Gruppe deiner Freunde mit dem Einladungscode bei – oder leg selbst eine neue
              Gruppe an. Dann bist du dort Admin.
            </ThemedText>
          </View>
        )}

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Mit Einladungscode beitreten</ThemedText>
          <Field
            value={code}
            onChangeText={(text) => setCode(text.toUpperCase())}
            placeholder="z. B. K7QM4XPA"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={12}
            style={styles.codeInput}
          />
          {error?.where === 'join' && <ErrorText message={error.message} />}
          <BigButton
            title="Beitreten"
            disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8}
            onPress={() => run('join', () => joinGroup(code))}
          />
        </ThemedView>

        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText style={styles.cardTitle}>Neue Gruppe anlegen</ThemedText>
          <Field
            value={newName}
            onChangeText={setNewName}
            placeholder="z. B. Montagskick"
            maxLength={40}
          />
          {error?.where === 'create' && <ErrorText message={error.message} />}
          <BigButton
            title="Gruppe anlegen"
            variant="secondary"
            style={{ borderWidth: 1, borderColor: theme.border }}
            disabled={busy || !newName.trim()}
            onPress={() => run('create', () => createGroup(newName))}
          />
        </ThemedView>

        {!hasGroups && <BigButton title="Abmelden" variant="secondary" onPress={signOut} />}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.four,
  },
  section: { gap: Spacing.two },
  flex: { flex: 1 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 60,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    borderWidth: 2,
  },
  groupName: { fontSize: 18, fontWeight: 700 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.three },
  cardTitle: { fontSize: 18, fontWeight: 700 },
  codeInput: { letterSpacing: 4, fontSize: 22 },
});
