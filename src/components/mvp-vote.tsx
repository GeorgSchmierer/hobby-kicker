import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Player } from '@/lib/group';
import { voteMvp } from '@/lib/sessions';
import { sessionMvps } from '@/lib/stats';
import { errorMessage } from '@/lib/supabase';

/** „MVP des Tages“: jeder hat eine Stimme (änderbar), Zwischenstand für alle sichtbar */
export function MvpVote({
  sessionId,
  players,
  votes,
  myUserId,
  onVoted,
}: {
  sessionId: string;
  /** alle, die an diesem Spieltag mitgespielt haben */
  players: Player[];
  votes: { voter_id: string; player_id: string }[];
  myUserId: string | undefined;
  onVoted: () => void;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myVote = votes.find((v) => v.voter_id === myUserId)?.player_id ?? null;
  const count = (id: string) => votes.filter((v) => v.player_id === id).length;
  const leaders = sessionMvps(votes.map((v) => ({ playerId: v.player_id })));
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?';
  const sorted = [...players].sort((a, b) => count(b.id) - count(a.id) || a.name.localeCompare(b.name, 'de'));

  const vote = async (playerId: string) => {
    if (playerId === myVote) return;
    setBusy(true);
    setError(null);
    try {
      await voteMvp(sessionId, playerId);
      onVoted();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText style={styles.title}>⭐ MVP des Tages</ThemedText>
      {leaders.length > 0 ? (
        <ThemedText style={styles.leader}>
          {leaders.length === 1 ? 'Führt: ' : 'Gleichstand: '}
          {leaders.map(nameOf).join(' & ')} ({count(leaders[0])}{' '}
          {count(leaders[0]) === 1 ? 'Stimme' : 'Stimmen'})
        </ThemedText>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Wer war heute der Beste? Tipp auf einen Namen – du kannst deine Stimme später ändern.
        </ThemedText>
      )}
      <ErrorText message={error} />
      <View style={styles.chips}>
        {sorted.map((p) => {
          const mine = p.id === myVote;
          const n = count(p.id);
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: mine }}
              disabled={busy}
              onPress={() => vote(p.id)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: mine ? '#F9A825' : theme.border,
                  backgroundColor: mine ? theme.backgroundSelected : theme.background,
                  opacity: busy ? 0.5 : pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText style={styles.chipText}>
                {leaders.includes(p.id) ? '⭐ ' : ''}
                {p.name}
              </ThemedText>
              {n > 0 && (
                <ThemedText type="small" themeColor="textSecondary">
                  {n}
                </ThemedText>
              )}
            </Pressable>
          );
        })}
      </View>
      {myVote && (
        <ThemedText type="small" themeColor="textSecondary">
          Deine Stimme: {nameOf(myVote)}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  title: { fontSize: 18, fontWeight: 800 },
  leader: { fontSize: 16, fontWeight: 700 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    borderRadius: 22,
    borderWidth: 2,
  },
  chipText: { fontSize: 16, fontWeight: 600 },
});
