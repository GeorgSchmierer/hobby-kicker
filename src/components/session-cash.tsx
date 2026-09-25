import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BigButton, SmallButton } from '@/components/controls';
import { ErrorText, Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  addExpense,
  DEFAULT_EXPENSE,
  deleteExpense,
  formatEuro,
  loadSessionExpenses,
  parseEuro,
  setSharePaid,
  splitCents,
  type Expense,
} from '@/lib/cash';
import { confirmAction } from '@/lib/confirm';
import type { Player } from '@/lib/group';
import { errorMessage } from '@/lib/supabase';

/**
 * Kosten eines Spieltags (TODO D1): z. B. Hallenmiete, aufgeteilt auf die Anwesenden.
 * Eintragen und Abhaken nur Admins; Mitglieder sehen, was sie schulden.
 */
export function SessionCash({
  sessionId,
  participants,
  isAdmin,
  lookup,
}: {
  sessionId: string;
  /** alle, die an dem Tag in einem Team waren */
  participants: Player[];
  isAdmin: boolean;
  lookup: Map<string, Player>;
}) {
  const theme = useTheme();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState(DEFAULT_EXPENSE);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setExpenses(await loadSessionExpenses(sessionId));
  }, [sessionId]);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => {});
    }, [reload])
  );

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

  if (!isAdmin && expenses.length === 0) return null;

  const cents = parseEuro(amount);
  const preview = cents ? splitCents(cents, participants.length) : [];
  const perHead =
    preview.length === 0
      ? ''
      : preview[0] === preview[preview.length - 1]
        ? `je ${formatEuro(preview[0])}`
        : `je ${formatEuro(preview[preview.length - 1])} bis ${formatEuro(preview[0])}`;

  const remove = async (e: Expense) => {
    const ok = await confirmAction(
      `„${e.description}“ löschen?`,
      'Die Kosten und alle Anteile (auch abgehakte) werden gelöscht.',
      'Löschen'
    );
    if (ok) run(() => deleteExpense(e.id));
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText style={styles.title}>💶 Kosten</ThemedText>

      {expenses.map((e) => {
        const open = e.shares.filter((s) => !s.paid_at).length;
        return (
          <View key={e.id} style={styles.expense}>
            <View style={styles.row}>
              <View style={styles.flex}>
                <ThemedText style={styles.expenseTitle}>
                  {e.description} · {formatEuro(e.amount_cents)}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {open === 0 ? 'Alle haben bezahlt ✓' : `${open} von ${e.shares.length} noch offen`}
                </ThemedText>
              </View>
              {isAdmin && open > 0 && (
                <SmallButton title="Alle bezahlt" disabled={busy} onPress={() => run(() => setSharePaid(e.id, null, true))} />
              )}
            </View>
            <View style={styles.shares}>
              {e.shares
                .map((s) => ({ ...s, name: lookup.get(s.player_id)?.name ?? '?' }))
                .sort((a, b) => a.name.localeCompare(b.name, 'de'))
                .map((s) => {
                  const paid = !!s.paid_at;
                  return (
                    <Pressable
                      key={s.player_id}
                      accessibilityRole={isAdmin ? 'checkbox' : 'text'}
                      accessibilityState={{ checked: paid }}
                      disabled={!isAdmin || busy}
                      onPress={() => run(() => setSharePaid(e.id, s.player_id, !paid))}
                      style={[
                        styles.share,
                        {
                          borderColor: paid ? theme.primary : theme.border,
                          backgroundColor: paid ? theme.backgroundSelected : 'transparent',
                        },
                      ]}>
                      <ThemedText type="small" style={{ fontWeight: 700 }}>
                        {paid ? '✓ ' : ''}
                        {s.name} {formatEuro(s.amount_cents)}
                      </ThemedText>
                    </Pressable>
                  );
                })}
            </View>
            {isAdmin && (
              <Pressable onPress={() => remove(e)} hitSlop={8}>
                <ThemedText type="small" style={{ color: theme.danger }}>
                  Kosten löschen
                </ThemedText>
              </Pressable>
            )}
          </View>
        );
      })}

      {isAdmin && expenses.length > 0 && (
        <ThemedText type="small" themeColor="textSecondary">
          Tippe auf einen Namen, um „bezahlt“ an- oder abzuhaken.
        </ThemedText>
      )}

      {isAdmin &&
        (adding ? (
          <View style={styles.form}>
            <ThemedText type="smallBold">Wofür?</ThemedText>
            <Field value={description} onChangeText={setDescription} maxLength={60} />
            <ThemedText type="smallBold">Betrag in €</ThemedText>
            <Field value={amount} onChangeText={setAmount} placeholder="z. B. 60" inputMode="decimal" maxLength={9} />
            {cents && (
              <ThemedText type="small" themeColor="textSecondary">
                Aufgeteilt auf {participants.length} Spieler: {perHead}
              </ThemedText>
            )}
            <ErrorText message={error} />
            <View style={styles.row}>
              <SmallButton title="Abbrechen" disabled={busy} onPress={() => setAdding(false)} />
              <View style={styles.flex}>
                <BigButton
                  title="Kosten aufteilen"
                  disabled={busy || !cents || !description.trim() || participants.length === 0}
                  onPress={() =>
                    run(async () => {
                      await addExpense(sessionId, description, cents!);
                      setAdding(false);
                      setAmount('');
                    })
                  }
                />
              </View>
            </View>
          </View>
        ) : (
          <SmallButton title="+ Kosten eintragen" onPress={() => setAdding(true)} />
        ))}
      {!adding && <ErrorText message={error} />}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 18, fontWeight: 700 },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  expense: { gap: Spacing.two, paddingBottom: Spacing.two },
  expenseTitle: { fontSize: 17, fontWeight: 700 },
  shares: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  share: { minHeight: 36, borderRadius: 18, borderWidth: 2, paddingHorizontal: Spacing.two, justifyContent: 'center' },
  form: { gap: Spacing.two },
});
