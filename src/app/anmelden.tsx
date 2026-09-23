import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/supabase';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const { sendCode, verifyCode } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await action();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const requestCode = () =>
    run(async () => {
      await sendCode(email);
      setCodeSent(true);
      setCode('');
    });

  const resendCode = () =>
    run(async () => {
      await sendCode(email);
      setInfo('Neuer Code ist unterwegs.');
    });

  const submitCode = () => run(() => verifyCode(email, code));

  const digits = code.replace(/\D/g, '');

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.screen}>
        <KeyboardAvoidingView
          style={styles.screen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <ThemedText style={styles.logo}>⚽</ThemedText>
            <ThemedText type="subtitle" style={styles.center}>
              Hobby-Kicker
            </ThemedText>

            {!codeSent ? (
              <>
                <ThemedText themeColor="textSecondary" style={styles.center}>
                  Gib deine E-Mail-Adresse ein. Du bekommst einen Code zum Anmelden – ganz ohne
                  Passwort.
                </ThemedText>
                <Field
                  value={email}
                  onChangeText={setEmail}
                  placeholder="name@beispiel.de"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  inputMode="email"
                  keyboardType="email-address"
                  returnKeyType="send"
                  onSubmitEditing={() => EMAIL_PATTERN.test(email.trim()) && requestCode()}
                />
                <ErrorText message={error} />
                <BigButton
                  title={busy ? 'Wird geschickt …' : 'Code schicken'}
                  disabled={busy || !EMAIL_PATTERN.test(email.trim())}
                  onPress={requestCode}
                />
              </>
            ) : (
              <>
                <ThemedText themeColor="textSecondary" style={styles.center}>
                  Wir haben dir eine E-Mail an{' '}
                  <ThemedText style={styles.bold}>{email.trim()}</ThemedText> geschickt. Gib den
                  Code (nur Ziffern) daraus ein.
                </ThemedText>
                <Field
                  value={code}
                  onChangeText={setCode}
                  placeholder="Code"
                  inputMode="numeric"
                  keyboardType="number-pad"
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  maxLength={10}
                  autoFocus
                  style={styles.codeInput}
                  onSubmitEditing={() => digits.length >= 6 && submitCode()}
                />
                <ErrorText message={error} />
                {info && <ThemedText themeColor="textSecondary">{info}</ThemedText>}
                <BigButton
                  title={busy ? 'Wird geprüft …' : 'Anmelden'}
                  disabled={busy || digits.length < 6}
                  onPress={submitCode}
                />
                <View style={styles.row}>
                  <BigButton
                    title="Andere E-Mail"
                    variant="secondary"
                    style={styles.flex}
                    disabled={busy}
                    onPress={() => {
                      setCodeSent(false);
                      setError(null);
                      setInfo(null);
                    }}
                  />
                  <BigButton
                    title="Neuer Code"
                    variant="secondary"
                    style={styles.flex}
                    disabled={busy}
                    onPress={resendCode}
                  />
                </View>
                <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                  Keine Mail? Schau auch im Spam-Ordner nach.
                </ThemedText>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    padding: Spacing.four,
    gap: Spacing.three,
  },
  logo: { fontSize: 64, lineHeight: 76, textAlign: 'center' },
  center: { textAlign: 'center' },
  bold: { fontWeight: 700 },
  codeInput: { fontSize: 28, letterSpacing: 8, textAlign: 'center' },
  row: { flexDirection: 'row', gap: Spacing.two },
  flex: { flex: 1 },
});
