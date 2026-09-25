import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { NextEventState } from '@/lib/events';
import type { Player } from '@/lib/group';
import { formatEventDate, formatTime, relativeDay, rsvpOverview } from '@/lib/schedule';

/** Zwei große Knöpfe „Bin dabei“ / „Kann nicht“; nochmal tippen nimmt die Antwort zurück */
export function AnswerButtons({
  answer,
  disabled,
  onAnswer,
  compact,
}: {
  answer: boolean | null;
  disabled?: boolean;
  onAnswer: (attending: boolean | null) => void;
  compact?: boolean;
}) {
  const theme = useTheme();
  const button = (value: boolean, label: string) => {
    const selected = answer === value;
    const color = value ? theme.primary : theme.danger;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={() => onAnswer(selected ? null : value)}
        style={({ pressed }) => [
          compact ? styles.compactAnswer : styles.answer,
          {
            borderColor: selected ? color : theme.border,
            backgroundColor: selected ? color : 'transparent',
            opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
          },
        ]}>
        <ThemedText
          type={compact ? 'small' : 'default'}
          style={{ fontWeight: 700, color: selected ? theme.onPrimary : theme.text }}>
          {compact ? (value ? '✓' : '✗') : label}
        </ThemedText>
      </Pressable>
    );
  };
  return (
    <View style={styles.answers}>
      {button(true, '✓ Bin dabei')}
      {button(false, '✗ Kann nicht')}
    </View>
  );
}

/** Kasten „Nächster Termin“ auf der Startseite – antippen öffnet die Übersicht */
export function EventCard({
  data,
  players,
  myPlayer,
  onAnswer,
}: {
  data: NextEventState;
  players: Player[];
  myPlayer: Player | undefined;
  onAnswer: (attending: boolean | null) => Promise<void>;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const { info, event, rsvps } = data;
  if (!info || !event) return null;

  const active = players.filter((p) => p.active && !p.is_guest).map((p) => p.id);
  const overview = rsvpOverview(active, rsvps, info.schedule.max_players);
  const myAnswer = myPlayer ? (rsvps.find((r) => r.player_id === myPlayer.id)?.attending ?? null) : null;
  const waitPlace = myPlayer ? overview.waitlist.indexOf(myPlayer.id) + 1 : 0;
  const soon = event.daysAway <= 1;
  const needsAnswer = soon && myPlayer && myAnswer === null;

  const answer = async (attending: boolean | null) => {
    setBusy(true);
    try {
      await onAnswer(attending);
    } finally {
      setBusy(false);
    }
  };

  const counts = [
    `${overview.attending.length}${info.schedule.max_players ? `/${info.schedule.max_players}` : ''} dabei`,
    overview.waitlist.length > 0 && `${overview.waitlist.length} Warteliste`,
    `${overview.open.length} offen`,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: needsAnswer ? theme.primary : 'transparent',
        },
      ]}>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push({ pathname: '/termin/[date]', params: { date: event.date } })}
        style={({ pressed }) => [styles.header, { opacity: pressed ? 0.6 : 1 }]}>
        <View style={styles.flex}>
          <ThemedText style={styles.title}>
            📅 {relativeDay(event)} · {formatTime(info.schedule.start_time)}
            {info.schedule.location ? ` · ${info.schedule.location}` : ''}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {counts}
          </ThemedText>
          {event.skipped.map((date) => (
            <ThemedText key={date} type="small" style={{ color: theme.danger }}>
              {formatEventDate(date)} fällt aus
            </ThemedText>
          ))}
        </View>
        <ThemedText style={[styles.title, { color: theme.primary }]}>›</ThemedText>
      </Pressable>

      {myPlayer ? (
        <>
          {needsAnswer && (
            <ThemedText type="smallBold">
              {event.daysAway === 0 ? 'Heute' : 'Morgen'} wird gekickt – bist du dabei?
            </ThemedText>
          )}
          {waitPlace > 0 && (
            <ThemedText type="small">Du stehst auf der Warteliste (Platz {waitPlace}).</ThemedText>
          )}
          <AnswerButtons answer={myAnswer} disabled={busy} onAnswer={answer} />
        </>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          Zum Zusagen antippen. Tipp: Ist dein Konto deinem Spieler zugeordnet (Reiter „Gruppe“), kannst
          du direkt hier antworten.
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 2, padding: Spacing.three, gap: Spacing.two },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  title: { fontSize: 18, fontWeight: 700 },
  answers: { flexDirection: 'row', gap: Spacing.two },
  answer: {
    flex: 1,
    minHeight: 48,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactAnswer: {
    width: 44,
    height: 40,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
