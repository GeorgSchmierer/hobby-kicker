import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatRating, useStore, type Player, type TeamCount } from '@/lib/store';
import { findFairSplits, pickSplit, strength } from '@/lib/teams';

const TEAM_COUNTS: TeamCount[] = [2, 3, 4];
const MIN_PER_TEAM = 2;

export default function MatchdayScreen() {
  const theme = useTheme();
  const { players, presentIds, teamCount, setTeamCount, setAllPresent, setDraw, loaded } =
    useStore();

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
    setDraw({ candidates, teams: split.teams, key: split.key });
    router.push('/teams');
  };

  if (loaded && activePlayers.length === 0) {
    return (
      <ThemedView style={[styles.screen, styles.emptyScreen]}>
        <ThemedText type="subtitle" style={styles.center}>
          Willkommen beim Hobby-Kicker!
        </ThemedText>
        <ThemedText themeColor="textSecondary" style={styles.center}>
          Leg zuerst eure Spieler an. Danach kannst du hier auswählen, wer heute da ist, und faire
          Teams würfeln.
        </ThemedText>
        <BigButton title="Spieler anlegen" onPress={() => router.push('/spieler')} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={styles.content}>
        <ThemedText type="smallBold">Anzahl Teams</ThemedText>
        <View style={styles.segment}>
          {TEAM_COUNTS.map((count) => {
            const selected = count === teamCount;
            return (
              <Pressable
                key={count}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                onPress={() => setTeamCount(count)}
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
          <Pressable onPress={() => setAllPresent(true)} hitSlop={12}>
            <ThemedText type="linkPrimary">Alle</ThemedText>
          </Pressable>
          <Pressable onPress={() => setAllPresent(false)} hitSlop={12}>
            <ThemedText type="linkPrimary">Keiner</ThemedText>
          </Pressable>
        </View>

        <FlatList
          data={activePlayers}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <AttendanceRow player={item} present={presentIds.includes(item.id)} />
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

function AttendanceRow({ player, present }: { player: Player; present: boolean }) {
  const theme = useTheme();
  const { setPresent } = useStore();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: present }}
      onPress={() => setPresent(player.id, !present)}
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
});
