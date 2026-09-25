import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ErrorText } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup } from '@/lib/group';
import { reviewYears } from '@/lib/review';
import { berlinToday } from '@/lib/schedule';
import { formatDate, listSessions, type SessionSummary } from '@/lib/sessions';
import { errorMessage } from '@/lib/supabase';

export default function HistoryScreen() {
  const theme = useTheme();
  const { current } = useGroup();
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!current) return;
      listSessions(current.id)
        .then((list) => {
          setSessions(list);
          setError(null);
        })
        .catch((e) => setError(errorMessage(e)));
    }, [current])
  );

  return (
    <ThemedView style={styles.screen}>
      <FlatList
        data={sessions ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <ErrorText message={error} />
            {/* Jahresrückblick (TODO C4): vergangene Jahre, das laufende ab Dezember */}
            {reviewYears(
              [...new Set((sessions ?? []).filter((s) => s.result_count > 0).map((s) => s.played_on.slice(0, 4)))]
                .sort()
                .reverse(),
              berlinToday()
            ).map((year) => (
              <Pressable
                key={year}
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/rueckblick/[year]', params: { year } })}
                style={({ pressed }) => [
                  styles.review,
                  { borderColor: theme.primary, opacity: pressed ? 0.7 : 1 },
                ]}>
                <ThemedText style={[styles.date, styles.flex]}>🎆 Jahresrückblick {year}</ThemedText>
                <ThemedText style={[styles.date, { color: theme.primary }]}>›</ThemedText>
              </Pressable>
            ))}
          </>
        }
        ListEmptyComponent={
          sessions ? (
            <ThemedText themeColor="textSecondary" style={styles.empty}>
              Noch keine Spieltage. Würfle unter „Spieltag“ Teams und tippe auf „Mit diesen Teams
              spielen“.
            </ThemedText>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/spieltag/[id]', params: { id: item.id } })}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.backgroundElement, opacity: pressed ? 0.7 : 1 },
            ]}>
            <View style={styles.flex}>
              <ThemedText style={styles.date}>{formatDate(item.played_on)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {item.team_count} Teams ·{' '}
                {item.result_count === 0
                  ? 'noch kein Ergebnis'
                  : item.result_count === 1
                    ? '1 Ergebnis'
                    : `${item.result_count} Ergebnisse`}
              </ThemedText>
            </View>
            <ThemedText themeColor="textSecondary">›</ThemedText>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  review: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    borderWidth: 2,
    marginBottom: Spacing.two,
  },
  screen: { flex: 1 },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    padding: Spacing.three,
    gap: Spacing.two,
  },
  empty: { textAlign: 'center', marginTop: Spacing.five },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
  },
  date: { fontSize: 18, fontWeight: 700 },
});
