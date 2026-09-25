import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { SmallButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatEuro, loadGroupExpenses, openBalances, setSharePaid, type Expense } from '@/lib/cash';
import { useGroup } from '@/lib/group';
import { formatDate } from '@/lib/sessions';
import { errorMessage } from '@/lib/supabase';

/** Kasse (TODO D1): Wer schuldet noch wie viel? Abhaken nur Admins. */
export default function CashScreen() {
  const theme = useTheme();
  const { current, players, isAdmin } = useGroup();
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!current) return;
    setExpenses(await loadGroupExpenses(current.id));
  }, [current]);

  useFocusEffect(
    useCallback(() => {
      reload().catch((e) => setError(errorMessage(e)));
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

  const balances = openBalances(expenses ?? []);
  const total = balances.reduce((sum, b) => sum + b.open, 0);
  const byId = new Map(players.map((p) => [p.id, p]));

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <ErrorText message={error} />
        <ThemedView type="backgroundElement" style={styles.summary}>
          <ThemedText type="small" themeColor="textSecondary">
            Noch offen insgesamt
          </ThemedText>
          <ThemedText style={[styles.total, { color: total ? theme.danger : theme.primary }]}>
            {formatEuro(total)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Nur zum Mitschreiben – bezahlt wird wie gewohnt (bar, PayPal …).
            {isAdmin ? ' Kosten trägst du beim jeweiligen Spieltag ein.' : ''}
          </ThemedText>
        </ThemedView>

        {expenses && balances.length === 0 && (
          <ThemedText themeColor="textSecondary" style={styles.center}>
            {expenses.length === 0
              ? 'Noch keine Kosten eingetragen.'
              : 'Alles bezahlt – niemand schuldet etwas. 🎉'}
          </ThemedText>
        )}

        {balances.map((b) => {
          const p = byId.get(b.playerId);
          const name = p?.name ?? '?';
          const expanded = open === b.playerId;
          return (
            <View key={b.playerId} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setOpen(expanded ? null : b.playerId)}
                style={styles.row}>
                <Avatar name={name} path={p?.avatar_path} size={36} />
                <ThemedText style={[styles.name, styles.flex]}>{name}</ThemedText>
                <ThemedText style={[styles.amount, { color: theme.danger }]}>{formatEuro(b.open)}</ThemedText>
                <ThemedText themeColor="textSecondary">{expanded ? '▲' : '▼'}</ThemedText>
              </Pressable>
              {expanded && (
                <View style={styles.details}>
                  {b.shares.map((s) => (
                    <View key={s.expense_id} style={styles.row}>
                      <Pressable
                        style={styles.flex}
                        onPress={() =>
                          router.push({ pathname: '/spieltag/[id]', params: { id: s.expense.session_id } })
                        }>
                        <ThemedText>
                          {s.expense.description} · {formatEuro(s.amount_cents)}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {s.expense.played_on ? formatDate(s.expense.played_on) : ''}
                        </ThemedText>
                      </Pressable>
                      {isAdmin && (
                        <SmallButton
                          title="✓ bezahlt"
                          disabled={busy}
                          onPress={() => run(() => setSharePaid(s.expense_id, b.playerId, true))}
                        />
                      )}
                    </View>
                  ))}
                  {isAdmin && b.shares.length > 1 && (
                    <SmallButton
                      title={`Alles bezahlt (${formatEuro(b.open)})`}
                      disabled={busy}
                      onPress={() =>
                        run(async () => {
                          for (const s of b.shares) await setSharePaid(s.expense_id, b.playerId, true);
                        })
                      }
                    />
                  )}
                </View>
              )}
            </View>
          );
        })}
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
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  summary: { borderRadius: 14, padding: Spacing.three, gap: Spacing.one, alignItems: 'center' },
  total: { fontSize: 34, lineHeight: 42, fontWeight: 800 },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  name: { fontSize: 17, fontWeight: 700 },
  amount: { fontSize: 18, fontWeight: 800 },
  details: { gap: Spacing.two, paddingLeft: Spacing.two },
});
