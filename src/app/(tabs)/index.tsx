import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { BigButton } from '@/components/controls';
import { EventCard } from '@/components/event-card';
import { ErrorText } from '@/components/form';
import { InstallHint } from '@/components/install-hint';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { setRsvp, useNextEvent } from '@/lib/events';
import { useGroup, type Player } from '@/lib/group';
import { formatRating } from '@/lib/ratings';
import { rsvpOverview } from '@/lib/schedule';
import { todaysSession, type SessionSummary } from '@/lib/sessions';
import { errorMessage } from '@/lib/supabase';
import { useStore, type TeamCount } from '@/lib/store';
import { findFairSplits, pickSplit, strength } from '@/lib/teams';

const TEAM_COUNTS: TeamCount[] = [2, 3, 4];
const MIN_PER_TEAM = 2;

export default function MatchdayScreen() {
  const theme = useTheme();
  const { current, isAdmin, players, playersLoaded, refreshPlayers, finishGuest } = useGroup();
  const store = useStore();
  const groupId = current!.id;
  const presentIds = store.presentIdsFor(groupId);
  const teamCount = store.teamCountFor(groupId);

  const [today, setToday] = useState<SessionSummary | null>(null);
  const myId = useAuth().session?.user.id;
  const myPlayer = players.find((p) => p.active && !!myId && p.user_id === myId);
  const { data: eventData, reload: reloadEvent } = useNextEvent(groupId);
  const [eventError, setEventError] = useState<string | null>(null);

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

  // Heute ist Termin: Anwesenheit einmalig mit den Zusagen vorausfüllen (bleibt änderbar)
  const eventToday = eventData?.info && eventData.event?.daysAway === 0 ? eventData : null;
  const confirmedToday = eventToday
    ? rsvpOverview(
        activePlayers.filter((p) => !p.is_guest).map((p) => p.id),
        eventToday.rsvps,
        eventToday.info!.schedule.max_players
      ).attending
    : [];
  const confirmedKey = confirmedToday.join(',');
  const todayDate = eventToday?.event?.date ?? null;
  const alreadyPrefilled = todayDate !== null && store.prefilledFor(groupId) === todayDate;
  const { loaded: storeLoaded, prefillFromRsvps } = store;
  useEffect(() => {
    if (!storeLoaded || !playersLoaded || !todayDate || alreadyPrefilled || !confirmedKey) return;
    prefillFromRsvps(groupId, todayDate, confirmedKey.split(','));
  }, [storeLoaded, playersLoaded, todayDate, alreadyPrefilled, confirmedKey, groupId, prefillFromRsvps]);
  // Gäste haben keine Zusagen – sie bleiben beim Übernehmen angehakt
  const presentGuests = present.filter((p) => p.is_guest).map((p) => p.id);
  const presentRegulars = present.filter((p) => !p.is_guest).map((p) => p.id);
  const presentMatchesRsvps =
    confirmedToday.length === presentRegulars.length &&
    confirmedToday.every((id) => presentRegulars.includes(id));

  // Gast wieder aus der Liste nehmen (wird ausgeblendet, nicht gelöscht)
  const hideGuest = async (player: Player) => {
    setEventError(null);
    try {
      await finishGuest(player.id, false);
      store.setPresent(groupId, player.id, false);
    } catch (e) {
      setEventError(errorMessage(e));
    }
  };

  const answer = async (attending: boolean | null) => {
    if (!eventData?.event || !myPlayer) return;
    setEventError(null);
    try {
      await setRsvp(groupId, eventData.event.date, myPlayer.id, attending);
      await reloadEvent();
    } catch (e) {
      setEventError(errorMessage(e));
    }
  };

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
        {eventData && (
          <EventCard data={eventData} players={players} myPlayer={myPlayer} onAnswer={answer} />
        )}
        <ErrorText message={eventError} />
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
          <Pressable onPress={() => router.push('/gast')} hitSlop={12}>
            <ThemedText type="linkPrimary">+ Gast</ThemedText>
          </Pressable>
          <Pressable onPress={() => store.setPresentIds(groupId, activePlayers.map((p) => p.id))} hitSlop={12}>
            <ThemedText type="linkPrimary">Alle</ThemedText>
          </Pressable>
          <Pressable onPress={() => store.setPresentIds(groupId, [])} hitSlop={12}>
            <ThemedText type="linkPrimary">Keiner</ThemedText>
          </Pressable>
        </View>

        {todayDate && confirmedToday.length > 0 && !presentMatchesRsvps && (
          <Pressable
            accessibilityRole="button"
            onPress={() => prefillFromRsvps(groupId, todayDate, [...confirmedToday, ...presentGuests])}
            hitSlop={8}>
            <ThemedText type="linkPrimary">
              📋 {confirmedToday.length} Zusagen für heute als Anwesenheit übernehmen
            </ThemedText>
          </Pressable>
        )}

        <FlatList
          data={activePlayers}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <AttendanceRow
              player={item}
              present={presentIds.includes(item.id)}
              onToggle={() => store.setPresent(groupId, item.id, !presentIds.includes(item.id))}
              onHideGuest={() => hideGuest(item)}
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
  onHideGuest,
}: {
  player: Player;
  present: boolean;
  onToggle: () => void;
  onHideGuest: () => void;
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
      <ThemedText style={[styles.name, styles.flex]}>
        {player.name}
        {player.is_guest && (
          <ThemedText type="small" themeColor="textSecondary">
            {'  '}Gast
          </ThemedText>
        )}
      </ThemedText>
      <ThemedText themeColor="textSecondary">{formatRating(strength(player))}</ThemedText>
      {player.is_guest && !present && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Gast ${player.name} aus der Liste nehmen`}
          onPress={onHideGuest}
          hitSlop={10}>
          <ThemedText themeColor="textSecondary" style={{ fontWeight: 700 }}>
            ✕
          </ThemedText>
        </Pressable>
      )}
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
