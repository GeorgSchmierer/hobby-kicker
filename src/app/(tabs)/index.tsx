import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { InstallHint } from '@/components/install-hint';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useGroup, type Player } from '@/lib/group';
import { formatRating } from '@/lib/ratings';
import { todaysSession, type SessionSummary } from '@/lib/sessions';
import { useStore, type TeamCount } from '@/lib/store';
import { findFairSplits, pickSplit, strength } from '@/lib/teams';

const TEAM_COUNTS: TeamCount[] = [2, 3, 4];
const MIN_PER_TEAM = 2;

export default function MatchdayScreen() {
  const theme = useTheme();
  const { current, isAdmin, players, playersLoaded, refreshPlayers } = useGroup();
  const store = useStore();
  const groupId = current!.id;
  const presentIds = store.presentIdsFor(groupId);
  const teamCount = store.teamCountFor(groupId);

  const [today, setToday] = useState<SessionSummary | null>(null);

  // Beim Öffnen des Reiters auffrischen (andere könnten etwas geändert haben)
  useFocusEffect(
    useCallback(() => {
      refreshPlayers().catch(() => {});
      todaysSession(groupId)
        .then(setToday)
        .catch(() => setToday(null));
    }, [refreshPlayers, groupId])
  );

  const activePlayers = players
    .filter((p) => p.active)
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const present = activePlayers.filter((p) => presentIds.includes(p.id));
  const needed = teamCount * MIN_PER_TEAM;
  const canDraw = present.length >= needed;

  const drawTeams = () => {
    const candidates = findFairSplits(present, teamCount);
    const split = pickSplit(candidates);
    if (!split) return;
    store.setDraw({ groupId, candidates, teams: split.teams, key: split.key });
    router.push('/teams');
  };

  if (playersLoaded && activePlayers.length === 0) {
    return (
      <ThemedView style={[styles.screen, styles.emptyScreen]}>
        <ThemedText type="subtitle" style={styles.center}>
          Willkommen beim Hobby-Kicker!
        </ThemedText>
        {isAdmin ? (
          <>
            <ThemedText themeColor="textSecondary" style={styles.center}>
              Leg zuerst eure Spieler an. Danach kannst du hier auswählen, wer heute da ist, und
              faire Teams würfeln.
            </ThemedText>
            <BigButton title="Spieler anlegen" onPress={() => router.push('/spieler')} />
          </>
        ) : (
          <ThemedText themeColor="textSecondary" style={styles.center}>
            In dieser Gruppe gibt es noch keine Spieler. Sobald ein Admin sie angelegt hat, kannst
            du hier Teams würfeln.
          </ThemedText>
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.content}>
        <InstallHint />
        {today && (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/spieltag/[id]', params: { id: today.id } })}
            style={({ pressed }) => [
              styles.todayCard,
              { borderColor: theme.primary, opacity: pressed ? 0.7 : 1 },
            ]}>
            <View style={styles.flex}>
              <ThemedText style={styles.todayTitle}>Heutiger Spieltag</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {today.result_count === 0
                  ? 'Noch kein Ergebnis – hier eintragen'
                  : `${today.result_count} Ergebnis${today.result_count === 1 ? '' : 'se'} – öffnen`}
              </ThemedText>
            </View>
            <ThemedText style={[styles.todayTitle, { color: theme.primary }]}>›</ThemedText>
          </Pressable>
        )}
        <ThemedText type="smallBold">Anzahl Teams</ThemedText>
        <View style={styles.segment}>
          {TEAM_COUNTS.map((count) => {
            const selected = count === teamCount;
            return (
              <Pressable
                key={count}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => store.setTeamCount(groupId, count)}
                style={[
                  styles.segmentButton,
                  { backgroundColor: selected ? theme.primary : theme.backgroundElement },
                ]}>
                <ThemedText
                  style={[styles.segmentText, { color: selected ? theme.onPrimary : theme.text }]}>
                  {count}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.presentHeader}>
          <ThemedText type="smallBold" style={styles.flex}>
            Wer ist da? {present.length} von {activePlayers.length}
          </ThemedText>
          <Pressable onPress={() => store.setPresentIds(groupId, activePlayers.map((p) => p.id))} hitSlop={12}>
            <ThemedText type="linkPrimary">Alle</ThemedText>
          </Pressable>
          <Pressable onPress={() => store.setPresentIds(groupId, [])} hitSlop={12}>
            <ThemedText type="linkPrimary">Keiner</ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={activePlayers}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <AttendanceRow
              player={item}
              present={presentIds.includes(item.id)}
              onToggle={() => store.setPresent(groupId, item.id, !presentIds.includes(item.id))}
            />
          )}
          contentContainerStyle={styles.list}
          style={styles.flex}
        />

        {!canDraw && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
            Für {teamCount} Teams braucht es mindestens {needed} Spieler.
          </ThemedText>
        )}
        <BigButton title="🎲 Teams würfeln" disabled={!canDraw} onPress={drawTeams} />
      </View>
    </ThemedView>
  );
}

function AttendanceRow({
  player,
  present,
  onToggle,
}: {
  player: Player;
  present: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: present }}
      onPress={onToggle}
      style={[
        styles.row,
        {
          backgroundColor: present ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: present ? theme.primary : 'transparent',
        },
      ]}>
      <View
        style={[
          styles.check,
          {
            borderColor: present ? theme.primary : theme.textSecondary,
            backgroundColor: present ? theme.primary : 'transparent',
          },
        ]}>
        {present && <ThemedText style={{ color: theme.onPrimary, fontWeight: 700 }}>✓</ThemedText>}
      </View>
      <ThemedText style={[styles.name, styles.flex]}>{player.name}</ThemedText>
      <ThemedText themeColor="textSecondary">{formatRating(strength(player))}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center' },
  emptyScreen: { justifyContent: 'center', padding: Spacing.four, gap: Spacing.four },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  segment: { flexDirection: 'row', gap: Spacing.two },
  segmentButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: { fontSize: 22, fontWeight: 700 },
  presentHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  list: { gap: Spacing.two, paddingBottom: Spacing.three },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    borderWidth: 2,
  },
  check: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 18, fontWeight: 600 },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    borderRadius: 14,
    borderWidth: 2,
  },
  todayTitle: { fontSize: 18, fontWeight: 700 },
});
