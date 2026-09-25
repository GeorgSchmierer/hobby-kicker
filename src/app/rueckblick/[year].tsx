import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { BigButton } from '@/components/controls';
import { ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup } from '@/lib/group';
import { useGroupStats } from '@/lib/group-stats';
import { reviewText, yearReview } from '@/lib/review';
import { canShareImage, shareReviewImage } from '@/lib/review-image';
import { shareText } from '@/lib/share';
import { loadStandings, type StandingRow } from '@/lib/standings';
import { errorMessage } from '@/lib/supabase';

/** Jahresrückblick der Gruppe (TODO C4) */
export default function ReviewScreen() {
  const theme = useTheme();
  const { year } = useLocalSearchParams<{ year: string }>();
  const { current, players } = useGroup();
  const { stats, error } = useGroupStats(current?.id);
  const [table, setTable] = useState<StandingRow[] | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!current) return;
      loadStandings(current.id, { key: year, label: year, from: `${year}-01-01`, to: `${year}-12-31` })
        .then(setTable)
        .catch(() => setTable([]));
    }, [current, year])
  );

  if (!stats || !current) {
    return (
      <ThemedView style={[styles.screen, styles.center]}>
        <ActivityIndicator color={theme.primary} />
        <ErrorText message={error ? errorMessage(error) : null} />
      </ThemedView>
    );
  }

  const regular = players.filter((p) => !p.is_guest);
  const review = yearReview({
    year,
    games: stats.games,
    sessions: stats.sessions,
    changes: stats.changes,
    goals: stats.goals,
    playerIds: regular.map((p) => p.id),
  });
  const byId = new Map(players.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.name ?? '?';
  const winner = table?.[0] ?? null;
  const comma = (v: number) => v.toFixed(1).replace('.', ',');

  const highlights: { emoji: string; title: string; playerId: string; value: string }[] = [];
  if (winner) highlights.push({ emoji: '🏆', title: 'Tabellenerster', playerId: winner.playerId, value: `${winner.points} Punkte` });
  if (review.mostGames) {
    highlights.push({ emoji: '⚽', title: 'Meiste Spiele', playerId: review.mostGames.playerId, value: `${review.mostGames.value} Spiele` });
  }
  if (review.biggestRiser) {
    highlights.push({
      emoji: '📈',
      title: 'Größter Aufsteiger',
      playerId: review.biggestRiser.playerId,
      value: `+${comma(review.biggestRiser.value)} Stärke`,
    });
  }
  if (review.longestStreak) {
    highlights.push({
      emoji: '🔥',
      title: 'Längste Siegesserie',
      playerId: review.longestStreak.playerId,
      value: `${review.longestStreak.value} Siege in Folge`,
    });
  }
  if (review.mostPresent) {
    highlights.push({
      emoji: '🫶',
      title: 'Am häufigsten dabei',
      playerId: review.mostPresent.playerId,
      value: `${review.mostPresent.value} von ${review.mostPresent.total} Spieltagen`,
    });
  }

  const summaryLine = `${review.sessions} Spieltage · ${review.games} Spiele${review.goals ? ` · ${review.goals} Tore` : ''}`;

  const shareImage = async () => {
    const outcome = await shareReviewImage(
      `Jahresrückblick ${year}`,
      `${current.name} · ${summaryLine}`,
      highlights.map((h) => [h.emoji, `${h.title}: ${name(h.playerId)} (${h.value})`]),
      `jahresrueckblick-${year}.png`
    );
    setInfo(
      outcome === 'downloaded'
        ? 'Bild gespeichert – jetzt z. B. in WhatsApp verschicken.'
        : outcome === 'failed'
          ? 'Das Bild konnte nicht erstellt werden. Teile den Rückblick als Text.'
          : null
    );
  };

  const shareAsText = async () => {
    const outcome = await shareText(reviewText(review, current.name, name, winner));
    setInfo(outcome === 'copied' ? 'Rückblick kopiert – jetzt z. B. in WhatsApp einfügen.' : null);
  };

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: `Rückblick ${year}` }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.hero, { backgroundColor: theme.primary }]}>
          <ThemedText style={[styles.heroTitle, { color: theme.onPrimary }]}>🎆 {year}</ThemedText>
          <ThemedText style={[styles.heroText, { color: theme.onPrimary }]}>{current.name}</ThemedText>
          <ThemedText style={[styles.heroText, { color: theme.onPrimary }]}>{summaryLine}</ThemedText>
        </View>

        {review.sessions === 0 ? (
          <ThemedText themeColor="textSecondary" style={styles.centerText}>
            In diesem Jahr wurde noch nicht gespielt.
          </ThemedText>
        ) : (
          highlights.map((h) => (
            <ThemedView key={h.title} type="backgroundElement" style={styles.card}>
              <ThemedText style={styles.emoji}>{h.emoji}</ThemedText>
              <View style={styles.flex}>
                <ThemedText type="small" themeColor="textSecondary">
                  {h.title}
                </ThemedText>
                <View style={styles.row}>
                  <Avatar name={name(h.playerId)} path={byId.get(h.playerId)?.avatar_path} size={30} />
                  <ThemedText style={styles.cardName}>{name(h.playerId)}</ThemedText>
                </View>
                <ThemedText themeColor="textSecondary">{h.value}</ThemedText>
              </View>
            </ThemedView>
          ))
        )}

        {review.sessions > 0 && (
          <>
            {canShareImage() && <BigButton title="📤 Als Bild teilen" onPress={shareImage} />}
            <BigButton title="Als Text teilen" variant="secondary" onPress={shareAsText} />
            {info && <ThemedText type="small">{info}</ThemedText>}
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three },
  centerText: { textAlign: 'center' },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  flex: { flex: 1, gap: 2 },
  hero: { borderRadius: 18, padding: Spacing.four, alignItems: 'center', gap: Spacing.one },
  heroTitle: { fontSize: 40, lineHeight: 48, fontWeight: 800 },
  heroText: { fontSize: 17, fontWeight: 600, textAlign: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, borderRadius: 14, padding: Spacing.three },
  emoji: { fontSize: 36, lineHeight: 44 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardName: { fontSize: 20, fontWeight: 800 },
});
