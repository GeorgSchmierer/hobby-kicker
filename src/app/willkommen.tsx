import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { BigButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/supabase';

export default function WelcomeScreen() {
  const { setDisplayName, signOut } = useAuth();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await setDisplayName(name);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="subtitle">Schön, dass du da bist!</ThemedText>
        <ThemedText themeColor="textSecondary">
          Wie sollen dich die anderen in der Gruppe sehen? Ein Vorname oder Spitzname reicht.
        </ThemedText>
        <Field
          value={name}
          onChangeText={setName}
          placeholder="z. B. Georg"
          maxLength={30}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && save()}
        />
        <ErrorText message={error} />
        <BigButton title="Weiter" disabled={busy || !name.trim()} onPress={save} />
        <BigButton title="Abmelden" variant="secondary" disabled={busy} onPress={signOut} />
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
});
